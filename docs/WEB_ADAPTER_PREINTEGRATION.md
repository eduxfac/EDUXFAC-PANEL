# EDUXFAC — WEB ADAPTER PREINTEGRATION

> Informe histórico del candidato V1. La corrección posterior y estado vigente están en `WEB_USER_MANAGEMENT_SECURITY_FIX.md`. Los SQL físicos de rollback V1 fueron retirados; para V2 corresponde `ROLLBACK_PLAN.md` y `rollback-operational.sql`.

Auditoría local, 2026-11-05. Resultado: **NO-GO para integrar el candidato actual**.

Panel: `D:\EDUXFAC_PANEL_V2`, baseline `83ada3fabddd9107160cd4eb34ee9fd82e1addbf` más cambios locales existentes. WEB: `D:\EDUXFAC_WEB_V2`, baseline `de7b515552002fccb885360a565b407c089ae06f`; no se aplicó el adaptador en ese checkout. No se accedió al VPS ni a PostgreSQL persistente. No se leyeron ni copiaron `.env`, certificados ni credenciales de los entornos. Todo usuario, documento y contraseña de prueba utilizado fue sintético.

## 1. Alcance y evidencia

- PostgreSQL efímero: PGlite 0.5.8, motor **PostgreSQL 18.3 WASM**, en memoria. No equivale a una certificación del PostgreSQL 16 Windows ni del entorno de producción.
- Roles de ejecución `lab_service`, `lab_app`, `lab_auth`, `lab_none`: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, no propietarios. SET ROLE permite ensayar permisos/RLS; no prueba SCRAM, TLS o conexiones LOGIN nativas. Bootstrap DDL con propietario del laboratorio.
- Fixtures: tres empresas (dos activas y una pendiente), cuatro usuarios activos/inactivo, tres sucursales, dos asignaciones de sucursal para A, roles, suscripciones activas/pendiente y JWT de A/B/C. No existe tabla de sesiones que borrar: la revocación se realiza validando versiones del JWT contra BD.
- Dos HTTP locales: Panel completo con SQLite en memoria, cliente HMAC real y rutas/middleware WEB. Ensayo de roles usa handlers de login/auth/cambio extraídos del candidato real en memoria, con adaptador DB que selecciona rol/contexto; no carga los workers ni el bootstrap WEB.
- Ensayo adicional usa **la aplicación WEB completa**, sobre espejo desechable `staging/preintegration/web-shadow`, con el adaptador de pruebas DB existente (propietario de PGlite). Complementa, no sustituye, el ensayo de roles no privilegiados. Panel y WEB solo escuchan loopback; se cierran al terminar.
- El patch se comprobó contra líneas exactas del WEB original y se aplicó únicamente a strings/espejo de staging. No se generó configuración para producción.

Evidencia reproducible:

| Archivo | Contenido |
|---|---|
| `tests/web-user-preintegration.test.mjs` | Migración, RLS, ACL, roles, HTTP, A/B/C, rollback |
| `scripts/audit-web-regression.mjs` | Espejo de fuente sin `.env`; regresión baseline/candidato |
| `scripts/audit-web-fullstack.test.mjs` | Panel HTTP → WEB completo → cambio obligatorio |
| `staging/preintegration/schema-before.json` / `schema-after.json` | Snapshot catálogo sintético, sin filas de usuarios ni hashes |
| `staging/preintegration/audit-results.json` | Hallazgos, roles y resultados de pruebas |
| `staging/preintegration/web-regression-results.json` | Regresión WEB baseline |
| `staging/preintegration/web-candidate-regression-results.json` | Regresión WEB candidato |
| `staging/preintegration/fullstack-results.json` | Flujo integral local |
| `staging/user-management-review/regression-results.json` | Regresión Panel y exclusiones explícitas |

Los archivos de staging están ignorados por Git. No contienen contraseñas temporales generadas, hashes existentes ni tokens. No se registraron cuerpos de autenticación. Los asserts evitan volcar respuestas con credenciales.

## 2. Inventario exacto del candidato

Archivos WEB nuevos que habría que entregar (todavía no copiados al checkout WEB):

1. `integrations/web-user-management/service.mjs`: listado y reset transaccional.
2. `integrations/web-user-management/rate-limit.mjs`: 5 resets/15 min por empresa:actor, memoria local, máximo 1000 entradas.
3. `integrations/web-user-management/session-version.mjs`: emisión/comprobación de `password_version`.
4. `shared/web-user-diagnostics.mjs`: diagnóstico público de acceso, sin validar contraseñas.
5. Migración candidata `integrations/web-user-management/schema.sql`: aún **sin nombre/registro en el migrador WEB**.

Archivos WEB modificados por `integrations/web-user-management/web-integration.patch`:

- `server/src/admin-service-api.js`: registro de GET/POST con scopes y rate limit.
- `server/src/app.js`: login selecciona versión por usuario.
- `server/src/auth.js`: claim y comprobación de versión por usuario en cada sesión.
- `server/src/password-change.js`: incremento de versión al cambiar temporal y emisión de JWT definitivo con la nueva versión.

El patch contiene cuatro modificaciones; **no incluye los módulos nuevos ni instala/registra la migración**. Aplicar solo el patch dejaría imports sin resolver.

Servicios nuevos: `createWebUserAdministration`, `registerWebUserAdministration`, `createResetLimiter`, `passwordVersionClaims`, `validPasswordVersion`; utiliza el servicio HTTP HMAC preexistente. No hay workers nuevos. Bcryptjs ya es dependencia WEB; costo 12.

Endpoints WEB nuevos, ambos bajo el middleware `requireService`:

```
GET  /api/internal/admin/v1/empresas/:company/usuarios
POST /api/internal/admin/v1/empresas/:company/usuarios/:user/reset-password
```

Las rutas `/api/web/empresas/...` son del **Panel**, no del WEB interno. El ID de empresa Panel se traduce mediante `web_empresas.empresa_web_id`.

Objetos nuevos de la migración:

| Objeto | Definición |
|---|---|
| Columna `usuarios.password_version` | integer NOT NULL DEFAULT 0 CHECK >= 0 |
| Tabla `web_user_admin_events` | request_id uuid, empresa_id uuid, usuario_id uuid, actor text, accion text, ip inet nullable, created_at timestamptz DEFAULT now() |
| PK / índice implícito | `web_user_admin_events_pkey` sobre request_id |
| FK | empresa_id → empresas.id; usuario_id → usuarios.id |
| CHECK | `usuarios_password_version_check`; `web_user_admin_events_accion_check` = PASSWORD_RESET |
| RLS nueva tabla | ENABLE + FORCE; **cero políticas** |
| ACL/GRANT/REVOKE | **ninguno** |
| Funciones SQL / triggers / secuencias / otros índices | **ninguno** |

Hay 7 restricciones NOT NULL adicionales (columna de versión y 6 columnas de eventos). PostgreSQL 18 las expone además en `pg_constraint`; no confundirlas con cambios inesperados ni extrapolar su representación a PG16. `debe_cambiar_password`, `password_hash`, `auditoria` y `empresa_acceso` son previos; esta migración no los crea.

No hay FK compuesta que obligue a que usuario_id pertenezca a empresa_id. Las FKs individuales no garantizan coherencia tenant. El código la valida, pero el esquema aislado necesitaría política/constraint coherente para defensa en BD. Tampoco hay trigger de inmutabilidad de eventos.

## 3. Contrato Panel ↔ WEB

### GET Panel `/api/web/empresas/:company/usuarios`

- AUTH_REQUIRED: sesión Panel vigente; ADMIN/SUPERADMIN, sin cambio de contraseña pendiente; permiso `web.companies.read` para principales modernos. La compatibilidad legacy usa sesión administrativa existente. Sin sesión HTTP: 401. Principal no permitido: 403. WEB exige JWT servicio HS256 con issuer/audience configurados, type=panel_service, sub=panel-eduxfac, jti, scopes y expiración máxima 5 min; cliente Panel emite por 120 s.
- INPUT: UUID de empresa Panel; sin cuerpo ni filtros nuevos. Traducción al UUID WEB desde BD Panel.
- OUTPUT: `empresa_id`, `razon_social`, `ruc`, `user_management_version:1`, `empresa` y `users[]`. Empresa allowlist: empresa_activa, estado, fecha_inicio, fecha_vencimiento, auth_version, suscripcion_requerida, suscripcion_id, estado_suscripcion. Usuario: user_id, usuario, nombre, activo, debe_cambiar_password, sucursales[{sucursal_id,nombre,activo,rol}], roles[], empresa_estado, suscripcion_estado, login_ready, reasons[]. Nunca hash, contraseña o JWT.
- ERRORS: 400 INVALID_ID/INVALID_INPUT; 403 PERMISSION_DENIED; 404 COMPANY_NOT_FOUND; 409 COMPANY_NOT_LINKED; 502 INVALID_WEB_RESPONSE/WEB_USER_OPERATION_FAILED; 503 WEB_USER_API_REQUIRED u operación indisponible. WEB agrega 400 INVALID_ID, 403 SERVICIO_SIN_PERMISO, 401 SERVICIO_NO_AUTORIZADO, 404 COMPANY_NOT_FOUND, 503 SERVICIO_DESHABILITADO/errores de BD saneados. El proxy Panel transforma errores no contemplados (por ejemplo un 401 del servicio) en 502.
- TENANT_CHECK: mapeo Panel→WEB, WHERE empresa_id y joins que igualan empresa de sucursal/usuario; respuesta empresa_id debe coincidir. Esto no es una autorización por empresa del principal Panel: los administradores centrales autorizados pueden gestionar varias empresas.
- ROLE_CHECK: rol/permiso Panel + scope WEB `usuarios:read`. Un JWT de administrador WEB es JWT de cliente, no de servicio: 401 en API interna.
- AUDIT_EVENT: ninguno. SELECT en transacción READ ONLY, ROLLBACK al finalizar.
- SESSION_EFFECT: ninguno; permite diagnosticar empresas/suscripciones pendientes sin activarlas.
- CACHE: no-store en ambas capas.

### POST Panel `/api/web/empresas/:company/usuarios/:user/reset-password`

- AUTH_REQUIRED: mismas condiciones con `web.companies.write`; validación de origen de POST en Panel; WEB scope `usuarios:reset` y limitador.
- INPUT Panel: UUID empresa Panel y usuario WEB; JSON exactamente `{confirmar:true,request_id:UUID}`. WEB recibe `{actor:principal.username,request_id,ip}`; actor regex 3–40 caracteres ASCII alfanuméricos, guion, punto y subrayado; ip nullable inet. WEB no rechaza claves adicionales explícitamente; Panel sí limita su cuerpo. No acepta contraseña elegida por navegador.
- OUTPUT Panel: empresa_id, user_id, usuario, temporary_password (generada en WEB, 20 caracteres), debe_cambiar_password:true, request_id, session_invalidation=USER_PASSWORD_VERSION. WEB retorna lo mismo salvo request_id. La respuesta es transitoria; no hay recuperación/replay de la contraseña.
- ERRORS: anteriores + 400 RESET_CONFIRMATION_REQUIRED/INVALID_INPUT; 403 CROSS_TENANT; 404 USER_NOT_FOUND; 409 RESET_ALREADY_PROCESSED/RESET_NOT_APPLIED; 429 limitador; 502 INVALID_RESET_RESPONSE; 503 USER_SESSION_VERSION_REQUIRED o error de privilegios/política. Un error SQL del driver puede llegar como código saneado (p.ej. 42501), sin mensaje de driver ni valores.
- TENANT_CHECK: empresa existente, bloqueo FOR UPDATE del usuario y comparación empresa_id; UPDATE incluye id Y empresa_id; rollback completo si no se actualiza exactamente una fila. UUID de otro tenant produce 403 en HTTP. El SELECT global del usuario necesita un servicio con lectura multiempresa para distinguir 403 de 404.
- ROLE_CHECK: ADMIN/SUPERADMIN + permiso Panel + JWT servicio/scope; no basta rol WEB de usuario/administrador.
- AUDIT_EVENT: `web_user_admin_events` con request_id único, empresa_id, usuario_id, actor, accion PASSWORD_RESET, ip y created_at, misma transacción que el hash/versión. No guarda contraseña, hash ni JWT. Cambio inicial posterior inserta `auditoria` con CAMBIO_PASSWORD_INICIAL y detalle `{}`.
- SESSION_EFFECT: incrementa solo `usuarios.password_version`, marca cambio obligatorio y actualiza bcrypt12. No modifica auth_version de empresa, actividad, permisos, roles, sucursales ni suscripción. Repetición request_id: 409 sin devolver el secreto. Error de red después de COMMIT requiere nueva acción explícita; no reintento automático.

CONTRACT_MATCH=YES para las capas Panel/WEB y traducción de IDs. Esto no certifica la disponibilidad en WEB original: los endpoints aún no se instalaron allí.

## 4. RLS y privilegios

No se inspeccionó la configuración de producción. Se auditó el **código del perfil global FASE10** y se reprodujo su subconjunto relevante en el laboratorio.

| Tabla | RLS en perfil global | Políticas relevantes |
|---|---|---|
| empresas | ENABLE/FORCE | f10_tenant(id=contexto), f10_service ALL true, f10_auth SELECT true; migrator/backup |
| usuarios, sucursales, empresa_acceso | ENABLE/FORCE | f10_tenant(empresa_id=contexto), f10_service ALL true, f10_auth SELECT true; migrator/backup |
| usuario_sucursal | ENABLE/FORCE | tenant heredado de usuarios; service ALL true; auth SELECT true; migrator/backup |
| roles | deshabilitada | catálogo compartido SELECT; sin políticas RLS |
| auditoria | ENABLE/FORCE | tenant por empresa, SELECT/INSERT; migrator/backup; servicio reset no necesita acceder |
| web_user_admin_events candidata | ENABLE/FORCE | **ninguna**, sin GRANT |

Targets del perfil: app/auth/internal/backup/migrator, nombres parametrizables; defaults `eduxfac_web_*_test`. Administrador humano es autorización de aplicación, no superuser PostgreSQL. Rol no autorizado: sin grants, SELECT denegado.

Resultados sin alterar candidato:

- SELECT de usuarios/relaciones con servicio: PASS en perfil global reproducido; empresa pendiente también es legible por diseño.
- Reset con servicio normal: FAIL 42501, falta INSERT en eventos. Añadir solo INSERT en una transacción de laboratorio no basta: FORCE RLS sin policy sigue denegando. Se revirtió ese ensayo antes de seguir.
- Tenant app: solo ve su empresa; UPDATE de usuario C no modifica filas. Rol sin permisos: denegado.
- Servicio compartido FASE10: tiene INSERT/UPDATE/DELETE en usuarios y políticas true. Un UPDATE SQL directo de C con contexto de A **sí afecta una fila**; se ensayó y revirtió. El endpoint impide ese cruce, la BD bajo ese rol no lo impide.
- La tabla nueva falta en `GLOBAL_TABLES`/`PRIVATE_TABLES`/`TENANT_TABLES` del planificador (`RLS_UNCLASSIFIED_TABLE`). Carece de `f10_migrator`, exigida por la comprobación de arranque global de app.js (`RLS_GLOBAL_PENDIENTE`). No ejecutar el planificador actual sobre la tabla nueva esperando que complete la migración.

Mínimo funcional, probado únicamente en perfil adicional del laboratorio:

- USAGE de schema y conexión DB para roles de ejecución, sin CREATE, propiedad, BYPASSRLS ni membresías administrativas.
- Servicio: SELECT columnas necesarias de empresas, empresa_acceso, usuarios, sucursales, usuario_sucursal y roles; SELECT password_version para incrementar; **sin SELECT password_hash**; UPDATE exclusivamente password_hash/debe_cambiar_password/password_version. FOR UPDATE requiere privilegio UPDATE además de SELECT.
- INSERT exclusivamente columnas de eventos usadas por el servicio, sin UPDATE/DELETE/SELECT de eventos, con política INSERT que verifica correspondencia empresa/usuario. UUID/now() no usan secuencia propia.
- Auth: SELECT de login/sesión, incluyendo password_hash y password_version, sin UPDATE. Su lectura global existente es un perfil sensible separado.
- Tenant WEB para cambio obligatorio: SELECT del propio usuario con hash/version; UPDATE password_hash, debe_cambiar_password, password_version y updated_at; INSERT en auditoria y permisos previos de lectura de acceso/relaciones. RLS por empresa más comprobación ID de usuario del handler. No se añade permiso para cambiar estado o roles desde reset.
- No hay DELETE de sesiones: lectura/comparación de versión revoca JWT. Ningún GRANT sobre ventas, inventario o fiscal es necesario para este adaptador.

El perfil de laboratorio redujo permisos del servicio para probar funcionalidad, **pero conserva lectura/RLS global del servicio** y no constituye la solución final a SQL cross-tenant. No aplicar sus REVOKE al servicio compartido: rompería operaciones previas. Se requiere rol/pool específico o función de alcance restringido; contexto empresa/usuario fijado desde parámetros autenticados dentro de la transacción y limpieza al liberar conexión. Si se usa SECURITY DEFINER: propietario sin login y sin superuser, search_path fijo, EXECUTE revocado de PUBLIC, alcance validado; diseñar y probar antes de aprobar.

MINIMUM_GRANTS_OK=NO para la migración candidata; perfil funcional adicional PASS en laboratorio. EXCESSIVE_PRIVILEGES=YES en el perfil compartido existente. RLS_CROSS_TENANT_BLOCKED=NO para SQL del servicio; YES para tenant normal y HTTP del adaptador.

## 5. Sesiones y matriz de roles

JWT antiguos sin password_version se interpretan como versión 0: siguen válidos solo para usuario con versión 0. Reset A pasa a 1; temporal genera token type web_password_change (15 min). Cambio obligatorio pasa a 2 y emite web_user (12 h). Se valida la versión contra BD en cada solicitud protegida.

Ensayo A/B/C con roles no privilegiados: A antiguo 401 después de reset y sigue 401 después de cambio; token temporal 401 fuera del cambio y 401 después de usarlo; B y C siguen 200; versiones de empresa permanecen 1; roles, sucursales y estados intactos. Varias sucursales de A comparten usuario: se revocan las sesiones de A en todas ellas, no las de otros usuarios de esas sucursales.

| Principal / caso | Resultado |
|---|---|
| Admin Panel autorizado + permiso + servicio scoped | listado/reset PASS con perfil adicional; candidato sin políticas falla cerrado |
| Principal estándar Panel (USER/VIEWER/OPERATOR) | 403 antes de llamada WEB |
| Admin WEB / usuario con JWT WEB ante API interna | 401: tipo/firma de servicio requerida; no 403 artificial |
| Servicio con scope ajeno | 403 |
| Sin token de servicio | 401 |
| UUID usuario de otra empresa en reset | 403, sin cambios |
| Empresa inexistente / usuario inexistente | 404 |
| Rol PostgreSQL sin privilegios | SELECT denegado 42501 |

ROLE_MATRIX_PASS=YES en autorización HTTP, con distinción correcta 401 para credencial de tipo incorrecto. No acredita separación SQL del servicio compartido.

Hallazgo adicional: el endpoint WEB preexistente PUT `/api/admin/users/:id` modifica password_hash sin incrementar password_version; está fuera del patch. La revocación individual se ha probado para el reset nuevo y cambio inicial, **no para todos los cambios de contraseña existentes**. Revisar antes de anunciar revocación universal. El límite de resets es por proceso, no distribuido; IP del actor llega desde Panel y debe validarse contra la topología proxy real.

## 6. Migración, preservación y rollback

Snapshots anterior/posterior muestran exactamente 1 columna de usuario + 7 de eventos, 1 tabla, PK/índice, 2 FKs, 2 checks y 7 NOT NULL. No cambian columnas, índices, políticas o grants anteriores. La migración no escribe usuarios existentes; todos reciben versión 0. Se compararon snapshots en memoria sin persistir hashes ni filas sensibles. Usuarios/roles/asignaciones/estados preservados; JWT existentes siguen válidos antes de un reset.

`IF NOT EXISTS` no valida tipo/default/check de una columna preexistente, CREATE TABLE no es idempotente, no hay versión en `web_schema_migrations`, faltan preflight y clasificación global. La transacción podría bloquear usuarios durante ALTER; faltan lock_timeout/statement_timeout operativos y validación nativa PG16.

Rollback pre-COMMIT: fallo intencional → ROLLBACK → catálogo/ACL/RLS/datos iguales. PASS.

Plan posterior: `D:\EDUXFAC_PANEL_V2\ROLLBACK_PLAN.md`.

- `rollback-empty.sql`: elimina objetos nuevos solo si no hay versiones ni eventos de uso, con baseline y dependencias verificados. Ensayo sin uso PASS; rechazo tras reset PASS.
- Tras uso: reversión operativa conserva columna, versiones, hash vigente, flag y auditoría; mantiene puente de autenticación. No restaura hashes anteriores.
- `rollback-preserve.sql`: borrador de retirada física tras cierre verificado de la ventana de JWT. Archiva versiones/eventos en esquema de recuperación, restringe acceso de runtime, conserva índices/FKs de eventos, no modifica ACL/RLS de tablas preexistentes y usa RESTRICT. Ensayo con datos sintéticos envejecidos y transacción externa: PASS; rechaza falta de aprobación/ventana abierta. No se ejecutó sobre datos persistentes.
- El borrado de la columna después de uso **no está autorizado** por esta auditoría. Hace falta aprobar el puente, tiempos de JWT/custodia/ACL de archivo y reversión del futuro perfil de permisos. Suprimir datos sin ese plan tiene riesgo ALTO de pérdida de evidencia o reactivación de sesiones.

POST_COMMIT_ROLLBACK_AVAILABLE=YES_CONDITIONAL_DESIGN_TESTED; no es un down automático aprobado para producción. DATA_LOSS_RISK=LOW con puente/archivo y condiciones verificadas; HIGH con eliminación/reversión ciega.

## 7. Regresión y flujo completo

- Panel + nueva auditoría: 271 TOTAL, 268 PASS, 0 FAIL, 3 SKIPPED. La auditoría nueva aporta 17 pruebas incluidas en ese total. Incluye regresión auth/roles, usuarios, sucursales, estados y planes disponible en este checkout.
- WEB baseline: 182/182 PASS, 0 FAIL, 0 SKIPPED, siete suites (admin-service-api, company-states, onboarding, plans-limits, subscriptions, tenant-isolation, user-password-edit).
- WEB con candidato **solo en espejo**: mismas 182/182 PASS, 0 FAIL, 0 SKIPPED. Las fixtures se remapearon al Panel actual y todos los documentos numéricos históricos se sustituyeron por identificadores sintéticos 99…; esquemas/base en memoria.
- WEB completo + Panel HTTP: 1/1 PASS adicional. Listado → reset → temporal → login restringido → cambio obligatorio → JWT definitivo → login final; temporal anterior rechazado. Suscripciones sintéticas activas preparadas explícitamente.
- Las 3 suites históricas Panel no disponibles figuran SKIPPED. Además el runner excluye 3 casos históricos fuera del total: dos manifiestos con ruta WEB antigua y rollback Fase7 con respaldo externo ausente. WEB subscriptions sí se ejecutó en el espejo, pero eso no convierte en disponible la suite histórica Panel. Sin certificación de regresión nativa, TLS/SCRAM, concurrencia multiproceso ni despliegue.

## 8. Seguridad y decisión

No plaintext en PostgreSQL ni archivos de resultados; hash solo en memoria/columna de contraseña; tokens solo en memoria. Sin logs de hashes/tokens. CROSS_TENANT_BYPASS=NO_HTTP / YES_SQL_SERVICE_PROFILE: no ocultar el hallazgo con un PASS global. SUPERUSER_REQUIRED=NO_RUNTIME; DDL requiere propietario/migrador autorizado y el ensayo WEB completo usa el adaptador de test con propietario, separado del ensayo no privilegiado.

Bloqueos:

1. Migración incompleta: permisos/event policy, clasificación global, políticas migrator/backup y registro/preflight del migrador.
2. Alcance y mínimos privilegios: el servicio compartido mantiene escritura multiempresa; diseñar y probar límite de empresa/usuario a nivel BD sin romper onboarding/estados/suscripciones.
3. Aprobar reversión operativa con puente y custodia de archivo; completar reversión del futuro perfil ACL/RLS y ensayos nativos equivalentes a PG16 antes de integrar.

RECOMMENDED_NEXT_STEP: corregir únicamente el paquete candidato en una tarea autorizada, diseñar rol/pool o función de reset específica y migración completa con reversión, repetir las pruebas no privilegiadas sobre PostgreSQL nativo aislado. Después solicitar integración local WEB; producción requiere validación/aprobación independiente.

PRODUCTION_DB_MODIFIED=NO; REAL_USERS_MODIFIED=NO; VPS_MODIFIED=NO; GITHUB_PUSHED=NO; SUNAT_CALLED=NO.

READY_FOR_WEB_INTEGRATION=NO. READY_FOR_PRODUCTION=NO.

Fuentes oficiales: PostgreSQL explica [RLS y denegación sin políticas](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [GRANT por columna](https://www.postgresql.org/docs/current/sql-grant.html) y [ALTER TABLE/RESTRICT/RLS](https://www.postgresql.org/docs/current/sql-altertable.html). La comprobación de permisos/RLS también se ejecutó con el motor del laboratorio; no se infirió de que un test con propietario pasara.

## 9. Entrega solicitada

El total siguiente suma Panel (incluye auditoría), regresión WEB candidato y el ensayo adicional de WEB completo. No vuelve a contar las 182 pruebas baseline ejecutadas como comparación. Los PASS comprueban también que el candidato falla cerrado y que sus defectos se reproducen; **no significan que esté listo para integrar**.

```text
ADAPTER_FILES=4 nuevos módulos WEB; 4 archivos WEB modificados (enumerados arriba)
MIGRATION_FILES=integrations/web-user-management/schema.sql (candidata sin registrar)
NEW_ENDPOINTS=GET usuarios; POST reset-password (rutas completas arriba)
NEW_DB_OBJECTS=1 columna; 1 tabla; PK/índice; 2 FK; 2 CHECK; NOT NULL; ENABLE/FORCE RLS
CONTRACT_MATCH=YES
RLS_READ_OK=YES_LAB_PROFILE
RLS_RESET_OK=NO_CURRENT_CANDIDATE
RLS_CROSS_TENANT_BLOCKED=NO_SERVICE_SQL; YES_TENANT_AND_HTTP
MINIMUM_GRANTS_OK=NO_CURRENT_CANDIDATE
EXCESSIVE_PRIVILEGES=YES_EXISTING_SHARED_SERVICE_PROFILE
USER_A_SESSIONS_INVALIDATED=YES_LAB
USER_B_SESSIONS_PRESERVED=YES_LAB
USER_C_SESSIONS_PRESERVED=YES_LAB
SESSION_REVOCATION_USER_ONLY=YES_LAB
COMPANY_WIDE_INVALIDATION=NO
ROLE_MATRIX_PASS=YES_HTTP (WEB JWT recibe 401; principal Panel sin permiso recibe 403)
MIGRATION_ADDITIVE=YES
UNEXPECTED_SCHEMA_CHANGES=0_SYNTHETIC
USERS_PRESERVED=YES
ROLES_PRESERVED=YES
BRANCH_ASSIGNMENTS_PRESERVED=YES
SESSIONS_PRESERVED_UNLESS_RESET=YES
COMPANY_STATES_PRESERVED=YES
EXISTING_DATA_PRESERVED=YES_SYNTHETIC
SCHEMA_BEFORE=staging/preintegration/schema-before.json
SCHEMA_AFTER=staging/preintegration/schema-after.json
ROLLBACK_BEFORE_COMMIT=PASS
POST_COMMIT_ROLLBACK_AVAILABLE=YES_CONDITIONAL_DESIGN; NOT_APPROVED_FOR_PRODUCTION
DATA_LOSS_RISK=LOW_WITH_PRESERVATION; HIGH_WITH_BLIND_DROP_OR_AUTH_REVERT
E2E_LIST_USERS=PASS_ISOLATED
E2E_RESET=PASS_ISOLATED
E2E_FORCE_CHANGE=PASS_ISOLATED
E2E_FINAL_LOGIN=PASS_ISOLATED
TOTAL_TESTS=454
PASS=451
FAIL=0
SKIPPED=3
ADDITIONAL_EXCLUDED_HISTORICAL_CASES=3 (outside total)
PASSWORD_PLAINTEXT_STORED=NO
HASH_LOGGED=NO
TOKEN_LOGGED=NO
CROSS_TENANT_BYPASS=YES_SHARED_SERVICE_SQL; NO_ADAPTER_HTTP
SUPERUSER_REQUIRED=NO_RUNTIME (owner/migrator for DDL; full-app fixture uses test owner)
PRODUCTION_DB_MODIFIED=NO
REAL_USERS_MODIFIED=NO
VPS_MODIFIED=NO
GITHUB_PUSHED=NO
SUNAT_CALLED=NO
WEB_CHECKOUT_MODIFIED=NO
READY_FOR_WEB_INTEGRATION=NO
READY_FOR_PRODUCTION=NO
```

Límite del resultado: perfiles equivalentes sintetizados, PostgreSQL 18 WASM, sin conexión de login nativa. Ninguno de estos valores certifica ACL/RLS ni funcionamiento en producción.
