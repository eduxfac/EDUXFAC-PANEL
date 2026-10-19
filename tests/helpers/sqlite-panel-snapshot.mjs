import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {applyLicensingMigrations} from '../../server/licensing-service.mjs';
import {applyWebOnboardingMigrations} from '../../server/web-onboarding-service.mjs';
import {applyWebStateMigrations} from '../../server/web-company-states.mjs';
import {applyWebPlanMigrations} from '../../server/web-plans.mjs';
import {applyWebSubscriptionMigrations} from '../../server/web-subscriptions.mjs';
import {applyIntegrationMigrations} from '../../server/integration-queue.mjs';
import {applyAdminDashboardMigrations} from '../../server/admin-read-service.mjs';
import {hashPanelPassword} from '../../server/admin-auth.mjs';
export const F8_PASSWORD='FAKE_F8_SQLITE_PG_OWNER_PASSWORD_123';
export function createSnapshot(file){
 const db=new DatabaseSync(file);db.exec(readFileSync(new URL('../../database/schema.sql',import.meta.url),'utf8'));
 applyLicensingMigrations(db,fileURLToPath(new URL('../../database/migrations/',import.meta.url)));applyWebOnboardingMigrations(db);applyWebStateMigrations(db);applyWebPlanMigrations(db);applyWebSubscriptionMigrations(db);applyIntegrationMigrations(db);applyAdminDashboardMigrations(db);
 const insert=(t,r)=>{const keys=Object.keys(r);return db.prepare('INSERT INTO '+t+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(r));};
 insert('admin',{id:1,username:'owner_f8',password_hash:hashPanelPassword(F8_PASSWORD)});
 insert('sessions',{token_hash:createHash('sha256').update('f'.repeat(64)).digest('hex'),expires_at:Date.now()+3600000});
 for(let i=1;i<=2;i++){
 const id=randomUUID(),sub=randomUUID(),p=db.prepare('SELECT * FROM web_planes WHERE codigo=?').get(i===1?'BASICO':'EMPRESA');
 insert('clients',{id:i,name:'Cliente FICTICIO origen '+i,business_name:'Botica FICTICIA '+i,ruc:'2097000000'+i,public_id:randomUUID(),document_type:'RUC',document_number:'2097000000'+i,status:'ACTIVO'});
 insert('web_empresas',{id,cliente_id:i,empresa_web_id:randomUUID(),razon_social:'Empresa FICTICIA origen '+i,ruc:'2097000000'+i,empresa_codigo:'ORIGEN-F8-'+i,sucursal_nombre:'Principal ficticia',administrador_nombre:'Demo',administrador_usuario:'demo_'+i,estado:'ACTIVO',sync_status:'CONFIRMADO',estado_local:'ACTIVO',estado_web:'ACTIVO',web_auth_version:'1',commands_json:'{}'});
 insert('web_company_conditions',{empresa_id:id,plan_id:p.id,plan_codigo:p.codigo,precio_asignado_centavos:p.precio_centavos,moneda:'PEN',periodicidad:'MENSUAL',limite_sucursales_asignado:p.limite_sucursales,limite_usuarios_asignado:p.limite_usuarios,multisucursal:p.multisucursal,personalizada:0,version_condiciones:'1'});
 insert('web_subscriptions',{id:sub,empresa_id:id,plan_id:p.id,fecha_inicio:'2026-10-01T05:00:00Z',fecha_vencimiento:'2026-11-01T05:00:00Z',estado:'ACTIVA',precio_asignado_centavos:p.precio_centavos,moneda:'PEN',periodicidad:'MENSUAL',limite_sucursales_asignado:p.limite_sucursales,limite_usuarios_asignado:p.limite_usuarios,multisucursal:p.multisucursal,version_web:'1',version_condiciones:'1'});
 insert('web_commercial_usage',{empresa_id:id,uso_json:JSON.stringify({sucursales_activas:i===1?1:3,usuarios_activos:i===1?2:5})});
 insert('integration_reconciliation',{empresa_id:id,estado:'SINCRONIZADO',diferencias_json:'[]'});
 const pid=randomUUID();insert('web_manual_payments',{id:pid,command_id:randomUUID(),empresa_id:id,suscripcion_id:sub,importe_centavos:p.precio_centavos,moneda:'PEN',fecha:'2026-10-05',metodo:'EFECTIVO',referencia:'FAKE-F8-'+i,administrador:'owner_f8',observacion:'Pago ficticio'});
 insert('web_payment_context',{pago_id:pid,plan_codigo:p.codigo,precio_asignado_centavos:p.precio_centavos,periodo_inicio:'2026-10-01',periodo_fin:'2026-10-31'});
 insert('web_subscription_history',{empresa_id:id,suscripcion_id:sub,evento:'ALTA',estado_nuevo:'ACTIVA',fecha_vencimiento_nueva:'2026-11-01T05:00:00Z',administrador:'owner_f8',motivo:'Origen ficticio',command_id:randomUUID(),resultado:'APLICADO'});
 insert('licenses',{id:i,client_id:i,reference:'FAKE-LICENSE-F8-'+i,status:'DISPONIBLE',notes:'Licencia ficticia',activation_code_hash:createHash('sha256').update('FAKE_ACTIVATION_CODE_'+i).digest('hex')});
 insert('authorized_devices',{id:i,license_id:i,installation_id:'FAKE-EQUIPO-F8-00'+i,device_name:'Equipo ficticio '+i,status:'PENDIENTE',fingerprint_hash:'a'.repeat(64)});
 insert('activations',{device_id:i,status:'PENDIENTE'});insert('recovery_requests',{device_id:i,status:'PENDIENTE'});
 insert('license_events',{license_id:i,device_id:i,event:'ORIGEN_FICTICIO',detail:'Evento ficticio',administrator:'owner_f8',reason:'Prueba'});
 insert('web_state_commands',{command_id:randomUUID(),empresa_id:id,empresa_web_id:db.prepare('SELECT empresa_web_id FROM web_empresas WHERE id=?').get(id).empresa_web_id,accion:'ACTIVAR',administrador:'owner_f8',motivo:'Histórico ficticio',estado_anterior:'PENDIENTE',estado_nuevo:'ACTIVO',resultado:'APLICADO',retryable:0,intentos:1});
 }
 insert('integration_health',{id:'WEB',estado:'ONLINE',checked_ms:Date.now(),latencia_ms:2});
 insert('history',{event:'MIGRACION_ORIGEN_FICTICIO',detail:'Solo datos ficticios.'});db.close();return file;
}
