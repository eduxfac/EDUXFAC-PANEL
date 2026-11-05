import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),output=path.join(root,'staging/user-management-review');fs.mkdirSync(output,{recursive:true});
function missingDependencies(file,visited=new Set()){
 if(visited.has(file))return [];visited.add(file);const result=[];
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/(?:^|;)\s*import\s+(?:[^;\n]*?\sfrom\s*)?['"]([.][^'"]+)['"]/gm)){
  const p=path.resolve(path.dirname(file),match[1]);
  if(!fs.existsSync(p))result.push(path.relative(root,p));
  else if(fs.statSync(p).isFile()&&/\.[mc]?js$/.test(p))result.push(...missingDependencies(p,visited));
 }
 return [...new Set(result)];
}
const files=[],skipped=[],withoutMigration014=process.argv.includes('--without-migration-014');
for(const name of fs.readdirSync('tests').filter(n=>n.endsWith('.test.mjs'))){const file=path.join(root,'tests',name),missing=missingDependencies(file);if(withoutMigration014&&name==='web-user-preintegration.test.mjs')skipped.push({file:name,reason:'Migration 014 execution prohibited for this review',missing:[]});else if(missing.length)skipped.push({file:name,reason:'Historical checkout dependency unavailable',missing});else files.push(file);}
const skippedFile=path.join(output,'unavailable-suites.test.mjs');
fs.writeFileSync(skippedFile,"import test from 'node:test';\n"+skipped.map(x=>"test("+JSON.stringify('Omitted suite: '+x.file)+",{skip:"+JSON.stringify(x.reason)+"},()=>{});").join('\n'));
const env={...process.env};for(const key of Object.keys(env))if(/DATABASE_URL|^PG|^PANEL_|SESSION_SECRET|JWT_SECRET|^CPE_|^SUNAT_|^DOTENV_|^NODE_OPTIONS$/.test(key))delete env[key];
env.NODE_ENV='test';env.TEMP=path.join(root,'staging/tmp');env.TMP=env.TEMP;fs.mkdirSync(env.TEMP,{recursive:true});
console.log('LOCAL_REGRESSION_SELECTED_FILES='+files.length);console.log('UNAVAILABLE_SUITE_FILES='+JSON.stringify(skipped.map(x=>x.file)));
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','--test-skip-pattern=^FASE11 manifest WEB|^FASE11 manifest no cambia|^rollback de código FASE 7',...files,skippedFile],{env,encoding:'utf8',maxBuffer:12000000,timeout:180000,windowsHide:true});
const lines=(result.stdout||'').split('\n');
const summary=lines.filter(l=>/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(l));
const failures=lines.filter(l=>/^\s*not ok /.test(l));
const missingDiagnostics=lines.filter(l=>/Cannot find module/.test(l)).map(l=>l.slice(0,350));
const report={selectedFiles:files.map(f=>path.basename(f)),skippedFiles:skipped,migration014Executed:!withoutMigration014,skippedCases:['FASE11 manifest WEB incluye orden real y etapas embebidas','FASE11 manifest no cambia al repetir la consulta offline','rollback de código FASE 7 recupera operación en copia SQLite ficticia'],exit:result.status,summary,failures,missingDiagnostics};
fs.writeFileSync(path.join(output,'regression-results.json'),JSON.stringify(report,null,2));
for(const l of summary)console.log(l);for(const l of failures)console.log(l);for(const l of missingDiagnostics)console.log(l);
process.exitCode=result.status??1;
