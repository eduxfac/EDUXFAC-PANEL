import {randomUUID} from 'node:crypto';
const ready=(db,t)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(t);
export function createPanelRuntime({db,transaction,auth,operations}){
 function health(){
 const database=db.health?.()||{estado:'OK',engine:'sqlite'};
 const web=ready(db,'integration_health')?db.prepare("SELECT estado,checked_ms,checked_at,latencia_ms FROM integration_health WHERE id='WEB'").get():null;
 const queue=ready(db,'integration_queue')?{pendientes:db.prepare("SELECT count(*) n FROM integration_queue WHERE estado IN('SOLICITADO','PENDIENTE','REINTENTO') OR(estado='ERROR' AND retryable=1 AND intentos<max_intentos)").get().n,errores:db.prepare("SELECT count(*) n FROM integration_queue WHERE estado='ERROR'").get().n}:{pendientes:null,errores:null};
 const outdated=!web||Date.now()-web.checked_ms>300000;
 return {estado:database.estado==='ERROR'?'ERROR':outdated||web.estado!=='ONLINE'||queue.errores?'DEGRADADO':'OK',app:'OK',db:database,web_api:outdated?'DEGRADADO':web.estado==='ONLINE'?'OK':'ERROR',web_ultima_comprobacion:web?.checked_at||null,workers:operations.config,cola:queue,fecha:new Date().toISOString()};
 }
 function handle(principal,method,path,body){
 if(method==='GET'&&path==='/api/admin/health')return {status:200,data:health()};
 const m=path.match(/^\/api\/admin\/recovery\/([1-9]\d*)\/decision$/);
 if(method==='POST'&&m){
 if(!auth.authorize(principal,method,path))return {status:403,data:{error:'No tienes permiso para revisar una recuperación.'}};
 if(Object.keys(body).some(k=>!['decision','motivo'].includes(k))||!['APROBAR_REVISION','RECHAZAR'].includes(body.decision)||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)return {status:400,data:{error:'Decisión y motivo obligatorios.'}};
 try{return transaction(()=>{
 if(!auth.authorize(principal,method,path))return {status:403,data:{error:"Acceso invalidado."}};
 const r=db.prepare('SELECT r.*,d.license_id,d.status device_status FROM recovery_requests r JOIN authorized_devices d ON d.id=r.device_id WHERE r.id=?').get(Number(m[1]));
 if(!r)return {status:404,data:{error:'Solicitud no encontrada.'}};
 if(r.status!=='PENDIENTE')return {status:409,data:{error:'La solicitud ya fue revisada.'}};
 const status=body.decision==='RECHAZAR'?'RECHAZADA':'REVISION_APROBADA_REQUIERE_REINSTALACION';
 db.prepare('UPDATE recovery_requests SET status=? WHERE id=? AND status=\'PENDIENTE\'').run(status,r.id);
 db.prepare('INSERT INTO license_events(license_id,device_id,event,detail,administrator,reason) VALUES(?,?,?,?,?,?)').run(r.license_id,r.device_id,'RECUPERACION_REVISADA',status,principal.username,body.motivo.trim());
 auth.audit(principal.id,principal.id,'RECUPERACION_REVISADA','OK',body.motivo.trim());
 return {status:200,data:{estado:status,recuperacion_ejecutada:false,advertencia:'Solo revisión administrativa. La reinstalación requiere autorización y vínculo de equipo existentes; no se emitieron claves ni se cambió la licencia.'}};
 });}catch{return {status:409,data:{error:'No se pudo registrar la revisión.'}};}
 }
 return null;
 }
 return {health,handle};
}
