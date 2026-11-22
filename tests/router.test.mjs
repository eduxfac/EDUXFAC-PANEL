import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPanel} from '../server/app.mjs';
import {routerBrowser} from './helpers/router-browser.mjs';
const source=readFileSync(new URL('../public/router.js',import.meta.url),'utf8');
function browser(path){const context=routerBrowser('http://127.0.0.1:4310'+path);vm.runInNewContext(source,context);return context;}

test('Las rutas y filtros sobreviven a la recarga, atras y adelante',()=>{
 const b=browser('/clientes?estado=ACTIVO&page=2'),r=b.window.panelRouter;let changes=0;
 b.window.addEventListener('panelroutechange',()=>changes++);
 assert.equal(r.current(),'clients');assert.equal(r.query().get('page'),'2');
 assert.equal(b.click('/empresas?estado=SUSPENDIDO'),true);assert.equal(r.current(),'web-empresas');
 assert.equal(b.location.hash,'');assert.equal(changes,1);
 const reloaded=browser(b.location.pathname+b.location.search);assert.equal(reloaded.window.panelRouter.current(),'web-empresas');assert.equal(reloaded.window.panelRouter.query().get('estado'),'SUSPENDIDO');
 b.window.history.back();assert.equal(r.current(),'clients');assert.equal(r.query().get('page'),'2');
 b.window.history.forward();assert.equal(r.current(),'web-empresas');assert.equal(changes,3);
});
test('Enlaces viejos y facturacion por empresa conservan su destino',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const b=browser('/#web-empresas/'+id+'/facturacion');
 assert.equal(b.location.pathname,'/empresas/'+id+'/facturacion');assert.equal(b.location.hash,'');
 assert.equal(b.window.panelRouter.current(),'web-empresas/'+id+'/facturacion');
 assert.equal(browser('/#sunat').location.pathname,'/empresas');assert.equal(browser('/').location.pathname,'/dashboard');
 assert.equal(b.click('/clientes',{ctrlKey:true}),false);assert.equal(b.click('https://example.com/clientes'),false);assert.equal(b.click('/api/status'),false);
});
test('Inicio de sesion y recarga abren el modulo solicitado en vez del dashboard',async()=>{
 async function boot(path,authenticated){
  const context=routerBrowser('http://127.0.0.1:4310'+path),nodes=new Map(),renders=[];
  const node=()=>({hidden:true,value:'',textContent:'',innerHTML:'',setAttribute(){}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  Object.assign(context.document,{getElementById:get,querySelector:node,querySelectorAll:()=>[]});
  const noop={cancel(){},handles:()=>false};
  Object.assign(context.window,{panelSecurity:noop,panelAdmin:{cancel(){},handles:()=>true,render:page=>renders.push(page)},panelOperations:noop,panelSubscriptions:noop,panelWeb:noop,panelWebStates:noop,panelPlans:noop});
  Object.assign(context,{console,setTimeout:()=>0,fetch:async route=>{
   if(route==='/api/login')authenticated=true;
   const status=route.startsWith('/api/admin/')&&!authenticated?401:200;
   const data=route==='/api/environment'?{mode:'PILOTO'}:route==='/api/status'?{setup:false}:route==='/api/overview'?{username:'tester',rbac:false}:{};
   return {ok:status===200,status,json:async()=>data};
  }});
  const vmContext=vm.createContext(context);vm.runInContext(source,vmContext);
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/init\(\);\s*$/,'globalThis.bootPanel=init;'),vmContext);
  await vmContext.bootPanel();return {context,get,renders};
 }
 const first=await boot('/empresas?estado=SUSPENDIDO',false);
 assert.equal(first.get('access').hidden,false);assert.equal(first.context.location.pathname,'/empresas');
 await first.get('login-form').onsubmit({preventDefault(){}});
 assert.equal(first.renders.at(-1),'web-empresas');assert.equal(first.context.location.search,'?estado=SUSPENDIDO');
 const reloaded=await boot(first.context.location.pathname+first.context.location.search,true);
 assert.equal(reloaded.renders.at(-1),'web-empresas');assert.equal(reloaded.get('workspace').hidden,false);
});
test('Servidor entrega la aplicacion en rutas profundas sin exponer API o archivos desconocidos',async t=>{
 const server=createPanel({database:':memory:',dbEnvironment:{NODE_ENV:'test'},workerEnvironment:{},webApiClient:{}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 for(const route of ['/clientes','/empresas?estado=ACTIVO','/empresas/nueva','/empresas/11111111-1111-4111-8111-111111111111/facturacion','/cuenta']){
  const r=await fetch(base+route);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/src="\/router.js"/);
 }
 assert.equal((await fetch(base+'/router.js')).status,200);
 assert.equal((await fetch(base+'/api/overview')).status,401);
 for(const route of ['/desconocido','/missing.js','/.env','/server/app.mjs','/empresas/no-es-id/facturacion'])assert.equal((await fetch(base+route)).status,404);
});
