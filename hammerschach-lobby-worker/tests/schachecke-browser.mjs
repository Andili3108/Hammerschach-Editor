// Optional browser integration test: PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE may override local installations.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.join(root,pathname==='/'?'index.html':pathname);const data=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(data);}catch(_){res.statusCode=404;res.end('missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
const report=[];
try{
 for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['ipad',820,1180,true],['iphone',390,844,true]]){
  let user={id:'test-user',username:'Andili',isAdmin:true};const errors=[],requests=[];
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile});
  await context.addInitScript(({user})=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},{user});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();if(url.pathname.startsWith('/api/')){
    requests.push(url.pathname);let data={ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0};
    if(url.pathname==='/api/schachecke/access')data.allowed=user.username==='Andili';
    if(url.pathname==='/api/schachecke/ticker')Object.assign(data,{updatedAt:new Date().toISOString(),nextCheckAt:Date.now()+21600000,items:Array.from({length:10},(_,i)=>({title:'Testmeldung '+(i+1)+' – Schachnachrichten zum Prüfen der Darstellung',source:'Testquelle',url:'https://example.org/'+i,publishedAt:new Date(Date.now()-i*3600000).toISOString()}))});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  }return route.abort();});
  let chatSocket;await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();chatSocket=socket;socket.onMessage(message=>{if(JSON.parse(message).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[],isAdmin:true}));});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(local);
  await page.locator('#lobbyCornerTab').click();await page.waitForFunction(()=>document.querySelectorAll('#weeklyBoard .square').length===64);
  await page.waitForFunction(()=>document.querySelectorAll('#gamerTickerList li').length===10);
  assert.equal(await page.locator('#lobbyChatPanel').isVisible(),false);
  await page.waitForFunction(()=>globalChatConnected);chatSocket.send(JSON.stringify({type:'global_chat_message',message:{id:'hidden-test',senderName:'Testmitglied',text:'Nachricht bei geöffneter Schachecke',sentAt:Date.now()}}));await page.waitForFunction(()=>document.querySelector('#globalChatMessages').textContent.includes('Nachricht bei geöffneter Schachecke'));
  const rects=await page.locator('.corner-card').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
  assert.equal(rects[0].y===rects[1].y,!mobile||width>650);assert.ok(await page.locator('#lobbyCornerPanel').evaluate(e=>e.scrollWidth<=e.clientWidth));
  // Determine the expected task independently from the loaded database.
  const task=await page.evaluate(async()=>{const all=await(await fetch('Trainer/puzzles.json')).json();return HammerschachWeeklyPuzzles.select(all,HammerschachWeeklyPuzzles.week())[0];});
  const square=alg=>page.locator(`#weeklyBoard [data-x="${alg.charCodeAt(0)-97}"][data-y="${8-Number(alg[1])}"]`);
  const initial=await page.locator('#weeklyBoard').innerHTML();
  const wrong=await page.evaluate(task=>{const g=HammerschachWeeklyPuzzles.prepare(task).game;const m=g.legalMoves().find(m=>coordToAlg(...m.from)+coordToAlg(...m.to)!==task.moves[1]);return coordToAlg(...m.from)+coordToAlg(...m.to);},task);
  await square(wrong.slice(0,2)).click();await square(wrong.slice(2,4)).click();assert.match(await page.locator('#weeklyStatus').textContent(),/noch nicht/);assert.equal(await page.locator('#weeklyBoard').innerHTML(),initial);
  await page.locator('#weeklyDay').selectOption('5');await page.locator('#weeklyLevel').selectOption('3');assert.equal(await page.locator('#weeklyBoard .square').count(),64);await page.locator('#weeklyDay').selectOption('0');await page.locator('#weeklyLevel').selectOption('0');

  await page.locator('#weeklyHint').click();assert.match(await page.locator('#weeklyStatus').textContent(),/Tipp:/);
  await page.locator('#weeklyRepeat').click();
  for(let i=1;i<task.moves.length;i+=2){const uci=task.moves[i];if(mobile){await square(uci.slice(0,2)).tap();await square(uci.slice(2,4)).tap();}else{await square(uci.slice(0,2)).click();await square(uci.slice(2,4)).click();}
    if(uci[4]){await page.locator(`#promotionBackdrop [data-piece="${uci[4].toUpperCase()}"]`).click();}
    await page.waitForFunction(()=>!document.querySelector('#weeklyStatus').textContent.includes('Gegenzug'));
  }
  assert.match(await page.locator('#weeklyStatus').textContent(),/Richtig/);
  await page.locator('#weeklyRepeat').click();assert.equal(await page.locator('#weeklyBoard').innerHTML(),initial);
  await page.locator('#weeklySolution').click();await page.waitForFunction(()=>document.querySelector('#weeklyStatus').textContent.includes('Lösung gezeigt'));
  await page.locator('#weeklyRepeat').click();
  await page.evaluate(()=>HammerschachPreferences.set('moveMethod','drag'));
  await page.waitForTimeout(550);
  const uci=task.moves[1],a=await square(uci.slice(0,2)).boundingBox(),b=await square(uci.slice(2,4)).boundingBox();
  if(mobile){const cdp=await context.newCDPSession(page);const point=(r)=>({x:r.x+r.width/2,y:r.y+r.height/2});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(a)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(b)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();}
  await page.waitForFunction(()=>document.querySelector('#weeklyStatus').textContent.includes('Richtig'));
  await page.locator('#weeklyRepeat').click();
  await page.evaluate(()=>{HammerschachPreferences.set('pieces','merida');HammerschachPreferences.set('board','gruen');HammerschachPreferences.set('scheme','dark');});
  await page.waitForFunction(()=>document.documentElement.classList.contains('dark-mode'));
  assert.ok(await page.locator('#weeklyBoard .piece-img').evaluateAll(images=>images.every(img=>img.getAttribute('src').includes('merida'))));
  if(process.env.CORNER_SCREENSHOTS){await fs.mkdir(process.env.CORNER_SCREENSHOTS,{recursive:true});await page.locator('.global-chat-shell').screenshot({path:path.join(process.env.CORNER_SCREENSHOTS,name+'-dark.png')});}
  await page.evaluate(()=>HammerschachPreferences.set('scheme','light'));if(process.env.CORNER_SCREENSHOTS)await page.locator('.global-chat-shell').screenshot({path:path.join(process.env.CORNER_SCREENSHOTS,name+'-light.png')});
  await page.evaluate(()=>{HammerschachPreferences.set('autoQueen',true);onlineGameStarted=true;window.qaPromotion=showPromotionOverlay('w',{forceChoice:true});});await page.locator('#promotionBackdrop [data-piece="N"]').click();assert.equal(await page.evaluate(()=>qaPromotion),'N');await page.evaluate(()=>{onlineGameStarted=false;HammerschachPreferences.set('autoQueen',false);});
  const tickerCalls=requests.filter(x=>x==='/api/schachecke/ticker').length;
  await page.locator('#lobbyChatTab').click();assert.equal(await page.locator('#lobbyChatPanel').isVisible(),true);await page.locator('#lobbyCornerTab').click();assert.equal(requests.filter(x=>x==='/api/schachecke/ticker').length,tickerCalls);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#lobbyCornerPanel').hidden);
  user={id:'normal-user',username:'Mitglied',isAdmin:false};await page.evaluate(user=>{onlineAuthUser=user;updateAuthUi();},user);await page.locator('#lobbyCornerTab').click();assert.equal(await page.locator('#lobbyCornerPanel').isVisible(),false);
  assert.deepEqual(errors,[]);report.push({name,layout:'ok',solve:'ok',drag:mobile?'touch':'mouse',accountGate:'ok',errors});await context.close();
 }
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
