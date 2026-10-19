-- Fase 2 SQLite. Aplicación explícita después del esquema y 001_licensing.
ALTER TABLE clients ADD COLUMN public_id TEXT;
ALTER TABLE clients ADD COLUMN document_type TEXT;
ALTER TABLE clients ADD COLUMN document_number TEXT;
UPDATE clients SET public_id=lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6)));
UPDATE clients SET document_type=CASE WHEN nullif(trim(ruc),'') IS NOT NULL THEN 'RUC' WHEN nullif(trim(dni),'') IS NOT NULL THEN 'DNI' ELSE 'SIN_DOCUMENTO' END,
 document_number=CASE WHEN nullif(trim(ruc),'') IS NOT NULL THEN trim(ruc) WHEN nullif(trim(dni),'') IS NOT NULL THEN trim(dni) ELSE NULL END;
CREATE UNIQUE INDEX clients_public_id ON clients(public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX clients_document_identity ON clients(document_type,document_number) WHERE document_number IS NOT NULL;
CREATE TABLE web_empresas (
 id TEXT PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clients(id), empresa_web_id TEXT UNIQUE,
 razon_social TEXT NOT NULL, nombre_comercial TEXT, ruc TEXT NOT NULL UNIQUE, empresa_codigo TEXT NOT NULL COLLATE NOCASE UNIQUE,
 sucursal_nombre TEXT NOT NULL, administrador_nombre TEXT NOT NULL, administrador_usuario TEXT NOT NULL,
 estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','ACTIVO')),
 sync_status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(sync_status IN ('PENDIENTE','CONFIRMADO','ERROR_DE_SINCRONIZACION')),
 steps_json TEXT NOT NULL DEFAULT '{}', commands_json TEXT NOT NULL,
 last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX web_empresas_client ON web_empresas(cliente_id);
-- No se almacenan contraseñas, tokens ni datos operativos WEB.

