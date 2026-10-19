# Adopción de empresas existentes — DRY RUN

server/adoption-dry-run.mjs no abre DB ni contacta WEB. Recibe un inventario revisado de empresas y devuelve propuesta sin aplicar nada. server/phase8-tools.mjs admite archivo JSON ficticio dentro del laboratorio marcado, guarda REPORTE_ADOPTION.json y nunca ejecuta SQL de adopción.

Campos de entrada: empresa_id UUID, ruc de11 dígitos, codigo, usuarios, sucursales, plan_codigo y suscripcion_id existentes si los hay; Las fechas autorizadas se pasan como opciones comunes al invocar adoptionDryRun(rows,{fecha_inicio,fecha_vencimiento}); la CLI básica deja fechas pendientes. No incluir contraseñas, tokens, secretos ni datos adicionales de personas.

Salida por empresa: empresa_id, RUC, código, usuarios, sucursales, plan propuesto, suscripción a crear o EXISTENTE_NO_RECREAR, fechas/estado y observaciones. Duplicados RUC/código, UUID o usos inválidos se bloquean. Plan automático: BASICO hasta1 sucursal/3 usuarios, PROFESIONAL hasta1/4, EMPRESA multisucursal/5–6; >6 requiere revisión de excepción. No bajar un contrato ya asignado ni inventar fechas.

Modo DRY_RUN, aplicado=false. Fechas ausentes quedan pendientes de confirmación; no se deduce deuda/pago ni se activan empresas. Durante el piloto se comparó la suscripción B antes/después y no cambió.

Antes del corte real:
1. Exportación autorizada y lectura aislada; no conectarse al VPS como parte de esta fase.
2. Verificar empresa_id/RUC/código, uso real (incluye administrador y sucursal principal), contrato/precio/excepciones y vínculo cliente PANEL.
3. Revisar propuesta individual con responsable, fechas, vigencia y estado.
4. Comparar recursos existentes para no crear doble empresa/cliente/suscripción.
5. Acordar ventana, backup consistente, ledger/UUID de comandos y rollback.
6. Ensayar en staging y obtener autorización específica para un importador real.

Esta fase entrega propuesta y comprobación local. No entrega un botón que adopte de forma masiva producción.
