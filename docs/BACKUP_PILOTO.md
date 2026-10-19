# Backup PILOTO — requisito antes de operar

La validación local existente pasó 22/22, sin repetirla en el cierre. Solo utilizó datos ficticios en PostgreSQL aislado.

| Backup de laboratorio | Bytes | SHA256 |
|---|---:|---|
| PANEL | 125033 | 2b8fda5751bdcbed812342608c8121e4ae184ab4249a710fecb6784d5383605a |
| WEB | 239686 | 9d912d6139f4a3180edbad61e44b832beb985416591c14e2e0b389b44b8a36f4 |

Corte: 2026-10-13T04:09:19.176Z. Evidencia: staging/phase11/artifacts/pilot-linux/FASE11_BACKUP_RESTORE_SMOKE.json. Copy externa AES-256-GCM fue **simulada localmente**, sin upload ni destino real.

## Procedimiento futuro obligatorio

1. Autorizar ventana, detener writers/workers y comprobar modo PILOTO en ambas bases. Registrar corte/UUID, release y versiones.
2. Dos pg_dump separados, formato custom y compresión 0, con rol backup de solo lectura y credenciales privadas. No ZIP. Preservar esquema, datos, secuencias, políticas y ledgers.
3. Registrar fecha, bytes, SHA256 y lista pg_restore para ambos. Guardar configuración/roles/marcador de forma protegida; pg_dump no acredita por sí solo el comentario de la base ni la provisión de roles.
4. Cifrar con clave externa a la copia; transferir a destino independiente aprobado. Verificar hash/cifrado, acceso y recuperación de clave. No declarar una carpeta en el mismo host como backup externo real.
5. Restaurar ambos en clones independientes con nombres y marcador correctos. Reaplicar grants y confirmar 44 FORCE RLS + cinco globals ACL. Nunca restaurar DEMO sobre PILOTO.
6. Comparar todos los conteos, FKs, ledgers, cola/UUID y secuencias; confirmar login, health, bandera PILOTO, stock y aislamiento A/B. No sustituir la base activa hasta aceptación.
7. Registrar responsable, duración, incidencias y resultado. Las claves, DSN y hashes de contraseña no se imprimen en evidencias públicas.

## Retención y objetivos propuestos

Diarios 7, semanales 4, mensuales 3; parametrizables. RTO objetivo 60 minutos y RPO objetivo 60 minutos. Para RPO 60 minutos hacen falta copias horarias verificadas (retener al menos 24) y monitoreo; con solo copias diarias, el RPO sería hasta 24 horas. No se configuró un calendario real ni se garantizan tiempos del VPS.

La política de borrado debe comenzar en dry-run y excluir copias no verificadas. No limpiar automáticamente datos, claves, licencias, .env ni backups por esta documentación.

Los respaldos originales de código FASE11_PRE_PILOTO_202610130314 ya existen en 03_RESPALDOS de PANEL y WEB. Se verifican sin rehacerlos.
