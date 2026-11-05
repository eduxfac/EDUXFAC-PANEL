import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function fixture(){
 const nodes=new Map(),calls=[];let slow=null,release=null;
 const get=id=>{if(!nodes.has(id)){const fields=new Map();const element={value:id==='cpeEnvironment'?'beta':'',checked:false,textContent:'',className:'',_html:'',elements:new Proxy({}, {get:(_,name)=>{if(!fields.has(name))fields.set(name,{value:'',checked:false});return fields.get(name);}}),querySelector:s=>get(s.replace(/^#/,'')),querySelectorAll:()=>[],scrollIntoView(){}};
 Object.defineProperty(element,'innerHTML',{get(){return this._html;},set(v){this._html=v;if(id==='cpeBranch'){this.value=(v.match(/value="([^"]+)"/)||[])[1]||'';}if(id==='cpeBody')for(const key of ['cpeConfig','cpeCertificate','cpeSeries'])nodes.delete(key);}});nodes.set(id,element);}return nodes.get(id);};
 const target=get('target');const context={window:{panelCan:()=>true,CpeBatches:{render:async()=>{}}},URLSearchParams,console,FormData:class{constructor(form){this.form=form;}get(key){return this.form.elements[key].value;}has(key){return this.form.elements[key].checked;}},fetch:async(path,options={})=>{
 calls.push({path,body:options.body?JSON.parse(options.body):null});
 if(path==='/api/sunat/empresas')return {ok:true,json:async()=>({rows:[{id:A,razon_social:'Empresa Alfa',ruc:'20111111111',empresa_codigo:'ALFA'},{id:B,razon_social:'Empresa Beta',ruc:'20222222222',empresa_codigo:'BETA'}]})};
 const [route,search]=path.split('?'),q=new URLSearchParams(search),company=route.includes(A)?A:B;
 if(route.endsWith('/branches'))return {ok:true,json:async()=>({rows:[{id:'branch-1',nombre:'Principal'},{id:'branch-2',nombre:'Secundaria'}]})};
 if(route.endsWith('/configuration')&&!options.body){if(slow===q.get('branch_id')+':'+q.get('environment'))await new Promise(r=>release=r);return {ok:true,json:async()=>({config:{ruc:company===A?'20111111111':'20222222222',razon_social:q.get('branch_id')+'-'+q.get('environment')},web_settings:{serie_factura:company===A?'F111':'F222',serie_boleta:'B001'},credentials_configured:false,certificate:null})};}
 return {ok:true,json:async()=>route.endsWith('/series')||route.endsWith('/documents')?{rows:[]}:{ok:true}};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/sunat.js',import.meta.url),'utf8'),context);
 return {get,target,calls,app:context.window.panelSunat,delay:key=>slow=key,release:()=>release()};
}
test('Facturación se abre con empresa fija; no adopta otra ni muestra selector global',async()=>{
 const f=fixture();await f.app.render(f.target,'',{companyId:A});assert.match(f.get('cpeIdentity').innerHTML,/Empresa Alfa/);assert.doesNotMatch(f.get('cpeIdentity').innerHTML,/Empresa Beta/);assert.equal(f.get('cpeCompany').value,A);assert.equal(f.get('cpeConfig').elements.invoice_series.value,'F111');assert.ok(f.calls.filter(c=>c.path!=='/api/sunat/empresas').every(c=>c.path.includes(A)));
 await f.app.render(f.target,'',{companyId:B});assert.match(f.get('cpeIdentity').innerHTML,/Empresa Beta/);assert.equal(f.get('cpeConfig').elements.invoice_series.value,'F222');assert.doesNotMatch(f.target.innerHTML,/<select id="cpeCompany"/);
 const before=f.calls.length;await f.app.render(f.target,'',{companyId:'inexistente'});assert.match(f.get('cpeMessage').textContent,/Empresa no disponible/);assert.equal(f.calls.length,before+1,'Empresa inválida no consulta ni edita la primera de la lista');
});
test('Respuesta atrasada de otra sucursal/ambiente no reemplaza el formulario actual',async()=>{
 const f=fixture();await f.app.render(f.target,'',{companyId:A});f.delay('branch-2:beta');f.get('cpeBranch').value='branch-2';const first=f.get('cpeBranch').onchange();await new Promise(r=>setImmediate(r));f.get('cpeEnvironment').value='produccion';await f.get('cpeEnvironment').onchange();assert.match(f.get('cpeBody').innerHTML,/branch-2-produccion/);f.release();await first;assert.match(f.get('cpeBody').innerHTML,/branch-2-produccion/);assert.doesNotMatch(f.get('cpeBody').innerHTML,/branch-2-beta/);
 const form=f.get('cpeSeries');form.dataset={type:'01'};f.get('cpeSeriesDialog').close=()=>{};form.elements.serie.value='F900';form.elements.last_number.value='0';form.elements.enabled.checked=true;await form.onsubmit({preventDefault(){},target:form});const write=f.calls.find(c=>c.path.endsWith('/series')&&c.body);assert.equal(write.body.branch_id,'branch-2');assert.equal(write.body.environment,'produccion');assert.ok(write.path.includes(A));
});
test('Listado ofrece facturación por fila y navegación no ofrece configuración global',()=>{
 const dashboard=readFileSync(new URL('../public/admin-dashboard.js',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.match(dashboard,/data-company-fiscal/);assert.match(dashboard,/#web-empresas\//);assert.match(app,/fiscalRoute/);assert.doesNotMatch(app,/const modules=\[\['sunat'/);
});
