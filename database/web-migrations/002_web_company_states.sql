-- Ejecutar explícitamente después de 001_web_onboarding; no se aplica al iniciar.
-- estado original conserva el progreso de alta Fase 2. Estado administrativo separado.
ALTER TABLE web_empresas ADD COLUMN estado_local TEXT CHECK(estado_local IN ('PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO'));
ALTER TABLE web_empresas ADD COLUMN estado_web TEXT CHECK(estado_web IN ('PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO'));
ALTER TABLE web_empresas ADD COLUMN web_auth_version TEXT;
ALTER TABLE web_empresas ADD COLUMN ultima_sincronizacion TEXT;
CREATE TABLE web_state_commands (
 command_id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES web_empresas(id),
 empresa_web_id TEXT NOT NULL, accion TEXT NOT NULL, administrador TEXT NOT NULL,
 motivo TEXT NOT NULL, estado_anterior TEXT NOT NULL, estado_nuevo TEXT NOT NULL,
 resultado TEXT NOT NULL CHECK(resultado IN ('SOLICITADO','PENDIENTE','APLICADO','ERROR')),
 error TEXT, retryable INTEGER NOT NULL DEFAULT 1 CHECK(retryable IN (0,1)),
 intentos INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX web_state_one_unconfirmed ON web_state_commands(empresa_id)
 WHERE resultado IN ('SOLICITADO','PENDIENTE') OR (resultado='ERROR' AND retryable=1);
CREATE TABLE web_state_history (
 id INTEGER PRIMARY KEY, command_id TEXT, empresa_id TEXT NOT NULL REFERENCES web_empresas(id),
 accion TEXT NOT NULL, administrador TEXT NOT NULL, motivo TEXT NOT NULL,
 estado_anterior TEXT, estado_nuevo TEXT, resultado TEXT NOT NULL,
 error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX web_state_history_company ON web_state_history(empresa_id,id DESC);
