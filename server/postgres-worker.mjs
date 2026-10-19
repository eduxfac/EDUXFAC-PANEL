import {parentPort,workerData} from 'node:worker_threads';
import pg from 'pg';
const encode=new TextEncoder(),config=workerData.config;let pool,tx,stopped=false,chain=Promise.resolve();
pg.types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw Error('DB_INTEGER_RANGE');return n;});
pg.types.setTypeParser(1700,v=>{const n=Number(v);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('DB_NUMERIC_RANGE');return n;});
function answer(buffer,data,error=false){const header=new Int32Array(buffer,0,4),body=new Uint8Array(buffer,16);let bytes=encode.encode(JSON.stringify(data));if(bytes.length>body.length){error=true;bytes=encode.encode({code:'DB_RESULT_LIMIT'});}body.set(bytes);Atomics.store(header,1,bytes.length);Atomics.store(header,0,error?2:1);Atomics.notify(header,0);}
const safeCode=e=>/^[0-9A-Z_]{1,40}$/.test(e.code||'')?e.code:'DB_ERROR';
async function initialize(){
 try{
 pool=new pg.Pool({...config,max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,options:'-c timezone=UTC -c search_path=panel,pg_catalog -c statement_timeout='+config.statementTimeout+' -c lock_timeout=5000'});
 pool.on('error',()=>{});
 const role=(await pool.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
 const access=(await pool.query("SELECT has_schema_privilege(current_user,'panel','USAGE') usage,has_schema_privilege(current_user,'panel','CREATE') creator,(has_table_privilege(current_user,'panel.clients','SELECT') AND has_table_privilege(current_user,'panel.clients','INSERT') AND has_table_privilege(current_user,'panel.clients','UPDATE')) business")).rows[0];
 if(!role||role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole||!access.usage||access.creator||!access.business)throw Object.assign(Error(),{code:'DB_ROLE_REJECTED'});
 if(!(await pool.query("SELECT 1 FROM panel.pg_schema_migrations WHERE version='008_roles_security'")).rowCount)throw Object.assign(Error(),{code:'DB_SCHEMA_REQUIRED'});
 answer(workerData.boot,{ok:true});
 }catch(e){answer(workerData.boot,{code:safeCode(e)},true);await pool?.end();parentPort.close();}
}
async function execute(message){
 if(stopped)return answer(message.buffer,{code:'DB_CLOSED'},true);
 try{
 if(message.type==='close'){stopped=true;if(tx){await tx.query('ROLLBACK');tx.release();tx=null;}await pool.end();answer(message.buffer,{ok:true});parentPort.close();return;}
 let text=message.text.trim(),result;
 if(/^BEGIN$/i.test(text)){if(tx)throw Object.assign(Error(),{code:'DB_NESTED_TRANSACTION'});tx=await pool.connect();await tx.query('BEGIN');await tx.query("SELECT pg_advisory_xact_lock(8844008)");result={rows:[],rowCount:0};}
 else if(/^(COMMIT|ROLLBACK)$/i.test(text)){if(!tx)throw Object.assign(Error(),{code:'DB_NO_TRANSACTION'});try{result=await tx.query(text);}finally{tx.release();tx=null;}}
 else result=await (tx||pool).query({text,values:message.values,query_timeout:config.statementTimeout+1000});
 answer(message.buffer,{rows:result.rows||[],rowCount:result.rowCount||0});
 }catch(e){answer(message.buffer,{code:safeCode(e)},true);}
}
parentPort.on('message',m=>{chain=chain.then(()=>execute(m)).catch(()=>answer(m.buffer,{code:'DB_ERROR'},true));});
await initialize();
