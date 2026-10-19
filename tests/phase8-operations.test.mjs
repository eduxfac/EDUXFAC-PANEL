import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync,readdirSync,statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot,F8_PASSWORD} from './helpers/sqlite-panel-snapshot.mjs';
import {createAdminReadService} from '../server/admin-read-service.mjs';
import {validateLab,runPhase8Tool} from '../server/phase8-tools.mjs';
import {verifyIsolatedSQLite} from '../server/sqlite-postgres-migrator.mjs';
process.env.NODE_ENV='test';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'tests/.fase8','operations_'+randomUUID().replaceAll('-',''));
mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'SOLO_PRUEBAS.json'),JSON.stringify({purpose:'FASE8_ISOLATED_PANEL'}));
const source=createSnapshot(path.join(directory,'ORIGEN_FICTICIO.sqlite'));
const env={NODE_ENV:'test',PANEL_F8_ISOLATED:'yes',PANEL_DATABASE_URL:'postgresql://eduxfac_migrator@127.0.0.1:5432/panel_f8_unused'};
const db=new DatabaseSync(source),read=createAdminReadService({db});test.after(()=>db.close());
for(const kind of ['licencias','equipos','activaciones','recuperacion']){
 test('paginación segura SQLite '+kind,()=>{const r=read.listing(kind,{page_size:'20'});assert.equal(r.status,200,r.data?.error);assert.ok(r.data.rows.length<=20);assert.equal(r.data.page_size,20);assert.ok(r.data.total>=1);assert.ok(!/password_hash|fingerprint_hash|client_token_hash|activation_hash/.test(JSON.stringify(r.data)));});
 test('búsqueda y límites '+kind,()=>{assert.equal(read.listing(kind,{search:'IMPOSSIBLE_F8',page_size:'20'}).data.total,0);assert.throws(()=>read.listing(kind,{page_size:'1000'}),e=>e.status===400);});
}
test('herramienta rechaza entorno no explícito',()=>assert.throws(()=>validateLab({...env,NODE_ENV:'production'},directory)));
test('herramienta rechaza servidor remoto',()=>assert.throws(()=>validateLab({...env,PANEL_DATABASE_URL:'postgresql://x@remote.invalid/panel_f8_unused'},directory)));
test('herramienta rechaza DB real aunque sea localhost',()=>assert.throws(()=>validateLab({...env,PANEL_DATABASE_URL:'postgresql://x@127.0.0.1/eduxfac_panel'},directory)));
test('herramienta rechaza directorio fuera laboratorio',()=>assert.throws(()=>validateLab(env,path.join(root,'data'))));
test('migrador rechaza SQLite real antes de abrirla',()=>assert.throws(()=>verifyIsolatedSQLite(path.join(root,'data/panel.sqlite'))));
test('adopción CLI conserva fuente y no abre DB',async()=>{const file=path.join(directory,'EMPRESAS_FICTICIAS.json'),input=[{empresa_id:randomUUID(),ruc:'20999999991',codigo:'FAKE_TOOL',usuarios:2,sucursales:1}];writeFileSync(file,JSON.stringify(input));const before=readFileSync(file);const r=await runPhase8Tool({mode:'adoption',directory,file,environment:env});assert.equal(r.result.aplicado,false);assert.deepEqual(readFileSync(file),before);});
test('rollback de código FASE 7 recupera operación en copia SQLite ficticia',async()=>{
 const previous=path.join(directory,'CODIGO_ANTERIOR'),backup=fileURLToPath(new URL('../../../03_RESPALDOS/FASE8_PRE_POSTGRES_20261012_1008/',import.meta.url));
 function copyCode(from,to){mkdirSync(to,{recursive:true});for(const entry of readdirSync(from,{withFileTypes:true})){const a=path.join(from,entry.name),b=path.join(to,entry.name);if(entry.isDirectory())copyCode(a,b);else copyFileSync(a,b);}}
 copyCode(path.join(root,'server'),path.join(previous,'server'));copyCode(path.join(root,'database'),path.join(previous,'database'));copyCode(path.join(root,'public'),path.join(previous,'public'));
 const manifest=JSON.parse(readFileSync(path.join(backup,'VERIFICACION_FASE8.json'),'utf8'));
 for(const entry of manifest.originals.filter(x=>/^(server|public)\//.test(x.path))){const a=path.join(backup,entry.path),b=path.join(previous,entry.path);assert.equal(createHash('sha256').update(readFileSync(a)).digest('hex'),entry.sha256);copyFileSync(a,b);}
 const restored=path.join(directory,'ROLLBACK_SQLITE_FICTICIO.sqlite');copyFileSync(source,restored);
 const {createPanel}=await import(pathToFileURL(path.join(previous,'server/app.mjs')));
 const server=createPanel({database:restored,workerEnvironment:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+server.address().port,r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner_f8',password:F8_PASSWORD})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const d=await fetch(origin+'/api/admin/dashboard',{headers:{Cookie:cookie}});assert.equal(d.status,200);assert.ok((await d.json()).metrics);writeFileSync(path.join(directory,'ROLLBACK_CODIGO.json'),JSON.stringify({purpose:'FASE8_ISOLATED_PANEL',codigo_pre_f8:true,sqlite_ficticia:true,login:'OK',dashboard:'OK',produccion:false}));}
 finally{await new Promise(r=>server.close(r));}
});
