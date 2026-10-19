(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let revision=0;
 async function api(route,body){const r=await fetch(route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error||'Operación sin confirmar.'),{data:d,status:r.status});return d;}
 async function loadSummaries(){try{const r=await api('/api/web/comercial/empresas');return new Map(r.rows.map(x=>[x.empresa_id,x]));}catch(e){if(e.status===503)return null;throw e;}}
 const limit=v=>v===null?'MULTI':esc(v??'—');
 function summary(s){
  if(!s)return '<small>Planes pendientes de configurar</small>';
  const c=s.condiciones,u=s.uso;
  return '<strong>'+esc(c?.plan_codigo||'Sin plan')+'</strong>'+(c?'<small>S/ '+esc(c.precio_asignado)+' / mes</small>':'')+
   '<small>Sucursales: '+esc(u?.sucursales_activas??'—')+' / '+limit(u?.limite_sucursales??c?.limite_sucursales_asignado??(c?.multisucursal?null:undefined))+'</small>'+
   '<small>Usuarios: '+esc(u?.usuarios_activos??'—')+' / '+esc(u?.limite_usuarios??c?.limite_usuarios_asignado??'—')+'</small>'+
   (c?.personalizada?'<span class="pill web-state-suspendido">Condiciones personalizadas</span>':'')+
   (s.pendiente?'<small class="error">Condiciones sin confirmar · '+esc(s.pendiente.resultado)+'</small>':'')+
   (s.conciliacion==='DESINCRONIZADO'?'<small class="error">Condiciones desincronizadas</small>':'');
 }
 const historyLimit=o=>!o.plan_codigo?'—':o.multisucursal?'MULTI':esc(o.limite_sucursales_asignado??o.limite_sucursales??'—');
 function commercialEvent(r){const p=r.nuevo||{},old=r.anterior||{};return '<tr><td>'+esc(r.created_at)+'<small>'+esc(r.administrador)+'</small></td><td>'+esc(r.accion)+'<small>'+esc(r.resultado)+(r.error?' · '+esc(r.error):'')+'</small></td><td>'+esc(old.plan_codigo||'—')+' → '+esc(p.plan_codigo||old.plan_codigo||'—')+'<small>Sucursales '+historyLimit(old)+' → '+historyLimit(p)+'</small><small>Usuarios '+esc(old.limite_usuarios_asignado??old.limite_usuarios??'—')+' → '+esc(p.limite_usuarios_asignado??p.limite_usuarios??'—')+'</small></td><td>'+esc(r.motivo)+(r.accion==='CUOTA_USUARIOS'?'<small>Has alcanzado el límite de usuarios permitido por tu plan.</small>':r.accion==='CUOTA_SUCURSALES'?'<small>Has alcanzado el límite de sucursales permitido por tu plan.</small>':'')+'<small class="hash">'+esc(r.command_id)+'</small></td></tr>';}
 async function openCompany(row,onClose=()=>{}){
  const modal=document.createElement('dialog');modal.className='web-state-dialog web-commercial-dialog';document.body.append(modal);modal.innerHTML='<p>Cargando condiciones comerciales…</p>';modal.showModal();
  let closed=false;
  const close=()=>{closed=true;modal.close();modal.remove();onClose();};modal.oncancel=e=>{e.preventDefault();close();};
  async function draw(message='',error=false){
   const [all,plans,history]=await Promise.all([api('/api/web/comercial/empresas'),api('/api/web/comercial/planes'),api('/api/web/comercial/historial?empresa='+encodeURIComponent(row.id))]);
   if(closed)return;const s=all.rows.find(x=>x.empresa_id===row.id),c=s?.condiciones,u=s?.uso;
   modal.innerHTML='<div class="section-heading"><h2>Plan y límites</h2><button class="secondary" id="commercial-close">Cerrar</button></div><p><strong>'+esc(row.razon_social)+'</strong> · '+esc(row.empresa_codigo)+'</p><div class="commercial-summary">'+summary(s)+'</div><p id="commercial-status" role="status" class="'+(error?'error':'')+'">'+esc(message)+'</p><button class="secondary" id="commercial-use" '+(row.empresa_web_id?'':'disabled')+'>Consultar uso actual</button><p>Última consulta: '+esc(s?.ultima_consulta||'Sin consultar')+' · '+esc(s?.conciliacion||'SIN_CONSULTAR')+'</p><form id="commercial-plan" class="web-filters"><label>Plan<select name="plan_codigo" required>'+plans.rows.filter(p=>p.activo).map(p=>'<option value="'+p.codigo+'" '+(p.codigo===c?.plan_codigo?'selected':'')+'>'+esc(p.nombre)+' — S/ '+esc(p.precio)+' / mes</option>').join('')+'</select></label><label>Motivo del plan<input name="motivo" required maxlength="500"></label><button class="primary" '+(s?.pendiente||!row.empresa_web_id?'disabled':'')+'>Asignar / cambiar plan</button></form><p>Un cambio inferior al uso actual se rechaza y conserva usuarios y sucursales. Los precios asignados se conservan hasta una nueva asignación explícita.</p><form id="commercial-exception" class="form-grid"><h3 class="wide">Excepción manual</h3><label>Sucursales permitidas<input name="limite_sucursales" type="number" min="1" max="2147483647" value="'+esc(c?.limite_sucursales_asignado??1)+'" required></label><label>Usuarios permitidos en total<input name="limite_usuarios" type="number" min="1" max="2147483647" value="'+esc(c?.limite_usuarios_asignado??3)+'" required></label><label class="wide commercial-check"><input type="checkbox" name="multisucursal" '+(c?.multisucursal?'checked':'')+'> Multisucursal sin límite fijo</label><label class="wide">Motivo de la excepción<textarea name="motivo" maxlength="500" required></textarea></label><button class="primary" '+(!c||s?.pendiente?'disabled':'')+'>Aplicar excepción</button></form>'+(s?.pendiente?'<button class="secondary" id="commercial-retry">Reintentar condiciones</button>':'')+'<h3>Historial comercial</h3><div class="table-scroll"><table><thead><tr><th>Fecha UTC / Administrador</th><th>Acción / Resultado</th><th>Antes → Después</th><th>Motivo / Comando</th></tr></thead><tbody>'+[...history.rows,...(u?.eventos_cuota||[])].map(commercialEvent).join('')+'</tbody></table></div>';
   modal.querySelector('#commercial-close').onclick=close;
   const endpoint=a=>'/api/web/comercial/empresas/'+row.id+'/'+a;
   async function perform(action,body,button){
    button.disabled=true;try{await api(endpoint(action),body);await draw('Condiciones confirmadas por WEB.');}
    catch(e){let text=e.message;if(e.data?.uso_rechazado){const x=e.data.uso_rechazado;text+=' Sucursales: '+x.sucursales_actuales+' / '+(x.limite_sucursales===null?'MULTI':x.limite_sucursales)+'. Usuarios: '+x.usuarios_actuales+' / '+x.limite_usuarios+'.';}await draw(text,true);}finally{button.disabled=false;}
   }
   modal.querySelector('#commercial-use').onclick=e=>perform('uso',{},e.target);
   modal.querySelector('#commercial-plan').onsubmit=e=>{e.preventDefault();perform('plan',Object.fromEntries(new FormData(e.target)),e.submitter);};
   const form=modal.querySelector('#commercial-exception'),toggle=()=>{const multi=form.elements.multisucursal.checked;form.elements.limite_sucursales.disabled=multi;form.elements.limite_sucursales.required=!multi;};form.elements.multisucursal.onchange=toggle;toggle();
   form.onsubmit=e=>{e.preventDefault();const multi=form.elements.multisucursal.checked;perform('limites',{limite_sucursales:multi?null:Number(form.elements.limite_sucursales.value),limite_usuarios:Number(form.elements.limite_usuarios.value),multisucursal:multi,motivo:form.elements.motivo.value},e.submitter);};
   if(modal.querySelector('#commercial-retry'))modal.querySelector('#commercial-retry').onclick=e=>perform('reintentar',{command_id:s.pendiente.command_id},e.target);
  }
  try{await draw();}catch(e){modal.innerHTML='<p class="error">'+esc(e.message)+'</p><button class="secondary">Cerrar</button>';modal.querySelector('button').onclick=close;}
 }
 async function render(container,top){
  const version=++revision;container.innerHTML=top+'<section class="panel">Cargando planes…</section>';
  try{const data=await api('/api/web/comercial/planes');if(version!==revision)return;
   container.innerHTML=top+'<section class="panel"><h2>Planes comerciales WEB</h2><p>Precios en PEN · Mensual. El administrador inicial y la sucursal principal cuentan dentro de sus límites.</p><div class="commercial-cards">'+data.rows.map(p=>'<article class="commercial-card"><span class="pill '+(p.activo?'web-state-activo':'web-state-cancelado')+'">'+(p.activo?'ACTIVO':'INACTIVO')+'</span><h3>'+esc(p.nombre)+'</h3><div class="commercial-price">S/ '+esc(p.precio)+' <small>/ mes</small></div><p>'+(p.multisucursal?'Multisucursal sin límite fijo':p.limite_sucursales+' sucursal activa')+'</p><p>'+p.limite_usuarios+' usuarios activos en total</p><button class="secondary" data-plan-state="'+p.codigo+'">'+(p.activo?'Inactivar':'Activar')+' plan</button></article>').join('')+'</div><p>Inactivar impide nuevas asignaciones. Conserva las condiciones ya asignadas. Los planes utilizados no se eliminan.</p><p id="catalog-message" role="status"></p></section>';
   for(const button of container.querySelectorAll('[data-plan-state]'))button.onclick=async()=>{
    const p=data.rows.find(p=>p.codigo===button.dataset.planState),modal=document.createElement('dialog');modal.className='web-state-dialog';
    modal.innerHTML='<form><h2>'+esc(button.textContent)+'</h2><p>'+esc(p.nombre)+': las condiciones existentes se conservarán.</p><label>Motivo<input name="motivo" required maxlength="500"></label><div class="web-buttons"><button class="primary">Confirmar estado del plan</button><button type="button" class="secondary">Volver</button></div></form>';document.body.append(modal);modal.showModal();
    const close=()=>{modal.close();modal.remove();};modal.oncancel=e=>{e.preventDefault();close();};modal.querySelector('button[type="button"]').onclick=close;
    modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const reason=modal.querySelector('input').value;close();try{await api('/api/web/comercial/planes/estado',{codigo:p.codigo,activo:!p.activo,motivo:reason});await render(container,top);}catch(error){container.querySelector('#catalog-message').textContent=error.message;}};
   };
  }catch(e){if(version===revision)container.innerHTML=top+'<section class="panel"><p class="error">'+esc(e.message)+'</p></section>';}
 }
 window.panelPlans={render,cancel:()=>revision++,loadSummaries,summary,openCompany};
})();
