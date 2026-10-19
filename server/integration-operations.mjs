import {randomUUID} from 'node:crypto';
import {createWebApiClient} from './web-api-client.mjs';
import {workerConfiguration} from './integration-config.mjs';
import {hasIntegrationSchema,captureLegacyCommands,sourceTables,claimDispatch,finishDispatch,withQueueLease,safeError,operationalLog} from './integration-queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const instant=v=>v?new Date(v).toISOString():null;
const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
export function createIntegrationOperations({db,transaction,webApiClient,stateService,commercialService,subscriptionService,environment=process.env,clock=()=>Date.now(),schedule=setInterval,unschedule=clearInterval}){
 const config=workerConfiguration(environment),owner=randomUUID(),remote=()=>webApiClient||createWebApiClient(),timers=[],running=new Set();let halted=false;
 const ready=()=>{if(!hasIntegrationSchema(db))throw fail(503,'ESQUEMA_OPERACION_PENDIENTE','Falta aplicar explícitamente la migración local Fase 6.');};
 if(hasIntegrationSchema(db))db.prepare("UPDATE integration_settings SET value=? WHERE key='max_intentos'").run(config.maxAttempts);
 if(hasIntegrationSchema(db))captureLegacyCommands(db,clock());
 const company=id=>{if(!uuid.test(String(id)))throw fail(400,'EMPRESA_INVALIDA','Empresa inválida.');const c=db.prepare('SELECT w.*,c.name cliente_nombre FROM web_empresas w JOIN clients c ON c.id=w.cliente_id WHERE w.id=?').get(id);if(!c)throw fail(404,'EMPRESA_NO_EXISTE','Empresa no encontrada.');return c;};
 const queuePublic=q=>{const {payload_seguro,lease_owner,lease_until,...r}=q;return {...r,ultimo_error:q.ultimo_error?safeError(q.ultimo_error):null,proximo_reintento:q.proximo_reintento?new Date(q.proximo_reintento).toISOString():null,agotado:q.estado==='ERROR'&&q.intentos>=q.max_intentos};};
 const queue=()=>{captureLegacyCommands(db,clock());return db.prepare('SELECT q.*,w.razon_social FROM integration_queue q JOIN web_empresas w ON w.id=q.empresa_id ORDER BY q.updated_at DESC,q.command_id').all();};
 function localSnapshot(id){
  const c=company(id),a=db.prepare('SELECT * FROM web_company_conditions WHERE empresa_id=?').get(id),s=db.prepare('SELECT * FROM web_subscriptions WHERE empresa_id=?').get(id);
  return {empresa_id:c.empresa_web_id,estado_empresa:c.estado_local||c.estado,auth_version:c.web_auth_version?String(c.web_auth_version):null,plan_codigo:a?.plan_codigo||null,limite_sucursales:a?.limite_sucursales_asignado??null,limite_usuarios:a?.limite_usuarios_asignado??null,multisucursal:!!a?.multisucursal,version_condiciones:a?String(a.version_condiciones):'0',suscripcion_id:s?.id||null,estado_suscripcion:s?.estado||'PENDIENTE',fecha_inicio:instant(s?.fecha_inicio),fecha_vencimiento:instant(s?.fecha_vencimiento),version_suscripcion:s?String(s.version_web):'0'};
 }
 function remoteSnapshot(s,id){
  if(!s||s.empresa_id!==id||!['PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO'].includes(s.estado_empresa)||!/^\d+$/.test(String(s.auth_version))||s.suscripcion?.empresa_id!==id||s.condiciones?.empresa_id!==id||!/^\d+$/.test(String(s.suscripcion.version_suscripcion))||!/^\d+$/.test(String(s.condiciones.version_condiciones)))throw fail(502,'RESPUESTA_INVALIDA','Snapshot WEB inválido.');
  const a=s.condiciones,x=s.suscripcion;
  return {empresa_id:id,estado_empresa:s.estado_empresa,auth_version:String(s.auth_version),plan_codigo:a.plan_codigo,limite_sucursales:a.limite_sucursales,limite_usuarios:a.limite_usuarios,multisucursal:!!a.multisucursal,version_condiciones:String(a.version_condiciones),suscripcion_id:x.suscripcion_id,estado_suscripcion:x.estado,fecha_inicio:instant(x.fecha_inicio),fecha_vencimiento:instant(x.fecha_vencimiento),version_suscripcion:String(x.version_suscripcion)};
 }
 const differences=(a,b)=>Object.keys(a).filter(k=>a[k]!==b[k]);
 async function checkHealth(){
  ready();const cached=db.prepare("SELECT * FROM integration_health WHERE id='WEB'").get(),now=clock();if(cached&&now-cached.checked_ms<60000)return cached;
  const start=Date.now();let state='ONLINE',error=null;
  try{const r=await remote().health();if(r?.ok!==true||r.service!=='eduxfac-web-admin')throw fail(502,'WEB_HEALTH_INVALIDO','Health inválido.');}
  catch(e){state=e.status?'ERROR':'OFFLINE';error=e.status?safeError(e):'WEB_OFFLINE';}
  const latency=Math.max(0,Date.now()-start);
  transaction(()=>{db.prepare("INSERT INTO integration_health(id,estado,checked_ms,latencia_ms,ultimo_error) VALUES('WEB',?,?,?,?) ON CONFLICT(id) DO UPDATE SET estado=excluded.estado,checked_ms=excluded.checked_ms,latencia_ms=excluded.latencia_ms,ultimo_error=excluded.ultimo_error,checked_at=CURRENT_TIMESTAMP").run(state,now,latency,error);operationalLog(db,{action:'HEALTH',state,duration:latency,result:state==='ONLINE'?'OK':'ERROR',error});});
  return db.prepare("SELECT * FROM integration_health WHERE id='WEB'").get();
 }
 async function retryCommand(command,{manual=false,administrator='worker-local',reason='Reintento operativo',health=null}={}){
  ready();captureLegacyCommands(db,clock());const q=db.prepare('SELECT * FROM integration_queue WHERE command_id=?').get(command);if(!q)throw fail(404,'COMANDO_NO_EXISTE','Comando no encontrado.');
  if(q.estado==='APLICADO')return {status:200,data:{comando:queuePublic(q),replayed:true}};
  const lease=claimDispatch(db,command,{owner,now:clock(),manual});let override=null;
  try{
   if(health&&health.estado!=='ONLINE'){override={state:'ERROR',retryable:true,error:'WEB_OFFLINE'};return {status:502,data:{error:'WEB no está disponible.',code:'WEB_OFFLINE'}};}
   const service={ESTADOS:stateService,COMERCIAL:commercialService,SUSCRIPCIONES:subscriptionService}[q.origen],prefix={ESTADOS:'/api/web/estados/empresas/',COMERCIAL:'/api/web/comercial/empresas/',SUSCRIPCIONES:'/api/web/suscripciones/'}[q.origen];
   const result=await withQueueLease(owner,()=>service.handle('POST',prefix+q.empresa_id+'/reintentar',{command_id:command},{},administrator));
   if(result.status!==200&&db.prepare('SELECT estado FROM integration_queue WHERE command_id=?').get(command).estado!=='ERROR')override={state:'ERROR',retryable:result.status>=500,error:safeError(result.data?.code)};
   return result;
  }catch(e){override={state:'ERROR',retryable:!(e.status>=400&&e.status<500),error:safeError(e)};throw e;}
  finally{
   finishDispatch(db,lease,{now:clock(),override});
   if(manual)db.prepare('INSERT INTO history(event,detail) VALUES(?,?)').run('REINTENTO_OPERATIVO',JSON.stringify({command_id:command,empresa_id:q.empresa_id,administrador:administrator,motivo:reason}));
  }
 }
 function knownExpiry(local,web,raw,diff){
  if(!local.suscripcion_id||local.estado_suscripcion!=='ACTIVA'||web.estado_suscripcion!=='VENCIDA'||Date.parse(web.fecha_vencimiento)>clock()||web.suscripcion_id!==local.suscripcion_id||web.fecha_vencimiento!==local.fecha_vencimiento||BigInt(web.version_suscripcion)!==BigInt(local.version_suscripcion)+1n||local.auth_version===null||BigInt(web.auth_version)!==BigInt(local.auth_version)+1n)return false;
  if(diff.some(k=>!['estado_empresa','auth_version','estado_suscripcion','version_suscripcion'].includes(k)))return false;
  if(web.estado_empresa!==(local.estado_empresa==='ACTIVO'?'VENCIDO':local.estado_empresa))return false;
  return raw.vencimientos?.some(e=>uuid.test(String(e.command_id))&&e.evento==='VENCIMIENTO'&&e.estado_anterior==='ACTIVA'&&e.estado_nuevo==='VENCIDA'&&instant(e.fecha_vencimiento_anterior)===local.fecha_vencimiento&&instant(e.fecha_vencimiento_nueva)===local.fecha_vencimiento);
 }
 async function reconcile(id,{recover=true,administrator='worker-local',reason='Conciliación operativa'}={}){
  ready();captureLegacyCommands(db,clock());const c=company(id);if(!c.empresa_web_id)throw fail(409,'ALTA_INCOMPLETA','Completa la referencia WEB antes de conciliar.');
  const start=Date.now();let local=localSnapshot(id),web=null,diff=[],state='ERROR',error=null;
  try{
   let pending=db.prepare("SELECT * FROM integration_queue WHERE empresa_id=? AND estado NOT IN('APLICADO','CANCELADO') ORDER BY created_at LIMIT 1").get(id);
   let raw=await remote().operacion(c.empresa_web_id,pending?.command_id),flat=remoteSnapshot(raw,c.empresa_web_id);
   if(pending&&recover&&pending.retryable&&pending.intentos<pending.max_intentos&&(!pending.proximo_reintento||pending.proximo_reintento<=clock())&&(!pending.lease_until||pending.lease_until<=clock())){
    // Consulta y reintento idempotente conservan el comando; no se inventa una corrección.
    await retryCommand(pending.command_id,{manual:false,administrator,reason});
    local=localSnapshot(id);raw=await remote().operacion(c.empresa_web_id,pending.command_id);flat=remoteSnapshot(raw,c.empresa_web_id);
    pending=db.prepare("SELECT * FROM integration_queue WHERE empresa_id=? AND estado NOT IN('APLICADO','CANCELADO') ORDER BY created_at LIMIT 1").get(id);
   }
   web=flat;diff=differences(local,web);
   if(!pending&&recover&&knownExpiry(local,web,raw,diff)){
    await subscriptionService.observe(id);
    transaction(()=>db.prepare('UPDATE web_empresas SET estado_local=?,estado_web=?,web_auth_version=?,ultima_sincronizacion=CURRENT_TIMESTAMP WHERE id=?').run(web.estado_empresa,web.estado_empresa,web.auth_version,id));
    local=localSnapshot(id);diff=differences(local,web);
   }
   state=pending?(pending.estado==='ERROR'&&(!pending.retryable||pending.intentos>=pending.max_intentos)?'ERROR':'PENDIENTE'):diff.length?'DESINCRONIZADO':'SINCRONIZADO';
   if(state==='DESINCRONIZADO')error='CONFLICTO_AMBIGUO';
   else if(pending?.estado==='ERROR')error=pending.intentos>=pending.max_intentos?'REINTENTOS_AGOTADOS':safeError(pending.ultimo_error);
  }catch(e){error=safeError(e);state='ERROR';}
  transaction(()=>{
   db.prepare('INSERT INTO integration_reconciliation(empresa_id,estado,diferencias_json,local_json,web_json,ultimo_error) VALUES(?,?,?,?,?,?) ON CONFLICT(empresa_id) DO UPDATE SET estado=excluded.estado,diferencias_json=excluded.diferencias_json,local_json=excluded.local_json,web_json=excluded.web_json,ultimo_error=excluded.ultimo_error,checked_at=CURRENT_TIMESTAMP').run(id,state,JSON.stringify(diff),JSON.stringify(local),web?JSON.stringify(web):null,error);
   operationalLog(db,{company:id,action:recover?'CONCILIAR':'CONSULTAR',state,duration:Date.now()-start,result:state==='ERROR'?'ERROR':'OK',error});
   if(administrator!=='worker-local')db.prepare('INSERT INTO history(event,detail) VALUES(?,?)').run('CONCILIACION_OPERATIVA',JSON.stringify({empresa_id:id,administrador:administrator,motivo:reason,estado:state}));
  });return {empresa_id:id,estado:state,diferencias:diff,local,web,error};
 }
 function upcoming({window=30,now=clock()}={}){
  if(![0,7,15,30].includes(Number(window)))throw fail(400,'FILTRO_INVALIDO','Ventanas permitidas: hoy, 7, 15 y 30 días.');
  const rows=db.prepare('SELECT s.*,w.razon_social,coalesce(w.estado_local,w.estado) estado_empresa,c.name cliente_nombre,p.codigo plan_codigo FROM web_subscriptions s JOIN web_empresas w ON w.id=s.empresa_id JOIN clients c ON c.id=w.cliente_id JOIN web_planes p ON p.id=s.plan_id ORDER BY s.fecha_vencimiento').all();
  return rows.filter(r=>r.estado==='ACTIVA'&&r.fecha_vencimiento&&(Number(window)===0?day(r.fecha_vencimiento)===day(now):Date.parse(r.fecha_vencimiento)>now&&Date.parse(r.fecha_vencimiento)<=now+Number(window)*86400000)).map(r=>({...r,dias_restantes:Math.max(0,Math.ceil((Date.parse(r.fecha_vencimiento)-now)/86400000)),precio_asignado:(r.precio_asignado_centavos/100).toFixed(2),estado_efectivo:Date.parse(r.fecha_vencimiento)<=now?'VENCIDA':r.estado}));
 }
 function summary(){
  ready();const commands=queue(),companies=db.prepare('SELECT w.id,w.razon_social,c.name cliente_nombre,coalesce(w.estado_local,w.estado) estado_panel,w.estado_web,w.ultima_sincronizacion,r.estado sincronizacion,r.diferencias_json,r.web_json,r.checked_at,r.ultimo_error FROM web_empresas w JOIN clients c ON c.id=w.cliente_id LEFT JOIN integration_reconciliation r ON r.empresa_id=w.id ORDER BY w.razon_social').all().map(c=>{
   const pending=commands.find(q=>q.empresa_id===c.id&&!['APLICADO','CANCELADO'].includes(q.estado));return {...c,estado_web:c.web_json?JSON.parse(c.web_json).estado_empresa:c.estado_web,sincronizacion:pending?(pending.estado==='ERROR'&&(!pending.retryable||pending.intentos>=pending.max_intentos)?'ERROR':'PENDIENTE'):c.sincronizacion||'PENDIENTE',diferencias:c.diferencias_json?JSON.parse(c.diferencias_json):[],ultimo_error:c.ultimo_error?safeError(c.ultimo_error):null};
  });
  const expired=db.prepare("SELECT s.empresa_id,w.razon_social FROM web_subscriptions s JOIN web_empresas w ON w.id=s.empresa_id WHERE s.estado='VENCIDA' OR(s.estado='ACTIVA' AND s.fecha_vencimiento<=?)").all(new Date(clock()).toISOString());
  return {health:db.prepare("SELECT * FROM integration_health WHERE id='WEB'").get()||{estado:'SIN_COMPROBAR'},workers:config,comandos:commands.map(queuePublic),empresas:companies,proximos:upcoming({window:30}),vencidas:expired,
   alertas:{pendientes:commands.filter(q=>['SOLICITADO','PENDIENTE','REINTENTO'].includes(q.estado)||q.estado==='ERROR'&&q.retryable&&q.intentos<q.max_intentos).length,errores:commands.filter(q=>q.estado==='ERROR').length,agotados:commands.filter(q=>q.estado==='ERROR'&&q.intentos>=q.max_intentos).length,desincronizadas:companies.filter(c=>c.sincronizacion==='DESINCRONIZADO').length,proximas:upcoming({window:30}).length,vencidas:expired.length},
   logs:db.prepare('SELECT * FROM integration_logs ORDER BY id DESC LIMIT 200').all()};
 }
 async function workerCycle(name,interval,fn,{manual=false}={}){
  ready();if(halted)return {estado:'DETENIDO'};const now=clock();
  const acquired=transaction(()=>{
   db.prepare('INSERT INTO integration_worker_runs(nombre) VALUES(?) ON CONFLICT DO NOTHING').run(name);
   const r=db.prepare('SELECT * FROM integration_worker_runs WHERE nombre=?').get(name);
   if(r.lease_until>now||!manual&&r.last_started!=null&&r.last_started+interval>now)return false;
   db.prepare("UPDATE integration_worker_runs SET lease_owner=?,lease_until=?,last_started=?,resultado='PENDIENTE' WHERE nombre=?").run(owner,now+120000,now,name);return true;
  });if(!acquired)return {estado:'OMITIDO'};
  try{const result=await fn();db.prepare("UPDATE integration_worker_runs SET lease_owner=NULL,lease_until=NULL,last_finished=?,resultado='APLICADO' WHERE nombre=? AND lease_owner=?").run(clock(),name,owner);return {estado:'APLICADO',...result};}
  catch(e){db.prepare("UPDATE integration_worker_runs SET lease_owner=NULL,lease_until=NULL,last_finished=?,resultado='ERROR' WHERE nombre=? AND lease_owner=?").run(clock(),name,owner);operationalLog(db,{action:'WORKER',state:'ERROR',error:safeError(e)});throw e;}
 }
 function heartbeat(name){db.prepare('UPDATE integration_worker_runs SET lease_until=? WHERE nombre=? AND lease_owner=?').run(clock()+120000,name,owner);}
 const runIntegration=options=>workerCycle('INTEGRACION',config.integrationInterval,async()=>{
  captureLegacyCommands(db,clock());const health=await checkHealth(),rows=db.prepare("SELECT command_id FROM integration_queue WHERE estado IN('SOLICITADO','PENDIENTE','ERROR','REINTENTO') AND retryable=1 AND intentos<max_intentos AND (proximo_reintento IS NULL OR proximo_reintento<=?) AND (lease_until IS NULL OR lease_until<=?) ORDER BY created_at LIMIT 20").all(clock(),clock());let processed=0;
  for(const r of rows){try{await retryCommand(r.command_id,{health});processed++;}catch(e){if(!['COMANDO_EN_PROCESO','COMANDO_PENDIENTE','REINTENTOS_AGOTADOS'].includes(e.code))operationalLog(db,{command:r.command_id,action:'WORKER',state:'ERROR',error:safeError(e)});}heartbeat('INTEGRACION');}
  return {procesados:processed};
 },options);
 const runReconciliation=options=>workerCycle('CONCILIACION',config.reconciliationInterval,async()=>{
  await checkHealth();const rows=db.prepare('SELECT w.id FROM web_empresas w LEFT JOIN integration_reconciliation r ON r.empresa_id=w.id WHERE w.empresa_web_id IS NOT NULL ORDER BY coalesce(r.checked_at,0),w.id LIMIT 200').all();let processed=0;
  for(const r of rows){await reconcile(r.id);processed++;heartbeat('CONCILIACION');}return {conciliadas:processed};
 },options);
 const track=p=>{running.add(p);void p.finally(()=>running.delete(p)).catch(()=>{});return p;};
 function start(){
  halted=false;if(!hasIntegrationSchema(db)){if(config.integrationEnabled||config.reconciliationEnabled)throw Error('Falta la migración de operación Fase 6.');return false;}
  if(timers.length)return true;
  if(config.integrationEnabled)timers.push(schedule(()=>void track(runIntegration()).catch(()=>{}),config.integrationInterval));
  if(config.reconciliationEnabled)timers.push(schedule(()=>void track(runReconciliation()).catch(()=>{}),config.reconciliationInterval));return timers.length>0;
 }
 async function stop(){halted=true;for(const t of timers)unschedule(t);timers.length=0;await Promise.allSettled([...running]);}
 async function handle(method,route,body={},query={},administrator='Administrador'){
  try{
   ready();
   if(method==='GET'&&route==='/api/web/operacion')return {status:200,data:summary()};
   if(method==='GET'&&route==='/api/web/operacion/vencimientos')return {status:200,data:{rows:upcoming({window:query.dias??30})}};
   if(method==='POST'&&route==='/api/web/operacion/health'){if(Object.keys(body).length)throw fail(400,'CAMPOS_INVALIDOS','Consulta sin campos.');return {status:200,data:await checkHealth()};}
   if(method==='POST'&&route==='/api/web/operacion/conciliar'){if(Object.keys(body).some(k=>k!=='motivo')||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'MOTIVO_OBLIGATORIO','Motivo obligatorio.');const rows=db.prepare('SELECT id FROM web_empresas WHERE empresa_web_id IS NOT NULL ORDER BY id LIMIT 200').all(),result=[];for(const c of rows)result.push(await reconcile(c.id,{administrator,reason:body.motivo}));return {status:200,data:{rows:result}};}
   const cmd=route.match(/^\/api\/web\/operacion\/comandos\/([a-f0-9-]+)\/(reintentar|error|cancelar)$/i);
   if(cmd){
    const r=db.prepare('SELECT * FROM integration_queue WHERE command_id=?').get(cmd[1]);if(!r)throw fail(404,'COMANDO_NO_EXISTE','Comando no encontrado.');
    if(method==='GET'&&cmd[2]==='error')return {status:200,data:{comando:queuePublic(r),intentos:db.prepare('SELECT * FROM integration_attempts WHERE command_id=? ORDER BY intento').all(r.command_id)}};
    if(method==='POST'){
     if(Object.keys(body).some(k=>k!=='motivo')||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'MOTIVO_OBLIGATORIO','Motivo obligatorio.');
     if(cmd[2]==='reintentar'){const result=await retryCommand(r.command_id,{manual:true,administrator,reason:body.motivo}),saved=db.prepare('SELECT * FROM integration_queue WHERE command_id=?').get(r.command_id);return {status:result.status,data:{comando:queuePublic(saved),...(result.status===200?{}:{error:'La orden sigue sin confirmar; revisa el error y el próximo reintento.',code:saved.ultimo_error?safeError(saved.ultimo_error):'ERROR_API'})}};}
     if(cmd[2]==='cancelar'){
      if(['APLICADO','CANCELADO'].includes(r.estado)||r.lease_until>clock())throw fail(409,'COMANDO_EN_PROCESO','No se puede cancelar un comando aplicado, cerrado o en curso.');
      transaction(()=>{db.prepare("UPDATE integration_queue SET estado='CANCELADO',retryable=0,proximo_reintento=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(r.command_id);db.prepare('INSERT INTO history(event,detail) VALUES(?,?)').run('CANCELACION_REINTENTO',JSON.stringify({command_id:r.command_id,administrador:administrator,motivo:body.motivo}));operationalLog(db,{command:r.command_id,company:r.empresa_id,action:'CANCELAR_REINTENTO',state:'CANCELADO',result:'CANCELADO'});});
      return {status:200,data:{comando:queuePublic(db.prepare('SELECT * FROM integration_queue WHERE command_id=?').get(r.command_id)),advertencia:'Solo se detuvieron los reintentos. No se revierte ni se descarta una posible aplicación en WEB.'}};
     }
    }
   }
   const match=route.match(/^\/api\/web\/operacion\/empresas\/([a-f0-9-]+)\/(conciliar|consultar)$/i);
   if(method==='POST'&&match){if(Object.keys(body).some(k=>k!=='motivo')||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'MOTIVO_OBLIGATORIO','Motivo obligatorio.');return {status:200,data:await reconcile(match[1],{recover:match[2]==='conciliar',administrator,reason:body.motivo})};}
   return {status:404,data:{error:'Operación no disponible.'}};
  }catch(e){return {status:e.status||502,data:{error:e.status?e.message:'No se pudo completar la operación.',code:safeError(e)}};}
 }
 return {config,handle,summary,checkHealth,retryCommand,reconcile,upcoming,runIntegration,runReconciliation,start,stop,localSnapshot};
}
