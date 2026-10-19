import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPanel} from '../server/app.mjs';
const uid=randomUUID(),client=randomUUID();
test('Panel Fase 3: autenticación, contratos HTTP y aislamiento del esquema',async t=>{
 let state='ACTIVO',version=1,lastBody,calls=0,wrong=false;
 const commands=new Map();
 const remote={crearCliente:async()=>({cliente_id:client}),crearEmpresa:async()=>({empresa_id:uid,estado:'PENDIENTE'}),crearSucursalPrincipal:async()=>({empresa_id:uid,sucursal_id:randomUUID()}),crearAdministradorInicial:async()=>({empresa_id:uid,usuario_id:randomUUID()}),activar:async(_id,b)=>({empresa_id:uid,command_id:b.command_id,estado:'ACTIVO',auth_version:version}),
  estado:async()=>({empresa_id:uid,estado:state,auth_version:version}),
  suspender:async(_id,b)=>{lastBody=b;calls++;if(wrong)return {empresa_id:randomUUID(),command_id:b.command_id,estado:'SUSPENDIDO',auth_version:version+1};if(commands.has(b.command_id))return {...commands.get(b.command_id),replayed:true};state='SUSPENDIDO';version++;const r={empresa_id:uid,command_id:b.command_id,estado:state,auth_version:version};commands.set(b.command_id,r);return r;}
 };
 const server=createPanel({database:':memory:',prepareWebStateTestSchema:true,webApiClient:remote});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;let cookie;
 const request=async(route,{body,origin=base,session=true}={})=>{const res=await fetch(base+route,{method:body?'POST':'GET',headers:{...(session&&cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};};
 await request('/api/setup',{body:{username:'owner_test',password:'FAKE_PANEL_HTTP_PASSWORD_123'}});cookie=(await request('/api/login',{body:{username:'owner_test',password:'FAKE_PANEL_HTTP_PASSWORD_123'}})).cookie.split(';')[0];
 let company;
 await t.test('rutas Fase 3 requieren sesión de administrador',async()=>{for(const route of ['/api/web/estados/empresas','/api/web/estados/historial'])assert.equal((await request(route,{session:false})).status,401);assert.equal((await request('/api/web/estados/empresas/'+randomUUID()+'/suspender',{session:false,body:{motivo:'Prueba'}})).status,401);});
 await t.test('prepara alta por rutas de Fase 2 sin alterar sus contratos',async()=>{const c=(await request('/api/web/clientes',{body:{nombre:'Cliente prueba',tipo_documento:'SIN_DOCUMENTO'}})).data;company=(await request('/api/web/empresas',{body:{cliente_id:c.id,razon_social:'HTTP empresa',nombre_comercial:'Comercial',ruc:'20555555555',empresa_codigo:'HTTP-EMPRESA',sucursal_nombre:'Principal',administrador_nombre:'Admin',administrador_usuario:'adminhttp'}})).data.empresa;const pending=(await request('/api/web/estados/empresas')).data.rows[0];assert.deepEqual(pending.acciones,[]);assert.equal(pending.empresa_web_id,null);await request('/api/web/empresas/'+company.id+'/completar',{body:{password_temporal:'FAKE_TEMP_PASSWORD_123'}});assert.equal((await request('/api/web/empresas/'+company.id+'/activar',{body:{}})).status,200);});
 const route=action=>'/api/web/estados/empresas/'+company.id+'/'+action;
 await t.test('consulta WEB confirma y concilia estado',async()=>{const r=await request(route('consultar'),{body:{}});assert.equal(r.status,200);assert.equal(r.data.empresa.conciliacion,'SINCRONIZADO');assert.equal(r.data.empresa.estado_web,'ACTIVO');});
 await t.test('rechaza origen externo y motivo vacío antes de conectar',async()=>{assert.equal((await request(route('suspender'),{body:{motivo:'Prueba'},origin:'https://invalid.test'})).status,403);assert.equal((await request(route('suspender'),{body:{motivo:''}})).status,400);assert.equal(calls,0);});
 await t.test('administrador se toma de sesión y no admite suplantación HTTP',async()=>{assert.equal((await request(route('suspender'),{body:{motivo:'Prueba',administrador:'impostor'}})).status,400);assert.equal(calls,0);assert.equal((await request(route('suspender'),{body:{motivo:'HTTP prueba'}})).status,200);assert.equal(lastBody.administrador,'owner_test');});
 await t.test('historial filtrado muestra administrador y motivo, sin credenciales',async()=>{const r=await request('/api/web/estados/historial?accion=SUSPENDER&resultado=APLICADO');assert.equal(r.status,200);assert.equal(r.data.total,1);assert.equal(r.data.rows[0].administrador,'owner_test');assert.equal(r.data.rows[0].motivo,'HTTP prueba');assert.ok(!JSON.stringify(r.data).includes('FAKE_TEMP_PASSWORD'));});
 await t.test('reintento de otra empresa no puede usar comando ajeno',async()=>{const r=await request('/api/web/estados/empresas/'+randomUUID()+'/reintentar',{body:{command_id:lastBody.command_id}});assert.equal(r.status,404);});
 await t.test('filtros inválidos y paginación excesiva se rechazan',async()=>{for(const q of ['estado=INVALIDO','page_size=1000','page=-1'])assert.equal((await request('/api/web/estados/empresas?'+q)).status,400);assert.equal((await request('/api/web/estados/historial?fecha=11-10-2026')).status,400);});
 await t.test('esquema de prueba jamás abre SQLite persistente',()=>{assert.throws(()=>createPanel({database:'D:/EDUXFAC/PANEL EDUXFAC/03_RESPALDOS/NO_CREAR_TEST.sqlite',prepareWebStateTestSchema:true}),/memoria/);});
});
test('Panel normal no aplica Fase 3 automáticamente',async t=>{
 const server=createPanel({database:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,post=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
 await post('/api/setup',{username:'owner_test',password:'FAKE_PANEL_HTTP_PASSWORD_123'});const login=await post('/api/login',{username:'owner_test',password:'FAKE_PANEL_HTTP_PASSWORD_123'}),cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/web/estados/empresas',{headers:{Cookie:cookie}})).status,503);
});
