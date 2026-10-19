import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPanel} from '../server/app.mjs';
process.env.NODE_ENV='test';

test('temporary login -> required change -> relogin -> Dashboard without another password form',async t=>{
 const server=createPanel({database:':memory:',preparePhase8TestSchema:true,workerEnvironment:{},dbEnvironment:{NODE_ENV:'test'},webApiClient:{}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const temporary='FICTICIO_TEMPORAL_BROWSER_012345',next='FICTICIO_NEW_BROWSER_012345';
 let cookie='';
 async function request(route,body,session=cookie){
  const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),setCookie:r.headers.get('set-cookie')};
 }
 await request('/api/setup',{username:'owner_ui_flow',password:temporary});
 const owner=(await request('/api/login',{username:'owner_ui_flow',password:temporary})).setCookie.split(';')[0];
 assert.equal((await request('/api/admin/usuarios',{username:'ui_flow_ficticio',password:temporary,role:'SUPERADMIN',motivo:'Solo regresion memoria'},owner)).status,201);
 let hash='',reloads=0,pending=[],context,elements;
 const element=()=>({hidden:false,value:'',textContent:'',innerHTML:'',disabled:false,setAttribute(){},querySelector(){return {}},querySelectorAll(){return []}});
 async function boot(){
  elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
  const form={fields:{},reset(){this.fields={}}},message=element();
  const content=get('content');content.querySelector=selector=>selector==='[data-profile]'?form:message;
  const listeners={};const location={get hash(){return hash},set hash(value){hash=value.startsWith('#')?value:'#'+value},reload(){reloads++;pending.push(boot())}};
  const noop={cancel(){},handles:()=>false,render(){}};
  const window={addEventListener:(event,callback)=>listeners[event]=callback,panelAdmin:{...noop,handles:p=>p==='dashboard',render:(page,el,top)=>{el.innerHTML=top+'<p>Dashboard normal</p>'}},panelOperations:noop,panelSubscriptions:noop,panelWeb:noop,panelWebStates:noop,panelPlans:noop};
  const document={getElementById:get,querySelector:()=>element(),querySelectorAll:()=>[],documentElement:{},body:{}};
  context=vm.createContext({window,document,location,console,Date,URL,FormData:class{constructor(f){this.f=f}*[Symbol.iterator](){yield*Object.entries(this.f.fields)}},MutationObserver:class{observe(){}},setTimeout:()=>0,clearTimeout(){},
   fetch:async(route,options={})=>{
    const body=options.body?JSON.parse(options.body):undefined;
    const r=await request(route,body);
    if(r.setCookie){cookie=/Max-Age=0/.test(r.setCookie)?'':r.setCookie.split(';')[0]}
    return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.data};
   }});
  vm.runInContext(readFileSync(new URL('../public/admin-users.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/init\(\);\s*$/,'globalThis.initializePanel=init;'),context);
  await context.initializePanel();return {get,form};
 }
 let ui=await boot();
 ui.get('username').value='ui_flow_ficticio';ui.get('password').value=temporary;
 await ui.get('login-form').onsubmit({preventDefault(){}});
 // The profile renderer starts asynchronously after authentication.
 await new Promise(r=>setTimeout(r,30));
 assert.equal(hash,'#admin-profile');assert.match(ui.get('content').innerHTML,/Debes cambiar la contraseña temporal/);
 const oldCookie=cookie;
 ui.form.fields={current_password:temporary,new_password:next,confirm:next};
 await ui.form.onsubmit({preventDefault(){},target:ui.form});
 await Promise.all(pending);ui={get:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)}};
 assert.equal((await request('/api/admin/identity',undefined,oldCookie)).status,401);
 assert.equal(ui.get('access').hidden,false);
 ui.get('username').value='ui_flow_ficticio';ui.get('password').value=next;
 await ui.get('login-form').onsubmit({preventDefault(){}});
 await new Promise(r=>setTimeout(r,30));
 assert.equal((await request('/api/admin/identity')).data.must_change_password,false);
 assert.equal((await request('/api/overview')).status,200);
 assert.equal(hash,'#dashboard','password form route must be cleared before relogin');
 assert.match(ui.get('content').innerHTML,/<h1>Dashboard<\/h1>/);
 assert.doesNotMatch(ui.get('content').innerHTML,/data-profile|Debes cambiar la contraseña temporal/);
 assert.equal(reloads,0,'password change should clear stale state and show login explicitly');
});
