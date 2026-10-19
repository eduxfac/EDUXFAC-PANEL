# Adopción futura — actualización FASE 11

Documento preparado; **ninguna migración ni adopción real se ejecutó**. El objetivo inmediato autorizado fue cerrar laboratorio, no producción.

1. Obtener autorización de conexión/inventario; identificar versiones, recursos, servicios, puertos y bases existentes sin modificarlos.
2. Registrar release/configuración actual y dos backups coherentes verificables. Si existe PANEL SQLite legado, conservar copia consistente y claves separadas; no reemplazarla por DEMO.
3. Ejecutar inventario readonly: versiones/migraciones/estructura/hashes disponibles y empresas (ID, RUC, código, estado, usuarios, sucursales, plan, suscripción, vencimiento).
4. Resolver SIN_PLAN, SIN_SUSCRIPCION, SIN_VENCIMIENTO, duplicados, inconsistencias y versiones desconocidas bajo aprobación humana; no inventar vigencias ni borrar empresas.
5. Revisar etapas históricas WEB sin hash registrado. Probes presentes no equivalen a checksum desplegado. Ensayar las migraciones realmente pendientes en clone; no aplicar upgrades por nombre sin análisis.
6. Preparar bases PILOTO separadas, roles app/auth/service/migrator/backup y marcadores coherentes. No importar SQLite/dumps DEMO ni relabelar una DB.
7. Verificar 44 FORCE RLS, cinco globals ACL, transacciones/contexto, login y SQL/HTTP A/B con roles limitados. Un superusuario no demuestra aislamiento.
8. Configurar secretos privados, TLS verify-full, HTTPS, ruta interna privada, Origin, límites y firewall. Preservar acceso administrativo de recuperación.
9. Configurar backup externo cifrado, retención, restore real en clones y RTO/RPO medidos; acordar rollback compatible global.
10. Autorizar ventana y ejecutar deploy supervisado según FASE11_ENTORNO_PILOTO; validar health, smoke, capacidad y logs sin secretos.
11. Crear primer cliente únicamente con orden específica y ficha/plan/vigencia aprobados. Exigir cambio inicial, verificar integración/UUID y registrar aceptación.
12. Habilitar workers por etapas con leases/idempotencia y límites; no resetear contadores, borrar ledger ni crear UUID nuevos por timeout.

Conservar fechas UTC y visualización Lima, suspensiones/cancelaciones y referencias de pagos/contratos. Revisar sesiones migradas o restauradas y revocarlas según el corte; no reutilizar secretos ni credenciales DEMO.

FASE11 aporta validación local PostgreSQL, RLS global y rollback; deja atrás la advertencia histórica de RLS parcial de FASE9, pero no valida datos ni infraestructura del VPS. Ver PILOT_GO_NO_GO.md y BACKUP_PILOTO.md.
