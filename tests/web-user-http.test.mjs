import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createPanel} from '../server/app.mjs';
process.env.NODE_ENV='test';
test('HTTP Panel: sesión, origen, rutas y secreto solo en respuesta de reset',async t=>{
 const empresa=randomUUID(),branch=randomUUID(),user=randomUUID();let resets=0;
 const remote={crearCliente:async()=>({cliente_id:randomUUID()}),crearEmpresa:async()=>({empresa_id:empresa}),crearSucursalPrincipal:async()=>({empresa_id:empresa,sucursal_id:branch}),crearAdministradorInicial:async()=>({empresa_id:empresa,usuario_id:user}),
 listCompanyUsers:async()=>({user_management_version:1,empresa_id:empresa,empresa:{estado:'PENDIENTE'},users:[{user_id:user,usuario:'demo_http',nombre:'Sintético',activo:true,debe_cambiar_password:false,sucursales:[],roles:[],empresa_estado:'PENDIENTE',suscripcion_estado:'PENDIENTE',login_ready:false,reasons:['COMPANY_PENDING']}]}),
 resetCompanyUser:async(c,u,b)=>{resets++;assert.equal(c,empresa);assert.equal(u,user);assert.equal(b.actor,'panel_demo');return {empresa_id:c,user_id:u,usuario:'demo_http',temporary_password:'SyntheticHTTP-Only!123',debe_cambiar_password:true,session_invalidation:'USER_PASSWORD_VERSION'};}};
 const server=createPanel({database:':memory:',prepareWebTestSchema:true,webApiClient:remote,workerEnvironment:{INTEGRATION_WORKER_ENABLED:'false'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;let cookie;
 const request=async(route,{body,session=true,origin=base}={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{...(cookie&&session?{Cookie:cookie}:{}),...(body?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie'),cache:r.headers.get('cache-control')};};
 await request('/api/setup',{body:{username:'panel_demo',password:'SyntheticPanel!123'}});cookie=(await request('/api/login',{body:{username:'panel_demo',password:'SyntheticPanel!123'}})).cookie.split(';')[0];
 const client=(await request('/api/web/clientes',{body:{nombre:'Cliente sintético',tipo_documento:'SIN_DOCUMENTO'}})).data;
 const draft=await request('/api/web/empresas',{body:{cliente_id:client.id,razon_social:'Empresa sintética',ruc:'99999999999',empresa_codigo:'DEMO-HTTP',sucursal_nombre:'Principal sintética',administrador_nombre:'Demo',administrador_usuario:'demo_http'}});assert.equal(draft.status,201);
 const id=draft.data.empresa.id;assert.equal((await request('/api/web/empresas/'+id+'/completar',{body:{password_temporal:'SyntheticWebOnly!123'}})).status,200);
 const route='/api/web/empresas/'+id+'/usuarios';
 await t.test('sin sesión 401',async()=>assert.equal((await request(route,{session:false})).status,401));
 await t.test('GET no-cache y estados pendientes legibles',async()=>{const out=await request(route);assert.equal(out.status,200);assert.equal(out.cache,'no-store');assert.equal(out.data.users[0].empresa_estado,'PENDIENTE');});
 await t.test('POST origen ajeno 403 sin reset',async()=>{assert.equal((await request(route+'/'+user+'/reset-password',{origin:'https://invalid.test',body:{confirmar:true,request_id:randomUUID()}})).status,403);assert.equal(resets,0);});
 await t.test('reset HTTP auditado en WEB sin guardar secreto en historial Panel',async()=>{
  const out=await request(route+'/'+user+'/reset-password',{body:{confirmar:true,request_id:randomUUID()}});assert.equal(out.status,200);assert.equal(out.data.temporary_password,'SyntheticHTTP-Only!123');assert.equal(resets,1);
  const history=await request('/api/overview');assert.ok(!JSON.stringify(history.data).includes(out.data.temporary_password));assert.ok(!JSON.stringify((await request(route)).data).includes(out.data.temporary_password));
 });
 await t.test('empresa inexistente 404',async()=>assert.equal((await request('/api/web/empresas/'+randomUUID()+'/usuarios')).status,404));
});
