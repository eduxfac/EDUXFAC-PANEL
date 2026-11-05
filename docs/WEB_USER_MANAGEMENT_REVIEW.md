# EDUXFAC PANEL V2 — Revisión visual e integral local
Fecha: 5 de noviembre de 2026. Rama parche-italo, base 83ada3fabddd9107160cd4eb34ee9fd82e1addbf.

## Alcance
Solo datos sintéticos: SQLite y PostgreSQL WASM en memoria. Sin VPS, PostgreSQL persistente, clientes reales, RUC reales, SUNAT, push o deploy. No se aplicó el candidato SQL en WEB ni se modificó la copia D:\EDUXFAC_WEB_V2.
Se ejecutó npm run review:web-users y su variante --active. URLs de esta sesión:
- Pendiente: http://127.0.0.1:52584/#web-empresas/e5d80b3d-e32f-4208-8e24-67928c9786f1/usuarios
- Activa: http://127.0.0.1:52587/#web-empresas/9bfc812f-d34e-4de0-b2a4-d7ea6cffed01/usuarios
Los fixtures se cierran al terminar. Los datos y puertos cambian en cada ejecución.

## Resultado visual
Chrome real headless, viewports 1920x1080 y 1366x768, navegador con solicitudes externas bloqueadas. Se siguió Empresas WEB → enlace de empresa sintética → Usuarios.
- Página sin overflow horizontal: scrollWidth coincide con 1920 y 1366 respectivamente.
- Tabla legible, encabezados completos, sucursal/rol/estados visibles.
- Botones y pestañas alineados; ajuste únicamente en web-users.css, sin cambios globales de style.css.
- Modal centrado; contraseña en bloque separado. Capturas con output enmascarado, nunca con el valor generado.
- COMPANY_PENDING y SUBSCRIPTION_PENDING visibles como mensajes en español; el usuario no se oculta.
- Escenario activo muestra READY en el contrato y “Sin bloqueos de estado” en la UI.
- Texto largo se ajusta por palabras en 1366; acciones apiladas y accesibles.
- Revisión limitada a los dos tamaños solicitados; no certifica móvil ni lectores de pantalla.

Capturas (relativas a la raíz):
- staging/user-management-review/pending-1920.png
- staging/user-management-review/pending-1366.png
- staging/user-management-review/active-1366.png
- staging/user-management-review/password-modal-1366.png
Mediciones y checks: staging/user-management-review/visual-results.json.

## Defectos corregidos durante revisión
1. El listado principal lo renderiza admin-dashboard.js, no la vista legacy web-company-states.js. Se agregó ahí el enlace Usuarios que faltaba.
2. El runner sintético inicial no preparaba el esquema completo del dashboard. Ahora usa esquema de prueba completo y seedTestDatabase, restringido a NODE_ENV=test y SQLite :memory:. No es un endpoint ni se permite sobre archivo persistente.
3. Alineación de pestaña activa y botones, y separación visual de la contraseña del modal, mediante CSS específico de Usuarios.
4. Expectativa de manifiesto antiguo: el commit base ya contiene 12 migraciones Panel, no 9. Se actualizó el test de esa expectativa sin cambiar SQL.
Se conservó la corrección previa del mock de Facturación. No se cambió lógica SUNAT.

## Contraseña y auditoría
- Bcrypt coste 12 probado sobre datos sintéticos.
- Contraseña anterior no valida; temporal sí valida.
- Flag obligatorio true tras reset; usuario/empresa/suscripción/rol/sucursal no cambian.
- La contraseña temporal solo se devuelve en la respuesta del reset, no en listados.
- Copiar funciona en Chrome. El portapapeles se limpió al terminar la prueba.
- Cerrar, navegar y refrescar no vuelven a mostrar la clave.
- Sin contraseña en localStorage, sessionStorage, URL o consola del navegador.
- No se capturaron respuestas HTTP con secretos en archivos ni logs.
- La eliminación de referencias del DOM/JS no constituye garantía de borrado físico inmediato de memoria gestionada por el navegador.
- Auditoría PASSWORD_RESET: actor, empresa, usuario, fecha, request_id e IP. Sin contraseña, hash o token. Se prueba atomicidad con rollback ante fallo.
- AWR_LIST_USED=NO; AWR_COMPLETE_USED=NO; COMPANY_AUTH_VERSION_CHANGED=NO.

## Cambio obligatorio y sesiones
Prueba adicional en tests/web-user-forced-change.test.mjs:
Se ejecutó el handler de login y los módulos de autenticación/cambio obligatorio del candidato WEB sobre PGlite en memoria, con Express local. Esos snapshots V1 fueron archivados localmente en staging/commit-review/archive/tests/fixtures/web-user-auth/ al sustituirse por pruebas del checkout WEB real. No forman parte del commit; el estado vigente está en WEB_USER_MANAGEMENT_SECURITY_FIX.md.
1. Usuarios sintéticos A y B inician sesión.
2. Reset A incrementa solo password_version de A.
3. Token previo de A rechazado; B conserva acceso.
4. Login temporal de A genera sesión restringida; no accede a flujo normal.
5. Cambiar a una contraseña definitiva libera el flujo normal.
6. Los tokens antiguos de A no reviven después de quitar el flag; B sigue válido.
No es una prueba sobre WEB productivo, RLS productivo ni certificados reales. El adaptador y parche WEB siguen siendo necesarios.

## Regresión segura
Comando: node scripts/run-safe-local-tests.mjs
- TOTAL_TESTS=254
- PASS=251
- FAIL=0
- SKIPPED=3
El runner cuenta como omitido un placeholder por cada suite sin dependencias históricas:
- integration-operations.test.mjs
- postgres-panel-native.test.mjs
- web-subscriptions.test.mjs
Además se filtraron tres casos dependientes de recursos históricos, que no forman parte de ese total de ejecución:
- FASE11 manifest WEB incluye orden real y etapas embebidas.
- FASE11 manifest no cambia al repetir la consulta offline.
- Rollback de código FASE 7, por falta de VERIFICACION_FASE8.json del respaldo antiguo.
No se fabricaron resultados para esos suites/casos ni se cambiaron rutas para conectarlos a bases existentes.
La selección anterior de 92 pruebas está comprendida en la regresión disponible; se suman los nuevos casos de autenticación y las pruebas locales restantes.
Detalle: staging/user-management-review/regression-results.json.

## Adaptador WEB: inventario y clasificación
| Archivo | Cambio | Clasificación |
|---|---|---|
| integrations/web-user-management/service.mjs | Listado BEGIN READ ONLY/ROLLBACK y reset transaccional multitenant con bcrypt12 | SAFE_ADDITIVE como módulo nuevo; requiere revisar permisos de servicio al integrarlo |
| integrations/web-user-management/rate-limit.mjs | Límite por empresa/actor, en memoria | SAFE_ADDITIVE; en múltiples instancias requiere control compartido |
| integrations/web-user-management/session-version.mjs | Versionado individual de JWT | REQUIRES_REVIEW de todos los emisores/validadores |
| shared/web-user-diagnostics.mjs | Diagnóstico puro de estados | SAFE_ADDITIVE |
| integrations/web-user-management/schema.sql | Nueva columna y tabla/eventos con RLS | REQUIRES_REVIEW |
| integrations/web-user-management/web-integration.patch | Registro de endpoints y consultas/claims en auth, login y cambio inicial | REQUIRES_REVIEW |

Endpoints candidatos:
- GET /api/internal/admin/v1/empresas/:company/usuarios, scope usuarios:read.
- POST /api/internal/admin/v1/empresas/:company/usuarios/:user/reset-password, scope usuarios:reset.
El parche pasa git apply --check contra de7b515 en la copia local; NO se aplicó.

## SQL preparado, solo inspeccionado
- Columna nueva: usuarios.password_version integer NOT NULL DEFAULT 0, CHECK >=0.
- Tabla nueva: web_user_admin_events.
- PK request_id uuid: índice único implícito y protección de replay.
- FK empresa_id → empresas(id), usuario_id → usuarios(id).
- NOT NULL en identificadores, actor, acción y fecha; CHECK accion='PASSWORD_RESET'.
- IP inet; fecha timestamptz con DEFAULT now().
- ENABLE y FORCE ROW LEVEL SECURITY sobre la tabla nueva.
- No nuevas extensiones, funciones SQL, triggers, roles, grants, cambios de ownership o políticas en este archivo.
- No DROP, TRUNCATE, DELETE ni reescritura explícita de datos de negocio.
MIGRATION_ADDITIVE=YES estructuralmente. DESTRUCTIVE_SQL=NO.
Esto no prueba compatibilidad con una base real: requiere revisar columna preexistente, locks, permisos y esquema. IF NOT EXISTS de la columna no valida un tipo/constraint preexistente diferente.
Faltan políticas y grants del destino. Con FORCE RLS y sin políticas, el acceso de un rol ordinario falla cerrado.
ROLLBACK_AVAILABLE=PARTIAL: transacción antes de COMMIT; no existe down migration aprobada posterior.
No eliminar la columna/eventos después de uso sin un plan de conservación. Revertir el gate de sesión sin tratar los JWT antiguos puede reactivar sesiones: requiere plan específico, no rollback de código ciego.

## Decisión
READY_FOR_LOCAL_REVIEW=YES.
READY_FOR_WEB_INTEGRATION=NO todavía para un entorno con datos; candidato apto para revisión/integración sintética.
READY_FOR_PRODUCTION=NO.

Bloqueos:
1. Revisar y definir grants, RLS/policies y conservación de auditoría contra roles reales del destino.
2. Aprobar aplicación/reversión y validar el parche de sesiones en un WEB aislado con permisos no privilegiados.
3. Recuperar o sustituir correctamente los fixtures históricos omitidos antes de declarar regresión completa del sistema.

Siguiente paso: revisión del contrato, SQL/permisos y rollback en un entorno aislado. No desplegar, no aplicar migraciones ni modificar usuarios reales en esta fase.
