#!/usr/bin/python3
"""MANUAL ONLY: revert app routing to the preserved old WEB, without DB/cert/PM2 changes.
Not executed during FASE12B closure. Preserve all configs, logs and databases."""
import pathlib,os,sys,json,hashlib,subprocess,ssl,http.client,time
OPS=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625")
OLD=pathlib.Path("/etc/nginx/sites-available/eduxfac")
LINK=pathlib.Path("/etc/nginx/sites-enabled/eduxfac-web-piloto")
BASE=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/backups/FASE12B_20261013_0625")
OUT=OPS/"MANUAL_ROLLBACK_WEB_V2_RESULT.json"
state={"scope":"MANUAL_ROLLBACK_APP_ONLY","steps":[],"database_changed":False,"certificates_changed":False,"pm2_changed":False}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save():
 p=OPS/"MANUAL_ROLLBACK_WEB_V2.tmp"
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,"w") as f:json.dump(state,f,indent=2)
 os.chown(p,1001,1001);os.replace(p,OUT)
def run(args,label):
 r=subprocess.run(args,capture_output=True,text=True,timeout=30)
 p=OPS/("MANUAL_ROLLBACK_V2_"+label+".PRIVATE.log")
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,"w") as f:f.write(r.stdout+r.stderr)
 os.chown(p,1001,1001)
 if r.returncode:raise RuntimeError(label+"_FAILED")
def main():
 if os.geteuid()!=0 or sys.argv[1:]!=["--apply"]:raise RuntimeError("MANUAL_SUDO_REQUIRED")
 if OUT.exists():raise RuntimeError("PREVIOUS_ROLLBACK_EXISTS_DO_NOT_REPEAT")
 if json.loads((OPS/"WEB_PILOT_ROUTE_V2.json").read_text())["status"]!="WEB_PILOT_ROUTE_V2_OK":raise RuntimeError("V2_STATE_UNEXPECTED")
 if sha(OLD)!="1a6c09cc234df1996d03277dadeaa0f80140f839643a2ee77d60bb059675817a":raise RuntimeError("ACTIVE_CONFIG_DRIFT_STOP")
 original=BASE/"NGINX_WEB_PRIVATE.conf"
 if sha(original)!="770a7c8632f5c11e0b3ee8d98db42346f9c1948df753a36e14f672a3fa4b3c0f":raise RuntimeError("BACKUP_DRIFT_STOP")
 if not LINK.is_symlink() or sha(LINK)!="292a0bc8365d3d2e1fbdf9e03e1f84f83fee3945420bcd4b255baa6bf917f9db":raise RuntimeError("CANDIDATE_DRIFT_STOP")
 if sha(pathlib.Path("/etc/nginx/sites-available/eduxfac-admin-piloto"))!="e31f7c782ee5a9edf6d1affeb27f62fb9ca8e597add045b6c9fb42dc0eb02a00":raise RuntimeError("ADMIN_DRIFT_STOP")
 preserved=OPS/"WEB_V2_ROLLBACK_LINK_PRESERVED"
 if preserved.exists() or preserved.is_symlink():raise RuntimeError("PREVIOUS_ROLLBACK_LINK_EXISTS")
 run(["/usr/sbin/nginx","-t"],"BEFORE_TEST")
 OLD.write_bytes(original.read_bytes());os.rename(LINK,preserved)
 state["steps"].append("ORIGINAL_ROUTING_ON_DISK");save()
 run(["/usr/sbin/nginx","-t"],"ORIGINAL_TEST")
 run(["/usr/bin/systemctl","reload","nginx"],"ORIGINAL_RELOAD")
 deadline=time.monotonic()+20;stable=0;state["health"]=[]
 while time.monotonic()<deadline:
  c=http.client.HTTPSConnection("app.eduxfac.com",context=ssl.create_default_context(),timeout=5)
  try:
   c.request("GET","/api/health",headers={"Connection":"close"});r=c.getresponse();d=json.loads(r.read())
   ok=r.status==200 and d.get("ok") is True and d.get("database") is True and "data_mode" not in d
   state["health"].append({"status":r.status,"old_web":ok});save()
  finally:c.close()
  stable=stable+1 if ok else 0
  if stable>=2:
   state["status"]="MANUAL_ROLLBACK_WEB_V2_OK";save();print(state["status"]);return
  time.sleep(0.5)
 raise RuntimeError("OLD_HTTPS_NOT_STABLE_STOP")
if __name__=="__main__":
 try:main()
 except Exception as e:
  if not OUT.exists() or state["steps"]:
   state["status"]="DETENER";state["error"]=type(e).__name__+":"+str(e);save()
  print("DETENER "+type(e).__name__);sys.exit(1)
