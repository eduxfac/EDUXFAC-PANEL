import {createPanelPool,pgConfiguration} from './db.mjs';
import {applyPostgresMigrations,grantPanelPrivileges} from './postgres-migrations.mjs';
import {migrateSQLiteSnapshot} from './sqlite-postgres-migrator.mjs';
import {backupPanel,restorePanel} from './panel-backup-restore.mjs';
import {adoptionDryRun} from './adoption-dry-run.mjs';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function validateLab(environment,directory){
 if(environment.NODE_ENV!=='test'||environment.PANEL_F8_ISOLATED!=='yes')throw Error('F8_EXPLICIT_TEST_REQUIRED');
 const c=pgConfiguration(environment);
 if(!['localhost','127.0.0.1'].includes(c.host)||!/^panel_f8_[a-z0-9_]+$/.test(c.database))throw Error('F8_TARGET_REJECTED');
 const root=realpathSync(directory),prefix=fileURLToPath(new URL('../tests/.fase8/',import.meta.url));
 if(!root.startsWith(path.resolve(prefix)+path.sep)||JSON.parse(readFileSync(path.join(root,'SOLO_PRUEBAS.json'),'utf8')).purpose!=='FASE8_ISOLATED_PANEL')throw Error('F8_DIRECTORY_REJECTED');
 return root;
}
export async function runPhase8Tool({mode,directory,file,environment=process.env,retention=14}){
 const root=validateLab(environment,directory);
 if(!['schema','migrate','backup','restore','adoption'].includes(mode))throw Error('F8_MODE_REJECTED');
 if(file){const real=realpathSync(file);if(path.dirname(real)!==root)throw Error('F8_FILE_REJECTED');file=real;}
 let pool,result;
 try{
 if(mode==='schema'){pool=createPanelPool(environment);result=await applyPostgresMigrations({pool});await grantPanelPrivileges(pool,{appRole:'eduxfac_panel_app',backupRole:'eduxfac_backup'});}
 if(mode==='migrate'){pool=createPanelPool(environment);result=await migrateSQLiteSnapshot({source:file,pool});}
 if(mode==='backup')result=await backupPanel({environment,directory:root,retention});
 if(mode==='restore')result=await restorePanel({environment,directory:root,file});
 if(mode==='adoption')result=adoptionDryRun(JSON.parse(readFileSync(file,'utf8')));
 const report={purpose:'FASE8_ISOLATED_PANEL',mode,at:new Date().toISOString(),result};
 writeFileSync(path.join(root,'REPORTE_'+mode.toUpperCase()+'.json'),JSON.stringify(report,null,2));
 return report;
 }finally{await pool?.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,directory,file]=process.argv.slice(2);
 try{await runPhase8Tool({mode,directory,file,retention:Number(process.env.PANEL_BACKUP_RETENTION_COUNT||14)});console.log('FASE8_TOOL_OK: reporte guardado en laboratorio de D:.');}
 catch(e){console.error('FASE8_TOOL_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'CONTROLLED_FAILURE'));process.exitCode=1;}
}
