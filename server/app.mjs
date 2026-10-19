import {panelEnvironment} from './environment-mode.mjs';
import {boundedRequests} from './request-limits.mjs';
import {openPanelDatabase} from './db.mjs';
import {createAdminAuth,applyPanelRolesMigration} from './admin-auth.mjs';
import {applyAdminDashboardMigrations} from './admin-read-service.mjs';
import {createPanelRuntime} from './panel-runtime.mjs';
import {createAdminReadService} from './admin-read-service.mjs';
import {createIntegrationOperations} from './integration-operations.mjs';
import {applyIntegrationMigrations} from './integration-queue.mjs';
import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyLicensingMigrations, createLicensingService } from './licensing-service.mjs';
import {createWebOnboardingService,applyWebOnboardingMigrations} from './web-onboarding-service.mjs';

import {createWebCompanyStatesService,applyWebStateMigrations} from './web-company-states.mjs';
import {createWebPlansService,applyWebPlanMigrations} from './web-plans.mjs';
import {createWebSubscriptionsService,applyWebSubscriptionMigrations} from './web-subscriptions.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
function passwordHash(password) { const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(password,salt,64).toString('hex'); }
function passwordMatches(password, hash) { const [salt,key]=hash.split(':'); return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex')); }

export function createPanel({database=path.join(root,'data','panel.sqlite'),webApiClient,prepareWebTestSchema=false,prepareWebStateTestSchema=false,prepareWebPlanTestSchema=false,prepareWebSubscriptionTestSchema=false,prepareWebOperationTestSchema=false,workerEnvironment=process.env,dbEngine,dbEnvironment=process.env,preparePhase8TestSchema=false}={}) {
  if((prepareWebTestSchema||prepareWebStateTestSchema||prepareWebPlanTestSchema||prepareWebSubscriptionTestSchema||prepareWebOperationTestSchema||preparePhase8TestSchema)&&(process.env.NODE_ENV!=='test'||database!==':memory:'))throw Error('El esquema WEB de prueba solo se prepara en SQLite en memoria.');
  const engine=dbEngine||dbEnvironment.PANEL_DB_ENGINE||'sqlite';
  if(preparePhase8TestSchema&&engine!=='sqlite')throw Error('Esquema de prueba solo SQLite en memoria.');
  if(dbEnvironment.NODE_ENV==='production'&&engine!=='postgres')throw Error('Producción requiere PostgreSQL explícito.');
  let publicOrigin=null;if(dbEnvironment.NODE_ENV==='production'){publicOrigin=new URL(dbEnvironment.PANEL_PUBLIC_ORIGIN||'invalid');if(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password||publicOrigin.pathname!=='/'||publicOrigin.search||publicOrigin.hash)throw Error('Origen HTTPS de producción inválido.');}
  if(engine==='sqlite')mkdirSync(path.dirname(database),{recursive:true});
  const db=openPanelDatabase({engine,database,environment:dbEnvironment});
  if(dbEnvironment.EDUXFAC_DATA_MODE){if(!['DEMO','PILOTO','PRODUCCION'].includes(dbEnvironment.EDUXFAC_DATA_MODE)||engine!=='postgres')throw Error('PANEL_DATA_MODE_INVALID');let marker;try{marker=JSON.parse(db.prepare("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker").get().marker);}catch{}if(marker?.eduxfac_data_mode!==dbEnvironment.EDUXFAC_DATA_MODE){db.close();throw Error('PANEL_DATABASE_DATA_MODE_MISMATCH');}}

  db.exec(readFileSync(path.join(root,'database','schema.sql'),'utf8'));
  const dummy=passwordHash(randomBytes(32).toString('hex'));
  const audit=(event,detail)=>db.prepare('INSERT INTO history(event,detail) VALUES (?,?)').run(event,detail);
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  applyLicensingMigrations(db,path.join(root,'database','migrations'));
  if(prepareWebTestSchema||prepareWebStateTestSchema||prepareWebPlanTestSchema||prepareWebSubscriptionTestSchema||prepareWebOperationTestSchema||preparePhase8TestSchema)applyWebOnboardingMigrations(db);
  if(prepareWebStateTestSchema||prepareWebPlanTestSchema||prepareWebSubscriptionTestSchema||prepareWebOperationTestSchema||preparePhase8TestSchema)applyWebStateMigrations(db);
  if(prepareWebPlanTestSchema||prepareWebSubscriptionTestSchema||prepareWebOperationTestSchema||preparePhase8TestSchema)applyWebPlanMigrations(db);
  if(prepareWebSubscriptionTestSchema||prepareWebOperationTestSchema||preparePhase8TestSchema)applyWebSubscriptionMigrations(db);
  if(prepareWebOperationTestSchema||preparePhase8TestSchema)applyIntegrationMigrations(db);
  if(preparePhase8TestSchema){applyAdminDashboardMigrations(db);applyPanelRolesMigration(db);}
  const adminAuth=createAdminAuth({db,transaction,environment:dbEnvironment});
  const licensing=createLicensingService({db,transaction,audit});
  const subscriptionService=createWebSubscriptionsService({db,transaction,webApiClient});
  const commercialService=createWebPlansService({db,transaction,webApiClient,subscriptionService});
  const stateService=createWebCompanyStatesService({db,transaction,webApiClient,subscriptionService});
  const web=createWebOnboardingService({db,transaction,audit,webApiClient,commercialService,subscriptionService});
  const operations=createIntegrationOperations({db,transaction,webApiClient,stateService,commercialService,subscriptionService,environment:workerEnvironment});
  const adminRead=createAdminReadService({db,config:operations.config});
  const runtime=createPanelRuntime({db,transaction,auth:adminAuth,operations});
  const recoveryLimit=boundedRequests({max:30});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');if(publicOrigin&&dbEnvironment.PANEL_HSTS_ENABLED==='true')res.setHeader('Strict-Transport-Security','max-age=31536000');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const port=server.address().port;
    const allowedHosts=publicOrigin?[publicOrigin.host]:[`127.0.0.1:${port}`,`localhost:${port}`,`192.168.1.3:${port}`];
    if(!allowedHosts.includes(req.headers.host))return send(res,403,{error:'Origen no autorizado.'});
    const expectedOrigin=publicOrigin?publicOrigin.origin:'http://'+req.headers.host;
    const url=new URL(req.url,expectedOrigin);
    if(req.method==='POST'&&url.pathname.startsWith('/api/admin/recovery/')&&!recoveryLimit(req.socket.remoteAddress))return send(res,429,{error:'Demasiadas revisiones. Reintenta más tarde.'});
    try {
      if(req.method==='GET' && !url.pathname.startsWith('/api/')) {
        const files={'/admin-users.js':['admin-users.js','text/javascript'],'/admin-dashboard.js':['admin-dashboard.js','text/javascript'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/web-onboarding.js':['web-onboarding.js','text/javascript'],'/web-company-states.js':['web-company-states.js','text/javascript'],'/web-plans.js':['web-plans.js','text/javascript'],'/web-subscriptions.js':['web-subscriptions.js','text/javascript'],'/integration-operations.js':['integration-operations.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
        const file=files[url.pathname];if(!file)return send(res,404,{error:'No encontrado.'});
        res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8'});return res.end(readFileSync(path.join(root,'public',file[0])));
      }
      let body={};
      if(req.method==='POST') {
        if(req.headers.origin!==expectedOrigin || !req.headers['content-type']?.startsWith('application/json'))return send(res,403,{error:'Solicitud no autorizada.'});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return send(res,413,{error:'Solicitud demasiado grande.'});}
        try{body=JSON.parse(raw||'{}');}catch{return send(res,400,{error:'Datos inválidos.'});}
        if(!body || typeof body!=='object' || Array.isArray(body))return send(res,400,{error:'Datos inválidos.'});
      }
      if(req.method==='GET' && url.pathname==='/api/environment')return send(res,200,panelEnvironment(dbEnvironment));
      if(req.method==='GET' && url.pathname==='/api/status')return send(res,200,{setup:!(adminAuth.enabled?db.prepare('SELECT id FROM panel_admin_users LIMIT 1').get():db.prepare('SELECT id FROM admin').get())});
      if(req.method==='POST' && ['/api/setup','/api/login'].includes(url.pathname)) {
        if(adminAuth.enabled){const r=adminAuth.publicLogin(url.pathname,body,req.socket.remoteAddress||'loopback');if(r.cookie)res.setHeader('Set-Cookie',r.cookie);return send(res,r.status,r.data);}
        const setup=url.pathname==='/api/setup';
        const admin=db.prepare('SELECT * FROM admin').get();
        if(setup && admin)return send(res,409,{error:'El administrador ya fue creado.'});
        const now=Date.now();db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(now-15*60*1000);
        if(db.prepare('SELECT COUNT(*) n FROM login_attempts').get().n>=10)return send(res,429,{error:'Demasiados intentos. Espera 15 minutos.'});
        const username=typeof body.username==='string'?body.username.trim():'';
        const password=typeof body.password==='string'?body.password:'';
        if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username)||password.length>256)return send(res,400,{error:'Usuario inválido o contraseña demasiado larga.'});
        if(setup){
          if(password.length<12)return send(res,400,{error:'Usa una contraseña de al menos 12 caracteres.'});
          const hash=passwordHash(password);
          transaction(()=>{db.prepare('INSERT INTO admin(id,username,password_hash) VALUES (1,?,?)').run(username,hash);audit('ADMIN_CREADO','Administrador local configurado.');});
          return send(res,201,{ok:true});
        }
        const matches=passwordMatches(password,admin?.password_hash||dummy);
        if(!admin||admin.username!==username||!matches){db.prepare('INSERT INTO login_attempts(attempted_at) VALUES (?)').run(now);return send(res,401,{error:'Usuario o contraseña incorrectos.'});}
        const token=randomBytes(32).toString('hex');
        transaction(()=>{db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token),now+8*60*60*1000);audit('INICIO_SESION','Acceso del administrador local.');});
        res.setHeader('Set-Cookie',`panel_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return send(res,200,{ok:true});
      }
      if(url.pathname.startsWith('/api/license/')){
        const result=licensing.publicApi(req.method,url.pathname,body,Object.fromEntries(url.searchParams));
        if(result)return send(res,result.status,result.data||{error:result.error});
      }
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('panel_session='))?.slice(14)||'';
      const principal=adminAuth.enabled?adminAuth.authenticate(token):token&&db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token),Date.now())?{id:1,username:db.prepare('SELECT username FROM admin').get().username,role:'SUPERADMIN',permissions:[],legacy:true}:null;
      if(!principal)return send(res,401,{error:'Inicia sesión para continuar.'});
      if(!adminAuth.authorize(principal,req.method,url.pathname))return send(res,403,{error:'No tienes permiso para esta acción.'});
      if(adminAuth.enabled){const authResult=adminAuth.handle(principal,req.method,url.pathname,body,token);if(authResult){if(authResult.cookie)res.setHeader('Set-Cookie',authResult.cookie);return send(res,authResult.status,authResult.data);}const technical=runtime.handle(principal,req.method,url.pathname,body);if(technical)return send(res,technical.status,technical.data);}
      if(url.pathname.startsWith('/api/admin/')){const r=adminRead.handle(req.method,url.pathname,Object.fromEntries(url.searchParams));return send(res,r.status,r.data);}
      if(url.pathname==='/api/web/operacion'||url.pathname.startsWith('/api/web/operacion/')){const actor=principal.username;const r=await operations.handle(req.method,url.pathname,body,Object.fromEntries(url.searchParams),actor);return send(res,r.status,r.data);}
      if(url.pathname==='/api/web/suscripciones'||url.pathname.startsWith('/api/web/suscripciones/')){const actor=principal.username;const r=await subscriptionService.handle(req.method,url.pathname,body,Object.fromEntries(url.searchParams),actor);return send(res,r.status,r.data);}
      if(url.pathname.startsWith('/api/web/comercial/')){const administrator=principal.username;const result=await commercialService.handle(req.method,url.pathname,body,Object.fromEntries(url.searchParams),administrator);return send(res,result.status,result.data);}
      if(url.pathname.startsWith('/api/web/estados/')){const administrator=principal.username;const result=await stateService.handle(req.method,url.pathname,body,Object.fromEntries(url.searchParams),administrator);return send(res,result.status,result.data);}
      if(url.pathname.startsWith('/api/web/')){const result=await web.handle(req.method,url.pathname,body,Object.fromEntries(url.searchParams));return send(res,result.status,result.data);}
      if(req.method==='POST' && url.pathname==='/api/logout'){
        transaction(()=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));audit('CIERRE_SESION','Sesión cerrada.');});
        res.setHeader('Set-Cookie','panel_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});
      }
      if(req.method==='GET' && url.pathname==='/api/overview') {
        const counts={};for(const table of ['clients','licenses','authorized_devices','activations','recovery_requests'])counts[table]=db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
        return send(res,200,{username:principal.username,role:principal.role,permissions:adminAuth.enabled?principal.permissions:undefined,rbac:adminAuth.enabled,must_change_password:principal.must_change_password||false,counts,history:db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 50').all(),settings:Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(x=>[x.key,x.value]))});
      }
      if(req.method==='POST' && url.pathname==='/api/settings'){
        const name=typeof body.panel_name==='string'?body.panel_name.trim():'';
        if(!name||name.length>80)return send(res,400,{error:'El nombre debe tener entre 1 y 80 caracteres.'});
        transaction(()=>{db.prepare('UPDATE settings SET value=? WHERE key=?').run(name,'panel_name');audit('CONFIGURACION','Nombre del panel actualizado.');});return send(res,200,{ok:true});
      }
      if(url.pathname.startsWith('/api/clients')||url.pathname.startsWith('/api/licenses')||url.pathname.startsWith('/api/installations')||url.pathname==='/api/license-events'){
        const administrator=principal.username;
        const result=licensing.adminApi(req.method,url.pathname,body,Object.fromEntries(url.searchParams),administrator);
        if(result){const safe=adminAuth.enabled&&req.method==='GET'?JSON.parse(JSON.stringify(result.data||{error:result.error}),(key,value)=>['password_hash','fingerprint_hash','client_token_hash','activation_hash'].includes(key)?undefined:value):result.data||{error:result.error};return send(res,result.status,safe);}
      }
      return send(res,404,{error:'Operación no disponible en esta etapa.'});
    }catch(error){console.error('Error local:',error.code||error.name);if(!res.headersSent)send(res,500,{error:'No se pudo completar la operación.'});else res.end();}
  });
  server.once('listening',()=>operations.start());
  const normalClose=server.close.bind(server);server.close=callback=>{void operations.stop().then(()=>normalClose(callback));return server;};
  server.on('close',()=>db.close());return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createPanel();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'El puerto 4310 está ocupado. No se detuvo ningún otro servicio.':error.message);process.exitCode=1;});
  const port=Number(process.env.PORT||4310);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto PANEL inválido.');
  server.listen(port,'127.0.0.1',()=>console.log('EDUXFAC_PANEL_ADMIN_LISTO'));
  const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
