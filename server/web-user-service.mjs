import {createWebApiClient} from './web-api-client.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,code)=>Object.assign(Error(code),{status,code});
export function createWebUserService({db,webApiClient}){
 return {async handle({principal,method,path,body={},ip}){
  const m=path.match(/^\/api\/web\/empresas\/([a-f0-9-]+)\/usuarios(?:\/([a-f0-9-]+)\/reset-password)?$/i);
  if(!m)return null;
  try{
   const reset=method==='POST'&&!!m[2];
   if(!(method==='GET'&&!m[2]||reset))throw fail(405,'METHOD_NOT_ALLOWED');
   const permission=reset?'web.companies.write':'web.companies.read';
   if(!principal||principal.must_change_password||!['SUPERADMIN','ADMIN'].includes(principal.role)||(!principal.legacy&&!principal.permissions?.includes(permission)))throw fail(403,'PERMISSION_DENIED');
   if(!uuid.test(m[1])||m[2]&&!uuid.test(m[2]))throw fail(400,'INVALID_ID');
   if(Object.keys(body).some(k=>!['confirmar','request_id'].includes(k)))throw fail(400,'INVALID_INPUT');
   const company=db.prepare('SELECT id,empresa_web_id,razon_social,ruc FROM web_empresas WHERE id=?').get(m[1]);
   if(!company)throw fail(404,'COMPANY_NOT_FOUND');
   if(!company.empresa_web_id)throw fail(409,'COMPANY_NOT_LINKED');
   const api=webApiClient||createWebApiClient();
   if(!api.listCompanyUsers||!api.resetCompanyUser)throw fail(503,'WEB_USER_API_REQUIRED');
   const result=await api.listCompanyUsers(company.empresa_web_id,{actor:principal.username});
   if(result?.empresa_id!==company.empresa_web_id||result.user_management_version!==1||!Array.isArray(result.users))throw fail(502,'INVALID_WEB_RESPONSE');
   // Explicit allowlist: a compromised or obsolete upstream must never expose credentials.
   const publicData={empresa_id:company.empresa_web_id,razon_social:company.razon_social,ruc:company.ruc,user_management_version:1,
    empresa:Object.fromEntries(['empresa_activa','estado','fecha_inicio','fecha_vencimiento','auth_version','suscripcion_requerida','suscripcion_id','estado_suscripcion'].map(k=>[k,result.empresa?.[k]])),users:result.users.map(u=>({user_id:u.user_id,usuario:u.usuario,nombre:u.nombre,activo:u.activo,debe_cambiar_password:u.debe_cambiar_password,sucursales:(u.sucursales||[]).map(s=>({sucursal_id:s.sucursal_id,nombre:s.nombre,activo:s.activo,rol:s.rol})),roles:(u.roles||[]).map(String),empresa_estado:u.empresa_estado,suscripcion_estado:u.suscripcion_estado,login_ready:u.login_ready,reasons:u.reasons}))};
   if(!reset)return {status:200,data:publicData};
   if(body.confirmar!==true||!uuid.test(body.request_id||''))throw fail(400,'RESET_CONFIRMATION_REQUIRED');
   // WEB independently validates tenant ownership even if the Panel list was stale.
   const request_id=body.request_id;
   const response=await api.resetCompanyUser(company.empresa_web_id,m[2],{actor:principal.username,request_id,ip:ip||null});
   if(response?.empresa_id!==company.empresa_web_id||response.user_id!==m[2]||response.debe_cambiar_password!==true||response.session_invalidation!=='USER_PASSWORD_VERSION'||typeof response.temporary_password!=='string'||response.temporary_password.length<12)throw fail(502,'INVALID_RESET_RESPONSE');
   return {status:200,data:{empresa_id:response.empresa_id,user_id:response.user_id,usuario:response.usuario,temporary_password:response.temporary_password,debe_cambiar_password:true,request_id,session_invalidation:'USER_PASSWORD_VERSION'}};
  }catch(e){const status=[400,403,404,405,409,429,500,503].includes(e.status)?e.status:502;return {status,data:{code:/^[A-Z0-9_]{1,64}$/.test(e.code||'')?e.code:'WEB_USER_OPERATION_FAILED',error:status===503?'La gestión de usuarios no está disponible en WEB.':status===409?'Solicitud ya procesada o empresa sin vincular. Actualiza el listado antes de continuar.':'No se pudo completar la operación de usuarios.'}};}
 }};
}
