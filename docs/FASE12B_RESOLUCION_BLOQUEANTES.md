# FASE12B — cierre de bloqueantes del VPS y validación PILOTO

13/10/2026, America/Lima. **GO PARA CONTINUAR DEPLOY PILOTO.**

La preparación y las validaciones aisladas del VPS quedaron aprobadas. Este GO permite continuar el PILOTO controlado; **no autoriza registrar clientes reales ni usar la base antigua como producción.**

## Ajuste posterior verificado

Corregido el retorno visual del cambio de contraseña en PANEL PILOTO. Dos archivos frontend y regresión46/46 por entorno; autenticación original restaurada, cuentas y contraseñas sin cambios por el agente. Ver [diagnóstico del ajuste](CORRECCION_CAMBIO_PASSWORD_PANEL_PILOTO.md). Recuentos anteriores son históricos; no se repitió toda la fase.

## Resultado

- app.eduxfac.com sirve WEB PILOTO por HTTPS, upstream127.0.0.1:3001 y data_mode=PILOTO.
- admin.eduxfac.com sirve PANEL PILOTO por HTTPS, upstream127.0.0.1:4310 y ENTORNO PILOTO.
- eduxfac.com conserva WEB anterior en3000. Proceso eduxfac PID988, cero reinicios, código anterior3086 SHA intactos. Ninguna escritura de Codex en la base antigua eduxfac.
- Tres muestras sucesivas de cada dominio aprobadas. Integración real PANEL→WEB por https://app.eduxfac.com, service auth, estado/plan/suscripción/conciliación aprobados.
- Health final: WEB APP, WEB DB, PANEL APP, PANEL DB, PANEL→WEB, Nginx, PM2 y TLS: **8/8 OK**.
- Smoke HTTPS y A/B:67/67. Compra/venta/inventario ya probados con fixtures ficticias; el cierre consulta esas operaciones, conserva stock9 y no repite altas, compras o ventas.
- Backups/restores previos conservados y aprobados; no rehechos. Cuenta smoke deshabilitada al terminar, admin inicial exige cambio y workers siguen desactivados.

## Recuento exacto y procedencia

**FASE12B operativa acumulada:460 comprobaciones aprobadas, cero fallos pendientes.** Recuento de controles registrados en esta fase, no universo de pruebas únicas ni suma con FASE11.

|Grupo|Aprobadas|Fallidas pendientes|
|---|---:|---:|
|Checkpoint original: ensayos/sintaxis/configuración/PM2/smoke/preservación|190|0|
|Continuación: trazabilidad/RLS/controles/restores/schema/integración ficticia|181|0|
|Carga del runtime HTTPS PANEL|3|0|
|Integración/smoke/A-B HTTPS final|67|0|
|PM2 save/startup y preservación|10|0|
|Health y materiales de rollback final|8|0|
|ACL pública comprobada desde esta PC|1|0|
|**Total**|**460**|**0**|

La diferencia histórica de conteos y la conmutación V1 fallida se conservan como incidencias resueltas, no como nuevas aprobaciones. El primer checkpoint tuvo una diferencia real, aclarada por el usuario y22 controles de trazabilidad. V1 abortó validación y restauró el enrutamiento; V2 completó la conmutación manual. Otros fallos de instrumental se documentaron y corrigieron sin cambiar código aplicativo.

Aparte del recuento operativo: investigación READ-ONLY del rollback9/9; helper V2 definitivo15/15 local. No se suman al total para evitar mezclar investigación/instrumental repetido. No se cuentan157 transferencias,3086 archivos o pasos booleanos del script como miles de pruebas.

**FASE11:1481/0 históricas conservadas**,1476 ejecutadas y cinco operativas retenidas.18 hashes críticos PANEL/WEB revalidados idénticos, sin reejecutar regresión ni backup/restore anteriores. No se afirma una nueva ejecución de1481 pruebas sobre VPS ni se suman a460.

## Los30 puntos de FASE12B

|#|Punto|Estado final|
|---:|---|---|
|1|Node24|24.21.0/npm11.19.0 por usuario, interpreter absoluto en ambos PILOTOS.|
|2|Node22|22.23.3 global preservado; WEB antiguo PID988 sin reinicios.|
|3|PM2|7.0.4 compatible, tres procesos online y guardados; startup existente active/enabled. No reboot realizado.|
|4|Backup WEB|Código/esquema/DB/ledgers/Nginx/PM2 conservados, hash exacto.|
|5|Restore WEB|Legado41 tablas con integridad y login6/6. PILOTO49 tablas/44FORCE, restore13/13 y smoke8/8.|
|6|Comparación VPS-D|63 fuentes:26 iguales,8 diferentes,29 solo D,0 solo VPS. Detalle por archivo conservado abajo.|
|7|Decisión diferencias|Nueva release coherente CODE_ONLY desde D; /var/www/eduxfac sin reemplazo.|
|8|Migraciones WEB|Dry-run/rollback aprobados; seis SQL y plan RLS aplicados solo en nueva eduxfac_web_piloto.|
|9|Permisos .env|Antiguo0600 eduxadmin, contenido preservado. Runtime/cofre0600 solo VPS.|
|10|sudo manual|Todas las acciones privilegiadas ejecutadas por usuario y luego verificadas; Codex nunca recibió contraseña.|
|11|PANEL DB|eduxfac_panel_piloto separada,40 tablas/8 migraciones SHA.|
|12|Roles DB|Siete nuevos mínimos sin SUPER/BYPASS/CREATEDB/CREATEROLE. Roles antiguos intactos.|
|13|Secretos|DB/service configurados solo VPS; WEB_SESSION_SECRET distinto. PANEL usa sesiones opacas DB, SESSION_SECRET no aplicable.|
|14|PANEL deploy|Fuente D oficial, npm ci Node24 sin lifecycle scripts,157 CODE_ONLY/SHA y71 validaciones JS/importaciones.|
|15|Nginx|Admin manual aprobado; app conmuta por V2 manual con nginx -t y readiness. Root conserva3000.|
|16|DNS|Público sin cambios; resolución interna local preparada manualmente.|
|17|HTTPS admin|Cadena/hostname/redirect/renovación dry-run aprobados; certificado exclusivo admin.|
|18|Firewall|Inventario manual:22/80/443, Node/5432 no públicos; sin ajustes. ACL interna pública403 verificada.|
|19|pg_hba|Peer local/SCRAM loopback preservados, sin cambios posteriores.|
|20|Exposición PG|127.0.0.1/::1, conexiones con validación TLS/CA/hostname; ningún reinicio global.|
|21|PANEL→WEB|Destino HTTPS cargado y guardado, health/estado/plan/suscripción/operación/conciliación aprobados.|
|22|PM2 PANEL|Solo Panel reiniciado para cargar endpoint; WEB antiguo sin reinicios.|
|23|Backup PANEL|Primer dump128585 bytes, SHA conservado.|
|24|Restore PANEL|Clone independiente40 tablas/8 migraciones,13/13; smoke9/9.|
|25|Health|Ocho componentes OK.|
|26|Smoke|PANEL42/42, integración ficticia previa62/62, cierre HTTPS67/67.|
|27|A/B|Negativas HTTP HTTPS403 en ocho rutas por empresa; SQL sin WHERE aislado por RLS.|
|28|Rollback|Backups/código/PM2/Nginx anteriores disponibles. V1 rollback real confirmado; operador manual V2 preparado, sin ejecutarlo.|
|29|Bloqueantes|Ninguno pendiente para continuar preparación/deploy PILOTO controlado. Puertas de primer cliente real abajo.|
|30|Resultado|**GO PARA CONTINUAR DEPLOY PILOTO**, sin cliente real.|

## Incidencias resueltas

La venta adicional de eduxfac fue una prueba confirmada por usuario.22/22 READ-ONLY: una venta/tres detalles/un pago/una auditoría/un movimiento de caja/tres de inventario coherentes, misma transacción xmin878,13/10/2026 07:03:11.521UTC. Filas anteriores intactas. No se corrigió ni borró la operación.

V1 comprobaba una única respuesta inmediatamente tras reload asíncrono y no guardaba cuerpo/status; hizo rollback correctamente. No se afirma la respuesta histórica exacta ausente. **V2 registró en su propio intento la secuencia esperada:** primer health200 sin data_mode, a0,642s PILOTO y a1,245s PILOTO; solo entonces aceptó conmutación. Respeta el [reload gradual de Nginx](https://nginx.org/en/docs/control.html). La primera respuesta de V2 demuestra la transición en ese intento, no reconstruye el cuerpo perdido de V1.

V2 definitiva corrigió además chown del log para apuntar al archivo V2 y normalizó LF. SHA real local/remoto6d48615442e6e5ae7ce8caf6dc9b447e96656cd8ddccd087afcd661ffc5bcb86;15/15 helper local. Solo usuario ejecutó sudo, confirmó WEB_PILOT_ROUTE_V2_OK; no se repitió V1 ni V2 automáticamente.

## Migraciones, RLS y datos

PANEL8/WEB15 etapas ensayadas en transacción con rollback. Ensayo RLS/A-B22/22 dejó la base nueva vacía. APPLY_WEB_PILOT_SCHEMA.mjs verificó destino nuevo vacío, owner, marcador PILOTO, roles, backup y SHA; aplicó seis migraciones y401 permisos/políticas atómicamente. Se omitió COMMENT del plan402 para conservar marcador administrativo. installGlobalRLS mantuvo intacta su guarda laboratorio/Docker; no se falseó ni ejecutó ese instalador. Nueva WEB:49 tablas,44 FORCE, cinco globales con ACL.

Solo empresas ficticias F12B_FICT_A/B y cliente local smoke; sin importación del sistema antiguo ni datos DEMO C. Compra10, venta1, stock9 y pago manual59PEN son pruebas anteriores. El cierre HTTPS reutilizó las mismas fixtures. Contraseñas/tokens nunca descargados ni mostrados. f12b_smoke_ficticio quedó deshabilitado; eduxadmin conserva cambio obligatorio. Workers integration/reconciliation/expiration permanecen false.

La base antiga eduxfac conserva41 tablas y su perfil histórico sin RLS; permanece para pruebas/rollback del WEB anterior, **no adoptada para clientes reales**.

## Backups/restores disponibles, sin repetición

|Material|Ruta relativa al directorio remoto backups|Bytes / SHA256|
|---|---|---|
|WEB legado|FASE12B_20261013_0625/WEB_REAL.dump|2681696 / bccb462cdc63f27fd7d9d76a530af6a0be47f07ed8ca8ef06c2cf232747ea2b4|
|PANEL inicial|FASE12B_PANEL_INICIAL_20261013_0625/PANEL_PILOTO_INICIAL.dump|128585 /4658b59a96fb514e1c4e3a690412ca3b2a7c9f1aa66c4a6ea61770e35af037d1|
|WEB PILOTO inicial|FASE12B_WEB_PILOTO_INICIAL_20261013_0625/WEB_PILOTO_INICIAL.dump|241175 /3b5b29aff1c3e3fd0bfd718277b857a3ccd183832ec6e967145266046104b95a|

Directorio: /home/eduxadmin/.local/share/eduxfac/backups. Primeros dumps vacíos, código/Nginx/PM2 originales y backup administrativo /var/backups/eduxfac/FASE12B_PREPARACION_20261013_0625 conservados.

Clones existentes probados sin recreación/DROP: eduxfac_f12b_restore_20261013_0625, eduxfac_panel_f12b_restore_20261013_0625, eduxfac_web_f12b_restore_20261013_0625. Snapshot WEB PILOTO consistente,49 tablas/44 FORCE, pg_dump --inserts --enable-row-security con rol sin BYPASS; restore y privilegios validados antes de fixtures de login aisladas. Procesos temporales detenidos.

PM2 save se realizó una sola vez al terminar: tres procesos persistidos, interpreter y destino HTTPS; startup anterior active/enabled, sin reboot ni antiguo WEB restart. dump.pm20600, respaldo original intacto. El antiguo dump.pm2.bak único se preservó por renombrado privado antes de que PM2 generara su nuevo .bak; no se rehízo ningún backup completo. Todos esos archivos con entornos/secretos permanecen solo VPS.

## Rollback manual disponible — NO ejecutar ahora

Código anterior y proceso antiguo siguen disponibles. Vhost backup SHA770a7c8632f5c11e0b3ee8d98db42346f9c1948df753a36e14f672a3fa4b3c0f, PM2 original y dumps verificados. Operador operations/phase12b/MANUAL_ROLLBACK_WEB_ROUTE_V2.py copiado en home; AST y SHAe0693f970811924f27147b21d9bc0c56aaf5c00ff3a24d57913bda4b14abd081 verificados, **no ejecutado**.

Solo en contingencia y con ejecución manual del usuario:

```bash
sudo /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/MANUAL_ROLLBACK_WEB_ROUTE_V2.py --apply
```

Comprueba hashes/estado, restaura solo el enrutamiento original, conserva enlace/config/evidencias, nginx -t antes de reload y espera dos health antiguos estables. No restaura/borrar DB, emitir certificados ni reiniciar PM2. No declarar recuperación si retorna DETENER; inspeccionar y no repetir. El operador no fue ensayado aplicando cambios sobre Nginx activo tras V2; la recuperación real previa V1 queda como evidencia independiente.

## Puertas pendientes antes de un cliente real

No son bloqueantes de esta preparación aprobada, pero este informe no las sustituye:

- Autorización específica de alta del primer cliente real y definición de alcance operativo.
- Cambio de contraseña inicial por su administrador, accesos y custodia de secretos.
- Backup externo/offsite, retención, restore en ese destino y RTO/RPO definidos.
- Capacidad/SLO/alertas, ventanas operativas y decisión explícita sobre workers todavía apagados.
- Separar/conservar fixtures de prueba conforme al plan acordado, sin borrar/importar datos automáticamente.
- Reboot real no probado; configuración/startup verificados sin reiniciar VPS.
- El WEB histórico en eduxfac.com y eduxfac no debe tratarse como sistema validado para clientes reales.

## Evidencias y restricciones

staging/phase12b/artifacts: WEB_PILOT_ROUTE_V2, PANEL_HTTPS_RUNTIME_FINAL, CIERRE_HTTPS_INTEGRACION_AB, PM2_STARTUP_FINAL_VALIDADO, HEALTH_ROLLBACK_CIERRE_FINAL, PUBLIC_ACL_FINAL, PRESERVACION_FASE11_CIERRE_FINAL y todas las evidencias sanitizadas previas. docs/INVENTARIO_FASE12B.json consolida SHA actuales.

No contraseña sudo recibida, escrituras Codex en eduxfac, cambio DNS público/UFW/pg_hba/PG global, reinicio PG/VPS/WEB antiguo, sustitución de /var/www/eduxfac, código aplicativo D modificado, fuentes C históricas, PROPIO/TECNICO, ZIP o cliente real. Acciones privilegiadas exclusivamente manuales confirmadas. Documentación anterior y respaldos preservados.


## Comparación y decisiones WEB

F12 inicial era parcial; comparación ampliada63 archivos. Las decisiones de reemplazo corresponden a nueva release PILOTO, nunca permiso automático para cambiar WEB activo. Incorporar backend/frontend/seguridad coherentemente, no archivos aislados. JSON DECISIONES_WEB_ARCHIVO_POR_ARCHIVO contiene63 rutas y SHA ambos lados;26 iguales se conservan.

| Archivo | Estado | Decisión | Motivo/riesgo |
|---|---|---|---|
| database/migrations/001_empresa_acceso.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| database/migrations/002_alta_clientes_empresas.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| database/migrations/003_estados_empresa.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| database/migrations/004_planes_limites.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| database/migrations/005_suscripciones_vigencia.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| database/migrations/006_operacion_workers.sql | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Migración explícita; ensayo rollback, no aplicar a eduxfac. |
| package-lock.json | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Agrega PGlite dev; versiones runtime bloqueadas conservadas. |
| package.json | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Añade script test; dependencias runtime conservadas. |
| public/delegated-events.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| public/index.html | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| public/initial-password.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/scripts/expiration-worker.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/scripts/expire-subscriptions.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/scripts/global-rls.js | SOLO_D | REVISAR EJECUTOR; SOLO PLAN | Guarda laboratorio intacta; no aplicada. |
| server/scripts/staging-rls.js | SOLO_D | NO APLICA | Herramienta de laboratorio. |
| server/src/admin-service-api.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/app.js | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/auth.js | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/branch-admin.js | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/commercial-api.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/commercial-conditions.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/company-access.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/company-state-policy.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/csp-header.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/db.js | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/environment-mode.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/inventory-entry.js | DIFERENTE | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/onboarding-api.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/operations-api.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/password-change.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/request-limits.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/service-auth.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/subscription-api.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/subscription-calendar.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/subscription-service.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/src/tenant-guard.js | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |
| server/start.mjs | SOLO_D | REEMPLAZAR POR D: SOLO RELEASE PILOTO | Integración/seguridad FASE1-11; incorporar coherentemente, sin reemplazo parcial. |

Una comparación anterior que enviaba cuerpos completos de código por SSH fue rechazada por aprobación automática, sin ejecutarse. Se resolvió con metadatos/hashes. La posterior transferencia CODE_ONLY fue aprobada como preparación aislada dentro del home, no como sustitución ni reintento del payload rechazado.

