import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {parseHTML} from 'linkedom';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {createResetLimiter} from '../integrations/web-user-management/rate-limit.mjs';
test('UI Usuarios: diagnóstico, modal, copiar y borrado al cerrar/navegar',async()=>{
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');const company=randomUUID(),user=randomUUID();let copied='',requests=0;
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};window.panelCan=()=>true;
 const row={user_id:user,usuario:'demo_ui',nombre:'<script>synthetic</script>',activo:true,debe_cambiar_password:false,sucursales:[{sucursal_id:randomUUID(),nombre:'Demo Branch',activo:true,rol:'Administrador'}],roles:['Administrador'],empresa_estado:'PENDIENTE',suscripcion_estado:'PENDIENTE',login_ready:false,reasons:['COMPANY_PENDING','SUBSCRIPTION_PENDING']};
 const sandbox={window,document,crypto:{randomUUID},confirm:()=>true,navigator:{clipboard:{writeText:async p=>{copied=p;}}},fetch:async(url,options)=>{requests++;return {ok:true,json:async()=>options.method==='POST'?{usuario:'demo_ui',temporary_password:'SyntheticUI!123'}:{empresa:{estado:'PENDIENTE',estado_suscripcion:'PENDIENTE'},razon_social:'Empresa demo',ruc:'99999999999',users:[row]}};}};
 vm.runInNewContext(readFileSync(new URL('../public/web-users.js',import.meta.url),'utf8'),sandbox);
 const root=document.getElementById('root');await window.panelWebUsers.render(root,'',{companyId:company});
 assert.ok(root.textContent.includes('BLOQUEADO'));assert.ok(root.textContent.includes('Empresa pendiente'));assert.equal(root.querySelector('script'),null);assert.equal(root.querySelectorAll('[aria-label="Detalle de empresa"] a').length,5);
 await root.querySelector('[data-reset]').onclick();const dialog=document.querySelector('dialog');assert.equal(dialog.querySelector('output').textContent,'SyntheticUI!123');
 await dialog.querySelector('[data-copy]').onclick();assert.equal(copied,'SyntheticUI!123');dialog.querySelector('[data-close]').onclick();assert.equal(document.querySelector('dialog'),null);assert.equal(dialog.querySelector('output').textContent,'');
 await root.querySelector('[data-reset]').onclick();const second=document.querySelector('dialog');window.panelWebUsers.cancel();assert.equal(document.querySelector('dialog'),null);assert.equal(second.querySelector('output').textContent,'');assert.equal(requests,3);
});
test('Limitador WEB acota resets por empresa y actor',()=>{
 let time=0,allowed=0;const limiter=createResetLimiter({now:()=>time,max:1,windowMs:1000}),req={params:{company:'demo'},body:{actor:'admin_demo'}};let status;const res={status:v=>{status=v;return res;},json:()=>{}};
 limiter(req,res,()=>allowed++);limiter(req,res,()=>allowed++);assert.equal(allowed,1);assert.equal(status,429);time=1001;limiter(req,res,()=>allowed++);assert.equal(allowed,2);
});
