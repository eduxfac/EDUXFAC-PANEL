import {claimDispatch,finishDispatch,hasIntegrationSchema,safeError} from './integration-queue.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWebApiClient} from './web-api-client.mjs';
import {requireAssignedConditions,pendingCommercial} from './web-plans.mjs';
import {pendingSubscription,requireConfirmedSubscription} from './web-subscriptions.mjs';
const states=['PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO'];
const targets={ACTIVAR:'ACTIVO',SUSPENDER:'SUSPENDIDO',REACTIVAR:'ACTIVO',VENCER:'VENCIDO',CANCELAR:'CANCELADO'};
const choices={PENDIENTE:['ACTIVAR','CANCELAR'],ACTIVO:['SUSPENDER','VENCER','CANCELAR'],SUSPENDIDO:['REACTIVAR','CANCELAR'],VENCIDO:['REACTIVAR','CANCELAR'],CANCELADO:[]};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,message,code='ESTADO_INVALIDO')=>Object.assign(new Error(message),{status,code});
export function applyWebStateMigrations(db){
 if(!db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='001_web_onboarding'").get())throw Error('Primero aplicar la migración Fase 2.');
 if(db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='002_web_company_states'").get())return;
 db.exec('BEGIN IMMEDIATE');
 try{db.exec(readFileSync(new URL('../database/web-migrations/002_web_company_states.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO web_schema_migrations(version) VALUES (?)').run('002_web_company_states');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
export function createWebCompanyStatesService({db,transaction,webApiClient,subscriptionService}){
 const busy=new Set(),remote=()=>webApiClient||createWebApiClient();
 const ready=()=>{if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='web_state_commands'").get())throw fail(503,'Falta aplicar explícitamente la migración local Fase 3.','ESQUEMA_ESTADOS_PENDIENTE');};
 const row=id=>{if(!uuid.test(String(id)))throw fail(400,'Empresa inválida.');const r=db.prepare('SELECT w.*,c.name cliente_nombre FROM web_empresas w JOIN clients c ON c.id=w.cliente_id WHERE w.id=?').get(id);if(!r)throw fail(404,'Empresa no encontrada.');return r;};
 const local=r=>r.estado_local||r.estado;
 const operation=id=>db.prepare('SELECT * FROM web_state_commands WHERE command_id=?').get(id);
 const unresolved=id=>db.prepare("SELECT * FROM web_state_commands WHERE empresa_id=? AND (resultado IN ('SOLICITADO','PENDIENTE') OR (resultado='ERROR' AND retryable=1)) ORDER BY created_at DESC LIMIT 1").get(id);
 function view(r){
  const last=db.prepare('SELECT accion,resultado,created_at FROM web_state_history WHERE empresa_id=? ORDER BY id DESC LIMIT 1').get(r.id),pending=unresolved(r.id);
  const latest=db.prepare('SELECT resultado,error FROM web_state_commands WHERE empresa_id=? ORDER BY rowid DESC LIMIT 1').get(r.id);
  const steps=JSON.parse(r.steps_json);
  return {id:r.id,empresa_web_id:r.empresa_web_id,cliente_nombre:r.cliente_nombre,razon_social:r.razon_social,nombre_comercial:r.nombre_comercial,ruc:r.ruc,empresa_codigo:r.empresa_codigo,estado_local:local(r),estado_web:r.estado_web,ultima_sincronizacion:r.ultima_sincronizacion,ultima_accion:last||null,created_at:r.created_at,
   conciliacion:r.estado_web?(local(r)===r.estado_web?'SINCRONIZADO':'DESINCRONIZADO'):'SIN_CONSULTAR',
   sincronizacion:pending?.resultado||latest?.resultado||((r.sync_status==='ERROR_DE_SINCRONIZACION')?'ERROR':r.sync_status==='CONFIRMADO'?'APLICADO':'PENDIENTE'),
   error_sincronizacion:latest?.error||r.last_error||null,
   pendiente:pending?{command_id:pending.command_id,accion:pending.accion,resultado:pending.resultado,intentos:pending.intentos,error:pending.error}:null,
   acciones:pending||!r.empresa_web_id?[]:choices[local(r)].filter(a=>a!=='ACTIVAR'||['cliente','empresa','sucursal','administrador'].every(k=>steps[k])),
   alta_incompleta:local(r)==='PENDIENTE'&&!['cliente','empresa','sucursal','administrador'].every(k=>steps[k])};
 }
 function event(c,result,error=null,after=c.estado_nuevo){
  db.prepare('INSERT INTO web_state_history(command_id,empresa_id,accion,administrador,motivo,estado_anterior,estado_nuevo,resultado,error) VALUES (?,?,?,?,?,?,?,?,?)').run(c.command_id||null,c.empresa_id,c.accion,c.administrador,c.motivo,c.estado_anterior,after,result,error);
 }
 async function exclusive(id,fn){if(busy.has(id))throw fail(409,'La empresa tiene una solicitud en curso.','SOLICITUD_EN_CURSO');busy.add(id);try{return await fn();}finally{busy.delete(id);}}
 function validResult(r,company,command){
  if(!r||r.empresa_id!==company||!states.includes(r.estado)||!/^\d+$/.test(String(r.auth_version))||BigInt(r.auth_version)<1n||command&&r.command_id!==command)throw fail(502,'Respuesta WEB inválida.','RESPUESTA_INVALIDA');
 }
 function updateRemote(id,result){
  const current=row(id);
  if(current.web_auth_version&&BigInt(result.auth_version)<BigInt(current.web_auth_version))throw fail(502,'Confirmación WEB anterior al estado ya conocido.','RESPUESTA_DESACTUALIZADA');
  db.prepare('UPDATE web_empresas SET estado_web=?,web_auth_version=?,ultima_sincronizacion=CURRENT_TIMESTAMP WHERE id=?').run(result.estado,String(result.auth_version),id);
 }
 async function execute(c){
  const queueLease=claimDispatch(db,c.command_id);try{
  transaction(()=>{db.prepare("UPDATE web_state_commands SET resultado='PENDIENTE',error=NULL,intentos=intentos+1,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(c.command_id);event(c,'PENDIENTE');});
  try{
   const result=await remote()[c.accion.toLowerCase()](c.empresa_web_id,{command_id:c.command_id,motivo:c.motivo,administrador:c.administrador});
   validResult(result,c.empresa_web_id,c.command_id);if(result.estado!==c.estado_nuevo)throw fail(502,'Estado WEB inesperado.','RESPUESTA_INVALIDA');
   const confirmed=result.replayed?await remote().estado(c.empresa_web_id):result;
   validResult(confirmed,c.empresa_web_id);
   await subscriptionService?.observe(c.empresa_id,c.accion,c.command_id,c.administrador,c.motivo);
   transaction(()=>{
    updateRemote(c.empresa_id,confirmed);
    db.prepare("UPDATE web_empresas SET estado_local=?,estado=CASE WHEN ?='ACTIVAR' THEN 'ACTIVO' ELSE estado END,sync_status='CONFIRMADO',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(result.estado,c.accion,c.empresa_id);
    db.prepare("UPDATE web_state_commands SET resultado='APLICADO',error=NULL,retryable=0,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(c.command_id);event(c,'APLICADO');
   });
   return {status:200,data:{empresa:view(row(c.empresa_id)),command_id:c.command_id,replayed:!!result.replayed}};
  }catch(error){
   const retryable=!(error.status>=400&&error.status<500);
   const code=hasIntegrationSchema(db)?safeError(error):error.status&&/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'COMUNICACION_SIN_CONFIRMAR';
   transaction(()=>{db.prepare("UPDATE web_state_commands SET resultado='ERROR',error=?,retryable=?,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(code,retryable?1:0,c.command_id);event(c,'ERROR',code);});
   return {status:502,data:{error:'WEB no confirmó el cambio. Consulta el estado real; conserva el comando para reintentar cuando corresponda.',code,empresa:view(row(c.empresa_id)),command_id:c.command_id}};
  }
  }finally{finishDispatch(db,queueLease);}
 }
 async function act(id,action,body,administrator){
  return exclusive(id,async()=>{
   const r=row(id),before=local(r);
   if(pendingSubscription(db,id))throw fail(409,'Confirma primero la suscripción pendiente.');if(pendingCommercial(db,id))throw fail(409,'Confirma primero las condiciones comerciales pendientes.');
   if(['ACTIVAR','REACTIVAR'].includes(action)){requireAssignedConditions(db,id);requireConfirmedSubscription(db,id,{reactivation:action==='REACTIVAR'});}if(!r.empresa_web_id)throw fail(409,'Completa el alta en WEB antes de administrar su estado.');
   if(unresolved(id))throw fail(409,'Reintenta primero el comando sin confirmar.','COMANDO_PENDIENTE');
   if(!choices[before].includes(action))throw fail(409,'Acción no permitida para el estado local.','TRANSICION_INVALIDA');
   if(Object.keys(body).some(k=>k!=='motivo'))throw fail(400,'Solo se admite el motivo.');
   let reason=body.motivo;
   if(action==='VENCER'&&(reason==null||reason===''))reason='Vencimiento administrativo explícito.';
   if(action==='REACTIVAR'&&(reason==null||reason===''))reason='Reactivación administrativa.';
   if(action==='ACTIVAR')reason='Activación final de alta WEB';
   if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw fail(400,'Motivo obligatorio, máximo 500 caracteres.');
   if(action==='ACTIVAR'&&!['cliente','empresa','sucursal','administrador'].every(k=>JSON.parse(r.steps_json)[k]))throw fail(409,'Completa cliente, empresa, sucursal y administrador.','ALTA_INCOMPLETA');
   const command=action==='ACTIVAR'?JSON.parse(r.commands_json).activar:randomUUID();
   const c={command_id:command,empresa_id:id,empresa_web_id:r.empresa_web_id,accion:action,administrador:administrator,motivo:reason.trim(),estado_anterior:before,estado_nuevo:targets[action]};
   transaction(()=>{db.prepare("INSERT INTO web_state_commands(command_id,empresa_id,empresa_web_id,accion,administrador,motivo,estado_anterior,estado_nuevo,resultado) VALUES (?,?,?,?,?,?,?,?,'SOLICITADO')").run(command,id,r.empresa_web_id,action,administrator,c.motivo,before,c.estado_nuevo);event(c,'SOLICITADO');});
   return execute(c);
  });
 }
 async function consult(id,administrator){
  return exclusive(id,async()=>{
   const r=row(id);if(!r.empresa_web_id)throw fail(409,'La empresa todavía no tiene referencia WEB.');
   const c={empresa_id:id,accion:'CONSULTAR',administrador:administrator,motivo:'Conciliación del estado real',estado_anterior:local(r),estado_nuevo:null};
   try{const result=await remote().estado(r.empresa_web_id);validResult(result,r.empresa_web_id);transaction(()=>{updateRemote(id,result);event(c,'APLICADO',null,result.estado);});return {status:200,data:{empresa:view(row(id))}};}
   catch(error){transaction(()=>event(c,'ERROR','CONSULTA_SIN_CONFIRMAR'));return {status:502,data:{error:'No se pudo consultar WEB. Se conserva la última confirmación.',empresa:view(row(id))}};}
  });
 }
 async function retry(id,command){
  if(!uuid.test(String(command)))throw fail(400,'Comando inválido.');
  return exclusive(id,async()=>{const c=operation(command);if(!c||c.empresa_id!==id)throw fail(404,'Comando no encontrado para esta empresa.');
   if(c.resultado==='APLICADO')return {status:200,data:{empresa:view(row(id)),command_id:command,replayed:true}};
   if(!c.retryable)throw fail(409,'Rechazo definitivo: consulta WEB y revisa el motivo antes de otra acción.','COMANDO_RECHAZADO');
   return execute(c);
  });
 }
 function bounded(query){const page=Number(query.page||1),size=Number(query.page_size||25);if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(size)||size<1||size>100)throw fail(400,'Paginación inválida.');return {page,page_size:size,offset:(page-1)*size};}
 async function handle(method,route,body,query={},administrator='Administrador'){
  try{
   ready();
   if(method==='GET'&&route==='/api/web/estados/empresas'){
    const q=String(query.q||'');if(q.length>120||query.estado&&!states.includes(query.estado)&&query.estado!=='ERROR')throw fail(400,'Filtro inválido.');
    const rows=db.prepare('SELECT w.*,c.name cliente_nombre FROM web_empresas w JOIN clients c ON c.id=w.cliente_id WHERE c.name LIKE ? OR w.ruc LIKE ? OR coalesce(w.nombre_comercial,\'\') LIKE ? OR w.empresa_codigo LIKE ? OR w.razon_social LIKE ? ORDER BY w.created_at DESC,w.id').all(...Array(5).fill('%'+q+'%')).map(view)
     .filter(r=>!query.estado||(query.estado==='ERROR'?r.sincronizacion==='ERROR':r.estado_local===query.estado));
    const paging=bounded(query);return {status:200,data:{rows:rows.slice(paging.offset,paging.offset+paging.page_size),total:rows.length,page:paging.page,page_size:paging.page_size}};
   }
   if(method==='GET'&&route==='/api/web/estados/historial'){
    if(query.accion&&!['CONSULTAR',...Object.keys(targets)].includes(query.accion)||query.resultado&&!['SOLICITADO','PENDIENTE','APLICADO','ERROR'].includes(query.resultado)||query.fecha&&!/^\d{4}-\d{2}-\d{2}$/.test(query.fecha))throw fail(400,'Filtro de historial inválido.');
    const paging=bounded(query),where=" WHERE (?='' OR h.empresa_id=?) AND (?='' OR h.accion=?) AND (?='' OR h.resultado=?) AND (?='' OR substr(h.created_at,1,10)=?)",params=[query.empresa||'',query.empresa||'',query.accion||'',query.accion||'',query.resultado||'',query.resultado||'',query.fecha||'',query.fecha||''];
    const total=db.prepare('SELECT count(*) total FROM web_state_history h'+where).get(...params).total;
    const rows=db.prepare('SELECT h.*,w.razon_social,w.empresa_codigo FROM web_state_history h JOIN web_empresas w ON w.id=h.empresa_id'+where+' ORDER BY h.id DESC LIMIT ? OFFSET ?').all(...params,paging.page_size,paging.offset);
    return {status:200,data:{rows,total,page:paging.page,page_size:paging.page_size}};
   }
   const match=route.match(/^\/api\/web\/estados\/empresas\/([a-f0-9-]+)\/(consultar|suspender|reactivar|vencer|cancelar|activar|reintentar)$/i);
   if(method==='POST'&&match){
    if(match[2]==='consultar'){if(Object.keys(body).length)throw fail(400,'Consulta sin campos.');return await consult(match[1],administrator);}
    if(match[2]==='reintentar'){if(Object.keys(body).some(k=>k!=='command_id'))throw fail(400,'Reintento sin campos adicionales.');return await retry(match[1],body.command_id);}
    return await act(match[1],match[2].toUpperCase(),body,administrator);
   }
   return {status:404,data:{error:'Operación de estados no disponible.'}};
  }catch(error){return {status:error.status||500,data:{error:error.status?error.message:'No se pudo completar la administración de estados.',code:error.code||'ESTADOS_ERROR'}};}
 }
 return {handle};
}
