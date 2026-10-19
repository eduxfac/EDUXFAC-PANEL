import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {nextBackoff} from './integration-config.mjs';
const context=new AsyncLocalStorage();
export const hasIntegrationSchema=db=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='integration_queue'").get();
export const withQueueLease=(owner,fn)=>context.run(owner,fn);
export function applyIntegrationMigrations(db){
 if(!db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='004_web_subscriptions'").get())throw Error('Primero aplicar Fase 5.');
 if(db.prepare("SELECT 1 FROM web_schema_migrations WHERE version='005_web_operations'").get())return;
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../database/web-migrations/005_web_operations.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO web_schema_migrations(version) VALUES(?)').run('005_web_operations');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export const sourceTables={ESTADOS:'web_state_commands',COMERCIAL:'web_commercial_commands',SUSCRIPCIONES:'web_subscription_commands'};
const keys={ESTADOS:['command_id','motivo','administrador'],COMERCIAL:['command_id','motivo','administrador','version_condiciones','plan_codigo','limite_sucursales','limite_usuarios','multisucursal'],SUSCRIPCIONES:['command_id','motivo','administrador','suscripcion_id','version_esperada','version_condiciones','fecha_inicio','fecha_autorizada','meses']};
export function safePayload(origin,row){
 const p=origin==='ESTADOS'?row:JSON.parse(row.payload_json);return Object.fromEntries(keys[origin].map(k=>[k,k==='multisucursal'&&p[k]!=null?!!p[k]:p[k]??null]));
}
const knownErrors=new Set(['COMUNICACION_SIN_CONFIRMAR','COMUNICACION_SIN_CONFIRMAR','ERROR_INTERNO','ERROR_API','WEB_OFFLINE','WEB_HEALTH_INVALIDO','RESPUESTA_INVALIDA','RESPUESTA_DESACTUALIZADA','PLAN_DESINCRONIZADO','USO_SUPERA_PLAN','VERSION_SUSCRIPCION_CONFLICTO','COMANDO_REUTILIZADO','EMPRESA_CANCELADA','SUSCRIPCION_AJENA','SUSCRIPCION_EXISTENTE','FECHA_RENOVACION_INVALIDA','VIGENCIA_NO_FUTURA','ECONNREFUSED','ETIMEDOUT','COMANDO_PENDIENTE','ALTA_INCOMPLETA','REINTRODUCIR_CREDENCIAL','CONFLICTO_AMBIGUO','REINTENTOS_AGOTADOS','COMANDO_EN_PROCESO','PAYLOAD_NO_COINCIDE','ESQUEMA_SUSCRIPCIONES_PENDIENTE','ESQUEMA_ACCESO_PENDIENTE','ESQUEMA_PLANES_PENDIENTE','CONSULTA_SIN_CONFIRMAR','ERROR_SINCRONIZACION']);
export const safeError=error=>knownErrors.has(typeof error==='string'?error:error?.code)?(typeof error==='string'?error:error.code):'ERROR_API';
export function operationalLog(db,{command=null,company=null,action='INTEGRACION',state='ERROR',duration=0,result='ERROR',error=null}){
 if(!hasIntegrationSchema(db))return;
 const actions=new Set(['SUSPENDER','REACTIVAR','VENCER','CANCELAR','ACTIVAR','ASIGNAR_PLAN','AJUSTAR_LIMITES','ALTA','RENOVAR','CONCILIAR','CONSULTAR','HEALTH','WORKER','CANCELAR_REINTENTO','VENCIMIENTO','INTEGRACION']);
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 db.prepare('INSERT INTO integration_logs(command_id,empresa_id,accion,estado,duracion_ms,resultado,error) VALUES(?,?,?,?,?,?,?)').run(uuid.test(String(command))?command:null,uuid.test(String(company))?company:null,actions.has(action)?action:'INTEGRACION',['SOLICITADO','PENDIENTE','APLICADO','ERROR','REINTENTO','CANCELADO','SINCRONIZADO','DESINCRONIZADO','ONLINE','OFFLINE'].includes(state)?state:'ERROR',Math.max(0,Math.floor(Number(duration)||0)),['OK','ERROR','OMITIDO','APLICADO','CANCELADO'].includes(result)?result:'ERROR',error?safeError(error):null);
}
function atomic(db,fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
const fail=(code,message)=>Object.assign(new Error(message),{status:409,code});
export function captureLegacyCommands(db,now=Date.now()){
 if(!hasIntegrationSchema(db))return;
 atomic(db,()=>{
 for(const [origin,table]of Object.entries(sourceTables))for(const c of db.prepare('SELECT c.* FROM '+table+' c LEFT JOIN integration_queue q ON q.command_id=c.command_id WHERE q.command_id IS NULL OR q.origen<>?').all(origin)){
  const prior=db.prepare('SELECT origen FROM integration_queue WHERE command_id=?').get(c.command_id);
  if(prior&&prior.origen!==origin)throw fail('COMANDO_REUTILIZADO','Comando ambiguo entre colas.');
  if(!prior)db.prepare('INSERT INTO integration_queue(id,command_id,empresa_id,origen,tipo_accion,payload_seguro,estado,intentos,max_intentos,retryable,ultimo_error,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),c.command_id,c.empresa_id,origin,c.accion,JSON.stringify(safePayload(origin,c)),c.resultado,c.intentos,db.prepare("SELECT value FROM integration_settings WHERE key='max_intentos'").get().value,c.retryable,c.error? safeError(c.error):null,c.resultado==='APLICADO'?c.updated_at:null);
 }
 for(const r of db.prepare("SELECT * FROM integration_queue WHERE estado='ERROR' AND retryable=1 AND proximo_reintento IS NULL AND intentos<max_intentos").all())db.prepare('UPDATE integration_queue SET proximo_reintento=? WHERE command_id=?').run(now+nextBackoff(Math.max(1,r.intentos)),r.command_id);
 });
}
export function claimDispatch(db,command,{now=Date.now(),owner=context.getStore()||randomUUID(),manual=true}={}){
 if(!hasIntegrationSchema(db))return null;
 const claimed=atomic(db,()=>{
 const r=db.prepare('SELECT * FROM integration_queue WHERE command_id=?').get(command);
 if(!r)throw fail('COMANDO_PENDIENTE','Comando no registrado en cola persistente.');
 if(r.lease_owner===owner&&context.getStore()===owner&&r.lease_until>now)return {command,owner,owned:false,started:now};
 if(['APLICADO','CANCELADO'].includes(r.estado)||!r.retryable&&r.estado==='ERROR')throw fail('COMANDO_PENDIENTE','Comando terminado o requiere revisión.');
 if(r.intentos>=r.max_intentos)throw fail('REINTENTOS_AGOTADOS','Se alcanzó el máximo de intentos; revisa el comando.');
 if(r.lease_owner&&r.lease_until>now)throw fail('COMANDO_EN_PROCESO','Otro proceso está ejecutando este comando.');
 if(!manual&&r.proximo_reintento!=null&&r.proximo_reintento>now)throw fail('COMANDO_PENDIENTE','Todavía no corresponde reintentar.');
 const source=db.prepare('SELECT * FROM '+sourceTables[r.origen]+' WHERE command_id=?').get(command);
 const normalized=p=>Object.fromEntries(keys[r.origen].map(k=>[k,k==='multisucursal'&&p[k]!=null?!!p[k]:p[k]??null]));
 let intact=false;try{const raw=JSON.parse(r.payload_seguro),original=r.origen==='ESTADOS'?null:JSON.parse(source?.payload_json||'null');intact=!!source&&source.empresa_id===r.empresa_id&&source.accion===r.tipo_accion&&raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).every(k=>keys[r.origen].includes(k))&&(r.origen==='ESTADOS'||original&&typeof original==='object'&&!Array.isArray(original)&&Object.keys(original).every(k=>keys[r.origen].includes(k)))&&JSON.stringify(normalized(raw))===JSON.stringify(safePayload(r.origen,source));}catch{intact=false;}
 if(!intact){db.prepare("UPDATE integration_queue SET estado='ERROR',retryable=0,ultimo_error='PAYLOAD_NO_COINCIDE',proximo_reintento=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(command);operationalLog(db,{command,company:r.empresa_id,action:r.tipo_accion,state:'ERROR',result:'ERROR',error:'PAYLOAD_NO_COINCIDE'});return {blocked:true};}
 db.prepare("UPDATE integration_queue SET lease_owner=?,lease_until=?,estado=?,intentos=intentos+1,proximo_reintento=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=?").run(owner,now+120000,r.estado==='SOLICITADO'?'PENDIENTE':'REINTENTO',command);
 return {command,owner,owned:true,started:now};
 });if(claimed.blocked)throw fail('PAYLOAD_NO_COINCIDE','El comando seguro difiere del original; revisión requerida.');return claimed;
}
export function finishDispatch(db,lease,{now=Date.now(),override=null}={}){
 if(!lease?.owned||!hasIntegrationSchema(db))return;
 atomic(db,()=>{
 const r=db.prepare('SELECT * FROM integration_queue WHERE command_id=? AND lease_owner=?').get(lease.command,lease.owner);if(!r)return;
 const state=override?.state||r.estado,code=override?.error||r.ultimo_error,retryable=override?.retryable??r.retryable;
 const next=state==='ERROR'&&retryable&&r.intentos<r.max_intentos?now+nextBackoff(r.intentos):null;
 const error=state==='ERROR'?(r.intentos>=r.max_intentos?'REINTENTOS_AGOTADOS':safeError(code)):null;
 db.prepare('UPDATE integration_queue SET estado=?,retryable=?,ultimo_error=?,proximo_reintento=?,lease_owner=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE command_id=? AND lease_owner=?').run(state,retryable?1:0,error,next,r.command_id,lease.owner);
 const duration=Math.max(0,now-lease.started);
 db.prepare('INSERT OR IGNORE INTO integration_attempts(command_id,empresa_id,accion,intento,estado,duracion_ms,resultado,error) VALUES(?,?,?,?,?,?,?,?)').run(r.command_id,r.empresa_id,r.tipo_accion,r.intentos,state,duration,state==='APLICADO'?'APLICADO':'ERROR',error);
 operationalLog(db,{command:r.command_id,company:r.empresa_id,action:r.tipo_accion,state,duration,result:state==='APLICADO'?'APLICADO':'ERROR',error});
 });
}
