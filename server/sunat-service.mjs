import {cpeRequest} from './cpe-client.mjs';
import {createWebApiClient} from './web-api-client.mjs';
const id=value=>{if(!/^[a-f0-9-]{36}$/.test(String(value)))throw Object.assign(Error('Identificador inválido.'),{status:400});return value;};
export async function panelSunat({db,principal,method,path,query,body}){
 try{
  const write=method!=='GET';if(!['SUPERADMIN','ADMIN'].includes(principal.role)&&write)return {status:403,data:{error:'Solo administradores pueden configurar SUNAT.'}};
  if(path==='/api/sunat/empresas'&&method==='GET')return {status:200,data:{rows:db.prepare('SELECT id,razon_social,empresa_codigo,empresa_web_id,steps_json FROM web_empresas WHERE empresa_web_id IS NOT NULL ORDER BY razon_social').all().map(({steps_json,...r})=>({...r,sucursal_principal:JSON.parse(steps_json).sucursal||null}))}};
  const match=path.match(/^\/api\/sunat\/([a-f0-9-]+)\/(branches|configuration|certificate|series|documents|batches)(?:\/([a-f0-9-]+)\/(sign|send|consult|events|files\/(xml|zip|cdr|pdf|ticket)))?$/);if(!match)return {status:404,data:{error:'Ruta SUNAT no encontrada.'}};
  const company=db.prepare('SELECT * FROM web_empresas WHERE id=?').get(id(match[1]));if(!company?.empresa_web_id)return {status:404,data:{error:'Empresa WEB no vinculada.'}};
  const remote=await createWebApiClient().fiscalBranches(company.empresa_web_id),branches=remote.rows;
  if(match[2]==='branches'&&method==='GET')return {status:200,data:remote};
  let route;
  if(match[3]){
   const doc=await cpeRequest('panel',company.empresa_web_id,'/v1/'+match[2]+'/'+id(match[3]));if(!branches.some(b=>b.id===doc.branch_id))return {status:403,data:{error:'Sucursal ajena a la empresa.'}};
   route='/v1/'+match[2]+'/'+id(match[3])+'/'+match[4];
  }else{
   const branch=method==='GET'?query.branch_id:body.branch_id;if(!branches.some(b=>b.id===id(branch)))return {status:403,data:{error:'Sucursal ajena a la empresa.'}};
   route='/v1/'+match[2]+(method==='GET'?'?'+new URLSearchParams({branch_id:branch,environment:query.environment||'beta'}):'');
  }
  if(write&&match[2]==='series'&&body.enabled===false){const settings=branches.find(b=>b.id===body.branch_id)?.sunat;if(settings?.habilitado&&settings.ambiente===body.environment&&((body.doc_type==='01'&&settings.serie_factura===body.serie)||(body.doc_type==='03'&&settings.serie_boleta===body.serie)||Object.entries(settings.series_notas||{}).some(([type,serie])=>type.startsWith(body.doc_type)&&serie===body.serie)))throw Object.assign(Error('Esta serie está seleccionada para checkout. Selecciona otra o deshabilita facturación antes de desactivarla.'),{status:409});}
  const result=await cpeRequest('panel',company.empresa_web_id,route,write?body:undefined);
  if(!write&&match[2]==='configuration'){
   const branch=branches.find(b=>b.id===query.branch_id);result.web_settings=branch?.sunat||null;
   if(!result.config){const fiscal=db.prepare('SELECT * FROM web_sucursales_fiscales WHERE empresa_id=? AND es_principal=1').get(company.id);if(branch?.es_principal&&fiscal)result.suggested_config={ruc:fiscal.ruc,razon_social:fiscal.razon_social,nombre_comercial:fiscal.nombre_comercial,direccion:fiscal.direccion_fiscal,ubigeo:fiscal.ubigeo,departamento:fiscal.departamento,provincia:fiscal.provincia,distrito:fiscal.distrito,codigo_local:fiscal.codigo_ccea,correo:fiscal.correo_cpe};}
  }
  if(write&&match[2]==='configuration'&&body.enabled===true){
   if(!result.certificate||!result.credentials_configured)throw Object.assign(Error('Datos fiscales guardados. Carga certificado y credenciales SOL antes de habilitar ventas.'),{status:409});
   const series=await cpeRequest('panel',company.empresa_web_id,'/v1/series?'+new URLSearchParams({branch_id:body.branch_id,environment:body.environment}));
   for(const [type,serie]of [['01',body.invoice_series||'F001'],['03',body.receipt_series||'B001']])if(!series.rows.some(s=>s.doc_type===type&&s.serie===serie&&s.enabled))throw Object.assign(Error('Datos fiscales guardados. Configura y habilita las series de factura y boleta antes de activar ventas.'),{status:409});
  }
  if(write&&match[2]==='configuration')await createWebApiClient().saveSunatConfig(company.empresa_web_id,{branch_id:body.branch_id,environment:body.environment,config:result.config,enabled:body.enabled===true,auto_send:body.auto_send===true,note_series:body.note_series||branches.find(b=>b.id===body.branch_id)?.sunat?.series_notas||{'07F':'FC01','07B':'BC01','08F':'FD01','08B':'BD01'},invoice_series:body.invoice_series||'F001',receipt_series:body.receipt_series||'B001'});
  if(write)db.prepare('INSERT INTO history(event,detail) VALUES (?,?)').run('SUNAT_ADMINISTRACION',principal.username+': '+match[2]+' / '+company.empresa_codigo);
  return {status:200,data:result};
 }catch(e){return {status:e.status||503,data:{error:e.status?e.message:'No se pudo completar la operación SUNAT.'}};}
}
