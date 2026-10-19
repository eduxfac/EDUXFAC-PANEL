# Setup reproducible de staging local

Abrir terminal en la fuente PANEL oficial de D:. Dockerfile Ubuntu y contexto curado están en staging/phase9. Preparar contexto con prepare-context.mjs (sólo código/fixtures, sin data, uploads, .env real, .pem, SQLite, node_modules, dumps ni archivos ZIP). Ejecutar localmente bajo autorización de FASE9:

    node staging/phase9/prepare-context.mjs
    docker build -t eduxfac-fase9-local:20261012 -f staging/phase9/Dockerfile staging/phase9/work

Crear UN contenedor con network none, sin -p, 2 CPU/3 GiB, hostnames internos panel.local y web.local ->127.0.0.1; montar sólo artifacts en /artifacts. F9_PRE_CODE_ONLY contiene únicamente cinco archivos server verificados del respaldo, no claves ni bases. F8 code-only conserva siete archivos necesarios para regresión anterior.

Antes de correr harness: flag de proceso EDUXFAC_F9_ISOLATED=yes; lib.mjs exige Linux y /.dockerenv. Bootstrap crea clusters ficticios /lab/fase9 y TLS de prueba, luego npm ci se realiza durante build. Nunca apuntar el harness a un entorno productivo.

Secuencia dentro del contenedor: bootstrap.mjs, validate.mjs, load.mjs, backup-restore.mjs, supplemental.mjs, smoke.mjs; todos bajo staging/phase9. Tests previos usan sus propias bases temporales. Reinicio: reboot-state.mjs prepare, docker stop/start del contenedor concreto, bootstrap, reboot-state.mjs verify. No reiniciar Docker Desktop/host.

No se exponen panel.local/web.local en navegador Windows. La demo anterior 127.0.0.1:4310 es independiente. Guardar logs y JSON. Los certificados de prueba expiran en dos días: renovar sólo laboratorio si se retoma. El contenedor conserva datos de prueba hasta eliminarlo expresamente; FASE9 termina detenido y workers apagados.

Versiones observadas y locks no constituyen pin de todo apt: registrar digest e imagen real en INVENTARIO_FASE9.json. Rebuild puede recibir parches apt nuevos; revalidar versiones.
