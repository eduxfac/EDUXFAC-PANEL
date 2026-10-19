# Seguridad previa a producción

## Implementado y comprobado localmente

- [x] PostgreSQL PANEL separado, roles runtime no SUPER/BYPASS/CREATE.
- [x] SQL parametrizado, timeout, transacciones/rollback/cierre y health autenticado.
- [x] RBAC backend por acción y rol vigente; solicitud no puede elevarse.
- [x] Scrypt/salt, no hashes ni contraseñas en listados.
- [x] Logout/expiración/revocación por rol/reset/desactivación.
- [x] Cambio obligatorio al crear/reset; último SUPERADMIN protegido.
- [x] Origin exacto + JSON en POST, HttpOnly/SameSite=Strict, Secure producción.
- [x] CSP, no-sniff, no-referrer, anti-frame, Permissions-Policy, HSTS condicional.
- [x] Intentos limitados, sin confiar X-Forwarded-For.
- [x] Auditoría inmutable; revisión de recuperación sin emisión de claves.
- [x] Backup/restore en laboratorio, manifiesto/hash/corrupción/retención dry-run.
- [x] Guard de herramientas impide SQLite real, DB real y host remoto.
- [x] A/B real SQL/HTTP en piloto con rol WEB limitado.
- [x] Política FORCE RLS ilustrativa comprobada solo en tabla ficticia.

## Pendiente antes de autorización VPS

- [ ] HTTPS y certificado real validados; activar HSTS posteriormente.
- [ ] PG TLS verify-full, CA y hostname de certificado validados en staging.
- [ ] DB/firewall no públicos, cuenta SO privada, roles reales separados y default privileges revisados.
- [ ] Nginx rate limit por IP: el peer loopback de proxy puede agrupar login failures.
- [ ] Secretos reales fuera de código, gestor/custodia, rotación y backups cifrados.
- [ ] Inventario/logs sin cuerpos/cookies/tokens/passwords; acceso y retención de auditoría.
- [ ] Revisión de dependencias/avisos seguridad con registro disponible; instalación offline local no equivale a auditoría CVE.
- [ ] RLS real WEB: políticas por tabla/ruta y contexto transaccional; probar login/servicio/admin y A/B. No hay ENABLE/FORCE RLS en el esquema oficial revisado.
- [ ] Validar capacidad de adaptador síncrono/global lock; presupuesto de latencia, concurrency, pool y rutas async.
- [ ] Revisar collation C, fechas TEXT y contratos bajo Linux/PG real.
- [ ] Copia SQLite consistente autorizada, equivalencia completa del inventario real, sesiones restauradas revocadas.
- [ ] Usuarios iniciales reales preparados por procedimiento offline autorizado; no setup público ni cuentas DEMO.
- [ ] Confirmar RPO/RTO, cifrado y backup externo separado PANEL/WEB; restore de código/config/DB.
- [ ] Adoptar empresas tras revisión DRY RUN; no activación masiva automática.
- [ ] Reinstalación final de recuperación: conservar flujo firmado y vínculo equipo, no backdoors.
- [ ] Autorización nueva para VPS, despliegue, tareas y habilitación gradual de workers.

## Estado

FASE 8 queda validada como preparación local, no como certificación de producción. No se abrió un puerto público ni se ejecutó infraestructura real.
