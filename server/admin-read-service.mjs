import {readFileSync} from 'node:fs';
const exists=(db,n)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
export function applyAdminDashboardMigrations(db){
 if(!exists(db,'web_manual_payments')||!exists(db,'integration_queue'))throw Error('Primero aplicar FASE 5 y 6.');
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../database/web-migrations/006_panel_dashboard.sql',import.meta.url),'utf8'));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
const reject=m=>Object.assign(Error(m),{status:400});
const paidDay=c=>"CASE WHEN length("+c+")=10 THEN "+c+" ELSE date("+c+",'-5 hours') END";
const like=s=>'%'+s.replace(/[\\%_]/g,x=>'\\'+x)+'%';
export function createAdminReadService({db,config={},clock=()=>Date.now()}){
 const hasWeb=()=>['web_empresas','web_company_conditions','web_subscriptions','web_commercial_usage','integration_queue','integration_reconciliation','web_manual_payments','web_planes'].every(n=>exists(db,n));
 const now=()=>new Date(clock()).toISOString();
 const companies=()=>`SELECT w.id,w.cliente_id,c.name cliente_nombre,w.razon_social,w.nombre_comercial,w.ruc,w.empresa_codigo,w.empresa_web_id,
 coalesce(w.estado_local,w.estado) estado_registrado,
 CASE WHEN coalesce(w.estado_local,w.estado)='ACTIVO' AND s.estado='ACTIVA' AND julianday(s.fecha_vencimiento)<=julianday(:ahora) THEN 'VENCIDO' ELSE coalesce(w.estado_local,w.estado) END estado,
 w.estado_web,w.created_at,w.ultima_sincronizacion,w.web_auth_version,
 a.plan_codigo,a.precio_asignado_centavos,a.limite_sucursales_asignado,a.limite_usuarios_asignado,a.multisucursal,
 json_extract(CASE WHEN json_valid(u.uso_json) THEN u.uso_json ELSE '{}' END,'$.sucursales_activas') sucursales_usadas,
 json_extract(CASE WHEN json_valid(u.uso_json) THEN u.uso_json ELSE '{}' END,'$.usuarios_activos') usuarios_usados,u.updated_at uso_actualizado,
 s.id suscripcion_id,s.fecha_inicio,s.fecha_vencimiento,s.ultima_renovacion,
 CASE WHEN s.estado='ACTIVA' AND julianday(s.fecha_vencimiento)<=julianday(:ahora) THEN 'VENCIDA' ELSE s.estado END estado_suscripcion,
 CASE WHEN EXISTS(SELECT 1 FROM integration_queue q WHERE q.empresa_id=w.id AND q.estado='ERROR' AND(q.retryable=0 OR q.intentos>=q.max_intentos)) THEN 'ERROR'
 WHEN EXISTS(SELECT 1 FROM integration_queue q WHERE q.empresa_id=w.id AND(q.estado IN('SOLICITADO','PENDIENTE','REINTENTO') OR(q.estado='ERROR' AND q.retryable=1 AND q.intentos<q.max_intentos))) THEN 'PENDIENTE'
 WHEN r.estado IS NOT NULL THEN r.estado ELSE 'PENDIENTE' END sincronizacion,r.checked_at sincronizacion_actualizada
 FROM web_empresas w JOIN clients c ON c.id=w.cliente_id LEFT JOIN web_company_conditions a ON a.empresa_id=w.id LEFT JOIN web_subscriptions s ON s.empresa_id=w.id LEFT JOIN web_commercial_usage u ON u.empresa_id=w.id LEFT JOIN integration_reconciliation r ON r.empresa_id=w.id`;
 const clients=()=>`SELECT c.id,${exists(db,'web_empresas')?'c.public_id':'NULL public_id'},c.name,c.business_name,c.ruc,c.dni,${exists(db,'web_empresas')?'c.document_number':'NULL document_number'},c.email,c.phone,c.address,c.notes,c.status,c.created_at,
 EXISTS(SELECT 1 FROM licenses l WHERE l.client_id=c.id) tiene_escritorio,
 ${exists(db,'web_empresas')?'EXISTS(SELECT 1 FROM web_empresas w WHERE w.cliente_id=c.id)':'0'} tiene_web FROM clients c`;
 const payments=()=>`SELECT p.id,p.empresa_id,w.cliente_id,c.name cliente_nombre,w.razon_social,
 ${exists(db,'web_payment_context')?'ctx.plan_codigo':'NULL'} plan_registrado,a.plan_codigo plan_actual,p.importe_centavos,p.moneda,p.metodo,p.fecha,
 ${paidDay('p.fecha')} fecha_comercial,p.referencia,p.administrador,p.observacion,
 ${exists(db,'web_payment_context')?'ctx.periodo_inicio,ctx.periodo_fin':'NULL periodo_inicio,NULL periodo_fin'},p.created_at
 FROM web_manual_payments p JOIN web_empresas w ON w.id=p.empresa_id JOIN clients c ON c.id=w.cliente_id LEFT JOIN web_company_conditions a ON a.empresa_id=w.id
 ${exists(db,'web_payment_context')?'LEFT JOIN web_payment_context ctx ON ctx.pago_id=p.id':''}`;
 function history(){
 const parts=[`SELECT 'GEN-'||h.id id,'PANEL' producto,NULL cliente_id,NULL empresa_id,NULL cliente_nombre,NULL razon_social,h.event accion,'REGISTRADO' resultado,NULL administrador,'Actividad general registrada. Consultar el módulo correspondiente.' detalle,h.created_at fecha FROM history h`,
 `SELECT 'ESC-'||e.id id,'ESCRITORIO' producto,l.client_id cliente_id,NULL empresa_id,c.name cliente_nombre,c.business_name razon_social,e.event accion,'REGISTRADO' resultado,e.administrator administrador,e.detail detalle,e.created_at fecha FROM license_events e JOIN licenses l ON l.id=e.license_id JOIN clients c ON c.id=l.client_id`];
 if(hasWeb()){
 for(const [t,p,a,d] of [['web_state_history','EST','accion','created_at'],['web_commercial_history','COM','accion','created_at'],['web_subscription_history','SUB','evento','fecha']])
 parts.push(`SELECT '${p}-'||h.id id,'WEB' producto,w.cliente_id cliente_id,w.id empresa_id,c.name cliente_nombre,w.razon_social,h.${a} accion,h.resultado,h.administrador,h.motivo detalle,h.${d} fecha FROM ${t} h LEFT JOIN web_empresas w ON w.id=h.empresa_id LEFT JOIN clients c ON c.id=w.cliente_id`);
 parts.push(`SELECT 'PAGO-'||p.id id,'WEB' producto,w.cliente_id cliente_id,w.id empresa_id,c.name cliente_nombre,w.razon_social,'PAGO_MANUAL' accion,'REGISTRADO' resultado,p.administrador,'Pago manual registrado; no renueva vigencia.' detalle,p.created_at fecha FROM web_manual_payments p JOIN web_empresas w ON w.id=p.empresa_id JOIN clients c ON c.id=w.cliente_id`);
 parts.push(`SELECT 'INT-'||h.id id,'WEB' producto,w.cliente_id cliente_id,w.id empresa_id,c.name cliente_nombre,w.razon_social,h.accion,h.resultado,'sistema / worker' administrador,coalesce(h.error,'Operación de integración') detalle,h.fecha FROM integration_logs h LEFT JOIN web_empresas w ON w.id=h.empresa_id LEFT JOIN clients c ON c.id=w.cliente_id`);
 }
 if(exists(db,'panel_admin_events'))parts.push("SELECT 'ADMIN8-'||e.id id,'PANEL' producto,NULL cliente_id,NULL empresa_id,NULL cliente_nombre,NULL razon_social,e.accion,e.resultado,a.username administrador,e.motivo detalle,e.created_at fecha FROM panel_admin_events e LEFT JOIN panel_admin_users a ON a.id=e.actor_id");
 return parts.join(' UNION ALL ');
 }
 const sorts={
 clientes:{nombre:'name COLLATE NOCASE ASC',nombre_desc:'name COLLATE NOCASE DESC',recientes:'created_at DESC',antiguos:'created_at ASC'},
 empresas:{nombre:'razon_social COLLATE NOCASE ASC',recientes:'created_at DESC',vencimiento:'fecha_vencimiento ASC',plan:'plan_codigo ASC'},
 suscripciones:{vencimiento:'fecha_vencimiento ASC',nombre:'razon_social COLLATE NOCASE ASC',precio:'precio_asignado_centavos DESC'},
 pagos:{recientes:'fecha_comercial DESC',antiguos:'fecha_comercial ASC',importe:'importe_centavos DESC',empresa:'razon_social COLLATE NOCASE ASC'},
 historial:{recientes:'fecha DESC',antiguos:'fecha ASC',accion:'accion ASC'},
 licencias:{codigo:'reference ASC',cliente:'cliente_nombre ASC',recientes:'created_at DESC'},equipos:{recientes:'created_at DESC',nombre:'device_name ASC'},activaciones:{recientes:'created_at DESC',nombre:'device_name ASC'},recuperacion:{recientes:'created_at DESC',antiguos:'created_at ASC'}
 };
 const keys={clientes:['estado','producto'],empresas:['estado','plan','sincronizacion','proximas','error','cuotas'],suscripciones:['estado','plan','proximas'],pagos:['empresa','plan','metodo','desde','hasta'],historial:['cliente','empresa','producto','accion','resultado','administrador','desde','hasta'],licencias:['estado','cliente'],equipos:['estado','cliente'],activaciones:['estado','cliente'],recuperacion:['estado']};
 function parse(q,kind){
 const allowed=['page','page_size','search','sort','filters',...keys[kind]];
 if(Object.keys(q).some(k=>!allowed.includes(k)))throw reject('Parámetro no admitido.');
 const f={...q};if(q.filters){let x;try{x=JSON.parse(q.filters);}catch{throw reject('Filtros inválidos.');}if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).some(k=>!keys[kind].includes(k)))throw reject('Filtros inválidos.');Object.assign(f,x);}
 for(const [k,v] of Object.entries(f))if(typeof v!=='string'||v.length>(k==='filters'?2000:200))throw reject('Filtro inválido.');
 const num=(v,fallback)=>v===undefined?fallback:/^[1-9]\d{0,5}$/.test(v)?Number(v):NaN;
 f.page=num(f.page,1);f.page_size=num(f.page_size,20);
 if(!Number.isSafeInteger(f.page)||f.page>100000||![20,50,100].includes(f.page_size))throw reject('Tamaños permitidos: 20, 50 y 100.');
 for(const k of ['desde','hasta'])if(f[k]){const d=new Date(f[k]+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(f[k])||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==f[k])throw reject('Fecha inválida.');}
 if(f.desde&&f.hasta&&f.desde>f.hasta)throw reject('Rango de fechas inválido.');
 f.sort=f.sort||Object.keys(sorts[kind])[0];if(!sorts[kind][f.sort])throw reject('Ordenamiento inválido.');return f;
 }
 function listing(kind,q={}){
 if(!['clientes','historial','recuperacion','licencias','equipos','activaciones'].includes(kind)&&!hasWeb())return {status:503,data:{error:'Esquema WEB pendiente de preparación explícita; ninguna base fue modificada.'}};
 const f=parse(q,kind),where=[],params={};
 const add=(s,k,v)=>{if(v!==undefined&&v!==''){where.push(s);params[k]=v;}};
 const en=(k,values)=>{if(f[k]&&!values.includes(f[k]))throw reject('Filtro no admitido: '+k);};
 en('plan',['BASICO','PROFESIONAL','EMPRESA']);let sql;
 if(kind==='clientes'){
 sql=clients();en('estado',['ACTIVO','INACTIVO']);en('producto',['WEB','ESCRITORIO','AMBOS']);add('status=:estado','estado',f.estado);
 if(f.producto)where.push(f.producto==='AMBOS'?'tiene_web=1 AND tiene_escritorio=1':f.producto==='WEB'?'tiene_web=1':'tiene_escritorio=1');
 if(f.search)add("(coalesce(name,'')||' '||coalesce(business_name,'')||' '||coalesce(ruc,'')||' '||coalesce(dni,'')||' '||coalesce(document_number,'')||' '||coalesce(email,'')||' '||coalesce(phone,'')) LIKE :search ESCAPE '\\'",'search',like(f.search));
 }else if(['empresas','suscripciones'].includes(kind)){
 sql=companies();params.ahora=now();en('sincronizacion',['SINCRONIZADO','PENDIENTE','ERROR','DESINCRONIZADO']);en('estado',kind==='empresas'?['ACTIVO','PENDIENTE','SUSPENDIDO','VENCIDO','CANCELADO']:['ACTIVA','POR_VENCER','VENCIDA','SUSPENDIDA','CANCELADA','PENDIENTE']);
 if(kind==='suscripciones')where.push('suscripcion_id IS NOT NULL');
 if(f.estado==='POR_VENCER')where.push("estado_suscripcion='ACTIVA' AND julianday(fecha_vencimiento)>julianday(:ahora) AND julianday(fecha_vencimiento)<=julianday(:ahora)+7");
 else add((kind==='empresas'?'estado':'estado_suscripcion')+'=:estado','estado',f.estado);
 add('plan_codigo=:plan','plan',f.plan);add('sincronizacion=:sincronizacion','sincronizacion',f.sincronizacion);
 if(f.proximas){en('proximas',['7','15','30']);where.push("estado_suscripcion='ACTIVA' AND julianday(fecha_vencimiento)>julianday(:ahora) AND julianday(fecha_vencimiento)<=julianday(:ahora)+:dias");params.dias=Number(f.proximas);}
 en('error',['si','no']);en('cuotas',['si','no']);
 if(f.error)where.push(f.error==='si'?"sincronizacion='ERROR'":"sincronizacion<>'ERROR'");
 if(f.cuotas)where.push((f.cuotas==='no'?'NOT ':'')+'((limite_sucursales_asignado IS NOT NULL AND sucursales_usadas>=limite_sucursales_asignado) OR usuarios_usados>=limite_usuarios_asignado)');
 if(f.search)add("(coalesce(cliente_nombre,'')||' '||razon_social||' '||coalesce(nombre_comercial,'')||' '||ruc||' '||empresa_codigo) LIKE :search ESCAPE '\\'",'search',like(f.search));
 }else if(kind==='pagos'){
 sql=payments();en('metodo',['EFECTIVO','TRANSFERENCIA','YAPE','PLIN','OTRO']);add('metodo=:metodo','metodo',f.metodo);add('coalesce(plan_registrado,plan_actual)=:plan','plan',f.plan);if(f.empresa){add("(empresa_id=:empresa OR razon_social LIKE :empresa_nombre ESCAPE '\\')",'empresa',f.empresa);params.empresa_nombre=like(f.empresa);}
 add('fecha_comercial>=:desde','desde',f.desde);add('fecha_comercial<=:hasta','hasta',f.hasta);
 if(f.search)add("(cliente_nombre||' '||razon_social||' '||referencia) LIKE :search ESCAPE '\\'",'search',like(f.search));
 }else if(kind==='historial'){
 sql=history();en('producto',['WEB','ESCRITORIO','PANEL']);for(const k of ['accion','resultado','administrador'])add(k+'=:'+k,k,f[k]);if(f.empresa){add("(empresa_id=:empresa OR razon_social LIKE :empresa_nombre ESCAPE '\\')",'empresa',f.empresa);params.empresa_nombre=like(f.empresa);}if(f.cliente){add("(CAST(cliente_id AS TEXT)=:cliente OR cliente_nombre LIKE :cliente_nombre ESCAPE '\\')",'cliente',f.cliente);params.cliente_nombre=like(f.cliente);}
 add('producto=:producto','producto',f.producto);add("date(fecha,'-5 hours')>=:desde",'desde',f.desde);add("date(fecha,'-5 hours')<=:hasta",'hasta',f.hasta);
 if(f.search)add("(coalesce(cliente_nombre,'')||' '||coalesce(razon_social,'')||' '||accion||' '||coalesce(administrador,'')) LIKE :search ESCAPE '\\'",'search',like(f.search));
 }else if(['licencias','equipos','activaciones'].includes(kind)){
 en('estado',['ACTIVA','DISPONIBLE','BLOQUEADA','PENDIENTE','REEMPLAZADA','REINSTALADA','CANCELADA']);
 sql=kind==='licencias'?"SELECT l.id,l.reference,l.client_id cliente_id,c.name cliente_nombre,c.business_name,l.status,l.purchased_at,l.license_type,l.notes,l.created_at,(SELECT count(*) FROM authorized_devices d WHERE d.license_id=l.id AND d.status='ACTIVA') equipos_activos FROM licenses l JOIN clients c ON c.id=l.client_id":"SELECT d.id,d.license_id,d.installation_id,d.device_name,d.label,d.status,d.created_at,d.activated_at,d.last_validated_at,d.replacement_reason,l.reference licencia,c.id cliente_id,c.name cliente_nombre,c.business_name FROM authorized_devices d JOIN licenses l ON l.id=d.license_id JOIN clients c ON c.id=l.client_id";
 add('status=:estado','estado',f.estado);add('CAST(cliente_id AS TEXT)=:cliente','cliente',f.cliente);
 if(f.search)add((kind==='licencias'?"(cliente_nombre||' '||coalesce(business_name,'')||' '||reference) LIKE :search ESCAPE '\\'":"(cliente_nombre||' '||licencia||' '||installation_id||' '||coalesce(device_name,'')) LIKE :search ESCAPE '\\'"),'search',like(f.search));
 }else{
 en('estado',['PENDIENTE','RECHAZADA','REVISION_APROBADA_REQUIERE_REINSTALACION']);add('status=:estado','estado',f.estado);
 sql="SELECT r.id,r.status,r.created_at,d.installation_id,d.device_name,c.id cliente_id,c.name cliente_nombre,l.reference licencia FROM recovery_requests r JOIN authorized_devices d ON d.id=r.device_id JOIN licenses l ON l.id=d.license_id JOIN clients c ON c.id=l.client_id";
 if(f.search)add("(cliente_nombre||' '||licencia||' '||installation_id) LIKE :search ESCAPE '\\'",'search',like(f.search));
 }
 const from=' FROM ('+sql+')'+(where.length?' WHERE '+where.join(' AND '):'');
 const total=db.prepare('SELECT count(*) n'+from).get(params).n;
 let rows=db.prepare('SELECT *'+from+' ORDER BY '+sorts[kind][f.sort]+',id ASC LIMIT :limite OFFSET :offset').all({...params,limite:f.page_size,offset:(f.page-1)*f.page_size});
 if(kind==='suscripciones')rows=rows.map(s=>({...s,dias_restantes:Math.max(0,Math.ceil((Date.parse(s.fecha_vencimiento)-clock())/86400000)),ultimo_pago:db.prepare(`SELECT importe_centavos,moneda,fecha,metodo FROM web_manual_payments WHERE empresa_id=? ORDER BY ${paidDay('fecha')} DESC,created_at DESC,id DESC LIMIT 1`).get(s.id)||null}));
 return {status:200,data:{rows,total,page:f.page,page_size:f.page_size,total_pages:Math.max(1,Math.ceil(total/f.page_size)),has_next:f.page*f.page_size<total,has_previous:f.page>1,generated_at:now(),timezone:'America/Lima'}};
 }
 function dashboard(){
 const generated=now(),localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(clock())),month=localDay.slice(0,7);
 const shift=n=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);};
 const clientes=db.prepare('SELECT count(*) n FROM clients').get().n;
 if(!hasWeb())return {clientes_totales:clientes,web_disponible:false,metrics:null,por_plan:[],series:[],generated_at:generated,timezone:'America/Lima',advertencia:'Métricas WEB no disponibles: esquema pendiente. No se muestran ceros estimados.'};
 const sql=companies(),p={ahora:generated},rows=db.prepare('SELECT estado,count(*) cantidad FROM ('+sql+') GROUP BY estado').all(p);
 const estados=Object.fromEntries(['ACTIVO','PENDIENTE','SUSPENDIDO','VENCIDO','CANCELADO'].map(s=>[s,rows.find(r=>r.estado===s)?.cantidad||0]));
 const subs=db.prepare("SELECT count(*) n FROM ("+sql+") WHERE estado_suscripcion='ACTIVA'").get(p).n;
 const due=n=>db.prepare("SELECT count(*) n FROM ("+sql+") WHERE estado_suscripcion='ACTIVA' AND julianday(fecha_vencimiento)>julianday(:ahora) AND julianday(fecha_vencimiento)<=julianday(:ahora)+:dias").get({...p,dias:n}).n;
 const income=m=>db.prepare("SELECT coalesce(sum(importe_centavos),0) n FROM web_manual_payments WHERE substr("+paidDay('fecha')+",1,7)=?").get(m).n;
 const planRows=db.prepare("SELECT plan_codigo,count(*) empresas,coalesce(sum(CASE WHEN estado='ACTIVO' AND estado_suscripcion='ACTIVA' THEN precio_asignado_centavos ELSE 0 END),0) esperado_centavos FROM ("+sql+") WHERE plan_codigo IS NOT NULL GROUP BY plan_codigo").all(p);
 const por_plan=db.prepare('SELECT codigo,precio_centavos FROM web_planes ORDER BY precio_centavos').all().map(r=>({...r,...(planRows.find(x=>x.plan_codigo===r.codigo)||{empresas:0,esperado_centavos:0})}));
 const usage=db.prepare('SELECT sum(sucursales_usadas) sucursales,sum(usuarios_usados) usuarios,count(sucursales_usadas) empresas_con_uso,min(uso_actualizado) uso_mas_antiguo FROM ('+sql+')').get(p);
 const count=s=>db.prepare(s).get().n;
 const series=Array.from({length:6},(_,i)=>{const mes=shift(i-5);return {mes,registrado_centavos:income(mes),altas:db.prepare("SELECT count(*) n FROM web_empresas WHERE strftime('%Y-%m',created_at,'-5 hours')=?").get(mes).n};});
 return {clientes_totales:clientes,web_disponible:true,metrics:{empresas:estados,suscripciones_activas:subs,vence_7:due(7),vence_15:due(15),vence_30:due(30),ingresos_mes_centavos:income(month),ingresos_anterior_centavos:income(shift(-1)),mes_actual:month,altas_mes:series.at(-1).altas,sucursales_activas:usage.sucursales,usuarios_activos:usage.usuarios,empresas_con_uso:usage.empresas_con_uso,uso_mas_antiguo:usage.uso_mas_antiguo,comandos_pendientes:count("SELECT count(*) n FROM integration_queue WHERE estado IN('SOLICITADO','PENDIENTE','REINTENTO') OR(estado='ERROR' AND retryable=1 AND intentos<max_intentos)"),errores_integracion:count("SELECT count(*) n FROM integration_queue WHERE estado='ERROR'"),desincronizadas:db.prepare("SELECT count(*) n FROM ("+sql+") WHERE sincronizacion='DESINCRONIZADO'").get(p).n},por_plan,series,generated_at:generated,timezone:'America/Lima',health:db.prepare("SELECT estado,checked_at,latencia_ms FROM integration_health WHERE id='WEB'").get()||null,advertencia:'Uso y sincronización son snapshots locales. Ingreso esperado solo de empresas ACTIVO con suscripción ACTIVA vigente; no confirma cobros.'};
 }
 function handle(method,route,q={}){
 if(method!=='GET')return {status:405,data:{error:'Consultas de solo lectura.'}};
 try{
 if(route==='/api/admin/dashboard'){if(Object.keys(q).length)throw reject('Dashboard no admite filtros.');return {status:200,data:dashboard()};}
 if(route==='/api/admin/configuracion')return {status:200,data:{panel_name:db.prepare("SELECT value FROM settings WHERE key='panel_name'").get()?.value,workers:config,web_esquema_disponible:hasWeb(),integracion:'API de servicio PANEL → WEB; credenciales no visibles.',timezone:'America/Lima',recuperacion_api:exists(db,'panel_admin_users')?'REVISION_AUTORIZADA_REINSTALACION_PROTEGIDA':'PENDIENTE',generated_at:now()}};
 const m=route.match(/^\/api\/admin\/(clientes|empresas|suscripciones|pagos|historial|recuperacion|licencias|equipos|activaciones)$/);return m?listing(m[1],q):{status:404,data:{error:'Consulta no disponible.'}};
 }catch(e){return {status:e.status||500,data:{error:e.status?'Consulta inválida: '+e.message:'No se pudo cargar la información. Reintenta o revisa la configuración del Panel.'}};}
 }
 return {handle,dashboard,listing};
}
