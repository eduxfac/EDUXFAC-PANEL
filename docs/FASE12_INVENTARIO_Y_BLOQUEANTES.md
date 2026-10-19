# Estado vigente FASE12B — cierre aprobado

13/10/2026, America/Lima. **GO PARA CONTINUAR DEPLOY PILOTO.** app HTTPS→PILOTO3001, admin4310 y root WEB anterior3000 preservados. Integración/smoke/A-B HTTPS67/67; health ocho componentes OK; PM2 guardado/startup habilitado sin reiniciar WEB antiguo. Backups/restores conservados, no repetidos.460 controles operativos aprobados, cero fallos pendientes; F11 histórico1481/0 preservado con18 SHA idénticos sin regresión repetida. No cliente real; condiciones de primera alta pendientes. Ver [cierre FASE12B](FASE12B_RESOLUCION_BLOQUEANTES.md).

---

## Registro histórico anterior conservado

# FASE 12 — inventario parcial y detención antes de cambios

13/10/2026, America/Lima. **NO-GO PARA REGISTRAR PRIMER CLIENTE PILOTO. FASE12 detenida en inventario/comparación.**

Se retomó el PASO1 después de corregirse SSH. Acceso por clave a eduxadmin@85.239.248.248:22 confirmado con PasswordAuthentication=no en el cliente, sin contraseña. No se modificó la configuración SSH del servidor. No se repitió la fase ni los respaldos locales.

## Bloqueantes y diferencias importantes

| Hallazgo | Clasificación | Evidencia y efecto |
|---|---|---|
| Node activo 22.23.3; PANEL requiere >=24.0.0 | BLOQUEANTE | package.json oficial exige >=24; no se identificaron versiones NVM alternativas en el home inspeccionado. No desplegar PANEL con el runtime actual. Definir un runtime compatible preservando WEB antes de cambios. |
| sudo no interactivo no disponible para el inventario privilegiado | BLOQUEANTE DE ACCESO | sudo -n python3 - devolvió “a password is required”. No se solicitó contraseña. No se completó inventario administrativo de bases/roles, pg_hba ni reglas UFW. Esto no afirma que todos los comandos sudo estén prohibidos; hace falta un método administrativo autorizado para completar la fase. |
| WEB desplegado diferente de fuente oficial F11 | DIFERENCIA IMPORTANTE NO EXPLICADA | Cuatro hashes diferentes y siete archivos ausentes de once comparados. Integración PANEL-WEB no puede darse por disponible solo por mantener version 44.4.0. Revisar plan de compatibilidad/actualización de WEB antes de cualquier deploy o migración. |
| .env desplegado con permisos 0664 | BLOQUEANTE DE CUSTODIA | /var/www/eduxfac/.env legible por otros usuarios locales. Solo se guardaron ubicación/permisos y presencia de variables, nunca valores. No demuestra exposición HTTP, robo ni filtración; los permisos requieren corrección supervisada tras el backup previo. |
| admin.eduxfac.com resuelve al VPS pero HTTPS no valida | BLOQUEANTE PARA GO / PENDIENTE PREVISTO | SSLCertVerificationError. El vhost encontrado solo declara eduxfac.com y app.eduxfac.com; el certificado WEB válido incluye esos dos nombres, no admin. No se emitió ni cambió certificado. |
| PM2 instalado 7.0.4 frente a laboratorio 6.0.14 | DIFERENCIA IMPORTANTE POR REVISAR | WEB actual tiene proceso activo y startup habilitado. No se certificó compatibilidad del PANEL ni se cambió PM2. |

Se detuvieron todas las acciones de preparación que modifican el VPS. Las consultas adicionales solo completaron metadata accesible, DNS/TLS y hashes para documentar estas diferencias.

## Inventario obtenido

| Elemento | Resultado |
|---|---|
| Ubuntu / hostname | Ubuntu 24.04.5 LTS / vmi3635195 |
| Uptime | Aproximadamente 7 días y 10 horas, al inventario |
| CPU | 4 CPUs lógicas |
| RAM | 8.326.942.720 bytes, aproximadamente 7,76 GiB; disponible aproximadamente 7,15 GiB |
| Disco raíz | 102.888.095.744 bytes totales; 99.458.752.512 libres, aproximadamente 92,63 GiB; 4% usado |
| Particiones | / en ext4, /boot ext4, /boot/efi vfat; disco nominal 100G |
| Node / npm | 22.23.3 / 10.9.9 |
| PostgreSQL | Cliente instalado 16.15; servicio postgresql@16-main activo. Versión del servidor por SQL no consultada |
| Nginx | 1.24.0, activo y startup habilitado |
| PM2 | 7.0.4 instalado; pm2-eduxadmin.service activo y habilitado |
| UFW | 0.36.2 instalado, servicio habilitado; reglas/estado efectivo pendientes de consulta privilegiada |
| WEB | /var/www/eduxfac, package version 44.4.0 |
| PM2 WEB | Snapshot guardado: eduxfac, online, fork, autorestart, /usr/bin/npm. Procesos npm/node activos con cwd /var/www/eduxfac. No se ejecutó pm2 jlist para evitar iniciar un daemon ausente |
| Node WEB | Escucha 127.0.0.1:3000 |
| PostgreSQL red | Escuchas 127.0.0.1:5432 y [::1]:5432; no listener público PostgreSQL observado |
| Puertos públicos observados | SSH22, Nginx80/443; DNS local53. No escucha4310 identificada |
| Nginx sitio | /etc/nginx/sites-enabled/eduxfac → 127.0.0.1:3000; hosts eduxfac.com/app.eduxfac.com |
| Certificado WEB | Cadena/hostname válidos por TLS1.3; SAN eduxfac.com/app.eduxfac.com; vence 03/01/2027 18:39:28 UTC |
| DNS | app, admin y eduxfac.com resuelven a 85.239.248.248 desde el VPS |
| TLS admin | No valida; no se deshabilitó la validación |
| Certbot | Timer existente identificado; no se probó renovación ni se solicitó certificado |
| Timers / cron | Metadata de timers y horarios visibles conservada, sin publicar comandos ni secretos; no inventario completo de cron root |
| Backups existentes | No identificados en las rutas accesibles examinadas por el filtro EDUXFAC/backup. No acredita ausencia global; directorios privados no inventariados |
| Base PANEL / roles / empresas | No consultados ni creados. Inventario administrativo pendiente |

Ubuntu y Nginx coinciden con versiones de laboratorio, y el cliente PostgreSQL coincide con 16.15. Las versiones de laboratorio no eran un inventario previo del VPS. Los puertos internos observados coinciden con el diseño, pero esto no certifica las reglas UFW ni pg_hba.

## Comparación de fuente WEB por SHA256

D: fuente oficial EDUXFAC_WEB_ACTUAL. VPS: /var/www/eduxfac.

Diferentes: package.json, package-lock.json, server/src/app.js y server/src/db.js.

Ausentes: server/src/service-auth.js, server/src/admin-service-api.js, server/src/onboarding-api.js, server/src/subscription-api.js, server/src/operations-api.js, server/scripts/global-rls.js y server/start.mjs.

Hashes completos: staging/phase12/artifacts/COMPARACION_WEB_SHA256.json. Esta es una muestra crítica de once archivos, no una comparación exhaustiva de todo el árbol. No se infiere ausencia de RLS en la base por la ausencia del script: su estado SQL sigue sin verificar.

Variables DATABASE_URL y SESSION_SECRET existen como nombres en .env; no se validaron sus valores. WEB_AUTH_DATABASE_URL, WEB_SERVICE_DATABASE_URL y PANEL_WEB_SERVICE_SECRET no figuran en ese archivo. Variables eventualmente presentes en PM2/otro mecanismo no fueron descartadas: no se imprimió el entorno del proceso. JWT_SECRET no se consume por la fuente oficial actual.

## Estado de los treinta puntos del informe original

| N.º | Estado |
|---|---|
| 1 Inventario | PARCIAL READ-ONLY; límites de permisos indicados |
| 2 Diferencias | Documentadas; detener cambios |
| 3 Espacio/RAM/CPU | Obtenidos, sin presión evidente de disco |
| 4 Backup WEB | NO EJECUTADO; no se llegó al PASO3 |
| 5 Restore WEB | NO EJECUTADO |
| 6 Migraciones WEB | NO AUDITADAS; fuentes desplegadas divergentes |
| 7 Base PANEL | NO CREADA / inventario administrativo pendiente |
| 8 Roles DB | NO AUDITADOS NI MODIFICADOS |
| 9 Secretos | NO CONFIGURADOS en F12; existentes solo inventariados por presencia/permisos |
| 10 Migraciones PANEL | NO EJECUTADAS |
| 11 Migraciones WEB | NO EJECUTADAS |
| 12 Deploy PANEL | NO EJECUTADO |
| 13 PM2 | Metadata obtenida; sin restart/reload/save/startup |
| 14 Nginx | Metadata obtenida; sin nginx -t privilegiado, reload ni cambio |
| 15 DNS | A los tres nombres correcto desde VPS; sin modificación |
| 16 HTTPS | WEB válido; admin no valida; renovación pendiente |
| 17 Firewall | Pendiente reglas privilegiadas; sin cambios |
| 18 PostgreSQL exposición | Listener solo loopback observado; pg_hba pendiente |
| 19 PANEL-WEB | NO VALIDADA; módulos críticos ausentes en muestra |
| 20 Workers | NO ACTIVADOS; estado global efectivo no certificado |
| 21 Logs | NO AUDITADOS; no se imprimieron logs reales |
| 22 Backup PANEL | NO EJECUTADO |
| 23 Backup externo | PENDIENTE; destino no configurado/validado |
| 24 Health | No prueba funcional APP/DB/integración; TLS y listeners no la sustituyen |
| 25 Smoke PANEL | NO EJECUTADO |
| 26 Smoke WEB | NO EJECUTADO |
| 27 A/B | NO EJECUTADO EN VPS |
| 28 Rollback | Plan local F11 existente; backups reales/release/config previos aún pendientes |
| 29 Riesgos | Node incompatible, permisos administrativos, divergencia WEB, custodia .env, TLS admin, compatibilidad PM2 |
| 30 Resultado | NO-GO PARA REGISTRAR PRIMER CLIENTE PILOTO |

## Preservación y punto exacto de retoma

Las 1.481 comprobaciones F11 permanecen como baseline aprobada; no se reejecutaron aquí. Se verifica sin cambios el conjunto de 18 archivos críticos registrados al cierre F11. No se crearon respaldos locales nuevos porque no se modificó código existente.

Antes de retomar el PASO3 debe resolverse el acceso administrativo seguro y explicar/acordar el tratamiento de las diferencias importantes. No sustituir Node/PM2 globalmente ni la WEB activa a ciegas. Después del inventario completo y comparación, obtener backup real previo y restore controlado antes de cambios. Se necesitará una estrategia explícita para la versión WEB que soporta la integración, el runtime PANEL y la custodia de .env; TLS admin queda para su paso autorizado, sin alterar los certificados WEB válidos.

No se instaló software, creó base/rol/cliente, aplicó migración, ejecutó workers, creó ZIP, modificó DNS/certificados/Nginx/PM2/UFW/SSH/PostgreSQL ni cambió código en el VPS. No se utilizó código histórico C:, PROPIO ni TECNICO. No se imprimieron ni copiaron valores secretos. Únicamente se guardaron este diagnóstico y evidencias sanitizadas nuevas en el proyecto PANEL de D:.
