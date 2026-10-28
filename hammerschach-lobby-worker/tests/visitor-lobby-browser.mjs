// Run with PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE when not installed globally.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleLiveBoardApi} from '../src/live-board.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_PAGE_DISCOVERY:'0',LIVE_BOARD_CHESSBASE_DISCOVERY:'0',LIVE_BOARD_DEMO:'1',LIVE_BOARD_EVENTS:JSON.stringify([{id:'demo',category:'tournament',title:'Testturnier',source:{type:'demo'}}])};
const helpers={json:(d,i)=>Response.json(d,i),bearerTokenFromRequest:()=>'',lookupAuthSession:async()=>null};
try{
 for(const [name,width,height,touch,dark] of [['desktop',1440,1100,false,false],['tablet',820,1180,true,false],['phone',390,844,true,false],['phone-dark',390,844,true,true]]){
  const errors=[],requests=[],sockets=[];let member=false;
  const user={id:'member-test',username:'Testmitglied',isAdmin:false};
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  if(dark)await context.addInitScript(()=>{try{localStorage.setItem('hammerschachGamerColorScheme','dark')}catch{}});
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin===local)return route.continue();
    if(!u.pathname.startsWith('/api/'))return route.abort();requests.push([req.method(),u.pathname]);
    if(u.pathname.startsWith('/api/live-board/')){const r=await handleLiveBoardApi(new Request(u),env,u,helpers);return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});}
    let data={ok:true,user:member?user:null,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0};
    if(u.pathname==='/api/account/lobby-welcome')data.firstVisit=false;
    if(u.pathname==='/api/schachecke/access')data.allowed=true;
    if(u.pathname==='/api/schachecke/ticker')Object.assign(data,{nextCheckAt:Date.now()+21600000,items:Array.from({length:9},(_,i)=>({title:'Schachmeldung '+(i+1),source:'Testquelle',url:'https://example.org/'+i,publishedAt:new Date().toISOString()}))});
    if(u.pathname==='/api/info-center')data.items=Array.from({length:4},(_,i)=>({id:'news'+i,title:'Neuigkeit '+(i+1),categoryLabel:'Neuigkeit'}));
    if(u.pathname.startsWith('/api/info-center/'))data.item={id:u.pathname.split('/').at(-1),title:'Zusammen spielen',body:'Spielt zu zweit an einem Gerät.'};
    if(u.pathname==='/api/open-offers')data.offers=[{roomId:'Test1234',creatorName:'Schachfreund',variant:'classic',mode:'live',createdAt:new Date().toISOString()}];
    if(u.pathname==='/api/tv')data.tv={version:2,slots:[1,2,3].map(n=>({slotId:'tv'+n,enabled:true,title:'TV '+n,stream:{kind:'video',videoId:'abcdefghij'+n},liveBoardsEnabled:true,liveBoardEvents:[{id:'demo',title:'Testturnier',category:'tournament'}]}))};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.routeWebSocket(/.*/,socket=>{sockets.push(socket.url());if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(local);await page.waitForFunction(()=>document.querySelectorAll('#weeklyBoard .square').length===64&&document.querySelectorAll('#infoCenterOverviewList button').length===4);
  assert.equal(await page.locator('#visitorWelcome').isVisible(),true);
  assert.equal(await page.locator('#lobbyChatPanel').isVisible(),false);
  assert.equal(await page.locator('.global-chat-header').isVisible(),false);
  assert.equal(await page.locator('#gamerTickerList li').count(),9);
  assert.equal(await page.locator('#visitorBoardOverlay').count(),0);
  assert.equal(await page.locator('#board').isVisible(),false);
  assert.equal(sockets.length,0,'visitors never connect to member chat');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'visitor-'+name+'.png'),fullPage:true});
  // Tap the same shared menu controls as users; desktop uses the original header.
  async function nav(id,group){
    if(touch){await page.locator('#mobileNavTestOpen').click();if(group)await page.locator(`[data-mobile-nav-accordion-source="${group}"] > button`).click();await page.locator(`[data-mobile-nav-target="${id}"]`).click();}
    else{if(group)await page.locator('#'+group+'Btn').click();await page.locator('#'+id).click();}
  }
  // Check the first page load before opening any dialog can refresh account UI.
  async function checkLiveboardMenu(){
    if(touch){await page.locator('#mobileNavTestOpen').click();await page.locator('[data-mobile-nav-accordion-source="clubChessMenu"] > button').click();}
    else await page.locator('#clubChessMenuBtn').click();
    for(const id of ['liveBoardClubBtn','liveBoardTournamentBtn']){
      const selector=touch?`[data-mobile-nav-target="${id}"]`:'#'+id;
      assert.equal(await page.locator(selector).isVisible(),true,name+': '+id+' visible on first load');
    }
    if(touch)await page.locator('#mobileNavTestClose').click();else await page.locator('#clubChessMenuBtn').click();
  }
  await checkLiveboardMenu();
  await page.locator('#visitorBoardLoginBtn').click();await page.locator('#authBackdrop').waitFor({state:'visible'});await page.evaluate(()=>closeAuthDialog());
  await page.locator('#infoCenterOverviewList button').first().click();await page.waitForFunction(()=>document.querySelector('#infoCenterDetail').textContent.includes('Spielt zu zweit'));await page.locator('#infoCenterCloseTopBtn').click();
  await page.locator('#weeklyHint').click();assert.match(await page.locator('#weeklyStatus').textContent(),/Tipp:/);await page.locator('#weeklyRepeat').click();
  // Protected training and own games explain membership without opening the tool.
  for(const [id,group] of [['analyzerToolBtn','toolsMenu'],['playerToolBtn','toolsMenu'],['openingsToolBtn','toolsMenu'],['schachlaborToolBtn','toolsMenu'],['dailyGamesOpenBtn','gamesMenu'],['gameArchiveOpenBtn','gamesMenu']]){
    await nav(id,group);await page.locator('.members-only-dialog').waitFor({state:'visible'});await page.locator('[data-member-close]').click();
    if(!touch)await page.keyboard.press('Escape');
  }
  if(touch){await page.locator('#mobileNavTestOpen').click();await page.locator('#mobileNavTestPrimary').click();}else await page.locator('#newGameOpenBtn').click();
  await page.locator('#localPlayPanel').waitFor({state:'visible'});await page.locator('#onlinePlayTab').click();await page.locator('.members-only-dialog').waitFor({state:'visible'});await page.locator('[data-member-close]').click();
  await page.locator('#localGameStartBtn').click();assert.equal(await page.locator('#localGameRoom').isVisible(),true);
  await page.locator('#localBoard [data-square="e2"]').click();await page.locator('#localBoard [data-square="e4"]').click();
  assert.equal(await page.locator('#localBoard [data-square="e2"] img:not([hidden])').count(),0);assert.equal(await page.locator('#localBoard [data-square="e4"] img:not([hidden])').count(),1);
  await page.evaluate(()=>HammerschachLocalPlay.requestExit());await page.locator('[data-action="confirm-prompt"]').click();await page.locator('#visitorWelcome').waitFor({state:'visible'});
  // Fresh entry after local-session test.
  await page.goto(local+'/?fresh=1');await page.waitForFunction(()=>!document.querySelector('#visitorWelcome').hidden);
  await nav('openOffersOpenBtn');await page.locator('.open-offer-actions button').click();await page.locator('#authBackdrop').waitFor({state:'visible'});assert.match(await page.locator('#authError').textContent(),/registriere dich kostenlos/);assert.equal(requests.some(([m,p])=>m==='POST'&&p.startsWith('/api/open-offers/')),false);await page.evaluate(()=>closeAuthDialog());
  await nav('tvToolBtn');await page.waitForFunction(()=>!document.querySelector('#tvPlayerFrame').hidden);assert.equal(await page.locator('#tvAdminCard').isVisible(),false);
  await page.locator('[data-tv-slot="tv2"]').click();assert.match(await page.locator('#tvPlayerFrame').getAttribute('src'),/abcdefghij2/);
  await page.locator('#tvLiveBoardsOpen').click();await page.locator('[data-tv-lb="favorites"]').selectOption('demo');await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length>0);
  await page.locator('[data-tv-lb="close"]').click();await page.evaluate(()=>closeEmbeddedTools());
  await nav('liveBoardTournamentBtn','clubChessMenu');await page.getByRole('button',{name:/Testturnier/}).click();await page.waitForFunction(()=>document.querySelectorAll('#liveBoardView .lb-card').length>0);assert.equal(await page.locator('.lb-add').isVisible(),false);await page.evaluate(()=>closeEmbeddedTools());
  // Identity transitions must restore the original member navigation and clear it on logout.
  member=true;await page.evaluate(user=>saveAuthState('test-token',user),user);await page.waitForFunction(()=>document.documentElement.classList.contains('member-lobby-view'));
  assert.equal(await page.locator('#visitorWelcome').isVisible(),false);assert.equal(await page.locator('.global-chat-header').isVisible(),true);
  if(!touch){assert.equal(await page.locator('#profileOpenBtn').isVisible(),true);await page.locator('#toolsMenuBtn').click();await page.locator('#analyzerToolBtn').click();assert.equal(await page.locator('#analyzerToolView').isVisible(),true);await page.evaluate(()=>closeEmbeddedTools());}
  await page.reload();await page.waitForFunction(()=>document.documentElement.classList.contains('member-lobby-view'));await checkLiveboardMenu();
  member=false;await page.evaluate(()=>saveAuthState('',null));await page.waitForFunction(()=>document.querySelectorAll('#infoCenterOverviewList button').length===4&&!document.querySelector('#visitorWelcome').hidden);
  assert.equal(await page.locator('.global-chat-header').isVisible(),false);assert.deepEqual(errors,[],name+' browser errors');
  console.log(name+': passed');await context.close();
 }
}finally{await browser.close();server.close();}
