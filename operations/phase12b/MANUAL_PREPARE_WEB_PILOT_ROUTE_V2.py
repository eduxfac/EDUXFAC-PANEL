#!/usr/bin/python3
"""FASE12B V2 PREPARED ONLY, NOT EXECUTED. Fresh stable HTTPS probes after reload.
Preserves V1 journal/logs/inactive candidate. MANUAL ONLY: switch ONLY app.eduxfac.com to the isolated WEB PILOTO.
The old WEB at eduxfac.com and its code/database/PM2 remain unchanged.
No new certificates, DNS, firewall, PostgreSQL or PM2 modifications.
Reuse the verified preexisting backup. nginx -t before any reload.
On failure after config writes, restore the previous routing; preserve all files.
Never rerun after a partial attempt; inspect journal first.
"""
import os,sys,json,pathlib,hashlib,subprocess,ssl,http.client,datetime,time
OPS=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625")
BASE=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/backups/FASE12B_20261013_0625")
OLD=pathlib.Path("/etc/nginx/sites-available/eduxfac")
SITE=pathlib.Path("/etc/nginx/sites-available/eduxfac-web-piloto")
LINK=pathlib.Path("/etc/nginx/sites-enabled/eduxfac-web-piloto")
ADMIN=pathlib.Path("/etc/nginx/sites-available/eduxfac-admin-piloto")
OUT=OPS/"WEB_PILOT_ROUTE_V2.json"
PREVIOUS=OPS/"WEB_PILOT_ROUTE_PREPARED.json"
EXPECTED_OLD="770a7c8632f5c11e0b3ee8d98db42346f9c1948df753a36e14f672a3fa4b3c0f"
EXPECTED_MAIN="48c6a4ec1e1fd28ccf968490f07e34a1d7f755793b2108a3ed8670b1ee2a0aa2"
WEB="server {\n    listen 80;\n    server_name app.eduxfac.com;\n    location ^~ /.well-known/acme-challenge/ {\n        root /var/lib/eduxfac-acme;\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 308 https://app.eduxfac.com$request_uri; }\n}\nserver {\n    listen 443 ssl;\n    server_name app.eduxfac.com;\n    ssl_certificate /etc/letsencrypt/live/eduxfac.com/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/eduxfac.com/privkey.pem;\n    include /etc/letsencrypt/options-ssl-nginx.conf;\n    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;\n    client_max_body_size 30m;\n    location ^~ /api/internal/admin/v1 {\n        allow 127.0.0.1;\n        allow ::1;\n        deny all;\n        proxy_pass http://127.0.0.1:3001;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 30s;\n    }\n    location / {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 30s;\n    }\n}\n"
STATE={"phase":"12B","scope":"APP_DOMAIN_ONLY_V2","steps":[],"old_database_modified":False,
       "pm2_modified":False,"certificates_modified":False,"dns_modified":False}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def journal():
    tmp=OPS/"WEB_PILOT_ROUTE_V2.tmp"
    fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as f:json.dump(STATE,f,indent=2)
    os.chown(tmp,1001,1001);os.replace(tmp,OUT)
def step(s):STATE["steps"].append(s);journal()
def run(args,label):
    r=subprocess.run(args,capture_output=True,text=True,timeout=30)
    fd=os.open(str(OPS/("WEB_ROUTE_V2_"+label+".PRIVATE.log")),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as f:f.write(r.stdout+r.stderr)
    os.chown(OPS/("WEB_ROUTE_V2_"+label+".PRIVATE.log"),1001,1001)
    if r.returncode:raise RuntimeError(label+"_FAILED_RC_"+str(r.returncode))
def request(domain,path="/",source=None):
    c=http.client.HTTPSConnection(domain,443,timeout=15,context=ssl.create_default_context(),source_address=source)
    c.request("GET",path,headers={"Connection":"close"});r=c.getresponse();b=r.read();s=r.status;c.close();return s,b
def wait_health(pilot, timeout=20):
    """Fresh TLS connections; record only status/known flags, never raw bodies.
    A completed reload command only confirms signaling, not upstream readiness.
    Require two consecutive expected responses before accepting the routing."""
    deadline=time.monotonic()+timeout
    consecutive=0
    attempts=[]
    key="pilot_https_readiness" if pilot else "rollback_https_readiness"
    while time.monotonic()<deadline:
        item={"elapsed_seconds":round(timeout-(deadline-time.monotonic()),3)}
        try:
            status,body=request("app.eduxfac.com","/api/health")
            try:health=json.loads(body)
            except (ValueError,TypeError):health={}
            if not isinstance(health,dict):health={}
            mode=health.get("data_mode")
            item.update(status=status,ok=health.get("ok") is True,
                        database=health.get("database") is True,
                        data_mode=mode if mode in ["PILOTO","DEMO","PRODUCCION",None] else "OTHER",
                        data_mode_present="data_mode" in health)
            expected=(mode=="PILOTO") if pilot else ("data_mode" not in health)
            ready=status==200 and item["ok"] and item["database"] and expected
        except ssl.SSLError:
            item.update(error="TLS_ERROR",ready=False);attempts.append(item)
            STATE[key]=attempts;journal()
            raise RuntimeError("TLS_VALIDATION_FAILED_STOP")
        except (OSError,http.client.HTTPException):
            item.update(error="TRANSPORT_ERROR");ready=False
        item["ready"]=ready;attempts.append(item)
        STATE[key]=attempts;journal()
        consecutive=consecutive+1 if ready else 0
        if consecutive>=2:return
        time.sleep(min(0.5,max(0,deadline-time.monotonic())))
    raise RuntimeError("HTTPS_APP_PILOTO_NOT_READY_AFTER_WAIT" if pilot else "ROLLBACK_OLD_WEB_NOT_READY_AFTER_WAIT")

def local(port,path,domain):
    c=http.client.HTTPConnection("127.0.0.1",port,timeout=10);c.request("GET",path,headers={"Host":domain})
    r=c.getresponse();b=r.read();s=r.status;c.close();return s,json.loads(b)
def identity(pid=988):
    p=pathlib.Path("/proc")/str(pid)
    return {"pid":pid,"exe":os.readlink(p/"exe"),"start_ticks":(p/"stat").read_text().split(") ",1)[1].split()[19]}
def main():
    if os.geteuid()!=0 or sys.argv[1:]!=["--apply"]:raise RuntimeError("MANUAL_SUDO_--apply_REQUIRED")
    if OUT.exists() or LINK.exists() or LINK.is_symlink():raise RuntimeError("V2_ATTEMPT_OR_ACTIVE_LINK_EXISTS_STOP")
    prior=json.loads(PREVIOUS.read_text())
    if prior.get("status")!="ROLLED_BACK_STOP" or prior.get("error")!="RuntimeError:HTTPS_APP_PILOTO_NOT_OK":raise RuntimeError("PREVIOUS_ATTEMPT_NOT_EXPECTED_REVIEW")
    if not SITE.is_file() or digest(SITE)!="292a0bc8365d3d2e1fbdf9e03e1f84f83fee3945420bcd4b255baa6bf917f9db":raise RuntimeError("PRESERVED_CANDIDATE_DRIFT_STOP")
    preserved=OPS/"WEB_ROUTE_FAILED_LINK_PRESERVED"
    if not preserved.is_symlink() or preserved.resolve()!=SITE:raise RuntimeError("PREVIOUS_FAILED_LINK_NOT_PRESERVED")
    if digest(ADMIN)!=prior.get("admin_vhost_sha256") or identity()!=prior.get("previous_pm2_identity"):raise RuntimeError("ADMIN_OR_OLD_WEB_IDENTITY_DRIFT_STOP")
    if OLD.resolve()!=pathlib.Path("/etc/nginx/sites-enabled/eduxfac").resolve():raise RuntimeError("OLD_SITE_LINK_DIFFERS_STOP")
    if digest(OLD)!=EXPECTED_OLD or digest(BASE/"NGINX_WEB_PRIVATE.conf")!=EXPECTED_OLD:raise RuntimeError("OLD_VHOST_OR_BACKUP_DRIFT_STOP")
    if digest(pathlib.Path("/etc/nginx/nginx.conf"))!=EXPECTED_MAIN or digest(BASE/"NGINX_MAIN_PRIVATE.conf")!=EXPECTED_MAIN:raise RuntimeError("MAIN_NGINX_DRIFT_STOP")
    if json.loads((OPS/"ADMIN_TLS_PREPARED.json").read_text()).get("status")!="ADMIN_TLS_OK":raise RuntimeError("ADMIN_TLS_NOT_READY")
    for n,minpass in [("WEB_PILOTO_SCHEMA_APLICADO.json",9),("INTEGRACION_SMOKE_AB_PILOTO.json",62),
                       ("RESTORE_PANEL_CLONE_VALIDADO.json",13),("RESTORE_WEB_PILOTO_VALIDADO.json",13)]:
        d=json.loads((OPS/n).read_text())
        if d.get("failed")!=0 or d.get("passed",0)<minpass:raise RuntimeError("PILOT_EVIDENCE_NOT_READY_"+n)
    oldBytes=OLD.read_bytes();oldText=oldBytes.decode()
    needle="server_name eduxfac.com app.eduxfac.com;"
    if oldText.count(needle)!=2:raise RuntimeError("EXPECTED_TWO_OLD_NAMES_NOT_FOUND_STOP")
    updated=oldText.replace(needle,"server_name eduxfac.com;")
    oldIdentity=identity();adminHash=digest(ADMIN)
    cert=pathlib.Path("/etc/letsencrypt/live/eduxfac.com/fullchain.pem")
    adminCert=pathlib.Path("/etc/letsencrypt/live/admin.eduxfac.com/fullchain.pem")
    certHash=digest(cert);adminCertHash=digest(adminCert)
    if certHash!=json.loads((OPS/"ADMIN_TLS_PREPARED.json").read_text())["old_web_cert_hash"]:raise RuntimeError("OLD_WEB_CERT_DRIFT_STOP")
    status,body=local(3001,"/api/health","app.eduxfac.com")
    if status!=200 or not body.get("ok") or not body.get("database") or body.get("data_mode")!="PILOTO":raise RuntimeError("WEB_PILOTO_HEALTH_NOT_READY")
    status,body=local(4310,"/api/environment","admin.eduxfac.com")
    if status!=200 or body.get("mode")!="PILOTO":raise RuntimeError("PANEL_PILOTO_NOT_READY")
    for domain in ["admin.eduxfac.com","app.eduxfac.com","eduxfac.com"]:
        if request(domain)[0]!=200:raise RuntimeError("EXISTING_DOMAIN_NOT_OK_STOP")
    rootBefore=hashlib.sha256(request("eduxfac.com")[1]).hexdigest()
    run(["/usr/sbin/nginx","-t"],"BEFORE_TEST")
    STATE.update(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 existing_backup_verified=True,old_vhost_sha256=EXPECTED_OLD,
                 previous_pm2_identity=oldIdentity,admin_vhost_sha256=adminHash)
    step("READONLY_GUARDS_OK")
    try:
        # Reuse the preserved, hash-verified candidate; never overwrite it.
        if SITE.read_text()!=WEB:raise RuntimeError("CANDIDATE_TEXT_DRIFT_STOP")
        OLD.write_text(updated);OLD.chmod(0o644)
        os.symlink(str(SITE),str(LINK))
        step("APP_ROUTE_ONLY_CONFIG_WRITTEN")
        run(["/usr/sbin/nginx","-t"],"CANDIDATE_TEST");step("CANDIDATE_NGINX_TEST_OK")
        run(["/usr/bin/systemctl","reload","nginx"],"PILOT_RELOAD");step("GRACEFUL_RELOAD_DONE")
        wait_health(True);step("HTTPS_PILOTO_TWO_STABLE_RESPONSES_OK")
        if request("app.eduxfac.com","/api/internal/admin/v1/health",("127.0.0.1",0))[0]!=401:raise RuntimeError("INTERNAL_LOOPBACK_AUTH_GUARD_NOT_OK")
        if request("app.eduxfac.com","/api/internal/admin/v1/health",("127.0.0.2",0))[0]!=403:raise RuntimeError("INTERNAL_PEER_DENY_NOT_OK")
        if request("admin.eduxfac.com")[0]!=200 or request("eduxfac.com")[0]!=200:raise RuntimeError("OTHER_HTTPS_DOMAIN_NOT_OK")
        if hashlib.sha256(request("eduxfac.com")[1]).hexdigest()!=rootBefore:raise RuntimeError("ROOT_FRONTEND_CHANGED")
        if digest(ADMIN)!=adminHash or digest(cert)!=certHash or digest(adminCert)!=adminCertHash:raise RuntimeError("PROTECTED_CONFIG_OR_CERT_CHANGED")
        if identity()!=oldIdentity:raise RuntimeError("OLD_PM2_IDENTITY_CHANGED")
        STATE.update(status="WEB_PILOT_ROUTE_V2_OK",https_app_data_mode="PILOTO",internal_local_status=401,
                     internal_other_peer_status=403,root_site_preserved=True,admin_preserved=True,
                     web_vhost_sha256=digest(SITE),old_vhost_new_sha256=digest(OLD))
        step("HTTPS_THREE_DOMAINS_AND_INTERNAL_ACL_OK")
        print("WEB_PILOT_ROUTE_V2_OK")
    except Exception:
        # Restore only original routing, preserving failed site/link for review.
        OLD.write_bytes(oldBytes)
        if LINK.is_symlink():os.rename(LINK,OPS/"WEB_ROUTE_V2_FAILED_LINK_PRESERVED")
        step("PREVIOUS_ROUTING_RESTORED_ON_DISK")
        run(["/usr/sbin/nginx","-t"],"ROLLBACK_TEST")
        run(["/usr/bin/systemctl","reload","nginx"],"ROLLBACK_RELOAD")
        wait_health(False);step("ROLLBACK_OLD_WEB_TWO_STABLE_RESPONSES_OK")
        STATE["status"]="ROLLED_BACK_STOP";journal()
        raise
if __name__=="__main__":
    try:main()
    except Exception as e:
        STATE["error"]=type(e).__name__+":"+str(e);STATE.setdefault("status","DETENER")
        # Never overwrite evidence of an earlier V2 attempt on accidental rerun.
        if not OUT.exists() or "READONLY_GUARDS_OK" in STATE["steps"]:journal()
        print("DETENER "+STATE["error"]);sys.exit(1)
