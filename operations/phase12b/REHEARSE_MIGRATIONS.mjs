import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';import {grantPanelPrivileges} from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/server/postgres-migrations.mjs';
const release='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625',ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',secrets=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json')),manifest=JSON.parse(fs.readFileSync(ops+'/MANIFEST_MIGRATIONS_D.json'));
const hash=x=>createHash('sha256').update(x).digest('hex'),report={purpose:'FASE12B_TRANSACTIONAL_REHEARSAL',old_eduxfac_modified:false,committed:false,tests:[],projects:[]};
function save(){fs.writeFileSync(ops+'/ENSAYO_MIGRACIONES_ROLLBACK.json',JSON.stringify(report,null,2),{mode:0o600});}
function check(name,ok){report.tests.push({name,ok:!!ok});save();assert.ok(ok,name);}
const connection=(kind,role)=>({host:'vmi3635195.contaboserver.net',database:'eduxfac_'+kind+'_piloto',user:role,password:secrets.roles[role],ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},connectionTimeoutMillis:5000,options:'-c statement_timeout=30000 -c lock_timeout=5000'});
try{
for(const kind of ['panel','web']){
 const role='eduxfac_'+kind+'_migrator',db=new pg.Client(connection(kind,role));await db.connect();let transaction=false;
 try{
 const meta=(await db.query("SELECT current_database() db,current_user role,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) owner")).rows[0];
 check(kind+' target/marcador/owner exactos',meta.db==='eduxfac_'+kind+'_piloto'&&meta.role===role&&meta.owner===role&&JSON.parse(meta.marker).eduxfac_data_mode==='PILOTO');
 const count=async()=>Number((await db.query("SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('panel','public') AND c.relkind='r'")).rows[0].n);
 check(kind+' vacío antes del ensayo',await count()===0);
 for(const m of manifest[kind])check(kind+' SHA256 '+m.version,hash(fs.readFileSync(release+'/'+kind+'/'+m.file))===m.sha256);
 await db.query('BEGIN');transaction=true;
 let suppressed=0;
 const query=async(sql,args)=>{if(typeof sql!=='string')throw Error('SQL_TYPE_INVALID');const safe=sql.replace(/^\s*(?:BEGIN|COMMIT|ROLLBACK);\s*$/gm,()=>{suppressed++;return '';});return db.query(safe,args);};
 if(kind==='panel'){
 for(const m of manifest.panel){await query(fs.readFileSync(release+'/panel/'+m.file,'utf8'));await db.query('INSERT INTO panel.pg_schema_migrations(version,sha256) VALUES($1,$2)',[m.version,m.sha256]);}
 await grantPanelPrivileges(db,{appRole:'eduxfac_panel_app',backupRole:'eduxfac_backup'});
 check('panel ocho migraciones y hashes dentro de transacción',(await db.query('SELECT count(*)::int n FROM panel.pg_schema_migrations')).rows[0].n===8);
 }else{
 Object.assign(process.env,{NODE_ENV:'test',EDUXFAC_DATA_MODE:'PILOTO',WEB_RLS_ENABLED:'false',WEB_RLS_PROFILE:'',SESSION_SECRET:secrets.WEB_SESSION_SECRET});
 const {installTestDatabase}=await import(release+'/web/server/src/db.js');installTestDatabase({isolatedTestDatabase:true,query,connect:async()=>({query,release(){}}),end:async()=>{}});
 const {initializeDatabase}=await import(release+'/web/server/src/app.js');await initializeDatabase({migrate:true});
 for(const m of manifest.web.filter(x=>x.file.startsWith('database/migrations/')))await query(fs.readFileSync(release+'/web/'+m.file,'utf8'));
 check('web seis migraciones explícitas dentro de transacción',(await db.query('SELECT count(*)::int n FROM public.web_schema_migrations')).rows[0].n===6);
 const {planGlobalRLS}=await import(release+'/web/server/scripts/global-rls.js');const plan=await planGlobalRLS(db,{tenant:'eduxfac_web_app',auth:'eduxfac_web_auth',service:'eduxfac_web_service',migrator:'eduxfac_web_migrator',backup:'eduxfac_backup',dataMode:'PILOTO'});
 check('web plan RLS clasifica 44 protegidas y cinco globales',plan.rows.filter(x=>x.rls).length===44&&plan.rows.filter(x=>!x.rls).length===5);
 fs.writeFileSync(ops+'/PLAN_RLS_WEB_REVISAR.json',JSON.stringify({...plan,applied:false,installer_guard_preserved:true},null,2),{mode:0o600});
 check('web sin empresas ficticias importadas',(await db.query('SELECT count(*)::int n FROM public.empresas')).rows[0].n===0);
 }
 const builtTables=await count();await db.query('ROLLBACK');transaction=false;
 check(kind+' rollback devuelve DB a cero tablas',await count()===0);
 report.projects.push({kind,database:meta.db,migrations:manifest[kind].length,built_tables_in_transaction:builtTables,transaction_controls_suppressed:suppressed,rollback:true,remaining_tables:0});save();
 }finally{if(transaction)await db.query('ROLLBACK');await db.end();}
}
report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length;save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,projects:report.projects,RLS_applied:false}));
}catch(e){report.error_code=/^[A-Z0-9_]{1,60}$/.test(e.code||'')?e.code:'CONTROLLED_REHEARSAL_ERROR';save();console.log(JSON.stringify({failed:true,error_code:report.error_code,tests:report.tests}));process.exitCode=1;}

