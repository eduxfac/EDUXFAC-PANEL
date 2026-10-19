import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createWebApiClient} from './web-api-client.mjs';
import {hasPlanSchema,requireAssignedConditions} from './web-plans.mjs';
import {hasSubscriptionSchema,requireConfirmedSubscription} from './web-subscriptions.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const problem=(status,message,code='ALTA_INVALIDA')=>Object.assign(new Error(message),{status,code});
function text(value,max){if(value==null)return '';if(typeof value!=='string'||value.trim().length>max)throw problem(400,'Tipo o longitud de campo inválido.');return value.trim();}
export function applyWebOnboardingMigrations(db){
 db.exec('CREATE TABLE IF NOT EXISTS web_schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 if(db.prepare('SELECT 1 FROM web_schema_migrations WHERE version=?').get('001_web_onboarding'))return;
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(fileURLToPath(new URL('../database/web-migrations/001_web_onboarding.sql',import.meta.url)),'utf8'));db.prepare('INSERT INTO web_schema_migrations(version) VALUES (?)').run('001_web_onboarding');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function createWebOnboardingService({db,transaction,audit,webApiClient,commercialService,subscriptionService}){
 const busy=new Set();
 const ready=()=>{if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='web_empresas'").get())throw problem(503,'Falta aplicar la migración local de alta WEB.','ESQUEMA_WEB_PENDIENTE');};
 const row=id=>{if(!uuid.test(String(id)))throw problem(400,'Alta inválida.');const draft=db.prepare('SELECT * FROM web_empresas WHERE id=?').get(id);if(!draft)throw problem(404,'Alta no encontrada.');return draft;};
 const view=r=>{const {commands_json,steps_json,...safe}=r;return {...safe,steps:JSON.parse(steps_json)};};
 const clientPayload=c=>({cliente_panel_id:c.public_id,nombre:c.name,tipo_documento:c.document_type,numero_documento:c.document_number,telefono:c.phone||null,correo:c.email||null,estado:c.status==='ACTIVO'?'ACTIVO':'INACTIVO'});
 function clientIdentity(id){const c=db.prepare('SELECT * FROM clients WHERE id=?').get(id);if(!c)throw problem(404,'Cliente no encontrado.');if(!c.public_id){const type=c.ruc?'RUC':c.dni?'DNI':'SIN_DOCUMENTO',number=c.ruc||c.dni||null;db.prepare('UPDATE clients SET public_id=?,document_type=?,document_number=? WHERE id=?').run(randomUUID(),type,number,id);return db.prepare('SELECT * FROM clients WHERE id=?').get(id);}return c;}
 function createClient(body){
  if(Object.keys(body).some(k=>!['nombre','tipo_documento','numero_documento','telefono','correo','estado'].includes(k)))throw problem(400,'Campos de cliente inválidos.');
  const name=text(body.nombre,120),type=text(body.tipo_documento,16),number=text(body.numero_documento,11)||null,phone=text(body.telefono,40)||null,email=text(body.correo,120)||null,status=body.estado||'ACTIVO';
  if(!name||!['ACTIVO','INACTIVO'].includes(status)||!((type==='DNI'&&/^\d{8}$/.test(number))||(type==='RUC'&&/^\d{11}$/.test(number))||(type==='SIN_DOCUMENTO'&&number===null))||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw problem(400,'Datos de cliente inválidos.');
  return transaction(()=>{if(number&&db.prepare('SELECT id FROM clients WHERE (document_type=? AND document_number=?) OR ruc=? OR dni=?').get(type,number,number,number))throw problem(409,'Documento ya registrado; selecciona el cliente existente.','CLIENTE_DUPLICADO');
   const result=db.prepare('INSERT INTO clients(name,ruc,dni,phone,email,status,public_id,document_type,document_number,updated_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(name,type==='RUC'?number:null,type==='DNI'?number:null,phone,email,status,randomUUID(),type,number);audit('CLIENTE_WEB_CREADO','Cliente #'+result.lastInsertRowid);return db.prepare('SELECT id,name,ruc,dni,phone,email,status,public_id,document_type,document_number,created_at FROM clients WHERE id=?').get(result.lastInsertRowid);});
 }
 function saveDraft(b){
  if(Object.keys(b).some(k=>!['id','cliente_id','razon_social','nombre_comercial','ruc','empresa_codigo','sucursal_nombre','administrador_nombre','administrador_usuario','plan_codigo','fecha_inicio_suscripcion'].includes(k)))throw problem(400,'El borrador no admite contraseñas ni campos adicionales.');
  const id=b.id||randomUUID(),client=Number(b.cliente_id),legal=text(b.razon_social,160),commercial=text(b.nombre_comercial,160)||null,ruc=text(b.ruc,11),code=text(b.empresa_codigo,40).toUpperCase(),branch=text(b.sucursal_nombre,120),name=text(b.administrador_nombre,120),user=text(b.administrador_usuario,40);
  if(!uuid.test(id)||!Number.isSafeInteger(client)||client<1||!legal||!/^\d{11}$/.test(ruc)||! /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)||!branch||!name||! /^[A-Za-z0-9._-]{3,40}$/.test(user))throw problem(400,'Completa cliente, empresa, sucursal y administrador.');
  return transaction(()=>{
   const c=clientIdentity(client);if(c.status!=='ACTIVO')throw problem(409,'El cliente contratante está inactivo.');
   const prior=db.prepare('SELECT * FROM web_empresas WHERE id=?').get(id);
   if(prior){if(hasPlanSchema(db)&&b.plan_codigo!==undefined&&prior.plan_seleccionado!==b.plan_codigo)throw problem(409,'El borrador ya tiene otro plan seleccionado; usa la asignación comercial explícita.');const values=[client,legal,commercial,ruc,code,branch,name,user],columns=['cliente_id','razon_social','nombre_comercial','ruc','empresa_codigo','sucursal_nombre','administrador_nombre','administrador_usuario'];if(columns.some((k,i)=>String(prior[k]??'')!==String(values[i]??'')))throw problem(409,'El borrador ya existe con otros datos.');return view(prior);}
   const commands=Object.fromEntries(['cliente','empresa','sucursal','administrador','activar'].map(step=>[step,randomUUID()]));
   db.prepare('INSERT INTO web_empresas(id,cliente_id,razon_social,nombre_comercial,ruc,empresa_codigo,sucursal_nombre,administrador_nombre,administrador_usuario,commands_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,client,legal,commercial,ruc,code,branch,name,user,JSON.stringify(commands));if(hasSubscriptionSchema(db)){if(typeof b.fecha_inicio_suscripcion!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_inicio_suscripcion))throw problem(400,'Define la fecha de inicio autorizada.');db.prepare('UPDATE web_empresas SET fecha_inicio_suscripcion=? WHERE id=?').run(b.fecha_inicio_suscripcion,id);}audit('ALTA_WEB_PENDIENTE','Alta '+id+' guardada sin contraseña.');if(hasPlanSchema(db)){if(b.plan_codigo&&!db.prepare('SELECT 1 FROM web_planes WHERE codigo=? AND activo=1').get(b.plan_codigo))throw problem(400,'Plan inválido o inactivo.');db.prepare('UPDATE web_empresas SET plan_seleccionado=? WHERE id=?').run(b.plan_codigo||null,id);}else if(b.plan_codigo)throw problem(503,'Falta la migración de planes.');return view(row(id));
  });
 }
 async function exclusive(id,fn){if(busy.has(id))throw problem(409,'El alta ya se está procesando.');busy.add(id);try{return await fn();}finally{busy.delete(id);}}
 const api=()=>webApiClient||createWebApiClient();
 function confirm(draft,step,result,key){
  if(!result||!uuid.test(String(result[key]||'')))throw problem(502,'Confirmación WEB inválida.');
  if(step!=='cliente'&&step!=='empresa'&&result.empresa_id!==draft.empresa_web_id)throw problem(502,'Confirmación de otra empresa rechazada.');
  transaction(()=>{const current=row(draft.id),steps=JSON.parse(current.steps_json);steps[step]=result[key];db.prepare("UPDATE web_empresas SET steps_json=?,empresa_web_id=coalesce(?,empresa_web_id),sync_status='CONFIRMADO',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(steps),step==='empresa'?result.empresa_id:null,draft.id);audit('ALTA_WEB_PASO_CONFIRMADO','Alta '+draft.id+': '+step);});
 }
 async function complete(id,password){return exclusive(id,async()=>{
  let draft=row(id);if(draft.estado==='ACTIVO')return {status:200,data:{empresa:view(draft)}};
  const steps=JSON.parse(draft.steps_json),commands=JSON.parse(draft.commands_json);let step='configuracion';
  try{
   const c=clientIdentity(draft.cliente_id);if(c.status!=='ACTIVO')throw problem(409,'Cliente inactivo.');
   if(!steps.administrador&&(typeof password!=='string'||password.length<12||Buffer.byteLength(password,'utf8')>72))throw problem(400,'Reintroduce la contraseña temporal de 12 caracteres o más, hasta 72 bytes.');
   const remote=api();
   for(const [name,key,call] of [
    ['cliente','cliente_id',()=>remote.crearCliente({...clientPayload(c),command_id:commands.cliente,motivo:'Alta WEB desde PANEL'})],
    ['empresa','empresa_id',()=>remote.crearEmpresa({cliente_id:JSON.parse(row(id).steps_json).cliente,razon_social:draft.razon_social,nombre_comercial:draft.nombre_comercial,ruc:draft.ruc,empresa_codigo:draft.empresa_codigo,command_id:commands.empresa,motivo:'Alta WEB desde PANEL'})],
    ['sucursal','sucursal_id',()=>remote.crearSucursalPrincipal(row(id).empresa_web_id,{nombre:draft.sucursal_nombre,command_id:commands.sucursal,motivo:'Alta WEB desde PANEL'})],
    ['administrador','usuario_id',()=>remote.crearAdministradorInicial(row(id).empresa_web_id,{nombre:draft.administrador_nombre,usuario:draft.administrador_usuario,password_temporal:password,sucursal_id:JSON.parse(row(id).steps_json).sucursal,command_id:commands.administrador,motivo:'Alta WEB desde PANEL'})]
   ]){step=name;if(name==='sucursal'&&hasPlanSchema(db)&&!db.prepare('SELECT 1 FROM web_company_conditions WHERE empresa_id=?').get(id)){step='plan';const selected=row(id).plan_seleccionado;if(!selected||!commercialService)throw problem(409,'Selecciona y confirma un plan antes de completar el alta.');const assigned=await commercialService.handle('POST','/api/web/comercial/empresas/'+id+'/plan',{plan_codigo:selected,motivo:'Plan inicial de alta WEB'}, {},db.prepare('SELECT username FROM admin WHERE id=1').get()?.username||'Administrador');if(assigned.status!==200)throw problem(assigned.status,'Plan inicial sin confirmar.');step=name;}if(JSON.parse(row(id).steps_json)[name])continue;draft=row(id);confirm(draft,name,await call(),key);}
   if(hasSubscriptionSchema(db)){step='suscripcion';if(!subscriptionService)throw problem(503,'Servicio de suscripción no disponible.');await subscriptionService.ensure(id,row(id).fecha_inicio_suscripcion);}draft=row(id);return {status:200,data:{empresa:view(draft),lista_para_activar:true}};
  }catch(error){transaction(()=>{db.prepare("UPDATE web_empresas SET sync_status='ERROR_DE_SINCRONIZACION',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run('No se pudo confirmar el paso '+step+'. Reintenta desde ese paso.',id);audit('ALTA_WEB_ERROR','Alta '+id+': '+step);});return {status:error.status===400?400:502,data:{error:'No se pudo completar el alta. Conserva el borrador y reintenta.',code:'ERROR_SINCRONIZACION',empresa:view(row(id))}};}
 });}
 async function activate(id){return exclusive(id,async()=>{
  requireAssignedConditions(db,id);requireConfirmedSubscription(db,id);
  const draft=row(id),steps=JSON.parse(draft.steps_json);if(draft.estado==='ACTIVO')return {status:200,data:{empresa:view(draft)}};
  if(!['cliente','empresa','sucursal','administrador'].every(k=>steps[k]))throw problem(409,'Completa todos los pasos antes de activar.','ALTA_INCOMPLETA');
  try{const result=await api().activar(draft.empresa_web_id,{command_id:JSON.parse(draft.commands_json).activar,motivo:'Activación final de alta WEB'});if(result.empresa_id!==draft.empresa_web_id||result.estado!=='ACTIVO')throw problem(502,'Confirmación de activación inválida.');await subscriptionService?.observe(id,'ACTIVAR',result.command_id||JSON.parse(draft.commands_json).activar,db.prepare('SELECT username FROM admin WHERE id=1').get()?.username||'Administrador','Activación final de alta WEB');transaction(()=>{db.prepare("UPDATE web_empresas SET estado='ACTIVO',sync_status='CONFIRMADO',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);audit('ALTA_WEB_ACTIVADA','Alta '+id+' confirmada por WEB.');});return {status:200,data:{empresa:view(row(id))}};}
  catch(error){transaction(()=>{db.prepare("UPDATE web_empresas SET sync_status='ERROR_DE_SINCRONIZACION',last_error='Activación sin confirmar. Reintenta.',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);});return {status:502,data:{error:'Activación sin confirmar.',code:'ERROR_SINCRONIZACION',empresa:view(row(id))}};}
 });}
 async function handle(method,route,body,query={}){
  try{ready();
   if(method==='GET'&&route==='/api/web/clientes'){const q=text(query.q,80);return {status:200,data:{rows:db.prepare("SELECT id,name,ruc,dni,phone,email,status,public_id,document_type,document_number,created_at FROM clients WHERE name LIKE ? OR coalesce(ruc,'') LIKE ? OR coalesce(dni,'') LIKE ? ORDER BY id DESC LIMIT 50").all('%'+q+'%','%'+q+'%','%'+q+'%')}};}
   if(method==='POST'&&route==='/api/web/clientes')return {status:201,data:createClient(body)};
   if(method==='GET'&&route==='/api/web/empresas')return {status:200,data:{rows:db.prepare('SELECT w.*,c.name cliente_nombre FROM web_empresas w JOIN clients c ON c.id=w.cliente_id ORDER BY w.created_at DESC,w.id LIMIT 200').all().map(view)}};
   if(method==='POST'&&route==='/api/web/empresas')return {status:201,data:{empresa:saveDraft(body)}};
   const match=route.match(/^\/api\/web\/empresas\/([a-f0-9-]+)\/(completar|activar)$/i);
   if(method==='POST'&&match){if(Object.keys(body).some(k=>!(match[2]==='completar'?['password_temporal']:[]).includes(k)))throw problem(400,'Campos de operación inválidos.');return match[2]==='completar'?await complete(match[1],body.password_temporal):await activate(match[1]);}
   return {status:404,data:{error:'Operación WEB no disponible.'}};
  }catch(error){const duplicate=String(error.code||'').startsWith('SQLITE_CONSTRAINT');return {status:duplicate?409:error.status||500,data:{error:duplicate?'Documento, RUC o código ya registrado.':error.status?error.message:'No se pudo procesar el alta WEB.',code:duplicate?'ALTA_DUPLICADA':error.code||'ALTA_ERROR'}};}
 }
 return {handle};
}
