CREATE TABLE IF NOT EXISTS panel_admin_users(
 id INTEGER PRIMARY KEY,public_id TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('SUPERADMIN','ADMIN','SOPORTE','LECTURA')),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 auth_version INTEGER NOT NULL DEFAULT 1,must_change_password INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS panel_admin_sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES panel_admin_users(id),auth_version INTEGER NOT NULL,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS panel_admin_events(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES panel_admin_users(id),target_id INTEGER REFERENCES panel_admin_users(id),accion TEXT NOT NULL,resultado TEXT NOT NULL,motivo TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS panel_auth_attempts(id INTEGER PRIMARY KEY,bucket TEXT NOT NULL,attempted_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS panel_auth_attempts_bucket ON panel_auth_attempts(bucket,attempted_at);
CREATE TABLE IF NOT EXISTS panel_backup_events(id INTEGER PRIMARY KEY,accion TEXT NOT NULL,estado TEXT NOT NULL,artifact_name TEXT NOT NULL,retention_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER IF NOT EXISTS panel_admin_events_no_update BEFORE UPDATE ON panel_admin_events BEGIN SELECT RAISE(ABORT,'Auditoría inmutable');END;
CREATE TRIGGER IF NOT EXISTS panel_admin_events_no_delete BEFORE DELETE ON panel_admin_events BEGIN SELECT RAISE(ABORT,'Auditoría inmutable');END;
