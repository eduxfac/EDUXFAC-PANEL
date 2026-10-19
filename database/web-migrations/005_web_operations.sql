-- Fase 6: cola y control operativo. Aplicación explícita tras Fase 5.
CREATE TABLE integration_settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
INSERT INTO integration_settings VALUES('max_intentos',5);
CREATE TABLE integration_queue(
 id TEXT NOT NULL UNIQUE,command_id TEXT PRIMARY KEY,empresa_id TEXT NOT NULL REFERENCES web_empresas(id),
 origen TEXT NOT NULL CHECK(origen IN('ESTADOS','COMERCIAL','SUSCRIPCIONES')),
 tipo_accion TEXT NOT NULL,payload_seguro TEXT NOT NULL CHECK(json_valid(payload_seguro)),
 estado TEXT NOT NULL CHECK(estado IN('SOLICITADO','PENDIENTE','APLICADO','ERROR','REINTENTO','CANCELADO')),
 intentos INTEGER NOT NULL DEFAULT 0,max_intentos INTEGER NOT NULL DEFAULT 5 CHECK(max_intentos BETWEEN 1 AND 20),
 retryable INTEGER NOT NULL DEFAULT 1,ultimo_error TEXT,proximo_reintento INTEGER,
 lease_owner TEXT,lease_until INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_at TEXT
);
CREATE INDEX integration_queue_due ON integration_queue(estado,proximo_reintento);
CREATE TABLE integration_attempts(
 id INTEGER PRIMARY KEY,command_id TEXT NOT NULL REFERENCES integration_queue(command_id),empresa_id TEXT NOT NULL,
 accion TEXT NOT NULL,intento INTEGER NOT NULL,estado TEXT NOT NULL,duracion_ms INTEGER NOT NULL,
 resultado TEXT NOT NULL,error TEXT,fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(command_id,intento)
);
CREATE TABLE integration_logs(
 id INTEGER PRIMARY KEY,command_id TEXT,empresa_id TEXT,accion TEXT NOT NULL,estado TEXT NOT NULL,
 duracion_ms INTEGER NOT NULL DEFAULT 0,resultado TEXT NOT NULL,error TEXT,fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER integration_attempts_no_update BEFORE UPDATE ON integration_attempts BEGIN SELECT RAISE(ABORT,'Intento inmutable');END;
CREATE TRIGGER integration_attempts_no_delete BEFORE DELETE ON integration_attempts BEGIN SELECT RAISE(ABORT,'Intento inmutable');END;
CREATE TABLE integration_reconciliation(
 empresa_id TEXT PRIMARY KEY REFERENCES web_empresas(id),
 estado TEXT NOT NULL CHECK(estado IN('SINCRONIZADO','DESINCRONIZADO','PENDIENTE','ERROR')),
 diferencias_json TEXT NOT NULL,local_json TEXT,web_json TEXT,ultimo_error TEXT,
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE integration_health(
 id TEXT PRIMARY KEY CHECK(id='WEB'),estado TEXT NOT NULL CHECK(estado IN('ONLINE','OFFLINE','ERROR')),
 checked_ms INTEGER NOT NULL,latencia_ms INTEGER NOT NULL,ultimo_error TEXT,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE integration_worker_runs(
 nombre TEXT PRIMARY KEY,lease_owner TEXT,lease_until INTEGER,last_started INTEGER,last_finished INTEGER,
 resultado TEXT NOT NULL DEFAULT 'PENDIENTE'
);

CREATE TRIGGER web_state_commands_integration_insert AFTER INSERT ON web_state_commands BEGIN
 INSERT INTO integration_queue(id,command_id,empresa_id,origen,tipo_accion,payload_seguro,estado,intentos,max_intentos,retryable,ultimo_error)
 VALUES(lower(hex(randomblob(16))),NEW.command_id,NEW.empresa_id,'ESTADOS',NEW.accion,json_object('command_id',NEW.command_id,'motivo',NEW.motivo,'administrador',NEW.administrador),NEW.resultado,NEW.intentos,(SELECT value FROM integration_settings WHERE key='max_intentos'),NEW.retryable,NEW.error);
END;
CREATE TRIGGER web_state_commands_integration_update AFTER UPDATE OF resultado,intentos,error,retryable ON web_state_commands BEGIN
 UPDATE integration_queue SET estado=CASE WHEN estado='CANCELADO' AND NEW.resultado<>'APLICADO' THEN estado WHEN NEW.resultado='PENDIENTE' AND lease_owner IS NOT NULL AND intentos>1 THEN 'REINTENTO' ELSE NEW.resultado END,
 intentos=max(intentos,NEW.intentos),retryable=NEW.retryable,ultimo_error=NEW.error,
 proximo_reintento=CASE WHEN NEW.resultado IN('ERROR','APLICADO') THEN NULL ELSE proximo_reintento END,
 applied_at=CASE WHEN NEW.resultado='APLICADO' THEN coalesce(applied_at,CURRENT_TIMESTAMP) ELSE applied_at END,
 updated_at=CURRENT_TIMESTAMP WHERE command_id=NEW.command_id AND origen='ESTADOS';
END;

CREATE TRIGGER web_commercial_commands_integration_insert AFTER INSERT ON web_commercial_commands BEGIN
 INSERT INTO integration_queue(id,command_id,empresa_id,origen,tipo_accion,payload_seguro,estado,intentos,max_intentos,retryable,ultimo_error)
 VALUES(lower(hex(randomblob(16))),NEW.command_id,NEW.empresa_id,'COMERCIAL',NEW.accion,json_object('command_id',json_extract(NEW.payload_json,'$.command_id'),'motivo',json_extract(NEW.payload_json,'$.motivo'),'administrador',json_extract(NEW.payload_json,'$.administrador'),'version_condiciones',json_extract(NEW.payload_json,'$.version_condiciones'),'plan_codigo',json_extract(NEW.payload_json,'$.plan_codigo'),'limite_sucursales',json_extract(NEW.payload_json,'$.limite_sucursales'),'limite_usuarios',json_extract(NEW.payload_json,'$.limite_usuarios'),'multisucursal',json_extract(NEW.payload_json,'$.multisucursal')),NEW.resultado,NEW.intentos,(SELECT value FROM integration_settings WHERE key='max_intentos'),NEW.retryable,NEW.error);
END;
CREATE TRIGGER web_commercial_commands_integration_update AFTER UPDATE OF resultado,intentos,error,retryable ON web_commercial_commands BEGIN
 UPDATE integration_queue SET estado=CASE WHEN estado='CANCELADO' AND NEW.resultado<>'APLICADO' THEN estado WHEN NEW.resultado='PENDIENTE' AND lease_owner IS NOT NULL AND intentos>1 THEN 'REINTENTO' ELSE NEW.resultado END,
 intentos=max(intentos,NEW.intentos),retryable=NEW.retryable,ultimo_error=NEW.error,
 proximo_reintento=CASE WHEN NEW.resultado IN('ERROR','APLICADO') THEN NULL ELSE proximo_reintento END,
 applied_at=CASE WHEN NEW.resultado='APLICADO' THEN coalesce(applied_at,CURRENT_TIMESTAMP) ELSE applied_at END,
 updated_at=CURRENT_TIMESTAMP WHERE command_id=NEW.command_id AND origen='COMERCIAL';
END;

CREATE TRIGGER web_subscription_commands_integration_insert AFTER INSERT ON web_subscription_commands BEGIN
 INSERT INTO integration_queue(id,command_id,empresa_id,origen,tipo_accion,payload_seguro,estado,intentos,max_intentos,retryable,ultimo_error)
 VALUES(lower(hex(randomblob(16))),NEW.command_id,NEW.empresa_id,'SUSCRIPCIONES',NEW.accion,json_object('command_id',json_extract(NEW.payload_json,'$.command_id'),'motivo',json_extract(NEW.payload_json,'$.motivo'),'administrador',json_extract(NEW.payload_json,'$.administrador'),'suscripcion_id',json_extract(NEW.payload_json,'$.suscripcion_id'),'version_esperada',json_extract(NEW.payload_json,'$.version_esperada'),'version_condiciones',json_extract(NEW.payload_json,'$.version_condiciones'),'fecha_inicio',json_extract(NEW.payload_json,'$.fecha_inicio'),'fecha_autorizada',json_extract(NEW.payload_json,'$.fecha_autorizada'),'meses',json_extract(NEW.payload_json,'$.meses')),NEW.resultado,NEW.intentos,(SELECT value FROM integration_settings WHERE key='max_intentos'),NEW.retryable,NEW.error);
END;
CREATE TRIGGER web_subscription_commands_integration_update AFTER UPDATE OF resultado,intentos,error,retryable ON web_subscription_commands BEGIN
 UPDATE integration_queue SET estado=CASE WHEN estado='CANCELADO' AND NEW.resultado<>'APLICADO' THEN estado WHEN NEW.resultado='PENDIENTE' AND lease_owner IS NOT NULL AND intentos>1 THEN 'REINTENTO' ELSE NEW.resultado END,
 intentos=max(intentos,NEW.intentos),retryable=NEW.retryable,ultimo_error=NEW.error,
 proximo_reintento=CASE WHEN NEW.resultado IN('ERROR','APLICADO') THEN NULL ELSE proximo_reintento END,
 applied_at=CASE WHEN NEW.resultado='APLICADO' THEN coalesce(applied_at,CURRENT_TIMESTAMP) ELSE applied_at END,
 updated_at=CURRENT_TIMESTAMP WHERE command_id=NEW.command_id AND origen='SUSCRIPCIONES';
END;
