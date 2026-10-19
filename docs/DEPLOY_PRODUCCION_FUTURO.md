# Deploy futuro: guía preparada, NO ejecutada

Esta guía no contiene direcciones ni credenciales reales y no concede autorización para VPS. Toda ejecución exige una fase posterior aprobada y checklist sin bloqueantes.

1. Inventariar versión/digest y config; definir ventana, congelar escritores/workers y mantener órdenes posteriores al corte. Guardar backup separado PANEL/WEB y claves bajo custodia, probar restore en clon y registrar SHA.
2. Preparar release inmutable bajo directorio privado Linux, fuentes oficiales D: revisadas; excluir data real/.env/node_modules Windows. Conservar release anterior.
3. npm ci por proyecto sobre locks en Linux con Node compatible; no editar lock en producción. Ejecutar estático/regresión en staging equivalente.
4. Aplicar migraciones con migrador mínimo después de revisar plan y snapshot; no usar runtime superusuario. Aprobar RLS tabla a tabla y configurar tres conexiones WEB tenant/auth/service TLS; separar backups. No ejecutar el instalador de RLS de laboratorio en producción.
5. Instalar env privado desde cofre; PM2 con usuario sin root y procesos separados. Arrancar workers false. Validar nginx -t antes de reload; cert real/domain/firewall sólo por operador autorizado. Node/5432 privados.
6. PM2 reload/start release, health con TLS verificado, revisar logs sin secretos. Ejecutar smoke en empresa ficticia de staging, no venta sobre clientes reales.
7. Pilotar permisos/login/suspensión/vencimiento/replay; reactivar workers gradualmente sólo tras autorización y monitoreo. Rotación/alarmas80/90 y backup externo efectivos.
8. Si health/smoke falla: detener escritores y PM2, capturar cola/UUID posteriores, seleccionar código+DB+config compatibles, restaurar en clone validado, cambiar destino, reiniciar workers false, verificar login/RLS/operación y conciliar. Nunca DOWN destructivo para forzar arranque; preservar ledger.

## Inventario de secretos futuro

| Secreto | Política mínima sugerida | Custodia/rotación |
|---|---|---|
| DB PANEL app/migrador/backup | 32 bytes aleatorios equivalentes | diferentes por rol, revocar viejo tras probar |
| DB WEB tenant/auth/internal/backup | 32 bytes aleatorios equivalentes | no compartir con PANEL; auth lectura global es privilegiada |
| WEB SESSION_SECRET / JWT | >=32 bytes aleatorios; código exige longitud>=32 | sesión/JWT usa SESSION_SECRET, JWT_SECRET no es alias efectivo |
| Servicio PANEL↔WEB | >=32 bytes aleatorios, issuer/audience fijados | secreto compartido específico, renovar coordinadamente/revocar tokens |
| Credenciales backup externo/cifrado | según cofre/KMS, clave AES256 aleatoria | separar clave y backup, prueba restore tras rotación |
| Panel sesión | sesión opaca almacenada en DB; no SESSION_SECRET env | TTL/revocación y cookie HTTPS según implementación |

Guardar fuera de Git, env600/directorio700 y propietario runtime; PM2dump/logs no públicos. No escribir valores reales en .env.example.staging. FASE9 NO generó secretos productivos; TLS y passwords del laboratorio son efímeros/ficticios.

Smoke preparado: staging/phase9/smoke.mjs, rechaza ejecución fuera de Docker aislado explícito. Futuro staging puede adaptar endpoints, pero no quitar guarda para correr contra producción. Venta sólo cuando se autoriza fixture ficticio.
