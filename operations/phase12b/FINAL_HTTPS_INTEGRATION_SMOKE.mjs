import fs from 'node:fs';import https from 'node:https';import assert from 'node:assert/strict';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';import {createWebApiClient} from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/server/web-api-client.mjs';
const ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',dir='/home/eduxadmin/.config/eduxfac/pilot',out=ops+'/CIERRE_HTTPS_INTEGRACION_AB.json';
if(fs.existsSync(out))throw Error('NO_REPEAT_FINAL_SMOKE');
const s=JSON.parse(fs.readFileSync(dir+'/SECRETS_PRIVATE.json')),pe=JSON.parse(fs.readFileSync(dir+'/panel.runtime.json')),f=JSON.parse(fs.readFileSync(dir+'/F12B_FICT_FIXTURES_PRIVATE.json'));
assert.equal(pe.PANEL_WEB_SERVICE_BASE_URL,'https://app.eduxfac.com');
assert.equal(JSON.parse(fs.readFileSync(ops+'/WEB_PILOT_ROUTE_V2.json')).status,'WEB_PILOT_ROUTE_V2_OK');
const report={phase:'12B',transport:'HTTPS_TLS_VERIFIED',old_eduxfac_modified:false,only_existing_fictitious_fixtures:true,tests:[]};
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});
const check=(name,ok)=>{report.tests.push({name,ok:!!ok});save();assert.ok(ok,name)};
const conf=(kind,role)=>({host:'vmi3635195.contaboserver.net',database:'eduxfac_'+kind+'_piloto',user:role,password:s.roles[role],ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=20000'});
const pd=new pg.Client(conf('panel','eduxfac_panel_migrator')),wd=new pg.Client(conf('web','eduxfac_web_migrator'));
function req(host,path,body,{token,cookie,peer}={}){return new Promise((resolve,reject)=>{
 const raw=body===undefined?null:JSON.stringify(body);const r=https.request({hostname:host,port:443,path,localAddress:peer,method:raw===null?'GET':'POST',rejectUnauthorized:true,headers:{Connection:'close',Origin:'https://'+host,...(raw?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{let txt='';res.on('data',b=>txt+=b);res.on('end',()=>{let data;try{data=JSON.parse(txt)}catch{data={}}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],secureCookie:!!res.headers['set-cookie']?.some(v=>/; Secure/i.test(v))});});});
 r.setTimeout(15000,()=>r.destroy(Error('TIMEOUT')));r.on('error',reject);if(raw!==null)r.write(raw);r.end();
});}
let enabled=false,cookie;const tokens={};
await pd.connect();await wd.connect();
try{
 check('solo dos empresas ficticias existentes',(await wd.query('SELECT count(*)::int n FROM empresas')).rows[0].n===2&&Object.keys(f).length===2);
 for(let i=1;i<=3;i++){
  const w=await req('app.eduxfac.com','/api/health');check('HTTPS WEB PILOTO muestra'+i,w.status===200&&w.data.ok&&w.data.database&&w.data.data_mode==='PILOTO');
  const p=await req('admin.eduxfac.com','/api/environment');check('HTTPS PANEL PILOTO muestra'+i,p.status===200&&p.data.mode==='PILOTO');
  const old=await req('eduxfac.com','/api/health');check('HTTPS WEB anterior muestra'+i,old.status===200&&old.data.ok&&old.data.database&&!('data_mode' in old.data));
 }
 check('Nginx loopback interno exige service auth',(await req('app.eduxfac.com','/api/internal/admin/v1/health')).status===401);
 check('Nginx deniega peer interno diferente',(await req('app.eduxfac.com','/api/internal/admin/v1/health',undefined,{peer:'127.0.0.2'})).status===403);
 const api=createWebApiClient({environment:pe});check('service auth health real HTTPS',(await api.health()).ok===true);
 for(const k of ['A','B']){
  const x=f[k];assert.equal(x.code,'f12b_fict_'+k.toLowerCase());
  check('estado HTTPS '+k,(await api.estado(x.company)).estado==='ACTIVO');
  check('suscripcion HTTPS '+k,(await api.suscripcion(x.company)).estado_empresa==='ACTIVO');
  const usage=await api.uso(x.company);check('plan y limites HTTPS '+k,!!usage);
  check('operacion HTTPS '+k,!!await api.operacion(x.company));
 }
 const fake=(await pd.query("SELECT enabled FROM panel.panel_admin_users WHERE username='f12b_smoke_ficticio'")).rows[0];check('cuenta ficticia deshabilitada antes',Number(fake.enabled)===0);
 await pd.query("UPDATE panel.panel_admin_users SET enabled=1,auth_version=auth_version+1 WHERE username='f12b_smoke_ficticio'");enabled=true;
 const login=await req('admin.eduxfac.com','/api/login',{username:'f12b_smoke_ficticio',password:s.PANEL_SMOKE_PASSWORD});
 check('login Panel ficticio HTTPS cookie segura',login.status===200&&!!login.cookie&&login.secureCookie);cookie=login.cookie;
 check('Panel health consulta WEB por HTTPS',(await req('admin.eduxfac.com','/api/web/operacion/health',{}, {cookie})).status===200);
 for(const k of ['A','B']){
  check('conciliacion existente HTTPS '+k,(await req('admin.eduxfac.com','/api/web/operacion/empresas/'+f[k].panelId+'/conciliar',{motivo:'FASE12B FICTICIO cierre HTTPS sin cliente real'},{cookie})).status===200);
 }
 for(const k of ['A','B']){
  const x=f[k];const login=await req('app.eduxfac.com','/api/auth/login',{empresa_codigo:x.code,usuario:x.user,password:x.password});
  check('login WEB ficticio HTTPS '+k,login.status===200&&!!login.data.token&&!login.data.debe_cambiar_password);tokens[k]=login.data.token;
  for(const path of ['/api/bootstrap','/api/products','/api/inventory/summary','/api/purchases','/api/reports/summary','/api/sales']){
   const r=await req('app.eduxfac.com',path+'?sucursal_id='+x.branch,undefined,{token:tokens[k]});check('WEB smoke HTTPS '+k+' '+path,r.status===200);
  }
 }
 for(const k of ['A','B']){
  const own=f[k],other=f[k==='A'?'B':'A'];
  for(const path of ['/api/products','/api/inventory/summary','/api/purchases','/api/admin/users','/api/admin/clients','/api/admin/suppliers','/api/reports/summary','/api/sales'])
   check('A/B HTTPS '+k+' '+path,(await req('app.eduxfac.com',path+'?empresa_id='+other.company+'&sucursal_id='+other.branch,undefined,{token:tokens[k]})).status===403);
  const db=new pg.Client(conf('web','eduxfac_web_app'));await db.connect();try{
   await db.query('BEGIN READ ONLY');await db.query("SELECT set_config('app.empresa_id',$1,true),set_config('app.sucursal_ids',$2,true)",[own.company,own.branch]);
   const rows=(await db.query('SELECT id FROM empresas')).rows;check('A/B SQL sin WHERE '+k,rows.length===1&&rows[0].id===own.company);await db.query('ROLLBACK');
  }finally{await db.end()}
 }
 check('44 tablas FORCE RLS vigentes',(await wd.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n===44);
 check('40 tablas PANEL vigentes',(await pd.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='panel' AND c.relkind='r'")).rows[0].n===40);
 const product=(await wd.query("SELECT id FROM productos WHERE codigo_barras='FASE12B_FAKE_PRODUCT_01'")).rows[0];check('inventario ficticio anterior9 preservado',Number((await wd.query('SELECT sum(cantidad_disponible) n FROM lotes WHERE producto_id=$1',[product.id])).rows[0].n)===9);
 const h=await req('admin.eduxfac.com','/api/admin/health',undefined,{cookie});check('health Panel APP/DB/integracion HTTPS OK',h.status===200&&h.data.app==='OK'&&h.data.db.estado==='OK'&&h.data.web_api==='OK');
 check('workers siguen desactivados',!h.data.workers.integrationEnabled&&!h.data.workers.reconciliationEnabled&&!h.data.workers.expirationEnabled);
 check('admin inicial sigue cambio obligatorio',Number((await pd.query("SELECT must_change_password FROM panel.panel_admin_users WHERE username='eduxadmin'")).rows[0].must_change_password)===1);
 const roles=(await wd.query("SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)",[Object.keys(s.roles)])).rows;
 check('siete roles minimos intactos',roles.length===7&&roles.every(r=>!r.rolsuper&&!r.rolbypassrls&&!r.rolcreatedb&&!r.rolcreaterole));
 const logs=['panel-out.log','panel-error.log','web-piloto-out.log','web-piloto-error.log'].filter(n=>fs.existsSync(ops+'/'+n)).map(n=>fs.readFileSync(ops+'/'+n,'utf8')).join('\n');
 check('logs sin secretos DSN ni JWT',[...Object.values(s.roles),s.PANEL_ADMIN_PASSWORD,s.PANEL_SMOKE_PASSWORD,s.SERVICE_AUTH_SECRET,s.WEB_SESSION_SECRET,...Object.values(f).flatMap(v=>[v.password,v.token]),...Object.values(tokens)].every(v=>!v||!logs.includes(v))&&!/postgres(?:ql)?:\/\/\S+:\S+@/.test(logs)&&!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(logs));
 report.health={web_app:'OK',web_db:'OK',panel_app:'OK',panel_db:'OK',panel_web_https:'OK',nginx:'OK',tls:'OK'};
}catch(e){report.error_code=e.code||'FINAL_CHECK_FAILED';report.failed=report.tests.filter(t=>!t.ok).length||1;process.exitCode=1;}
finally{
 if(enabled){await pd.query("UPDATE panel.panel_admin_users SET enabled=0,auth_version=auth_version+1 WHERE username='f12b_smoke_ficticio'");check('cuenta ficticia deshabilitada al finalizar',Number((await pd.query("SELECT enabled FROM panel.panel_admin_users WHERE username='f12b_smoke_ficticio'")).rows[0].enabled)===0)}
 await pd.end();await wd.end();report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.failed||report.tests.filter(t=>!t.ok).length;save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,health:report.health||null,old_eduxfac_modified:false}));
}
