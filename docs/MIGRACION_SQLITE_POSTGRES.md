# Migración controlada SQLite → PostgreSQL

No se abrió la SQLite actual como base de prueba. server/sqlite-postgres-migrator.mjs solo admite una copia marcada bajo tests/.fase8/<laboratorio> y un target panel_f8_*. Rechaza data/panel.sqlite y servidores/bases ajenos a las herramientas de laboratorio.

## Cadena real y orden

SQLite de partida: database/schema.sql; database/migrations/001_licensing.sql; database/web-migrations/001_web_onboarding.sql, 002_web_company_states.sql, 003_web_plans.sql, 004_web_subscriptions.sql, 005_web_operations.sql, 006_panel_dashboard.sql. Si se ensayan roles SQLite explícitos: database/security-migrations/001_roles.sql. El inicio normal no aplica esta nueva cadena a SQLite real.

PostgreSQL PANEL, por ledger y SHA256:
1. database/postgres-migrations/001_base.sql
2. 002_licencias.sql
3. 003_onboarding.sql
4. 004_estados.sql
5. 005_planes.sql
6. 006_suscripciones.sql
7. 007_operacion.sql
8. 008_roles_security.sql

WEB mantiene su propio esquema y cadena independiente:
database/schema.sql y database/migrations/001_empresa_acceso.sql, 002_alta_clientes_empresas.sql, 003_estados_empresa.sql, 004_planes_limites.sql, 005_suscripciones_vigencia.sql, 006_operacion_workers.sql.
Los upgrades del esquema base WEB los administra server/src/app.js mediante initializeDatabase({migrate:true}) / server/scripts/migrate.js. Inspeccionar estado/compatibilidad de una copia antes del corte. No confundir estos nombres con las migraciones PANEL.

## Herramienta local protegida

Desde PANEL D:, con NODE_ENV=test, PANEL_F8_ISOLATED=yes y PANEL_DATABASE_URL de una base localhost panel_f8_*:
npm run phase8:tool -- schema "<directorio laboratorio>"
npm run phase8:tool -- migrate "<directorio laboratorio>" "<copia.sqlite>"

El directorio debe estar bajo tests/.fase8 y contener SOLO_PRUEBAS.json con purpose FASE8_ISOLATED_PANEL. El esquema requiere rol eduxfac_migrator dedicado, no superusuario; los roles app y backup deben existir en la instancia de prueba. Nunca pegar una URL real en comandos/logs.

El migrador abre solo la copia en readOnly, comprueba PRAGMA foreign_key_check, tablas conocidas, IDs, relaciones, fechas/estados y filas. Importa en una única transacción; constraints deferred durante carga, immediate antes de volver a habilitar triggers; restaura secuencias identity y conserva command_id. Reporta antes/después y SHA256 de representación lógica por tabla. No usar SHA256 del archivo SQLite como equivalencia entre motores.

Resultado ficticio: 34 tablas / 47 filas equivalentes; todos los conteos y hashes iguales. Se comprueban FKs nativas. Una falla inducida durante DDL o después de clients revierte sin dejar migración parcial.

## Corte futuro (sin ejecutar)

Congelar API/escritores/workers; backup consistente de código/config y SQLite con WAL/SHM resueltos. Inventariar datos nuevos/esquemas fuera del contrato. Crear copia controlada, revisar permisos, migrar a staging, validar conteos/hash/FK, contratos y firmas sin exponer claves. Inhabilitar sesiones antiguas y nuevas copiadas antes de producción; verificar todos los roles y usuarios administrativos.

Cambiar PANEL_DB_ENGINE solo después de equivalencia/backup/restore/pilotos y autorización. No mantener dos escritores ni degradar permisos para facilitar el corte. Conservar SQLite/código anterior cifrados y restringidos. Ante fallo, detener servicio y restablecer un par coherente código+DB; no arrancar código antiguo sobre DB con roles nuevos como mecanismo de rollback.
