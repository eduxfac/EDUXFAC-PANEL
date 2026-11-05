import fs from 'node:fs';import {randomUUID} from 'node:crypto';import bcrypt from 'bcryptjs';import assert from 'node:assert/strict';
export async function securitySchema(db){
 await db.query(`CREATE TABLE public.empresas(id uuid PRIMARY KEY,activo boolean,ruc text,empresa_codigo text,razon_social text);
 CREATE TABLE public.empresa_acceso(empresa_id uuid,estado text,fecha_inicio timestamptz,fecha_vencimiento timestamptz,auth_version bigint,suscripcion_requerida boolean,suscripcion_id uuid,estado_suscripcion text,limite_sucursales int DEFAULT 3,limite_usuarios int DEFAULT 6,updated_at timestamptz DEFAULT now());
 CREATE TABLE public.usuarios(id uuid PRIMARY KEY,empresa_id uuid REFERENCES empresas(id),usuario text,nombre text,activo boolean,debe_cambiar_password boolean,password_hash text,updated_at timestamptz DEFAULT now());
 CREATE TABLE public.sucursales(id uuid PRIMARY KEY,empresa_id uuid,nombre text,activo boolean,codigo text DEFAULT 'SYN',direccion text DEFAULT 'Synthetic');
 CREATE TABLE public.roles(id uuid PRIMARY KEY,nombre text);
 CREATE TABLE public.usuario_sucursal(usuario_id uuid,sucursal_id uuid,rol_id uuid);
 CREATE TABLE public.auditoria(empresa_id uuid,usuario_id uuid,accion text,entidad text,entidad_id uuid,detalle jsonb);
 CREATE TABLE public.web_schema_migrations(version text PRIMARY KEY);
 CREATE ROLE eduxfac_web_migrator_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 CREATE ROLE eduxfac_web_backup_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 CREATE ROLE eduxfac_web_app_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 CREATE ROLE eduxfac_web_auth_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 CREATE ROLE eduxfac_web_internal_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 REVOKE ALL ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO eduxfac_web_app_test,eduxfac_web_auth_test,eduxfac_web_internal_test;`);
 for(const table of ['empresas','empresa_acceso','usuarios','sucursales','usuario_sucursal','auditoria']){const expr=table==='empresas'?"id=nullif(current_setting('app.empresa_id',true),'')::uuid":table==='usuario_sucursal'?"EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=usuario_id)":"empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid";await db.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;CREATE POLICY f10_tenant ON public.${table} TO eduxfac_web_app_test USING(${expr}) WITH CHECK(${expr});GRANT SELECT ON public.${table} TO eduxfac_web_app_test;`);if(table!=='auditoria')await db.query(`CREATE POLICY f10_auth ON public.${table} FOR SELECT TO eduxfac_web_auth_test USING(true);GRANT SELECT ON public.${table} TO eduxfac_web_auth_test;CREATE POLICY f10_service ON public.${table} TO eduxfac_web_internal_test USING(true) WITH CHECK(true);GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO eduxfac_web_internal_test;`);}
 await db.query('GRANT SELECT ON public.roles TO eduxfac_web_app_test,eduxfac_web_auth_test;GRANT UPDATE(razon_social) ON public.empresas TO eduxfac_web_app_test;GRANT UPDATE(password_hash,debe_cambiar_password,updated_at) ON public.usuarios TO eduxfac_web_app_test;GRANT INSERT ON public.auditoria TO eduxfac_web_app_test;');
 const A=randomUUID(),B=randomUUID(),P=randomUUID(),a=randomUUID(),b=randomUUID(),c=randomUUID(),inactive=randomUUID(),branch=randomUUID(),otherBranch=randomUUID(),role=randomUUID(),original='Synthetic-Origin!123';const encoded=await bcrypt.hash(original,12);
 for(const [id,code,doc,state]of [[A,'SYN-A','99999999999','ACTIVO'],[B,'SYN-B','99999999998','ACTIVO'],[P,'SYN-P','99999999997','PENDIENTE']]){await db.query('INSERT INTO public.empresas VALUES($1,true,$2,$3,$3)',[id,doc,code]);await db.query('INSERT INTO public.empresa_acceso(empresa_id,estado,auth_version,suscripcion_requerida,suscripcion_id,estado_suscripcion) VALUES($1,$2,1,true,$3,$4)',[id,state,randomUUID(),state==='ACTIVO'?'ACTIVA':'PENDIENTE']);}
 for(const [id,company,name,active]of [[a,A,'user_a',true],[b,A,'user_b',true],[c,B,'user_c',true],[inactive,P,'inactive_user',false]])await db.query('INSERT INTO public.usuarios(id,empresa_id,usuario,nombre,activo,debe_cambiar_password,password_hash) VALUES($1,$2,$3,$3,$4,false,$5)',[id,company,name,active,encoded]);
 await db.query("INSERT INTO public.sucursales(id,empresa_id,nombre,activo) VALUES($1,$3,'Branch A',true),($2,$4,'Branch B',true)",[branch,otherBranch,A,B]);await db.query("INSERT INTO public.roles VALUES($1,'Administrador')",[role]);for(const [id,s]of [[a,branch],[b,branch],[c,otherBranch]])await db.query('INSERT INTO public.usuario_sucursal VALUES($1,$2,$3)',[id,s,role]);
 const migration=fs.readFileSync('integrations/web-user-management/014_web_user_administration.sql','utf8');
 const dataBefore=(await db.query('SELECT id,empresa_id,usuario,activo FROM public.usuarios ORDER BY id')).rows;
 await assert.rejects(db.query(migration.replace(/COMMIT;\s*$/,'SELECT 1/0;')),e=>e.code==='22012');await db.query('ROLLBACK');assert.equal((await db.query("SELECT to_regclass('public.web_user_admin_events') event")).rows[0].event,null);assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='password_version'")).rows[0].n,0);
 await db.query(migration);assert.deepEqual((await db.query('SELECT id,empresa_id,usuario,activo FROM public.usuarios ORDER BY id')).rows,dataBefore);await db.query('GRANT UPDATE(password_version) ON public.usuarios TO eduxfac_web_app_test;');
 return {A,B,P,a,b,c,inactive,branch,otherBranch,role,original,migration};
}
