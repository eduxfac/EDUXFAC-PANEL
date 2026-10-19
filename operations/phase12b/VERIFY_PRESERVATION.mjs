import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';import dotenv from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/dotenv/lib/main.js';
const ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',release='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625',backup='/home/eduxadmin/.local/share/eduxfac/backups/FASE12B_20261013_0625',s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json')),manifest=JSON.parse(fs.readFileSync(ops+'/MANIFEST_MIGRATIONS_D.json'));
const report={read_only:true,tests:[],migration_dry_run:[],source_modified:false},hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const save=()=>fs.writeFileSync(ops+'/CONTROLES_PRESERVACION_Y_DRY_RUN.json',JSON.stringify(report,null,2),{mode:0o600});const check=(name,ok)=>{report.tests.push({name,ok:!!ok});save();assert.ok(ok,name);};
const legacy=dotenv.parse(fs.readFileSync('/var/www/eduxfac/.env')),oldUrl=new URL(legacy.DATABASE_URL);assert.equal(oldUrl.pathname,'/eduxfac');
const conn=(database,user,password)=>({host:'vmi3635195.contaboserver.net',database,user,password,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=15000'});
try{
const code=JSON.parse(fs.readFileSync(backup+'/CODE_MANIFEST_PRIVATE.json'));
const divergent=code.files.filter(e=>hash('/var/www/eduxfac/'+e.relative_path)!==e.sha256).map(e=>e.relative_path);
report.old_web_files_verified=code.files.length;check('WEB antiguo bytes intactos vs backup',divergent.length===0);
check('.env antiguo 0600',(fs.statSync('/var/www/eduxfac/.env').mode&0o777)===0o600);
for(const [old,file]of [['/home/eduxadmin/.pm2/dump.pm2','PM2_DUMP_PRIVATE.json'],['/etc/nginx/nginx.conf','NGINX_MAIN_PRIVATE.conf'],['/etc/nginx/sites-enabled/eduxfac','NGINX_WEB_PRIVATE.conf'],['/etc/systemd/system/pm2-eduxadmin.service','PM2_SYSTEMD_PRIVATE.service']])check('config intacta '+file,hash(old)===hash(backup+'/'+file));
for(const kind of ['legacy','panel','web']){
 const dbName=kind==='legacy'?'eduxfac':'eduxfac_'+kind+'_piloto',role=kind==='legacy'?decodeURIComponent(oldUrl.username):'eduxfac_'+kind+'_migrator',password=kind==='legacy'?decodeURIComponent(oldUrl.password):s.roles[role],db=new pg.Client(conn(dbName,role,password));await db.connect();
 try{
 await db.query('BEGIN READ ONLY');const schema=kind==='panel'?'panel':'public';
 const tables=(await db.query("SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname",[schema])).rows;
 const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1",[schema])).rows;
 const constraints=(await db.query("SELECT c.conname name FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1",[schema])).rows;
 const indexes=(await db.query("SELECT indexname name FROM pg_indexes WHERE schemaname=$1",[schema])).rows;
 let ledger=[],branchLedger=[];const ledgerName=kind==='panel'?'pg_schema_migrations':'web_schema_migrations';
 if(tables.some(t=>t.name===ledgerName))ledger=(await db.query('SELECT * FROM '+schema+'.'+ledgerName)).rows;
 if(kind!=='panel'&&tables.some(t=>t.name==='eduxfac_migraciones'))branchLedger=(await db.query('SELECT nombre FROM eduxfac_migraciones')).rows;
 const rows=[];
 for(const m of manifest[kind==='panel'?'panel':'web']){
 const old=ledger.find(x=>x.version===m.ledger)||branchLedger.find(x=>x.nombre===m.ledger),missing=m.probes.filter(([type,name,col])=>type==='column'?!columns.some(c=>c.table_name===name&&c.column_name===col):type==='constraint'?!constraints.some(c=>c.name===name):type==='index'?!indexes.some(c=>c.name===name):!tables.some(t=>t.name===name));
 const status=old?.sha256&&old.sha256!==m.sha256||old&&missing.length?'CONFLICTO':missing.length?'PENDIENTE':old?'APLICADA':m.probes.length?'ESTRUCTURA_PRESENTE_SIN_HASH':'REVISION_MANUAL_SIN_LEDGER';
 rows.push({...m,status,missing,checksum_verified:!!old?.sha256&&old.sha256===m.sha256});
 }
 report.migration_dry_run.push({database:dbName,read_only:true,tables:tables.length,rows,blocking:rows.some(x=>x.status==='CONFLICTO')});
 check(kind+' dry-run sin conflictos no explicados',!rows.some(x=>x.status==='CONFLICTO'));
 if(kind==='legacy'){
 const baseline=JSON.parse(fs.readFileSync(backup+'/DB_METADATA_PRIVATE.json'));let countsEqual=true;for(const t of baseline.tables){const count=(await db.query('SELECT count(*)::text n FROM public."'+t.name+'"')).rows[0].n;if(count!==baseline.counts[t.name])countsEqual=false;}
 check('41 conteos base antigua intactos',countsEqual);report.old_database_tables=baseline.tables.length;
 }else if(kind==='web')check('WEB PILOTO permanece vacío',tables.length===0);
 else{
 check('Panel migraciones ocho hashes verificados',rows.length===8&&rows.every(r=>r.checksum_verified));
 const counts={};for(const t of tables)counts[t.name]=Number((await db.query('SELECT count(*)::text n FROM panel."'+t.name+'"')).rows[0].n);
 fs.writeFileSync(ops+'/PANEL_BACKUP_COUNTS_READONLY.json',JSON.stringify({database:dbName,counts,observed_after_dump:true,no_concurrent_workers:true},null,2),{mode:0o600});
 const attrs=(await db.query("SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)",[Object.keys(s.roles)])).rows;
 check('siete roles mínimos intactos',attrs.length===7&&attrs.every(a=>!a.rolsuper&&!a.rolbypassrls&&!a.rolcreatedb&&!a.rolcreaterole));
 }
 await db.query('ROLLBACK');
 }finally{await db.end();}
}
report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length;save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,web_source_files:report.old_web_files_verified,old_tables:report.old_database_tables,migrations:report.migration_dry_run.map(x=>({database:x.database,tables:x.tables,blocking:x.blocking,statuses:x.rows.map(r=>({version:r.version,status:r.status}))}))}));
}catch(e){report.error_code=e.code||'PRESERVATION_CHECK_ERROR';save();console.log(JSON.stringify({failed:true,error_code:report.error_code,last_check:report.tests.at(-1)}));process.exitCode=1;}

