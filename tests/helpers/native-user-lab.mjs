import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import {spawnSync} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';import pg from 'pg';
const bin='C:/Program Files (x86)/EDUXFAC/PostgreSQL/bin';
export async function startNativeLab(){
 const staging=path.resolve('staging'),root=path.join(staging,'pg16-user-security-'+randomUUID()),data=path.join(root,'data');
 if(!root.startsWith(staging+path.sep))throw Error('LAB_PATH_INVALID');fs.mkdirSync(root,{recursive:true});
 const owner='eduxfac_lab_owner',password=randomBytes(40).toString('base64url'),pwfile=path.join(root,'bootstrap-password.tmp');fs.writeFileSync(pwfile,password,{mode:0o600});
 const run=(name,args)=>{const r=spawnSync(path.join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw Object.assign(Error('NATIVE_LAB_'+name.toUpperCase()+'_FAILED'),{nativeDiagnostic:(r.stderr||r.stdout||'').replaceAll(password,'[redacted]').slice(-1500)});};
 try{run('initdb',['-D',data,'-U',owner,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--pwfile='+pwfile]);}finally{fs.rmSync(pwfile,{force:true});}
 const listener=net.createServer();await new Promise((r,j)=>listener.once('error',j).listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));if(port===55432)throw Error('LAB_PORT_INVALID');
 const options=`-h 127.0.0.1 -p ${port} -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0`;
 let started=false,admin;const clients=new Set();
 async function stop(){for(const c of clients)await c.end().catch(()=>{});clients.clear();if(admin)await admin.end().catch(()=>{});if(started){run('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;}}
 try{run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',options,'-w','start']);started=true;
  admin=new pg.Client({host:'127.0.0.1',port,user:owner,password,database:'postgres'});await admin.connect();const metadata=(await admin.query('SELECT version() version,current_setting(\'data_directory\') data')).rows[0];
  if(path.resolve(metadata.data)!==path.resolve(data)||!metadata.version.includes('PostgreSQL 16.'))throw Error('LAB_IDENTITY_MISMATCH');
  return {admin,root,port,version:metadata.version,async connect(user,pass){const c=new pg.Client({host:'127.0.0.1',port,user,password:pass,database:'postgres'});await c.connect();clients.add(c);return c;},async role(name){if(!/^eduxfac_[a-z_]+$/.test(name))throw Error('INVALID_LAB_ROLE');const pass=randomBytes(40).toString('base64url');await admin.query('ALTER ROLE '+name+" LOGIN PASSWORD '"+pass+"'");return this.connect(name,pass);},stop};
 }catch(e){await stop();throw e;}
}
