import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPanelPool} from './db.mjs';
export async function applyPostgresMigrations({pool,environment,failAfter=null}={}){
 const own=!pool;if(own)pool=createPanelPool(environment);
 const c=await pool.connect();
 try{
 const roles=(await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 if(roles.rolsuper||roles.rolbypassrls)throw Object.assign(Error('Migrador requiere rol dedicado sin superusuario.'),{code:'MIGRATOR_ROLE_REJECTED'});
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(8844008)');await c.query('CREATE SCHEMA IF NOT EXISTS panel');await c.query('SET LOCAL search_path=panel,pg_catalog');
 await c.query('CREATE TABLE IF NOT EXISTS pg_schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz DEFAULT now())');
 for(const name of readdirSync(new URL('../database/postgres-migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
 const version=name.slice(0,-4),sql=readFileSync(new URL('../database/postgres-migrations/'+name,import.meta.url),'utf8'),sha=createHash('sha256').update(sql).digest('hex'),old=(await c.query('SELECT sha256 FROM pg_schema_migrations WHERE version=$1',[version])).rows[0];
 if(old){if(old.sha256!==sha)throw Object.assign(Error('Migración cambió respecto del ledger.'),{code:'MIGRATION_HASH_MISMATCH'});continue;}
 await c.query(sql);await c.query('INSERT INTO pg_schema_migrations(version,sha256) VALUES($1,$2)',[version,sha]);
 if(failAfter===version)throw Object.assign(Error('Fallo inducido aislado.'),{code:'TEST_MIGRATION_FAILURE'});
 }
 await c.query('COMMIT');return {estado:'OK',migraciones:9};
 }catch(e){await c.query('ROLLBACK');throw Object.assign(Error('Migración detenida y revertida.'),{code:e.code||'MIGRATION_ERROR'});}
 finally{c.release();if(own)await pool.end();}
}
export async function grantPanelPrivileges(pool,{appRole,backupRole}){
 for(const role of [appRole,backupRole])if(!/^[a-z][a-z0-9_]{2,62}$/.test(role))throw Error('Rol inválido.');
 await pool.query('GRANT USAGE ON SCHEMA panel TO '+appRole+','+backupRole);
 await pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA panel TO '+backupRole);
 await pool.query('REVOKE USAGE,UPDATE ON ALL SEQUENCES IN SCHEMA panel FROM '+backupRole);
 await pool.query('GRANT SELECT ON ALL SEQUENCES IN SCHEMA panel TO '+backupRole);
 await pool.query('REVOKE DELETE ON ALL TABLES IN SCHEMA panel FROM '+appRole);
 await pool.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA panel TO '+appRole);
 await pool.query('GRANT DELETE ON panel.sessions,panel.login_attempts,panel.panel_admin_sessions,panel.panel_auth_attempts TO '+appRole);
 await pool.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA panel TO '+appRole);
 await pool.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA panel TO '+appRole+','+backupRole);
 for(const table of ['history','license_events','web_state_history','web_commercial_history','integration_logs','panel_backup_events','web_subscription_history','web_manual_payments','web_payment_context','integration_attempts','panel_admin_events'])await pool.query('REVOKE UPDATE,DELETE ON panel.'+table+' FROM '+appRole);
 await pool.query('REVOKE INSERT,UPDATE,DELETE ON panel.pg_schema_migrations,panel.schema_migrations,panel.web_schema_migrations FROM '+appRole);
}
