import {isolatedPanelDirectory} from './isolated-lab.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,statSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pgConfiguration} from './db.mjs';
const run=promisify(execFile),binary=process.platform==='win32'?'C:/Program Files (x86)/EDUXFAC/PostgreSQL/bin':'/usr/lib/postgresql/16/bin';
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function guard(environment,directory){
 if(environment.NODE_ENV!=='test'||environment.PANEL_F8_ISOLATED!=='yes')throw Error('BACKUP_ISOLATED_ONLY');
 const c=pgConfiguration(environment);
 if(!['127.0.0.1','localhost'].includes(c.host)||!/^panel_f8_[a-z0-9_]+$/.test(c.database))throw Error('BACKUP_DATABASE_REJECTED');
 isolatedPanelDirectory(directory);
 return {configuration:c,env:{...process.env,PGHOST:c.host,PGPORT:String(c.port),PGUSER:c.user,PGDATABASE:c.database,PGPASSWORD:c.password||'FAKE_F8_NOT_REAL',PGSERVICE:'',PGPASSFILE:path.join(directory,'NO_PGPASS_REAL'),PGSSLMODE:c.ssl?'verify-full':'disable',...(c.ssl&&environment.PANEL_PG_CA_FILE?{PGSSLROOTCERT:environment.PANEL_PG_CA_FILE}:{})}};
}
export function retentionPlan(directory,keep=14){
 if(!Number.isSafeInteger(keep)||keep<1||keep>1000)throw Error('RETENTION_INVALID');
 const files=readdirSync(directory).filter(f=>/^PANEL_F8_\d{14}_[a-z0-9]+\.dump$/.test(f)).sort().reverse();
 return {mode:'DRY_RUN',keep,conservar:files.slice(0,keep),revisar_retencion:files.slice(keep),deleted:0};
}
export async function backupPanel({environment,directory,pool,retention=14}){
 const options=guard(environment,directory);delete options.env.PGSERVICE;delete options.env.PGSERVICEFILE;retentionPlan(directory,retention);
 const timestamp=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14),file=path.join(directory,'PANEL_F8_'+timestamp+'_'+Math.random().toString(36).slice(2,10)+'.dump');
 if(existsSync(file))throw Error('BACKUP_EXISTS');
 const started=Date.now();
 try{
 await run(path.join(environment.PANEL_PG_BIN_DIR||binary,process.platform==='win32'?'pg_dump.exe':'pg_dump'),['--format=custom','--compress=0','--no-owner','--no-acl','--schema=panel','--file',file],{env:options.env,windowsHide:true,timeout:120000,maxBuffer:1024*1024});
 if(!statSync(file).size)throw Error('BACKUP_EMPTY');
 await run(path.join(environment.PANEL_PG_BIN_DIR||binary,process.platform==='win32'?'pg_restore.exe':'pg_restore'),['--list',file],{env:options.env,windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
 const manifest={purpose:'FASE8_ISOLATED_PANEL_BACKUP',database:options.configuration.database,schema:'panel',sha256:digest(file),size:statSync(file).size,created_at:new Date().toISOString(),retention};
 writeFileSync(file+'.manifest.json',JSON.stringify(manifest,null,2));
 if(pool)await pool.query("INSERT INTO panel_backup_events(accion,estado,artifact_name,retention_count) VALUES('BACKUP','OK',$1,$2)",[path.basename(file),retention]);
 return {estado:'OK',file,bytes:manifest.size,duracion_ms:Date.now()-started,retention:retentionPlan(directory,retention)};
 }catch(e){const raw=String(e.stderr||''),denied=raw.match(/permission denied for (?:table|schema|sequence|relation) ([a-z_]+)/i);const code=denied?'BACKUP_PERMISSION_'+denied[1].toUpperCase():raw.includes('unsupported')?'BACKUP_TOOL_UNSUPPORTED':raw.includes('version')?'BACKUP_VERSION_ERROR':e.code==='ENOENT'?'BACKUP_BINARY_MISSING':'BACKUP_FAILED';writeFileSync(path.join(directory,'BACKUP_DIAGNOSTICO.json'),JSON.stringify({purpose:'FASE8_ISOLATED_PANEL',code,tool_exit:e.code||null,diagnostic:raw.replace(/postgresql:\/\/[^\s]+/g,'[REDACTED]').replace(/password[^\n]*/gi,'[REDACTED]').slice(0,1500)},null,2));throw Error(code);}
}
export async function restorePanel({environment,directory,file}){
 const options=guard(environment,directory);delete options.env.PGSERVICE;delete options.env.PGSERVICEFILE;const actual=realpathSync(file);
 if(path.dirname(actual)!==realpathSync(directory))throw Error('RESTORE_PATH_REJECTED');
 const manifest=JSON.parse(readFileSync(actual+'.manifest.json','utf8'));
 if(manifest.purpose!=='FASE8_ISOLATED_PANEL_BACKUP'||manifest.schema!=='panel'||manifest.sha256!==digest(actual)||manifest.size!==statSync(actual).size)throw Error('RESTORE_INTEGRITY_FAILED');
 const started=Date.now();
 try{
 await run(path.join(environment.PANEL_PG_BIN_DIR||binary,process.platform==='win32'?'pg_restore.exe':'pg_restore'),['--clean','--if-exists','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',options.configuration.database,actual],{env:options.env,windowsHide:true,timeout:120000,maxBuffer:1024*1024});
 return {estado:'OK',source_database:manifest.database,target_database:options.configuration.database,duracion_ms:Date.now()-started,privileges_must_be_reapplied:true};
 }catch{throw Error('RESTORE_FAILED');}
}
