import {claimDispatch,finishDispatch,hasIntegrationSchema,safeError} from './integration-queue.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWebApiClient} from './web-api-client.mjs';
import {pendingSubscription} from './web-subscriptions.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,message,code='PLAN_INVALIDO')=>Object.assign(new Error(message),{status,code});
const decimal=v=>{const c=BigInt(v);return (c/100n).toString()+'.'+(c%100n).toString().padStart(2,'0');};
export const hasPlanSchema=db=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='web_planes'").get();
export function requireAssignedConditions(db,id){
 if(!hasPlanSchema(db))return;
 if(!db.prepare('SELECT 1 FROM web_company_conditions WHERE empresa_id=?').get(id)||pendingCommercial(db,id))throw fail(409,'Asigna y confirma un plan antes de activar o reactivar.','PLAN_SIN_CONFIRMAR');
}
export const pendingCommercial=(db,id)=>hasPlanSchema(db)?db.prepare("SELECT * FROM web_commercial_commands WHERE empresa_id=? AND (resultado IN ('SOLICITADO','PENDIENTE') OR (resultado='ERROR' AND retryable=1)) LIMIT 1").get(id):null;
export function applyWebPlanMigrations(db){
 if(!db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='002_web_company_states'").get())throw Error('Primero aplicar Fase 3.');
 if(db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='003_web_plans'").get())return;
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../database/web-migrations/003_web_plans.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO web_schema_migrations(version) VALUES (?)').run('003_web_plans');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function createWebPlansService({db,transaction,webApiClient,subscriptionService}){
 const busy=new Set(),remote=()=>webApiClient||createWebApiClient();
 const ready=()=>{if(!hasPlanSchema(db))throw fail(503,'Falta aplicar explícitamente la migración local de planes.','ESQUEMA_PLANES_PENDIENTE');};
 const company=id=>{if(!uuid.test(String(id)))throw fail(400,'Empresa inválida.');const r=db.prepare('SELECT * FROM web_empresas WHERE id=?').get(id);if(!r)throw fail(404,'Empresa no encontrada.');return r;};
 const plans=()=>db.prepare('SELECT * FROM web_planes ORDER BY precio_centavos').all().map(p=>({...p,precio:decimal(p.precio_centavos),multisucursal:!!p.multisucursal,activo:!!p.activo}));
 const assigned=id=>db.prepare('SELECT * FROM web_company_conditions WHERE empresa_id=?').get(id);
 function view(id){
  const a=assigned(id),saved=db.prepare('SELECT * FROM web_commercial_usage WHERE empresa_id=?').get(id),usage=saved?JSON.parse(saved.uso_json):null;
  const pending=pendingCommercial(db,id),last=db.prepare('SELECT command_id,accion,resultado,error,retryable FROM web_commercial_commands WHERE empresa_id=? ORDER BY rowid DESC LIMIT 1').get(id);
  const confirmed=a?{...a,precio_asignado:decimal(a.precio_asignado_centavos),multisucursal:!!a.multisucursal,personalizada:!!a.personalizada}:null;
  const equal=!!(a&&usage&&a.plan_codigo===usage.plan_codigo&&String(a.version_condiciones)===String(usage.version_condiciones)&&a.limite_usuarios_asignado===usage.limite_usuarios&&a.limite_sucursales_asignado===usage.limite_sucursales&&!!a.multisucursal===usage.multisucursal);
  return {empresa_id:id,condiciones:confirmed,uso:usage,ultima_consulta:saved?.updated_at||null,pendiente:pending?{command_id:pending.command_id,accion:pending.accion,resultado:pending.resultado,error:pending.error}:null,ultimo_comando:last||null,conciliacion:!usage?'SIN_CONSULTAR':equal?'SINCRONIZADO':'DESINCRONIZADO'};
 }
 function history(c,status,error=null,next=c.snapshot_json){db.prepare('INSERT INTO web_commercial_history(command_id,empresa_id,accion,administrador,motivo,anterior_json,nuevo_json,resultado,error) VALUES (?,?,?,?,?,?,?,?,?)').run(c.command_id,c.empresa_id||null,c.accion,c.administrador,c.motivo,c.anterior_json||null,next||null,status,error);}
 const validUsage=(r,id)=>{if(!r||r.empresa_id!==id||!['BASICO','PROFESIONAL','EMPRESA',null].includes(r.plan_codigo)||!/^\d+$/.test(String(r.version_condiciones))||!Number.isSafeInteger(r.sucursales_activas)||r.sucursales_activas<0||!Number.isSafeInteger(r.usuarios_activos)||r.usuarios_activos<0)throw fail(502,'Confirmación WEB inválida.','RESPUESTA_INVALIDA');};
 function saveUsage(id,r){const prior=db.prepare('SELECT uso_json FROM web_commercial_usage WHERE empresa_id=?').get(id);if(prior&&BigInt(r.version_condiciones)<BigInt(JSON.parse(prior.uso_json).version_condiciones))throw fail(502,'Respuesta comercial anterior a la última confirmación.','RESPUESTA_DESACTUALIZADA');db.prepare('INSERT INTO web_commercial_usage(empresa_id,uso_json) VALUES (?,?) ON CONFLICT(empresa_id) DO UPDATE SET uso_json=excluded.uso_json,updated_at=CURRENT_TIMESTAMP').run(id,JSON.stringify(r));}
 async function exclusive(id,fn){if(busy.has(id))throw fail(409,'Operación comercial en curso.');busy.add(id);try{return await fn();}finally{busy.delete(id);}}
 async function execute(c){
  const queueLease=claimDispatch(db,c.command_id);try{
  transaction(()=>{db.prepare("UPDATE web_commercial_commands SET resultado='PENDIENTE',intentos=intentos+1,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(c.command_id);history(c,'PENDIENTE');});
  try{
   const p=JSON.parse(c.payload_json),s=JSON.parse(c.snapshot_json);
   const r=await remote()[c.accion==='ASIGNAR_PLAN'?'asignarPlan':'ajustarLimites'](c.empresa_web_id,p);
   validUsage(r,c.empresa_web_id);
   if(r.command_id!==c.command_id||r.plan_codigo!==s.plan_codigo||r.limite_sucursales!==s.limite_sucursales_asignado||r.limite_usuarios!==s.limite_usuarios_asignado||r.multisucursal!==!!s.multisucursal||String(r.version_condiciones)!==String(p.version_condiciones))throw fail(502,'Condiciones WEB no coinciden con la orden.','RESPUESTA_INVALIDA');
   const real=r.replayed?await remote().uso(c.empresa_web_id):r;validUsage(real,c.empresa_web_id);
   await subscriptionService?.observe(c.empresa_id,c.accion==='ASIGNAR_PLAN'?'CAMBIO_PLAN':'CAMBIO_LIMITES',c.command_id,c.administrador,c.motivo,{financial:{...s,version_condiciones:String(r.version_condiciones)}});
   transaction(()=>{
    saveUsage(c.empresa_id,real);
    db.prepare('INSERT INTO web_company_conditions(empresa_id,plan_id,plan_codigo,precio_asignado_centavos,moneda,periodicidad,limite_sucursales_asignado,limite_usuarios_asignado,multisucursal,personalizada,version_condiciones) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(empresa_id) DO UPDATE SET plan_id=excluded.plan_id,plan_codigo=excluded.plan_codigo,precio_asignado_centavos=excluded.precio_asignado_centavos,moneda=excluded.moneda,periodicidad=excluded.periodicidad,limite_sucursales_asignado=excluded.limite_sucursales_asignado,limite_usuarios_asignado=excluded.limite_usuarios_asignado,multisucursal=excluded.multisucursal,personalizada=excluded.personalizada,version_condiciones=excluded.version_condiciones,updated_at=CURRENT_TIMESTAMP').run(c.empresa_id,s.plan_id,s.plan_codigo,s.precio_asignado_centavos,s.moneda,s.periodicidad,s.limite_sucursales_asignado,s.limite_usuarios_asignado,s.multisucursal?1:0,s.personalizada?1:0,String(r.version_condiciones));
    db.prepare("UPDATE web_commercial_commands SET resultado='APLICADO',retryable=0,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(c.command_id);history(c,'APLICADO');
   });
   return {status:200,data:{...view(c.empresa_id),command_id:c.command_id,replayed:!!r.replayed}};
  }catch(error){
   const code=hasIntegrationSchema(db)?safeError(error):error.status&&/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'COMUNICACION_SIN_CONFIRMAR';
   transaction(()=>{db.prepare("UPDATE web_commercial_commands SET resultado='ERROR',retryable=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(error.status>=400&&error.status<500?0:1,code,c.command_id);history(c,'ERROR',code);});
   return {status:error.status===409?409:502,data:{error:error.code==='USO_SUPERA_PLAN'?'No se puede aplicar este plan porque la empresa supera actualmente sus límites.':'WEB no confirmó las condiciones comerciales. Revisa el historial y reintenta cuando corresponda.',code,uso_rechazado:error.uso||null,...view(c.empresa_id)}};
  }
  }finally{finishDispatch(db,queueLease);}
 }
 async function change(id,body,administrator,exception=false){
  return exclusive(id,async()=>{
   const r=company(id);if(!r.empresa_web_id)throw fail(409,'Completa la creación de la empresa WEB antes de asignar condiciones.');
   if(pendingSubscription(db,id))throw fail(409,'Confirma primero la suscripción pendiente.');if(pendingCommercial(db,id))throw fail(409,'Reintenta primero el comando comercial sin confirmar.','COMANDO_PENDIENTE');
   if(db.prepare("SELECT 1 FROM web_state_commands WHERE empresa_id=? AND (resultado IN ('SOLICITADO','PENDIENTE') OR (resultado='ERROR' AND retryable=1))").get(id))throw fail(409,'Confirma primero el cambio de estado pendiente.');
   const allowed=exception?['motivo','limite_sucursales','limite_usuarios','multisucursal']:['motivo','plan_codigo'];
   if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'Motivo obligatorio, máximo 500 caracteres.');
   let s;
   if(exception){const a=assigned(id);if(!a)throw fail(409,'Asigna un plan antes de la excepción.');if(!Number.isSafeInteger(body.limite_usuarios)||body.limite_usuarios<1||body.limite_usuarios>2147483647||typeof body.multisucursal!=='boolean'||(body.multisucursal?body.limite_sucursales!==null:!Number.isSafeInteger(body.limite_sucursales)||body.limite_sucursales<1||body.limite_sucursales>2147483647))throw fail(400,'Límites positivos; multisucursal utiliza NULL.');s={...a,limite_usuarios_asignado:body.limite_usuarios,limite_sucursales_asignado:body.limite_sucursales,multisucursal:body.multisucursal,personalizada:true};}
   else{const p=db.prepare('SELECT * FROM web_planes WHERE codigo=? AND activo=1').get(body.plan_codigo);if(!p)throw fail(409,'Plan inexistente o inactivo.');s={plan_id:p.id,plan_codigo:p.codigo,precio_asignado_centavos:p.precio_centavos,moneda:p.moneda,periodicidad:p.periodicidad,limite_sucursales_asignado:p.limite_sucursales,limite_usuarios_asignado:p.limite_usuarios,multisucursal:!!p.multisucursal,personalizada:false};}
   const actual=await remote().uso(r.empresa_web_id);validUsage(actual,r.empresa_web_id);transaction(()=>saveUsage(id,actual));
   if(exception&&actual.plan_codigo!==s.plan_codigo)throw fail(409,'El plan remoto difiere del asignado: concilia antes de una excepción.','PLAN_DESINCRONIZADO');
   const command=randomUUID(),payload={command_id:command,motivo:body.motivo.trim(),administrador:administrator,version_condiciones:(BigInt(actual.version_condiciones)+1n).toString(),limite_sucursales:s.limite_sucursales_asignado,limite_usuarios:s.limite_usuarios_asignado,multisucursal:!!s.multisucursal,...(!exception?{plan_codigo:s.plan_codigo}:{})};
   const c={command_id:command,empresa_id:id,empresa_web_id:r.empresa_web_id,accion:exception?'AJUSTAR_LIMITES':'ASIGNAR_PLAN',administrador:administrator,motivo:payload.motivo,payload_json:JSON.stringify(payload),snapshot_json:JSON.stringify(s),anterior_json:JSON.stringify(assigned(id)||actual)};
   transaction(()=>{db.prepare("INSERT INTO web_commercial_commands(command_id,empresa_id,empresa_web_id,accion,administrador,motivo,payload_json,snapshot_json,anterior_json,resultado) VALUES (?,?,?,?,?,?,?,?,?,'SOLICITADO')").run(c.command_id,id,r.empresa_web_id,c.accion,administrator,c.motivo,c.payload_json,c.snapshot_json,c.anterior_json);history(c,'SOLICITADO');});
   return execute(c);
  });
 }
 async function handle(method,route,body,query={},administrator='Administrador'){
  try{
   ready();
   if(method==='GET'&&route==='/api/web/comercial/planes')return {status:200,data:{rows:plans()}};
   if(method==='POST'&&route==='/api/web/comercial/planes/estado'){
    if(Object.keys(body).some(k=>!['codigo','activo','motivo'].includes(k))||typeof body.activo!=='boolean'||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'Plan, estado y motivo obligatorios.');
    const p=db.prepare('SELECT * FROM web_planes WHERE codigo=?').get(body.codigo);if(!p)throw fail(404,'Plan no encontrado.');
    transaction(()=>{db.prepare('UPDATE web_planes SET activo=?,updated_at=CURRENT_TIMESTAMP WHERE codigo=?').run(body.activo?1:0,body.codigo);history({command_id:randomUUID(),accion:'ESTADO_CATALOGO',administrador:administrator,motivo:body.motivo.trim(),anterior_json:JSON.stringify({codigo:p.codigo,activo:!!p.activo}),snapshot_json:JSON.stringify({codigo:p.codigo,activo:body.activo})},'APLICADO');});return {status:200,data:{rows:plans()}};
   }
   if(method==='GET'&&route==='/api/web/comercial/empresas')return {status:200,data:{rows:db.prepare('SELECT id FROM web_empresas').all().map(r=>view(r.id))}};
   if(method==='GET'&&route==='/api/web/comercial/historial')return {status:200,data:{rows:db.prepare("SELECT h.*,w.razon_social,w.empresa_codigo FROM web_commercial_history h LEFT JOIN web_empresas w ON w.id=h.empresa_id WHERE (?='' OR h.empresa_id=?) ORDER BY h.id DESC LIMIT 200").all(query.empresa||'',query.empresa||'').map(r=>({...r,anterior:r.anterior_json?JSON.parse(r.anterior_json):null,nuevo:r.nuevo_json?JSON.parse(r.nuevo_json):null}))}};
   const match=route.match(/^\/api\/web\/comercial\/empresas\/([a-f0-9-]+)\/(plan|limites|uso|reintentar)$/i);
   if(match&&method==='POST'){
    const id=match[1];company(id);
    if(match[2]==='uso'){if(Object.keys(body).length)throw fail(400,'Consulta sin campos.');const r=company(id);if(!r.empresa_web_id)throw fail(409,'Sin referencia WEB.');const u=await remote().uso(r.empresa_web_id);validUsage(u,r.empresa_web_id);transaction(()=>saveUsage(id,u));return {status:200,data:view(id)};}
    if(match[2]==='reintentar'){if(Object.keys(body).some(k=>k!=='command_id'))throw fail(400,'Reintento inválido.');const c=db.prepare('SELECT * FROM web_commercial_commands WHERE command_id=? AND empresa_id=?').get(body.command_id,id);if(!c)throw fail(404,'Comando no encontrado.');if(c.resultado==='APLICADO')return {status:200,data:{...view(id),command_id:c.command_id,replayed:true}};if(!c.retryable)throw fail(409,'Rechazo definitivo: reduce uso o elige otras condiciones.');return await exclusive(id,()=>execute(c));}
    return await change(id,body,administrator,match[2]==='limites');
   }
   return {status:404,data:{error:'Operación comercial no disponible. No se eliminan planes.'}};
  }catch(e){return {status:e.status||502,data:{error:e.status?e.message:'No se pudo consultar o confirmar WEB.',code:e.code||'COMERCIAL_ERROR'}};}
 }
 return {handle,view};
}
