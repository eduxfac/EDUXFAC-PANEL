# Checklist alta piloto

PENDIENTE para cliente real; no marcar por éxito ficticio. Cada casilla requiere responsable/fecha/IDs/evidencia sin secretos. Precondiciones: GO entorno PILOTO limpio, autorización y restore previo.

1. [ ] Backup PANEL y WEB + SHA y restore previo a clones.
2. [ ] Cliente contratante según ficha validada.
3. [ ] Borrador empresa RUC/código únicos.
4. [ ] Plan/precio/límites/excepciones confirmados.
5. [ ] Suscripción con fechas Lima y vigencia aprobada.
6. [ ] Principal dirección/estado.
7. [ ] Administrador temporal cambio obligatorio.
8. [ ] Login empresa correcta y rechazo empresa ajena.
9. [ ] Cambio password y token temporal revocado.
10. [ ] Producto controlado de rama autorizada.
11. [ ] Compra/lote/proveedor propios.
12. [ ] Venta/comprobante/pago sin cobro externo.
13. [ ] Inventario/lote/stock/Kardex consistente.
14. [ ] Reporte empresa/rama/fecha sin otra botica.
15. [ ] Pago manual aprobado e idempotencia UUID.
16. [ ] Renovación fecha Lima y sincronización.
17. [ ] Suspensión auditada y bloqueo.
18. [ ] Reactivación auditada/re-login.
19. [ ] Backup final dos DB + código/roles/RLS/modo.
20. [ ] Restore final clones con login/relaciones/historial/cola/44FORCE/5ACL/smoke y RTO.

Cancelar ante fuga A/B, cola divergente, error RLS/ACL, falta restore o secreto expuesto. Consultar command_id, no duplicar cliente. Ejecución real requiere autorización posterior.

