import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {createPerudevsService} from '../server/perudevs-service.mjs';

test('PeruDevs cifra token, rechaza replay y cuenta errores de negocio sin exponer el token',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE history(event TEXT,detail TEXT)');
 db.exec(readFileSync(new URL('../database/migrations/002_perudevs_lookup.sql',import.meta.url),'utf8'));
 const environment={PERUDEVS_ENCRYPTION_KEY:'ab'.repeat(32),PANEL_WEB_SERVICE_SECRET:'test-only-service-secret-'.repeat(3)};
 let payload={estado:false,mensaje:'Token sin saldo'};
 const service=createPerudevsService({db,environment,fetchImpl:async()=>({ok:true,json:async()=>payload})});
 const configured=await service.admin('POST','/api/perudevs/config',{enabled:true,token:'TEST_ONLY_PROVIDER_TOKEN_12345678'});
 assert.equal(configured.status,200);
 assert.ok(!db.prepare('SELECT value FROM settings').get().value.includes('TEST_ONLY_PROVIDER_TOKEN'));
 const request=()=>{
  const body={document:'12345678',tenant_id:'11111111-1111-4111-8111-111111111111'},stamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(24).toString('hex');
  const canonical=['POST','/api/internal/perudevs/lookup','perudevs:lookup',stamp,nonce,createHash('sha256').update(JSON.stringify(body)).digest('hex')].join('\n');
  return [body,{headers:{'x-eduxfac-time':stamp,'x-eduxfac-nonce':nonce,'x-eduxfac-scope':'perudevs:lookup','x-eduxfac-signature':createHmac('sha256',environment.PANEL_WEB_SERVICE_SECRET).update(canonical).digest('hex')}}];
 };
 try{
  const r=request();assert.equal((await service.admin('POST','/api/internal/perudevs/lookup',...r)).status,502);
  assert.equal((await service.admin('POST','/api/internal/perudevs/lookup',...r)).status,409);
  payload={estado:false,mensaje:'No encontrado'};
  const missing=await service.admin('POST','/api/internal/perudevs/lookup',...request());assert.equal(missing.status,200);assert.equal(missing.data.found,false);
  payload={estado:true,resultado:{id:'12345678',nombre_completo:'PERSONA DE PRUEBA'}};
  const found=await service.admin('POST','/api/internal/perudevs/lookup',...request());assert.equal(found.data.client.tipo_doc,'DNI');
  const view=await service.admin('GET','/api/perudevs/config');assert.equal(view.data.usage.total,3);assert.equal(view.data.usage.errores,1);
  assert.ok(!JSON.stringify(view).includes('TEST_ONLY_PROVIDER_TOKEN'));
 }finally{db.close();}
});
