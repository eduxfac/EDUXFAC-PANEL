#!/usr/bin/python3
"""MANUAL FASE12B ADMIN ONLY. Inspect+reuse verified backups first.
Adds ONLY admin vhost, requests ONLY admin cert with existing Certbot/account,
nginx -t before each reload, preserves app/root vhost+certificate.
No PG, UFW, DNS, role/database creation or WEB PM2 restart.
No retries after partial failure; journal records completed steps."""
import os,sys,json,pathlib,subprocess,hashlib,ssl,http.client,datetime
OPS=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625")
OUT=OPS/"ADMIN_TLS_PREPARED.json"
SITE=pathlib.Path("/etc/nginx/sites-available/eduxfac-admin-piloto")
LINK=pathlib.Path("/etc/nginx/sites-enabled/eduxfac-admin-piloto")
HOOK=pathlib.Path("/etc/letsencrypt/renewal-hooks/deploy/70-eduxfac-admin-nginx")
BASE=pathlib.Path("/home/eduxadmin/.local/share/eduxfac/backups/FASE12B_20261013_0625")
OLD=pathlib.Path("/etc/nginx/sites-enabled/eduxfac")
STATE={"phase":"12B","scope":"ADMIN_ONLY","steps":[],"old_web_changed":False,"old_eduxfac_modified":False}
HTTP="server {\n    listen 80;\n    server_name admin.eduxfac.com;\n    location ^~ /.well-known/acme-challenge/ {\n        root /var/lib/eduxfac-acme;\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 503; }\n}\n"
TLS="server {\n    listen 80;\n    server_name admin.eduxfac.com;\n    location ^~ /.well-known/acme-challenge/ {\n        root /var/lib/eduxfac-acme;\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 308 https://admin.eduxfac.com$request_uri; }\n}\nserver {\n    listen 443 ssl;\n    server_name admin.eduxfac.com;\n    ssl_certificate /etc/letsencrypt/live/admin.eduxfac.com/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/admin.eduxfac.com/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    client_max_body_size 16k;\n    location / {\n        proxy_pass http://127.0.0.1:4310;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 30s;\n    }\n}\n"
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def journal():
    tmp=OPS/"ADMIN_TLS_PREPARED.tmp"
    fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as f:json.dump(STATE,f,indent=2)
    os.chown(tmp,1001,1001);os.replace(tmp,OUT)
def step(name):STATE["steps"].append(name);journal()
def run(args,label,timeout=30):
    r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    log=OPS/("ADMIN_ONLY_"+label+".PRIVATE.log")
    fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as f:f.write(r.stdout+r.stderr)
    os.chown(log,1001,1001)
    if r.returncode:raise RuntimeError(label+"_FAILED_RC_"+str(r.returncode))
    return r
def request(domain,path="/",tls=True):
    c=http.client.HTTPSConnection(domain,443,timeout=15,context=ssl.create_default_context()) if tls else http.client.HTTPConnection(domain,80,timeout=15)
    c.request("GET",path);r=c.getresponse();body=r.read();status=r.status;c.close();return status,body
def test_reload(label):
    run(["/usr/sbin/nginx","-t"],label+"_TEST")
    run(["/usr/bin/systemctl","reload","nginx"],label+"_RELOAD")
def main():
    if os.geteuid()!=0 or sys.argv[1:]!=["--apply"]:raise RuntimeError("MANUAL_SUDO_--apply_REQUIRED")
    if OUT.exists() or SITE.exists() or LINK.exists() or LINK.is_symlink() or HOOK.exists():raise RuntimeError("ADMIN_PREPARATION_EXISTS_DO_NOT_REPEAT")
    if pathlib.Path("/etc/letsencrypt/live/admin.eduxfac.com").exists():raise RuntimeError("ADMIN_CERT_ALREADY_EXISTS_REVIEW_FIRST")
    if digest(OLD)!=digest(BASE/"NGINX_WEB_PRIVATE.conf") or digest(pathlib.Path("/etc/nginx/nginx.conf"))!=digest(BASE/"NGINX_MAIN_PRIVATE.conf"):raise RuntimeError("NGINX_DRIFT_STOP_BEFORE_CHANGE")
    accountRoot=pathlib.Path("/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory")
    accounts=[p.name for p in accountRoot.iterdir() if p.is_dir() and (p/"regr.json").exists()]
    if len(accounts)!=1:raise RuntimeError("CERTBOT_ACCOUNT_NOT_SINGLE_REVIEW")
    for folder in ["pre","post","deploy"]:
        root=pathlib.Path("/etc/letsencrypt/renewal-hooks")/folder
        if root.exists() and any(p.is_file() and os.access(p,os.X_OK) for p in root.iterdir()):raise RuntimeError("EXISTING_CERTBOT_HOOK_REQUIRES_REVIEW_"+folder.upper())
    cli=pathlib.Path("/etc/letsencrypt/cli.ini")
    if cli.exists():
        active=[s.split("#",1)[0].strip() for s in cli.read_text().splitlines()]
        if any(s and s.split("=",1)[0].strip() in ["pre-hook","post-hook","deploy-hook","renew-hook"] for s in active):raise RuntimeError("CERTBOT_GLOBAL_HOOK_REQUIRES_REVIEW")
    if pathlib.Path('/var/lib/eduxfac-acme').exists():raise RuntimeError('ACME_WEBROOT_EXISTS_REVIEW_FIRST')
    oldCert=pathlib.Path("/etc/letsencrypt/live/eduxfac.com/fullchain.pem");oldHash=digest(oldCert)
    for domain in ["eduxfac.com","app.eduxfac.com"]:
        if request(domain)[0]!=200:raise RuntimeError("EXISTING_HTTPS_NOT_OK_STOP")
    c=http.client.HTTPConnection("127.0.0.1",4310,timeout=10);c.request("GET","/api/environment",headers={"Host":"admin.eduxfac.com"});r=c.getresponse();data=json.loads(r.read());c.close()
    if r.status!=200 or data.get("mode")!="PILOTO":raise RuntimeError("PANEL_PILOTO_NOT_READY")
    run(["/usr/sbin/nginx","-t"],"INITIAL_TEST")
    STATE.update(existing_backup_verified=True,old_nginx_hash=digest(OLD),old_web_cert_hash=oldHash,account_reused=True,utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    step("READONLY_GUARDS_BACKUP_OK")
    os.umask(0o022) # Public ACME files; private journal/logs keep explicit0600.
    webroot=pathlib.Path("/var/lib/eduxfac-acme");webroot.mkdir(mode=0o755,exist_ok=True)
    challenge=webroot/".well-known/acme-challenge";challenge.mkdir(mode=0o755,parents=True,exist_ok=True)
    webroot.chmod(0o755);(webroot/'.well-known').chmod(0o755);challenge.chmod(0o755)
    SITE.write_text(HTTP);SITE.chmod(0o644);os.symlink(str(SITE),str(LINK))
    try:test_reload("ADMIN_HTTP")
    except Exception:
        os.rename(LINK,OPS/"ADMIN_LINK_FAILED_PRIVATE")
        run(["/usr/sbin/nginx","-t"],"RESTORED_INITIAL_TEST")
        raise
    step("ADMIN_HTTP_ACME_ONLY_READY")
    run(["/usr/bin/certbot","certonly","--webroot","--webroot-path",str(webroot),"--server","https://acme-v02.api.letsencrypt.org/directory","--account",accounts[0],"--non-interactive","--agree-tos","--cert-name","admin.eduxfac.com","-d","admin.eduxfac.com"],"CERTONLY_ADMIN",300)
    step("NEW_ADMIN_CERT_ISSUED")
    SITE.write_text(TLS);SITE.chmod(0o644)
    try:test_reload("ADMIN_TLS")
    except Exception:
        SITE.write_text(HTTP);run(["/usr/sbin/nginx","-t"],"RESTORED_HTTP_TEST")
        raise
    step("ADMIN_TLS_VHOST_READY")
    HOOK.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
    HOOK.write_text('#!/bin/sh\ncase " $RENEWED_DOMAINS " in\n  *" admin.eduxfac.com "*) /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx ;;\nesac\n')
    HOOK.chmod(0o755);step("ADMIN_RENEWAL_HOOK_ONLY_READY")
    run(["/usr/bin/certbot","renew","--cert-name","admin.eduxfac.com","--dry-run"],"ADMIN_RENEW_DRYRUN",300)
    step("ADMIN_RENEWAL_DRYRUN_OK")
    status,body=request("admin.eduxfac.com","/api/environment")
    if status!=200 or json.loads(body).get("mode")!="PILOTO":raise RuntimeError("ADMIN_HTTPS_PILOTO_CHECK_FAILED")
    if digest(OLD)!=STATE["old_nginx_hash"] or digest(oldCert)!=oldHash:raise RuntimeError("OLD_WEB_HASH_CHANGED_STOP")
    for domain in ["eduxfac.com","app.eduxfac.com"]:
        if request(domain)[0]!=200:raise RuntimeError("EXISTING_HTTPS_CHANGED_STOP")
    STATE.update(status="ADMIN_TLS_OK",admin_tls_valid=True,admin_http_https_redirect=True,renewal_dry_run=True,old_web_vhost_hash_unchanged=True,old_web_certificate_unchanged=True,old_web_pm2_not_touched=True,dns_changed=False,firewall_changed=False,postgres_changed=False)
    step("FINAL_HTTPS_ALL_HOSTS_OK")
    print("ADMIN_TLS_OK")
try:main()
except Exception as e:
    STATE.update(status="FAILED_NEEDS_REVIEW_NO_REPEAT",error=str(e))
    if STATE["steps"]:journal()
    print("DETENER: "+str(e));sys.exit(1)


