# FASE 8 — PostgreSQL y operación previa a producción

Estado: implementación local validada. No se ha conectado al VPS ni migrado datos reales. La DEMO 4310 usa SQLite ficticia para revisar la interfaz; el piloto, carga y restore utilizan PostgreSQL nativo aislado.

## Fuentes y preservación

PANEL: D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL
WEB: D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL

Respaldo previo: D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE8_PRE_POSTGRES_20261012_1008. VERIFICACION_FASE8.json registra hashes del código anterior, pruebas/migraciones y preservación privada de SQLite/clave de prueba. No se usaron esas copias reales en los ensayos.

## Implementación

server/db.mjs selecciona PANEL_DB_ENGINE=sqlite|postgres. No hay escritura dual. PostgreSQL dispone de pool, consultas parametrizadas, timeout, transacciones, rollback, cierre y health. server/postgres-worker.mjs exige un rol sin SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE y sin CREATE del esquema.

La fachada síncrona mantiene la lógica FASE 1–7. Se comunica con un pool en worker thread mediante memoria compartida; **la espera bloquea el event loop principal**. Un advisory lock por transacción serializa escritores entre procesos para preservar BEGIN IMMEDIATE. Esta solución es transitoria: medir la capacidad aceptable del Panel administrativo y decidir repositorios async antes de ampliar carga/concurrencia. No garantiza un servidor de alta capacidad.

Esquema panel separado de la base WEB: 40 tablas, ledger PostgreSQL con SHA256, ocho migraciones, outbox y auditorías inmutables. Se conservan UUID/JSON/fechas como TEXT y IDs enteros como BIGINT identity por compatibilidad y equivalencia; fechas del ledger son timestamptz. No se transforma masivamente el modelo histórico. COLLATE NOCASE se traduce a C: el orden no es una ordenación lingüística española ni un casefold Unicode.

## Autorización

SUPERADMIN, ADMIN, SOPORTE y LECTURA se validan en backend por acción y rol vigente. Sesiones ligadas a usuario y auth_version, expiración máxima 8 horas, revocación por logout/rol/reset/desactivación; último SUPERADMIN activo protegido. Scrypt y salt por contraseña. Reset obliga cambio antes de operar. No se devuelve el hash ni la contraseña. CSRF exige Origin exacto + JSON; cookies HttpOnly, SameSite=Strict, Secure en producción. Limitación de intentos por usuario/peer e IP del socket, sin confiar automáticamente en X-Forwarded-For.

Health interno exige login; informa APP/DB/WEB cacheada/workers/cola sin URI ni credenciales. Desktop utiliza consultas paginadas (20/50/100). Revisión de recuperación registra decisión/motivo/auditoría, pero no emite claves ni reactiva equipos.

## Pilotos y pruebas

Pruebas PostgreSQL con roles dedicados y dos empresas ficticias. A: BASICO, alta, activación, login, pago, renovación idempotente, suspensión/revocación, reactivación, vencimiento. B: EMPRESA, sucursales/usuarios, límites, conciliación. Se verifican A/B y roles DB separados. Política RLS ilustrativa se ensaya en tabla ficticia; **no está aplicada a las tablas reales WEB**.

Migración ficticia: 34 tablas, 47 filas, conteos y hashes lógicos equivalentes, FK verificadas. Backup/restore recupera 2.000 clientes, 10.000 pagos, 50.000 eventos y cola de más de 5.000 comandos. Los artefactos y mediciones están en tests/.fase8; no contienen datos reales. Código FASE 7 se volvió a iniciar contra una copia SQLite ficticia y recuperó login/dashboard.

## Antes de autorizar el VPS

1. Revisar compatibilidad/capacidad de la fachada síncrona y escrituras serializadas, auditoría y dependencia pg fijada.
2. Ensayar de nuevo en staging Linux con Node >=24 y PostgreSQL compatible; revisar collation y zonas horarias.
3. Crear roles/bases por separado con credenciales reales fuera del código bajo autorización nueva.
4. TLS PostgreSQL verificable y HTTPS; proxy/host/origen exactos y rate limit en Nginx.
5. Revisar RLS y todas las rutas WEB bajo rol limitado; no habilitar FORCE RLS sin definir el contexto transaccional.
6. Respaldos cifrados fuera del servidor, restore y objetivos RPO/RTO aprobados.
7. Adoptar empresas con dry-run revisado; corte consistente y sesiones invalidadas; ensayar rollback.
8. Solo después autorizar despliegue y workers gradualmente.

Las herramientas F8 bloquean bases reales. Su futura habilitación operativa requiere una revisión específica de rutas, identidad, congelación de escritores, backups y permisos; no basta quitar el guard.

Permisos F8 concretos: app no puede borrar negocio; DELETE solo para sesiones e intentos. Historiales/auditorías son INSERT/SELECT, sin UPDATE/DELETE. Backup tiene SELECT de tablas/secuencias, sin USAGE/UPDATE de secuencias (no puede consumir IDs).
