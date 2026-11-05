import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
export function buildCandidate(){
 const panel=process.cwd(),web='D:/EDUXFAC_WEB_V2',root=path.resolve('staging/user-security-candidate');fs.mkdirSync(root,{recursive:true});
 // After authorized integration, regress the actual checkout instead of
 // reapplying its baseline patch or maintaining a second edited copy.
 if(fs.existsSync(path.join(web,'integrations/web-user-management/database.mjs'))&&fs.existsSync(path.join(web,'database/migrations/014_web_user_administration.sql')))return web;
 fs.copyFileSync('integrations/web-user-management/014_web_user_administration.sql','integrations/web-user-management/schema.sql');
 const patch=fs.readFileSync('integrations/web-user-management/web-integration.patch','utf8').replace(/\r\n/g,'\n'),files={};
 for(const section of patch.split('diff --git ').slice(1)){const name=section.match(/^a\/(\S+) b\//)[1],old=fs.readFileSync(path.join(web,name),'utf8').replace(/\r\n/g,'\n').split('\n');let cursor=0,result=[];
  for(const h of section.split(/^@@ /m).slice(1)){const header=h.match(/^-(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n/);if(!header)throw Error('PATCH_INVALID');const start=Number(header[1])-1;result.push(...old.slice(cursor,start));cursor=start;for(const line of h.slice(header[0].length).split('\n')){if(line.startsWith('\\')||line==='')continue;if(line[0]===' '||line[0]==='-'){if(old[cursor]!==line.slice(1))throw Error('PATCH_DRIFT');cursor++;}if(line[0]===' '||line[0]==='+')result.push(line.slice(1));}}
  result.push(...old.slice(cursor));files[name]=result.join('\n');
 }
 const name='server/src/admin-service-api.js';if(!files[name].includes("from '../../integrations/web-user-management/database.mjs'"))files[name]=files[name].replace("import {createWebUserAdministration,registerWebUserAdministration}","import {registerWebUserAdministration}").replace("import {createResetLimiter}","import {createDedicatedUserAdministration} from '../../integrations/web-user-management/database.mjs';\nimport {createResetLimiter}").replace(/service:createWebUserAdministration\(\{sessionVersionEnforced:true,withClient:async fn=>\{const client=await pool.connect\(\);try\{return await fn\(client\);\}finally\{client.release\(\);\}\}\}\)/,'service:createDedicatedUserAdministration()');
 const global='server/scripts/global-rls.js';files[global]=fs.readFileSync(path.join(web,global),'utf8').replace("const privateTables=['clientes_admin'","const privateTables=['web_user_admin_events','clientes_admin'").replace("!optionalCpe.includes(name)&&!schema.tables", "!optionalCpe.includes(name)&&name!=='web_user_admin_events'&&!schema.tables").replace("statements.push('DROP POLICY '+q(old.policyname)+' ON '+table);","if(!old.policyname.startsWith('user_admin_'))statements.push('DROP POLICY '+q(old.policyname)+' ON '+table);");
 // Copy source allowlist only; no original .env, data, credentials or certs.
 for(const dir of ['server','database','public'])fs.cpSync(path.join(web,dir),path.join(root,dir),{recursive:true,filter:p=>fs.statSync(p).isDirectory()||/\.(?:js|mjs|sql|html|css|json)$/.test(p)&&!path.basename(p).startsWith('.')});
 fs.copyFileSync(path.join(web,'package.json'),path.join(root,'package.json'));if(!fs.existsSync(path.join(root,'node_modules')))fs.symlinkSync(path.join(web,'node_modules'),path.join(root,'node_modules'),'junction');
 let diff='';for(const [p,content]of Object.entries(files)){const dest=path.join(root,p);fs.writeFileSync(dest,content);const r=spawnSync('git',['diff','--no-index','--',path.join(web,p),dest],{encoding:'utf8',windowsHide:true});if(![0,1].includes(r.status))throw Error('DIFF_FAILED');diff+=r.stdout.replace(/^diff --git .*$/m,'diff --git a/'+p+' b/'+p).replace(/^--- .*$/m,'--- a/'+p).replace(/^\+\+\+ .*$/m,'+++ b/'+p);}
 fs.writeFileSync('integrations/web-user-management/web-integration.patch',diff);
 fs.writeFileSync('integrations/web-user-management/web-auth-bridge.patch',diff.split('diff --git ').slice(1).filter(s=>/^a\/server\/(?:src\/(?:app|auth|password-change)\.js|scripts\/global-rls\.js) /.test(s)).map(s=>'diff --git '+s).join(''));
 for(const dir of ['integrations/web-user-management','shared']){fs.mkdirSync(path.join(root,dir),{recursive:true});for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.mjs')))fs.copyFileSync(path.join(dir,name),path.join(root,dir,name));}
 fs.copyFileSync('integrations/web-user-management/014_web_user_administration.sql',path.join(root,'database/migrations/014_web_user_administration.sql'));
 return root;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')))console.log('CANDIDATE_PATH='+buildCandidate());
