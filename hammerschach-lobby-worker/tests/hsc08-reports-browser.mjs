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
  const db=new DatabaseSync(':memory:');const env={DB:{prepare(sql){let a=[];return {bind(...v){a=v;return this;},async first(){return db.prepare(sql).get(...a);},async all(){return {results:db.prepare(sql).all(...a)};},async run(){return {meta:{changes:db.prepare(sql).run(...a).changes}};}};}}};
  db.exec("CREATE TABLE league_standings_sources (id TEXT,title TEXT,enabled INTEGER,sort_order INTEGER); INSERT INTO league_standings_sources VALUES ('liga-test','Bezirksliga Test',1,0)");
  const context=await browser.newContext({viewport:{width,height},locale:'de-DE',isMobile:width<1000,hasTouch:width<1000});
  const user=role==='visitor'?null:{id:role,username:role==='admin'?'Andili':'Mitglied',isAdmin:role==='admin'};
  if(user)await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();if(!url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname.startsWith('/api/hsc08/')){
    const r=await handleHsc08(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),env,{json:(b,i)=>new Response(JSON.stringify(b),i),session:async()=>user?{user}:null,isAdmin:u=>u.isAdmin,reauthenticate:async(r,u,p)=>p==='correct'?{ok:true}:{ok:false,status:403,message:'Kennwort falsch'}});
    return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,leagues:[{id:'liga-test',title:'Bezirksliga Test',enabled:true}],user,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
  });
  await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(local);
  async function clickHscNav(role,name,exact){const target=page.getByRole(role,{name,exact}).filter({visible:true});if(!await target.count())await page.locator('#mobileNavTestOpen').click();await target.click();if(name==='Leseansicht prüfen')await page.locator('nav[aria-label="HSC08-Leseansicht"]').first().waitFor({state:'attached'});}

  if(role!=='admin'){await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'HSC08',exact:true}).count(),0);await context.close();db.close();console.log(label+': hidden');continue;}
  await page.waitForFunction(()=>document.querySelector('#clubChessMenuPopup')?.textContent.includes('HSC08'));
  const originalLogo=await page.locator('.header-brand img').getAttribute('src');
  if(width<1000){await page.locator('#mobileNavTestOpen').click();await page.locator('[aria-controls=mobileNavClubChessPanel]').click();await page.locator('#mobileNavClubChessPanel').getByRole('button',{name:'HSC08',exact:true}).click();}
  else {await page.locator('#clubChessMenuBtn').click();await page.locator('#clubChessMenuPopup').getByRole('button',{name:'HSC08',exact:true}).click();}
  const frame=page.frameLocator('#hsc08View iframe');await frame.getByText('Diese Turnierseite ist noch leer.').waitFor();


  await clickHscNav('button','Berichte',true);
  await frame.getByText('Überraschungssieg gegen Werne 1',{exact:true}).waitFor();
  assert.equal(await page.locator('#mobileNavTestHeader .hsc08-toolbar').count(),0);
  if(width<1000){assert.equal(await page.locator('#mobileNavTestBrand>span').isVisible(),false);const head=await page.locator('#mobileNavTestHeader').boundingBox(),menu=await page.locator('#mobileNavTestOpen').boundingBox();assert.ok(head.height<160);assert.ok(menu.x+menu.width>head.x+head.width-25);}

  assert.ok((await frame.locator('.report-card img').getAttribute('src')).startsWith('data:image/jpeg'));
  await frame.getByRole('button',{name:'Bearbeiten',exact:false}).click();
  await frame.getByLabel('Überschrift',{exact:true}).fill('Entwurf für Vereinsbericht');
  await frame.getByLabel('Ergebnisdienst verknüpfen',{exact:true}).selectOption('liga-test');
  await frame.getByRole('button',{name:'Entwurf speichern',exact:false}).click();
  await frame.getByText('Entwurf gespeichert. Die veröffentlichte Fassung bleibt unverändert.',{exact:true}).waitFor();
  const published=await page.evaluate(async()=>await window.HammerschachHsc08.api('/reports?id=thomas-20261108&view=reader'));assert.equal(published.report.title,'Überraschungssieg gegen Werne 1');
  await frame.locator('#reportEditor').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e.firstChild);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
  await frame.getByRole('button',{name:'Fett',exact:true}).click();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;c.getContext('2d').fillRect(0,0,80,60);return c.toDataURL('image/png').split(',')[1];});
  await frame.locator('input[type=file]').setInputFiles({name:'vereinsfoto.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await frame.getByRole('button',{name:'Entfernen: vereinsfoto.png',exact:true}).waitFor();
  await frame.locator('input[type=file]').setInputFiles({name:'partie.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from('[Event "Test"]\n1. e4 *')});
  await frame.getByRole('button',{name:'Entfernen: partie.pgn',exact:true}).waitFor();
  await frame.getByRole('button',{name:'Vorschau',exact:false}).click();await frame.locator('#preview h2').filter({hasText:'Entwurf für Vereinsbericht'}).waitFor();
  await frame.getByLabel('Überschrift',{exact:true}).fill('Überraschungssieg gegen Werne 1');
  await frame.getByRole('button',{name:'Veröffentlichen',exact:false}).click();await frame.getByText('Bericht veröffentlicht.',{exact:true}).waitFor();
  const stored=await page.evaluate(async()=>await window.HammerschachHsc08.api('/reports?id=thomas-20261108'));
  assert.ok(stored.report.blocks[0].runs.some(r=>r.bold));assert.equal(stored.report.files[0].mime,'image/jpeg');assert.equal(stored.report.files[1].name,'partie.pgn');
  await frame.getByRole('button',{name:'Zur Übersicht',exact:false}).click();
  await frame.getByRole('button',{name:'Weiterlesen',exact:true}).click();await frame.getByRole('button',{name:'Zu den Ergebnissen',exact:false}).waitFor();
  assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await frame.getByRole('button',{name:'Zu den Ergebnissen',exact:false}).click();await page.locator('#leagueStandingsView').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>leagueStandingsSelectedId),'liga-test');
  await page.evaluate(()=>window.HammerschachHsc08.open(true,'reports'));
  await frame.getByRole('button',{name:'Weiterlesen',exact:true}).waitFor();assert.equal(await frame.getByRole('button',{name:'Bearbeiten',exact:false}).count(),0);
  if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/reports-'+label+'.png',fullPage:true});
  await clickHscNav('button','Bearbeitungsansicht',true);await frame.getByRole('button',{name:'Neuer Bericht',exact:false}).waitFor();
  assert.deepEqual(errors,[]);await context.close();db.close();console.log(label+': reports draft, publish, reader and internal result link OK');
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
