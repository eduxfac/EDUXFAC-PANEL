const pages=new Set(['/','/dashboard','/clientes','/empresas','/empresas/nueva','/empresas/historial','/planes','/suscripciones','/pagos','/integracion','/licencias','/activaciones','/equipos','/recuperacion','/historial','/configuracion','/administradores','/cuenta','/estado-interno']);
export function isPanelPage(pathname){
 const path=pathname.replace(/\/+$/,'')||'/';
 return pages.has(path)||/^\/empresas\/[a-f0-9-]{36}\/facturacion$/i.test(path);
}
