# Roles, sesiones y gestión administrativa

La autorización está en server/admin-auth.mjs y se ejecuta para cada solicitud. Cambiar HTML no eleva permisos. El rol y auth_version se releen de DB; el cliente no puede asignarse permisos.

| Rol | Facultades |
|---|---|
| SUPERADMIN | Todas, incluidos usuarios, ajustes y escritorio |
| ADMIN | Clientes, WEB/comercial/suscripciones/pagos/estados, integración, historial; no usuarios, ajustes globales ni mutaciones escritorio |
| SOPORTE | Consulta, health e incidencias, revisión de recuperación; sin precios, planes ni pagos |
| LECTURA | Permisos .read; ninguna mutación de negocio |

Permisos: dashboard.read, clients.read/write, web.companies.read/write, web.plans.manage, web.subscriptions.manage, web.payments.manage, web.states.manage, integration.read/retry/reconcile, desktop.read/licenses.manage/activations.manage, recovery.read/authorize, history.read, settings.read/manage, admin.users.manage, health.read. Rutas desconocidas se deniegan.

Consultas POST explícitas consultan WEB y actualizan snapshots; LECTURA puede realizarlas sin modificar negocio remoto. Reintentos/conciliación que cambian estado requieren permisos distintos.

## Usuarios

GET/POST /api/admin/usuarios; POST /api/admin/usuarios/:id/editar|reset. Solo SUPERADMIN. Motivo obligatorio. Crear/reset produce contraseña temporal **no devuelta**, hash scrypt + salt y must_change_password. Editar rol/nombre/estado/reset invalida sesiones. No existe eliminación física. El último SUPERADMIN activo no puede desactivarse ni degradarse; comprobado también en concurrencia PostgreSQL.

GET /api/admin/identity informa identidad segura. POST /api/admin/profile/password requiere contraseña actual y nueva, invalida sesiones y obliga login posterior. Contraseñas nunca se registran en auditoría ni se muestran en listados.

## Sesiones y accesos

Token aleatorio guardado solo como SHA256, usuario, auth_version y expiración. Duración configurable 15 minutos–8 horas (predeterminado 8h). Logout revoca token. Rol/desactivación/reset y cambio propio revocan todas sus sesiones. Sesiones legacy SQLite no permiten login PostgreSQL por sí mismas.

Cookie: HttpOnly, SameSite=Strict, Path=/, Secure producción. POST JSON + Origin exacto protege CSRF. Login: 10 fallos por combinación usuario/peer en 15 minutos; 50 por peer/socket. X-Forwarded-For no se usa como prueba de identidad: detrás de proxy puede ser un límite global, por lo que se requiere rate limit por cliente en Nginx antes del VPS.

Auditoría inmutable panel_admin_events en historial PANEL. UI: Administradores, Tu cuenta, Health interno; controles desactivados según permiso y backend vuelve a comprobarlo.

## Recuperación administrativa

Consulta paginada por cliente/licencia/equipo. SUPERADMIN/ADMIN/SOPORTE pueden registrar APROBAR_REVISION o RECHAZAR con motivo. Solo PENDIENTE, cambio único y auditoría. Una revisión aprobada queda REVISION_APROBADA_REQUIERE_REINSTALACION. **No recupera una contraseña, no firma una licencia, no activa un equipo ni evita su vinculación**. La reinstalación final queda en el flujo existente de escritorio autorizado; no hay API nueva para saltar sus controles.

## DEMO

http://127.0.0.1:4310, DB SQLite ficticia. Cuentas:
demo / DemoEDUXFAC2026! (SUPERADMIN)
admin_demo / DemoAdmin2026! (ADMIN)
soporte_demo / DemoSoporte2026! (SOPORTE)
lectura_demo / DemoLectura2026! (LECTURA)

Solo ficticias, no reutilizar en producción. Workers apagados y conexiones salientes deshabilitadas. Detener con demo/DETENER_DEMO.ps1, que verifica PID/script. No tocar data/panel.sqlite ni la clave actual.
