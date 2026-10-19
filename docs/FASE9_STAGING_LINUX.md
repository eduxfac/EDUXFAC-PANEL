# FASE 9: laboratorio Linux

Fuentes exclusivas: PANEL_EDUXFAC_ACTUAL y EDUXFAC_WEB_ACTUAL en D:. Sin VPS, DNS, producción, fuentes históricas C:, ZIP ni datos reales. Respaldos de archivos modificados: FASE9_PRE_STAGING_20261012_1903 en 03_RESPALDOS de cada proyecto; manifiesto SHA256.

Entorno: Docker local, Ubuntu 24.04.5, Node 24.21.0, PostgreSQL 16.15, Nginx 1.24.0, PM2 6.0.14. Contenedor eduxfac-fase9-local: red none, 2 CPU, 3 GiB, sin puertos publicados. Usuarios runtime sin superusuario/BYPASSRLS/CREATEDB/CREATEROLE. Bootstrap privilegiado exclusivamente para aprovisionar clusters ficticios.

PANEL: panel_f8_stage9, puerto interno 55421; WEB: web_f9_stage9, 55422. Clusters, roles, tablas y backups independientes. Nginx 8080/8443 dentro del contenedor, Node 4311/3001 en loopback. Certificados de laboratorio con CA explícita y validación TLS, sin instalar CA en Windows. Datos 100% ficticios.

## Compatibilidad

| Severidad | Hallazgo | Resolución |
|---|---|---|
| BLOQUEANTE | Herramientas PG y guardas de tests ligadas a D:/binarios .exe | Resolución según plataforma, directorio aislado realpath y flag Linux explícito |
| BLOQUEANTE | Entry point protegido por argv no arrancaba bajo wrapper PM2 | server/start.mjs explícito, conservando npm start Windows |
| IMPORTANTE | Backend WEB dependía de filtros Node para multiempresa | RLS opt-in, roles separados y contexto por transacción; ver documento WEB de cobertura |
| IMPORTANTE | Pool idle emitía error no atendido al detener PG | Listener controlado y reconexión; ensayadas caídas separadas |
| IMPORTANTE | HTML WEB tenía onclick incompatible con CSP estricta | Registro cerrado y delegación, hashes de scripts; sin eval ni unsafe-inline JS |
| MENOR | Lanzadores .bat y rutas documentales Windows | No son runtime Linux; PM2/Node reemplazan el lanzador |
| IMPORTANTE | node:sqlite y node_modules nativos/plataforma | Node >=24, npm ci Linux desde locks; no copiar node_modules Windows |

Imports relativos comprobados con filesystem Linux sensible a mayúsculas. Archivos temporales bajo /lab o tests/.fase8; datos reales y claves no ingresaron en la imagen. Artefactos JSON/logs se guardan en staging/phase9/artifacts. Las 524 pruebas previas se ejecutan además en Linux.

## Rendimiento y alcance

Dataset PANEL: al menos 2.000 clientes, 2.000 snapshots de empresas, 10.000 pagos, 50.000 eventos y 5.000 comandos, predominantemente terminales. No equivale a 2.000 empresas provisionadas en WEB ni 5.000 comandos simultáneamente pendientes. WEB tiene dos pilotos reales de laboratorio.

Pruebas de lectura: 30 solicitudes por escenario, concurrencia 5. Login: 10 solicitudes; carga complementaria concurrente 2. p99 con muestras pequeñas es el máximo, no una predicción de capacidad productiva. Resultados exactos: FASE9_CARGA.json, FASE9_COMPLEMENTARIAS.json y RECURSOS_LINUX.json. Dashboard p95 aproximadamente 1,1 s en esta máquina; consultas/filtros mucho menores. Facade síncrona todavía serializa operaciones: fijar SLO y repetir mezcla real antes de dimensionar VPS; no justificar rediseño sin bloqueo.

Cgroup registra CPU acumulada y memoria que incluye caché. ps muestra promedio de proceso, PM2 una instantánea; no confundir con máximos sostenidos. Medidas no se tomaron durante la regresión completa.

## Seguridad y red futura

Internet -> Nginx 443 -> Node loopback -> PostgreSQL localhost/private. Nunca 5432 público ni Node directamente público. Propuesta UFW (documentación, NO aplicada): allow SSH 22 desde IP administrativa, allow 80/tcp y 443/tcp, deny 5432 externo, default deny incoming. Confirmar acceso SSH antes de activar firewall en una fase autorizada.

Cookies Panel Secure/HttpOnly/SameSite Strict. Nginx HTTP redirige a TLS; headers nosniff, no-referrer, frame DENY y CSP. HSTS pendiente de dominio/certificado productivo verificado. RLS SQL real A/B validado en núcleo; cobertura ERP total PARCIAL. El GUC de empresa confía en backend: no protege contra credenciales DB robadas o SQL arbitrario.

Rate limits: WEB login por cuenta+empresa+peer 30/15 min, interno 600/min; PANEL login controles existentes, recuperación 30/min; Nginx login 10r/s burst20 e interno 60r/s burst100. No confiar en X-Forwarded-For sin proxy validado. En contenedor todos llegan del loopback: un rate global debe dimensionarse al tráfico agregado y no confundirse con bloqueo por usuario.

## Workers y resiliencia

Sólo staging activa integración, conciliación y vencimientos; desarrollo y plantillas mantienen false. Ensayos: renovación/pago con mismo UUID, respuesta perdida, leases, reintentos/backoff, caídas WEB/Panel/DB separadas, PM2 crash/restart/reload/save/resurrect. WEB activa conserva operación con Panel detenido; suspendida/vencida bloquea localmente. Comando fallido se conserva y se recupera una sola vez. Health remota tiene caché 60 s: OFFLINE/ONLINE puede tardar ese intervalo; caída DB Panel puede impedir autenticar y dar 500/503 en vez de health JSON accesible.

Backup/restore y rollback: ver BACKUP_LINUX_PANEL.md. Logs sin canarios de password/session/JWT/URI. Rotación preparada, sin subir copias fuera del equipo. Reboot simulado del contenedor, no reinicio de Windows ni VPS.


## Estado de cierre local

FASE9 cerrada: motor recuperado con reinicio autorizado, restore globals sólo lectura y login clone final aprobados, imagen final fresca178 hashes coincidentes, tres contenedores FASE 9 detenidos sin puertos públicos ni reinicio automático. Regresiones 530 por plataforma y 85 escenarios de staging pasan. Producción NO aprobada yRLS global PARCIAL. Ver informe de 34 puntos RESULTADO_FASE9.md e inventario del PANEL.
