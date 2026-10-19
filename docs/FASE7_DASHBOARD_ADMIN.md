# FASE 7 — Dashboard, filtros, paginación y administración comercial

Fecha: 12 de octubre de 2026. Fuente única: D:\EDUXFAC\PANEL EDUXFAC\01_TRABAJO_ACTUAL\PANEL_EDUXFAC_ACTUAL.

Implementación local, sin despliegue y sin migraciones en bases reales. WEB no requirió cambios de código; solo se volvió a ejecutar su batería aislada. FASE 1–6 conservan sus rutas y contratos.

## Respaldo e integridad

Respaldo previo de siete archivos modificados: D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE7_PRE_DASHBOARD_20261012_0924.
VERIFICACION_RESPALDO.json contiene la verificación SHA256 y metadatos anteriores. Los siete respaldos coinciden con sus hashes originales. Los 14 archivos previos de pruebas y esquemas del Panel incluidos en la verificación permanecen idénticos.
data/panel.sqlite y data/license-private-test.pem mantienen tamaño y fecha de modificación originales. No se leyeron sus valores para las pruebas ni para la demo.

## Dashboard

Métricas consultadas en SQL, sin descargar todas las colecciones a JavaScript:
- clientes totales;
- empresas ACTIVO / PENDIENTE / SUSPENDIDO / VENCIDO / CANCELADO;
- suscripciones ACTIVA efectivamente vigentes;
- vencimientos acumulados en 7 / 15 / 30 días;
- pagos manuales registrados del mes y mes anterior;
- nuevas empresas del mes;
- sucursales y usuarios activos conocidos por los snapshots comerciales;
- comandos pendientes, errores de integración y empresas desincronizadas.

El estado efectivo calcula vencimiento por fecha cuando una empresa ACTIVO tiene suscripción ACTIVA expirada; conserva SUSPENDIDO y CANCELADO. Mostrar estado efectivo no modifica el estado registrado ni ejecuta el worker.

Sin esquema WEB completo, el dashboard muestra clientes y un aviso de métricas no disponibles; no reemplaza datos desconocidos por ceros.
Uso desconocido permanece NULL / Sin datos. Se informa cobertura de empresas con uso conocido y fecha del snapshot más antiguo. Los totales conocidos no son una consulta en vivo a WEB.
Health es el último registro local de FASE 6; abrir el dashboard no consulta WEB ni inicia workers.

## Comercial y fechas

Dinero almacenado/sumado en centavos enteros; presentación en soles. Los pagos registrados son la suma de web_manual_payments, usando su fecha comercial de pago, no la creación de la suscripción ni el estado activo.
Las fechas sin hora (YYYY-MM-DD) se conservan como días comerciales. Los timestamps se convierten a America/Lima para clasificar meses; no se aplica una conversión de timezone adicional a una fecha comercial sin hora.
Mes actual/anterior y las seis barras mensuales usan la zona America/Lima. SQLite utiliza el desplazamiento UTC−05:00 para esos cálculos; Lima no usa horario de verano en el alcance actual.

Por plan se muestran cantidad de empresas asignadas, precio de catálogo y previsión mensual.
Catálogo actual: BASICO S/59, PROFESIONAL S/99, EMPRESA S/129.
Ingreso esperado: suma del precio realmente asignado a empresas ACTIVO con suscripción ACTIVA vigente. Excepciones de precio se conservan. Empresas pendientes, suspendidas, canceladas o vencidas no se incluyen en esa previsión.
Una empresa activa no equivale a un pago confirmado. Previsión y dinero registrado permanecen separados.

## Gráficos

Cinco gráficos de barras con elementos meter nativos y etiquetas numéricas:
1. empresas por estado;
2. empresas por plan;
3. vencimientos acumulados;
4. ingresos registrados por mes;
5. altas nuevas por mes.

Sin dependencias de gráficos, CDN ni librerías pesadas. El estilo conserva la paleta y módulos existentes. Tarjetas, filtros y gráficos se adaptan al ancho disponible; las tablas conservan desplazamiento horizontal.

## API de lectura

Todas las rutas nuevas requieren la sesión de administrador existente y controles de Host. POST conserva la validación de Origin / JSON; estas rutas solo aceptan GET.
- /api/admin/dashboard
- /api/admin/clientes
- /api/admin/empresas
- /api/admin/suscripciones
- /api/admin/pagos
- /api/admin/historial
- /api/admin/recuperacion
- /api/admin/configuracion

Consultas sin modificaciones de negocio, sin conexiones a WEB y sin migraciones automáticas. Errores internos devuelven un mensaje genérico, sin SQL, credenciales ni mensajes del driver.

## Paginación y filtros

SQL COUNT + LIMIT + OFFSET, con ordenamiento permitido por lista cerrada y desempate por id.
Parámetros: page, page_size, search, sort y filtros individuales o JSON filters acotado.
Default: página 1, 20 registros. Tamaños permitidos: 20, 50, 100. Máximo de página: 100000. Se rechazan tamaños enormes, valores fraccionarios/negativos, parámetros desconocidos y sort arbitrario.
Respuesta: rows, total, page, page_size, total_pages, has_next, has_previous, generated_at, timezone.
Buscar trata % / _ como caracteres literales, sin permitir comodines involuntarios. Las comparaciones LIKE conservan las reglas de SQLite; no hay eliminación de tildes.

Clientes:
- nombre, razón social, RUC/DNI/documento, correo, teléfono;
- ACTIVO / INACTIVO;
- WEB / ESCRITORIO / AMBOS;
- nombre asc/desc y fecha reciente/antigua.

Empresas:
- cliente, razón social, nombre comercial, RUC, código;
- estado efectivo, plan, sincronización;
- próximas a vencer 7/15/30;
- con error;
- cuotas completas: al menos una cuota finita alcanzada (sucursales o usuarios), según el último uso confirmado.
- nombre, fecha de alta, vencimiento o plan.

Suscripciones:
- cliente/empresa, estado ACTIVA / POR_VENCER / VENCIDA / SUSPENDIDA / CANCELADA / PENDIENTE, plan, 7/15/30 días;
- precio, inicio, vencimiento, días restantes, última renovación y último pago;
- POR_VENCER usa siete días; las ventanas explícitas permiten 7/15/30;
- último pago es informativo y no cambia la suscripción.

Pagos:
- búsqueda por cliente/empresa/referencia;
- empresa por nombre parcial o identificador;
- plan registrado (o plan actual claramente indicado si no existe contexto histórico);
- método, desde/hasta;
- fecha reciente/antigua, importe descendente o empresa.
Métodos: EFECTIVO, TRANSFERENCIA, YAPE, PLIN, OTRO. No hay proveedor externo.

Historial:
- producto WEB / ESCRITORIO / PANEL;
- cliente/empresa por nombre o identificador;
- acción, resultado y administrador exactos;
- búsqueda y fechas comerciales Lima;
- reciente/antiguo/acción.
Combina SQL UNION de eventos administrativos existentes, licencias, estados WEB, condiciones, suscripciones, pagos y logs operativos. No carga todos los eventos en el navegador.
Los registros generales antiguos no siempre tienen cliente, actor o resultado estructurado; se muestran como No registrado / REGISTRADO sin inventar metadatos. Su detalle libre se resume para evitar exponer contenido potencialmente sensible. Los eventos estructurados conservan sus campos reales.

Las fichas de vigencia, plan/límites, conciliación y acciones siguen usando los componentes FASE 3–6. Alta nueva WEB y Planes conservan su pantalla anterior. Los nuevos módulos no descargan las colecciones antiguas de clientes/licencias/equipos al entrar. Las vistas heredadas de licencias/equipos mantienen sus contratos anteriores; su paginación específica queda para una fase posterior, no se alteró en FASE 7.

## Pagos: período y plan histórico

Pantalla Pagos ahora pertenece al producto, no es un alias exclusivo de la demo.
Muestra cliente, empresa, plan, importe, método, fecha, referencia, período cubierto, administrador y observación.

Nuevo esquema adicional: database/web-migrations/006_panel_dashboard.sql.
Crea web_payment_context y dos triggers de inmutabilidad. No modifica las migraciones anteriores.
Aplicación explícita mediante applyAdminDashboardMigrations(db), después de FASE 5–6, exclusivamente en una base autorizada. Esta función nunca se llama en el arranque normal del Panel ni sobre la base real durante esta fase.

Para nuevos pagos, si el contexto está preparado, se captura el plan y precio asignados en la misma transacción del pago.
El formulario existente permite periodo_inicio / periodo_fin opcionales, ambas fechas reales y ordenadas. Sin período explícito queda No registrado; no se deduce de las fechas de suscripción. Si se solicita período pero falta el esquema, la operación se rechaza sin registrar el pago.
Los pagos antiguos no se rellenan con un plan histórico supuesto ni un período inventado.
Reintentar el mismo command_id no duplica un pago; cambiar período en un replay se rechaza.
Registrar un pago no renueva ni reactiva una empresa.

## Recuperación y configuración

Recuperación administrativa:
- Disponible: lectura de solicitudes históricas y estado registrado.
- Pendiente: API y aprobación de recuperación administrativa.
- Bloqueado: emisión de claves / recuperación de contraseñas desde esta vista.
No se implementó una operación de recuperación peligrosa ni se ocultó el estado incompleto.

Configuración:
- nombre del Panel editable por la ruta existente;
- integración descrita sin URL/secretos;
- flags de workers;
- intervalos y máximo total de intentos;
- timezone y disponibilidad del esquema.
Información de workers de solo lectura; no se activan desde la pantalla. No se muestran secretos, claves ni tokens.

## UX y validación visual

Estados visuales: ACTIVO, PENDIENTE, SUSPENDIDO, VENCIDO, CANCELADO, SINCRONIZADO, ERROR y DESINCRONIZADO.
Carga con estado accesible, errores genéricos con Reintentar/Limpiar, sin resultados con explicación, fecha de datos/snapshots y estado de WEB.
Validación en navegador con la DEMO local:
- dashboard, todas las métricas y cinco gráficos;
- primera página de Clientes: veinte filas de 45;
- segunda página: veinte filas diferentes;
- búsqueda Santa Rosa: una coincidencia;
- búsqueda sin coincidencias: estado vacío;
- Pagos independiente y filtro YAPE: nueve registros;
- Historial WEB / PAGO_MANUAL / demo: 43 registros paginados;
- Recuperación muestra Disponible / Pendiente / Bloqueado y una solicitud histórica;
- Configuración muestra workers desactivados sin secretos.

Capturas:
- FASE7_DASHBOARD.png (completa);
- FASE7_DASHBOARD_VISTA.png (vista de navegador);
- FASE7_PAGOS.png.
Las capturas se generaron temporalmente en el directorio de artefactos de Codex y se guardaron en docs de D: con SHA256 coincidente. Ese directorio no se usó como fuente de código EDUXFAC.

## Pruebas

Batería final:
- WEB: 254 aprobadas / 0 fallidas.
- PANEL: 147 aprobadas / 0 fallidas.
- Total: 401 aprobadas / 0 fallidas.
- Previas: 324 conservadas y aprobadas.
- Nuevas FASE 7: 77 resultados aprobados.

Logs: PANEL/tests/FASE7_RESULTADO_COMPLETO_PANEL.log y WEB/tests/FASE7_RESULTADO_COMPLETO_WEB.log.
Se verificaron filtros, búsqueda, paginación, límites, estabilidad de orden, SQL arbitrario rechazado, métricas, frontera de mes Lima, desconocidos sin ceros inventados, pagos, período, replay, inmutabilidad, historial, errores, permisos, CSRF y CSP.
Pruebas nuevas: SQLite en memoria. Batería previa: datos ficticios y PostgreSQL nativo aislado en D:, preservando los harness anteriores. Al terminar no quedaron postmaster.pid en los clústeres aislados. La base real y la clave existentes no se abrieron para estas pruebas.

## DEMO disponible

http://127.0.0.1:4310
Usuario: demo
Clave: DemoEDUXFAC2026!

45 clientes y empresas ficticios, cinco ejemplos de escritorio y 43 pagos ficticios distribuidos en seis meses. Los cuatro ejemplos originales se conservan y se agrega el caso CANCELADO.
Base: demo/DEMO_FICTICIA_<UUID>.sqlite, creada nueva al iniciar. No es data/panel.sqlite.
WEB es un objeto simulado; global fetch saliente del proceso DEMO está deshabilitado. No se usan tokens ni secretos reales. Workers desactivados y escucha solo en 127.0.0.1.
El script DEMO mantiene su marcador interno de identidad anterior para que DETENER_DEMO.ps1 siga verificando el PID/ruta exactos. La interfaz y semilla reflejan FASE 7.
DETENER_DEMO.ps1 detiene exclusivamente ese proceso; no borra las bases ficticias ni otros servicios.
Cerrar el navegador no detiene el servidor.

## Pendientes, riesgos y FASE 8

Estado: Panel administrativo local funcional para pilotos aislados, con dashboard comercial y herramientas de consulta diaria. No es una declaración de preparación para producción.

Antes de operación real:
- autorización y procedimiento para preparar el esquema adicional con backup/restore;
- adopción de empresas existentes, metadatos antiguos y calidad de información;
- pruebas de carga/índices y del costo de UNION/OFFSET con grandes volúmenes;
- paginación de vistas heredadas de licencias/equipos y pantallas auxiliares FASE 6;
- alcance de roles y flujo seguro de recuperación administrativa;
- revisión de slots/concurrencia SQLite, y diseño PostgreSQL antes de una migración autorizada;
- HTTPS, restricciones de red, secretos reales autorizados, roles PostgreSQL limitados y RLS;
- pruebas backup/restore, retención/auditoría y recuperación operacional;
- validación visual amplia en los dispositivos/navegadores de adopción.

FASE 8 debe acordar su alcance: recuperación administrativa segura, permisos/roles, escalabilidad y preparación de adopción. No se inició FASE 8 ni se activó ningún worker real.

Confirmaciones: fuentes oficiales D:, sin fuentes históricas de C:, sin VPS/deploy/producción, sin PROPIO/TECNICO, sin ZIP, sin secretos reales ni migraciones en bases reales.

## Inventario

Archivos modificados PANEL (7):
- server/app.mjs
- server/web-subscriptions.mjs
- public/app.js
- public/index.html
- public/style.css
- public/web-subscriptions.js
- demo/INICIAR_DEMO.mjs

Archivos nuevos PANEL (9):
- server/admin-read-service.mjs
- database/web-migrations/006_panel_dashboard.sql
- public/admin-dashboard.js
- demo/seed-fase7.mjs
- tests/admin-dashboard.test.mjs
- docs/FASE7_DASHBOARD_ADMIN.md
- docs/FASE7_DASHBOARD.png
- docs/FASE7_DASHBOARD_VISTA.png
- docs/FASE7_PAGOS.png

WEB: sin archivos de código modificados. Logs, clústeres y SQLite ficticias son artefactos de prueba, no paquetes de deploy.
