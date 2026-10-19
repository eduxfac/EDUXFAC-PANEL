# Alta del primer cliente — procedimiento futuro

No se registró cliente real. Ejecutar únicamente después de las puertas de PILOT_GO_NO_GO y de autorización específica para el alta.

## Ficha aprobada

Contratante: nombres/razón social, DNI/RUC validado, teléfono, email opcional. Contacto responsable y observaciones en ficha privada: el DTO actual no ofrece dos campos independientes para ellos. No confundir con los clientes comerciales de la botica.

Empresa: razón social/comercial, RUC de 11 dígitos, código único normalizado, plan BASICO/PROFESIONAL/EMPRESA, precio PEN aprobado (catálogo 59/99/129), límites reales, inicio/vencimiento inequívocos y estado. Mostrar fechas en Lima, persistir UTC; confirmar excepciones y cupos.

Sucursal principal: nombre, dirección y estado. El alta crea la principal; completar dirección por la administración de sucursales soportada antes de operar. Administrador: identidad y usuario/email; contraseña temporal entregada por canal privado autorizado, no en logs ni en ficha.

## Secuencia

1. Verificar PILOTO en UI y en ambas bases, migraciones/roles/RLS y backup restaurable PANEL/WEB.
2. Crear el contratante; revisar coincidencias antes de duplicarlo.
3. Crear borrador empresa + plan + suscripción con vigencia aprobada.
4. Completar principal y administrador; generar credencial temporal solo en esa fase autorizada.
5. Activar mediante command_id UUID e integración; esperar confirmación y revisar sincronización.
6. Ante timeout, consultar el mismo UUID y reanudar. No crear otra empresa, pago u orden para compensar a ciegas.
7. Entregar URL HTTPS y credencial privadamente. WEB conserva hash bcrypt; PANEL utiliza hash scrypt para sus administradores. Exigir cambio inicial y verificar invalidación del token temporal.
8. Ejecutar SMOKE_TEST_PRIMER_CLIENTE de WEB y controles A/B bajo alcance aprobado.
9. Registrar aceptación y respaldo posterior coherente. Habilitar workers solo por orden y bajo observación.

No almacenar contraseña temporal en respuestas posteriores, historial o reintentos. Pagos manuales, estados y precios requieren registro autorizado; esta fase no realiza cobros, emails ni mensajes. Una empresa de control B debe ser ficticia y aislada dentro del ensayo autorizado, sin importar datasets DEMO.
