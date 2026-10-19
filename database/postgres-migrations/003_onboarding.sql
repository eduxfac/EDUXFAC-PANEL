
ALTER TABLE clients ADD COLUMN public_id TEXT;
ALTER TABLE clients ADD COLUMN document_type TEXT;
ALTER TABLE clients ADD COLUMN document_number TEXT;


CREATE UNIQUE INDEX clients_public_id ON clients(public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX clients_document_identity ON clients(document_type,document_number) WHERE document_number IS NOT NULL;
CREATE TABLE web_empresas (
 id TEXT PRIMARY KEY, cliente_id BIGINT NOT NULL REFERENCES clients(id) DEFERRABLE INITIALLY DEFERRED, empresa_web_id TEXT UNIQUE,
 razon_social TEXT NOT NULL, nombre_comercial TEXT, ruc TEXT NOT NULL UNIQUE, empresa_codigo TEXT NOT NULL  UNIQUE,
 sucursal_nombre TEXT NOT NULL, administrador_nombre TEXT NOT NULL, administrador_usuario TEXT NOT NULL,
 estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','ACTIVO')),
 sync_status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(sync_status IN ('PENDIENTE','CONFIRMADO','ERROR_DE_SINCRONIZACION')),
 steps_json TEXT NOT NULL DEFAULT '{}', commands_json TEXT NOT NULL,
 last_error TEXT, created_at TEXT NOT NULL DEFAULT panel_now(), updated_at TEXT NOT NULL DEFAULT panel_now()
);
CREATE INDEX web_empresas_client ON web_empresas(cliente_id);



CREATE TABLE web_schema_migrations(version text PRIMARY KEY,applied_at text NOT NULL DEFAULT panel_now());CREATE UNIQUE INDEX web_empresa_codigo_casefold ON web_empresas(lower(empresa_codigo));