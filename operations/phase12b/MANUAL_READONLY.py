#!/usr/bin/env python3
"""FASE12B: inventario administrativo exclusivamente READ-ONLY; ejecutar manualmente."""
import os,json,subprocess,time,pathlib,hashlib,re,urllib.parse
if os.geteuid()!=0:
 raise SystemExit("Ejecutar manualmente con sudo; no enviar contrasena a Codex.")
def command(args,timeout=25):
 try:
  p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
  return p.returncode,p.stdout
 except Exception as e:return -1,""
def pg(sql,database="postgres"):
 env=dict(os.environ)
 env["PGOPTIONS"]="-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000"
 env["PGAPPNAME"]="EDUXFAC_F12B_MANUAL_READONLY"
 try:
  p=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql","-X","-qAt","-v","ON_ERROR_STOP=1","-d",database,"-c","BEGIN READ ONLY; "+sql+"; ROLLBACK;"],capture_output=True,text=True,env=env,timeout=30)
  if p.returncode:return {"unavailable":True,"rc":p.returncode}
  return json.loads(p.stdout.strip())
 except Exception as e:return {"unavailable":True,"type":type(e).__name__}
out={"phase":"12B","read_only":True,"utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"secret_values_excluded":True}
out["postgresql"]=pg("""SELECT json_build_object(
 'version',current_setting('server_version'),
 'listen_addresses',current_setting('listen_addresses'),
 'port',current_setting('port'),
 'ssl',current_setting('ssl'),
 'ssl_cert_file',current_setting('ssl_cert_file'),
 'ssl_ca_file',current_setting('ssl_ca_file'),
 'hba_file',current_setting('hba_file'),
 'roles',(SELECT json_agg(t) FROM (SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin,rolinherit FROM pg_roles ORDER BY rolname)t),
 'databases',(SELECT json_agg(t) FROM (SELECT datname,pg_get_userbyid(datdba) owner,datallowconn FROM pg_database ORDER BY datname)t),
 'hba',(SELECT json_agg(t) FROM (SELECT line_number,type,database,user_name,address,netmask,auth_method,(error IS NOT NULL) has_error FROM pg_hba_file_rules ORDER BY line_number)t))""")
target=None
try:
 raw=pathlib.Path("/var/www/eduxfac/.env").read_text()
 m=re.search(r"(?m)^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$",raw)
 value=m.group(1).strip().strip("'\"") if m else ""
 url=urllib.parse.urlsplit(value)
 db=urllib.parse.unquote(url.path.lstrip("/"))
 role=urllib.parse.unquote(url.username or "")
 if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",db):
  target=db
  out["web_target"]={"database":db,"role":role if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",role) else "REDACTED_INVALID_ROLE","host":url.hostname,"password_value_excluded":True}
except Exception:out["web_target"]={"unavailable":True}
if target:
 out["web_catalog"]=pg("""SELECT json_build_object(
 'database',current_database(),
 'tables',(SELECT json_agg(t) FROM (
 SELECT n.nspname schema,c.relname name,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
 (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) policies
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname)t),
 'migration_candidates',(SELECT json_agg(t) FROM (
 SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('web_schema_migrations','eduxfac_migraciones','schema_migrations') ORDER BY table_name,ordinal_position)t))""",target)
rc,ufw=command(["/usr/sbin/ufw","status","verbose"]);out["ufw"]={"rc":rc,"status":ufw.strip() if rc==0 else "UNAVAILABLE"}
rc,units=command(["/usr/bin/systemctl","show","pm2-eduxadmin.service","-p","User","-p","FragmentPath","-p","ActiveState","-p","UnitFileState"])
out["pm2_startup_metadata"]={"rc":rc,"out":units.strip() if rc==0 else "UNAVAILABLE"}
out["config_files"]=[]
for file in ["/etc/nginx/nginx.conf","/etc/nginx/sites-enabled/eduxfac","/etc/postgresql/16/main/postgresql.conf","/etc/postgresql/16/main/pg_hba.conf"]:
 try:
  p=pathlib.Path(file);st=p.stat()
  out["config_files"].append({"path":file,"bytes":st.st_size,"mode":oct(st.st_mode&0o777),"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
 except Exception:out["config_files"].append({"path":file,"unavailable":True})
out["backup_directory_metadata"]=[]
for directory in ["/var/backups","/var/backups/eduxfac","/var/backups/eduxfac-web","/var/backups/eduxfac-panel","/root"]:
 try:
  entries=[]
  for p in pathlib.Path(directory).iterdir():
   if re.search(r"edux|botica|backup|respaldo",p.name,re.I):
    st=p.stat();entries.append({"path":str(p),"directory":p.is_dir(),"bytes":st.st_size})
  out["backup_directory_metadata"].append({"path":directory,"entries":entries})
 except Exception:out["backup_directory_metadata"].append({"path":directory,"unavailable":True})
print(json.dumps(out,ensure_ascii=True))
