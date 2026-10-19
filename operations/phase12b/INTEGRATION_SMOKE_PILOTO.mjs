import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';import {createWebApiClient} from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/server/web-api-client.mjs';
const ops='/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625',out=ops+'/INTEGRACION_SMOKE_AB_PILOTO.json',privateDir='/home/eduxadmin/.config/eduxfac/pilot';
if(fs.existsSync(out))throw Error('NO_REPEAT_INTEGRATION_SMOKE');
const s=JSON.parse(fs.readFileSync(privateDir+'/SECRETS_PRIVATE.json')),pe=JSON.parse(fs.readFileSync(privateDir+'/panel.runtime.json')),api=createWebApiClient({environment:pe});
const config=(kind,role)=>({host:'vmi3635195.contaboserver.net',database:'eduxfac_'+kind+'_piloto',user:role,password:s.roles[role],ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=20000 -c lock_timeout=5000'});
const pd=new pg.Client(config('panel','eduxfac_panel_migrator')),wd=new pg.Client(config('web','eduxfac_web_migrator')),report={only_piloto:true,old_eduxfac_modified:false,transport:'loopback; HTTPS final pendiente',tests:[]},fixtures={};
let cookie,activated=false;
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});
const check=(name,ok,details)=>{report.tests.push({name,ok:!!ok,...(details?{details}:{})});save();assert.ok(ok,name);};
function req(kind,path,body,{token,cookie,peer}={}){return new Promise((resolve,reject)=>{const raw=body===undefined?null:JSON.stringify(body),r=http.request({host:'127.0.0.1',port:kind==='panel'?4310:3001,localAddress:peer,path,method:raw===null?'GET':'POST',headers:{Host:kind==='panel'?'admin.eduxfac.com':'app.eduxfac.com',Origin:kind==='panel'?'https://admin.eduxfac.com':'https://app.eduxfac.com',...(raw?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data={};}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});r.setTimeout(15000,()=>r.destroy(Error('PILOTO_TIMEOUT')));r.on('error',reject);if(raw!==null)r.write(raw);r.end();});}
await pd.connect();await wd.connect();
try{
check('targets exactos PANEL/WEB PILOTO',(await pd.query('SELECT current_database() name')).rows[0].name==='eduxfac_panel_piloto'&&(await wd.query('SELECT current_database() name')).rows[0].name==='eduxfac_web_piloto');
check('sin empresas previas en WEB PILOTO',(await wd.query('SELECT count(*)::int n FROM empresas')).rows[0].n===0);
const health=await req('web','/api/health');check('WEB APP/DB/mode health',health.status===200&&health.data.ok&&health.data.database&&health.data.data_mode==='PILOTO');
check('service auth health con secreto real privado',(await api.health()).ok===true);
check('service sin token rechazado',(await req('web','/api/internal/admin/v1/health')).status===401);
check('peer no permitido rechazado',(await req('web','/api/internal/admin/v1/health',undefined,{peer:'127.0.0.2'})).status===403);
const fake=(await pd.query("SELECT enabled FROM panel.panel_admin_users WHERE username='f12b_smoke_ficticio'")).rows[0];check('solo habilitar cuenta ficticia ya existente',fake&&fake.enabled==='0');
await pd.query("UPDATE panel.panel_admin_users SET enabled=1,auth_version=auth_version+1 WHERE username='f12b_smoke_ficticio'");activated=true;
const login=await req('panel','/api/login',{username:'f12b_smoke_ficticio',password:s.PANEL_SMOKE_PASSWORD});check('login ficticio para integración',login.status===200);cookie=login.cookie;
check('Panel health consulta WEB PILOTO',(await req('panel','/api/web/operacion/health',{}, {cookie})).status===200);
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
for(const label of ['A','B']){
const code='f12b_fict_'+label.toLowerCase(),temp='FASE12B_FICT_TEMP_'+label+'_'+randomBytes(18).toString('hex'),password='FASE12B_FICT_FINAL_'+label+'_'+randomBytes(18).toString('hex');
const client=await req('panel','/api/web/clientes',{nombre:'FASE12B FICTICIO SIN CLIENTE REAL '+label,tipo_documento:'SIN_DOCUMENTO'},{cookie});check('cliente ficticio '+label,client.status===201,{status:client.status});
const draft=await req('panel','/api/web/empresas',{cliente_id:client.data.id,razon_social:'FASE12B FICTICIO '+label,nombre_comercial:'SOLO PRUEBA PILOTO',ruc:label==='A'?'20900012001':'20900012002',empresa_codigo:code,sucursal_nombre:'SUCURSAL FICTICIA',administrador_nombre:'ADMIN FICTICIO',administrador_usuario:'f12b_admin_'+label.toLowerCase(),plan_codigo:'BASICO',fecha_inicio_suscripcion:day},{cookie});check('alta empresa borrador '+label,draft.status===201,{status:draft.status});
const panelId=draft.data.empresa.id;
const completed=await req('panel','/api/web/empresas/'+panelId+'/completar',{password_temporal:temp},{cookie});check('alta WEB transaccional y suscripción '+label,completed.status===200,{status:completed.status,code:completed.data.code||null});
const active=await req('panel','/api/web/empresas/'+panelId+'/activar',{}, {cookie});check('activar solo empresa ficticia '+label,active.status===200,{status:active.status});
const company=(await wd.query('SELECT id FROM empresas WHERE lower(empresa_codigo)=lower($1)',[code])).rows[0].id,branch=(await wd.query('SELECT id FROM sucursales WHERE empresa_id=$1',[company])).rows[0].id;
const first=await req('web','/api/auth/login',{empresa_codigo:code,usuario:'f12b_admin_'+label.toLowerCase(),password:temp});check('login temporal exige cambio '+label,first.status===200&&first.data.debe_cambiar_password===true);
const changed=await req('web','/api/auth/password/change',{password_temporal:temp,password_nuevo:password},{token:first.data.token});check('cambio inicial '+label,changed.status===200,{status:changed.status});
check('token anterior invalidado '+label,(await req('web','/api/bootstrap',undefined,{token:first.data.token})).status!==200);
fixtures[label]={panelId,company,branch,code,token:changed.data.token,password,user:'f12b_admin_'+label.toLowerCase()};
check('estado remoto ACTIVO '+label,(await api.estado(company)).estado==='ACTIVO');
const sub=await api.suscripcion(company);check('suscripción remota activa '+label,sub.estado_empresa==='ACTIVO'&&!!sub.suscripcion_id);
check('uso/plan consultable '+label,!!(await api.uso(company)));
check('consulta uso PANEL '+label,(await req('panel','/api/web/comercial/empresas/'+panelId+'/uso',{}, {cookie})).status===200);
check('conciliación PANEL '+label,(await req('panel','/api/web/operacion/empresas/'+panelId+'/conciliar',{motivo:'FASE12B FICTICIO comprobación controlada'}, {cookie})).status===200);
}
fs.writeFileSync(privateDir+'/F12B_FICT_FIXTURES_PRIVATE.json',JSON.stringify(fixtures,null,2),{mode:0o600});
const a=fixtures.A,b=fixtures.B,token=a.token;
let r=await req('web','/api/admin/suppliers',{razon_social:'FASE12B PROVEEDOR FICTICIO',ruc:'20900012991'},{token});check('proveedor ficticio',r.status===201);const supplier=r.data.id;
r=await req('web','/api/admin/clients',{nombres:'FASE12B COMPRADOR FICTICIO',tipo_doc:'DNI',nro_doc:'90001201'},{token});check('comprador ficticio comercial',r.status===201);const commercialClient=r.data.id;
const category=(await wd.query("INSERT INTO categorias(empresa_id,nombre) VALUES($1,'FASE12B CATEGORIA FICTICIA') RETURNING id",[a.company])).rows[0].id,lab=(await wd.query("INSERT INTO laboratorios(empresa_id,nombre) VALUES($1,'FASE12B LAB FICTICIO') RETURNING id",[a.company])).rows[0].id;
r=await req('web','/api/admin/products',{sucursal_id:a.branch,nombre:'FASE12B PRODUCTO FICTICIO',codigo_barras:'FASE12B_FAKE_PRODUCT_01',principio_activo:'FICTICIO',concentracion:'1mg',presentacion:'Tableta',unidad_medida:'UNIDAD',stock_minimo:1,precio:10,categoria_id:category,laboratorio_id:lab},{token});check('producto ficticio',r.status===201,{status:r.status});const product=r.data.id;
r=await req('web','/api/purchases',{sucursal_id:a.branch,proveedor_id:supplier,tipo_documento:'FACTURA',serie:'F12B',numero:'FICTICIO_01',fecha:day,tipo_compra:'Mercadería',moneda:'PEN',items:[{producto_id:product,cantidad:10,costo_unitario:5,precio_venta:10,numero_lote:'F12B_FICTICIO'}]},{token});check('compra ficticia diez unidades',r.status===201,{status:r.status});
r=await req('web','/api/sales',{sucursal_id:a.branch,cliente_id:commercialClient,items:[{producto_id:product,cantidad:1,precio_unitario:10}],pagos:[{metodo:'EFECTIVO',monto:10}]},{token});check('venta ficticia una unidad',r.status===201,{status:r.status});
check('inventario queda9 unidades',Number((await wd.query('SELECT sum(cantidad_disponible) n FROM lotes WHERE producto_id=$1',[product])).rows[0].n)===9);
check('reporte de venta responde',(await req('web','/api/reports/summary?sucursal_id='+a.branch,undefined,{token})).status===200);
check('pago manual ficticio PANEL',(await req('panel','/api/web/suscripciones/'+a.panelId+'/pago',{command_id:randomUUID(),importe:'59.00',moneda:'PEN',fecha:day,metodo:'EFECTIVO',referencia:'FASE12B FICTICIO SIN COBRO REAL',observacion:'Solo prueba PILOTO'}, {cookie})).status===201);
for(const label of ['A','B']){
const own=fixtures[label],other=fixtures[label==='A'?'B':'A'];
for(const route of ['/api/products','/api/inventory/summary','/api/purchases','/api/admin/users','/api/admin/clients','/api/admin/suppliers','/api/reports/summary','/api/sales']){const cross=await req('web',route+'?empresa_id='+other.company+'&sucursal_id='+other.branch,undefined,{token:own.token});check('A/B HTTP '+label+' '+route,cross.status===403,{status:cross.status});}
const d=new pg.Client(config('web','eduxfac_web_app'));await d.connect();try{await d.query('BEGIN READ ONLY');await d.query("SELECT set_config('app.empresa_id',$1,true),set_config('app.sucursal_ids',$2,true)",[own.company,own.branch]);check('A/B SQL sin WHERE '+label,(await d.query('SELECT id FROM empresas')).rows.every(x=>x.id===own.company)&&(await d.query('SELECT count(*)::int n FROM empresas')).rows[0].n===1);await d.query('ROLLBACK');}finally{await d.end();}
}
const finalHealth=await req('panel','/api/admin/health',undefined,{cookie});check('PANEL health app/DB/WEB OK',finalHealth.status===200&&finalHealth.data.app==='OK'&&finalHealth.data.db.estado==='OK'&&finalHealth.data.web_api==='OK');report.health_transport='loopback, pendiente TLS público';
check('workers permanecen false',!finalHealth.data.workers.integrationEnabled&&!finalHealth.data.workers.reconciliationEnabled&&!finalHealth.data.workers.expirationEnabled);
const logs=['panel-out.log','panel-error.log','web-piloto-out.log','web-piloto-error.log'].filter(n=>fs.existsSync(ops+'/'+n)).map(n=>fs.readFileSync(ops+'/'+n,'utf8')).join('\n');
check('logs sin passwords/token/DSN/secrets',[...Object.values(s.roles),s.PANEL_ADMIN_PASSWORD,s.PANEL_SMOKE_PASSWORD,s.SERVICE_AUTH_SECRET,s.WEB_SESSION_SECRET,...Object.values(fixtures).flatMap(f=>[f.password,f.token])].every(v=>!v||!logs.includes(v))&&!/postgres(?:ql)?:\/\/\S+:\S+@/.test(logs)&&!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(logs));
report.fixtures=Object.fromEntries(Object.entries(fixtures).map(([k,f])=>[k,{panel_id:f.panelId,web_id:f.company,code:f.code,branch:f.branch}]));
report.passed=report.tests.length;report.failed=0;save();console.log(JSON.stringify({passed:report.passed,failed:0,companies_fictitious:2,stock:9,health:'OK_LOOPBACK',public_TLS_pending:true}));
}catch(e){report.passed=report.tests.filter(t=>t.ok).length;report.failed=report.tests.filter(t=>!t.ok).length||1;report.error_code=e.code||'INTEGRATION_ASSERTION';save();console.log(JSON.stringify({passed:report.passed,failed:report.failed,last_check:report.tests.at(-1),error_code:report.error_code}));process.exitCode=1;}
finally{if(activated){await pd.query("UPDATE panel.panel_admin_users SET enabled=0,auth_version=auth_version+1 WHERE username='f12b_smoke_ficticio'");report.smoke_account_disabled=true;save();}await pd.end();await wd.end();}

