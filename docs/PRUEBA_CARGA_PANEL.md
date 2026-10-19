# Prueba de carga PANEL FASE 8

Datos totalmente ficticios en PostgreSQL nativo aislado. Dos bases y roles separados, herramientas del sistema, sin VPS/producción. Medición local sobre Node 24.20.0 y PostgreSQL 16.15; no es un SLO de VPS.

| Dataset | Filas |
|---|---:|
| clientes | 2000 |
| empresas | 2000 |
| suscripciones | 2000 |
| pagos | 10000 |
| eventos_history | 50000 |
| comandos | 5012 |

| Operación | p50 ms | p95 ms |
|---|---:|---:|
| dashboard | 443.01 | 510.84 |
| clientes_busqueda | 6.91 | 7.55 |
| empresas_filtro | 30.36 | 31.01 |
| pagos_pagina | 28.75 | 29.05 |
| historial_50000 | 63.79 | 75.79 |
| 10_lecturas_HTTP_concurrentes | 72.70 | — |
| conciliacion_piloto_B | 27.86 | 38.94 |
| worker_cola_5000 | 17.20 | 21.02 |


Los p95 de cinco muestras son prácticamente el máximo: no ofrecen una distribución estadística de producción. Diez solicitudes concurrentes corresponden a clientes paginados, no a diez dashboards completos. Trabajadores/conciliación se miden con cola de más de 5.000 registros, mayormente APLICADOS; no se afirma entrega sostenida de 5.000 comandos pendientes.

La paginación devuelve 20/50/100; búsquedas/filtros cuentan en servidor. Outbox no duplica comando. Dos conexiones PG no pueden poseer el mismo lease. UUID de pago/renovación repetido conserva un efecto. Planes/límites/estados y último SUPERADMIN se prueban simultáneamente. A/B mantiene aislamiento.

Limitación: fachada síncrona bloquea event loop, advisory lock serializa escritores; lectura dashboard ronda 0,4 s en este equipo. Antes de VPS fijar presupuestos y repetir tráfico sostenido/errores/red/TLS/disco/Linux, concurrencia con conexiones reales y collation, plan de índices/async y restore bajo volumen real. No extrapolar estas cifras a 2.000 usuarios conectados.

Reproducir: NODE_ENV=test y node --test tests/postgres-panel-native.test.mjs desde PANEL D:. Cluster nuevo marcado solo en D:, localhost/puertos efímeros y cierre al terminar. No usar un DATABASE_URL real. Evidencia: FASE8_CARGA.json, FASE8_PILOTO.json, FASE8_BACKUP_RESTORE.json y tests/FASE8_RESULTADO_PANEL_FINAL.log.
