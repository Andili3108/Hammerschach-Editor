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
  const context=await browser.newContext({viewport:{width,height},locale:'de-DE',isMobile:width<1000,hasTouch:width<1000});
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

  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'Test: Rücknahme vor Spielbeginn':undefined));
  async function openPairingEditor(){
    const control=frame.getByRole('button',{name:'Paarungen bearbeiten',exact:false});
    await control.waitFor({state:'visible'});
    await control.evaluate(button=>{
      const iframe=window.frameElement,header=parent.document.querySelector('#mobileNavTestHeader');
      const height=header?.getBoundingClientRect().height||0;
      parent.scrollTo({top:Math.max(0,parent.scrollY+iframe.getBoundingClientRect().top+button.getBoundingClientRect().top-height-24),behavior:'instant'});
    });
    await page.waitForFunction(()=>{const iframe=document.querySelector('#hsc08View iframe'),button=iframe.contentDocument.querySelector('[aria-controls="pairingEditor"]');const a=iframe.getBoundingClientRect(),b=button.getBoundingClientRect();return document.elementFromPoint(a.x+b.x+b.width/2,a.y+b.y+b.height/2)===iframe;});
    const box=await control.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await frame.locator('.pairing-editor').waitFor({state:'visible'});
  }

  await page.evaluate(async()=>{
    const api=window.HammerschachHsc08.api;let state=await api('/championship');
    const post=async body=>{state=await api('/championship','POST',{revision:state.revision,...body});};
    await post({tournament:{title:'Paarungsänderung',mode:'round-robin',cycles:1,scoring:'classic',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30',participants:Array.from({length:6},(_,i)=>({id:'player-'+i,name:'Spieler '+(i+1),dwz:2000-i*100}))}});
    await post({action:'apply'});await post({action:'prepare'});
    document.querySelector('#hsc08View iframe').contentWindow.location.reload();
  });
  const editor=frame.locator('.pairing-editor');await openPairingEditor();
  const first=editor.locator('.pairing-edit-row').first(),white=await first.locator('select').nth(0).inputValue(),black=await first.locator('select').nth(1).inputValue();
  await first.getByRole('button',{name:'Farben tauschen',exact:false}).click();
  assert.equal(await first.locator('select').nth(0).inputValue(),black);
  await editor.getByLabel('Begründung der Paarungsänderung').fill('Farben vor Beginn korrigiert');
  for(const theme of ['','soft-mode','dark-mode']){
    await page.evaluate(theme=>{const doc=document.querySelector('#hsc08View iframe').contentDocument;doc.documentElement.classList.remove('dark-mode','soft-mode');if(theme)doc.documentElement.classList.add(theme);},theme);
    assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(process.env.HSC_SCREENSHOT_DIR)await editor.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-pairing-'+(theme||'light')+'.png'});
  }
  await editor.getByRole('button',{name:'Änderungen prüfen und speichern',exact:false}).click();
  await openPairingEditor();assert.equal(await editor.locator('.pairing-edit-row').first().locator('select').nth(0).inputValue(),black);
  // A local change can be cancelled without modifying the saved plan.
  await editor.locator('.pairing-edit-row').first().getByRole('button',{name:'Farben tauschen',exact:false}).click();
  await editor.getByRole('button',{name:'Abbrechen',exact:true}).click();await openPairingEditor();
  assert.equal(await editor.locator('.pairing-edit-row').first().locator('select').nth(0).inputValue(),black);
  // Swapping two participants only in one round would duplicate other encounters.
  const other=await editor.locator('.pairing-edit-row').nth(1).locator('select').first().inputValue();
  await editor.locator('.pairing-edit-row').first().locator('select').first().selectOption(other);
  await editor.getByLabel('Begründung der Paarungsänderung').fill('Ungültigen Tausch testen');
  await editor.getByRole('button',{name:'Änderungen prüfen und speichern',exact:false}).click();
  await editor.getByRole('alert').filter({hasText:'doppelt'}).waitFor();
  await editor.getByRole('button',{name:'Abbrechen',exact:true}).click();
  await frame.getByRole('button',{name:'Paarungsplan freigeben',exact:false}).click();
  await frame.getByRole('button',{name:'Spielplan zur Bearbeitung zurücknehmen',exact:false}).click();
  await frame.getByRole('button',{name:'Paarungen bearbeiten',exact:false}).waitFor();assert.equal(await frame.getByRole('button',{name:'Entwurf verwerfen',exact:true}).count(),0);
  const view=await page.evaluate(()=>window.HammerschachHsc08.api('/championship/view'));assert.equal(view.tournament.schedule,undefined);assert.equal(view.tournament.audit,undefined);
  await frame.getByRole('button',{name:'Paarungsplan freigeben',exact:false}).click();
  await frame.locator('.rr-round').first().locator('select').first().selectOption('1-0');
  assert.equal(await frame.getByRole('button',{name:'Spielplan zur Bearbeitung zurücknehmen',exact:false}).count(),0);
  await frame.getByLabel('Teilnehmer zurückziehen',{exact:true}).selectOption('player-0');
  await frame.locator('#ranking').getByText('Spieler 1 · ohne Wertung · Zurückgezogen',{exact:true}).waitFor();
  assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  // Start a separate Swiss fixture in this browser's isolated in-memory database.
  db.exec('DELETE FROM hsc08_championship');
  await page.evaluate(async()=>{
    const api=window.HammerschachHsc08.api;let state=await api('/championship');const post=async body=>{state=await api('/championship','POST',{revision:state.revision,...body});};
    const participants=Array.from({length:7},(_,i)=>({id:'player-'+i,name:'Spieler '+(i+1),dwz:2000-i*100}));
    await post({tournament:{title:'Schweizer Paarungsänderung',mode:'swiss',rounds:3,scoring:'three-point',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30',participants}});
    await post({action:'apply'});await post({action:'prepare',seeds:participants.map(p=>p.id),start:'2026-11-01',end:'2026-11-30'});
    document.querySelector('#hsc08View iframe').contentWindow.location.reload();
  });
  await openPairingEditor();await editor.locator('.pairing-edit-row').first().getByRole('button',{name:'Farben tauschen',exact:false}).click();
  await editor.getByLabel('Begründung der Paarungsänderung').fill('Andili bestätigt abweichende Farben');
  await editor.getByRole('button',{name:'Änderungen prüfen und speichern',exact:false}).click();
  await editor.getByRole('alert').filter({hasText:'Dutch-Auslosung'}).waitFor();
  await editor.getByRole('checkbox').check();await editor.getByRole('button',{name:'Änderungen prüfen und speichern',exact:false}).click();
  await frame.locator('.rr-round>summary').filter({hasText:'Manuell geändert'}).waitFor();
  await openPairingEditor();assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  if(process.env.HSC_SCREENSHOT_DIR)await editor.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-swiss-pairing.png'});
  await frame.getByRole('button',{name:'Runde freigeben',exact:false}).click();
  const swissView=await page.evaluate(()=>window.HammerschachHsc08.api('/championship/view'));assert.equal(swissView.tournament.schedule[0].manualPairings,true);assert.equal(swissView.tournament.audit,undefined);
  await frame.getByRole('button',{name:'Runde zur Bearbeitung zurücknehmen',exact:false}).click();await frame.getByRole('button',{name:'Paarungen bearbeiten',exact:false}).waitFor();
  await frame.locator('#roundActions button:focus').filter({hasText:'Runde freigeben'}).waitFor();
  // Verify the actual pointer target after the application has repositioned the page.
  // Use a real pointer click without Playwright re-scrolling the nested iframe.
  await page.waitForFunction(()=>{
    const iframe=document.querySelector('#hsc08View iframe'),button=iframe.contentDocument.activeElement;
    if(!button?.textContent.includes('Runde freigeben'))return false;
    const outer=iframe.getBoundingClientRect(),inner=button.getBoundingClientRect();
    return document.elementFromPoint(outer.left+inner.left+inner.width/2,outer.top+inner.top+inner.height/2)===iframe;
  });
  const releaseBox=await frame.getByRole('button',{name:'Runde freigeben',exact:false}).boundingBox();
  await page.mouse.click(releaseBox.x+releaseBox.width/2,releaseBox.y+releaseBox.height/2);
  await frame.locator('.rr-round').first().locator('select').first().selectOption('1-0');
  assert.equal(await frame.getByRole('button',{name:'Runde zur Bearbeitung zurücknehmen',exact:false}).count(),0);
  assert.deepEqual(errors,[]);await context.close();db.close();console.log(label+': Paarungseditor, Abbrechen, Regelprüfung, Rücknahme und Sperre OK');
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
