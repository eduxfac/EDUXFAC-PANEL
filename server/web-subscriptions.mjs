import {claimDispatch,finishDispatch,hasIntegrationSchema,safeError} from './integration-queue.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWebApiClient} from './web-api-client.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const states=['PENDIENTE','ACTIVA','VENCIDA','SUSPENDIDA','CANCELADA'];
const fail=(status,message,code='SUSCRIPCION_INVALIDA')=>Object.assign(new Error(message),{status,code});
const money=n=>(BigInt(n)/100n).toString()+'.'+(BigInt(n)%100n).toString().padStart(2,'0');
export const hasSubscriptionSchema=db=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='web_subscriptions'").get();
export const pendingSubscription=(db,id)=>hasSubscriptionSchema(db)?db.prepare("SELECT * FROM web_subscription_commands WHERE empresa_id=? AND (resultado IN('SOLICITADO','PENDIENTE') OR(resultado='ERROR' AND retryable=1))").get(id):null;
export function requireConfirmedSubscription(db,id,{reactivation=false}={}){
 if(!hasSubscriptionSchema(db))return;
 const s=db.prepare('SELECT * FROM web_subscriptions WHERE empresa_id=?').get(id);
 if(!s||pendingSubscription(db,id)||!['ACTIVA','PENDIENTE',...(reactivation?['SUSPENDIDA']:[])].includes(s.estado)||Date.parse(s.fecha_inicio)>Date.now()||!s.fecha_vencimiento||Date.parse(s.fecha_vencimiento)<=Date.now())throw fail(409,'Confirma una suscripción vigente antes de activar o reactivar.','SUSCRIPCION_SIN_CONFIRMAR');
}
export function applyWebSubscriptionMigrations(db){
 if(!db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='003_web_plans'").get())throw Error('Primero aplicar Fase 4.');
 if(db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='004_web_subscriptions'").get())return;
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../database/web-migrations/004_web_subscriptions.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO web_schema_migrations(version) VALUES(?)').run('004_web_subscriptions');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function subscriptionDisplay(s,now=Date.now()){
 const end=Date.parse(s.fecha_vencimiento),remaining=Number.isFinite(end)?Math.max(0,Math.ceil((end-now)/86400000)):null;
 return {...s,precio_asignado:money(s.precio_asignado_centavos),renovacion_automatica:false,dias_restantes:remaining,
 estado_efectivo:s.estado==='ACTIVA'&&end<=now?'VENCIDA':s.estado};
}
export function createWebSubscriptionsService({db,transaction,webApiClient}){
 const remote=()=>webApiClient||createWebApiClient(),busy=new Set();
 const company=id=>{if(!uuid.test(String(id)))throw fail(400,'Empresa inválida.');const r=db.prepare('SELECT w.*,c.name cliente_nombre FROM web_empresas w JOIN clients c ON c.id=w.cliente_id WHERE w.id=?').get(id);if(!r)throw fail(404,'Empresa no encontrada.');return r;};
 const local=id=>db.prepare('SELECT * FROM web_subscriptions WHERE empresa_id=?').get(id);
 const financial=id=>{const a=db.prepare('SELECT * FROM web_company_conditions WHERE empresa_id=?').get(id);if(!a)throw fail(409,'Asigna y confirma un plan.');return a;};
 const ready=()=>{if(!hasSubscriptionSchema(db))throw fail(503,'Falta aplicar explícitamente Fase 5.','ESQUEMA_SUSCRIPCIONES_PENDIENTE');};
 function valid(s,id){
  if(!s||!s.ready||s.empresa_id!==id||!states.includes(s.estado)||!/^\d+$/.test(String(s.version_suscripcion))||!/^\d+$/.test(String(s.version_condiciones))||s.suscripcion_id&&(!uuid.test(s.suscripcion_id)||!Number.isFinite(Date.parse(s.fecha_inicio))||!Number.isFinite(Date.parse(s.fecha_vencimiento))||Date.parse(s.fecha_vencimiento)<=Date.parse(s.fecha_inicio)))throw fail(502,'Confirmación WEB inválida.','RESPUESTA_INVALIDA');
 }
 function history(id,s,event,command,actor,reason,before={},months=0,result='APLICADO',fin=null,gap={}){
  db.prepare('INSERT OR IGNORE INTO web_subscription_history(empresa_id,suscripcion_id,evento,estado_anterior,estado_nuevo,fecha_vencimiento_anterior,fecha_vencimiento_nueva,meses_renovados,administrador,motivo,command_id,resultado,intervalo_vencido_inicio,intervalo_vencido_fin,financiero_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,s.suscripcion_id||s.id,event,before.estado||null,s.estado,before.fecha_vencimiento||null,s.fecha_vencimiento||null,months,actor,reason,command,result,gap.intervalo_vencido_inicio||null,gap.intervalo_vencido_fin||null,fin?JSON.stringify({...fin,meses:months,total_centavos:fin.precio_asignado_centavos*Math.max(1,months)}):null);
 }
 function save(id,s,fin){
  valid(s,company(id).empresa_web_id);if(!s.suscripcion_id)return;
  const old=local(id);if(old&&old.id!==s.suscripcion_id)throw fail(409,'Referencia de suscripción diferente.');if(old&&BigInt(s.version_suscripcion)<BigInt(old.version_web))throw fail(502,'Confirmación anterior al estado conocido.','RESPUESTA_DESACTUALIZADA');
  if(fin.plan_codigo!==s.plan_codigo||String(fin.version_condiciones)!==String(s.version_condiciones)||fin.limite_usuarios_asignado!==s.limite_usuarios||fin.limite_sucursales_asignado!==s.limite_sucursales||!!fin.multisucursal!==s.multisucursal)throw fail(409,'Condiciones comerciales desincronizadas: confirma el plan antes de renovar.','PLAN_DESINCRONIZADO');
  db.prepare('INSERT INTO web_subscriptions(id,empresa_id,plan_id,fecha_inicio,fecha_vencimiento,estado,precio_asignado_centavos,moneda,periodicidad,limite_sucursales_asignado,limite_usuarios_asignado,multisucursal,version_web,version_condiciones) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(empresa_id) DO UPDATE SET fecha_inicio=excluded.fecha_inicio,fecha_vencimiento=excluded.fecha_vencimiento,estado=excluded.estado,plan_id=excluded.plan_id,precio_asignado_centavos=excluded.precio_asignado_centavos,limite_sucursales_asignado=excluded.limite_sucursales_asignado,limite_usuarios_asignado=excluded.limite_usuarios_asignado,multisucursal=excluded.multisucursal,version_web=excluded.version_web,version_condiciones=excluded.version_condiciones,updated_at=CURRENT_TIMESTAMP').run(s.suscripcion_id,id,fin.plan_id,s.fecha_inicio,s.fecha_vencimiento,s.estado,fin.precio_asignado_centavos,fin.moneda,fin.periodicidad,fin.limite_sucursales_asignado,fin.limite_usuarios_asignado,fin.multisucursal?1:0,String(s.version_suscripcion),String(s.version_condiciones));
  db.prepare("UPDATE web_empresas SET estado_web=?,web_auth_version=?,ultima_sincronizacion=CURRENT_TIMESTAMP,estado_local=CASE WHEN estado_local='VENCIDO' AND ?='ACTIVO' THEN 'ACTIVO' ELSE estado_local END WHERE id=?").run(s.estado_empresa,String(s.auth_version),s.estado_empresa,id);
 }
 function view(id){
  const c=company(id),s=local(id),a=financial(id),pending=pendingSubscription(db,id);
  const usage=db.prepare('SELECT uso_json FROM web_commercial_usage WHERE empresa_id=?').get(id);
  return {empresa:{id:c.id,cliente_nombre:c.cliente_nombre,razon_social:c.razon_social,empresa_web_id:c.empresa_web_id,estado_empresa:c.estado_local||c.estado,estado_web:c.estado_web},suscripcion:s?{...subscriptionDisplay(s),plan_codigo:a.plan_codigo}:null,
   pendiente:pending?{command_id:pending.command_id,accion:pending.accion,resultado:pending.resultado,error:pending.error}:null,uso:usage?JSON.parse(usage.uso_json):null,
   historial:db.prepare('SELECT * FROM web_subscription_history WHERE empresa_id=? ORDER BY id DESC LIMIT 200').all(id),
   pagos:db.prepare('SELECT * FROM web_manual_payments WHERE empresa_id=? ORDER BY created_at DESC,id LIMIT 200').all(id).map(p=>({...p,importe:money(p.importe_centavos)}))};
 }
 async function observe(id,event,command,actor,reason,{financial:fin}={}){
  if(!hasSubscriptionSchema(db))return;
  const c=company(id),s=await remote().suscripcion(c.empresa_web_id);valid(s,c.empresa_web_id);if(!s.suscripcion_id)return;
  const old=local(id),f=fin||financial(id),usage=await remote().uso(c.empresa_web_id);if(usage.empresa_id!==c.empresa_web_id)throw fail(502,'Uso de otra empresa rechazado.');
  transaction(()=>{save(id,s,f);db.prepare('INSERT INTO web_commercial_usage(empresa_id,uso_json) VALUES(?,?) ON CONFLICT(empresa_id) DO UPDATE SET uso_json=excluded.uso_json,updated_at=CURRENT_TIMESTAMP').run(id,JSON.stringify(usage));if(event)history(id,s,event,command,actor,reason,old||{},0,'APLICADO',f);
   for(const e of s.historial||[])history(id,{...s,estado:e.estado_nuevo,fecha_vencimiento:e.fecha_vencimiento_nueva},e.evento,e.command_id,e.administrador,e.motivo,{estado:e.estado_anterior,fecha_vencimiento:e.fecha_vencimiento_anterior},e.meses_renovados,'APLICADO',null,e);
  });return s;
 }
 async function exclusive(id,fn){if(busy.has(id))throw fail(409,'Solicitud en curso.');busy.add(id);try{return await fn();}finally{busy.delete(id);}}
 async function execute(c){
  const queueLease=claimDispatch(db,c.command_id);try{
  transaction(()=>db.prepare("UPDATE web_subscription_commands SET resultado='PENDIENTE',intentos=intentos+1,error=NULL WHERE command_id=?").run(c.command_id));
  try{
   const b=JSON.parse(c.payload_json),fin=JSON.parse(c.snapshot_json),r=await remote()[c.accion==='ALTA'?'asignarSuscripcion':'renovar'](company(c.empresa_id).empresa_web_id,b);
   valid(r,company(c.empresa_id).empresa_web_id);
   if(r.command_id!==c.command_id||r.suscripcion_id!==b.suscripcion_id||String(r.version_suscripcion)!==(BigInt(b.version_esperada)+1n).toString()||String(r.version_condiciones)!==b.version_condiciones)throw fail(502,'La confirmación no coincide con la orden.');
   const actual=r.replayed?await remote().suscripcion(r.empresa_id):r;valid(actual,r.empresa_id);
   transaction(()=>{save(c.empresa_id,actual,fin);history(c.empresa_id,r,c.accion==='ALTA'?'ALTA':'RENOVACION',c.command_id,b.administrador,b.motivo,JSON.parse(c.anterior_json||'{}'),b.meses||0,'APLICADO',fin,r);
    if(c.accion==='RENOVAR')db.prepare('UPDATE web_subscriptions SET ultima_renovacion=CURRENT_TIMESTAMP WHERE empresa_id=?').run(c.empresa_id);
    db.prepare("UPDATE web_subscription_commands SET resultado='APLICADO',retryable=0,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(c.command_id);
   });return {status:200,data:{...view(c.empresa_id),command_id:c.command_id,replayed:!!r.replayed}};
  }catch(e){
   const code=hasIntegrationSchema(db)?safeError(e):e.status&&/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'COMUNICACION_SIN_CONFIRMAR',b=JSON.parse(c.payload_json);
   transaction(()=>{db.prepare("UPDATE web_subscription_commands SET resultado='ERROR',retryable=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(e.status>=400&&e.status<500?0:1,code,c.command_id);history(c.empresa_id,{suscripcion_id:b.suscripcion_id,estado:null},c.accion,c.command_id,b.administrador,b.motivo,{},b.meses||0,'ERROR');});
   return {status:e.status===409?409:502,data:{error:'WEB no confirmó la suscripción. Conserva el comando y reintenta cuando corresponda.',code,command_id:c.command_id,...view(c.empresa_id)}};
  }
  }finally{finishDispatch(db,queueLease);}
 }
 async function change(id,body,actor,initial=false){
  return exclusive(id,async()=>{
   const c=company(id),action=initial?'ALTA':'RENOVAR',allowed=initial?['command_id','fecha_inicio','motivo']:['command_id','fecha_autorizada','meses','motivo'];
   if(Object.keys(body).some(k=>!allowed.includes(k))||!uuid.test(String(body.command_id))||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500||!initial&&![1,2,3,6,12].includes(body.meses)||typeof body[initial?'fecha_inicio':'fecha_autorizada']!=='string')throw fail(400,'Comando UUID, fecha, meses válidos y motivo son obligatorios.');
   const existing=db.prepare('SELECT * FROM web_subscription_commands WHERE command_id=?').get(body.command_id);
   if(existing){
    const p=JSON.parse(existing.payload_json);
    if(existing.empresa_id!==id||existing.accion!==action||p.motivo!==body.motivo.trim()||p.administrador!==actor||p[initial?'fecha_inicio':'fecha_autorizada']!==body[initial?'fecha_inicio':'fecha_autorizada']||!initial&&p.meses!==body.meses)throw fail(409,'Comando reutilizado con otro contenido.','COMANDO_REUTILIZADO');
    if(existing.resultado==='APLICADO')return {status:200,data:{...view(id),command_id:body.command_id,replayed:true}};
    if(!existing.retryable)throw fail(409,'Comando rechazado; consulta WEB antes de una orden nueva.');return execute(existing);
   }
   if(pendingSubscription(db,id)||db.prepare("SELECT 1 FROM web_state_commands WHERE empresa_id=? AND (resultado IN('SOLICITADO','PENDIENTE') OR(resultado='ERROR' AND retryable=1))").get(id)||db.prepare("SELECT 1 FROM web_commercial_commands WHERE empresa_id=? AND (resultado IN('SOLICITADO','PENDIENTE') OR(resultado='ERROR' AND retryable=1))").get(id))throw fail(409,'Confirma primero el comando pendiente.');
   if(!c.empresa_web_id)throw fail(409,'Completa la creación WEB.');
   const f=financial(id),before=await remote().suscripcion(c.empresa_web_id);valid(before,c.empresa_web_id);
   if(before.estado_empresa==='CANCELADO')throw fail(409,'Empresa cancelada: requiere recuperación administrativa explícita.');
   if(initial&&before.suscripcion_id||!initial&&!before.suscripcion_id)throw fail(409,'Operación incompatible con la suscripción actual.');
   if(String(f.version_condiciones)!==String(before.version_condiciones))throw fail(409,'Confirma las condiciones comerciales.');
   const payload={command_id:body.command_id,motivo:body.motivo.trim(),administrador:actor,suscripcion_id:before.suscripcion_id||randomUUID(),version_esperada:String(before.version_suscripcion),version_condiciones:String(before.version_condiciones),...(initial?{fecha_inicio:body.fecha_inicio}:{fecha_autorizada:body.fecha_autorizada,meses:body.meses})};
   const cmd={command_id:body.command_id,empresa_id:id,accion:action,payload_json:JSON.stringify(payload),snapshot_json:JSON.stringify(f),anterior_json:JSON.stringify(before)};
   transaction(()=>db.prepare("INSERT INTO web_subscription_commands(command_id,empresa_id,accion,payload_json,snapshot_json,anterior_json,resultado) VALUES(?,?,?,?,?,?,'SOLICITADO')").run(cmd.command_id,id,action,cmd.payload_json,cmd.snapshot_json,cmd.anterior_json));
   return execute(cmd);
  });
 }
 async function ensure(id,start){
  if(!hasSubscriptionSchema(db))return;
  if(local(id))return;
  const pending=pendingSubscription(db,id);if(pending){const r=await execute(pending);if(r.status!==200)throw fail(r.status,r.data.error);return;}
  const result=await change(id,{command_id:randomUUID(),fecha_inicio:start,motivo:'Suscripción inicial de alta WEB'},db.prepare('SELECT username FROM admin WHERE id=1').get()?.username||'Administrador',true);
  if(result.status!==200)throw fail(result.status,result.data.error);
 }
 function payment(id,b,actor){
  company(id);const s=local(id);if(!s)throw fail(409,'Confirma la suscripción antes de registrar pagos.');
  if(Object.keys(b).some(k=>!['command_id','importe','moneda','fecha','metodo','referencia','observacion','periodo_inicio','periodo_fin'].includes(k))||!uuid.test(String(b.command_id))||typeof b.importe!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(b.importe)||b.moneda!=='PEN'||!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)||!['EFECTIVO','TRANSFERENCIA','YAPE','PLIN','OTRO'].includes(b.metodo)||typeof b.referencia!=='string'||b.referencia.length>120||typeof b.observacion!=='string'||b.observacion.length>500)throw fail(400,'Pago manual inválido.');
  const [integer,fraction='']=b.importe.split('.'),cents=Number(BigInt(integer)*100n+BigInt(fraction.padEnd(2,'0')));
  const d=new Date(b.fecha+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==b.fecha||cents<=0)throw fail(400,'Importe o fecha inválidos.');
  const hasContext=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='web_payment_context'").get();
  const periodStart=b.periodo_inicio||null,periodEnd=b.periodo_fin||null;
  const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if((b.periodo_inicio!==undefined&&typeof b.periodo_inicio!=='string')||(b.periodo_fin!==undefined&&typeof b.periodo_fin!=='string')||(!!periodStart!==!!periodEnd)||(periodStart&&(!validDay(periodStart)||!validDay(periodEnd)||periodEnd<periodStart)))throw fail(400,'Período cubierto inválido; ambas fechas son necesarias.');
  if(periodStart&&!hasContext)throw fail(503,'Primero preparar explícitamente el contexto de pagos FASE 7.');
  const old=db.prepare('SELECT * FROM web_manual_payments WHERE command_id=?').get(b.command_id);
  if(old){const context=hasContext?db.prepare('SELECT periodo_inicio,periodo_fin FROM web_payment_context WHERE pago_id=?').get(old.id):null;if((context?.periodo_inicio||null)!==periodStart||(context?.periodo_fin||null)!==periodEnd)throw fail(409,'Comando de pago reutilizado con otro período.');if(old.empresa_id!==id||old.importe_centavos!==cents||old.moneda!==b.moneda||old.fecha!==b.fecha||old.metodo!==b.metodo||old.referencia!==b.referencia||old.observacion!==b.observacion||old.administrador!==actor)throw fail(409,'Comando de pago reutilizado.');return {status:200,data:{...view(id),pago_id:old.id,replayed:true}};}
  const pid=randomUUID();transaction(()=>{db.prepare('INSERT INTO web_manual_payments(id,command_id,empresa_id,suscripcion_id,importe_centavos,moneda,fecha,metodo,referencia,observacion,administrador) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(pid,b.command_id,id,s.id,cents,b.moneda,b.fecha,b.metodo,b.referencia,b.observacion,actor);if(hasContext)db.prepare('INSERT INTO web_payment_context(pago_id,plan_codigo,precio_asignado_centavos,periodo_inicio,periodo_fin) VALUES(?,?,?,?,?)').run(pid,financial(id).plan_codigo,s.precio_asignado_centavos,periodStart,periodEnd);});
  return {status:201,data:{...view(id),pago_id:pid,renovacion_automatica:false}};
 }
 async function handle(method,route,body={},query={},actor='Administrador'){
  try{
   ready();
   if(method==='GET'&&route==='/api/web/suscripciones'){
    const filter=query.estado||'',windowDays=Number(query.dias||7),q=String(query.q||'').toLowerCase();
    if(filter&&!['ACTIVA','POR_VENCER','VENCIDA','SUSPENDIDA','CANCELADA','PENDIENTE'].includes(filter)||![7,15,30].includes(windowDays)||q.length>120)throw fail(400,'Filtro inválido.');
    const rows=db.prepare('SELECT s.*,w.razon_social,coalesce(w.estado_local,w.estado) estado_empresa,c.name cliente_nombre,p.codigo plan_codigo FROM web_subscriptions s JOIN web_empresas w ON w.id=s.empresa_id JOIN clients c ON c.id=w.cliente_id JOIN web_planes p ON p.id=s.plan_id ORDER BY s.fecha_vencimiento,s.empresa_id').all().map(s=>subscriptionDisplay(s)).filter(s=>(!q||(s.cliente_nombre+' '+s.razon_social).toLowerCase().includes(q))&&(!filter||(filter==='POR_VENCER'?s.estado_efectivo==='ACTIVA'&&s.dias_restantes<=windowDays:s.estado_efectivo===filter)));
    return {status:200,data:{rows,total:rows.length}};
   }
   const m=route.match(/^\/api\/web\/suscripciones\/([a-f0-9-]+)(?:\/(crear|renovar|pago|consultar|reintentar))?$/i);
   if(!m)return {status:404,data:{error:'Operación de suscripción no disponible.'}};
   const id=m[1];company(id);
   if(method==='GET'&&!m[2])return {status:200,data:view(id)};
   if(method==='POST'){
    if(m[2]==='crear'||m[2]==='renovar')return await change(id,body,actor,m[2]==='crear');
    if(m[2]==='pago')return payment(id,body,actor);
    if(m[2]==='consultar'){if(Object.keys(body).length)throw fail(400,'Consulta sin campos.');await observe(id);return {status:200,data:view(id)};}
    if(m[2]==='reintentar'){
     if(Object.keys(body).some(k=>k!=='command_id'))throw fail(400,'Reintento inválido.');
     const c=db.prepare('SELECT * FROM web_subscription_commands WHERE command_id=? AND empresa_id=?').get(body.command_id,id);
     if(!c)throw fail(404,'Comando no encontrado.');if(c.resultado==='APLICADO')return {status:200,data:{...view(id),replayed:true}};if(!c.retryable)throw fail(409,'Comando rechazado definitivamente.');return await exclusive(id,()=>execute(c));
    }
   }return {status:404,data:{error:'Operación no disponible.'}};
  }catch(e){return {status:e.status||502,data:{error:e.status?e.message:'No se pudo confirmar WEB.',code:e.code||'SUSCRIPCION_ERROR'}};}
 }
 return {handle,ensure,observe,view};
}
