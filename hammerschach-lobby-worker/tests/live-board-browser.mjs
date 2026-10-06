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
    await context.addInitScript(({user})=>{
      localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));
    },{user});
    let liveCalls=0,slow=false,unauthorized=false;
    await context.route('**/*',async route=>{
      const req=route.request();const url=new URL(req.url());
      if(url.origin===local)return route.continue();
      if(url.pathname.startsWith('/api/live-board/')){
        liveCalls++;if(slow)await new Promise(r=>setTimeout(r,250));
        const request=new Request(req.url(),{headers:unauthorized?{}:req.headers()});
        const response=await handleLiveBoardApi(request,env,url,helpers);
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
      return route.abort();
    });
    await context.routeWebSocket(/.*/,socket=>socket.close());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(local);await page.waitForFunction(()=>typeof HammerschachLiveBoard!=='undefined');
    await page.evaluate(()=>{onlineAuthToken='test-token';onlineAuthUser={id:'test-user',username:'Andili'};updateAuthUi();});
    assert.equal(liveCalls,0,'closed module must not fetch');
    if(name==='desktop'){
      await page.locator('#clubChessMenuBtn').click();await page.locator('#liveBoardClubBtn').click();
    }else{
      await page.locator('#mobileNavTestOpen').click();
      await page.locator('[aria-controls="mobileNavClubChessPanel"]').click();
      await page.locator('#mobileNavClubChessPanel [data-mobile-nav-target="liveBoardClubBtn"]').click();
    }
    const dlg=page.locator('#liveBoardView');await dlg.locator('.lb-event').waitFor();
    await dlg.locator('.lb-event').click();await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length===4);
    assert.equal(await dlg.locator('.lb-board').count(),4);
    assert.equal(await page.locator('dialog[open]').count(),0);
    assert.equal(await page.locator('#roomLobbyBtn').evaluate(el=>el.hidden),false);
    assert.equal(await page.locator('.member-lobby').isVisible(),false);
    assert.equal(await dlg.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'no horizontal overflow');
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-pages').getBoundingClientRect().bottom<=innerHeight+2);
    assert.equal(await page.locator('.site-footnote').count(),1);
    assert.equal(await dlg.locator('.site-footnote').isVisible(),true);
    assert.equal(await dlg.locator('[data-lb="lobby"],.lb-passive,.lb-clock-note').count(),0);
    const shotDir=process.env.LIVE_BOARD_SCREENSHOTS;
    if(shotDir){await fs.mkdir(shotDir,{recursive:true});await page.screenshot({path:path.join(shotDir,name+'-overview.png')});}
    await dlg.locator('[data-lb="next"]').click();await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-pages span').textContent.startsWith('Seite 2'));
    await dlg.locator('[data-lb="next"]').click();await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length===2);
    await page.clock.install();const stopped=liveCalls;await page.clock.fastForward(90000);assert.equal(liveCalls,stopped,'finished page must not poll');
    if(!await dlg.locator('#lbSearch').isVisible())await dlg.locator('.lb-search-panel summary').click();
    await dlg.locator('#lbSearch').fill('Schwarz 5');await dlg.locator('.lb-search-panel form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length===1);
    await dlg.locator('.lb-card[role="button"]').click();await dlg.locator('.lb-single .lb-board').waitFor();
    assert.equal(await dlg.locator('.lb-board').count(),1);
    if(shotDir)await page.screenshot({path:path.join(shotDir,name+'-single.png')});
    await dlg.getByRole('button',{name:'Startstellung'}).click();assert.match(await dlg.locator('.lb-replay').innerText(),/0 \/ /);
    await dlg.getByRole('button',{name:'Aktueller Stand'}).click();
    const gameBefore=await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex}));
    await dlg.getByRole('button',{name:'Brett drehen'}).click();assert.equal(await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex})),gameBefore,'passive viewer leaves own game alone');
    const active=liveCalls;await page.clock.fastForward(31000);await page.waitForFunction(()=>!document.querySelector('#liveBoardView [data-lb="refresh"]').disabled);assert.equal(liveCalls,active+1,'single view has one poll');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const paused=liveCalls;await page.clock.fastForward(120000);assert.equal(liveCalls,paused,'background pauses');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>!document.querySelector('#liveBoardView [data-lb="refresh"]').disabled);assert.equal(liveCalls,paused+1);
    unauthorized=true;await page.clock.fastForward(31000);await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-status').textContent.includes('abgelaufen'));
    assert.equal(await dlg.locator('.lb-board').count(),0,'expired session clears private data');const denied=liveCalls;await page.clock.fastForward(120000);assert.equal(liveCalls,denied);
    await page.locator('#roomLobbyBtn').evaluate(el=>el.click());unauthorized=false;
    await page.evaluate(()=>HammerschachLiveBoard.open('tournament'));await dlg.locator('.lb-event').waitFor().catch(async e=>{console.error(name,await dlg.innerText(),await page.evaluate(()=>({open:!document.querySelector('#liveBoardView').hidden,token:onlineAuthToken,hidden:document.hidden})));throw e;});assert.match(await dlg.locator('.lb-event').innerText(),/Gamer Open/);
    // A late response from a departed event must not replace the catalog.
    slow=true;await dlg.locator('.lb-event').click();
    await page.locator('#roomLobbyBtn').evaluate(el=>el.click());
    await new Promise(r=>setTimeout(r,350));
    assert.equal(await dlg.locator('.lb-board').count(),0);
    assert.equal(await dlg.evaluate(el=>!el.hidden),false);assert.equal(await page.locator('.member-lobby .site-footnote').isVisible(),true);slow=false;
    await page.evaluate(()=>HammerschachLiveBoard.open('club'));await dlg.locator('.lb-event').waitFor();
    await page.evaluate(()=>setEmbeddedToolActive('league-standings'));
    assert.equal(await dlg.evaluate(el=>el.hidden),true);
    assert.equal(await page.locator('#leagueStandingsView').isVisible(),true);
    const left=liveCalls;await page.clock.fastForward(60000);assert.equal(liveCalls,left);
    await page.evaluate(()=>HammerschachLiveBoard.open('club'));await dlg.locator('.lb-event').waitFor();
    await page.evaluate(()=>{onlineAuthToken='';onlineAuthUser=null;updateAuthUi();});assert.equal(await dlg.evaluate(el=>!el.hidden),false);assert.equal(await page.locator('#liveBoardClubBtn').evaluate(el=>el.hidden),true);
    await page.evaluate(()=>{onlineAuthToken='test-token';onlineAuthUser={id:'other',username:'Other'};updateAuthUi();});
    assert.equal(await page.locator('#liveBoardClubBtn').evaluate(el=>el.hidden),true);
    assert.equal(await page.locator('#liveBoardTournamentBtn').evaluate(el=>el.hidden),true);
    const guest=liveCalls;await page.evaluate(()=>HammerschachLiveBoard.open('club'));await page.clock.fastForward(60000);assert.equal(liveCalls,guest);
    assert.deepEqual(errors,[],'no browser JavaScript errors');
    report.push({name,liveCalls,errors});await context.close();
  }
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
