# Rollback PILOTO — plan futuro

Ensayo local aprobado: retorno desde release fallida a la release PILOTO validada, usando clones ya restaurados; tiempo observado 2165 ms. **No es tiempo de restauración completa ni garantía de RTO del VPS.**

Disparadores: fallo de arranque/health, bloqueo de login, discrepancia de stock/integración, pérdida de aislamiento o migración incompatible. Detener alta y writers/workers; preservar evidencia, dos backups coherentes y el estado de cola/UUID antes de intervenir.

1. Confirmar modo y pareja de bases, release y corte aceptado. Registrar responsable y ventana.
2. Volver a código conocido compatible con RLS GLOBAL y con ese esquema. No volver al perfil parcial FASE9.
3. Si requiere restauración, usar clones PANEL/WEB y validar conteos, secuencias, FKs, ledger, roles, 44 FORCE RLS, ACL y marcadores antes del cambio.
4. Reconciliar operaciones posteriores al corte y órdenes pendientes por UUID. Nunca replay con un UUID nuevo ni aplicar DOWN SQL indiscriminado.
5. Revalidar health, login/cambio de contraseña, UI PILOTO, A/B y operaciones. Revisar/revocar sesiones restauradas cuando corresponda.
6. Reabrir bajo autorización; habilitar workers por etapas. Conservar incidencias y controles de recuperación.

No restaurar sobre una base real a ciegas, no cambiar DNS ni Nginx por este documento. La compatibilidad y el tiempo deben medirse en el entorno futuro autorizado.
