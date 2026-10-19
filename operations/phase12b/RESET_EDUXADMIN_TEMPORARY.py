#!/usr/bin/python3
"""Reset ONLY eduxadmin in PANEL PILOTO. Manual interactive SSH only, without sudo.
The new password is read without echo, passed only through a memory pipe, never
placed in argv, environment, files or logs. No hash output. No other user/config
changes. Use existing hash implementation and atomic PostgreSQL transaction.
"""
import os,sys,getpass,warnings,json,subprocess
NODE="/home/eduxadmin/.local/opt/eduxfac-node24/bin/node"
WORKER="import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/node_modules/pg/lib/index.js';import {hashPanelPassword,checkPanelPassword} from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/panel/server/admin-auth.mjs';\nconst USER='eduxadmin',MARKER='EDUXADMIN_TEMP_RESET_20261013_01';let db,transaction=false,password,hash;\ntry{\n let raw='';for await(const b of process.stdin)raw+=b.toString('utf8');\n const input=JSON.parse(raw);password=input.password;raw='';input.password=null;\n if(typeof password!=='string'||password.length<16||password.length>256)throw Error('PASSWORD_LENGTH_INVALID');\n const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json'));\n db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_panel_piloto',user:'eduxfac_panel_migrator',password:s.roles.eduxfac_panel_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=15000 -c lock_timeout=5000'});\n await db.connect();await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');transaction=true;\n if((await db.query('SELECT current_database() name')).rows[0].name!=='eduxfac_panel_piloto')throw Error('PILOTO_DATABASE_GUARD');\n const cfg=Object.fromEntries((await db.query(\"SELECT name,setting FROM pg_settings WHERE name IN ('log_statement','log_min_duration_statement','log_min_duration_sample','log_parameter_max_length_on_error')\")).rows.map(r=>[r.name,r.setting]));\n if(cfg.log_statement!=='none'||cfg.log_min_duration_statement!=='-1'||cfg.log_min_duration_sample!=='-1'||cfg.log_parameter_max_length_on_error!=='0')throw Error('LOGGING_GUARD_STOP');\n if((await db.query(\"SELECT 1 FROM panel.panel_admin_events WHERE motivo=$1\",[MARKER])).rowCount)throw Error('RESET_ALREADY_APPLIED_DO_NOT_REPEAT');\n const r=await db.query('SELECT id,username,role,enabled,auth_version,password_hash FROM panel.panel_admin_users WHERE username=$1 FOR UPDATE',[USER]);\n if(r.rowCount!==1)throw Error('TARGET_NOT_UNIQUE');\n const before=r.rows[0];if(before.role!=='SUPERADMIN'||Number(before.enabled)!==1)throw Error('TARGET_ROLE_OR_STATUS_DRIFT');\n if(checkPanelPassword(password,before.password_hash))throw Error('NEW_PASSWORD_MUST_DIFFER');\n const otherBefore=(await db.query('SELECT id,md5(row_to_json(u)::text) fingerprint FROM panel.panel_admin_users u WHERE username<>$1 ORDER BY id',[USER])).rows;\n hash=hashPanelPassword(password);if(!checkPanelPassword(password,hash))throw Error('HASH_COMPATIBILITY_FAILED');\n password=null;\n const updated=await db.query(\"UPDATE panel.panel_admin_users SET password_hash=$1,must_change_password=1,auth_version=auth_version+1,updated_at=panel.panel_now() WHERE id=$2 AND username=$3 AND role='SUPERADMIN' AND enabled=1 RETURNING id,username,role,enabled,must_change_password,auth_version\",[hash,before.id,USER]);\n hash=null;\n if(updated.rowCount!==1)throw Error('UPDATE_EXACTLY_ONE_GUARD');\n const after=updated.rows[0];\n if(after.role!==before.role||Number(after.enabled)!==1||Number(after.must_change_password)!==1||BigInt(after.auth_version)!==BigInt(before.auth_version)+1n)throw Error('POST_UPDATE_GUARD');\n const otherAfter=(await db.query('SELECT id,md5(row_to_json(u)::text) fingerprint FROM panel.panel_admin_users u WHERE username<>$1 ORDER BY id',[USER])).rows;\n if(JSON.stringify(otherBefore)!==JSON.stringify(otherAfter))throw Error('OTHER_USERS_CHANGED_STOP');\n if(Number((await db.query('SELECT count(*) n FROM panel.panel_admin_sessions WHERE admin_id=$1 AND auth_version=$2',[after.id,after.auth_version])).rows[0].n)!==0)throw Error('SESSION_REVOCATION_FAILED');\n await db.query(\"INSERT INTO panel.panel_admin_events(actor_id,target_id,accion,resultado,motivo) VALUES(NULL,$1,'RESET_ADMINISTRATIVO','OK',$2)\",[after.id,MARKER]);\n await db.query('COMMIT');transaction=false;\n console.log(JSON.stringify({status:'EDUXADMIN_TEMP_RESET_OK',username:USER,role:'SUPERADMIN',active:true,must_change_password:true,sessions_invalidated:true,other_users_unchanged:true,audit_recorded:true}));\n}catch(e){\n if(transaction)await db.query('ROLLBACK').catch(()=>{});\n // Whitelist errors; never emit PostgreSQL messages, SQL parameters, stack, hash or password.\n const allowed=['PASSWORD_LENGTH_INVALID','PILOTO_DATABASE_GUARD','LOGGING_GUARD_STOP','RESET_ALREADY_APPLIED_DO_NOT_REPEAT','TARGET_NOT_UNIQUE','TARGET_ROLE_OR_STATUS_DRIFT','NEW_PASSWORD_MUST_DIFFER','HASH_COMPATIBILITY_FAILED','UPDATE_EXACTLY_ONE_GUARD','POST_UPDATE_GUARD','OTHER_USERS_CHANGED_STOP','SESSION_REVOCATION_FAILED'];\n console.log(JSON.stringify({status:'DETENER',code:allowed.includes(e.message)?e.message:'RESET_TRANSACTION_FAILED'}));process.exitCode=1;\n}finally{password=null;hash=null;if(db)await db.end().catch(()=>{})}\n"
def main():
 if sys.argv[1:]!=["--apply"] or os.geteuid()!=1001 or not sys.stdin.isatty() or not sys.stderr.isatty():
  print("DETENER: ejecutar manualmente en terminal SSH interactiva como eduxadmin, sin sudo.");return 2
 warnings.simplefilter("error",getpass.GetPassWarning)
 try:
  password=getpass.getpass("Nueva contraseña temporal (16 a256 caracteres): ",stream=sys.stderr)
  confirmation=getpass.getpass("Repite la contraseña temporal: ",stream=sys.stderr)
 except (getpass.GetPassWarning,EOFError,KeyboardInterrupt):
  print("DETENER: entrada oculta cancelada/no disponible.");return 2
 if password!=confirmation:
  print("DETENER: las contraseñas no coinciden; no se ejecutó el cambio.");return 2
 if len(password)<16 or len(password)>256:
  print("DETENER: longitud inválida; no se ejecutó el cambio.");return 2
 try:
  result=subprocess.run([NODE,"--input-type=module","-e",WORKER],input=json.dumps({"password":password}),capture_output=True,text=True,encoding="utf-8",timeout=45)
  password=None;confirmation=None
  answer=json.loads(result.stdout)
  if result.returncode!=0 or answer.get("status")!="EDUXADMIN_TEMP_RESET_OK":
   print("DETENER: "+answer.get("code","RESET_RESULT_NOT_CONFIRMED"));return 1
  print("EDUXADMIN_TEMP_RESET_OK")
  print("Usuario eduxadmin | SUPERADMIN | activo SI | cambio obligatorio SI | sesiones previas invalidadas | otros usuarios intactos.")
  print("Entra en https://admin.eduxfac.com y cambia la contraseña temporal al iniciar sesión.")
  return 0
 except Exception:
  print("DETENER: resultado no confirmado. No repitas el comando; solicita verificación READ-ONLY.");return 1
 finally:password=None;confirmation=None
if __name__=="__main__":sys.exit(main())
