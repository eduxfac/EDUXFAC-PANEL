-- FUTURO, NO EJECUTADO: correr bajo DBA autorizado, sin contraseñas en código.
-- CREATE ROLE por cluster: eduxfac_backup tiene password distinto en cluster/DB separados.
CREATE ROLE eduxfac_web_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_web_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_web_service NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_web_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_panel_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_panel_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE eduxfac_backup NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
-- No copiar credenciales test. Habilitar LOGIN y fijar password único privadamente sólo con autorización futura.
-- No otorgar membresía migrador/service a APP. GRANT CONNECT por DB específica, REVOKE PUBLIC.
-- Migradores propietarios de sus respectivos schemas, runtime NO propietario.
-- Plan WEB generado por planGlobalRLS(dataMode:PILOTO), roles arriba + auth obligatorio.
-- Panel grantPanelPrivileges(appRole:eduxfac_panel_app,backupRole:eduxfac_backup).
-- eduxfac_backup es operador transversal de respaldo; solo SELECT por política explícita, no escritura.
