import {isolatedPanelDirectory} from './isolated-lab.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const ident=v=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))throw Error('MIGRATION_IDENTIFIER');return '"'+v+'"';};
const logical=(rows,columns)=>createHash('sha256').update(rows.map(r=>JSON.stringify(Object.fromEntries([...columns].sort().map(k=>[k,r[k]??null])))).sort().join('\n')).digest('hex');
export function verifyIsolatedSQLite(file){
 const resolved=realpathSync(file);if(!resolved.endsWith('.sqlite'))throw Error('MIGRATION_SOURCE_NOT_ISOLATED');isolatedPanelDirectory(path.dirname(resolved));return resolved;
}
export async function migrateSQLiteSnapshot({source,pool,failAfter=null}){
 const file=verifyIsolatedSQLite(source),db=new DatabaseSync(file,{readOnly:true}),c=await pool.connect();
 try{
 const target=(await c.query('SELECT current_database() db')).rows[0].db;
 if(!/^panel_f8_[a-z0-9_]+$/.test(target))throw Error('MIGRATION_TARGET_NOT_ISOLATED');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLITE_FOREIGN_KEY_ERROR');
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name);
 const actual=(await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='panel' AND table_type='BASE TABLE'")).rows.map(x=>x.table_name);
 if(names.some(n=>!actual.includes(n)))throw Error('MIGRATION_UNSUPPORTED_TABLE');
 const tables=names.map(name=>({name,columns:db.prepare('PRAGMA table_info('+ident(name)+')').all().map(x=>x.name),rows:db.prepare('SELECT * FROM '+ident(name)).all()}));
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(8844008)');await c.query('SET CONSTRAINTS ALL DEFERRED');
 for(const name of names)await c.query('ALTER TABLE panel.'+ident(name)+' DISABLE TRIGGER USER');
 if(names.length)await c.query('TRUNCATE '+names.map(n=>'panel.'+ident(n)).join(',')+' CASCADE');
 for(const table of tables){
 for(let offset=0;offset<table.rows.length;offset+=250){const rows=table.rows.slice(offset,offset+250),values=[],tuples=rows.map(row=>'('+table.columns.map(k=>{values.push(row[k]);return '$'+values.length;}).join(',')+')');await c.query('INSERT INTO panel.'+ident(table.name)+'('+table.columns.map(ident).join(',')+') VALUES '+tuples.join(','),values);}
 if(failAfter===table.name)throw Error('TEST_MIGRATION_FAILURE');
 }
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');
 for(const name of names)await c.query('ALTER TABLE panel.'+ident(name)+' ENABLE TRIGGER USER');
 const report=[];
 for(const table of tables){const rows=(await c.query('SELECT '+table.columns.map(ident).join(',')+' FROM panel.'+ident(table.name))).rows,after=logical(rows,table.columns),before=logical(table.rows,table.columns);report.push({tabla:table.name,antes:table.rows.length,despues:rows.length,equivalente:before===after,sha256_antes:before,sha256_despues:after});if(before!==after)throw Error('MIGRATION_EQUIVALENCE_FAILED');}
 // Seed the preserved legacy owner only into the new, isolated authorization tables.
 if(!(await c.query('SELECT id FROM panel_admin_users LIMIT 1')).rowCount){const a=(await c.query('SELECT * FROM admin WHERE id=1')).rows[0];if(a)await c.query("INSERT INTO panel_admin_users(id,public_id,username,password_hash,role) VALUES(1,$1,$2,$3,'SUPERADMIN')",[randomUUID(),a.username,a.password_hash]);}
 const identities=(await c.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='panel' AND is_identity='YES'")).rows;
 for(const x of identities){const n=(await c.query('SELECT max('+ident(x.column_name)+') n FROM panel.'+ident(x.table_name))).rows[0].n;await c.query("SELECT setval(pg_get_serial_sequence($1,$2),$3,$4)",['panel.'+x.table_name,x.column_name,n||1,n!=null]);}
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('COMMIT');
 return {estado:'OK',dry_run:false,original_abierto:false,source_isolated:true,tablas:report,equivalencia_total:report.every(t=>t.equivalente),relaciones:'VERIFICADAS',sessions_legacy_activas:false};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw Object.assign(Error('Migración controlada revertida; no se modificó la fuente.'),{code:/^[A-Z0-9_]{1,60}$/.test(e.code||e.message)?e.code||e.message:'MIGRATION_ERROR'});}
 finally{db.close();c.release();}
}
