# PANEL PILOTO — cierre del bucle visual de cambio de contraseña

13/10/2026, America/Lima. **CORREGIDO en PANEL PILOTO.** Sin restablecer otra vez la contraseña de eduxadmin ni modificar otros usuarios.

## Causa confirmada

El endpoint /api/admin/profile/password funcionaba: pone must_change_password=0, incrementa auth_version, invalida/elimina sesiones anteriores y devuelve relogin=true con cookie expirada. El nuevo login crea la sesión actual y refleja el estado correcto.

El frontend public/admin-users.js llamaba location.reload() tras el cambio. Esto conserva el fragmento #admin-profile. Al volver a iniciar sesión, public/app.js carga correctamente la identidad nueva, pero renderiza la ruta que quedó seleccionada: vuelve al formulario de contraseña en vez del Dashboard. La prueba del frontend real junto con backend HTTP aislado reprodujo esa ruta persistente: esperaba #dashboard y obtuvo #admin-profile.

Es un defecto del retorno visual, **no un flag de base que se vuelva a activar**. No hay JWT del Panel: utiliza cookie opaca y sesiones PostgreSQL. Las API tienen Cache-Control:no-store y no se detectó localStorage/sessionStorage como causa.

## Diagnóstico inicial corregido

La primera hipótesis usó un cliente pg directo, que devuelve BIGINT como texto y demostraba Boolean("0")=true. Sin embargo el adaptador REAL del Panel registra parser20 y devuelve números. La lectura con PostgresPanelDatabase confirmó flag0 numérico; el código original ya produce false.

Se retiró por ello la modificación exploratoria de server/admin-auth.mjs, restaurando exactamente su SHA original614b3b6c75d7daae969ada4f702becf5d4fd43eeb11509a59330622d5dd1955d. La prueba artificial de flags se reemplazó por la reproducción del flujo real. AUTH_FLAG_FIX_DEPLOY.json conserva ese intento histórico y no describe el parche final.

## Estado y versiones reales

Consulta READ-ONLY antes de corregir: eduxadmin SUPERADMIN, enabled1, must_change_password0, auth_version5; una sesión vigente de versión5. Auditoría:
- RESET_ADMINISTRATIVO:13/10/2026 14:26:14UTC /09:26:14Lima.
- PASSWORD_CAMBIADO:14:28:50,14:29:50,14:31:06UTC.
- Nuevos INICIO_SESION entre esos cambios; último14:31:25UTC.

El reset autorizado incrementó1→2 y los tres cambios posteriores explican2→3→4→5. Las versiones históricas intermedias no se guardan en cada evento; esta secuencia se reconstruye del procedimiento y los tres eventos, no de lectura de tokens/hash antiguos.

Consulta final usando el adaptador EXACTO del proceso:
- Usuario eduxadmin, SUPERADMIN, activo sí.
- Cambio obligatorio false/0; auth_version5, updated_at14:31:06UTC sin cambio por la corrección.
- Una sesión vigente,22 permisos, autorización de overview/clientes OK.
- f12b_smoke_ficticio conserva disabled0/must_change0/auth_version6 y timestamps originales.

No se le solicitó otra contraseña a eduxadmin. No se realizó login automatizado con su cuenta, no se leyó su hash ni se recuperaron cookies/tokens. Verificación READ-ONLY de identidad/autorización con su fila real y sesión agregada. El usuario confirmó explícitamente “Abre el Dashboard normalmente” al abrir /#dashboard; no se tuvo acceso a su pestaña real por la herramienta de navegador.

## Cambio final

Solo dos archivos de producto:
- public/app.js: callback de cambio confirmado descarta identidad/datos en memoria, cancela renders pendientes, limpia entradas de acceso, vuelve a #dashboard y muestra nuevo login con mensaje explícito.
- public/admin-users.js: tras éxito limpia el formulario y llama al callback; ya no recarga conservando la ruta del perfil.

El siguiente login carga la identidad nueva y abre Dashboard. Una visita deliberada a “Tu cuenta” sigue permitiendo un cambio voluntario; no es una obligación recurrente.

Checksum deploy:
- public/app.js:84f3258fa4471e68f8797567d0738d3e9c5e8eab43b6925d1c97e113ee385024.
- public/admin-users.js:727922141b155692e19db49634fa92507772253cd6531275586f6f17dcec632d.

## Prueba automatizada y validación

tests/admin-password-flow.test.mjs ejecuta los scripts reales public/app.js/admin-users.js en un contexto DOM controlado y conecta con createPanel HTTP y SQLite :memory:. Ninguna cuenta/base real ni secreto real. Comprueba:

1. Login temporal y formulario obligatorio.
2. Cambio correcto; cookie anterior revocada.
3. Estado anterior401, nuevo acceso visible.
4. Nuevo login, identidad must_change_password=false y overview200.
5. Ruta #dashboard, título Dashboard y ausencia del formulario/aviso obligatorio.
6. Cero location.reload después del cambio.

La prueba falló antes en #admin-profile y pasa después. Suite con roles-security: **46/46 local Windows y46/46 Linux VPS**, cero fallos. Son las mismas pruebas en dos entornos, no92 pruebas únicas. Incidencias del DOM/entorno de test se corrigieron antes de obtener la reproducción relevante.

Assets verificados mediante HTTPS: ambos200 y bytes iguales a los desplegados. Admin/app/rootHTTPS200. Solo Panel reiniciado; WEB antiguo PID988 sin reinicios. No Nginx, certificados, roles, migraciones, configuración ni otros proyectos modificados.

## Evidencias y alcance

staging/phase12b/artifacts/PASSWORD_FLOW_FIX_FINAL.json contiene diagnóstico inicial, estado final y confirmación visual del usuario; PASSWORD_FLOW_FIX_DEPLOY.json contiene despliegue/regresión. Material anterior para revertir código conservado en home/operations. No backup/restore completo reejecutado.

Este ajuste posterior a FASE12B modifica deliberadamente dos archivos frontend ante un fallo real. Las1481 comprobaciones/460 controles anteriores permanecen históricos, no se afirma que sus hashes frontend anteriores sigan iguales ni que se haya repetido toda la regresión.

**No contraseñas, hashes de contraseña, DSN ni sesiones privadas en este informe. No restablecimiento adicional, no modificación de eduxadmin/f12b u otros usuarios por el agente durante esta corrección.**
