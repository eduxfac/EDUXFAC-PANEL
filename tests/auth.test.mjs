import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createPanel } from '../server/app.mjs';

test('Autenticación, aislamiento y persistencia local',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eduxfac-panel-test-'));
 const database=path.join(dir,'test.sqlite');
 let server=createPanel({database});
 const listen=async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
 let base=await listen();
 const request=async(url,body,cookie='',extra={})=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{}),...extra},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try {
  assert.equal((await request('/api/status')).data.setup,true);
  assert.equal((await request('/api/overview')).status,401);
  assert.equal((await request('/api/setup',{username:'owner',password:'Testing-only-42'},{},{Origin:'https://example.com'})).status,403);
  assert.equal((await request('/api/setup',{username:'owner',password:'short'})).status,400);
  assert.equal((await request('/api/setup',{username:'owner',password:'Testing-only-42'})).status,201);
  assert.equal((await request('/api/setup',{username:'owner',password:'Testing-only-42'})).status,409);
  assert.equal((await request('/api/login',{username:'owner',password:'incorrect'})).status,401);
  const login=await request('/api/login',{username:'owner',password:'Testing-only-42'});
  assert.equal(login.status,200);assert.ok(login.cookie);
  assert.equal((await request('/api/overview',null,login.cookie)).data.counts.clients,0);
  assert.equal((await request('/api/settings',{panel_name:'Mi panel de prueba'},login.cookie)).status,200);
  assert.equal((await request('/api/logout',{},login.cookie)).status,200);
  assert.equal((await request('/api/overview',null,login.cookie)).status,401);
  assert.equal((await request('/api/overview',null,'panel_session=inventado')).status,401);
  const badHost=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/status',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(badHost,403);
  await new Promise(resolve=>server.close(resolve));
  const inspect=new DatabaseSync(database);
  const admin=inspect.prepare('SELECT * FROM admin').get();assert.notEqual(admin.password_hash,'Testing-only-42');assert.ok(admin.password_hash.includes(':'));
  assert.equal(inspect.prepare('SELECT value FROM settings WHERE key=?').get('panel_name').value,'Mi panel de prueba');
  assert.equal(JSON.stringify(inspect.prepare('SELECT * FROM history').all()).includes('Testing-only-42'),false);inspect.close();
  server=createPanel({database});base=await listen();
  assert.equal((await request('/api/status')).data.setup,false);
  for(let i=0;i<9;i++)assert.equal((await request('/api/login',{username:'owner',password:'wrong'})).status,401);
  assert.equal((await request('/api/login',{username:'owner',password:'Testing-only-42'})).status,429);
 } finally {await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
