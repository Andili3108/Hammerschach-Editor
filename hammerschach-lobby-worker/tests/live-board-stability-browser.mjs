// Regression: sample ongoing, delayed and failed requests, not only completed
// refreshes. No real network or production credentials are used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root))throw Error();const body=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(body);}catch(_){res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const local='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const report=[];
try{
 for(const [name,width,height,embedded] of [['desktop',1440,1000,false],['ipad',820,1180,false],['iphone',390,844,false],['embedded-desktop',1440,1000,true],['embedded-iphone',390,844,true]]){
  const user={id:'member',username:'Member'};
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});
  await context.addInitScript(user=>{
   localStorage.setItem('hammerschachGamerAuthToken','test');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));
   window.liveAborts=0;const original=window.fetch;window.fetch=function(url,options){if(String(url).includes('/api/live-board/')&&options?.signal)options.signal.addEventListener('abort',()=>window.liveAborts++);return original.call(this,url,options);};
  },user);
  const event={id:'test',title:'Laufende Testpartie',category:'club',sourceType:'lichess'};
  let game={id:'1',board:1,label:'1',white:'White',black:'Black',moves:['e4','e5'],fen:'',variant:'Standard',result:'*',finished:false,clocks:{white:'0:01:00',black:'0:02:00'}};
  let held=false,pending=[],requests=0;
  const respond=route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,event,games:[game],page:1,pages:1,total:1,stale:false,pollAfterMs:game.finished?0:Number(new URL(route.request().url()).searchParams.get('interval')||30000)})});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.href==='https://www.andili.de/live-test')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:1600px;border:0;display:block}</style><div style="height:150px">Testeinbettung</div><iframe src="https://gamer.test/"></iframe><script>addEventListener('message',e=>{if(e.origin==='https://gamer.test'&&e.data?.type==='hammerschach-resize')document.querySelector('iframe').style.height=e.data.height+'px';});</script>`});
   if(url.origin==='https://gamer.test'){
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root))return route.abort();
    try{return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html',body:await fs.readFile(file)});}catch(_){return route.fulfill({status:404,body:''});}
   }
   if(url.origin===local)return route.continue();
   if(url.pathname==='/api/live-board/events')return route.fulfill({json:{ok:true,events:[event]}});
   if(url.pathname.includes('/api/live-board/events/test/boards')){requests++;if(held){pending.push(route);return;}return respond(route);}
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0}});
   return route.abort();
  });
  await context.routeWebSocket(/.*/,socket=>socket.close());
  const hostPage=await context.newPage(),errors=[];hostPage.on('pageerror',e=>errors.push(e.message));
  const testClock=hostPage.clock;await testClock.install();
  await hostPage.goto(embedded?'https://www.andili.de/live-test':local);
  const page=embedded?hostPage.frames().find(f=>f.url().startsWith('https://gamer.test')):hostPage;
  await page.waitForFunction(()=>typeof HammerschachLiveBoard!=='undefined');
  await page.evaluate(user=>{onlineAuthToken='test';onlineAuthUser=user;updateAuthUi();HammerschachLiveBoard.open('club');},user);
  const view=page.locator('#liveBoardView');await view.locator('.lb-event').click();await view.locator('.lb-card').click();await view.locator('.lb-single .lb-board').waitFor();
  await testClock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));
  const white=view.locator('[data-lb-clock="white"]'),black=view.locator('[data-lb-clock="black"]');
  assert.match(await white.textContent(),/^≈ 0:01:00$/);assert.equal(await black.textContent(),'0:02:00');
  await page.evaluate(()=>{window.scrollTo(0,250);window.originalLiveBoard=document.querySelector('.lb-board');});
  if(embedded)await hostPage.evaluate(()=>window.scrollTo(0,250));
  const geometry=async()=>({...await page.evaluate(()=>({scroll:scrollY,height:document.documentElement.scrollHeight,board:document.querySelector('.lb-board').getBoundingClientRect().top+scrollY})),parent:await hostPage.evaluate(()=>({scroll:scrollY,height:document.documentElement.scrollHeight}))});
  const before=await geometry();held=true;const firstCount=requests;
  await testClock.fastForward(10000);await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='true');
  assert.equal(requests,firstCount+1);assert.deepEqual(await geometry(),before,'no layout/scroll jump while request is pending');
  assert.match(await white.textContent(),/^≈ 0:00:50$/);
  await page.evaluate(()=>{const select=document.querySelector('#lbInterval');select.value='5000';select.dispatchEvent(new Event('change'));});
  const aborts=await page.evaluate(()=>window.liveAborts);assert.equal(aborts,0,'interval change does not abort current request');
  await testClock.fastForward(30000);assert.equal(requests,firstCount+1,'long in-flight request remains the only one, even after interval change');
  assert.equal(await page.evaluate(()=>window.liveAborts),0,'request exceeding old 25-second deadline is still allowed to complete');
  assert.deepEqual(await geometry(),before,'pending refresh has stable height');
  held=false;await respond(pending.shift());await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='false');
  assert.match(await white.textContent(),/^≈ 0:00:20$/,'same PGN clocks do not reset countdown');
  assert.equal(await page.evaluate(()=>window.originalLiveBoard===document.querySelector('.lb-board')),true,'same snapshot retains board DOM');
  assert.deepEqual(await geometry(),before);
  const after=requests;await testClock.fastForward(4999);assert.equal(requests,after);await testClock.fastForward(1);await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='false');assert.equal(requests,after+1,'new interval used after old request completes');
  // Changed clock snapshot without a move updates the clock, not the board.
  game={...game,clocks:{white:'0:00:40',black:'0:02:00'}};
  await testClock.fastForward(5000);await page.waitForFunction(()=>document.querySelector('[data-lb-clock="white"]').textContent==='≈ 0:00:40');
  assert.equal(await page.evaluate(()=>window.originalLiveBoard===document.querySelector('.lb-board')),true);assert.deepEqual(await geometry(),before);
  game={...game,moves:['e4','e5','Nf3'],clocks:{white:'0:00:37',black:'0:02:00'}};
  await testClock.fastForward(5000);await page.waitForFunction(()=>document.querySelector('.lb-moves-position').textContent.startsWith('3 /'));
  assert.equal(await white.textContent(),'0:00:37');assert.equal(await black.textContent(),'≈ 0:02:00');assert.deepEqual(await geometry(),before,'new move retains document height and scroll position');
  // Timeout is recoverable; user cadence must not override error backoff.
  held=true;await testClock.fastForward(5000);await page.waitForFunction(()=>document.querySelector('#liveBoardView').getAttribute('aria-busy')==='true');
  await testClock.fastForward(45000);await page.waitForFunction(()=>document.querySelector('.lb-status').textContent.includes('neuer Versuch'));
  const frozen=await black.textContent();const failedCount=requests;
  await page.evaluate(()=>{const select=document.querySelector('#lbInterval');select.value='10000';select.dispatchEvent(new Event('change'));});
  await testClock.fastForward(10000);assert.equal(requests,failedCount);assert.equal(await black.textContent(),frozen,'clock pauses on error');
  await pending.shift().abort().catch(()=>{});held=false;
  await testClock.fastForward(50000);await page.waitForFunction(()=>document.querySelector('.lb-status').textContent==='');assert.equal(requests,failedCount+1,'automatic recovery after error');
  game={...game,finished:true,result:'1-0'};
  await testClock.fastForward(10000);await page.waitForFunction(()=>document.querySelector('.lb-game-heading').textContent.includes('1-0'));
  const done=requests;const stopped=await black.textContent();await testClock.fastForward(60000);assert.equal(requests,done);assert.equal(await black.textContent(),stopped);assert.ok(!stopped.includes('≈'));
  assert.deepEqual(errors,[]);report.push({name,requests,errors});await context.close();
 }
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
