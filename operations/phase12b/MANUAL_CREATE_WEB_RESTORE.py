#!/usr/bin/python3
"""FASE12B manual. Crea SOLO una base vacía nueva para el restore del WEB.
No importa datos; no crea roles; no toca eduxfac ni bases PILOTO existentes.
Sin DROP, contraseñas, Nginx, certificados o reinicios.
"""
import os,sys,json,subprocess,pathlib
TARGET="eduxfac_web_f12b_restore_20261013_0625"
OWNER="eduxfac_web_migrator"
OUT=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/WEB_RESTORE_DB_CREATED.json")
def sql(statement):
    result=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql","-X","-qAt","-v","ON_ERROR_STOP=1","-d","postgres","-c",statement],capture_output=True,text=True,timeout=30)
    if result.returncode:raise RuntimeError("POSTGRES_MANUAL_COMMAND_FAILED")
    return result.stdout.strip()
def inspect(name):
    value=sql("BEGIN READ ONLY; SELECT json_build_object('database',datname,'oid',oid,'owner',pg_get_userbyid(datdba),'template',datistemplate,'allow_connections',datallowconn) FROM pg_database WHERE datname='"+name+"'; ROLLBACK;")
    return json.loads(value) if value else None
def main():
    if os.geteuid()!=0:raise RuntimeError("EJECUCION_MANUAL_SUDO_REQUERIDA")
    if sys.argv[1:]!=["--apply"]:raise RuntimeError("USE_EXACTAMENTE_--apply")
    if OUT.exists() or inspect(TARGET):raise RuntimeError("BASE_O_EVIDENCIA_YA_EXISTE_NO_REPETIR_NO_BORRAR")
    before=inspect("eduxfac")
    if before is None:raise RuntimeError("BASE_ANTIGUA_NO_ENCONTRADA_DETENER")
    roles=json.loads(sql("BEGIN READ ONLY; SELECT json_agg(json_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole)) FROM pg_roles WHERE rolname IN('eduxfac_web_migrator','eduxfac_web_app','eduxfac_web_auth','eduxfac_web_service','eduxfac_backup'); ROLLBACK;"))
    if len(roles)!=5 or any(r["super"] or r["bypass"] or r["createdb"] or r["createrole"] for r in roles):raise RuntimeError("ROLES_NO_COINCIDEN_DETENER")
    sql("CREATE DATABASE "+TARGET+" OWNER "+OWNER+" TEMPLATE template0")
    sql("REVOKE ALL ON DATABASE "+TARGET+" FROM PUBLIC; GRANT CONNECT ON DATABASE "+TARGET+" TO eduxfac_web_migrator,eduxfac_web_app,eduxfac_web_auth,eduxfac_web_service,eduxfac_backup; COMMENT ON DATABASE "+TARGET+""" IS '{"eduxfac_data_mode":"PILOTO","purpose":"FASE12B_RESTORE_AISLADO"}'""")
    after=inspect(TARGET)
    if before!=inspect("eduxfac") or after["owner"]!=OWNER:raise RuntimeError("VERIFICACION_METADATA_NO_COINCIDE")
    result={"created":True,"empty_for_restore":True,"database":TARGET,"owner":OWNER,"old_eduxfac_metadata_unchanged":True,"roles_created":False,"data_imported":False}
    fd=os.open(str(OUT),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as f:json.dump(result,f,indent=2)
    os.chown(OUT,1001,1001)
    print("WEB_RESTORE_DB_CREATED_OK")
try:main()
except Exception as e:
    print("DETENER: "+str(e));sys.exit(1)


