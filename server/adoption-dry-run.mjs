const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function adoptionDryRun(rows,{fecha_inicio=null,fecha_vencimiento=null}={}){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('ADOPTION_INPUT_INVALID');
 const duplicates=new Set(),rucs=new Map(),codes=new Map();
 for(const x of rows){for(const [value,map]of [[x.ruc,rucs],[String(x.codigo||'').toUpperCase(),codes]])if(value){if(map.has(value)){duplicates.add(x.empresa_id);duplicates.add(map.get(value));}else map.set(value,x.empresa_id);}}
 const dates=!!fecha_inicio&&!!fecha_vencimiento&&Number.isFinite(Date.parse(fecha_inicio))&&Number.isFinite(Date.parse(fecha_vencimiento))&&Date.parse(fecha_vencimiento)>Date.parse(fecha_inicio);
 return {mode:'DRY_RUN',aplicado:false,rows:rows.map(x=>{
 const safe=uuid.test(String(x.empresa_id))&&Number.isSafeInteger(x.usuarios)&&x.usuarios>=0&&Number.isSafeInteger(x.sucursales)&&x.sucursales>=0&&/^\d{11}$/.test(String(x.ruc))&&!duplicates.has(x.empresa_id);
 const proposed=x.sucursales<=1&&x.usuarios<=3?'BASICO':x.sucursales<=1&&x.usuarios<=4?'PROFESIONAL':'EMPRESA';
 return {empresa_id:x.empresa_id,ruc:x.ruc,codigo:x.codigo,usuarios:x.usuarios,sucursales:x.sucursales,plan_a_asignar:x.plan_codigo||proposed,suscripcion_a_crear:x.suscripcion_id?'EXISTENTE_NO_RECREAR':'PENDIENTE_CONFIRMACION',fecha_inicio:dates?fecha_inicio:null,fecha_vencimiento:dates?fecha_vencimiento:null,estado:x.estado||'PENDIENTE',resultado:!safe?'BLOQUEADO_REVISION':x.plan_codigo&&x.suscripcion_id?'YA_ORGANIZADA':dates&&x.usuarios<=6?'PROPUESTA_REQUIERE_AUTORIZACION':'PENDIENTE_DATOS_Y_AUTORIZACION',advertencia:x.usuarios>6?'Se requiere límite personalizado; no asignar automáticamente.':null};
 })};
}
