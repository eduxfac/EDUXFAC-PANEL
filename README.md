# EDUXFAC_PANEL_ADMIN

Panel privado local e independiente. Requiere Node.js 24 o superior; no requiere npm install, Docker ni PostgreSQL.

## Inicio

Ejecuta INICIAR_PANEL.bat y abre http://127.0.0.1:4310. En el primer acceso crea tu administrador con una contraseña de al menos 12 caracteres. No existen credenciales predeterminadas. Luego inicia sesión. Detén el servidor con Ctrl+C en su ventana.

## Alcance 0.1

Funcionan la creación inicial del administrador, inicio y cierre de sesión, Dashboard con conteos reales, historial de accesos y cambio del nombre del panel. Clientes, Licencias, Activaciones, Equipos autorizados y Recuperación de acceso tienen navegación, pantallas vacías y tablas base preparadas. Su gestión y las integraciones se desarrollarán posteriormente. No se generan licencias, activaciones ni códigos de recuperación. No hay datos ficticios.

## Aislamiento

El servidor escucha exclusivamente en 127.0.0.1:4310. Su única base es data/panel.sqlite, creada automáticamente junto al proyecto. No lee archivos ni variables DATABASE_URL de boticaweb_final, no usa sus dependencias y no accede a sus bases. Si el puerto está ocupado, falla sin detener otro proceso. No hay servicios instalados, tareas programadas ni despliegue público.

## Seguridad local

Contraseñas con scrypt y sal aleatoria. Sesiones aleatorias de 8 horas, guardadas como SHA-256 en SQLite y cookies HttpOnly/SameSite=Strict. Se verifican Host y Origin en el servidor. Diez fallos de acceso bloquean nuevos intentos hasta que salgan de la ventana de 15 minutos, persistente entre reinicios. No se registran contraseñas ni tokens en el historial. La configuración inicial queda cerrada después de crear al administrador. Realízala antes de permitir acceso al equipo a terceros. No existe recuperación del administrador del panel en esta versión.

HTTP y la cookie sin Secure corresponden únicamente a localhost. Esta versión no está preparada para publicación. Las futuras claves de firma de licencias deben gestionarse por separado; no se incluyen claves maestras.

## Estructura

- server/app.mjs: servidor HTTP local, autenticación y API.
- public/: interfaz responsive sin servicios externos.
- database/schema.sql: esquema inicial propio.
- data/panel.sqlite: datos persistentes (no versionar).
- tests/auth.test.mjs: pruebas con una base temporal independiente.

## Verificación

Ejecuta npm test. Las pruebas no usan la base real del panel ni la de EDUXFAC. Para respaldar el panel, detén su servidor y copia data/panel.sqlite a un lugar protegido. No reemplaces bases existentes sin aprobación.

## Próxima etapa

Conectar EDUXFAC Escritorio a la API de activaciones y desplegar el servicio por HTTPS. La firma local y la gestión administrativa ya están preparadas; no se debe distribuir ninguna clave privada.

## Licencias · Fase 1

El Panel administra clientes, licencias perpetuas e instalaciones. Cada licencia admite como máximo una instalación con estado `ACTIVA`; SQLite lo protege mediante un índice único parcial, además de las transacciones de la aplicación. Las instalaciones históricas se conservan como `REEMPLAZADA` o `BLOQUEADA`.

Las migraciones versionadas se encuentran en `database/migrations/` y se aplican una sola vez al iniciar el Panel. Antes de actualizar una instalación existente, respalda `data/panel.sqlite`.

Las rutas privadas del administrador requieren la sesión local del Panel: `/api/clients`, `/api/licenses` y `/api/installations`. Las rutas preparadas para las futuras aplicaciones de escritorio son: `POST /api/license/activation-request`, `GET /api/license/installations/:installationCode/status` y `POST /api/license/installations/:installationCode/validate`. En esta fase continúan limitadas a localhost.

`server/license-crypto.mjs` firma contratos con Ed25519. La clave privada se carga únicamente desde `EDUXFAC_LICENSE_PRIVATE_KEY_PEM` o `EDUXFAC_LICENSE_PRIVATE_KEY_PATH`; no se genera ni guarda una clave privada en el repositorio, el frontend ni la base SQLite. Las pruebas generan claves efímeras en memoria.

## Integración WEB · Fase 1

El cliente server/web-api-client.mjs conserva health, estado, suspender y reactivar, y añade las operaciones de alta de Fase 2. Se utiliza desde la sección EDUXFAC WEB únicamente por acciones explícitas; no hay conexión automática al arranque ni configuración real de producción. SQLite y el licenciamiento de escritorio se conservan.

Configura PANEL_WEB_SERVICE_BASE_URL y las tres variables de servicio descritas en .env.example mediante el entorno del proceso. El Panel actual no carga .env automáticamente. Los ejemplos falsos se rechazan fuera de las pruebas. El secreto nunca se reutiliza para sesiones ni para firma de licencias. HTTPS es obligatorio salvo loopback para pruebas.

Cada cambio requiere command_id UUID estable durante los reintentos y motivo. Conserva el resultado confirmado por WEB; no presentes una suspensión como aplicada cuando la llamada falla. La Fase 2 permite completar altas y confirmar cada paso. No existen planes, pagos ni sincronización automática en segundo plano.

## Alta WEB · Fase 2

Consulta docs/FASE2_ALTA_CLIENTES_EMPRESAS.md antes de habilitar la sección. La migración SQLite nueva está separada del cargador de licencias y requiere aplicación explícita posterior; no se ejecuta al iniciar. Guardar como pendiente no guarda contraseña. Completar confirma recursos remotos sin activar. Activar es una acción separada. Los errores conservan las confirmaciones e identificadores para reanudar el paso pendiente.

La validación de esta fase usó solo bases aisladas: 51 pruebas WEB y 12 PANEL aprobadas, sin fallos. No se ejecutaron migraciones sobre la base actual ni producción.
