import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
// Use a bundled Worker module to catch serialization errors introduced by deployment builds.
const {handleHsc08}=await import(process.env.HSC08_WORKER_MODULE || '../src/hsc08.js');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
try {
 for(const [label,width,height,role] of [['desktop',1440,1000,'admin'],['ipad',820,1180,'admin'],['iphone',390,844,'admin'],['visitor',390,844,'visitor'],['member',1440,1000,'member']]){
  const db=new DatabaseSync(':memory:');const env={DB:{prepare(sql){let a=[];return {bind(...v){a=v;return this;},async first(){return db.prepare(sql).get(...a);},async run(){return {meta:{changes:db.prepare(sql).run(...a).changes}};}};}}};
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});
  const user=role==='visitor'?null:{id:role,username:role==='admin'?'Andili':'Mitglied',isAdmin:role==='admin'};
  if(user)await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();if(!url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname.startsWith('/api/hsc08/')){
    const r=await handleHsc08(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),env,{json:(b,i)=>new Response(JSON.stringify(b),i),session:async()=>user?{user}:null,isAdmin:u=>u.isAdmin,reauthenticate:async(r,u,p)=>p==='correct'?{ok:true}:{ok:false,status:403,message:'Kennwort falsch'}});
    return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,user,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
  });
  await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(local);
  if(role!=='admin'){await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'HSC08',exact:true}).count(),0);await context.close();db.close();console.log(label+': hidden');continue;}
  await page.waitForFunction(()=>document.querySelector('#clubChessMenuPopup')?.textContent.includes('HSC08'));
  const originalLogo=await page.locator('.header-brand img').getAttribute('src');
  if(width<1000){await page.locator('#mobileNavTestOpen').click();await page.locator('[aria-controls=mobileNavClubChessPanel]').click();await page.locator('#mobileNavClubChessPanel').getByRole('button',{name:'HSC08',exact:true}).click();}
  else {await page.locator('#clubChessMenuBtn').click();await page.locator('#clubChessMenuPopup').getByRole('button',{name:'HSC08',exact:true}).click();}
  const frame=page.frameLocator('#hsc08View iframe');await frame.getByText('Diese Turnierseite ist noch leer.').waitFor();
  if(width<1000){
    await page.locator('#mobileNavTestOpen').click();
    assert.equal(await page.locator('#mobileNavTestContext').textContent(),'Vereinsturniere');
    assert.equal(await page.locator('#mobileNavMainSection').isVisible(),false);
    assert.ok(await page.locator('#mobileNavHelpSection').isVisible());
    assert.ok(await page.locator('#mobileNavTestTheme').isVisible());
    const drawer=page.locator('.hsc08-drawer-nav');
    await drawer.getByRole('button',{name:'Vereinsturniere',exact:false}).click();
    assert.ok(await drawer.getByRole('menuitem',{name:'Blitzrunden'}).isDisabled());
    if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-menu.png',fullPage:true});
    await drawer.getByRole('menuitem',{name:'Vereinsmeisterschaft',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('mobileNavTestBackdrop').hidden);
    assert.equal(await page.locator('html.mobile-nav-test-drawer-open').count(),0);
  }
  assert.equal(await page.getByRole('button',{name:'Zur Startseite',exact:true}).filter({visible:true}).count(),0);
  assert.equal(await frame.locator('h1,.intro').count(),0);
  assert.ok((await page.locator('.header-brand img').getAttribute('src')).startsWith('data:image/jpeg'));
  assert.ok(await page.locator('.site-footnote').isVisible());
  assert.equal(await page.locator('.header .match-actions').isVisible(),false);
  await page.getByRole('button',{name:'Vereinsturniere',exact:false}).filter({visible:true}).click();
  assert.ok(await page.getByRole('menuitem',{name:'Vereinspokal',exact:true}).filter({visible:true}).isDisabled());
  await page.getByRole('menuitem',{name:'Vereinsmeisterschaft',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Turnier konfigurieren',exact:true}).filter({visible:true}).click();
  assert.equal(await page.locator('#status').textContent(),'HSC08 · Turnier konfigurieren');
  const expectedColumns=width>1000?3:width>560?2:1;
  await frame.locator('#title').fill('Vereinsmeisterschaft 2026');await frame.locator('#mode').selectOption('swiss');await frame.locator('#descriptionInput').fill('Ausschreibung\nMit Vereinsfreunden');
  for(let i=0;i<3;i++)await frame.locator('#addNames').click();
  assert.equal(await frame.locator('#names input').count(),12);
  assert.equal(await frame.locator('#names').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),expectedColumns);
  const names=['Anna Beispiel','Anna Beispiel','Bert Muster','Carla Beispiel','Dirk Beispiel','Eva Beispiel','Felix Beispiel','Greta Beispiel','Hans Beispiel','Ida Beispiel','Jan Beispiel','<script>alert(1)</script>'];
  for(let i=0;i<names.length;i++)await frame.locator('#names input').nth(i).fill(names[i]);
  const fieldStyle=el=>{const c=getComputedStyle(el);return {radius:c.borderTopLeftRadius,background:c.backgroundColor,color:c.color,border:c.borderTopColor,weight:c.fontWeight,family:c.fontFamily};};
  const originalMode=await page.evaluate(()=>document.documentElement.classList.contains('dark-mode')?'dark':document.documentElement.classList.contains('soft-mode')?'soft':'light');
  const setMode=async mode=>{await page.evaluate(mode=>{document.documentElement.classList.toggle('dark-mode',mode==='dark');document.documentElement.classList.toggle('soft-mode',mode==='soft');},mode);await page.waitForTimeout(80);};
  for(const mode of ['light','soft','dark']){
    await setMode(mode);
    const reference=await page.locator('#tournamentNameInput').evaluate(fieldStyle);
    assert.equal(reference.radius,'12px');
    assert.deepEqual(await frame.locator('#names input').first().evaluate(fieldStyle),reference,label+' input design '+mode);
    if(process.env.HSC_SCREENSHOT_DIR && mode==='dark')await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-inputs-dark.png',fullPage:true});
  }
  await setMode(originalMode);
  await page.evaluate(()=>scrollTo(0,0));
  if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-inputs.png',fullPage:true});
  await frame.getByRole('button',{name:'Entwurf speichern'}).click();await frame.locator('#config').waitFor({state:'hidden'});
  assert.equal(await frame.locator('#participants li').count(),12);
  assert.equal(await frame.locator('#participants').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),expectedColumns);
  const before=JSON.parse(db.prepare('SELECT document FROM hsc08_championship WHERE id=1').get().document).participants;
  assert.notEqual(before[0].id,before[1].id,'same names remain separate participants');
  await page.getByRole('button',{name:'Turnier konfigurieren',exact:true}).filter({visible:true}).click();
  assert.deepEqual(await frame.locator('#names input').evaluateAll(inputs=>inputs.map(i=>i.value)),names);
  await frame.locator('#names input').nth(0).fill('Anna Korrigiert');
  await frame.getByRole('button',{name:'Teilnehmer 3 entfernen',exact:true}).click();
  await frame.locator('#addNames').click();
  await frame.locator('#names input').nth(11).fill('Neuer Teilnehmer');
  await frame.getByRole('button',{name:'Entwurf speichern'}).click();await frame.locator('#config').waitFor({state:'hidden'});
  const after=JSON.parse(db.prepare('SELECT document FROM hsc08_championship WHERE id=1').get().document).participants;
  assert.equal(after.length,12,'blank fields are omitted');assert.equal(after[0].name,'Anna Korrigiert');assert.equal(after[0].id,before[0].id,'rename preserves identity');
  assert.equal(after[1].id,before[1].id);assert.equal(after[1].name,'Anna Beispiel');assert.ok(!after.some(p=>p.id===before[2].id));assert.equal(after.at(-1).name,'Neuer Teilnehmer');
  assert.equal(await frame.locator('#participants li').count(),12);
  assert.equal(await frame.locator('#participants input').count(),0,'output fields are not editable');
  for(const mode of ['light','soft','dark']){
    await setMode(mode);
    assert.deepEqual(await frame.locator('.participant-output').first().evaluate(fieldStyle),await page.locator('#tournamentNameInput').evaluate(fieldStyle),label+' output design '+mode);
  }
  await setMode(originalMode);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'outer overflow '+label);
  assert.ok(await frame.locator('body').evaluate(el=>el.ownerDocument.documentElement.scrollWidth<=el.ownerDocument.defaultView.innerWidth+1),'inner overflow '+label);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#status').textContent(),'HSC08 · Vereinsmeisterschaft 2026');
  assert.ok(await frame.locator('html').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'no inner vertical scroll '+label);
  assert.ok(await page.evaluate(()=>document.querySelector('.site-footnote').getBoundingClientRect().top>=document.querySelector('#hsc08View').getBoundingClientRect().bottom-1),'footer below whole page');
  await page.evaluate(()=>scrollTo(0,0));
  if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'.png',fullPage:true});
  await page.getByRole('button',{name:'Turnier vollständig löschen',exact:true}).filter({visible:true}).click();await frame.locator('#password').fill('wrong');await frame.locator('#confirmation').fill('TURNIER LÖSCHEN');await frame.getByRole('button',{name:'Endgültig löschen'}).click();await frame.locator('#deleteError').getByText('Kennwort falsch').waitFor();assert.equal(await frame.locator('#participants li').count(),12);
  await frame.locator('#password').fill('correct');await frame.getByRole('button',{name:'Endgültig löschen'}).click();await frame.getByText('Turnier gelöscht.',{exact:false}).waitFor();assert.equal(await frame.locator('#participants li').count(),0);
  await page.getByRole('button',{name:'Zur Lobby',exact:true}).filter({visible:true}).click();assert.equal(await page.locator('#hsc08View').count(),0);assert.equal(await page.locator('.hsc08-covered').count(),0);assert.equal(await page.locator('.header-brand img').getAttribute('src'),originalLogo);assert.equal(await page.locator('.site-footnote').count(),1);
  await page.evaluate(()=>HammerschachHsc08.open());await page.locator('#hsc08View').waitFor();await page.evaluate(()=>{onlineAuthToken='';onlineAuthUser=null;updateAuthUi();});assert.equal(await page.locator('#hsc08View').count(),0);assert.equal(await page.getByRole('button',{name:'HSC08',exact:true}).count(),0);
  assert.deepEqual(errors,[],label+' JS errors');console.log(label+': save, delete, overflow, navigation, logout passed');await context.close();db.close();
 }
}finally{await browser.close();server.close();}
