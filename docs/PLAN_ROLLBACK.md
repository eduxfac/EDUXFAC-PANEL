# Plan de rollback futuro — Fase 6

**Solo documentación. No se ejecutó rollback, restauración, DOWN SQL ni borrado.**

## Cuándo detener la adopción

Errores persistentes de esquema/datos, aislamiento A/B o RLS, acceso concedido incorrectamente, corrupción de cola/ledger, migración incompleta, incompatibilidad de roles o imposibilidad de recuperar backups.

## Contención

1. Desactivar INTEGRATION_WORKER_ENABLED, RECONCILIATION_WORKER_ENABLED y EXPIRATION_WORKER_ENABLED en los procesos autorizados.
2. Detener limpiamente procesos (SIGINT/SIGTERM/gestor autorizado); esperar operaciones y revisar leases. No matar PostgreSQL del sistema ni otros servicios.
3. Suspender nuevos comandos administrativos durante el corte. WEB debe seguir verificando estado/fecha sin depender del Panel.
4. Registrar punto UTC de corte, versiones, último command_id aplicado y comandos no confirmados; conservar evidencia sin secretos.
5. Tomar un respaldo adicional consistente del estado posterior a la incidencia para no perder auditoría.

## Volver al código anterior

Respaldos Fase 6:
- D:\EDUXFAC\EDUXFAC WEB\03_RESPALDOS\FASE6_PRE_OPERACION_20261012_0743
- D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE6_PRE_OPERACION_20261012_0743

Restaurar solo los archivos respaldados a sus rutas relativas oficiales, verificar SHA256 y mantener workers apagados. Los archivos nuevos pueden quedar sin ser cargados por el código anterior; no hace falta borrar proyectos ni ZIP.
La copia de .env.example es una plantilla: **no reemplaza un entorno real ni restaura secretos**.
Primero ensayar compatibilidad en clone. El código Fase 5 no aplica los guards de cola Fase 6: no reabrir acciones administrativas con comandos cancelados/agotados inciertos hasta revisar su efecto real.

## Restaurar bases

- Restaurar PostgreSQL a una base/instancia autorizada, con escritores detenidos y roles compatibles; comprobar restauración antes del cambio.
- Restaurar SQLite consistente (incluido WAL/SHM cuando corresponde), conservando claves y contratos.
- No restaurar PANEL y WEB desde instantes incongruentes sin inventario de cambios posteriores al corte.
- Mantener command_id originales y ledger WEB. Un Panel restaurado puede repetir una orden ya aplicada; WEB debe reconocer el UUID y devolver replay.
- **No borrar acciones_admin ni historial para permitir reenviar.** No reenviar renovaciones como nuevos comandos.
- Revisar fuentes de verdad: WEB autoriza acceso y PANEL conserva contrato/precio; no sobrescribir conflictos comerciales automáticamente.

## DOWN SQL solo si está demostrado que es seguro

En un clone, inventariar exactamente los objetos nuevos de 006_operacion_workers (WEB) y 005_web_operations (PANEL).
Solo considerar retirar objetos de control/triggers nuevos si los workers están detenidos, no hay transacciones en curso, se conserva el negocio/auditoría y la compatibilidad anterior se demuestra.
Versionar y auditar cualquier downgrade; no editar migraciones anteriores ni quitar filas del ledger para simular éxito.
No se entregó un DOWN automático que borre cola, intentos o datos.

**No intentar DOWN SQL** si las tablas nuevas contienen órdenes/auditoría que se perderían, si se eliminarían referencias/contratos, si hubo transformaciones de datos irreversibles o si el impacto no está claro. Usar restauración consistente de backup y conciliación supervisada.

## Reentrada

1. Verificar migraciones, integridad, roles y RLS con rol limitado.
2. Ejecutar A/B, login/vencimiento/suspensión/renovación y recuperación de respuesta perdida.
3. Conciliar de forma supervisada; conservar conflictos ambiguos.
4. Resolver pendientes, cancelados y agotados sin resetear UUID ni duplicar efectos.
5. Confirmar backup/restore probado y observabilidad.
6. Rehabilitar workers por etapas bajo autorización nueva y vigilar backoff, leases, carga y alertas.

No actuar sobre VPS/producción ni bases reales a partir de este plan sin autorización posterior.


## FASE 8 — ensayo y reversión coherente

Respaldo previo: D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE8_PRE_POSTGRES_20261012_1008. Manifiesto SHA256 y preservación privada; no se abrió la SQLite real como base de pruebas.

Ensayado en laboratorio ficticio: rollback DDL a mitad de cadena; rollback de import tras clients; backup PG, parada de ambas APIs/pools, alteración ficticia y restore; relaciones/login/historial/cola recuperados; restore del mismo artefacto a clon nuevo. Una copia aislada del código FASE 7, con hashes del respaldo, arranca sobre SQLite ficticia restaurada y recupera login/dashboard.

Fallo API/worker: mantener UUID/cola e intentos, marcar error retryable, respetar lease/backoff y conciliar estado remoto antes de reintentar; no borrar historial ni emitir nuevo UUID de renovación. Las pruebas F6 preservadas cubren respuesta perdida/replay y F8 verifica persistencia de error y exclusión entre conexiones PG.

Procedimiento futuro: bloquear tráfico/escritores/workers, preservar órdenes posteriores al corte, restaurar en clon y validar; seleccionar código+DB+config compatibles, reaplicar permisos, revocar sesiones y probar A/B/login/comercial antes de reentrada. Si código FASE 7 vuelve a SQLite, sus permisos son de administrador único: no reabrir usuarios secundarios ni endpoints públicos hasta revisar controles. Nunca volver al código viejo contra DB F8 esperando conservar RBAC.

No DOWN destructivo automático. No retirar controles ni tablas/ledger para forzar arranque. Secretos reales y claves se restauran cifrados por custodia autorizada aparte. Ningún ensayo se ejecutó en VPS/producción.


## FASE9 — staging Linux local

Ver PRE_VPS_CHECKLIST.md, FASE9_STAGING_LINUX.md y BACKUP_LINUX_PANEL.md. Pruebas en Docker aislado Ubuntu24.04/PG16; backups separados, restore clones, rollback al código FASE8 SHA verificado. No producción/VPS. RLS núcleo A/B probado por SQL real; cobertura ERP global PARCIAL, bloqueante antes de adopción. PM2/Nginx/TLS/carga/caídas locales no autorizan despliegue. Mantener workers false por defecto y preservar UUID/ledger; rollback requiere código+DB+config compatibles. Secretos/DNS/TLS/firewall/backup externo reales pendientes de fase autorizada.
