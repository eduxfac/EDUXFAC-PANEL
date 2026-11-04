-- El esquema PostgreSQL de sucursales fiscales lo crea 009; evita intentar el DDL SQLite al iniciar.
INSERT INTO web_schema_migrations(version) VALUES('007_branch_fiscal_configuration')
ON CONFLICT(version) DO NOTHING;
