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
    const data=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(data);
  }catch(_){res.statusCode=404;res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const report=[];
try{
 for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['ipad',820,1180,true],['iphone',390,844,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  await context.addInitScript(({user})=>{
   localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));
   window.engineCommands=[];window.activeEngineWorkers=0;
   const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{
    constructor(url,...args){super(url,...args);this.live=String(url).includes('/LiveBoard/');if(this.live)window.activeEngineWorkers++;}
    postMessage(message,...args){if(this.live)window.engineCommands.push(message);super.postMessage(message,...args);}
    terminate(){if(this.live){window.activeEngineWorkers--;this.live=false;}super.terminate();}
   };
  },{user});
  let finished=false,extra=false,missing=false;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===local){if(missing&&url.pathname.includes('/LiveBoard/'))return route.fulfill({status:404,body:'missing'});return route.continue();}
   if(url.pathname.startsWith('/api/live-board/')){
    const response=await handleLiveBoardApi(new Request(req.url(),{headers:req.headers()}),env,url,helpers);const data=await response.json();
    if(data.games)for(const g of data.games){g.moves=['e4','e5','Nf3','Nc6',...(extra?['Bb5']:[])];g.finished=finished;g.result=finished?'1-0':'*';g.headers={Site:'Hamm',Date:'2026.10.08',WhiteElo:'2100',BlackElo:'2050',ECO:'C20'};}
    return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
   return route.abort();
  });
  await context.routeWebSocket(/.*/,socket=>socket.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(local);await page.waitForFunction(()=>typeof HammerschachLiveBoard!=='undefined');
  await page.evaluate(()=>{onlineAuthToken='test-token';onlineAuthUser={id:'test-user',username:'Andili'};updateAuthUi();HammerschachLiveBoard.open('club');});
  const dlg=page.locator('#liveBoardView');await dlg.locator('.lb-event').click();await dlg.locator('.lb-card').first().click();await dlg.locator('.lb-single .lb-board').waitFor();
  assert.equal(await dlg.locator('.lb-pgn').count(),0);assert.equal(await page.evaluate(()=>activeEngineWorkers),0);
  assert.deepEqual(await dlg.getByRole('tab').allTextContents(),['Zugliste','Engine','Partie']);
  assert.equal(await dlg.getByRole('tab').evaluateAll(els=>new Set(els.map(el=>el.getBoundingClientRect().y)).size),1,'three tabs share one row');
  await dlg.getByRole('tab',{name:'Partie',exact:true}).click();assert.match(await dlg.locator('#lbGamePanel').innerText(),/2100/);
  const shots=process.env.LIVE_BOARD_SCREENSHOTS;if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'-partie.png')});}
  await dlg.getByRole('tab',{name:'Engine',exact:true}).click();assert.equal(await page.evaluate(()=>activeEngineWorkers),0);
  await dlg.locator('#lbEnginemode').selectOption('time');await dlg.locator('#lbEnginetime').fill('150');await dlg.locator('#lbEnginetime').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent==='Analyse abgeschlossen',{},{timeout:30000});
  assert.match(await dlg.locator('.lb-engine-results').innerText(),/Bestzug: (?!–)/);assert.equal(await page.evaluate(()=>activeEngineWorkers),1);
  await dlg.locator('#lbEngineAuto').check();
  const ownBefore=await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex}));
  await dlg.getByRole('button',{name:'Startstellung',exact:true}).click();
  await dlg.getByRole('button',{name:'Nächster Zug',exact:true}).click();
  await dlg.getByRole('button',{name:'Nächster Zug',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent==='Analyse abgeschlossen');
  const position=await page.evaluate(()=>engineCommands.filter(x=>x.startsWith('position fen ')).at(-1));assert.match(position,/ w KQkq e6 0 2$/);
  const before=await page.evaluate(()=>engineCommands.filter(x=>x.startsWith('position fen ')).length);
  extra=true;await dlg.locator('[data-lb="refresh"]').click();await page.waitForFunction(()=>document.querySelector('.lb-moves-position').textContent==='2 / 5');
  assert.equal(await page.evaluate(()=>engineCommands.filter(x=>x.startsWith('position fen ')).length),before,'incoming live move must not change a historical analysis');
  await dlg.getByRole('button',{name:'Aktueller Stand',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent==='Analyse abgeschlossen');
  assert.match(await page.evaluate(()=>engineCommands.filter(x=>x.startsWith('position fen ')).at(-1)),/ b KQkq - 3 3$/);
  assert.equal(await page.evaluate(()=>JSON.stringify({history:masterHistory,setup:currentGameSetup,view:viewIndex})),ownBefore);
  assert.equal(await dlg.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  if(shots){await dlg.locator('.lb-moves-panel').screenshot({path:path.join(shots,name+'-engine-panel.png')});}
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>activeEngineWorkers),0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent==='Analyse abgeschlossen');
  await dlg.locator('#lbEngineStop').click();assert.equal(await page.evaluate(()=>activeEngineWorkers),0);assert.equal(await dlg.locator('#lbEngineAuto').isChecked(),false);
  finished=true;await dlg.locator('[data-lb="refresh"]').click();await dlg.locator('.lb-pgn').waitFor();await dlg.getByRole('button',{name:'Startstellung',exact:true}).click();
  const pgnBox=await dlg.locator('.lb-pgn').boundingBox(),navBox=await dlg.locator('.gamer-board-nav').boundingBox();assert.ok(pgnBox.x>=navBox.x+navBox.width-1,'PGN sits right of move navigation');
  if(shots)await dlg.locator('.lb-single-layout').screenshot({path:path.join(shots,name+'-finished.png')});
  const dl=page.waitForEvent('download');await dlg.locator('.lb-pgn').click();const download=await dl;const pgn=await fs.readFile(await download.path(),'utf8');assert.match(pgn,/\[WhiteElo "2100"\]/);assert.match(pgn,/1\. e4 e5 2\. Nf3 Nc6 3\. Bb5 1-0/);
  // Missing worker files yield a recoverable notice, leaving navigation and PGN usable.
  missing=true;await dlg.locator('#lbEngineAnalyze').click();await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent.includes('nicht erreichbar'));
  assert.equal(await page.evaluate(()=>activeEngineWorkers),0);assert.equal(await dlg.locator('.lb-pgn').isVisible(),true);
  missing=false;await dlg.locator('#lbEngineAnalyze').click();await page.waitForFunction(()=>document.querySelector('.lb-engine-status')?.textContent==='Analyse abgeschlossen');
  await page.evaluate(()=>HammerschachLiveBoard.open('tournament'));await dlg.locator('.lb-event').waitFor();assert.equal(await page.evaluate(()=>activeEngineWorkers),0);
  await dlg.locator('.lb-event').click();await dlg.locator('.lb-card').first().click();await dlg.locator('.lb-single .lb-board').waitFor();assert.equal(await dlg.getByRole('tab').count(),3);
  assert.deepEqual(errors,[]);report.push({name,engine:'Stockfish supplied by user',pgn:'complete',errors});await context.close();
 }
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
