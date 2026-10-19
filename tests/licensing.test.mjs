import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { createPanel } from '../server/app.mjs';
import { signLicense, verifyLicense } from '../server/license-crypto.mjs';

const fingerprint=seed=>seed.repeat(64).slice(0,64);
test('Licencias: una PC activa, reemplazo, bloqueo, historial y firma',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'eduxfac-license-'));const database=path.join(dir,'panel.sqlite');const server=createPanel({database});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(route,body,cookie='')=>new Promise((resolve,reject)=>{const raw=body===undefined?'':JSON.stringify(body);const req=http.request(base+route,{method:body===undefined?'GET':'POST',headers:{Host:new URL(base).host,Origin:base,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),Cookie:cookie}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text||'{}'),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]||cookie}));});req.on('error',reject);req.end(raw);});
 try{
  await request('/api/setup',{username:'owner',password:'Testing-only-42'});const login=await request('/api/login',{username:'owner',password:'Testing-only-42'});const cookie=login.cookie;
  const client=await request('/api/clients',{name:'Ana Prueba',business_name:'Botica Ficticia',ruc:'20999999991',phone:'999000111'},cookie);assert.equal(client.status,201);
  const license=await request('/api/licenses',{client_id:client.data.id,purchased_at:'2026-09-26'},cookie);assert.equal(license.status,201);assert.match(license.data.reference,/^EDUX-\d{6}$/);
  const token1='token-prueba-pc-01-1234567890';const pc1=await request('/api/license/activation-request',{license_code:license.data.reference,activation_code:license.data.activation_code,installation_code:'EDX-PC-01',device_name:'PC-01',fingerprint_hash:fingerprint('a'),client_token:token1});assert.equal(pc1.status,202);
  let installs=await request('/api/installations',undefined,cookie);const pc1id=installs.data.rows.find(x=>x.installation_id==='EDX-PC-01').id;assert.equal((await request(`/api/installations/${pc1id}/activate`,{},cookie)).status,200);
  const token2='token-prueba-pc-02-1234567890';const blockedSecond=await request('/api/license/activation-request',{license_code:license.data.reference,activation_code:license.data.activation_code,installation_code:'EDX-PC-02',device_name:'PC-02',fingerprint_hash:fingerprint('b'),client_token:token2});assert.equal(blockedSecond.status,409);
  assert.equal((await request(`/api/licenses/${license.data.id}/replace`,{reason:'Equipo ficticio dañado'},cookie)).status,200);
  assert.equal((await request('/api/license/activation-request',{license_code:license.data.reference,activation_code:license.data.activation_code,installation_code:'EDX-PC-02',device_name:'PC-02',fingerprint_hash:fingerprint('b'),client_token:token2})).status,202);
  installs=await request('/api/installations',undefined,cookie);const pc2id=installs.data.rows.find(x=>x.installation_id==='EDX-PC-02').id;assert.equal((await request(`/api/installations/${pc2id}/activate`,{},cookie)).status,200);
  assert.equal((await request(`/api/installations/${pc2id}/block`,{reason:'Prueba de bloqueo'},cookie)).status,200);const validation=await request('/api/license/installations/EDX-PC-02/validate',{client_token:token2,fingerprint_hash:fingerprint('b')});assert.equal(validation.data.status,'BLOQUEADA');assert.equal((await request(`/api/installations/${pc2id}/unblock`,{},cookie)).status,200);
  const history=await request(`/api/licenses/${license.data.id}/history`,undefined,cookie);assert.equal(history.data.devices.length,2);assert.ok(history.data.devices.some(x=>x.installation_id==='EDX-PC-01'&&x.status==='REEMPLAZADA'));
  const keys=generateKeyPairSync('ed25519');const signed=signLicense({license:'EDUX-TEST',machine:'hash'},{privateKey:keys.privateKey});assert.equal(verifyLicense(signed,{publicKey:keys.publicKey}),true);signed.payload.machine='alterado';assert.equal(verifyLicense(signed,{publicKey:keys.publicKey}),false);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
