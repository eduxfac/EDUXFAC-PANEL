# Backup Linux PANEL/WEB separados

Ensayado pg_dump16/pg_restore16, formato custom SIN compresión (compress=0), sin ZIP, usuario backup sólo lectura, TLS verify-full/CA explícita. PANEL y WEB tienen artefactos y hashes SHA256 distintos. WEB usa --enable-row-security con política SELECT exclusiva para rol backup; no dar BYPASSRLS al runtime.

Restore a DB NUEVA de laboratorio con rol migrador; --no-owner --no-acl, reaplicar grants mínimos y políticas/roles correctos. WEB clone vacío incluye schema public por defecto: --clean --if-exists dentro del clon aislado evita duplicar schema public, NO ejecutarlo contra DB real. Backup fuente se toma con APIs/workers detenidos para un corte consistente.

Verificación: conteos, relaciones, historial, cola, login/dashboard Panel y login/bootstrap/RLS tenant WEB restaurado. No basta pg_restore --list. Clones no sustituyen bases actuales. Resultado y hashes: artifacts/BACKUP_RESTORE_LINUX.json. Dumps permanecen en /lab/tests ficticios; no contienen material real.

Retención futura sugerida: backup diario de cada DB, 14 diarios +8 semanales +12 mensuales; probar restore mensual y antes de deploy. Archivo local privado600/directorio700; destino externo fuera del host y cuenta sólo escritura/retención supervisada. Cifrado recomendado AEAD con clave aleatoria custodiada separada (KMS/cofre), TLS en tránsito; no commit ni clave junto al dump. FASE9 usó AES256-GCM y destino local external-simulation con CLAVE FIJA FICTICIA: no reutilizar en producción. Se descifró y comparó byte a byte; no hubo upload.

Rotación logs: tamaño10MiB/7 archivos, no comprimir automáticamente. PM2/Nginx/worker distintos. Política de ejemplo logrotate preparada; validar reopen o copytruncate (riesgo breve pérdida de líneas), ownership y schedule real después.

Disco: alertar80%, crítico90%, medir bytes también. Dataset PANEL ~30MiB y WEB ~11MiB; pg_dump PANEL ~10MiB, WEB ~0,3MiB. Catorce dumps equivalentes suman ~150MiB antes de crecimiento; estimación no incluye WAL, índices futuros ni uploads. Escenario 1000logs/min*500bytes ~0,72GB/día: limitar/rotar y reservar espacio. Uploads escalan con documentos/fotos, aplicar cuota y backup fuera de la imagen. Nunca probar llenando disco real; clasificación80/90 fue simulada.

Rollback probado: parar PM2, copiar código FASE8 del respaldo SHA previo a FASE9 (no confundir FASE8_PRE_POSTGRES que es código FASE7), apuntar a clon restaurado, iniciar, login/dashboard/health; ~1,5s de retorno código ya con clone listo. No mide tiempo total de restore de DB grande ni garantiza RTO productivo. Tráfico y escritores deben estar congelados antes del corte.
