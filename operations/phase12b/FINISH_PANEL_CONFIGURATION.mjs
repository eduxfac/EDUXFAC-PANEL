import fs from 'node:fs';import assert from 'node:assert/strict';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';
const ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',privateDir='/home/eduxadmin/.config/eduxfac/pilot',out=ops+'/PANEL_PILOTO_PREPARADO.json';if(fs.existsSync(out))throw Error('NO_REPEAT_CONFIGURATION');
const secrets=JSON.parse(fs.readFileSync(privateDir+'/SECRETS_PRIVATE.json')),manifest=JSON.parse(fs.readFileSync(ops+'/MANIFEST_MIGRATIONS_D.json'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_panel_piloto',user:'eduxfac_panel_migrator',password:secrets.roles.eduxfac_panel_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')}});
const report={database:'eduxfac_panel_piloto',old_eduxfac_modified:false,migrations_repeated:false,accounts_recreated:false,resolved_helper_error:'BIGINT_STRING_ASSERTION_NORMALIZED',tests:[]};const check=(name,ok)=>{report.tests.push({name,ok:!!ok});assert.ok(ok,name);};
await db.connect();
try{
await db.query('BEGIN READ ONLY');
check('target PILOTO exacto',(await db.query('SELECT current_database() name')).rows[0].name==='eduxfac_panel_piloto');
const ledger=(await db.query('SELECT version,sha256 FROM panel.pg_schema_migrations')).rows;
for(const m of manifest.panel)check('hash aplicado '+m.version,ledger.some(l=>l.version===m.version&&l.sha256===m.sha256));
check('exactamente ocho migraciones',ledger.length===8);
const admins=(await db.query('SELECT username,must_change_password FROM panel.panel_admin_users')).rows;
check('admin inicial obliga cambio',admins.some(a=>a.username===secrets.PANEL_ADMIN_USERNAME&&Number(a.must_change_password)===1));
check('cuenta smoke ficticia presente',admins.some(a=>a.username==='f12b_smoke_ficticio'));
check('runtime no crea esquema',!(await db.query("SELECT has_schema_privilege('eduxfac_panel_app','panel','CREATE') ok")).rows[0].ok);
check('runtime no actualiza ledger',!(await db.query("SELECT has_table_privilege('eduxfac_panel_app','panel.pg_schema_migrations','UPDATE') ok")).rows[0].ok);
check('backup solo lectura',(await db.query("SELECT bool_and(NOT has_table_privilege('eduxfac_backup',c.oid,'INSERT')) ok FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='panel' AND c.relkind='r'")).rows[0].ok);
await db.query('ROLLBACK');
const url=(name,kind)=>'postgresql://'+name+':'+encodeURIComponent(secrets.roles[name])+'@vmi3635195.contaboserver.net:5432/eduxfac_'+kind+'_piloto';
const common={NODE_ENV:'production',EDUXFAC_DATA_MODE:'PILOTO',INTEGRATION_WORKER_ENABLED:'false',RECONCILIATION_WORKER_ENABLED:'false',EXPIRATION_WORKER_ENABLED:'false'};
const panel={...common,PORT:'4310',PANEL_DB_ENGINE:'postgres',PANEL_DATABASE_URL:url('eduxfac_panel_app','panel'),PANEL_PG_TLS:'verify-full',PANEL_PG_CA_FILE:'/etc/ssl/certs/ssl-cert-snakeoil.pem',PANEL_PUBLIC_ORIGIN:'https://admin.eduxfac.com',PANEL_HSTS_ENABLED:'false',PANEL_WEB_SERVICE_BASE_URL:'http://127.0.0.1:3001',PANEL_WEB_SERVICE_SECRET:secrets.SERVICE_AUTH_SECRET,PANEL_WEB_SERVICE_ISSUER:'panel-piloto',PANEL_WEB_SERVICE_AUDIENCE:'web-piloto'};
const web={...common,PORT:'3001',WEB_RLS_ENABLED:'true',WEB_RLS_PROFILE:'global',DATABASE_URL:url('eduxfac_web_app','web'),WEB_AUTH_DATABASE_URL:url('eduxfac_web_auth','web'),WEB_SERVICE_DATABASE_URL:url('eduxfac_web_service','web'),WEB_PG_TLS:'verify-full',WEB_PG_CA_FILE:'/etc/ssl/certs/ssl-cert-snakeoil.pem',CORS_ORIGIN:'https://app.eduxfac.com',SESSION_SECRET:secrets.WEB_SESSION_SECRET,PANEL_WEB_SERVICE_SECRET:secrets.SERVICE_AUTH_SECRET,PANEL_WEB_SERVICE_ISSUER:'panel-piloto',PANEL_WEB_SERVICE_AUDIENCE:'web-piloto',EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION:'no'};
for(const[k,value]of Object.entries({panel,web}))fs.writeFileSync(privateDir+'/'+k+'.runtime.json',JSON.stringify(value,null,2),{mode:0o600});
report.main_admin_must_change_password=true;report.smoke_username='f12b_smoke_ficticio';report.secrets={DB_SECRET:'CONFIGURADO',SERVICE_AUTH_SECRET:'CONFIGURADO',WEB_SESSION_SECRET:'CONFIGURADO',PANEL_SESSION_SECRET:'NO_APLICA_OPAQUE_DB_SESSIONS'};report.config_outside_code=true;report.service_target='loopback:3001; final HTTPS pendiente';report.web_schema_applied=false;report.passed=report.tests.length;report.failed=0;
fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.log(JSON.stringify({failed:true,error_code:e.code||'CONFIGURATION_ERROR'}));process.exitCode=1;}finally{await db.end();}
