import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const digest=v=>createHash('sha256').update(v).digest('hex');
const ALL=['dashboard.read','clients.read','clients.write','web.companies.read','web.companies.write','web.plans.manage','web.subscriptions.manage','web.payments.manage','web.states.manage','integration.read','integration.retry','integration.reconcile','desktop.read','desktop.licenses.manage','desktop.activations.manage','recovery.read','recovery.authorize','history.read','settings.read','settings.manage','admin.users.manage','health.read'];
export const ROLE_PERMISSIONS=Object.freeze({
 SUPERADMIN:Object.freeze(ALL),
 ADMIN:Object.freeze(ALL.filter(p=>!['desktop.licenses.manage','desktop.activations.manage','admin.users.manage','settings.manage'].includes(p))),
 SOPORTE:Object.freeze(['dashboard.read','clients.read','web.companies.read','integration.read','desktop.read','recovery.read','recovery.authorize','history.read','settings.read','health.read']),
 LECTURA:Object.freeze(ALL.filter(p=>p.endsWith('.read')))
});
const fail=(status,code,message)=>Object.assign(Error(message),{status,code});
export function hashPanelPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function checkPanelPassword(password,encoded){try{const [salt,key]=encoded.split(':'),actual=scryptSync(password,salt,64),expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export function applyPanelRolesMigration(db,{seedLegacy=true}={}){
 db.exec('BEGIN IMMEDIATE');try{
 db.exec(readFileSync(new URL('../database/security-migrations/001_roles.sql',import.meta.url),'utf8'));
 if(seedLegacy&&!db.prepare('SELECT id FROM panel_admin_users LIMIT 1').get()){
 const a=db.prepare('SELECT * FROM admin WHERE id=1').get();
 if(a)db.prepare('INSERT INTO panel_admin_users(id,public_id,username,password_hash,role,enabled,auth_version,must_change_password) VALUES(1,?,?,?,\'SUPERADMIN\',1,1,0)').run(randomUUID(),a.username,a.password_hash);
 }
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function requiredPermission(method,path){
 if(path==='/api/logout'||path==='/api/admin/identity'||path==='/api/admin/profile/password')return null;
 if(path.startsWith('/api/admin/usuarios'))return 'admin.users.manage';
 if(path==='/api/admin/health')return 'health.read';
 if(path.startsWith('/api/admin/recovery/')&&method==='POST')return 'recovery.authorize';
 if(method==='GET'){
 if(path==='/api/overview'||path==='/api/admin/dashboard')return 'dashboard.read';
 if(path.includes('/clientes')||path.startsWith('/api/clients'))return 'clients.read';
 if(path==='/api/admin/configuracion')return 'settings.read';
 if(path.includes('/recuperacion'))return 'recovery.read';
 if(path.includes('historial')||path==='/api/license-events')return 'history.read';
 if(path.startsWith('/api/licenses')||path.startsWith('/api/installations')||path==='/api/admin/licencias'||path==='/api/admin/equipos'||path==='/api/admin/activaciones')return 'desktop.read';
 if(path.startsWith('/api/web/operacion'))return 'integration.read';
 if(path.startsWith('/api/web/')||['/api/admin/empresas','/api/admin/suscripciones','/api/admin/pagos'].includes(path))return 'web.companies.read';
 }
 if(method==='POST'){
 if(path==='/api/settings')return 'settings.manage';
 if(path.startsWith('/api/clients')||path==='/api/web/clientes')return 'clients.write';
 if(path.startsWith('/api/licenses'))return 'desktop.licenses.manage';
 if(path.startsWith('/api/installations'))return 'desktop.activations.manage';
 if(path.startsWith('/api/web/operacion')){
 if(path.endsWith('/health')||path.endsWith('/consultar'))return 'integration.read';
 return path.endsWith('/conciliar')?'integration.reconcile':'integration.retry';
 }
 if(path.startsWith('/api/web/estados'))return path.endsWith('/consultar')?'web.companies.read':'web.states.manage';
 if(path.startsWith('/api/web/comercial'))return path.endsWith('/uso')?'web.companies.read':'web.plans.manage';
 if(path.startsWith('/api/web/suscripciones'))return path.endsWith('/consultar')?'web.companies.read':path.endsWith('/pago')?'web.payments.manage':'web.subscriptions.manage';
 if(path.startsWith('/api/web/empresas'))return 'web.companies.write';
 }
 return '__DENY__';
}
export function createAdminAuth({db,transaction,environment=process.env}){
 const enabled=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='panel_admin_users'").get(),dummy=enabled?hashPanelPassword(randomBytes(32).toString('hex')):null;
 const production=environment.NODE_ENV==='production',ttl=Number(environment.PANEL_SESSION_TTL_MS??28800000);
 if(!Number.isSafeInteger(ttl)||ttl<900000||ttl>28800000)throw Error('Duración de sesión inválida.');
 const audit=(actor,target,action,result,reason)=>db.prepare('INSERT INTO panel_admin_events(actor_id,target_id,accion,resultado,motivo) VALUES(?,?,?,?,?)').run(actor||null,target||null,action,result,reason);
 const publicUser=u=>({id:u.id,public_id:u.public_id,username:u.username,role:u.role,enabled:!!u.enabled,auth_version:u.auth_version,must_change_password:!!u.must_change_password,created_at:u.created_at,updated_at:u.updated_at});
 const identity=u=>({...publicUser(u),permissions:u.must_change_password?[]:[...ROLE_PERMISSIONS[u.role]]});
 function authenticate(token){
 if(!enabled||!/^[a-f0-9]{64}$/.test(token))return null;
 const u=db.prepare('SELECT u.id,u.public_id,u.username,u.role,u.enabled,u.auth_version,u.must_change_password,u.created_at,u.updated_at FROM panel_admin_sessions s JOIN panel_admin_users u ON u.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND u.auth_version=s.auth_version AND u.enabled=1').get(digest(token),Date.now());
 return u?identity(u):null;
 }
 function authorize(principal,method,path){if(!enabled)return true;if(!principal)return false;const current=db.prepare('SELECT role,must_change_password FROM panel_admin_users WHERE id=? AND enabled=1 AND auth_version=?').get(principal.id,principal.auth_version);if(!current)return false;if(path==='/api/logout'||path==='/api/admin/identity'||path==='/api/admin/profile/password')return true;return !current.must_change_password&&ROLE_PERMISSIONS[current.role].includes(requiredPermission(method,path));}
 function cookie(token,maxAge=Math.floor(ttl/1000)){return 'panel_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge+(production?'; Secure':'');}
 function publicLogin(path,body={},address='loopback'){
 try{
 const username=typeof body.username==='string'?body.username.trim():'',password=typeof body.password==='string'?body.password:'';
 if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username)||password.length>256)throw fail(400,'AUTH_INPUT_INVALID','Datos de acceso inválidos.');
 if(path==='/api/setup'){
 if(production)throw fail(403,'SETUP_OFFLINE_ONLY','El administrador inicial debe prepararse mediante el procedimiento autorizado.');
 if(password.length<12)throw fail(400,'PASSWORD_WEAK','Usa al menos 12 caracteres.');
 const hash=hashPanelPassword(password);
 const u=transaction(()=>{if(db.prepare('SELECT id FROM panel_admin_users LIMIT 1').get())throw fail(409,'SETUP_EXISTS','El administrador ya existe.');
 db.prepare('INSERT INTO admin(id,username,password_hash) VALUES(1,?,?)').run(username,hash);
 const r=db.prepare("INSERT INTO panel_admin_users(public_id,username,password_hash,role) VALUES(?,?,?,'SUPERADMIN')").run(randomUUID(),username,hash);audit(r.lastInsertRowid,r.lastInsertRowid,'ADMIN_CREADO','OK','Configuración inicial aislada.');return r;});
 return {status:201,data:{ok:true,id:u.lastInsertRowid}};
 }
 const bucket=digest(username.toLowerCase()+'|'+address),ipBucket=digest('ip|'+address),now=Date.now();db.prepare('DELETE FROM panel_auth_attempts WHERE attempted_at<?').run(now-900000);
 if(db.prepare('SELECT count(*) n FROM panel_auth_attempts WHERE bucket=?').get(bucket).n>=10||db.prepare('SELECT count(*) n FROM panel_auth_attempts WHERE bucket=?').get(ipBucket).n>=50)throw fail(429,'LOGIN_RATE_LIMIT','Demasiados intentos. Espera 15 minutos.');
 const u=db.prepare('SELECT * FROM panel_admin_users WHERE username=?').get(username);
 const matches=checkPanelPassword(password,u?.password_hash||dummy);
 if(!u||!u.enabled||!matches){db.prepare('INSERT INTO panel_auth_attempts(bucket,attempted_at) VALUES(?,?)').run(bucket,now);db.prepare('INSERT INTO panel_auth_attempts(bucket,attempted_at) VALUES(?,?)').run(ipBucket,now);throw fail(401,'AUTH_DENIED','Usuario o contraseña incorrectos.');}
 const token=randomBytes(32).toString('hex');
 transaction(()=>{db.prepare('DELETE FROM panel_auth_attempts WHERE bucket=?').run(bucket);db.prepare('DELETE FROM panel_admin_sessions WHERE expires_at<?').run(now);db.prepare('INSERT INTO panel_admin_sessions(token_hash,admin_id,auth_version,expires_at) VALUES(?,?,?,?)').run(digest(token),u.id,u.auth_version,now+ttl);audit(u.id,u.id,'INICIO_SESION','OK','Acceso administrativo.');});
 return {status:200,data:{ok:true,identity:identity(u)},cookie:cookie(token)};
 }catch(e){return {status:e.status||500,data:{error:e.status?e.message:'No se pudo completar el acceso.',code:e.code||'AUTH_ERROR'}};}
 }
 function handle(principal,method,path,body={},token=''){
 try{
 if(path==='/api/admin/identity'&&method==='GET')return {status:200,data:principal};
 if(path==='/api/logout'&&method==='POST'){transaction(()=>{db.prepare('DELETE FROM panel_admin_sessions WHERE token_hash=?').run(digest(token));audit(principal.id,principal.id,'CIERRE_SESION','OK','Cierre de sesión.');});return {status:200,data:{ok:true},cookie:cookie('',0)};}
 if(path==='/api/admin/profile/password'&&method==='POST'){
 if(Object.keys(body).some(k=>!['current_password','new_password'].includes(k))||typeof body.current_password!=='string'||typeof body.new_password!=='string'||body.new_password.length<12||body.new_password.length>256)throw fail(400,'PASSWORD_INPUT','Contraseña actual y nueva de al menos 12 caracteres requeridas.');
 const hashed=hashPanelPassword(body.new_password);
 transaction(()=>{const u=db.prepare('SELECT * FROM panel_admin_users WHERE id=?').get(principal.id);if(!checkPanelPassword(body.current_password,u.password_hash))throw fail(403,'PASSWORD_CONFIRMATION','No se confirmó la contraseña actual.');
 db.prepare('UPDATE panel_admin_users SET password_hash=?,must_change_password=0,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hashed,u.id);db.prepare('DELETE FROM panel_admin_sessions WHERE admin_id=?').run(u.id);audit(u.id,u.id,'PASSWORD_CAMBIADO','OK','Cambio confirmado; sesiones invalidadas.');});
 return {status:200,data:{ok:true,relogin:true},cookie:cookie('',0)};
 }
 if(path.startsWith('/api/admin/usuarios')){
 if(!authorize(principal,method,path))throw fail(403,'PERMISSION_DENIED','No tienes permiso para esta acción.');
 if(method==='GET'&&path==='/api/admin/usuarios')return {status:200,data:{rows:db.prepare('SELECT id,public_id,username,role,enabled,auth_version,must_change_password,created_at,updated_at FROM panel_admin_users ORDER BY id LIMIT 100').all().map(publicUser)}};
 if(method==='POST'&&path==='/api/admin/usuarios'){
 if(Object.keys(body).some(k=>!['username','password','role','motivo'].includes(k))||!/^[a-zA-Z0-9._-]{3,40}$/.test(body.username||'')||typeof body.password!=='string'||body.password.length<12||body.password.length>256||!ROLE_PERMISSIONS[body.role]||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'USER_INPUT','Usuario, rol, contraseña segura y motivo requeridos.');
 const hashed=hashPanelPassword(body.password);
 const id=transaction(()=>{if(!authorize(principal,method,path))throw fail(403,'PERMISSION_DENIED','No tienes permiso vigente para esta acción.');const r=db.prepare('INSERT INTO panel_admin_users(public_id,username,password_hash,role,must_change_password) VALUES(?,?,?,?,1)').run(randomUUID(),body.username,hashed,body.role);audit(principal.id,r.lastInsertRowid,'USUARIO_CREADO','OK',body.motivo.trim());return r.lastInsertRowid;});
 return {status:201,data:{id,requires_password_change:true}};
 }
 const m=path.match(/^\/api\/admin\/usuarios\/([1-9]\d*)\/(editar|reset)$/);
 if(m&&method==='POST'){
 if(Object.keys(body).some(k=>!(m[2]==='reset'?['password','motivo']:['username','role','enabled','motivo']).includes(k))||typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>500)throw fail(400,'USER_INPUT','Motivo requerido.');
 if(m[2]==='reset'&&(typeof body.password!=='string'||body.password.length<12||body.password.length>256))throw fail(400,'PASSWORD_WEAK','Contraseña temporal de al menos 12 caracteres requerida.');
 const resetHash=m[2]==='reset'?hashPanelPassword(body.password):null;
 transaction(()=>{if(!authorize(principal,method,path))throw fail(403,'PERMISSION_DENIED','No tienes permiso vigente para esta acción.');const u=db.prepare('SELECT * FROM panel_admin_users WHERE id=?').get(Number(m[1]));if(!u)throw fail(404,'USER_NOT_FOUND','Usuario no encontrado.');
 if(m[2]==='reset'){db.prepare('UPDATE panel_admin_users SET password_hash=?,must_change_password=1,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(resetHash,u.id);}
 else{
 const role=body.role??u.role,active=body.enabled??!!u.enabled,username=body.username??u.username;
 if(!ROLE_PERMISSIONS[role]||typeof active!=='boolean'||!/^[a-zA-Z0-9._-]{3,40}$/.test(username))throw fail(400,'USER_INPUT','Datos de usuario inválidos.');
 if(u.role==='SUPERADMIN'&&u.enabled&&(role!=='SUPERADMIN'||!active)&&db.prepare("SELECT count(*) n FROM panel_admin_users WHERE role='SUPERADMIN' AND enabled=1").get().n<=1)throw fail(409,'LAST_SUPERADMIN','Debe permanecer al menos un SUPERADMIN activo.');
 db.prepare('UPDATE panel_admin_users SET username=?,role=?,enabled=?,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(username,role,active?1:0,u.id);
 }
 db.prepare('DELETE FROM panel_admin_sessions WHERE admin_id=?').run(u.id);audit(principal.id,u.id,m[2]==='reset'?'RESET_ADMINISTRATIVO':'USUARIO_EDITADO','OK',m[2]==='reset'?'Reset autorizado; cambio obligatorio y sesiones invalidadas.':body.motivo.trim());});
 return {status:200,data:{ok:true,sessions_invalidated:true}};
 }
 return {status:405,data:{error:'Operación no disponible; los usuarios no se eliminan físicamente.'}};
 }
 return null;
 }catch(e){return {status:e.status||409,data:{error:e.status?e.message:'No se pudo completar la gestión administrativa.',code:e.code||'USER_ERROR'}};}
 }
 return {enabled,authenticate,authorize,publicLogin,handle,cookie,identity,audit};
}
