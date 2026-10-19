# Estado vigente FASE12B — cierre aprobado

13/10/2026, America/Lima. **GO PARA CONTINUAR DEPLOY PILOTO.** app HTTPS→PILOTO3001, admin4310 y root WEB anterior3000 preservados. Integración/smoke/A-B HTTPS67/67; health ocho componentes OK; PM2 guardado/startup habilitado sin reiniciar WEB antiguo. Backups/restores conservados, no repetidos.460 controles operativos aprobados, cero fallos pendientes; F11 histórico1481/0 preservado con18 SHA idénticos sin regresión repetida. No cliente real; condiciones de primera alta pendientes. Ver [cierre FASE12B](FASE12B_RESOLUCION_BLOQUEANTES.md).

V2 confirmo transición:200 anterior, luego PILOTO a0,642s y1,245s. Incidente cerrado; no repetir comandos anteriores.

---

## Investigación y preparación anteriores conservadas

# FASE12B — V2 preparada y verificada para ejecución manual

## V2 revisada y copiada — 13/10/2026

Autorización del usuario: revisar, copiar exclusivamente V2 y validar checksum; ejecución sudo únicamente manual. Se corrigió la ruta chown del log para apuntar al archivo V2 recién creado y se normalizaron finales de línea LF. Hashes anteriores documentados no representan el archivo final transferido.

**SHA256 real local/remoto: 6d48615442e6e5ae7ce8caf6dc9b447e96656cd8ddccd087afcd661ffc5bcb86.** 12357 bytes, VPS0600 propietario eduxadmin. AST local/remoto aprobado;15/15 pruebas locales. Plantilla Nginx idéntica al candidato, SHA292a0bc8365d3d2e1fbdf9e03e1f84f83fee3945420bcd4b255baa6bf917f9db.

Solo se copió MANUAL_PREPARE_WEB_PILOT_ROUTE_V2.py. No ejecutado, sin sudo, reload ni cambios de configuración/base/certificados/PM2. El VPS conservaba rollback V1, app/root WEB3000 y los tres HTTPS200 antes de copiar; WEB PILOTO3001 sano. No backups o restores rehechos.

El script cambia las dos declaraciones server_name del vhost compartido para retirar únicamente el alias app y habilita el candidato de app hacia3001. eduxfac.com conserva proxy3000 y sus certificados/directivas; admin se conserva por hash. No hay conexión/escritura a eduxfac, comandos PostgreSQL o PM2; identidad del proceso antiguo se comprueba READ-ONLY. Los checks health son GET. Reutiliza los certificados; no los emite ni cambia. Rollback automático devuelve bytes originales y retira únicamente el nuevo enlace, conservándolo como evidencia; nginx -t antes de reload y espera del WEB anterior estable. Si el propio rollback falla, reporta DETENER y no afirma recuperación.

## Comando manual pendiente

En la terminal SSH del VPS:

```bash
sudo /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/MANUAL_PREPARE_WEB_PILOT_ROUTE_V2.py --apply
```

Esperado WEB_PILOT_ROUTE_V2_OK. Ante error/DETENER no repetir; conservar evidencia y verificar estado antes de cualquier cambio. No enviar contraseña sudo.

Después de confirmación exitosa: múltiples health HTTPS/data_modePILOTO, tres dominios200/ACL y rollback disponible; después integración HTTPS PANEL-WEB, smoke/A-B con fixtures existentes y health final, sin cliente real ni repeticiones innecesarias.

Evidencia: staging/phase12b/artifacts/WEB_ROUTE_V2_UPLOAD_VERIFIED.json y WEB_ROUTE_V2_LOCAL_TESTS.json.


---

## Investigación anterior conservada — estado previo a copia

# FASE12B — diagnóstico READ-ONLY de conmutación WEB fallida

13/10/2026, America/Lima. Intento manual13:28:11UTC /08:28:11Lima. **CONMUTACIÓN NO COMPLETADA; ROLLBACK CONFIRMADO.** No repetir el script V1. Esta investigación no cambió Nginx, certificados, PostgreSQL, PM2 ni archivos del VPS.

## Resultado verificado

|Elemento|Evidencia actual|
|---|---|
|app.eduxfac.com|HTTPS200, TLS1.3/cadena/hostname válidos; health sin data_mode, corresponde al WEB anterior3000.|
|eduxfac.com|HTTPS200 y TLS válido; WEB anterior preservado.|
|admin.eduxfac.com|HTTPS200, API mode PILOTO / ENTORNO PILOTO, certificado exclusivo admin intacto.|
|WEB PILOTO loopback|127.0.0.1:3001/api/health devuelve200, ok=true, database=true, data_mode=PILOTO. También con los headers exactos del proxy.|
|Upstream candidato|proxy_pass http://127.0.0.1:3001; configuración preservada pero NO habilitada.|
|Nginx activo|Servicio active/running, solo sitios eduxfac y eduxfac-admin-piloto habilitados.|
|Rollback|Journal ROLLED_BACK_STOP, nginx -t de rollback aprobado y reload retornó0. Enrutamiento comprobado después por HTTPS.|
|Vhost antiguo|SHA256770a7c8632f5c11e0b3ee8d98db42346f9c1948df753a36e14f672a3fa4b3c0f, idéntico al original/backup.|
|Vhost admin|SHA256e31f7c782ee5a9edf6d1affeb27f62fb9ca8e597add045b6c9fb42dc0eb02a00, idéntico al registrado antes del intento.|
|WEB antiguo PM2|eduxfac PID988, online, reinicios0.|
|PILOTOS PM2|Panel PID256054/reinicio1 histórico; WEB PID262183/reinicio0. Ambos online, sin cambios en esta investigación.|

Certificado app/root SHA DER5e97c8ff285589abd7c1a1b2d9da228e3fcdf717cd0fdc0a0edf3f9f54e9bcb9, vence03/01/2027 18:39:28UTC. Admin DERb198550a9b3c9510232f4dfb80ba44fa0947530ee7b778e70d33b1fe884dbee8, vence11/01/2027 12:13:01UTC. No emisión ni modificación en esta investigación.

## Causa demostrada y límite de la evidencia

El script emitió RuntimeError:HTTPS_APP_PILOTO_NOT_OK después de nginx -t y del comando reload exitosos. La respuesta llegó por TLS y pudo parsearse como JSON; al menos una condición falló: status200, ok, database o data_mode=PILOTO. El cuerpo/status concretos de esa respuesta NO fueron guardados por V1, por lo que no se puede afirmar retrospectivamente qué campo falló.

**Defecto de validación confirmado en el script que preparó Codex:** una sola consulta HTTPS inmediatamente después de systemctl reload, sin esperar activación de la nueva configuración. El ExecReload real usa nginx -s reload: envía la señal al master. No es una barrera que garantice que una conexión nueva ya usa la configuración candidata. La documentación [oficial de Nginx](https://nginx.org/en/docs/control.html) describe lectura/aplicación de configuración, apertura de nuevos workers y salida gradual de anteriores; [nginx -s](https://nginx.org/en/docs/switches.html) envía señales.

**Inferencia más probable:** se recibió transitoriamente el health del WEB antiguo, que no tiene data_mode. Concuerda con la ejecución inmediata, ambos backends sanos y headers equivalentes aprobados. No se etiqueta como causa exacta probada. Otras respuestas JSON inesperadas no se pueden excluir sin aquella respuesta; los logs privilegiados no son legibles por eduxadmin y no se solicitó/reintentó sudo. No se ha encontrado un fallo de certificado, base o health PILOTO actual.

El rollback sí se demostró independientemente del journal: hashes originales, enlace candidato retirado de sites-enabled, configuración actual y respuesta HTTPS identifican WEB3000. Se conserva el candidato en sites-available y el enlace fallido en operations remoto; ningún archivo se eliminó.

## Siguiente paso preparado, NO EJECUTADO

Archivo local: operations/phase12b/MANUAL_PREPARE_WEB_PILOT_ROUTE_V2.py.

SHA256 f7ee081c0f61c8c48483619ce26be83eb30bad36d418634e680cf1f926b3d726.

- Mantiene exactamente la plantilla Nginx candidata; no cambia certificados, DNS, firewall, PG o PM2.
- Exige el rollback V1 esperado, hashes intactos y candidato inactivo conservado; no repite preparación/backups.
- Tras reload espera hasta20 segundos, mediante conexiones TLS nuevas y dos respuestas consecutivas200/ok/database/PILOTO.
- Registra solo tiempo, status, flags y modo conocido; omite bodies completos y valores sensibles. Un fallo TLS detiene inmediatamente.
- Si no converge, restaura el enrutamiento y espera dos respuestas estables del WEB anterior antes de declarar rollback.
- Usa journal/logs V2 independientes; preserva V1 y se niega a sobrescribir evidencias por un reintento accidental.

**14/14 pruebas locales del helper, cero fallidas**, con secuencias simuladas en memoria, sin red, sin ejecutar main y sin alterar servicios/bases. Incluyen convergencia, falta de convergencia,502, transporte, TLS inválido, rollback, redacción y conservación de journal. La plantilla Nginx es idéntica a la que pasó sintaxis real en el intento V1; no se repitió nginx -t activo.

**No está subida al VPS. No ejecutar el comando V1 ni un comando V2 remoto todavía.** Primero revisar este diagnóstico; cualquier futura conmutación sigue requiriendo confirmación y ejecución sudo manual. Si se decide exigir evidencia histórica adicional antes de otro intento, preparar un extractor privilegiado READ-ONLY limitado al intervalo del incidente; esos logs podrían tampoco contener el cuerpo health perdido. No reconstruir una respuesta ausente ni usar otro reload para “demostrar” la causa histórica.

## Evidencias y recuento

- staging/phase12b/artifacts/WEB_ROUTE_INCIDENT_READONLY.json:9/9 controles READ-ONLY y journal original.
- staging/phase12b/artifacts/WEB_ROUTE_V2_LOCAL_TESTS.json:14/14 controles locales; subida/ejecución VPS=false.
- 371 comprobaciones previas aprobadas se conservan como históricas. No se suman indiscriminadamente controles repetidos; la conmutación actual está pendiente/fallida, no se declara GO final.
- La diferencia anterior de la venta permanece aclarada; ningún restore, migración o backup se repitió.
- Código aplicativo oficial y fuentes históricas C/PROPIO/TECNICO no tocados. Solo preparación/evidencias/documentación local D. Ninguna escritura en la base antigua eduxfac.
