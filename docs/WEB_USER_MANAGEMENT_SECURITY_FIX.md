# EDUXFAC USER MANAGEMENT — SECURITY FIX

2026-11-05. **GO técnico para una integración LOCAL posterior y autorizada. Producción: NO.** Esta tarea corrige y ensaya el paquete candidato; no lo instala en `D:\EDUXFAC_WEB_V2`.

## Cambio realizado

El adaptador deja de usar el rol interno compartido. Usa dos identidades PostgreSQL independientes, con credenciales distintas, y un propietario de funciones sin login:

| Principal | Uso | Privilegios |
|---|---|---|
| `eduxfac_user_admin` | pool de lectura/reset | SELECT de metadatos por RLS y EXECUTE activar/reset/contexto; sin hash leído, UPDATE directo ni INSERT directo de auditoría |
| `eduxfac_user_authorizer` | pool de autorización | únicamente EXECUTE de emisión de autorización; sin SELECT/UPDATE/INSERT de usuarios o eventos |
| `eduxfac_user_admin_owner` | propietario de funciones | NOLOGIN; SELECT de columnas necesarias, UPDATE solo password_hash/debe_cambiar_password/password_version, INSERT de columnas de eventos; sujeto a RLS |

Los tres son NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT, sin membresías. Los dos logins empiezan NOLOGIN en la migración; sus credenciales deben provisionarse por un procedimiento autorizado posterior. En el laboratorio se habilitaron con contraseñas aleatorias solo en memoria. El propietario permanece NOLOGIN.

**Alcance:** el antiguo rol interno compartido conserva sus permisos preexistentes para onboarding/estados/suscripciones; el adaptador ya no lo usa ni acepta su conexión como fallback. `EXCESSIVE_PRIVILEGES=NO` y bloqueo SQL se refieren a las identidades dedicadas del adaptador. Esta tarea no rediseña los privilegios de todos los servicios WEB.

No se modificaron pestaña, modal, textos, estilos ni navegación de la UI aprobada. Los cambios de Panel son backend: cliente y servicio de usuarios.

## Contexto autorizado, no solo un GUC

1. Panel autentica al administrador, comprueba rol/permiso y mapea empresa Panel → UUID WEB. El cliente firma en el JWT `user_context` con empresa/actor y, para reset, usuario/request_id. No toma el actor del navegador.
2. WEB valida el JWT de servicio existente, scopes y coincidencia de ese contexto firmado con ruta/cuerpo. Alterar parámetros sin una autorización coherente devuelve 403 antes de acceder a la BD.
3. El pool **authorizer**, separado del ejecutor, invoca una función que registra una capacidad aleatoria de 256 bits. La BD guarda solo SHA-256 de la capacidad, empresa, usuario, actor, request_id, IP, operación y vencimiento de 60 segundos. No guarda ticket, JWT, contraseña o hash de contraseña en ese registro.
4. El pool **admin** abre una transacción y activa la capacidad. La BD exige su login exacto, capacidad vigente/no consumida y la vincula a PID de backend + ID de transacción. Fija empresa/target/actor/request con `set_config(...,true)` (equivalente a SET LOCAL).
5. Cada política valida esos GUC contra el registro privado de esa transacción. Cambiar empresa/actor/usuario/request, inventar un ticket, reutilizarlo tras COMMIT o iniciar sin autorización falla cerrado. Un cliente SQL con solo credenciales del ejecutor no puede emitir autorizaciones ni cambiar arbitrariamente de tenant.

La credencial del authorizer es una autoridad de confianza para afirmar el principal ya autenticado; debe permanecer separada de la del ejecutor y de la del migrador. No se afirma resistencia ante compromiso simultáneo de ambas credenciales, del proceso WEB o de un DBA.

Las operaciones LIST consumen una autorización técnica mediante COMMIT; sus consultas de usuarios son solo lectura. No crean eventos PASSWORD_RESET ni modifican datos de negocio. Ya no se presenta toda la transacción LIST como `READ ONLY`, porque activar/consumir una autorización escribe metadatos privados.

## Reset atómico y RLS

`public.admin_reset_web_user_password(empresa_id,user_id,password_hash,actor,request_id)` valida contexto/operación/principal, empresa y usuario; toma bloqueo del usuario y actualiza solo hash bcrypt12, debe_cambiar_password=true y password_version+1. Inserta PASSWORD_RESET en la misma transacción. No devuelve hash. En Node se genera la contraseña en memoria; solo se devuelve al administrador después de COMMIT.

RLS limita SELECT a la empresa autorizada y UPDATE del propietario de funciones al usuario objetivo. El ejecutor no tiene UPDATE, ni siquiera por columna. La auditoría tiene ENABLE/FORCE y una política de INSERT para el propietario que exige empresa/usuario/actor/request/IP/operación exactos y pertenencia del usuario. No se concede INSERT directo al ejecutor: incluso un evento aparentemente válido debe proceder de la operación atómica. Se probó también la política de eventos directamente con una función de sondeo temporal de laboratorio: A permitido, B falsificado denegado; el sondeo se eliminó inmediatamente.

No hay cambio de auth_version de empresa, actividad de usuarios, username, empresa, roles, asignaciones, sucursales, ventas, inventario o fiscal. Reset + revocación + evento hacen COMMIT juntos; evento duplicado/fallo de auditoría devuelve conflicto y revierte el nuevo hash/versión.

Según la elección expresa del usuario, **usuarios ajenos y desconocidos devuelven el mismo 404**, sin revelar existencia fuera de la empresa autorizada. Se mantiene 403 para falta de autorización, contexto manipulado o privilegios insuficientes; 409 para replay/conflicto; 500 saneado para error interno. El contrato HTTP Panel visible no cambia; el JWT interno ahora requiere contexto firmado.

## SECURITY DEFINER y permisos

Cuatro funciones: authorize_web_user_operation, activate_web_user_context, web_user_context y admin_reset_web_user_password. Todas: propietario controlado NOLOGIN, search_path `pg_catalog,pg_temp`, objetos schema-qualified, sin SQL dinámico, EXECUTE revocado de PUBLIC. El DDL de instalación usa SQL dinámico únicamente para nombres de roles/políticas/ACL validados y escapados con format; no ejecuta SQL suministrado por una solicitud.

Se eliminan explícitamente ACL de tabla y **columna** residuales de los roles exclusivos antes de conceder mínimos. El arranque de los pools comprueba identidad, servidor/BD coincidentes, flags, membresías, propiedad y privilegios peligrosos. No hay fallback a DATABASE_URL/WEB_SERVICE_DATABASE_URL. Las lecturas Node usan schema-qualified public.*.

Se rechazan colisiones de roles/objetos no registrados, propietario de esquema privado inesperado, columna de versión incompatible, RLS previo ausente, políticas/ACL de PUBLIC y roles migrador/backup ausentes o confundidos con runtime. Una reinstalación normal es idempotente; una configuración desconocida se rechaza, no se normaliza silenciosamente.

## Migración y paquete entregable

Migración canónica: `integrations/web-user-management/014_web_user_administration.sql`. `schema.sql` es copia idéntica de compatibilidad del paquete. En la integración futura se copia a `database/migrations/014_web_user_administration.sql`. Registra `014_web_user_administration` en web_schema_migrations. No se conecta ni aplica sola.

El migrador WEB `npm run migrate` preexistente no aplica automáticamente las migraciones administrativas numeradas: 014 requiere ejecución explícita y coordinada por un migrador autorizado, después de sus precondiciones. No se añadió auto-migración al arranque ni se ejecutó esa orden sobre WEB original.

Nuevos objetos: password_version con default/check, tabla de eventos con PK/índice/FKs/check, esquema privado y tabla de autorizaciones con PK SHA/índice único PID+txid, roles, cuatro funciones y políticas/grants específicos. No se cambia contenido de tablas de negocio. Los índices nuevos sirven a unicidad de request_id, búsqueda de capacidad y contexto transaccional; no se crean índices extra de negocio.

Compatibilidad global: el patch clasifica web_user_admin_events como tabla administrativa privada, permite que falte antes de instalar 014 y conserva las políticas `user_admin_*` al recalcular el perfil global. La migración crea f10_migrator/f10_backup y SELECT del backup, usando por defecto los roles del plan FASE10. Para nombres distintos deben fijarse explícitamente `eduxfac.user_admin_migrator_role` y `eduxfac.user_admin_backup_role` en la sesión de instalación; la ausencia de los roles bloquea toda la transacción.

Archivos WEB nuevos:

- integrations/web-user-management/service.mjs;
- integrations/web-user-management/database.mjs;
- integrations/web-user-management/rate-limit.mjs;
- integrations/web-user-management/session-version.mjs;
- shared/web-user-diagnostics.mjs;
- database/migrations/014_web_user_administration.sql.

Archivos WEB modificados en web-integration.patch: server/src/admin-service-api.js, app.js, auth.js, password-change.js y server/scripts/global-rls.js. Se entrega también web-auth-bridge.patch para reversión de código con conservación de seguridad. Patch + módulos + migración son el paquete; el patch solo no basta.

Espejo generado: `D:\EDUXFAC_PANEL_V2\staging\user-security-candidate`. Plantilla sin credenciales: `integrations/web-user-management/ENVIRONMENT.example`. Ningún .env activo fue creado o modificado.

## Rollback posterior al COMMIT

Plan completo en `D:\EDUXFAC_PANEL_V2\ROLLBACK_PLAN.md`; SQL revisado rollback-operational.sql. Aprobación técnica **solo local/lab**, no autorización de producción.

Retira funciones, grants de tabla/columna, políticas exclusivas y LOGIN de los dos roles dedicados, conservando puente de autenticación, versiones de usuario e historial. Se ensayó después de reset y cambio obligatorio: A1 antiguo sigue 401; A2 y B1 siguen 200; eventos/flags/versiones permanecen idénticos. No restaura contraseñas anteriores.

REVERSIBLE_OBJECTS=backend administrativo, pools, permisos EXECUTE/tabla/columna, políticas exclusivas, cuatro funciones, habilitación de LOGIN.

NON_REVERSIBLE_SECURITY_EFFECTS=sesiones revocadas; contraseña anterior reemplazada; temporal consumida. Se retienen columna y evidencia; su retirada física requiere revisión posterior y no forma parte del rollback operativo aprobado.

## Validación y límites

PostgreSQL **16.15 nativo Windows x64**, con SCRAM, binarios ya instalados. Clúster nuevo en D:\EDUXFAC_PANEL_V2\staging, puerto loopback aleatorio distinto de 55432. No se tocó el servicio eduxfac-postgresql-16 ni su directorio de datos. Los clústeres de prueba se detienen al finalizar. Bootstrap/DDL usa propietario del clúster sintético; todos los logins runtime del circuito son roles separados sin superuser/bypass, incluido auth y app WEB.

Matriz SQL: SELECT A permitido/B invisible; reset A permitido/B denegado; contexto ausente/manipulado/ticket inventado/reutilizado denegado; usuario estándar sin EXECUTE; hash y tabla privada inaccesibles; UPDATE directo/INSERT directo no concedidos; auditoría contextual permitida y falsificación denegada. Se probó fallo de instalación antes de COMMIT y reinstalación idempotente. Fixtures con tres empresas, usuarios activos/inactivo, sucursales, roles y suscripciones activas/pendiente.

E2E usa **Panel completo y aplicación WEB completa**, cliente JWT real y pools PostgreSQL nativos reales: listado pendiente y activo, reset, temporal, login restringido, cambio obligatorio, bootstrap y login definitivo; temporal y tokens previos rechazados. A2/B1 conservan sesiones; auth_version global permanece 1. No hay adaptador DB sustituido por superuser en ese circuito. El esquema nativo es fixture representativo del circuito; no se certifica el arranque ni todos los módulos fiscales/de negocio de una instalación completa.

Resultados finales (sin contar reejecuciones de la misma suite):

| Grupo | Total | PASS | FAIL | SKIPPED |
|---|---:|---:|---:|---:|
| Panel + seguridad + matriz/E2E nativos | 260 | 257 | 0 | 3 |
| WEB candidato, 7 suites de regresión | 182 | 182 | 0 | 0 |
| Total | **442** | **439** | **0** | **3** |

Las 25 pruebas nativas están incluidas en Panel. Se repitieron tras ampliar el listado pendiente/activo y pasaron 25/25; no se suman nuevamente. Las suites del candidato WASM anterior se reescribieron para el contrato corregido y la matriz nativa; por eso los conteos no son acumulables con los 454 anteriores.

SKIPPED: tres suites Panel con helpers en checkouts históricos ausentes: integration-operations, postgres-panel-native y web-subscriptions. EXCLUDED_HISTORICAL=3, fuera del total: dos manifiestos WEB de rutas anteriores y rollback Fase7 con respaldo externo ausente. No se cuentan como PASS.

Regresión WEB de admin-service-api, company-states, onboarding, plans-limits, subscriptions, tenant-isolation y user-password-edit: espejo de fuente con documentos sintéticos y helpers remapeados al Panel actual. Usa PGlite para regresión funcional del puente y rutas existentes; el fixture añade solo password_version. **No pretende probar la migración RLS completa sobre WASM**: esa migración y el reset se ensayan nativamente por separado. Tampoco certifica todos los cambios de contraseña WEB previos; el PUT administrativo preexistente sigue fuera del alcance de la revocación de este nuevo reset.

Evidencias ignoradas por Git: `staging/user-security-results/native.json`, release-manifest.json, `staging/user-management-review/regression-results.json`, `staging/preintegration/web-candidate-regression-results.json`. El log nativo se comprobó contra contraseña temporal, hash vigente y JWT: ninguno aparece. No se guardan esos valores en informes/archivos de resultados.

El control de resets sigue siendo por proceso, no distribuido. No se probaron TLS/SCRAM de producción ni concurrencia de despliegue multinodo. El SCRAM y los roles nativos locales sí se usaron. No se inspeccionó ni modificó configuración real/producción.

## Resultado

```text
SERVICE_DB_ROLE=eduxfac_user_admin
SUPERUSER=false
BYPASSRLS=false
CREATEDB=false
CREATEROLE=false
TENANT_CONTEXT_ENFORCEMENT=AUTHORIZED_CAPABILITY+BACKEND_PID+TRANSACTION_ID+VALIDATED_SET_LOCAL
RLS_READ_OK=YES
RLS_RESET_OK=YES
RLS_AUDIT_OK=YES
RLS_CROSS_TENANT_BLOCKED_SQL=YES_DEDICATED_RUNTIME
RLS_CROSS_TENANT_BLOCKED_HTTP=YES (404 uniforme para ajeno/desconocido)
MINIMUM_GRANTS_OK=YES
EXCESSIVE_PRIVILEGES=NO_ADAPTER_ROLES
RESET_ATOMIC=YES
SESSION_REVOCATION_USER_ONLY=YES
COMPANY_WIDE_INVALIDATION=NO
SECURITY_DEFINER_USED=YES
SECURITY_DEFINER_HARDENED=YES
MIGRATION_ADDITIVE=YES
DESTRUCTIVE_SQL=NO_BUSINESS_DATA
POST_COMMIT_ROLLBACK_AVAILABLE=YES
POST_COMMIT_ROLLBACK_APPROVED=YES_LOCAL_LAB_TECHNICAL
NON_REVERSIBLE_SECURITY_EFFECTS=REVOKED_SESSIONS;REPLACED_OLD_PASSWORD;CONSUMED_TEMPORARY_PASSWORD
NATIVE_PG_VERSION=16.15 Windows x64
NATIVE_PG16_TEST=PASS
E2E_LIST_USERS=PASS
E2E_RESET=PASS
E2E_FORCE_CHANGE=PASS
E2E_FINAL_LOGIN=PASS
TOTAL_TESTS=442
PASS=439
FAIL=0
SKIPPED=3
EXCLUDED_HISTORICAL=3 (outside total)
PASSWORD_PLAINTEXT_STORED=NO
HASH_LOGGED=NO
TOKEN_LOGGED=NO
PRODUCTION_DB_MODIFIED=NO
REAL_USERS_MODIFIED=NO
VPS_MODIFIED=NO
GITHUB_PUSHED=NO
SUNAT_CALLED=NO
WEB_CHECKOUT_MODIFIED=NO
UI_MODIFIED=NO
READY_FOR_WEB_INTEGRATION=YES_LOCAL_ONLY
READY_FOR_PRODUCTION=NO
```

BLOCKERS para el candidato local: ninguno en los criterios ensayados. Pendientes antes de una integración real posterior: autorización de esa fase, snapshot del entorno local destino, confirmación de nombres/configuración de roles y provisionamiento seguro de las dos credenciales, aplicación explícita coordinada de 014 y del paquete completo, con rollback/puente preparados. Son pasos de integración aún no ejecutados, no una afirmación de que WEB ya esté integrado. Para producción se requiere evaluación/autorización separada y no existe GO en esta tarea.

Fuentes primarias usadas: [SECURITY DEFINER seguro en PostgreSQL 16](https://www.postgresql.org/docs/16/sql-createfunction.html), [políticas RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html), [SHA-256 nativo](https://www.postgresql.org/docs/16/functions-binarystring.html), [clústeres con initdb](https://www.postgresql.org/docs/16/app-initdb.html). Los resultados de permisos no se dedujeron solo de esas reglas: se ejecutaron con logins PostgreSQL 16 nativos.
