import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';
const ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json')),out=ops+'/SMOKE_PANEL_PILOTO.json';if(fs.existsSync(out))throw Error('SMOKE_EXISTS_NO_REPEAT');
const report={isolated_loopback:true,production_modified:false,web_calls:false,tests:[]};const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});
const check=(name,ok,details)=>{report.tests.push({name,ok:!!ok,...(details?{details}:{})});save();assert.ok(ok,name);};
function req(path,body,cookie,host='admin.eduxfac.com',origin='https://admin.eduxfac.com'){return new Promise((resolve,reject)=>{const raw=body?JSON.stringify(body):null;const r=http.request({host:'127.0.0.1',port:4310,path,method:raw?'POST':'GET',headers:{Host:host,Origin:origin,...(raw?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data={text};}resolve({status:res.statusCode,data,headers:res.headers,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});r.setTimeout(10000,()=>r.destroy(Error('SMOKE_TIMEOUT')));r.on('error',reject);if(raw)r.write(raw);r.end();});}
const pm2=()=>JSON.parse(execFileSync('/usr/bin/pm2',['jlist'],{encoding:'utf8'}));const old=pm2().find(p=>p.name==='eduxfac'),oldState=[old.pid,old.pm2_env.restart_time,old.pm2_env.status];
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_panel_piloto',user:'eduxfac_panel_migrator',password:s.roles.eduxfac_panel_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')}});
await db.connect();
try{
check('host no autorizado rechazado',(await req('/api/environment',null,null,'evil.invalid')).status===403);
const env=await req('/api/environment');check('indicador ENTORNO PILOTO',env.status===200&&env.data.mode==='PILOTO'&&env.data.label==='ENTORNO PILOTO');
const html=await req('/');check('frontend HTML/resources',html.status===200&&html.data.text.includes('id="pilot-environment"'));
check('headers CSP/anti frame',html.headers['content-security-policy']?.includes("frame-ancestors 'none'")&&html.headers['x-frame-options']==='DENY');
for(const path of ['/app.js','/admin-dashboard.js','/admin-users.js','/web-onboarding.js','/integration-operations.js','/style.css'])check('recurso '+path,(await req(path)).status===200);
check('setup público deshabilitado',(await req('/api/setup',{username:'no_create',password:'FASE12B_NOT_A_REAL_SECRET'})).status===403);
check('dashboard sin login rechazado',(await req('/api/admin/dashboard')).status===401);
check('contraseña incorrecta rechazada',(await req('/api/login',{username:'f12b_smoke_ficticio',password:'FASE12B_INVALID_PASSWORD'})).status===401);
const main=await req('/api/login',{username:s.PANEL_ADMIN_USERNAME,password:s.PANEL_ADMIN_PASSWORD});check('login administrador inicial',main.status===200);
check('cookie Secure/HttpOnly/SameSite',/Secure/.test(main.headers['set-cookie'][0])&&/HttpOnly/.test(main.headers['set-cookie'][0])&&/SameSite=Strict/.test(main.headers['set-cookie'][0]));
const identity=await req('/api/admin/identity',null,main.cookie);check('cambio obligatorio administrador inicial',identity.data.must_change_password===true);
check('cambio pendiente bloquea dashboard',(await req('/api/admin/dashboard',null,main.cookie)).status===403);
const login=await req('/api/login',{username:'f12b_smoke_ficticio',password:s.PANEL_SMOKE_PASSWORD});check('login ficticio aislado',login.status===200);const cookie=login.cookie;
for(const part of ['dashboard','clientes','empresas','suscripciones','pagos','historial','recuperacion','licencias','equipos','activaciones','configuracion']){const r=await req('/api/admin/'+part,null,cookie);check('módulo '+part,r.status===200,{status:r.status});if(part==='configuracion')check('workers desactivados',r.data.workers.integrationEnabled===false&&r.data.workers.reconciliationEnabled===false&&r.data.workers.expirationEnabled===false);}
for(const path of ['/api/web/planes','/api/web/operacion','/api/web/operacion/vencimientos'])check('consulta local '+path,(await req(path,null,cookie)).status===200);
check('POST origen ajeno rechazado',(await req('/api/web/clientes',{nombre:'NO_CREAR',tipo_documento:'SIN_DOCUMENTO'},cookie,'admin.eduxfac.com','https://evil.invalid')).status===403);
const client=await req('/api/web/clientes',{nombre:'FASE12B FICTICIO SOLO SMOKE VPS',tipo_documento:'SIN_DOCUMENTO'},cookie);check('cliente ficticio solo local',client.status===201);report.fake_client_id=client.data.id;
const health=await req('/api/admin/health',null,cookie);check('health PANEL DB',health.status===200&&health.data.panel_db==='OK');report.pending_web_health=health.data.web_api;
execFileSync('/usr/bin/pm2',['restart','EDUXFAC-PANEL-PILOTO'],{stdio:'pipe'});await new Promise(r=>setTimeout(r,2000));
check('restart propio recupera app',(await req('/api/environment')).status===200);
check('sesión PostgreSQL persiste restart',(await req('/api/admin/dashboard',null,cookie)).status===200);
const state=pm2().find(p=>p.name==='eduxfac');check('WEB PID/restarts intactos',JSON.stringify(oldState)===JSON.stringify([state.pid,state.pm2_env.restart_time,state.pm2_env.status]));
await db.query("UPDATE panel.panel_admin_users SET enabled=0,auth_version=auth_version+1 WHERE username='f12b_smoke_ficticio'");
check('cuenta ficticia deshabilitada',(await req('/api/admin/dashboard',null,cookie)).status===401);
const flag=(await db.query('SELECT must_change_password FROM panel.panel_admin_users WHERE username=$1',[s.PANEL_ADMIN_USERNAME])).rows[0];check('admin inicial sigue pendiente cambio',Number(flag.must_change_password)===1);
const files=[ops+'/panel-out.log',ops+'/panel-error.log'];const all=files.filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');const values=[...Object.values(s.roles),s.WEB_SESSION_SECRET,s.SERVICE_AUTH_SECRET,s.PANEL_ADMIN_PASSWORD,s.PANEL_SMOKE_PASSWORD];check('logs no contienen secretos',!values.some(v=>v&&all.includes(v)));
report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length;save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,web_health:report.pending_web_health,smoke_disabled:true,old_web_unchanged:true}));
}catch(e){report.error_code=e.code||'SMOKE_ASSERTION';report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length;save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,error_code:report.error_code,last_check:report.tests.at(-1)}));process.exitCode=1;}finally{await db.end();}

