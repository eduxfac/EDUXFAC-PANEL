// Local pre-commit review. Reports paths/categories only, never matched values.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const panel=process.cwd(),web='D:/EDUXFAC_WEB_V2',out=path.resolve('staging/commit-review');fs.mkdirSync(out,{recursive:true});
const staged=process.argv.includes('--staged'),secretValues=new Set();
const git=(cwd,args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:6000000});if(r.status!==0)throw Error('GIT_REVIEW_FAILED:'+args[0]);return r.stdout;};
function remember(value,key=''){
 if(typeof value==='string'){
  if(/PASSWORD|SECRET|TOKEN/i.test(key)&&value.length>=16&&!/^(FAKE|SYNTHETIC|EXAMPLE|CHANGE_ME)/i.test(value))secretValues.add(value);
  if(/DATABASE_URL/i.test(key)&&value){try{const u=new URL(value);if(u.password.length>=16){secretValues.add(u.password);secretValues.add(decodeURIComponent(u.password));}}catch{}}
 }else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value))remember(v,k);
}
for(const p of [path.join(web,'.env.user-management-local.json'),path.join(web,'runtime/user-management-local/cluster-admin.json'),path.join(panel,'.env.user-management-local.json')])if(fs.existsSync(p))remember(JSON.parse(fs.readFileSync(p,'utf8')));
const signals={DATABASE_URL:/DATABASE_URL\s*=/gi,password:/\bpassword\s*=/gi,password_hash:/password_hash\s*=/gi,PGPASSWORD:/PGPASSWORD\s*=/gi,JWT_SECRET:/JWT_SECRET\s*=/gi,SESSION_SECRET:/SESSION_SECRET\s*=/gi,CPE_WEB_SECRET:/CPE_WEB_SECRET\s*=/gi,SOL:/\bSOL\b/g,CERT_PASSWORD:/CERT_PASSWORD/gi,PRIVATE_KEY:/PRIVATE KEY/g,serverAddress:new RegExp([85,239,248,248].join('\\.'),'g')};
const forbidden=/(^|\/)(?:runtime|logs|node_modules|backups|staging|screenshots|data|secrets|certs|certificates|test-results|playwright-report)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|\.(?:key|pfx|p12|pem|crt|cer|db|sqlite\d*|dump|bak|log|png|mp4)$/i;
const literalKey=/\b(?:password|PGPASSWORD|JWT_SECRET|SESSION_SECRET|CPE_WEB_SECRET|CERT_PASSWORD)\s*[:=]\s*['"]([^'"\r\n]+)['"]/gi;
const reports=[];
for(const [label,root]of [['WEB',web],['PANEL',panel]]){
 const names=staged?git(root,['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean):[...new Set([...git(root,['diff','--name-only','HEAD','-z']).split('\0'),...git(root,['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))];
 const report={repository:label,branch:git(root,['branch','--show-current']).trim(),mode:staged?'INDEX':'WORKTREE',files:[],findings:[],referenceCounts:Object.fromEntries(Object.keys(signals).map(k=>[k,0]))};
 for(const name of names){
  if(forbidden.test(name))report.findings.push({file:name,kind:'FORBIDDEN_ARTIFACT_PATH'});
  const text=staged?git(root,['show',':'+name]):fs.readFileSync(path.join(root,name),'utf8');report.files.push({path:name,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});
  for(const [key,re]of Object.entries(signals)){re.lastIndex=0;report.referenceCounts[key]+=[...text.matchAll(re)].length;}
  if([...secretValues].some(v=>text.includes(v)))report.findings.push({file:name,kind:'LOCAL_GENERATED_SECRET_VALUE'});
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))report.findings.push({file:name,kind:'PRIVATE_KEY_MATERIAL'});
  if(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,})\b/.test(text))report.findings.push({file:name,kind:'PROVIDER_TOKEN_LITERAL'});
  if(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/.test(text))report.findings.push({file:name,kind:'STORED_PASSWORD_HASH_LITERAL'});
  literalKey.lastIndex=0;for(const match of text.matchAll(literalKey)){if(!/^(?:Synthetic|FAKE|EXAMPLE|CHANGE_ME|TEST_ONLY|dev-only-change-me)/i.test(match[1])&&match[1].length>=12)report.findings.push({file:name,kind:'REVIEW_LITERAL_CREDENTIAL_ASSIGNMENT'});}
  if(text.includes([85,239,248,248].join('.')))report.findings.push({file:name,kind:'REMOTE_SERVER_LITERAL'});
 }
 report.realSecretsFound=report.findings.length>0;reports.push(report);
 console.log(label+'_SCANNED_FILES='+names.length);console.log(label+'_REAL_SECRETS_FOUND='+(report.realSecretsFound?'REVIEW_REQUIRED':'NO'));for(const f of report.findings)console.log(label+'_FINDING='+f.file+' ['+f.kind+']');
}
fs.writeFileSync(path.join(out,staged?'staged-secret-review.json':'worktree-secret-review.json'),JSON.stringify({reports,knownLocalSecretValuesCompared:secretValues.size,matchedValuesPrinted:false},null,2));
if(reports.some(r=>r.realSecretsFound))process.exitCode=1;
