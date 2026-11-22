(()=>{
 const routes={dashboard:'/dashboard',clients:'/clientes','web-empresas':'/empresas','web-alta':'/empresas/nueva','web-history':'/empresas/historial','web-planes':'/planes','web-suscripciones':'/suscripciones','web-pagos':'/pagos','integration-alerts':'/integracion',licenses:'/licencias',activations:'/activaciones',devices:'/equipos',recovery:'/recuperacion',history:'/historial',settings:'/configuracion','admin-users':'/administradores','admin-profile':'/cuenta','admin-health':'/estado-interno'};
 const fiscal=/^web-empresas\/([a-f0-9-]{36})\/facturacion$/i;
 const fiscalPath=/^\/empresas\/([a-f0-9-]{36})\/facturacion$/i;
 function href(page){
  if(page==='sunat')page='web-empresas';
  const match=String(page).match(fiscal);
  return match?'/empresas/'+match[1].toLowerCase()+'/facturacion':routes[page]||null;
 }
 function resolve(pathname){
  const path=pathname.replace(/\/+$/,'')||'/';
  if(path==='/')return 'dashboard';
  const match=path.match(fiscalPath);
  return match?'web-empresas/'+match[1].toLowerCase()+'/facturacion':Object.keys(routes).find(key=>routes[key]===path)||null;
 }
 const announce=()=>window.dispatchEvent(new Event('panelroutechange'));
 function navigate(page,{replace=false,query='',notify=true}={}){
  const path=href(page);if(!path)return false;
  const search=new URLSearchParams(query).toString();const target=path+(search?'?'+search:'');
  if(location.pathname+location.search+location.hash===target)return false;
  window.history[replace?'replaceState':'pushState'](null,'',target);
  if(notify)announce();return true;
 }
 function normalize(){
  const legacy=location.hash.slice(1);
  if(legacy&&href(legacy))navigate(legacy,{replace:true,query:location.search,notify:false});
  else {
   const page=resolve(location.pathname);
   if(page)navigate(page,{replace:true,query:location.search,notify:false});
  }
 }
 window.panelRouter={href,navigate,current:()=>resolve(location.pathname)||'dashboard',query:()=>new URLSearchParams(location.search)};
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
  const page=url.hash?url.pathname===location.pathname&&href(url.hash.slice(1))?url.hash.slice(1):null:resolve(url.pathname);
  if(!page)return;
  event.preventDefault();navigate(page,{query:url.search});
 });
 window.addEventListener('popstate',()=>{normalize();announce();});
 window.addEventListener('hashchange',()=>{normalize();announce();});
 normalize();
})();
