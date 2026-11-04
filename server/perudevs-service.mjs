import {createCipheriv,createDecipheriv,createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

const CONFIG_KEY='perudevs_api_config';
const LOOKUP_PATH='/api/internal/perudevs/lookup';
const clean=(value,max=300)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
const fail=(status,message,code='PERUDEVS_ERROR')=>Object.assign(Error(message),{status,code});

function encryptionKey(environment){
 const raw=environment.PERUDEVS_ENCRYPTION_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(raw))throw fail(503,'Falta configurar la clave de cifrado del servicio PeruDevs.','PERUDEVS_CIPHER_UNAVAILABLE');
 return Buffer.from(raw,'hex');
}
function encryptToken(token,environment){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(environment),iv);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
function decryptToken(value,environment){
 try{const [version,iv,tag,ciphertext]=String(value||'').split('.');if(version!=='v1')throw Error();const decipher=createDecipheriv('aes-256-gcm',encryptionKey(environment),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');}
 catch{throw fail(503,'No se pudo descifrar la configuración PeruDevs. Verifica la clave de cifrado de este entorno.','PERUDEVS_CIPHER_ERROR');}
}
function currentConfig(db){const row=db.prepare('SELECT value FROM settings WHERE key=?').get(CONFIG_KEY);if(!row)return {enabled:false,configured:false,token_enc:null,token_hint:null};try{return {...JSON.parse(row.value),configured:true};}catch{return {enabled:false,configured:false,token_enc:null,token_hint:null};}}
function saveConfig(db,environment,body){
 if(Object.keys(body||{}).some(k=>!['token','enabled'].includes(k))||typeof body?.enabled!=='boolean')throw fail(400,'Configuración inválida.');
 const old=currentConfig(db),token=typeof body.token==='string'?body.token.trim():'';
 if(token&&(token.length<16||token.length>512||/\s/.test(token)))throw fail(400,'El token PeruDevs no tiene un formato válido.');
 const encrypted=token?encryptToken(token,environment):old.token_enc;
 if(body.enabled&&!encrypted)throw fail(400,'Ingresa el token PeruDevs antes de habilitar las consultas.');
 const value=JSON.stringify({enabled:body.enabled,token_enc:encrypted||null,token_hint:token?token.slice(-4):old.token_hint||null,updated_at:new Date().toISOString()});
 db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(CONFIG_KEY,value);
 return {enabled:body.enabled,configured:!!encrypted,token_hint:token?token.slice(-4):old.token_hint||null,updated_at:JSON.parse(value).updated_at};
}
function limaStarts(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return {today:`${v.year}-${v.month}-${v.day}T00:00:00-05:00`,month:`${v.year}-${v.month}-01T00:00:00-05:00`};
}
function usage(db){
 const {today,month}=limaStarts();
 const r=db.prepare(`SELECT COUNT(*) total,
  SUM(CASE WHEN operation='DNI' THEN 1 ELSE 0 END) dni,
  SUM(CASE WHEN operation='RUC' THEN 1 ELSE 0 END) ruc,
  SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) mes,
  SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) hoy,
  SUM(CASE WHEN outcome IN('ERROR_API','ERROR_HTTP','ERROR_TIMEOUT') THEN 1 ELSE 0 END) errores
  FROM perudevs_usage_events`).get(month,today);
 return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v||0)]));
}
function record(db,operation,outcome){db.prepare('INSERT INTO perudevs_usage_events(operation,outcome,created_at) VALUES(?,?,?)').run(operation,outcome,new Date().toISOString());}
function verifySignature(req,body,environment){
 const secret=environment.PANEL_WEB_SERVICE_SECRET||'',stamp=req.headers['x-eduxfac-time']||'',nonce=req.headers['x-eduxfac-nonce']||'',signature=req.headers['x-eduxfac-signature']||'',scope=req.headers['x-eduxfac-scope']||'';
 if(secret.length<32||scope!=='perudevs:lookup'||!/^\d{10}$/.test(String(stamp))||Math.abs(Math.floor(Date.now()/1000)-Number(stamp))>120||!/^\w{20,80}$/.test(String(nonce))||! /^[a-f0-9]{64}$/i.test(String(signature)))throw fail(401,'Solicitud de servicio no autorizada.','SERVICE_UNAUTHORIZED');
 const raw=JSON.stringify(body),canonical=['POST',LOOKUP_PATH,scope,String(stamp),String(nonce),createHash('sha256').update(raw).digest('hex')].join('\n'),expected=createHmac('sha256',secret).update(canonical).digest();
 let supplied;try{supplied=Buffer.from(signature,'hex');}catch{supplied=Buffer.alloc(0);}
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw fail(401,'Solicitud de servicio no autorizada.','SERVICE_UNAUTHORIZED');
 return String(nonce);
}
function responseRecord(operation,document,json){
 if(json?.estado!==true||!json?.resultado||typeof json.resultado!=='object')return null;
 const r=json.resultado,returned=String(r.id||'').replace(/\D/g,'');if(returned&&returned!==document)return null;
 if(operation==='RUC'){
  const nombres=clean(r.razon_social||r.nombre_comercial,180);if(!nombres)return null;
  return {tipo_doc:'RUC',nro_doc:document,nombres,direccion:clean(r.direccion,220)||null};
 }
 const nombres=clean(r.nombre_completo||[r.nombres,r.apellido_paterno,r.apellido_materno].filter(Boolean).join(' '),180);
 if(!nombres)return null;
 return {tipo_doc:'DNI',nro_doc:document,nombres,direccion:null};
}
async function lookup(db,environment,body,{fetchImpl=globalThis.fetch}={}){
 const document=String(body?.document||''),tenant=String(body?.tenant_id||''),operation=document.length===8?'DNI':document.length===11?'RUC':'';
 if(!/^[0-9a-f-]{36}$/i.test(tenant)||!operation||!/^\d+$/.test(document))throw fail(400,'Ingresa un DNI de 8 dígitos o RUC de 11 dígitos.','DOCUMENT_INVALID');
 const config=currentConfig(db);if(!config.enabled||!config.token_enc)throw fail(503,'La consulta DNI/RUC no está habilitada por el administrador.','PERUDEVS_DISABLED');
 const token=decryptToken(config.token_enc,environment),endpoint=operation==='RUC'?'https://api.perudevs.com/api/v1/ruc':'https://api.perudevs.com/api/v1/dni/simple';
 const url=new URL(endpoint);url.searchParams.set('document',document);url.searchParams.set('key',token);
 const start=Date.now();let outcome='ERROR_API';
 try{
  const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(operation==='RUC'?25000:10000),redirect:'error'});
  if(!response.ok){outcome='ERROR_HTTP';record(db,operation,outcome);throw fail(502,'PeruDevs no pudo completar la consulta. Reintenta más tarde.','PERUDEVS_PROVIDER_ERROR');}
  let payload;try{payload=await response.json();}catch{outcome='ERROR_API';record(db,operation,outcome);throw fail(502,'PeruDevs devolvió una respuesta inválida.','PERUDEVS_PROVIDER_ERROR');}
  if(payload?.estado===false&&!/no\s+(?:encontrad|existe)|sin resultados/i.test(String(payload.mensaje||''))){record(db,operation,'ERROR_API');throw fail(502,'PeruDevs no pudo completar la consulta. Revisa el saldo o la configuración del proveedor.','PERUDEVS_PROVIDER_ERROR');}
  const result=responseRecord(operation,document,payload);outcome=result?'ENCONTRADO':'NO_ENCONTRADO';record(db,operation,outcome);
  return {found:!!result,client:result,operation,elapsed_ms:Date.now()-start};
 }catch(error){
  if(error.code==='PERUDEVS_PROVIDER_ERROR')throw error;
  outcome=error.name==='TimeoutError'||error.name==='AbortError'?'ERROR_TIMEOUT':'ERROR_API';record(db,operation,outcome);
  throw fail(502,outcome==='ERROR_TIMEOUT'?'La consulta a PeruDevs agotó el tiempo de espera. Reintenta.':'No se pudo consultar PeruDevs. Revisa la conexión del servicio.','PERUDEVS_UNAVAILABLE');
 }
}

export function createPerudevsService({db,environment=process.env,fetchImpl=globalThis.fetch}={}){
 const admin=async(method,path,body={},request={})=>{
  if(path==='/api/perudevs/config'&&method==='GET'){
   const c=currentConfig(db);return {status:200,data:{enabled:c.enabled===true,configured:!!c.token_enc,token_hint:c.token_hint||null,updated_at:c.updated_at||null,usage:usage(db)}};
  }
  if(path==='/api/perudevs/config'&&method==='POST'){
   try{const result=saveConfig(db,environment,body);db.prepare('INSERT INTO history(event,detail) VALUES (?,?)').run('CONFIGURACION_PERUDEVS','Servicio '+(result.enabled?'habilitado':'deshabilitado')+' desde Planes WEB.');return {status:200,data:{...result,usage:usage(db)}};}catch(e){return {status:e.status||400,data:{error:e.message,code:e.code||'PERUDEVS_CONFIG_ERROR'}};}
  }
  if(path==='/api/internal/perudevs/lookup'&&method==='POST'){
   try{
    const nonce=verifySignature(request,body,environment);
    db.prepare('DELETE FROM perudevs_request_nonces WHERE created_at<?').run(new Date(Date.now()-10*60*1000).toISOString());
    try{db.prepare('INSERT INTO perudevs_request_nonces(nonce,created_at) VALUES(?,?)').run(nonce,new Date().toISOString());}
    catch{throw fail(409,'Solicitud de servicio repetida.','SERVICE_REPLAY');}
    const data=await lookup(db,environment,body,{fetchImpl});return {status:200,data};
   }catch(e){return {status:e.status||400,data:{error:e.message,code:e.code||'PERUDEVS_ERROR'}};}
  }
  return {status:404,data:{error:'Operación PeruDevs no disponible.'}};
 };
 return {admin};
}
