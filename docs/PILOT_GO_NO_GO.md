# GO / NO-GO — cierre FASE 11

**GO PARA CONECTAR AL VPS Y PREPARAR PILOTO.** Se requiere una orden posterior para efectuar esa conexión. FASE 11 no se conectó al VPS y no autoriza despliegue ni primer cliente real.

| Puerta local | Resultado |
|---|---|
| Regresión Linux PANEL / WEB | 305/305 y 266/266, cero fallos |
| 44 FORCE RLS / cinco globals ACL / roles / A-B | Aprobado en laboratorio |
| DEMO y PILOTO separados / modo de ambas DB | Aprobado |
| Indicador ENTORNO PILOTO | Aprobado por frontend real + HTML/CSS + HTTPS local |
| Migraciones y adopción readonly | Aprobado local; legacy WEB sin checksum exige revisión manual |
| PM2 / Nginx / TLS / secreto canario / workers off | Aprobado local con recursos ficticios |
| Backup/restore de ambas DB / compra / venta / stock / rollback | 22/22 |
| Regresión histórica | 1.398 conservadas; trazabilidad detallada en RESULTADO_FASE11.md |
| Bloqueantes locales para inspección futura del VPS | Ninguno identificado |

## Puertas pendientes para deploy y alta real

1. Autorizar el acceso y relevar versiones, recursos, servicios, puertos, reglas y configuración existentes del VPS; no sustituir componentes existentes sin revisión.
2. Inventariar readonly esquema y empresas reales. Resolver cualquier SIN_PLAN, SIN_SUSCRIPCION, SIN_VENCIMIENTO, duplicado, conflicto/versión desconocida y etapas WEB sin checksum histórico.
3. Preparar bases PILOTO independientes, roles mínimos, marcador PILOTO y migraciones revisadas/ensayadas; preservar la base actual.
4. Generar/custodiar credenciales reales y configurar PG TLS verify-full. Ningún secreto de laboratorio es válido.
5. Validar DNS/TLS app/admin, ruta privada del servicio, firewall IPv4/IPv6, PM2 startup y acceso de recuperación.
6. Configurar destino externo cifrado y custodia de claves; ejecutar backup/restore real aislado de ambas bases, con hashes, retención, monitoreo y RTO/RPO medidos. La prueba externa local fue simulada.
7. Aprobar ventana y rollback; verificar health, capacidad y alertas allí. Mantener workers apagados hasta habilitación supervisada.
8. Autorizar expresamente primer cliente, ficha/plan/precio/vigencia y smoke de aceptación. No copiar DEMO, registrar clientes ni generar credenciales reales por este documento.

**NO-GO PARA DEPLOY O CLIENTE REAL hasta completar esas puertas.** No hay un fallo local abierto que impida solicitar una conexión de diagnóstico; lo pendiente requiere conocer el entorno real.
