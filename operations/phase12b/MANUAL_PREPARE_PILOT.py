#!/usr/bin/env python3
"""FASE12B: preparación manual de bases PILOTO NUEVAS. No cambia eduxfac ni sus roles."""
import os,json,pathlib,subprocess,hashlib,time,shutil,re
if os.geteuid()!=0:raise SystemExit("Ejecutar MANUALMENTE con sudo.")
if __import__("sys").argv[1:]!=["--apply"]:raise SystemExit("Revisar el script; para aplicar manualmente usar --apply.")
stage=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625")
done=stage/"PILOT_PREPARE_DONE.json"
if done.exists():raise SystemExit("Preparacion ya registrada; NO repetir. Codex debe verificar estado.")
private=pathlib.Path("/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json")
if private.is_symlink() or private.stat().st_uid!=1001 or private.stat().st_mode&0o077:raise SystemExit("SECRETS_FILE_PERMISSIONS")
secrets=json.loads(private.read_text())
roles=("eduxfac_panel_app","eduxfac_panel_migrator","eduxfac_web_app","eduxfac_web_auth","eduxfac_web_service","eduxfac_web_migrator","eduxfac_backup")
for name in roles:
 if not re.fullmatch(r"[A-Za-z0-9_-]{43,}",secrets["roles"].get(name,"")):raise SystemExit("SECRET_FORMAT_INVALID")
def sql(command,database="postgres"):
 prefix="SET log_statement='none'; SET log_min_error_statement='panic'; "
 p=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql","-X","-qAt","-v","ON_ERROR_STOP=1","-d",database],input=prefix+command,text=True,capture_output=True,timeout=45)
 if p.returncode:raise RuntimeError("POSTGRES_CONTROLLED_ERROR_RC_"+str(p.returncode))
 return p.stdout.strip()
existing=json.loads(sql("SELECT coalesce(json_agg(rolname),'[]'::json) FROM pg_roles WHERE rolname IN ("+",".join("'"+r+"'" for r in roles)+");"))
databases=json.loads(sql("SELECT coalesce(json_agg(datname),'[]'::json) FROM pg_database WHERE datname IN ('eduxfac_panel_piloto','eduxfac_web_piloto');"))
if existing or databases:raise SystemExit("NOMBRES_YA_EXISTENTES_NO_SOBRESCRIBIR; verificar manualmente antes de continuar.")
rootbackup=pathlib.Path("/var/backups/eduxfac/FASE12B_PREPARACION_20261013_0625")
rootbackup.mkdir(parents=True,mode=0o700,exist_ok=False);os.chmod(rootbackup,0o700)
backups=[]
for src in ("/etc/hosts","/etc/postgresql/16/main/postgresql.conf","/etc/postgresql/16/main/pg_hba.conf"):
 dst=rootbackup/(pathlib.Path(src).name+".before")
 shutil.copy2(src,dst);os.chmod(dst,0o600)
 backups.append({"path":str(dst),"sha256":hashlib.sha256(dst.read_bytes()).hexdigest(),"bytes":dst.stat().st_size})
globenv=dict(os.environ);globenv["PGAPPNAME"]="EDUXFAC_F12B_MANUAL_BACKUP"
r=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/pg_dumpall","--globals-only"],capture_output=True,text=True,env=globenv,timeout=45)
if r.returncode:raise SystemExit("GLOBALS_BACKUP_FAILED")
globalsfile=rootbackup/"PG_GLOBALS_PRIVATE.sql";globalsfile.write_text(r.stdout);os.chmod(globalsfile,0o600)
backups.append({"path":str(globalsfile),"sha256":hashlib.sha256(globalsfile.read_bytes()).hexdigest(),"bytes":globalsfile.stat().st_size})
pgaudit=sql("SELECT current_setting('pgaudit.log',true);")
auditoff="SET pgaudit.log='none'; " if pgaudit else ""
commands="BEGIN; "+auditoff
for name in roles:
 commands+="CREATE ROLE "+name+" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+secrets["roles"][name]+"'; "
commands+="GRANT eduxfac_web_app,eduxfac_web_auth,eduxfac_web_service TO eduxfac_web_migrator WITH INHERIT FALSE, SET TRUE; COMMIT;"
sql(commands)
for database,owner,users in (
 ("eduxfac_panel_piloto","eduxfac_panel_migrator",("eduxfac_panel_app","eduxfac_panel_migrator","eduxfac_backup")),
 ("eduxfac_web_piloto","eduxfac_web_migrator",("eduxfac_web_app","eduxfac_web_auth","eduxfac_web_service","eduxfac_web_migrator","eduxfac_backup"))
):
 sql("CREATE DATABASE "+database+" OWNER "+owner+" TEMPLATE template0;")
 sql("REVOKE CONNECT,TEMPORARY ON DATABASE "+database+" FROM PUBLIC; GRANT CONNECT ON DATABASE "+database+" TO "+",".join(users)+"; COMMENT ON DATABASE "+database+" IS '"+json.dumps({"eduxfac_data_mode":"PILOTO","purpose":"FASE12B_PILOTO_LIMPIO"})+"';")
 sql("REVOKE CREATE ON SCHEMA public FROM PUBLIC;",database)
hosts=pathlib.Path("/etc/hosts")
names={"vmi3635195.contaboserver.net","app.eduxfac.com","admin.eduxfac.com"}
lines=[]
for line in hosts.read_text().splitlines():
 stripped=line.strip()
 if not stripped or stripped.startswith("#"):lines.append(line);continue
 body,_,comment=line.partition("#");parts=body.split()
 if len(parts)>=2:
  aliases=[a for a in parts[1:] if a.lower() not in names]
  if aliases:lines.append(parts[0]+" "+" ".join(aliases)+(" #"+comment if comment else ""))
 else:lines.append(line)
lines+=["# EDUXFAC FASE12B: resolución INTERNA para TLS; DNS público permanece igual.","127.0.0.1 vmi3635195.contaboserver.net app.eduxfac.com admin.eduxfac.com"]
hosts.write_text("\n".join(lines)+"\n")
result={"phase":"12B","utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"databases_created":["eduxfac_panel_piloto","eduxfac_web_piloto"],"roles_created":list(roles),"old_database_eduxfac_untouched":True,"old_role_eduxfac_untouched":True,"no_existing_data_imported":True,"backup":backups,"local_hosts_updated":True,"public_DNS_changed":False,"postgres_service_restarted":False,"postgres_certificates_changed":False,"password_values_excluded":True}
done.write_text(json.dumps(result,indent=2));os.chmod(done,0o600);os.chown(done,1001,1001)
print(json.dumps(result))
