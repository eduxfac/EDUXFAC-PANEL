// Explicit local-only launcher for the integrated WEB and Panel.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import pg from 'pg';
const panel=process.cwd(),web='D:/EDUXFAC_WEB_V2',state=path.resolve('staging/user-local-integration'),purpose='EDUXFAC_USER_MANAGEMENT_LOCAL_LAB';
const wc=JSON.parse(fs.readFileSync(path.join(web,'.env.user-management-local.json'),'utf8')),pc=JSON.parse(fs.readFileSync(path.join(panel,'.env.user-management-local.json'),'utf8')),cluster=JSON.parse(fs.readFileSync(path.join(web,'runtime/user-management-local/cluster-admin.json'),'utf8'));
for(const c of [wc,pc,cluster])if(c.purpose!==purpose)throw Error('LOCAL_CONFIGURATION_MARKER_REQUIRED');
for(const [k,v]of Object.entries({...wc.environment,...pc.environment}))if(/DATABASE_URL|API_URL|BASE_URL|ORIGIN/.test(k)&&v){const u=new URL(v);if(u.hostname!=='127.0.0.1')throw Error('NONLOCAL_CONFIGURATION_BLOCKED');if(k.includes('DATABASE_URL')&&u.pathname!=='/eduxfac_user_management_lab')throw Error('UNEXPECTED_DATABASE_BLOCKED');}
if(!path.resolve(cluster.data).startsWith(path.resolve('staging')+path.sep)||cluster.database!=='eduxfac_user_management_lab'||cluster.port===55432)throw Error('UNSAFE_CLUSTER_TARGET');
const bin='C:/Program Files (x86)/EDUXFAC/PostgreSQL/bin/pg_ctl.exe';const ctl=args=>{const r=spawnSync(bin,['-D',cluster.data,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw Error('LOCAL_PG_CONTROL_FAILED');};
let started=false,webServer,panelServer,webDb,stopTimer;
const clusterStatus=spawnSync(bin,['-D',cluster.data,'status'],{encoding:'utf8',windowsHide:true});if(![0,3].includes(clusterStatus.status))throw Error('LOCAL_PG_STATUS_UNAVAILABLE');
const already=clusterStatus.status===0;
if(!already){ctl(['-l',path.join(cluster.clusterRoot,'postgres.log'),'-o',`-h 127.0.0.1 -p ${cluster.port} -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0`,'-w','start']);started=true;}
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;clearInterval(stopTimer);if(panelServer)await new Promise(r=>panelServer.close(r));if(webServer)await new Promise(r=>webServer.close(r));if(webDb)await webDb.pool.end();if(started)ctl(['-m','fast','-w','stop']);fs.writeFileSync(path.join(state,'service-status.json'),JSON.stringify({running:false,stoppedAt:new Date().toISOString()}));};
try{
 const owner=new pg.Client({host:'127.0.0.1',port:cluster.port,database:cluster.database,user:cluster.owner,password:cluster.password});await owner.connect();try{const row=(await owner.query("SELECT current_database() db,current_setting('data_directory') data,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0];if(row.db!==cluster.database||path.resolve(row.data)!==path.resolve(cluster.data)||JSON.parse(row.marker).purpose!==purpose)throw Error('DATABASE_IDENTITY_MISMATCH');}finally{await owner.end();}
 // No inherited remote integration settings are permitted in this launcher.
 for(const k of Object.keys(process.env))if(/DATABASE_URL|^PG|^PANEL_|SESSION_SECRET|JWT_SECRET|^CPE_|^SUNAT_|^GREENTER_|^PERUDEVS_|^WEB_|^EDUXFAC_/.test(k))delete process.env[k];
 Object.assign(process.env,wc.environment,{DOTENV_CONFIG_PATH:path.join(state,'absent.env')});
 const nativeFetch=globalThis.fetch;let blocked=0;globalThis.fetch=(input,options)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(u.hostname!=='127.0.0.1'){blocked++;return Promise.reject(Error('LOCAL_ONLY_NETWORK_GUARD'));}return nativeFetch(input,options);};
 const {app,initializeDatabase}=await import(pathToFileURL(path.join(web,'server/src/app.js')));webDb=await import(pathToFileURL(path.join(web,'server/src/db.js')));await initializeDatabase({migrate:false});
 webServer=app.listen(Number(wc.environment.PORT),'127.0.0.1');await new Promise((r,j)=>{webServer.once('listening',r);webServer.once('error',j);});
 const {createPanel}=await import('../server/app.mjs'),{createWebApiClient}=await import('../server/web-api-client.mjs');panelServer=createPanel({database:pc.database,dbEnvironment:pc.environment,workerEnvironment:pc.environment,webApiClient:createWebApiClient({environment:pc.environment})});await new Promise((r,j)=>{panelServer.once('error',j);panelServer.listen(Number(pc.environment.PORT),'127.0.0.1',r);});
 fs.writeFileSync(path.join(state,'service-status.json'),JSON.stringify({running:true,pid:process.pid,webBase:pc.environment.PANEL_WEB_SERVICE_BASE_URL,panelBase:pc.environment.PANEL_PUBLIC_ORIGIN,workersEnabled:false,externalFetchBlocked:blocked}));
 console.log('LOCAL_WEB_URL='+pc.environment.PANEL_WEB_SERVICE_BASE_URL);console.log('LOCAL_PANEL_URL='+pc.environment.PANEL_PUBLIC_ORIGIN);console.log('WORKERS=OFF');console.log('LOCAL_INTEGRATION_SERVERS=READY');
 // A local file signal also supports graceful shutdown from automation on
 // Windows, where terminating a shell can kill its whole process job.
 const stopFile=path.join(state,'stop.request');fs.rmSync(stopFile,{force:true});stopTimer=setInterval(()=>{if(fs.existsSync(stopFile))void stop().then(()=>process.exit(0)).catch(()=>process.exit(1));},300);stopTimer.unref();
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop().then(()=>process.exit(0)));
}catch(e){await stop();console.log('LOCAL_LAUNCH_ERROR='+(e.code||e.message));process.exitCode=1;}
