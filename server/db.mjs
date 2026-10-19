import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {postgresSQL} from './postgres-dialect.mjs';
const fault=code=>Object.assign(Error('No se pudo completar la operación de base de datos.'),{code});
export function pgConfiguration(environment=process.env){
 const raw=environment.PANEL_DATABASE_URL;if(!raw)throw fault('DB_CONFIGURATION_REQUIRED');
 let u;try{u=new URL(raw);}catch{throw fault('DB_CONFIGURATION_INVALID');}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.username||u.search||u.hash)throw fault('DB_CONFIGURATION_INVALID');
 const production=environment.NODE_ENV==='production';
 if(production&&environment.PANEL_PG_TLS!=='verify-full')throw fault('DB_TLS_REQUIRED');
 const timeout=Number(environment.PANEL_DB_STATEMENT_TIMEOUT_MS??10000);if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw fault('DB_TIMEOUT_INVALID');
 return {host:u.hostname,port:Number(u.port||5432),database:decodeURIComponent(u.pathname.slice(1)),user:decodeURIComponent(u.username),password:u.password?decodeURIComponent(u.password):undefined,ssl:production||environment.PANEL_PG_TLS==='verify-full'?{rejectUnauthorized:true,...(environment.PANEL_PG_CA_FILE?{ca:readFileSync(environment.PANEL_PG_CA_FILE,'utf8')}:{})}:false,statementTimeout:timeout};
}
export function createPanelPool(environment=process.env){pg.types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw fault('DB_INTEGER_RANGE');return n;});pg.types.setTypeParser(1700,v=>{const n=Number(v);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw fault('DB_NUMERIC_RANGE');return n;});const {statementTimeout,...configuration}=pgConfiguration(environment);const pool=new pg.Pool({...configuration,max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,options:'-c timezone=UTC -c search_path=panel,pg_catalog -c statement_timeout='+statementTimeout+' -c lock_timeout=5000'});pool.on('error',()=>console.error('PANEL_DB_POOL_ERROR'));return pool;}
const idTables=new Set(['admin','clients','licenses','authorized_devices','activations','recovery_requests','history','license_events','login_attempts','web_state_history','web_commercial_history','web_subscription_history','integration_attempts','integration_logs','panel_admin_users','panel_admin_events','panel_auth_attempts','panel_backup_events']);
const hash=s=>createHash('sha256').update(s).digest('hex');
export class PostgresPanelDatabase{
 constructor(environment=process.env){
 this.engine='postgres';this.config=pgConfiguration(environment);this.closed=false;this.timeout=this.config.statementTimeout+6000;this.channel=new SharedArrayBuffer(16+16*1024*1024);
 this.worker=new Worker(new URL('./postgres-worker.mjs',import.meta.url),{execArgv:[],workerData:{config:this.config,boot:this.boot=new SharedArrayBuffer(65536)}});
 this.worker.on('error',()=>{this.closed=true;});this.wait(this.boot);
 }
 wait(buffer){const h=new Int32Array(buffer,0,4);if(Atomics.wait(h,0,0,this.timeout)==='timed-out'){this.closed=true;void this.worker.terminate();throw fault('DB_TIMEOUT');}const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,16,Atomics.load(h,1))));if(Atomics.load(h,0)===2)throw fault(data.code);return data;}
 call(text,values=[],type='query'){if(this.closed)throw fault('DB_CLOSED');const buffer=this.channel;Atomics.store(new Int32Array(buffer,0,4),0,0);this.worker.postMessage({text,values,type,buffer});return this.wait(buffer);}
 prepare(source){
 const table=source.match(/^\s*INSERT(?: OR IGNORE)? INTO\s+([a-z_]+)/i)?.[1];
 const execute=args=>{const q=postgresSQL(source,args);if(table&&idTables.has(table)&&!/\bRETURNING\b/i.test(q.text))q.text+=' RETURNING id';return this.call(q.text,q.values);};
 return {all:(...args)=>execute(args).rows,get:(...args)=>execute(args).rows[0],run:(...args)=>{const r=execute(args);return {changes:r.rowCount,lastInsertRowid:r.rows[0]?.id??null};}};
 }
 exec(source){
 // Legacy initialization has no DDL authority in PostgreSQL. Schema must already be explicit/versioned.
 const base=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8');
 if(hash(source)===hash(base)||/^\s*CREATE TABLE IF NOT EXISTS schema_migrations\s*\(/.test(source))return;
 const q=postgresSQL(source);if(!/^(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(q.text))throw fault('DB_EXPLICIT_MIGRATION_REQUIRED');this.call(q.text);
 }
 transaction(fn){this.exec('BEGIN IMMEDIATE');try{const r=fn();if(r&&typeof r.then==='function')throw fault('DB_ASYNC_TRANSACTION_NOT_SUPPORTED');this.exec('COMMIT');return r;}catch(e){this.exec('ROLLBACK');throw e;}}
 health(){try{return {estado:this.prepare('SELECT 1 ok').get().ok===1?'OK':'ERROR',engine:this.engine};}catch{return {estado:'ERROR',engine:this.engine};}}
 close(){if(this.closed)return;this.call('',[],'close');this.closed=true;void this.worker.terminate();}
}
export function openPanelDatabase({engine=process.env.PANEL_DB_ENGINE||'sqlite',database,environment=process.env}={}){
 if(engine==='sqlite'){const db=new DatabaseSync(database);db.engine='sqlite';db.health=()=>{try{return {estado:db.prepare('SELECT 1 ok').get().ok===1?'OK':'ERROR',engine:'sqlite'};}catch{return {estado:'ERROR',engine:'sqlite'};}};return db;}
 if(engine==='postgres')return new PostgresPanelDatabase(environment);
 throw fault('DB_ENGINE_INVALID');
}

export async function withPanelTransaction(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(8844008)');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw fault(e.code||'DB_ERROR');}finally{c.release();}}
