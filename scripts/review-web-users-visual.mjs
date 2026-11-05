import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const pending=process.argv[2],active=process.argv[3];if(!pending||!active)throw Error('Two local fixture URLs required');
for(const v of [pending,active])if(new URL(v).hostname!=='127.0.0.1')throw Error('LOOPBACK_REQUIRED');
const output=path.resolve('staging/user-management-review');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
const report={screens:[],checks:{},externalRequestsBlocked:0};
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();report.externalRequestsBlocked++;return route.abort();});
 const page=await context.newPage();const logs=[];page.on('console',m=>logs.push(m.text()));page.on('dialog',d=>d.accept());
 async function login(url){await page.goto(url);await page.locator('#username').fill('panel_demo');await page.locator('#password').fill('Synthetic-Panel!123');await page.locator('#login-submit').click();await page.getByRole('heading',{name:'Usuarios',exact:true}).waitFor();}
 await login(pending);
 // Follow the actual company list link, rather than just the deep link.
 await page.locator('#navigation a[href="#web-empresas"]').click();
 await page.locator('a.small-action[href$="/usuarios"]').waitFor();
 await page.locator('a.small-action[href$="/usuarios"]').first().click();
 await page.getByRole('heading',{name:'Usuarios',exact:true}).waitFor();
 assert.ok((await page.locator('main').innerText()).includes('Empresa pendiente'));
 report.checks.pendingCompany=true;
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport);
  const layout=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,tableWidth:document.querySelector('.table-scroll').scrollWidth,tableVisible:document.querySelector('.table-scroll').clientWidth,headers:[...document.querySelectorAll('main th')].map(x=>x.textContent),buttonCount:document.querySelectorAll('main [data-reset]').length}));
  const filename='pending-'+viewport.width+'.png';await page.screenshot({path:path.join(output,filename)});
  report.screens.push({...viewport,...layout,filename});
 }
 await page.locator('main .table-scroll').evaluate(e=>{e.scrollLeft=e.scrollWidth;});
 await page.locator('[data-reset]').scrollIntoViewIfNeeded();
 const resetResponse=page.waitForResponse(r=>r.url().endsWith('/reset-password')&&r.request().method()==='POST');
 await page.locator('[data-reset]').click();const result=await(await resetResponse).json();let secret=result.temporary_password;
 assert.ok(typeof secret==='string'&&secret.length>=12);
 await page.locator('dialog[open] output').waitFor();
 assert.ok((await page.locator('dialog output').textContent())===secret);
 await page.screenshot({path:path.join(output,'password-modal-1366.png'),mask:[page.locator('dialog output')]});
 await page.locator('dialog [data-copy]').click();
 await page.getByText('Copiada. El portapapeles queda bajo tu control.').waitFor();
 assert.ok((await page.evaluate(()=>navigator.clipboard.readText()))===secret);
 report.checks.clipboard=true;
 assert.ok(!(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href})) ).includes(secret));
 assert.ok(!logs.join('\n').includes(secret));report.checks.noPasswordInStorageUrlOrConsole=true;
 await page.locator('dialog [data-close]').click();assert.equal(await page.locator('dialog').count(),0);assert.ok(!(await page.content()).includes(secret));
 await page.reload();await page.getByRole('heading',{name:'Usuarios',exact:true}).waitFor();assert.equal(await page.locator('dialog').count(),0);assert.ok(!(await page.content()).includes(secret));
 report.checks.closeRefreshNoRedisplay=true;secret=undefined;result.temporary_password=undefined;
 // Navigation while a new synthetic password is visible must erase the modal.
 await page.locator('[data-reset]').click();await page.locator('dialog[open] output').waitFor();
 await page.evaluate(()=>{location.hash='web-empresas';});
 await page.locator('a.small-action[href$="/usuarios"]').waitFor();assert.equal(await page.locator('dialog').count(),0);report.checks.navigationClearsModal=true;
 await page.evaluate(()=>navigator.clipboard.writeText(''));
 await context.clearCookies();
 await login(active);assert.ok((await page.locator('main').innerText()).includes('Sin bloqueos de estado'));
 report.checks.activeCompany=true;
 await page.screenshot({path:path.join(output,'active-1366.png')});
 await context.close();
 fs.writeFileSync(path.join(output,'visual-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
