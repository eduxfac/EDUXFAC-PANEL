// Isolated source mirror, no .env, credentials, certificates or original writes.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {buildCandidate} from './build-user-candidate.mjs';
const panel=process.cwd(),web='D:/EDUXFAC_WEB_V2',root=path.join(panel,'staging/preintegration/web-shadow');
const candidate=process.argv.includes('--existing-candidate');
fs.mkdirSync(root,{recursive:true});
for(const dir of ['server','database','public','tests'])fs.cpSync(path.join(web,dir),path.join(root,dir),{recursive:true,filter:p=>fs.statSync(p).isDirectory()||/\.(?:js|mjs|sql|html|css|json)$/.test(p)&&!path.basename(p).startsWith('.')});
if(candidate){const generated=buildCandidate();for(const dir of ['server','database','public','integrations','shared'])fs.cpSync(path.join(generated,dir),path.join(root,dir),{recursive:true});}
fs.copyFileSync(path.join(web,'package.json'),path.join(root,'package.json'));
if(!fs.existsSync(path.join(root,'node_modules')))fs.symlinkSync(path.join(web,'node_modules'),path.join(root,'node_modules'),'junction');
function rewrite(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())rewrite(p);else if(/\.[mc]?js$/.test(p)){let s=fs.readFileSync(p,'utf8');
 s=s.replace(/path\.resolve\(root,'\.\.\/\.\.\/\.\.\/PANEL EDUXFAC\/01_TRABAJO_ACTUAL\/PANEL_EDUXFAC_ACTUAL\/server\/web-api-client\.mjs'\)/g,JSON.stringify(path.join(panel,'server/web-api-client.mjs')))
 .replace(/path\.resolve\(webRoot,'\.\.\/\.\.\/\.\.\/PANEL EDUXFAC\/01_TRABAJO_ACTUAL\/PANEL_EDUXFAC_ACTUAL'\)/g,JSON.stringify(panel))
 .replace(/path\.resolve\(fileURLToPath\(new URL\('\.\.\/',import\.meta\.url\)\),'\.\.\/\.\.\/\.\.\/PANEL EDUXFAC\/01_TRABAJO_ACTUAL\/PANEL_EDUXFAC_ACTUAL'\)/g,JSON.stringify(panel));
 // Reserved synthetic identifiers replacing historical numeric fixtures consistently.
 s=s.replace(/\b20\d{9}\b/g,n=>'99'+n.slice(2));fs.writeFileSync(p,s);
}}}rewrite(path.join(root,'tests'));
if(candidate)for(const name of ['isolated-web.js','initial-inventory-template-fixture.js']){const p=path.join(root,'tests/helpers',name);let s=fs.readFileSync(p,'utf8');const marker=" const {app,initializeDatabase}=await import('../../server/src/app.js');";s=s.replace(marker," // Auth-bridge fixture only; full migration/RLS tested separately on native PG16.\n await db.exec('ALTER TABLE usuarios ADD COLUMN password_version integer NOT NULL DEFAULT 0 CHECK(password_version>=0)');\n"+marker);fs.writeFileSync(p,s);}
const env={...process.env};for(const k of Object.keys(env))if(/DATABASE_URL|^PG|^PANEL_|SESSION_SECRET|JWT_SECRET|^CPE_|^SUNAT_|^DOTENV_|^NODE_OPTIONS$|^WEB_|^EDUXFAC_/.test(k))delete env[k];
Object.assign(env,{NODE_ENV:'test',DOTENV_CONFIG_PATH:path.join(root,'missing.env'),TEMP:path.join(panel,'staging/tmp'),TMP:path.join(panel,'staging/tmp')});
const suites=['admin-service-api','company-states','onboarding','plans-limits','subscriptions','tenant-isolation','user-password-edit'];
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...suites.map(n=>'tests/'+n+'.test.js')],{cwd:root,env,encoding:'utf8',timeout:240000,maxBuffer:12000000,windowsHide:true});
const lines=(result.stdout||'').split('\n'),report={mode:(candidate?'Candidate':'Baseline')+' WEB source mirror; helpers repointed to current Panel; synthetic identifiers only',suites,exit:result.status,summary:lines.filter(l=>/^# (tests|pass|fail|skipped|cancelled|duration_ms) /.test(l)),failures:lines.filter(l=>/^\s*not ok /.test(l))};
fs.writeFileSync(path.join(panel,'staging/preintegration/'+(candidate?'web-candidate-regression-results.json':'web-regression-results.json')),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=result.status??1;
