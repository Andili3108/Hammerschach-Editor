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

  await page.getByRole('button',{name:'Blitzrunden',exact:false}).filter({visible:true}).click();
  await frame.getByText('Saisoninformationen',{exact:true}).waitFor();
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'Korrektur im Test':undefined));
  await frame.getByLabel('Saisontitel',{exact:true}).fill('Blitz Test');
  await frame.getByLabel('Streichpartien je Blitzabend (0 = alle zählen)',{exact:true}).fill('1');
  await frame.getByLabel('Blitzabend 1',{exact:true}).fill('2026-11-13');
  await frame.getByRole('button',{name:'Saison speichern',exact:false}).click();
  await frame.getByText('Teilnehmer der Saison',{exact:true}).waitFor();
  for(const name of ['Anna','Bert','Clara']){await frame.getByLabel('Neuer Teilnehmer',{exact:true}).fill(name);await frame.getByRole('button',{name:'Teilnehmer hinzufügen',exact:false}).click();await frame.getByText(name,{exact:true}).last().waitFor();}
  await frame.locator('summary').filter({hasText:'Runde 1 ·'}).click();
  for(const name of ['Anna','Bert','Clara'])await frame.getByLabel(name,{exact:true}).check();
  await frame.getByRole('button',{name:'Paarungsplan freigeben',exact:false}).click();
  await frame.locator('.game').first().waitFor();
  for(let i=0;i<3;i++){await frame.locator('.game').nth(i).getByRole('button',{name:'½–½',exact:true}).click();await frame.locator('.game').nth(i).getByText('Gespeichert: 1/2-1/2',{exact:true}).waitFor();}
  await frame.getByRole('button',{name:'Abend abschließen',exact:false}).click();
  await frame.getByRole('button',{name:'Abend wieder öffnen',exact:false}).waitFor();
  assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  let season=await page.evaluate(async()=>(await window.HammerschachHsc08.api('/blitz')).season);
  assert.equal(await frame.locator('#rankingSection s').count(),0);assert.ok((await frame.locator('#rankingSection th').allTextContents()).includes('Runde 1'));
  assert.equal(season.evenings[0].tournament.ranking[0].deducted,.5);assert.equal(season.evenings[0].tournament.ranking[0].points,.5);
  assert.equal(season.ranking[0].rank,1);assert.ok(Math.abs(season.ranking[0].counted-58/3)<1e-8);
  await frame.getByRole('button',{name:'Abend wieder öffnen',exact:false}).click();await frame.locator('.game').first().getByRole('button',{name:'1–0',exact:true}).click();
  await frame.locator('.game').first().getByText('Gespeichert: 1-0',{exact:true}).waitFor();
  await frame.getByRole('button',{name:'Abend abschließen',exact:false}).click();await frame.getByRole('button',{name:'Abend wieder öffnen',exact:false}).waitFor();
  await frame.getByRole('button',{name:'Saison abschließen',exact:false}).click();await frame.getByRole('button',{name:'Saison wieder öffnen',exact:false}).waitFor();
  await page.getByRole('button',{name:'Turniermenü',exact:false}).filter({visible:true}).click();await page.getByRole('menuitem',{name:'Leseansicht prüfen',exact:false}).filter({visible:true}).click();
  await frame.getByText('Saisonwertung',{exact:true}).waitFor();assert.equal(await frame.locator('input,select,button').count(),0);
  if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/blitz-'+label+'.png',fullPage:true});
  assert.deepEqual(errors,[]);await context.close();db.close();console.log(label+': Blitz season, results, correction, completion and reader OK');
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
