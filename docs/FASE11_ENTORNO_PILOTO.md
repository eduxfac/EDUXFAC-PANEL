# FASE 11 — entorno piloto preparado localmente

Cierre: 13 de octubre de 2026. Resultado: **GO PARA CONECTAR AL VPS Y PREPARAR PILOTO**, mediante una orden posterior. No es autorización de deploy, migraciones reales ni alta de clientes.

Fuentes oficiales: PANEL y WEB en D:\EDUXFAC, dentro de sus carpetas 01_TRABAJO_ACTUAL. No se utilizaron fuentes históricas de C:. PROPIO y TECNICO quedan fuera de la fase.

## Arquitectura futura

Internet → Nginx HTTPS → app.eduxfac.com (WEB, loopback:3000) y admin.eduxfac.com (PANEL, loopback:4310) → dos bases PostgreSQL independientes. PostgreSQL no debe exponerse públicamente en 5432. Los endpoints internos WEB requieren autenticación de servicio y acceso privado/loopback.

Solo se revisó documentación local existente. Versiones Ubuntu 24.04.5, Node 24.21, PostgreSQL 16.15, Nginx 1.24 y PM2 6.0.14 corresponden al laboratorio; **no acreditan versiones, capacidad ni configuración del VPS real**.

## Modos y separación

EDUXFAC_DATA_MODE admite DEMO, PILOTO y PRODUCCION; es la variable equivalente ya implementada. El marcador JSON de cada base debe coincidir con el modo de la aplicación. Cambiar la variable no convierte una base DEMO en PILOTO. PILOTO requiere bases propias, sin importar SQLite ni dumps DEMO.

El PANEL expone /api/environment sin secretos y muestra ENTORNO PILOTO antes del login cuando corresponde. La verificación guardada ejecutó la función real del frontend con HTML/CSS y la respuesta HTTPS del laboratorio: banner visible y tres etiquetas de entorno actualizadas. No se produjo una captura de navegador ni se abrió el Panel real para esta comprobación.

## Configuración y secretos

Las dos .env.example.pilot contienen únicamente placeholders. No son configuración ejecutable ni credenciales. NODE_ENV=production, modo PILOTO, PANEL PostgreSQL, WEB RLS global y PG TLS verify-full son obligatorios. Los workers empiezan desactivados.

| Secreto futuro | Regla de custodia |
|---|---|
| Contraseñas PostgreSQL | Diferentes por rol; generar al menos 32 bytes aleatorios y custodiar fuera del código |
| SESSION_SECRET WEB | Entropía suficiente, al menos 32 bytes aleatorios; distinto del secreto de servicio |
| PANEL_WEB_SERVICE_SECRET | Compartido únicamente por el par PANEL/WEB para ese protocolo; nunca reutilizar para sesiones |
| Clave/cuenta de backup externo | Separadas de roles runtime; almacenamiento y clave de cifrado bajo custodia independiente |
| Clave privada de licencias | Solo si se habilita ese módulo; nunca utilizar la PEM de pruebas |
| Contraseña temporal del cliente | Entrega privada una vez; persistir solo hash, exigir cambio al primer acceso |

El PANEL usa sesiones opacas con hash en base; no consume un SESSION_SECRET de WEB. JWT_SECRET no es una variable utilizada por el WEB actual: SESSION_SECRET firma sus JWT. No copiar claves de tests, certificados ficticios ni el contexto del laboratorio. Archivos de configuración privados 600, directorios 700; PM2 dump y respaldos también son sensibles.

## Roles previstos

Runtime mínimo: eduxfac_panel_app; eduxfac_web_app, eduxfac_web_auth y eduxfac_web_service. Migración: eduxfac_panel_migrator y eduxfac_web_migrator. Backup: eduxfac_backup, reservado al operador.

Todos sin SUPERUSER ni BYPASSRLS. Runtime no debe ser propietario ni migrador. El rol auth es necesario para login y cambio de contraseña con permisos propios. operations/pilot/roles.future.sql declara NOLOGIN y no incluye contraseñas; el DBA deberá completar credenciales y grants bajo autorización futura.

El laboratorio acredita 44 tablas FORCE RLS y cinco tablas globales protegidas por ACL, con pruebas SQL/HTTP A/B. No acredita todavía la configuración del VPS.

## Migraciones y dry runs

PANEL, orden real: 001_base.sql, 002_licencias.sql, 003_onboarding.sql, 004_estados.sql, 005_planes.sql, 006_suscripciones.sql, 007_operacion.sql, 008_roles_security.sql, en database/postgres-migrations.

WEB tiene 15 etapas identificadas:
1. database/schema.sql.
2. ensureReturnsSchema, 3. ensureAdvancedSettings y 4. ensureUserPermissions, implementadas en server/src/app.js.
5. upgrade_v44_4.sql.
6. upgrade_ticket_print_width.sql.
7. upgrade_branch_catalog.sql.
8. upgrade_count_unlotted.sql.
9. upgrade_product_identity.sql.
10–15. Las seis migraciones 001_empresa_acceso, 002_alta_clientes_empresas, 003_estados_empresa, 004_planes_limites, 005_suscripciones_vigencia y 006_operacion_workers.

Desde PANEL, node server/pilot-preflight.mjs panel o web produce el manifiesto **sin conectar**. Las funciones de inspección de base usan BEGIN READ ONLY y ROLLBACK. Detectan versiones desconocidas, conflictos y estructuras pendientes. Ocho hashes PANEL fueron comprobados. WEB conserva etapas históricas sin checksum registrado: su estructura está presente en el laboratorio, pero no equivale a acreditar el hash de SQL desplegado. Requieren revisión manual antes de adoptar una base real.

No aplicar todos los SQL históricos por nombre. La inicialización/migración WEB necesita un proceso dedicado, credencial migradora, sin servidor HTTP ni workers. El instalador RLS global sigue protegido para laboratorio: no quitar sus guardas ni ejecutarlo contra el VPS. El DBA deberá revisar el plan SQL PILOTO y su aplicación futura después del backup y del ensayo en clone.

La adopción readonly inventaría ID, RUC, código, estado, usuarios/sucursales, plan, suscripción y vigencia. Detecta SIN_PLAN, SIN_SUSCRIPCION, SIN_VENCIMIENTO, DUPLICADOS e INCONSISTENCIAS. El resultado sin incidencias corresponde a dos empresas ficticias; las empresas del VPS no han sido inspeccionadas.

## HTTPS, procesos y red

operations/pilot/nginx.conf es una propuesta completa; debe integrarse cuidadosamente con la configuración existente, no sustituirla a ciegas. Puertos públicos 80/443, redirección HTTP, TLS 1.2/1.3, cookies seguras y headers. Certificados y DNS reales pendientes.

La ACL de /api/internal/ permite loopback. La URL HTTPS de servicio deberá resolver el dominio WEB al loopback o a una ruta privada expresamente permitida, manteniendo SNI y validación del certificado. Una resolución pública a sí mismo puede producir 403; no deshabilitar la ACL ni la verificación TLS para resolverlo.

PM2: una instancia fork por aplicación; WEB inicia server/start.mjs y PANEL server/start.mjs. El cwd se resuelve físicamente para releases con symlink. El entry WEB evita el fallo detectado del inicio directo bajo el wrapper ESM de PM2. Ningún cambio adicional de código se hizo durante este cierre. PM2 startup/systemd del VPS queda pendiente.

Firewall futuro: SSH 22 solo desde IP administrativa aprobada; 80 y 443 públicos; 5432, 3000 y 4310 cerrados al exterior, también IPv6. Revisar reglas existentes y acceso de recuperación antes de cualquier modificación.

## Operación

Health WEB/PANEL, PostgreSQL, cola/errores/leases, CPU, RAM, disco y vencimientos: configurar observación local, sin servicios externos pagados. Disco 70% aviso, 80% advertencia y 90% crítico. No hay limpieza automática autorizada.

Workers inicialmente false y PM2 de una instancia. Habilitar expiración, integración y conciliación por etapas con autorización, conservando UUID, idempotencia y leases. No duplicar workers mediante cron, cluster o procesos adicionales.

Nginx propuesto limita login 5 solicitudes/s con burst 20 y endpoints internos 10/s con burst 30; no sustituye los límites de la aplicación. Logs sin payload, token, DSN ni query sensible. Rotación futura diaria, 14 archivos y umbral de 10 MiB según operations/pilot/logrotate.future.conf; no se activó ni ejecutó compresión.

Ver BACKUP_PILOTO.md, ROLLBACK_PILOTO.md, ALTA_PRIMER_CLIENTE.md y PILOT_GO_NO_GO.md. Para resultados y trazabilidad completa: RESULTADO_FASE11.md e INVENTARIO_FASE11.json.

## Secuencia de deploy futura — no ejecutada

1. Autorizar ventana y mantenimiento; confirmar inventario y condiciones GO del entorno real.
2. Realizar backup coherente de ambas bases/configuración, verificar hashes y disponer de restore probado.
3. Comprobar espacio, capacidad y acceso de recuperación; no limpiar automáticamente.
4. Preparar release de código oficial D, manifiesto y configuración privada; conservar release anterior compatible.
5. Reconstruir dependencias con npm ci del lockfile, bajo usuario dedicado y sin fuentes históricas C.
6. Aplicar únicamente migraciones aprobadas con rol dedicado tras dry-run y ensayo clone; verificar marcadores, roles, RLS y conteos.
7. Iniciar una instancia WEB y PANEL con workers false; revisar Nginx existente y ejecutar nginx -t antes del reload autorizado.
8. Validar HTTPS/health/roles/red/headers/entorno/logs sin secretos.
9. Ejecutar smoke y comprobar aislamiento, inventario y flujo de contraseña; confirmar rollback.
10. Habilitar primer cliente solamente mediante autorización específica, ficha aprobada y aceptación; workers después por etapas.

Si falla cualquier paso: detener avance y seguir ROLLBACK_PILOTO.md. No modificar componentes compartidos del VPS sin inventario previo.
