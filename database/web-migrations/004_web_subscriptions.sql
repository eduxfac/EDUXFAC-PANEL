-- Fase 5. Aplicación explícita, nunca automática sobre datos existentes.
ALTER TABLE web_empresas ADD COLUMN fecha_inicio_suscripcion TEXT;
CREATE TABLE web_subscriptions(
 id TEXT PRIMARY KEY,empresa_id TEXT NOT NULL UNIQUE REFERENCES web_empresas(id),plan_id TEXT NOT NULL REFERENCES web_planes(id),
 fecha_inicio TEXT,fecha_vencimiento TEXT,estado TEXT NOT NULL CHECK(estado IN('PENDIENTE','ACTIVA','VENCIDA','SUSPENDIDA','CANCELADA')),
 precio_asignado_centavos INTEGER NOT NULL CHECK(typeof(precio_asignado_centavos)='integer' AND precio_asignado_centavos>=0),
 moneda TEXT NOT NULL CHECK(moneda='PEN'),periodicidad TEXT NOT NULL CHECK(periodicidad='MENSUAL'),
 limite_sucursales_asignado INTEGER,limite_usuarios_asignado INTEGER NOT NULL,multisucursal INTEGER NOT NULL,
 renovacion_automatica INTEGER NOT NULL DEFAULT 0 CHECK(renovacion_automatica=0),observaciones TEXT NOT NULL DEFAULT '',
 version_web TEXT NOT NULL,version_condiciones TEXT NOT NULL,ultima_renovacion TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_subscription_commands(
 command_id TEXT PRIMARY KEY,empresa_id TEXT NOT NULL REFERENCES web_empresas(id),accion TEXT NOT NULL,
 payload_json TEXT NOT NULL,snapshot_json TEXT NOT NULL,anterior_json TEXT,
 resultado TEXT NOT NULL CHECK(resultado IN('SOLICITADO','PENDIENTE','APLICADO','ERROR')),error TEXT,
 retryable INTEGER NOT NULL DEFAULT 1,intentos INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX web_subscription_one_pending ON web_subscription_commands(empresa_id)
 WHERE resultado IN('SOLICITADO','PENDIENTE') OR(resultado='ERROR' AND retryable=1);
CREATE TABLE web_subscription_history(
 id INTEGER PRIMARY KEY,empresa_id TEXT NOT NULL REFERENCES web_empresas(id),suscripcion_id TEXT NOT NULL,evento TEXT NOT NULL,
 fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,estado_anterior TEXT,estado_nuevo TEXT,
 fecha_vencimiento_anterior TEXT,fecha_vencimiento_nueva TEXT,meses_renovados INTEGER NOT NULL DEFAULT 0,
 administrador TEXT NOT NULL,motivo TEXT NOT NULL,command_id TEXT NOT NULL,resultado TEXT NOT NULL,
 intervalo_vencido_inicio TEXT,intervalo_vencido_fin TEXT,financiero_json TEXT,
 UNIQUE(command_id,evento,resultado)
);
CREATE TABLE web_manual_payments(
 id TEXT PRIMARY KEY,command_id TEXT NOT NULL UNIQUE,empresa_id TEXT NOT NULL REFERENCES web_empresas(id),
 suscripcion_id TEXT NOT NULL REFERENCES web_subscriptions(id),
 importe_centavos INTEGER NOT NULL CHECK(typeof(importe_centavos)='integer' AND importe_centavos>0),
 moneda TEXT NOT NULL CHECK(moneda='PEN'),fecha TEXT NOT NULL,
 metodo TEXT NOT NULL CHECK(metodo IN('EFECTIVO','TRANSFERENCIA','YAPE','PLIN','OTRO')),
 referencia TEXT NOT NULL,observacion TEXT NOT NULL,administrador TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER web_subscription_history_no_update BEFORE UPDATE ON web_subscription_history BEGIN SELECT RAISE(ABORT,'Historial inmutable'); END;
CREATE TRIGGER web_subscription_history_no_delete BEFORE DELETE ON web_subscription_history BEGIN SELECT RAISE(ABORT,'Historial inmutable'); END;
CREATE TRIGGER web_manual_payments_no_update BEFORE UPDATE ON web_manual_payments BEGIN SELECT RAISE(ABORT,'Pago inmutable'); END;
CREATE TRIGGER web_manual_payments_no_delete BEFORE DELETE ON web_manual_payments BEGIN SELECT RAISE(ABORT,'Pago inmutable'); END;
