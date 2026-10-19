# PANEL EDUXFAC · Integración WEB Fase 2 · 2026-10-11

## Uso
EDUXFAC WEB tiene Empresas y Alta nueva separados de escritorio. Se selecciona cliente existente o se crea en clients; la empresa se guarda como borrador PENDIENTE. Guardar no transmite ni conserva contraseña. Completar alta confirma cliente administrativo, empresa, principal y administrador en WEB, sin activar. Activar valida la totalidad y espera confirmación de WEB.
El administrador WEB debe cambiar la contraseña temporal en su primer acceso; antes de hacerlo no puede ejecutar operaciones. El Panel no almacena contraseña, hash, token ni datos operativos WEB.

## Preparación y migraciones
No se aplicó ninguna migración a data/panel.sqlite ni se abrió esa base durante esta fase. No se migró el Panel a PostgreSQL.
Orden local: database/schema.sql -> database/migrations/001_licensing.sql -> database/web-migrations/001_web_onboarding.sql. La última añade identificación/documento a clients y web_empresas, con registro web_schema_migrations. No se carga al iniciar normalmente. Su aplicación debe ser explícita en una futura operación autorizada, después de validar una copia aislada y documentos duplicados.
Sin esquema local, la sección WEB informa ESQUEMA_WEB_PENDIENTE y las licencias continúan funcionando. Sin variables válidas, Completar guarda error de sincronización y no se conecta. .env.example contiene ejemplos falsos; el Panel no carga .env automáticamente. Las variables deben suministrarse al proceso cuando se autorice su configuración.

## Recuperación
Los UUID de comando y pasos confirmados se guardan en SQLite. No se vuelven a enviar pasos ya confirmados. Un timeout después de un commit remoto se resuelve reintentando el mismo paso con el mismo command_id. Puede reanudarse mediante un nuevo orquestador leyendo las confirmaciones persistidas.
Si el administrador quedó sin confirmar, reintroducir la misma contraseña temporal. Si la activación no recibió respuesta, el estado local queda sin confirmar y debe reintentarse; WEB podría haber aplicado el cambio. Nunca se presume éxito ante un error.
Cliente y datos de borrador guardado son estables durante el alta; no se implementó edición sincronizada de altas ya confirmadas en esta fase.

## API
Cliente servidor web-api-client.mjs: health, estado, suspender y reactivar de Fase 1; crearCliente, crearEmpresa, crearSucursalPrincipal, crearAdministradorInicial y activar de Fase 2. El secreto permanece solo en el backend. Cada operación tiene permisos de servicio específicos.
API local, protegida por sesión del administrador: GET/POST /api/web/clientes, GET/POST /api/web/empresas, POST /api/web/empresas/:id/completar y POST /api/web/empresas/:id/activar.
API WEB: POST /api/internal/admin/v1/clientes, /empresas, /empresas/:id/sucursal-principal, /empresas/:id/administrador-inicial y /empresas/:id/activar. JWT normales de clientes se rechazan.

## Archivos
Modificados: server/app.mjs, server/web-api-client.mjs, public/app.js, public/index.html, public/style.css, README.md.
Nuevos: server/web-onboarding-service.mjs, public/web-onboarding.js, database/web-migrations/001_web_onboarding.sql, tests/web-onboarding.test.mjs y este documento.
Respaldo: D:/EDUXFAC/PANEL EDUXFAC/03_RESPALDOS/FASE2_PRE_ALTA_20261011_1709.
Inventario WEB e informe detallado: D:/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL/docs/FASE2_ALTA_CLIENTES_EMPRESAS.md.

## Pruebas y límites
63 pruebas aprobadas, cero fallos: WEB 51 (incluidas las 31 originales intactas), PANEL 12 (incluidas autenticación y licenciamiento anteriores). SQL real del motor PostgreSQL WASM y SQLite exclusivamente en memoria; los tests anteriores usaron archivos SQLite temporales de D:. Temporales redirigidos a D:, sin uso de npm durante esta fase.
Prueba visual del Panel con alta ficticia: PENDIENTE -> pasos CONFIRMADOS -> ACTIVO/CONFIRMADO. Se corrigieron contraste y scroll del sidebar. Fixtures y pestaña cerradas.
Pendientes antes de publicación: carga/concurrencia PostgreSQL nativa, configuración autorizada de red y secretos, aplicación autorizada de migraciones, revisión de duplicados existentes y compatibilidad de reintentos de administrador durante rotación del secreto. No se configuró producción.
Fase 3: incorporar controles de suspensión/reactivación y conciliación de estados en el Panel según alcance autorizado. No hay planes, pagos, vencimientos automáticos, facturación, cuotas por plan, dashboard completo ni deploy.
No se tocaron fuentes de C:, VPS, PROPIO, TECNICO, SQLite/PEM reales ni licenciamiento de escritorio. No se crearon ZIP ni secretos reales.
