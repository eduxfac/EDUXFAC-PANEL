-- Approved scope: local/lab operational rollback. No epoch/hash restoration.
-- Disable/drainthe new HTTP endpoints first; retain the auth/password-change
-- security bridge in the previous application build. See ROLLBACK_PLAN.md.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE EXECUTE ON FUNCTION public.authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet) FROM eduxfac_user_authorizer;
REVOKE EXECUTE ON FUNCTION public.activate_web_user_context(text),public.admin_reset_web_user_password(uuid,uuid,text,text,uuid),public.web_user_context() FROM eduxfac_user_admin;
DROP POLICY IF EXISTS user_admin_read ON public.empresas;
DROP POLICY IF EXISTS user_admin_read ON public.usuarios;
DROP POLICY IF EXISTS user_admin_reset ON public.usuarios;
DROP POLICY IF EXISTS user_admin_read ON public.empresa_acceso;
DROP POLICY IF EXISTS user_admin_read ON public.sucursales;
DROP POLICY IF EXISTS user_admin_read ON public.usuario_sucursal;
DROP POLICY IF EXISTS user_admin_event ON public.web_user_admin_events;
DROP FUNCTION public.admin_reset_web_user_password(uuid,uuid,text,text,uuid) RESTRICT;
DROP FUNCTION public.activate_web_user_context(text) RESTRICT;
DROP FUNCTION public.authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet) RESTRICT;
DROP FUNCTION public.web_user_context() RESTRICT;
REVOKE ALL ON public.empresas,public.empresa_acceso,public.usuarios,public.sucursales,public.usuario_sucursal,public.roles,public.web_user_admin_events FROM eduxfac_user_admin,eduxfac_user_authorizer,eduxfac_user_admin_owner;
-- Column ACLs survive a table-level REVOKE; remove explicitly.
REVOKE SELECT(id,activo) ON public.empresas FROM eduxfac_user_admin,eduxfac_user_admin_owner;
REVOKE SELECT(empresa_id,estado,fecha_inicio,fecha_vencimiento,auth_version,suscripcion_requerida,suscripcion_id,estado_suscripcion) ON public.empresa_acceso FROM eduxfac_user_admin;
REVOKE SELECT(id,empresa_id,usuario,nombre,activo,debe_cambiar_password,password_version) ON public.usuarios FROM eduxfac_user_admin,eduxfac_user_admin_owner;
REVOKE UPDATE(password_hash,debe_cambiar_password,password_version) ON public.usuarios FROM eduxfac_user_admin_owner;
REVOKE SELECT(id,empresa_id,nombre,activo) ON public.sucursales FROM eduxfac_user_admin;
REVOKE SELECT(usuario_id,sucursal_id,rol_id) ON public.usuario_sucursal FROM eduxfac_user_admin;
REVOKE SELECT(id,nombre) ON public.roles FROM eduxfac_user_admin;
REVOKE INSERT(request_id,empresa_id,usuario_id,actor,accion,ip) ON public.web_user_admin_events FROM eduxfac_user_admin_owner;
ALTER ROLE eduxfac_user_admin NOLOGIN;
ALTER ROLE eduxfac_user_authorizer NOLOGIN;
-- Retain password_version, its CHECK/default, events, private authorization
-- metadata and migration ledger. Existing JWT revocation remains effective.
COMMIT;
