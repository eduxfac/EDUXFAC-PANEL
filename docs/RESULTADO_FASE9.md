# Resultado FASE9 — staging Linux completado

Estado: **FASE9 cerrada en laboratorio local; producción NO aprobada**. Docker Desktop se reinició con autorización expresa y su motor recuperó operación. No se limpiaron archivos de C:. El ajuste final de restore reaplica permisos mínimos; catálogos globales sólo lectura comprobados por SQL en origen y clon. Login/health/RLS del clon final aprobado. Imagen final arrancada desde cero y 178 archivos verificados por SHA256 contra fuentes oficiales de D: y respaldos de código.

Los tres contenedores FASE9 quedaron detenidos, con network none, sin puertos publicados y restart no. PM2/workers/PostgreSQL/Nginx se cerraron limpiamente. Desarrollo conserva workers desactivados. Producción/VPS/DNS/secretos reales no intervenidos. El incidente del motor y las pruebas corregidas no se cuentan como aprobación; los resultados siguientes son verificaciones completas.

## 1–4. Archivos

### PANEL — modificados

- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\db.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\postgres-worker.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\app.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\panel-backup-restore.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\sqlite-postgres-migrator.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\CHECKLIST_ADOPCION_PRODUCCION.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\PLAN_ROLLBACK.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\tests\phase8-operations.test.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\tests\integration-operations.test.mjs

### PANEL — nuevos

- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\.env.example.staging
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\isolated-lab.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\start.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\server\request-limits.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\backup-restore.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\bootstrap.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\least-privilege.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\lib.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\load.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\nginx.conf
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\prepare-context.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\reboot-state.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\smoke.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\supplemental.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\validate.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\web-entry.mjs
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\staging\phase9\Dockerfile
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\FASE9_STAGING_LINUX.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\STAGING_LINUX_SETUP.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\PM2_PANEL.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\NGINX_PANEL.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\BACKUP_LINUX_PANEL.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\PRE_VPS_CHECKLIST.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\DEPLOY_PRODUCCION_FUTURO.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\RESULTADO_FASE9.md
- D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL\docs\INVENTARIO_FASE9.json

### WEB — modificados

- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\db.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\service-auth.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\auth.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\app.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\tests\helpers\native-plan-fixture.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\public\index.html

### WEB — nuevos

- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\.env.example.staging
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\csp-header.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\src\request-limits.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\server\scripts\staging-rls.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\public\delegated-events.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\tests\phase9-security.test.js
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\docs\FASE9_STAGING_LINUX.md
- D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\docs\RLS_VALIDACION_PRODUCCION.md

Artefactos adicionales: staging/phase9/artifacts (JSON/logs) y work (178 archivos curados y manifiesto SHA del contexto, sin datos reales). Backups oficiales: D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE9_PRE_STAGING_20261012_1903; D:\EDUXFAC\EDUXFAC WEB\03_RESPALDOS\FASE9_PRE_STAGING_20261012_1903. Todos hashes verificados. No empaquetados ZIP.

## 5–11. Entorno, compatibilidad y PostgreSQL

5. Docker Desktop local/Engine Linux, Ubuntu24.04.5, network none, sin puertos host, 2 CPU/3 GiB por contenedor. Tres contenedores FASE9: eduxfac-fase9-local (ensayos), eduxfac-fase9-repro (regresión) y eduxfac-fase9-final (imagen final fresca). Todos detenidos; cierre confirmado.
6. Versiones exactas: Node v24.21.0, postgres (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1), nginx version: nginx/1.24.0 (Ubuntu), PM2 6.0.14. npm 11.19.0; dependencias npm ci desde lock en Linux; no node_modules Windows.
7. Compatibilidad Linux validada; imports case-sensitive, sintaxis77 archivos. Correcciones necesarias: binarios PG por plataforma, guardas de laboratorio/rutas relativas, entrypoint PM2 explícito, cierre limpio y pools, headers/CSP/rate. .bat/PowerShell históricos no requeridos en runtime Linux. Windows conserva regresión.
8. PANEL PostgreSQL independiente: roles app/migrador/backup mínimos, migraciones/import equivalencia, transacciones/rollback/health/concurrencia/cierre validados.
9. WEB PostgreSQL en cluster/DB/roles separados; migraciones ficticias, TLS/SCRAM, credenciales cruzadas rechazadas. Normal runtime sin superusuario ni BYPASSRLS.
10. RLS real A/B SQL núcleo VALIDADO; cobertura ERP global PARCIAL. ENABLE/FORCE, inventario/productos/usuarios/transferencias y FK, bypass SET ROLE/row_security/service GUC rechazado, sin contaminación de pool. GUC de empresa confía en backend: credencial DB robada/SQL arbitrario no queda aislada por este modelo. Auth/internal/backup tienen acceso global explícito y requieren custodia. Ver WEB docs/RLS_VALIDACION_PRODUCCION.md.
11. Adaptador síncrono PANEL funciona con dataset: {"clients":2000,"web_empresas":2000,"web_manual_payments":10002,"history":50000,"integration_queue":5002}. Las empresas son snapshots PANEL (WEB sólo2 pilotos), cola mayormente terminal; no 2000 tenants activos ni5000 comandos pendientes simultáneos.

## 12. Rendimiento

| Escenario | Muestras/concurrencia | Media ms | p50 | p95 | p99 | HTTP |
|---|---|---:|---:|---:|---:|---|
| login_panel | 10/1 | 48.22 | 47.93 | 50.85 | 50.85 | {"200":10} |
| login_web | 10/1 | 314.42 | 302.02 | 364.95 | 364.95 | {"200":10} |
| dashboard | 30/5 | 926.77 | 988.43 | 999.73 | 1017.09 | {"200":30} |
| clientes_busqueda | 30/5 | 41.51 | 43.46 | 45.45 | 49.22 | {"200":30} |
| empresas_filtro | 30/5 | 97.70 | 103.30 | 108.01 | 108.16 | {"200":30} |
| pagos_pagina | 30/5 | 144.19 | 152.00 | 164.94 | 165.97 | {"200":30} |
| historial_50000 | 30/5 | 175.17 | 182.79 | 194.17 | 202.43 | {"200":30} |
| productos_web | 30/5 | 47.05 | 33.69 | 82.22 | 82.41 | {"200":30} |
| inventario_web | 30/5 | 40.93 | 34.77 | 68.73 | 71.32 | {"200":30} |
| login_panel_concurrent | 10/2 | 54.15 | 49.32 | 93.64 | 93.64 | {"200":10} |
| login_web_concurrent | 10/2 | 612.48 | 604.13 | 657.54 | 657.54 | {"200":10} |
| pagos_idempotentes | 10/2 | 21.80 | 19.29 | 40.96 | 40.96 | {"200":9,"201":1} |
| renovaciones_idempotentes | 10/2 | 22.99 | 14.06 | 101.65 | 101.65 | {"200":9,"409":1} |
| ventas_ficticias | 10/2 | 31.31 | 24.84 | 60.66 | 60.66 | {"201":10} |
| integracion_consulta | 10/2 | 63.67 | 62.70 | 88.11 | 88.11 | {"200":10} |

Dashboard ~1s p95 a5 concurrentes: fijar SLO y repetir carga sostenida/mezcla de operaciones antes del VPS; facade síncrona serializa trabajo. p99 de 10/30 muestras es máximo observado, no capacidad garantizada. Un409 de renovación concurrente es conflicto controlado, no duplicación: ledger conserva1 UUID/efecto; no ocultarlo como200.

RAM PM2 durante carga: web-fase9 111.5MiB/CPU 15% instantánea; panel-fase9 157.8MiB/CPU 7.8% instantánea. Cgroup memoria final 721.5MiB (incluye caché). CPU cgroup acumulada y ps promedios se guardaron, no máximos sostenidos. Dataset DB PANEL~30MiB/WEB~11MiB. Alarmas80/90 simuladas sin llenar disco; crecimiento/retención en BACKUP_LINUX_PANEL.md.

## 13–28. Operación y recuperación

13. **PM2**: Start/stop/restart/reload, crash SIGKILL y save/kill/resurrect pasaron. Entradas explícitas, sin PM2 VPS.

14. **Nginx**: Proxy, Host/Origin, tamaños, health,502 con app detenida y 504 con upstream ficticio que no responde pasaron. WebSocket no usado.

15. **HTTPS**: CA local explícita/TLS1.2/1.3, cookiePanel Secure/HttpOnly/SameSiteStrict, HTTP308->HTTPS; no cert real ni CA instalada en Windows.

16. **Workers**: Integración/retry/backoff/leases/replay/conciliación/vencimientos/reinicio pasaron. Nuevo ciclo tras restart verificado; defaults de desarrollo false. Contenedores y workers confirmados detenidos al cierre.

17. **PANEL caído**: WEB activa opera; suspendida/vencida bloquea localmente, sin llamada Panel por request.

18. **WEB caído**: Health OFFLINE tras caché60s, orden persistida; al regresar worker recupera el mismoUUID una sola vez.

19. **PG PANEL caído**: Errores500/503 controlados; WEB sigue; pool/facade reconecta, sin corrupción. Health puede no ser accesible si falla autenticaciónDB.

20. **PG WEB caído**: Errores controlados y recuperación; Paneldashboard accesible.

21. **Backup**: pg_dump custom no compresión, sin ZIP, backups separados/hashes: PANEL 10776037 bytes; WEB 305727 bytes. Cifrado AES256GCM/destino externo local ficticio, sin upload.

22. **Restore**: Clones nuevos con conteos/relaciones/historial/cola, loginPanel+WEB y RLS pasaron en ensayo guardado. Reaplicar REVOKE de globals después de restore confirmado: tenant no puede UPDATE roles; clone final permite login y mantiene RLS.

23. **Logs**: 7 logs sin canarios de password/session/service/token/URL completa. Rotación10MiB/7 preparada; no schedule real ni upload.

24. **Seguridad**: Roles mínimos, TLS/headers/CSP/CSRF/rate, topología privada y propuestaUFW. Secretos reales NO generados. Cobertura RLS global pendiente.

25. **Piloto A**: BASICO: alta/admin/password/login/venta/pago/renovación/suspender/reactivar/vencer/bloquear. Ficticio.

26. **Piloto B**: EMPRESA: varias sucursales, segundo usuario/login, límites, downgrade rechazado, cambio PROFESIONAL/regreso EMPRESA y conciliación. Ficticio.

27. **Rollback**: Código previo FASE8 SHA verificado +clon restaurado: login/dashboard/health 1323ms con restore ya listo. Reboot limpio del contenedor: 6587ms, conteos idénticos/0duplicados; no hostreboot ni RTO productivo.

28. **Smoke**: 10/10: login/dashboard/cliente/empresa/health Panel; login/empresa/productos/health/venta ficticia WEB. Guarda sólo Docker aislado, no producción.

## 29–31. Pruebas

| Ejecución completa | Aprobadas | Fallidas |
|---|---:|---:|
| panel_windows | 270 | 0 |
| web_windows | 260 | 0 |
| panel_linux | 270 | 0 |
| web_linux | 260 | 0 |
| FASE9_RESULTADOS | 45 | 0 |
| FASE9_CARGA | 9 | 0 |
| BACKUP_RESTORE_LINUX | 8 | 0 |
| FASE9_COMPLEMENTARIAS | 8 | 0 |
| SMOKE_LINUX | 10 | 0 |
| IMAGEN_FINAL_VERIFICADA | 3 | 0 |
| Reboot contenedor |1|0|
| Parada verificada de 3 contenedores |1|0|

29. Regresiones completas NODE_ENV=test, bases Postgres/SQLite/PGlite ficticias, seis tests nuevos CSP/delegación/rate y 85 escenarios staging. Sintaxis de 77 archivos y 178 hashes de imagen. Login clone final repetido 1/1 como verificación adicional, sin sumar dos veces el mismo caso.
30. **615 comprobaciones distintas aprobadas / 0 fallidas** en matriz final: 524 anteriores+6 nuevas unitarias+85 staging. 530 pasaron en cada plataforma; contabilizando Windows+Linux+matriz de staging: 1145 aprobadas/0 fallidas. Intentos iniciales fallidos corregidos y repetidos no equivalen a aprobación; los JSON/logs finales verifican estos resultados.
31. Las **524 anteriores** siguen pasando en Windows y Linux: PANEL 270 + WEB 254. No se eliminaron casos. Dos guardas PANEL/helperWEB portados con originales respaldados. SQLite/clave y esquemas conservan SHA256 + tamaño + fecha.

## 32–34. Estado y pendientes antes del VPS

32. Bloqueantes: cobertura RLS de TODOS los módulos y cruces/datos, revisión de roles auth/internal/backup y del GUC confiado al backend; custodia/rotación de secretos reales; plan de adopción de producción y backup y rollback compatibles autorizados. Docker/cierre local resueltos. RLS núcleo VALIDADO en SQL real; global PARCIAL.
33. Falta para VPS: definir SLO y capacidad y carga sostenida, validar systemd del host futuro, storage externo/retención/alarma real, aprobar ventana/acceso e inventario real y resolver bloqueantes; configurar firewall privado/DNS/TLS sólo en fase posteriormente autorizada. Ninguna de esas acciones reales ejecutada dentro de FASE 9.
34. **PANEL y WEB compatibles con Linux, integración/resiliencia local validadas; FASE9 completada como laboratorio. Producción NO aprobada; RLS total PARCIAL.** No usar porcentajes ficticios de avance.

Confirmaciones: no C: como fuente ni fuentes históricas; sí herramientas normales del sistema y caché Docker instalados. Sin VPS/IP real/DNS/deploy/producción/PROPIO/TECNICO/secretos reales/migraciones en DB real/ZIP. SQLite/clave y esquemas originales intactos por hash+fecha + tamaño; respaldos SHA256 verificados. Guía deploy futura preparada; NO ejecutada. Workers de desarrollo desactivados y tres contenedores FASE 9 detenidos sin reinicio automático. Reinicio Docker Desktop autorizado por usuario; no limpieza de archivos de C:.

Nota de almacenamiento: df del contenedor mide su disco virtual y no equivale al espacio físico libre de C:, donde Docker mantiene componentes normales del sistema. No se limpiaron ni movieron archivos de C:. El cierre no cambia ubicación/recursos de Docker.
