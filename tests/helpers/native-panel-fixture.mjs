import {createNativePlanFixture} from '../../../../../EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL/tests/helpers/native-plan-fixture.js';
import {createPanelPool} from '../../server/db.mjs';
import {applyPostgresMigrations,grantPanelPrivileges} from '../../server/postgres-migrations.mjs';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pg from 'pg';
export async function createNativePanelFixture(){
 const f=await createNativePlanFixture(),tag=randomUUID().replaceAll('-','').slice(0,12),database='panel_f8_'+tag,restoreDatabase='panel_f8_restore_'+tag,roles={app:'eduxfac_panel_app',web:'eduxfac_web_app',migrator:'eduxfac_migrator',backup:'eduxfac_backup'};
 let migrationPool,webRuntimePool;const closeables=[];
 try{
 for(const name of Object.values(roles))await f.query('CREATE ROLE '+name+' LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT');
 await f.query('CREATE DATABASE '+database+' OWNER '+roles.migrator);await f.query('CREATE DATABASE '+restoreDatabase+' OWNER '+roles.migrator);
 for(const name of [database,restoreDatabase]){await f.query('REVOKE ALL ON DATABASE '+name+' FROM PUBLIC');await f.query('GRANT CONNECT ON DATABASE '+name+' TO '+[roles.migrator,roles.app,roles.backup].join(','));}
 await f.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');await f.query('GRANT CONNECT ON DATABASE postgres TO '+roles.web);
 await f.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await f.query('GRANT USAGE ON SCHEMA public TO '+roles.web);await f.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO '+roles.web);await f.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO '+roles.web);
 const environment=(user=roles.app,db=database)=>({NODE_ENV:'test',PANEL_DB_ENGINE:'postgres',PANEL_DATABASE_URL:'postgresql://'+user+'@127.0.0.1:'+f.port+'/'+db,PANEL_DB_STATEMENT_TIMEOUT_MS:'15000'});
 migrationPool=createPanelPool(environment(roles.migrator));await applyPostgresMigrations({pool:migrationPool});await grantPanelPrivileges(migrationPool,{appRole:roles.app,backupRole:roles.backup});
 // WEB runtime uses its separate, non-superuser role; bootstrap remains only a fixture utility.
 webRuntimePool=new pg.Pool({host:'127.0.0.1',port:f.port,user:roles.web,database:'postgres',max:4});
 const {installTestDatabase}=await import('../../../../../EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL/server/src/db.js');
 const normal=r=>Array.isArray(r)?r.at(-1):r;
 installTestDatabase({isolatedTestDatabase:true,query:async(s,p)=>normal(await webRuntimePool.query(s,p)),connect:async()=>{const c=await webRuntimePool.connect();return {query:async(s,p)=>normal(await c.query(s,p)),release:()=>c.release()};}});
 const root=fileURLToPath(new URL('../../',import.meta.url)),directory=path.join(root,'tests/.fase8',tag);mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'SOLO_PRUEBAS.json'),JSON.stringify({purpose:'FASE8_ISOLATED_PANEL',database,restoreDatabase,port:f.port}));
 return {f,roles,database,restoreDatabase,environment,migrationPool,directory,register:fn=>closeables.push(fn),close:async()=>{for(const fn of closeables.reverse())await fn();await webRuntimePool.end();await migrationPool.end();await f.close();}};
 }catch(e){await webRuntimePool?.end();await migrationPool?.end();await f.close();throw e;}
}
