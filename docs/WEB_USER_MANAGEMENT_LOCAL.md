# Gestión de usuarios WEB — revisión local
Baseline Panel: 83ada3fabddd9107160cd4eb34ee9fd82e1addbf, rama parche-italo.
Baseline WEB del parche adjunto: de7b515552002fccb885360a565b407c089ae06f.

## Revisar sin producción
- npm run test:web-users
- npm run review:web-users
El segundo comando crea únicamente SQLite y PostgreSQL WASM en memoria, escucha en loopback y muestra una URL y un login **sintéticos**. Todos los datos desaparecen al cerrar con Ctrl+C. No carga .env ni requiere PostgreSQL, Greenter, VPS, SUNAT o credenciales reales. No ejecutar npm start para esta revisión.
La vista muestra empresa y suscripción pendientes: resetear no cambia esos estados ni desbloquea el acceso.
El modal no persiste el texto plano, lo elimina al cerrar/navegar y no permite recuperarlo mediante GET. Copiar al portapapeles es una acción explícita; el sistema no puede impedir que el administrador conserve esa copia.
No hay reintento automático de reset. Si se pierde la respuesta, la contraseña no es recuperable: verificar primero el estado y, si corresponde, autorizar un reset nuevo. El mismo request_id se rechaza.

## Código Panel
- GET /api/web/empresas/:panelCompanyId/usuarios
- POST /api/web/empresas/:panelCompanyId/usuarios/:userId/reset-password
Body de reset: confirmar=true y request_id UUID. Actor/IP provienen de sesión/socket.
Se exigen rol ADMIN o SUPERADMIN y permiso de lectura/escritura correspondiente. También se mantiene CSRF/origen y sesión del Panel.
El identificador local se resuelve a empresa_web_id exclusivamente en servidor.
Listado sin selección de hashes ni funciones awr_*. Se filtra la respuesta remota por campos permitidos.
La pantalla no garantiza contraseña válida: READY significa solo ausencia de bloqueos de estado detectados.
Pestañas Resumen/Suscripción muestran los metadatos retornados; Sucursales muestra las asignadas a usuarios, no un inventario global de sedes.

## Adaptador WEB necesario, NO instalado
El Panel de producción actual no ofrece los nuevos endpoints WEB. El candidato está en integrations/web-user-management; no se aplicó a D:\EDUXFAC_WEB_V2 ni al VPS.
Registrar bajo el router administrativo ya autenticado:
- GET /api/internal/admin/v1/empresas/:company/usuarios — scope usuarios:read
- POST /api/internal/admin/v1/empresas/:company/usuarios/:user/reset-password — scope usuarios:reset
El backend comprueba otra vez empresa/usuario, usa bcryptjs coste 12 y actualiza solo password_hash, debe_cambiar_password y password_version. No activa usuarios/empresa/suscripción ni toca asignaciones.
La actualización y auditoría PASSWORD_RESET se confirman en una misma transacción.
Auditoría en web_user_admin_events: actor, empresa_id, usuario_id, request_id, IP, fecha. Sin contraseña, hash ni token. No depende de un segundo guardado remoto en el Panel.
El listado abre BEGIN READ ONLY y siempre cierra con ROLLBACK.

## Integración revisable, no autorización de despliegue
1. Revisar schema.sql en una restauración aislada: agrega usuarios.password_version y tabla de eventos con RLS forzada. No se ejecutó en ninguna BD local persistente/remota.
2. Revisar grants/policies con el propietario y rol de servicio del destino. El SQL deliberadamente no contiene roles ni ownership específicos del VPS. Sin políticas/privilegios correctos, la operación falla.
   El servicio necesita lectura de empresa/acceso/usuarios/asignaciones/sucursales/roles, UPDATE solo de password_hash, debe_cambiar_password y password_version y INSERT en eventos. No necesita SELECT de hashes para listar.
   Diseñar acceso de auditoría e inmutabilidad/retención de eventos según el modelo RLS del destino; no conceder permisos globales automáticamente.
3. Copiar los módulos de esta carpeta a integrations/web-user-management y shared/web-user-diagnostics.mjs a shared/ del repo WEB conservando rutas.
4. Revisar web-integration.patch contra el commit WEB indicado. Incluye registro de endpoints, limitador y consultas/claims de password_version en login, autenticación y cambio obligatorio.
5. El flujo obligatorio ya existe: token restringido web_password_change, /api/auth/password/change y public/initial-password.js. No se reemplaza.
6. La versión por usuario impide restaurar tokens anteriores al quitar debe_cambiar_password. Los tokens legacy sin claim solo se aceptan para usuarios con password_version=0; resetear uno incrementa solo su versión. No se incrementa empresa_acceso.auth_version.
7. Solo después de integrar y validar el gate de sesión establecer sessionVersionEnforced=true. Su valor por defecto bloquea resets.
8. Validar todos los flujos que llaman signUser y prueban JWT, cuotas, RLS y cambio inicial sobre datos sintéticos. El parche obligatorio agrega password_version a sus consultas.
9. No push, deploy ni migración productiva autorizados por este trabajo.

## Pruebas
Hay pruebas de SQL real en PGlite en memoria, bcrypt, rollbacks, permisos, tenant, 403/404, replays, límites, HTTP con SQLite en memoria y DOM simulado.
No se usaron cuentas, RUC ni bases reales. El fixture SUNAT existente se ajustó al dataset.type y close del formulario actual, sin cambiar lógica SUNAT.
La prueba DOM verifica XSS/escape, diagnóstico, copiar y eliminación de la contraseña al cerrar o cancelar navegación. No equivale a revisión visual manual de layout.

## Pendientes para producción
- Incorporar el candidato WEB y la migración mediante revisión y autorización separadas.
- Validar permisos y políticas contra el esquema objetivo.
- Revisión visual y de integración completa en un entorno aislado, incluyendo sesiones por usuario.
