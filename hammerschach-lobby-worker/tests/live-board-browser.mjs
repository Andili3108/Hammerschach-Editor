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
    const originalCatalog=env.LIVE_BOARD_EVENTS;
    env.LIVE_BOARD_EVENTS=JSON.stringify([
      {id:'hamm',title:'Hamm Vereinsabend',category:'club',clubScope:'hamm',source:{type:'demo'}},
      {id:'ruhr',title:'SVRuhrgebiet Verbandsliga',category:'club',clubScope:'ruhrgebiet',source:{type:'demo'}},
      {id:'nrw',title:'NRW-Liga',category:'club',source:{type:'demo'}},
      {id:'bund',title:'German Bundesliga',category:'tournament',source:{type:'demo'}},
      {id:'unna',title:'Unna Open',category:'tournament',source:{type:'demo'}}]);
    await dlg.locator('[data-lb="refresh"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.lb-scope-heading').length===4);
    assert.deepEqual(await dlg.locator('.lb-scope-heading').allTextContents(),['Bundesliga','Schachbund NRW (SBNRW)','Schachverband Ruhrgebiet (SVRuhrgebiet)','Schachbezirk Hamm (SBHamm)']);
    assert.equal(await dlg.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'regional catalog fits viewport');
    await dlg.locator('#lbClubScope').selectOption('hamm');
    await dlg.locator('.lb-catalog-form button[type=submit]').click();
    assert.equal(await dlg.locator('.lb-event').count(),1);
    assert.match(await dlg.locator('.lb-event').innerText(),/Hamm Vereinsabend/);
    await dlg.locator('.lb-add summary').click();
    assert.equal(await dlg.locator('[name="clubScope"]').isVisible(),true);
    await dlg.locator('[name="clubScope"]').selectOption('hamm');
    assert.equal(await dlg.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'source form fits viewport');
    await dlg.locator('.lb-add summary').click();
    await page.evaluate(()=>HammerschachLiveBoard.open('tournament'));
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-event strong')?.textContent==='Unna Open');
    assert.equal(await dlg.locator('.lb-event').count(),1,'Bundesliga is absent from tournaments');
    assert.equal(await dlg.locator('.lb-scope-filter').isVisible(),false);
    assert.equal(await dlg.locator('[name="clubScope"]').isDisabled(),true);
    env.LIVE_BOARD_EVENTS=originalCatalog;
    await page.evaluate(()=>HammerschachLiveBoard.open('club'));
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-event strong')?.textContent==='Vereinsabend · Testübertragung');

    // Cross-event search runs only on submit and only 12 events per action.
    env.LIVE_BOARD_EVENTS=JSON.stringify(Array.from({length:15},(_,i)=>({id:'search'+i,title:'Suchveranstaltung '+i,category:'club',clubScope:i===0?'berlin':'nrw',source:{type:'demo'}})));
    await dlg.locator('[data-lb="refresh"]').click();
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-event strong')?.textContent.startsWith('Suchveranstaltung'));
    const beforeTyping=liveCalls;
    await dlg.locator('#lbPlayerSearch').fill('5 Schwarz');
    await dlg.locator('#lbClubScope').selectOption('berlin');
    assert.equal(liveCalls,beforeTyping,'typing and filter selection do not fetch');
    assert.equal(await dlg.locator('.lb-event').count(),8,'filter is not applied before submit');
    await dlg.locator('.lb-catalog-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.lb-status').textContent.startsWith('1 / 1'));
    assert.equal(await dlg.locator('.lb-player-event').count(),1);
    assert.match(await dlg.locator('.lb-player-event h3').innerText(),/Suchveranstaltung 0/);
    await dlg.locator('#lbClubScope').selectOption('');
    await dlg.locator('.lb-catalog-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.lb-status').textContent.includes('12 / 15')&&!document.querySelector('[data-lb="search-more"]').disabled);
    assert.equal(await dlg.locator('.lb-player-event').count(),12);
    await dlg.locator('[data-lb="search-more"]').click();
    await page.waitForFunction(()=>document.querySelector('.lb-status').textContent.startsWith('15 / 15'));
    assert.equal(await dlg.locator('.lb-player-event').count(),15);
    assert.equal(await dlg.locator('[data-lb="search-more"]').isVisible(),false);
    await dlg.locator('.lb-player-event button').first().click();
    await dlg.locator('.lb-single .lb-board').waitFor();
    assert.match(await dlg.locator('.lb-game-heading').innerText(),/Brett 5/);
    await dlg.locator('[data-lb="back"]').click();await dlg.locator('.lb-grid').waitFor();
    await dlg.locator('[data-lb="back"]').click();
    assert.equal(await dlg.locator('.lb-player-event').count(),15,'return keeps search results');
    slow=true;
    await dlg.locator('.lb-catalog-form button[type=submit]').click();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const interrupted=liveCalls;await new Promise(r=>setTimeout(r,350));assert.equal(liveCalls,interrupted,'hidden search sends no further batches');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await dlg.locator('[data-lb="search-more"]').isEnabled(),true,'interrupted search can resume explicitly');
    slow=false;await dlg.locator('[data-lb="search-more"]').click();
    await page.waitForFunction(()=>document.querySelector('.lb-status').textContent.includes('12 / 15')&&!document.querySelector('[data-lb="search-more"]').disabled);

    await dlg.locator('[data-lb="reset-filters"]').click();
    env.LIVE_BOARD_EVENTS=originalCatalog;await dlg.locator('[data-lb="refresh"]').click();
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-event strong')?.textContent==='Vereinsabend · Testübertragung');

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
    await dlg.locator('.lb-card').first().click();await dlg.locator('.lb-single .lb-board').waitFor();
    await dlg.getByRole('tab',{name:'Aktualisierung',exact:true}).click();await dlg.locator('#lbInterval').selectOption('5000');
    const finishedSingle=liveCalls;await page.clock.fastForward(60000);assert.equal(liveCalls,finishedSingle,'finished single never restarts polling when interval changes');
    await dlg.locator('#lbInterval').selectOption('10000');
    await dlg.locator('[data-lb="back"]').click();await dlg.locator('.lb-grid').waitFor();

    if(!await dlg.locator('#lbSearch').isVisible())await dlg.locator('.lb-search-panel summary').click();
    await dlg.locator('#lbSearch').fill('Schwarz 5');await dlg.locator('.lb-search-panel form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length===1);
    await dlg.locator('.lb-card[role="button"]').click();await dlg.locator('.lb-single .lb-board').waitFor();
    assert.equal(await dlg.locator('.lb-board').count(),1);
    const boardBox=await dlg.locator('.lb-board').boundingBox(),notationBox=await dlg.locator('.lb-moves-panel').boundingBox();
    assert.ok(width>760?notationBox.x>=boardBox.x+boardBox.width:notationBox.y>=boardBox.y+boardBox.height,'notation follows Gamer responsive layout');
    assert.equal(await dlg.locator('.board-player-strip').count(),2);
    assert.equal(await dlg.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'single view has no horizontal overflow');
    if(shotDir)await page.screenshot({path:path.join(shotDir,name+'-single.png')});
    await dlg.getByRole('button',{name:'Startstellung'}).click();assert.match(await dlg.locator('.lb-moves-position').innerText(),/0 \/ /);
    await dlg.getByRole('button',{name:'Aktueller Stand'}).click();
    const gameBefore=await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex}));
    await dlg.getByRole('button',{name:'Brett drehen'}).click();assert.equal(await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex})),gameBefore,'passive viewer leaves own game alone');
    // The Gamer-style tabs do not fetch or alter the position.
    const beforeTabs=liveCalls;
    await dlg.getByRole('tab',{name:'Aktualisierung',exact:true}).click();
    assert.equal(await dlg.locator('#lbInterval').inputValue(),'10000');
    assert.equal(await dlg.locator('#lbMovesPanel').isVisible(),false);
    assert.equal(await dlg.locator('.lb-board').isVisible(),true);
    assert.equal(liveCalls,beforeTabs);
    for(const interval of [5000,15000,30000,10000]){
      await dlg.locator('#lbInterval').selectOption(String(interval));
      const before=liveCalls;
      await page.clock.fastForward(interval-1);assert.equal(liveCalls,before,'no poll before selected interval');
      await page.clock.fastForward(1);await page.waitForFunction(()=>!document.querySelector('#liveBoardView [data-lb="refresh"]').disabled);
      assert.equal(liveCalls,before+1,'one poll at selected interval');
      assert.equal(await dlg.getByRole('tab',{name:'Aktualisierung',exact:true}).getAttribute('aria-selected'),'true');
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('hammerschachLiveInterval:test-user')),'10000');
    if(shotDir)await page.screenshot({path:path.join(shotDir,name+'-refresh-tab.png')});
    await dlg.getByRole('tab',{name:'Zugliste',exact:true}).click();
    assert.equal(await dlg.locator('#lbMovesPanel').isVisible(),true);
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
    assert.equal(await page.locator('#liveBoardClubBtn').evaluate(el=>el.hidden),false);
    assert.equal(await page.locator('#liveBoardTournamentBtn').evaluate(el=>el.hidden),false);
    await page.evaluate(()=>HammerschachLiveBoard.open('club'));await dlg.locator('.lb-event').waitFor();
    assert.equal(await dlg.locator('.lb-add').isVisible(),false);
    assert.deepEqual(errors,[],'no browser JavaScript errors');
    report.push({name,liveCalls,errors});await context.close();
  }
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
