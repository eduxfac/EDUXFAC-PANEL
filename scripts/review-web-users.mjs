// Local visual-review fixture. No UI changes; native PG16 synthetic data only.
import {randomUUID} from 'node:crypto';import {startNativeLab} from '../tests/helpers/native-user-lab.mjs';import {securitySchema} from '../tests/helpers/user-security-schema.mjs';import {createDedicatedUserAdministration} from '../integrations/web-user-management/database.mjs';
process.env.NODE_ENV='test';const {createPanel}=await import('../server/app.mjs');const lab=await startNativeLab();let server,service;
try{
 const f=await securitySchema(lab.admin),runtime=await lab.role('eduxfac_user_admin'),issuer=await lab.role('eduxfac_user_authorizer');
 const url=c=>'postgresql://'+encodeURIComponent(c.user)+':'+encodeURIComponent(c.connectionParameters.password)+'@127.0.0.1:'+lab.port+'/postgres';
 service=createDedicatedUserAdministration({environment:{WEB_USER_ADMIN_DATABASE_URL:url(runtime),WEB_USER_AUTHORIZER_DATABASE_URL:url(issuer)}});
 if(!process.argv.includes('--active'))await lab.admin.query("UPDATE public.empresa_acceso SET estado='PENDIENTE',estado_suscripcion='PENDIENTE' WHERE empresa_id=$1",[f.A]);
 const remote={listCompanyUsers:(id,options)=>service.list(id,options),resetCompanyUser:(...args)=>service.reset(...args)};
 const id=randomUUID();server=createPanel({database:':memory:',preparePhase8TestSchema:true,seedTestDatabase:p=>{const client=p.prepare("INSERT INTO clients(name,status) VALUES('Cliente sintético','ACTIVO')").run().lastInsertRowid;p.prepare('INSERT INTO web_empresas(id,cliente_id,razon_social,ruc,empresa_codigo,sucursal_nombre,administrador_nombre,administrador_usuario,commands_json,empresa_web_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,client,'Empresa sintética','99999999999','DEMO-USERS','Sintética','Demo','panel_demo','{}',f.A);},webApiClient:remote,dbEnvironment:{NODE_ENV:'test'},workerEnvironment:{INTEGRATION_WORKER_ENABLED:'false'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
 await post('/api/setup',{username:'panel_demo',password:'Synthetic-Panel!123'});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await new Promise(r=>server.close(r));await service.close();await lab.stop();};
 if(process.argv.includes('--smoke')){if((await fetch(base+'/web-users.js')).status!==200)throw Error('REVIEW_SMOKE_FAILED');await stop();console.log('SYNTHETIC_REVIEW_SMOKE=PASS');}
 else{console.log('REVIEW_URL='+base+'/#web-empresas/'+id+'/usuarios');console.log('SYNTHETIC_PANEL_LOGIN=panel_demo / Synthetic-Panel!123');process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));}
}catch(e){if(server)await new Promise(r=>server.close(r));if(service)await service.close();await lab.stop();throw e;}
