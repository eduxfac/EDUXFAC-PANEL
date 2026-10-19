# Despliegue futuro admin.eduxfac.com — solo preparación

No se ha conectado al VPS ni se han cambiado DNS, PM2, Nginx, firewall, TLS o PostgreSQL instalados.

## Diseño

Directorio futuro propuesto: /srv/eduxfac/panel (código), /etc/eduxfac/panel.env (entorno privado), /var/lib/eduxfac-panel (datos auxiliares), /var/backups/eduxfac-panel (backups privados). Separar del directorio/DB/cuenta WEB. Cuenta SO sin privilegios y permisos mínimos; evitar código y backups dentro de webroot.

Node >=24.0 (local ensayado24.20.0). npm ci desde package-lock.json revisado. Driver pg fijado8.23.0 instalado en D: desde caché offline. Revisar dependencias y lock antes de producción; no se ejecutó npm audit remoto ni se certifica ausencia de CVE.

PostgreSQL: bases eduxfac_panel y eduxfac_web separadas. Roles eduxfac_panel_app, eduxfac_web_app, eduxfac_migrator y eduxfac_backup sin superusuario/BYPASSRLS/CREATEDB/CREATEROLE. Revocar PUBLIC CONNECT de ambas bases y CREATE del esquema public; grant CONNECT por DB, USAGE esquema, DML mínimo y secuencias. Migrator propietario dedicado, fuera del runtime; backup solo lectura. Establecer privilegios de objetos futuros al introducir migraciones nuevas. Verificar aislamiento negativo desde ambas credenciales.

## Entorno futuro

NODE_ENV=production
PANEL_DB_ENGINE=postgres
PANEL_DATABASE_URL=<gestor de secretos, DB PANEL; no valor real en repositorio>
PANEL_PG_TLS=verify-full
PANEL_PUBLIC_ORIGIN=https://admin.eduxfac.com
PANEL_DB_STATEMENT_TIMEOUT_MS=10000
PANEL_SESSION_TTL_MS=28800000
PANEL_HSTS_ENABLED=false hasta certificar HTTPS
INTEGRATION_WORKER_ENABLED=false
RECONCILIATION_WORKER_ENABLED=false
EXPIRATION_WORKER_ENABLED=false
EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION=no

Las variables PANEL_WEB_SERVICE_* usan emisor/audiencia/base autorizada y secret privado rotado independiente. No usar credenciales DEMO. El runtime verifica certificado PG; preparar CA/cadena confiable compatible con la configuración de Node, sin desactivar rejectUnauthorized.

## PM2/Nginx/HTTPS/firewall — sin ejecutar

PM2: proceso único inicialmente, usuario de servicio, cwd /srv/eduxfac/panel, script server/app.mjs, restart/backoff/logs y entorno privado. El Panel escucha127.0.0.1:4310. No exponer4310 ni5432 públicamente; no arrancar varios procesos sin ensayar bloqueo de escritores/leases y carga.

Nginx: server_name admin.eduxfac.com, proxy_pass http://127.0.0.1:4310, conservar Host público exacto, TLS válido, redirección80→443, límite de cuerpo coherente, rate limit por IP en /api/login y límites generales. No guardar ni cachear cookies/respuestas API; logs sin body, Cookie, Authorization ni argumentos secretos. Origin debe conservarse exacto; no confiar cabeceras arbitrarias de proxy para autorización.

HTTPS primero, luego HSTS explícito tras validación. Firewall abrir solo los puertos autorizados para SSH restringido y HTTPS; PostgreSQL privado/loopback o red privada TLS, sin permisos públicos. No dejar el initdb -A trust utilizado en fixtures como configuración real.

## Operación

Health /api/admin/health autenticado, sin URI/secrets. Monitorear errores/timeouts, sesiones, cola/retry/backoff/agotados, snapshots obsoletos, latencia y disco. WEB health es cacheado, no prueba conectividad actual. Workers apagados hasta validar identidad de servicio, migraciones, idempotencia, expiración y recuperabilidad.

Backups PANEL/WEB independientes, cifrados privados fuera del servidor, retención aprobada, restore periódico en staging. Secretos/config cifrados aparte. No automatizaciones habilitadas en FASE 8.

## Gates antes de conectar

Firmar checklist/adopción/rollback; revisar RLS de WEB real, mínimos privilegios, método de migración productiva, sesiones y passwords iniciales; ensayar staging Linux/HTTPS/PG TLS; aceptar capacidad de fachada síncrona o migrar repositorios a async; confirmar RPO/RTO y backup externo. Conectar/deploy solo con autorización posterior explícita.

Permisos F8 concretos: app no puede borrar negocio; DELETE solo para sesiones e intentos. Historiales/auditorías son INSERT/SELECT, sin UPDATE/DELETE. Backup tiene SELECT de tablas/secuencias, sin USAGE/UPDATE de secuencias (no puede consumir IDs).
