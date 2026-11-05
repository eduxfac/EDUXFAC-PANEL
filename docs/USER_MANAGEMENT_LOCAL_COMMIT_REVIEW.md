# EDUXFAC USER MANAGEMENT — revisión final de commits locales

2026-11-05. Alcance: revisión y commits locales de WEB y Panel. Sin push, deploy, VPS, producción, usuarios reales o SUNAT.

## Bases y alcance

- WEB: `D:\EDUXFAC_WEB_V2`, branch `feature/panel-user-management`, base `de7b515552002fccb885360a565b407c089ae06f`.
- Panel: `D:\EDUXFAC_PANEL_V2`, nueva branch `feature/web-user-management`, base `83ada3fabddd9107160cd4eb34ee9fd82e1addbf`.

WEB contiene el adaptador, pools dedicados, middleware/rutas internas, versión de sesión por usuario, cambio obligatorio, clasificación global RLS, migración 014 y documentación de la integración local. Panel contiene pestaña Usuarios, navegación de empresa, diagnóstico, proxy autenticado/scoped, reset, CSS acotado, pruebas, paquete de integración, rollback y utilidades de laboratorio.

No se detectaron cambios funcionales ajenos después de la limpieza. Las dos correcciones pequeñas en pruebas preexistentes se incluyen como mantenimiento de la regresión: el manifiesto Panel verifica las 12 migraciones que ya existen en la base, y el fixture de contexto de empresa adapta el DOM simulado al formulario de series existente. No cambian código fiscal ni ejecutan llamadas SUNAT.

Dependencias revisadas: bcryptjs para el paquete de reset, y herramientas de pruebas PGlite/Express/jsonwebtoken/linkedom/playwright-core. El lockfile registra sus dependencias e integridades; no contiene credenciales de registro. No se instalaron paquetes durante esta revisión.

## Archivos accidentales retirados del conjunto

Se conservaron reversiblemente en `staging/commit-review/archive/`, ignorado por Git:

- scripts/integrate-user-adapter-code.mjs;
- scripts/finalize-user-local-integration.mjs;
- scripts/finalize-user-security-report.mjs;
- cuatro snapshots V1 de tests/fixtures/web-user-auth/ (auth.js, company-access.mjs, login-handler.js, password-change.js).

Los snapshots ya no eran importados por las pruebas actuales; los otros tres scripts dependían del estado anterior al commit y eran herramientas de una sola ejecución. Se actualizó el informe histórico que los referenciaba. No se borraron configuraciones, bases ni trabajo del usuario.

Se amplió `.gitignore` en ambos repositorios para logs, certificados, evidencia temporal y material de operación local. Panel añade también runtime/backups/secrets y dumps. Las configuraciones `.env*`, credenciales, SQLite, clústeres, backups, capturas y node_modules actuales permanecen fuera del índice. `.gitattributes` limita una excepción de blank-at-eol a los dos artefactos `.patch`: su línea de contexto vacía requiere un espacio por el formato unified diff, que no debe eliminarse.

## Revisión de seguridad

Se revisaron diffs y archivos nuevos, incluidos endpoints, autorización, scopes y contexto firmado, roles/pools separados, RLS, grants por columna, funciones SECURITY DEFINER y search_path, operación atómica, auditoría sin credenciales y revocación individual. No se cambió la semántica runtime validada en la fase anterior.

La 014 y su copia del paquete Panel son idénticas al artefacto aprobado. La revisión confirma adición de objetos/columna, ausencia de borrados de datos preexistentes, permisos mínimos del adaptador y controles de empresa/objetivo/actor/solicitud. Los DROP POLICY de reinstalación se limitan a políticas de este paquete; no se interpretan como borrado de negocio. El rollback operativo documentado conserva epochs, hashes vigentes y evidencia: no devuelve vida a sesiones revocadas.

**No se ejecutó la migración 014 en esta tarea.** Se reusó exclusivamente la base sintética ya instalada para un ensayo SQL con ROLLBACK de la actualización positiva. Se corrigió una prueba negativa para que cada variación use su propia solicitud válida; así actor/objetivo/contexto se evalúan sin quedar enmascarados por un request_id incorrecto previo. La comprobación correspondiente pasó en SQL sobre el esquema ya instalado.

El escaneo revisa tanto el worktree propuesto como el índice antes de cada commit: referencias DATABASE_URL/password/password_hash/PGPASSWORD/JWT_SECRET/SESSION_SECRET/CPE_WEB_SECRET/SOL/CERT_PASSWORD/PRIVATE KEY y dirección remota solicitada; detección de bloques de clave, tokens de proveedores y hashes literales; comparación interna con secretos locales generados, sin imprimir valores. Las referencias legítimas, placeholders vacíos y contraseñas explícitamente sintéticas se distinguen de credenciales reales. No se detectaron secretos reales en el conjunto versionado.

Los hooks locales activos y configuración de firma se comprobaron antes del commit; no se ejecutaron acciones de publicación. Las configuraciones privadas nunca se añadieron al índice.

## Pruebas finales de esta revisión

| Grupo | Total | PASS | FAIL | SKIPPED |
|---|---:|---:|---:|---:|
| Panel, runner `--without-migration-014` | 236 | 232 | 0 | 4 |
| WEB, siete suites sobre espejo del checkout integrado | 182 | 182 | 0 | 0 |
| SQL sobre laboratorio existente; función autorizada y negativos | 4 | 4 | 0 | 0 |
| Total final | **422** | **418** | **0** | **4** |

Tres SKIPPED son suites con helpers de checkouts históricos ausentes (integration-operations, postgres-panel-native, web-subscriptions). El cuarto es la suite nativa que instala 014: se omite por la prohibición explícita de ejecutar esa migración en esta fase. Esa omisión representa una suite, no un PASS ni la repetición de sus 25 pruebas anteriores.

EXCLUDED_HISTORICAL=3 casos fuera del total: dos manifiestos con rutas antiguas y rollback Fase7 con backup ausente. El E2E de navegador de la fase anterior permanece como evidencia histórica; no se vuelve a contar ni se restablece otra contraseña para inflar este total.

El SQL actual probó reset del propio objetivo seguido de ROLLBACK, bloqueo de otro tenant, otro usuario del mismo tenant, actor/solicitud alterados, auditoría falsificada y ausencia de contexto. La base conserva la contraseña definitiva. Los servicios del laboratorio se apagaron ordenadamente al terminar; no se dejó un worker activo.

Resultados de escaneo e inventario: staging/commit-review/worktree-secret-review.json y staged-secret-review.json. Resultados de regresión: staging/user-management-review/regression-results.json y staging/preintegration/web-candidate-regression-results.json. Son evidencias locales ignoradas; no contienen valores de credenciales.

## Criterio de commit

WEB_UNRELATED_CHANGES=NO; PANEL_UNRELATED_CHANGES=NO; REAL_SECRETS_FOUND=NO; IGNORED_FILES_OK=YES.

MIGRATION_014_ADDITIVE=YES; DESTRUCTIVE_SQL=NO_BUSINESS_DATA; RLS_OK=YES; CROSS_TENANT_BLOCKED=YES; ROLLBACK_DOCUMENTED=YES.

Solo se añaden al índice archivos revisados. Los commits se crean separados en las ramas indicadas, sin push. Después se verifican parent/base, nombres de archivos, ausencia de cambios pendientes y git log. Los identificadores definitivos se entregan en el informe del chat y en la evidencia local para evitar modificar el commit al insertar su propio hash en este documento.

READY_FOR_GITHUB_REVIEW=YES significa código preparado para revisión posterior; no autoriza subirlo. READY_FOR_PRODUCTION=NO. Las omisiones documentadas y la configuración de un destino real requieren validación independiente antes de cualquier despliegue.
