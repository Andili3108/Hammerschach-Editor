// Optional browser integration suite: npm install --no-save playwright
// node tests/live-board-browser.mjs (or set PLAYWRIGHT_MODULE to its entry file).
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleLiveBoardApi} from '../src/live-board.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_DEMO:'1',LIVE_BOARD_EVENTS:JSON.stringify([{id:'club',title:'Vereinsabend · Testübertragung',category:'club',source:{type:'demo'}},{id:'open',title:'Gamer Open · Testrunde',category:'tournament',source:{type:'demo'}}])};
const user={id:'test-user',username:'Andili',isAdmin:false};
const helpers={json:(data,init)=>new Response(JSON.stringify(data),init),lookupAuthSession:async(e,t)=>t==='Bearer test-token'?{user}:null,bearerTokenFromRequest:r=>r.headers.get('authorization')};
const server=http.createServer(async(req,res)=>{
  try{
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
    if(!file.startsWith(root))throw Error('path');
    const data=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(data);
  }catch(_){res.statusCode=404;res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const report=[];
try{
 for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['ipad',820,1180,true],['iphone',390,844,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(({user})=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},{user});
  let mode='ok',calls=0;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();
   if(url.pathname==='/api/live-board/events'){
    calls++;if(mode==='hang')return;
    if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Test: Quelle nicht erreichbar.'})});
    const category=url.searchParams.get('category');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,events:[{id:category+'1',title:'Laufende Veranstaltung',category,ongoing:true},{id:category+'2',title:'Geplante Veranstaltung',category,ongoing:false}],discoveryUnavailable:mode==='partial'})});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
   return route.abort();
  });
  await context.routeWebSocket(/.*/,socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(local);await page.waitForFunction(()=>typeof HammerschachLiveBoard!=='undefined');await page.clock.install();
  await page.evaluate(()=>{onlineAuthToken='test-token';onlineAuthUser={id:'test-user',username:'Andili'};updateAuthUi();HammerschachLiveBoard.open('tournament');});
  const dlg=page.locator('#liveBoardView');await page.waitForFunction(()=>document.querySelectorAll('.lb-event').length===2);
  const count=calls;await dlg.locator('#lbEventState').selectOption('live');await dlg.locator('.lb-catalog-form button[type=submit]').click();assert.equal(await dlg.locator('.lb-event').count(),1);assert.equal(calls,count,'Laufend is a local filter, not an upstream request');
  // A filter change may cancel an in-flight refresh, but must clear busy state.
  mode='hang';await dlg.locator('[data-lb=refresh]').click();await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='true');
  await dlg.locator('#lbEventState').selectOption('all');await dlg.locator('.lb-catalog-form button[type=submit]').click();assert.equal(await dlg.locator('[data-lb=refresh]').isEnabled(),true);assert.equal(await dlg.locator('.lb-event').count(),2);assert.doesNotMatch(await dlg.locator('.lb-status').innerText(),/werden geprüft/);
  // An initial timeout in the other category must settle, not restart on focus.
  await page.evaluate(()=>HammerschachLiveBoard.open('club'));await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='true');
  await page.clock.fastForward(25001);await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-status').textContent.includes('Bitte mit'));
  assert.equal(await dlg.locator('[data-lb=refresh]').isEnabled(),true);assert.equal(await dlg.locator('#lbEventState').isVisible(),true);
  const failedCount=calls;await page.clock.fastForward(300000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(calls,failedCount,'no automatic retry loop after catalog timeout');
  mode='ok';await dlg.locator('[data-lb=refresh]').click();await page.waitForFunction(()=>document.querySelectorAll('.lb-event').length===2);
  await dlg.locator('#lbEventState').selectOption('live');await dlg.locator('.lb-catalog-form button[type=submit]').click();assert.equal(await dlg.locator('.lb-event').count(),1);
  mode='error';await dlg.locator('[data-lb=refresh]').click();await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-status').textContent.includes('Test:'));
  assert.equal(await dlg.locator('.lb-event').count(),1,'last catalog survives errors with the Laufend filter');const errorCount=calls;await page.clock.fastForward(300000);assert.equal(calls,errorCount);
  mode='partial';await dlg.locator('[data-lb=refresh]').click();await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-status').textContent.includes('Lichess-Suche'));
  assert.equal(await dlg.locator('.lb-event').count(),1);assert.equal(await dlg.locator('[data-lb=refresh]').isEnabled(),true);
  mode='ok';await page.evaluate(()=>HammerschachLiveBoard.open('tournament'));await page.waitForFunction(()=>document.querySelectorAll('.lb-event').length===2);assert.equal(await dlg.locator('#lbEventState').inputValue(),'all');
  assert.deepEqual(errors,[]);report.push({name,calls,errors});await context.close();
 }
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
