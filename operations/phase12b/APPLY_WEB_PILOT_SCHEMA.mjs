import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';
/* Explicit FASE12B operator for a NEW EMPTY PILOTO database.
   Does not call or alter installGlobalRLS (laboratory-only).
   Uses the exported declarative planner and guards this exact database/owner/marker.
   No legacy eduxfac connection, role creation, DROP DATABASE or data import. */
const release='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625',ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',out=ops+'/WEB_PILOTO_SCHEMA_APLICADO.json';
if(process.argv.slice(2).join(' ')!=='--apply')throw Error('EXACT_--apply_REQUIRED');
if(fs.existsSync(out))throw Error('NO_REPEAT_SCHEMA_APPLY');
const rehearsal=JSON.parse(fs.readFileSync(ops+'/ENSAYO_RLS_AB_ROLLBACK.json'));assert.equal(rehearsal.passed,22);assert.equal(rehearsal.failed,0);assert.equal(rehearsal.rollback,true);
const backups=JSON.parse(fs.readFileSync(ops+'/BACKUP_PILOTO_VACIO.json'));const emptyDump=backups.backups.find(b=>b.database==='eduxfac_web_piloto');
assert.ok(emptyDump);assert.equal(createHash('sha256').update(fs.readFileSync(emptyDump.file)).digest('hex'),emptyDump.sha256);
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json')),manifest=JSON.parse(fs.readFileSync(ops+'/MANIFEST_MIGRATIONS_D.json'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=30000 -c lock_timeout=5000'});
const report={purpose:'FASE12B_EXPLICIT_NEW_EMPTY_WEB_PILOTO_SCHEMA',database:'eduxfac_web_piloto',old_eduxfac_modified:false,source_code_changed:false,laboratory_installer_called:false,laboratory_guard_changed:false,tests:[],manifest};let transaction=false;
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600}),check=(name,ok)=>{report.tests.push({name,ok:!!ok});save();assert.ok(ok,name);};
await db.connect();
try{
const before=(await db.query("SELECT current_database() name,current_user role,pg_get_userbyid(datdba) owner,shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0];
check('exactamente WEB PILOTO owner migrador y marcador PILOTO',before.name==='eduxfac_web_piloto'&&before.role==='eduxfac_web_migrator'&&before.owner===before.role&&JSON.parse(before.marker).eduxfac_data_mode==='PILOTO');
check('destino vacío',Number((await db.query("SELECT count(*) n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'")).rows[0].n)===0);
check('migrador sin SUPER/BYPASS/CREATEDB/CREATEROLE',(await db.query("SELECT NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) ok FROM pg_roles WHERE rolname=current_user")).rows[0].ok);
check('quince etapas con hashes exactos',manifest.web.length===15&&manifest.web.every(m=>createHash('sha256').update(fs.readFileSync(release+'/web/'+m.file)).digest('hex')===m.sha256));
await db.query('BEGIN');transaction=true;await db.query('SELECT pg_advisory_xact_lock(8844012)');
const query=(sql,args)=>db.query(sql.replace(/^\s*(?:BEGIN|COMMIT|ROLLBACK);\s*$/gm,''),args);
Object.assign(process.env,{NODE_ENV:'test',EDUXFAC_DATA_MODE:'PILOTO',WEB_RLS_ENABLED:'false',WEB_RLS_PROFILE:'',SESSION_SECRET:s.WEB_SESSION_SECRET});
const {installTestDatabase}=await import(release+'/web/server/src/db.js');installTestDatabase({isolatedTestDatabase:true,query,connect:async()=>({query,release(){}}),end:async()=>{}});
const {initializeDatabase}=await import(release+'/web/server/src/app.js');await initializeDatabase({migrate:true});
for(const m of manifest.web.filter(m=>m.file.startsWith('database/migrations/')))await query(fs.readFileSync(release+'/web/'+m.file,'utf8'));
const {planGlobalRLS}=await import(release+'/web/server/scripts/global-rls.js');
const plan=await planGlobalRLS(db,{tenant:'eduxfac_web_app',auth:'eduxfac_web_auth',service:'eduxfac_web_service',migrator:'eduxfac_web_migrator',backup:'eduxfac_backup',dataMode:'PILOTO'});
check('plan no cambia roles/global ni borra tablas/bases',plan.statements.every(sql=>!/\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE)|CREATE\s+(?:ROLE|DATABASE)|ALTER\s+ROLE|TRUNCATE|DELETE\s+FROM|COMMIT)\b/i.test(sql)));
const sqls=plan.statements.filter(sql=>!/^COMMENT ON DATABASE /.test(sql));
for(const sql of sqls)await db.query(sql);
const flags=(await db.query("SELECT count(*)::int n,count(*) FILTER(WHERE relrowsecurity AND relforcerowsecurity)::int protected FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'")).rows[0];
check('49 tablas con44 FORCE RLS',flags.n===49&&flags.protected===44);
check('sin empresas/usuarios/clientes importados',(await db.query('SELECT (SELECT count(*) FROM empresas)+(SELECT count(*) FROM usuarios)+(SELECT count(*) FROM clientes_admin) n')).rows[0].n==='0');
check('seis migraciones explícitas registradas',(await db.query('SELECT count(*)::int n FROM web_schema_migrations')).rows[0].n===6);
check('marker creado manualmente conservado',(await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker===before.marker);
await db.query('COMMIT');transaction=false;report.committed=true;report.rls_statements_applied=sqls.length;report.plan_sha256=createHash('sha256').update(JSON.stringify(sqls)).digest('hex');report.passed=report.tests.length;report.failed=0;save();console.log(JSON.stringify({database:report.database,passed:report.passed,failed:0,committed:true,tables:49,force_rls:44,companies:0,old_eduxfac_modified:false}));
}catch(e){if(transaction){await db.query('ROLLBACK');transaction=false;}report.committed=report.committed===true;report.error_code=e.code||'WEB_SCHEMA_APPLY_ASSERTION';report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length||1;save();console.log(JSON.stringify({committed:report.committed,passed:report.passed,failed:report.failed,error_code:report.error_code,last_check:report.tests.at(-1)}));process.exitCode=1;}finally{await db.end();}

