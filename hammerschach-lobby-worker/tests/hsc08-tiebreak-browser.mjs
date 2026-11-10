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

  page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(async()=>{
    const api=window.HammerschachHsc08.api;
    let state=await api('/championship');
    const participants=Array.from({length:6},(_,i)=>({id:'player-'+i,name:'Spieler '+(i+1),dwz:2000-i*100}));
    const post=async body=>{state=await api('/championship','POST',{revision:state.revision,...body});};
    await post({tournament:{title:'Feinwertungstest',participants,mode:'swiss',scoring:'three-point',rounds:3,startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30'}});
    await post({action:'apply'});
    await post({action:'prepare',seeds:participants.map(p=>p.id),start:'2026-11-01',end:'2026-11-30'});
    await post({action:'release'});
    for(const [i,g] of state.tournament.schedule[0].games.entries())await post({action:'result',gameId:g.id,result:i===0?'+/-':i===1?'-/-':'1/2-1/2'});
    await post({action:'withdraw',participantId:'player-5'});
    document.querySelector('#hsc08View iframe').contentWindow.location.reload();
  });
  await frame.locator('#ranking table').waitFor();
  assert.deepEqual(await frame.locator('#ranking th').allTextContents(),['Platz','Name','Gespielt','Punkte','Buchholz','BH Cut 1']);
  await frame.locator('#ranking .calculation>summary').click();
  await frame.locator('#ranking .calculation details>summary').first().click();
  assert.ok((await frame.locator('#ranking .calculation').textContent()).includes('Bei Cut 1 gestrichen'));
  const prepare=frame.locator('#roundActions form');
  await prepare.locator('input[type=date]').nth(0).fill('2026-12-01');await prepare.locator('input[type=date]').nth(1).fill('2026-12-31');
  await prepare.locator('summary').click();await prepare.locator('input[value="player-4"]').check();
  await prepare.getByRole('button',{name:'Runde 2 vorbereiten',exact:false}).click();
  await frame.getByRole('button',{name:'Runde freigeben',exact:false}).click();
  await frame.locator('.rr-round').first().waitFor();
  assert.equal(await frame.locator('.rr-round').count(),2);
  assert.equal(await frame.locator('.rr-round').nth(1).getAttribute('open'),null);
  const selectors=frame.locator('.rr-round').first().locator('select');
  const count=await selectors.count();for(let i=0;i<count;i++)await selectors.nth(i).selectOption('1/2-1/2');
  for(const theme of ['','soft-mode','dark-mode']){
    await page.evaluate(theme=>{document.documentElement.classList.remove('dark-mode','soft-mode');if(theme)document.documentElement.classList.add(theme);const doc=document.querySelector('#hsc08View iframe').contentDocument;doc.documentElement.classList.remove('dark-mode','soft-mode');if(theme)doc.documentElement.classList.add(theme);},theme);
    assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(process.env.HSC_SCREENSHOT_DIR)await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-'+(theme||'light')+'.png',fullPage:true});
  }
  await page.getByRole('button',{name:'Turniermenü',exact:false}).filter({visible:true}).click();
  await page.getByRole('menuitem',{name:'Turnier konfigurieren',exact:false}).filter({visible:true}).click();
  assert.equal(await frame.locator('#config .config-card').count(),2);
  assert.ok(await frame.locator('#config .participant-fields').isVisible());
  await frame.locator('#title').fill('Feinwertungstest bearbeitet');
  await frame.getByRole('button',{name:'Entwurf speichern',exact:true}).click();
  await frame.getByRole('button',{name:'In Turnieransicht übernehmen',exact:true}).click();
  if(process.env.HSC_SCREENSHOT_DIR){
    await page.getByRole('button',{name:'Turniermenü',exact:false}).filter({visible:true}).click();
  await page.getByRole('menuitem',{name:'Turnier konfigurieren',exact:false}).filter({visible:true}).click();
    await page.screenshot({path:process.env.HSC_SCREENSHOT_DIR+'/'+label+'-config.png',fullPage:true});
    await frame.getByRole('button',{name:'Zur Turnierseite',exact:true}).click();
  }
  await page.getByRole('button',{name:'Turniermenü',exact:false}).filter({visible:true}).click();
  await page.getByRole('menuitem',{name:'Leseansicht prüfen',exact:false}).filter({visible:true}).click();
  await frame.locator('#ranking table').waitFor();
  assert.equal(await frame.locator('select,input,form').count(),0);
  assert.equal(await frame.locator('#ranking th').count(),6);
  await frame.locator('#ranking .calculation>summary').click();
  assert.ok(await frame.locator('#ranking .calculation details').count());
  await page.getByRole('button',{name:'Bearbeitungsansicht',exact:true}).filter({visible:true}).click();
  const finalPrepare=frame.locator('#roundActions form');
  await finalPrepare.locator('input[type=date]').nth(0).fill('2027-01-01');await finalPrepare.locator('input[type=date]').nth(1).fill('2027-01-31');
  await finalPrepare.getByRole('button',{name:'Runde 3 vorbereiten',exact:false}).click();
  await frame.getByRole('button',{name:'Runde freigeben',exact:false}).click();
  const finalGames=frame.locator('.rr-round').first().locator('select');
  const finalCount=await finalGames.count();for(let i=0;i<finalCount;i++)await finalGames.nth(i).selectOption('1-0');
  await frame.getByRole('button',{name:'Turnier abschließen',exact:false}).click();
  await frame.getByText('Endstand · Punkte → Buchholz → Buchholz Cut 1',{exact:true}).waitFor();
  assert.ok(await frame.locator('.winner').isVisible());
  await frame.getByRole('button',{name:'Für Korrektur öffnen',exact:false}).click();
  await frame.getByText('Zwischenstand · Punkte → Buchholz → Buchholz Cut 1',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await context.close();db.close();console.log(label+': Feinwertung, Aussetzen, Konfiguration und Leseansicht OK');
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
