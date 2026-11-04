# Publicación de parche-italo

Publicar el código no actualiza el servidor ni aplica migraciones.
Antes de desplegar, revisar EDUXFAC-WEB/docs/ESTADO_DESPLIEGUE_20261104.md:
el motor fiscal WEB F15 del VPS difiere de la integración PHP de esta rama.
Ensayar las migraciones sobre una restauración aislada y conservar los roles,
RLS, datos, archivos privados y claves del servidor.

PeruDevs se administra globalmente en Planes WEB. El token se guarda cifrado
en settings; PERUDEVS_ENCRYPTION_KEY se configura solo en el servidor y debe
respaldarse. Comparar las migraciones PostgreSQL 010 y 011 con el ledger real
antes de aplicarlas. No sustituir .env ni importar datos locales en producción.
