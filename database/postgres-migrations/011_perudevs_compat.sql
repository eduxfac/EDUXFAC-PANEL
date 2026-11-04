-- Mark the equivalent SQLite migration as already covered by 010_perudevs_lookup.
INSERT INTO schema_migrations(version) VALUES ('002_perudevs_lookup.sql')
ON CONFLICT(version) DO NOTHING;
