# Backup y restore PostgreSQL PANEL

Probado únicamente en bases locales ficticias; no hay cron, tarea programada ni backup automático activado. PANEL y WEB tienen bases, roles, artefactos y restauración separados.

## Implementación local

server/panel-backup-restore.mjs usa pg_dump/pg_restore nativos 16.15 de herramientas del sistema; no usa las bases instaladas. Guarda formato custom **sin compresión**, extensión .dump, nombre PANEL_F8_YYYYMMDDHHMMSS_<id>.dump. No genera ZIP.

Guard: NODE_ENV=test, PANEL_F8_ISOLATED=yes, host localhost, DB panel_f8_*, directorio tests/.fase8/<lab> marcado. Secretos reales y destinos reales se rechazan. pg_dump recibe PGHOST/PORT/USER/DATABASE explícitos; se eliminan PGSERVICE/PGSERVICEFILE heredados y no se lee pgpass real.

Ejemplo protegido desde PANEL D::
npm run phase8:tool -- backup "<lab>"
npm run phase8:tool -- restore "<lab>" "<dump>"

Configurar conexión ficticia por entorno, nunca en URL de línea de comandos. Backup usa eduxfac_backup (SELECT). Restore usa eduxfac_migrator (propietario de esquema, no superusuario). La API normal eduxfac_panel_app no puede ejecutar DDL.

## Verificación y auditoría

pg_dump debe salir 0, artefacto no vacío y pg_restore --list exitoso; manifiesto con fecha, DB/esquema, bytes y SHA256. Registro de ejecución en reporte/manifiesto; si se pasa pool de auditoría app/migrator se añade panel_backup_events. No usar el rol backup para insertar el evento.

Retención configurable PANEL_BACKUP_RETENTION_COUNT (predeterminado14): retentionPlan solo propone conservar/revisar. No elimina archivos. Programación, rotación y destino externo se preparan tras autorización; no están activados.

## Restore ensayado

1. Backup del esquema panel de laboratorio.
2. Detener las dos APIs PANEL y cerrar pools; workers sin tareas reales.
3. Alterar un cliente ficticio.
4. Validar manifiesto, tamaño, SHA256 y ruta.
5. pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction sobre target ficticio.
6. Reaplicar grantPanelPrivileges y abrir con rol app limitado.
7. Comprobar 2.000 clientes, 10.000 pagos, 50.000 history, >5.000 cola; cliente restaurado, licencias/equipos/FKs, login/dashboard/health.
8. Restaurar también a clon aislado y comprobar rollback post-migración.

Archivo corrupto se rechaza antes de ejecutar restore. Informe reproducible BACKUP_RESTORE.json en tests/.fase8. No es una validación de RPO/RTO productivo ni de un backup real.

## Procedimiento futuro separado

PANEL: pg_dump --format=custom --compress=0 --no-owner --no-acl --schema=panel, conexión del rol backup a su DB, salida a directorio privado. Registrar checksum, cifrar para copia externa, verificar restore en clon con herramientas compatibles. Reaplicar permisos explícitos y revocar sesiones restauradas antes de abrir.

WEB: respaldo independiente de su DB/esquemas operativos, ledger, compañías y órdenes. No restaurar WEB con un dump PANEL; acordar un punto de corte y conciliar command_id para impedir duplicar pagos/renovaciones.

No incluir públicamente .env, service tokens, sesiones, hashes de contraseña, claves privadas o dumps con clientes. Los dumps contienen datos administrativos sensibles aun sin secretos planos: almacenarlos privados y cifrados fuera del servidor. Claves/config respaldadas cifradas aparte, acceso mínimo, custodia/rotación documentadas. La copia real preservada de SQLite/clave está en PRESERVACION_PRIVADA con ACL restringida; no se usó para probar.

Antes de VPS: definir responsable, horario futuro, retención, almacenamiento externo, cifrado, alarmas de fallo, RPO/RTO y simulacro completo con código/config/secretos coherentes. No habilitar herramientas reales simplemente quitando guards F8.

Permisos F8 concretos: app no puede borrar negocio; DELETE solo para sesiones e intentos. Historiales/auditorías son INSERT/SELECT, sin UPDATE/DELETE. Backup tiene SELECT de tablas/secuencias, sin USAGE/UPDATE de secuencias (no puede consumir IDs).
