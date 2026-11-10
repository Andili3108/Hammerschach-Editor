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

  await page.evaluate(async()=>{
    const api=window.HammerschachHsc08.api;let state=await api('/championship');
    const post=async body=>{state=await api('/championship','POST',{revision:state.revision,...body});};
    await post({tournament:{title:'Rückkehrtest',mode:'round-robin',cycles:2,scoring:'classic',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30',participants:Array.from({length:4},(_,i)=>({id:'player-'+i,name:'Spieler '+(i+1)}))}});
    await post({action:'apply'});await post({action:'prepare'});await post({action:'release'});
    const g=state.tournament.schedule.flatMap(r=>r.games).find(g=>g.white==='player-0'||g.black==='player-0');
    await post({action:'result',gameId:g.id,result:'1-0'});
    await post({action:'withdraw',participantId:'player-0',reason:'Fehleingabe'});
    document.querySelector('#hsc08View iframe').contentWindow.location.reload();
  });
  const back=frame.getByLabel('Rückzug rückgängig machen',{exact:true});await back.waitFor();
  page.once('dialog',dialog=>dialog.dismiss());await back.selectOption('player-0');
  assert.deepEqual(await page.evaluate(async()=>(await window.HammerschachHsc08.api('/championship')).tournament.withdrawn),['player-0']);
  page.once('dialog',dialog=>{assert.ok(dialog.message().includes('Gespeicherte Ergebnisse'));return dialog.accept('Fehleingabe berichtigt');});
  await back.selectOption('player-0');
  await page.waitForFunction(async()=>!(await window.HammerschachHsc08.api('/championship')).tournament.withdrawn.length);
  await back.waitFor({state:'detached'});
  const state=await page.evaluate(async()=>(await window.HammerschachHsc08.api('/championship')).tournament);
  assert.equal(state.audit.at(-1).action,'rejoin');assert.equal(state.schedule.flatMap(r=>r.games).filter(g=>g.result==='1-0').length,1);
  assert.ok(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.getByRole('button',{name:'Turniermenü',exact:false}).filter({visible:true}).click();
  await page.getByRole('menuitem',{name:'Leseansicht prüfen',exact:false}).filter({visible:true}).click();
  await frame.locator('#ranking table').waitFor();
  assert.equal(await frame.locator('select,input,form').count(),0);
  assert.ok(!(await frame.locator('#ranking').textContent()).includes('Zurückgezogen'));
  assert.deepEqual(errors,[]);
  await context.close();db.close();console.log(label+': Rundenturnier-Rückkehr, Abbrechen und Leseansicht OK');
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
