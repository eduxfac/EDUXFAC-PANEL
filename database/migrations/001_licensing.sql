-- Fase 1: gestión de clientes, licencias e instalaciones.
ALTER TABLE clients ADD COLUMN business_name TEXT;
ALTER TABLE clients ADD COLUMN dni TEXT;
ALTER TABLE clients ADD COLUMN phone TEXT;
ALTER TABLE clients ADD COLUMN address TEXT;
ALTER TABLE clients ADD COLUMN notes TEXT;
ALTER TABLE clients ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVO';
ALTER TABLE clients ADD COLUMN updated_at TEXT;

ALTER TABLE licenses ADD COLUMN purchased_at TEXT;
ALTER TABLE licenses ADD COLUMN license_type TEXT NOT NULL DEFAULT 'PERPETUA';
ALTER TABLE licenses ADD COLUMN notes TEXT;
ALTER TABLE licenses ADD COLUMN activation_code_hash TEXT;
ALTER TABLE licenses ADD COLUMN first_activated_at TEXT;
ALTER TABLE licenses ADD COLUMN last_validated_at TEXT;
ALTER TABLE licenses ADD COLUMN updated_at TEXT;

ALTER TABLE authorized_devices ADD COLUMN device_name TEXT;
ALTER TABLE authorized_devices ADD COLUMN fingerprint_hash TEXT;
ALTER TABLE authorized_devices ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE authorized_devices ADD COLUMN requested_at TEXT;
ALTER TABLE authorized_devices ADD COLUMN activated_at TEXT;
ALTER TABLE authorized_devices ADD COLUMN last_validated_at TEXT;
ALTER TABLE authorized_devices ADD COLUMN replaced_at TEXT;
ALTER TABLE authorized_devices ADD COLUMN replacement_reason TEXT;
ALTER TABLE authorized_devices ADD COLUMN notes TEXT;
ALTER TABLE authorized_devices ADD COLUMN client_token_hash TEXT;
ALTER TABLE authorized_devices ADD COLUMN reinstalled_from_device_id INTEGER REFERENCES authorized_devices(id);
ALTER TABLE authorized_devices ADD COLUMN replaced_by_device_id INTEGER REFERENCES authorized_devices(id);
ALTER TABLE authorized_devices ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS license_events (
  id INTEGER PRIMARY KEY,
  license_id INTEGER NOT NULL REFERENCES licenses(id),
  device_id INTEGER REFERENCES authorized_devices(id),
  event TEXT NOT NULL,
  detail TEXT NOT NULL,
  administrator TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_business_name ON clients(business_name);
CREATE INDEX IF NOT EXISTS idx_licenses_client ON licenses(client_id);
CREATE INDEX IF NOT EXISTS idx_devices_license ON authorized_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_installation_code ON authorized_devices(installation_id);
CREATE INDEX IF NOT EXISTS idx_license_events_license ON license_events(license_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_device_per_license
  ON authorized_devices(license_id) WHERE status='ACTIVA';
