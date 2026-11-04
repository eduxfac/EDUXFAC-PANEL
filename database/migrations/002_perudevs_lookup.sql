CREATE TABLE IF NOT EXISTS perudevs_usage_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 operation TEXT NOT NULL CHECK(operation IN('DNI','RUC')),
 outcome TEXT NOT NULL CHECK(outcome IN('ENCONTRADO','NO_ENCONTRADO','ERROR_API','ERROR_HTTP','ERROR_TIMEOUT')),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS perudevs_usage_created_at ON perudevs_usage_events(created_at DESC);
CREATE TABLE IF NOT EXISTS perudevs_request_nonces (
 nonce TEXT PRIMARY KEY,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS perudevs_request_nonces_created_at ON perudevs_request_nonces(created_at);
