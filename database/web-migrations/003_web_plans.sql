-- FASE 4. Aplicación explícita; SQLite guarda dinero en centavos enteros.
CREATE TABLE web_planes (
 id TEXT PRIMARY KEY, codigo TEXT NOT NULL UNIQUE CHECK(codigo IN ('BASICO','PROFESIONAL','EMPRESA')),
 nombre TEXT NOT NULL, precio_centavos INTEGER NOT NULL CHECK(typeof(precio_centavos)='integer' AND precio_centavos>=0),
 moneda TEXT NOT NULL CHECK(moneda='PEN'), periodicidad TEXT NOT NULL CHECK(periodicidad='MENSUAL'),
 limite_sucursales INTEGER, limite_usuarios INTEGER NOT NULL CHECK(limite_usuarios>0),
 multisucursal INTEGER NOT NULL CHECK(multisucursal IN (0,1)), activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((multisucursal=1 AND limite_sucursales IS NULL) OR (multisucursal=0 AND limite_sucursales>0 AND limite_sucursales IS NOT NULL))
);
INSERT INTO web_planes(id,codigo,nombre,precio_centavos,moneda,periodicidad,limite_sucursales,limite_usuarios,multisucursal) VALUES
 ('00000000-0000-4000-8000-000000000059','BASICO','PLAN BÁSICO',5900,'PEN','MENSUAL',1,3,0),
 ('00000000-0000-4000-8000-000000000099','PROFESIONAL','PLAN PROFESIONAL',9900,'PEN','MENSUAL',1,4,0),
 ('00000000-0000-4000-8000-000000000129','EMPRESA','PLAN EMPRESA',12900,'PEN','MENSUAL',NULL,6,1);
ALTER TABLE web_empresas ADD COLUMN plan_seleccionado TEXT;
CREATE TABLE web_company_conditions (
 empresa_id TEXT PRIMARY KEY REFERENCES web_empresas(id), plan_id TEXT NOT NULL REFERENCES web_planes(id),
 plan_codigo TEXT NOT NULL, precio_asignado_centavos INTEGER NOT NULL CHECK(typeof(precio_asignado_centavos)='integer' AND precio_asignado_centavos>=0),
 moneda TEXT NOT NULL, periodicidad TEXT NOT NULL,
 limite_sucursales_asignado INTEGER, limite_usuarios_asignado INTEGER NOT NULL CHECK(limite_usuarios_asignado>0),
 multisucursal INTEGER NOT NULL CHECK(multisucursal IN (0,1)), personalizada INTEGER NOT NULL CHECK(personalizada IN (0,1)),
 version_condiciones TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_commercial_commands (
 command_id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES web_empresas(id), empresa_web_id TEXT NOT NULL,
 accion TEXT NOT NULL CHECK(accion IN ('ASIGNAR_PLAN','AJUSTAR_LIMITES')),
 administrador TEXT NOT NULL, motivo TEXT NOT NULL, payload_json TEXT NOT NULL, snapshot_json TEXT NOT NULL, anterior_json TEXT,
 resultado TEXT NOT NULL CHECK(resultado IN ('SOLICITADO','PENDIENTE','APLICADO','ERROR')), error TEXT,
 retryable INTEGER NOT NULL DEFAULT 1, intentos INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX web_commercial_one_pending ON web_commercial_commands(empresa_id) WHERE resultado IN ('SOLICITADO','PENDIENTE') OR(resultado='ERROR' AND retryable=1);
CREATE TABLE web_commercial_history (
 id INTEGER PRIMARY KEY, command_id TEXT NOT NULL, empresa_id TEXT REFERENCES web_empresas(id), accion TEXT NOT NULL,
 administrador TEXT NOT NULL,motivo TEXT NOT NULL,anterior_json TEXT,nuevo_json TEXT,resultado TEXT NOT NULL,error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_commercial_usage (
 empresa_id TEXT PRIMARY KEY REFERENCES web_empresas(id), uso_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
