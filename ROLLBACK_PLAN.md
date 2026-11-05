# Reversión del candidato de usuarios — V2, 2026-11-05

**Aprobación técnica: LOCAL/LAB**, basada en ensayo PostgreSQL 16.15 nativo. No autoriza ejecutar en WEB original, VPS ni producción. Plan vigente: `integrations/web-user-management/rollback-operational.sql`. El SHA-256 del SQL aprobado consta en `staging/user-security-results/release-manifest.json`.

El rollback es operativo y conserva los efectos de seguridad: retira la capacidad administrativa de reset, sus permisos y políticas, pero mantiene las versiones de contraseña y el historial. No promete devolver el esquema a una forma que pierda evidencia o reactive sesiones.

## Precondiciones y coordinación

Antes de una integración futura, guardar esquema/propietarios, ACL de tabla y columna, membresías, políticas, índices, constraints, ledger y versión de aplicación. No guardar contraseñas, JWT o hashes en informes. Las credenciales de los dos roles dedicados se provisionan fuera del repositorio. Los roles llevan marcador `EDUXFAC_USER_ADMIN_V2`; una colisión de nombres/objetos sin ledger se rechaza. La migración no asume propiedad de columnas preexistentes.

Para revertir: deshabilitar rutas de usuarios, detener nuevos resets y autorizaciones en todas las instancias, drenar solicitudes, cerrar sus pools dedicados y verificar ausencia de operaciones activas. No detener PostgreSQL. Si hay bloqueos, `lock_timeout=5s` aborta la reversión; no forzar sesiones ajenas.

## A. Código

Retirar el registro de GET/POST del adaptador, imports y pools dedicados. Se puede volver a la base de aplicación **con el puente de seguridad**: `integrations/web-user-management/web-auth-bridge.patch` sobre el baseline WEB, manteniendo también `integrations/web-user-management/session-version.mjs`.

Ese puente conserva los cambios en `app.js`, `auth.js` y `password-change.js`: lectura de versión al login, claim JWT, comprobación de versión en cada sesión y aumento al cambiar la temporal. También conserva `server/scripts/global-rls.js` para clasificar la tabla de eventos retenida en futuras revisiones del perfil. No revertir esos archivos íntegramente al código anterior mientras existan sesiones/evidencia que deban conservarse. La UI aprobada no necesita cambios para este trabajo; en una reversión operativa se deshabilitan las operaciones mediante backend.

## B. Grants y roles

El SQL revoca EXECUTE de autorizar/activar/reset/contexto y los permisos de tabla **y columna** concedidos a los tres roles exclusivos del paquete. REVOKE de tabla por sí solo no retira ACL de columna: ambos se incluyen y se probaron. Inhabilita LOGIN de `eduxfac_user_admin` y `eduxfac_user_authorizer`; no restaura contraseñas ni modifica roles WEB existentes.

Estos roles son exclusivos de V2 y su baseline de grants de negocio es vacío. No se hacen REVOKE sobre el servicio interno compartido, auth o app WEB. No se eliminan roles automáticamente: pueden quedar objetos de custodia y dependencias que deben revisarse por separado.

## C. Policies y RLS

Eliminar exclusivamente `user_admin_read` de empresas/usuarios/empresa_acceso/sucursales/usuario_sucursal, `user_admin_reset` de usuarios y `user_admin_event` de eventos. No alterar políticas anteriores `f10_tenant`, `f10_auth`, `f10_service` ni el RLS existente de las tablas de negocio.

La tabla nueva de eventos conserva ENABLE/FORCE y sus políticas de migrador/backup. El rol administrativo retirado queda sin permisos ni política de escritura. No se desactiva RLS para resolver errores.

## D. Funciones

Eliminar con RESTRICT, después de retirar las políticas dependientes:

- `admin_reset_web_user_password(uuid,uuid,text,text,uuid)`;
- `activate_web_user_context(text)`;
- `authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet)`;
- `web_user_context()`.

No CASCADE, no SQL dinámico para ejecutar un reset. Dependencias inesperadas causan error y ROLLBACK de toda la reversión. Las funciones eliminadas nunca restauran datos anteriores.

## E. Objetos y preservación

Conservar `usuarios.password_version`, su default/check y valores actuales; conservar `password_hash` y `debe_cambiar_password` vigentes. Conservar `web_user_admin_events`, su PK/índice/FKs/check y timestamps. Conservar `eduxfac_user_private.authorizations` (solo hashes de capacidades y metadatos, sin tickets en texto), con dueño NOLOGIN y sin acceso de runtime. Mantener el ledger de instalación para reconocer objetos y permitir una reinstalación controlada; no fingir que la migración nunca ocurrió.

Es una retención deliberada, no un fallo de la reversión. La retirada física de columnas/tablas requiere una tarea posterior con procedencia, archivo verificado, custodia/retención y cierre de la ventana de JWT; queda fuera de esta aprobación. Los SQL antiguos `rollback-empty.sql` y `rollback-preserve.sql` son diseños V1 retirados y ahora fallan cerrado para impedir que se usen con V2.

REVERSIBLE_OBJECTS=registro backend; pools; EXECUTE; grants de tabla/columna; políticas del paquete; cuatro funciones; LOGIN de los dos roles dedicados (solo tras nueva autorización de instalación).

RETAINED_OBJECTS=password_version y valores; auditoría; contexto privado; ledger; roles NOLOGIN; clasificación global de eventos; puente de autenticación.

NON_REVERSIBLE_SECURITY_EFFECTS=sesiones revocadas; contraseña anterior reemplazada; temporal invalidada tras cambio. Son efectos esperados: nunca se revierte una versión a cero ni se restaura un hash antiguo.

## Ensayo aprobado

En clúster PostgreSQL 16.15 independiente, con SCRAM y roles de aplicación sin privilegios elevados:

1. Crear fixtures sintéticos y aplicar migración. Un fallo intencional antes del primer COMMIT dejó sin columna/tabla nuevas y conservó datos.
2. Reset A1, verificar A1 revocado y A2/B1 vigentes. Cambiar temporal y verificar login definitivo; temporal rechazada.
3. Ejecutar `rollback-operational.sql` después del COMMIT y después del cambio de contraseña.
4. Verificar que desaparecen las cuatro funciones y políticas del paquete, que el antiguo runtime no puede consultar usuarios y que versiones/flags/eventos no cambian.
5. Con el puente activo, A1 anterior sigue 401; A2/B1 siguen 200. Se conservan los hashes vigentes; no se recuperan contraseñas viejas.

La prueba usa la aplicación WEB completa y sus pools auth/tenant nativos, sin sustituirlos por un propietario de BD. Solo el bootstrap/migración y las consultas de verificación usan al propietario del clúster sintético. El servicio original de Windows y su puerto 55432 permanecen ajenos al ensayo.

POST_COMMIT_ROLLBACK_AVAILABLE=YES.

POST_COMMIT_ROLLBACK_APPROVED=YES_LOCAL_LAB_TECHNICAL.

PRODUCTION_EXECUTION_APPROVED=NO.
