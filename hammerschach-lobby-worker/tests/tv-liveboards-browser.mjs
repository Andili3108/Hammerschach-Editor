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
const user={id:'test-user',username:'Andili',isAdmin:true};
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
try{
  for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['ipad',820,1180,true],['iphone',390,844,true]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
    await context.addInitScript(({user})=>{if(window!==window.top)return;localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},{user});
    let config={version:2,slots:[{slotId:'tv1',enabled:true,liveBoardsEnabled:true,liveBoardEvents:[{id:'open',title:'Gamer Open',category:'tournament'}],mode:'manual',stream:{kind:'video',videoId:'abcdefghijk',status:'live'}},{slotId:'tv2',enabled:true,liveBoardsEnabled:false},{slotId:'tv3',enabled:true,liveBoardsEnabled:true}]};
    let liveCalls=0;
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===local)return route.continue();
      if(url.pathname.startsWith('/api/live-board/')){
        liveCalls++;const response=await handleLiveBoardApi(new Request(req.url(),{headers:req.headers()}),env,url,helpers);
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      }
      if(url.pathname==='/api/admin/tv'&&req.method()==='POST'){config={...req.postDataJSON()};return route.fulfill({json:{ok:true,tv:config}});}
      if(url.pathname==='/api/tv')return route.fulfill({json:{ok:true,tv:config}});
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0}});
      return route.abort();
    });
    await context.routeWebSocket(/.*/,socket=>socket.close());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(local);await page.waitForFunction(()=>typeof TvLiveBoards!=='undefined');
    await page.evaluate(user=>{onlineAuthToken='test-token';onlineAuthUser=user;updateAuthUi();},user);
    // Record the original single-board size for an exact comparison.
    await page.evaluate(()=>HammerschachLiveBoard.open('tournament'));
    await page.locator('#liveBoardView .lb-event').first().click();await page.locator('#liveBoardView .lb-card').first().click();
    const normalBoard=await page.locator('#liveBoardView .lb-board').boundingBox();
    await page.evaluate(()=>openEmbeddedToolFromCurrentContext('tv'));
    await page.locator('#tvLiveBoardsOpen').waitFor({state:'visible'});
    await page.evaluate(()=>{window.testFrame=document.getElementById('tvPlayerFrame');window.testSrc=testFrame.src;window.frameChanges=[];window.frameObserver=new MutationObserver(records=>frameChanges.push(...records.map(r=>r.attributeName)));frameObserver.observe(testFrame,{attributes:true,attributeFilter:['src']});});
    await page.locator('#tvLiveBoardsOpen').click();
    const shell=page.locator('#tvLiveBoardWindow');await shell.waitFor({state:'visible'});
    await page.locator('[data-tv-lb="favorites"]').selectOption('open');
    await page.locator('#liveBoardView .lb-card').first().click();await page.locator('#liveBoardView .lb-single .lb-board').waitFor();
    const floatingBoard=await page.locator('#liveBoardView .lb-board').boundingBox();
    assert.ok(Math.abs(normalBoard.width-floatingBoard.width)<=(mobile?24:5),`${name}: board width ${normalBoard.width} -> ${floatingBoard.width}`);
    assert.equal(await page.evaluate(()=>tvToolActive),true);
    assert.equal(await page.evaluate(()=>testFrame===document.getElementById('tvPlayerFrame')&&testFrame.src===testSrc&&frameChanges.length===0),true,'player survives open and board selection');
    const before=await shell.boundingBox();
    if(!mobile){const handle=await page.locator('#tvLiveBoardWindowTitle').boundingBox();await page.mouse.move(handle.x+50,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x+130,handle.y+40);await page.mouse.up();const after=await shell.boundingBox();assert.ok(after.x>before.x+20,'window drags');}
    else{await page.locator('#tvLiveBoardWindowTitle').focus();await page.keyboard.press('ArrowDown');assert.ok((await shell.boundingBox()).y>=before.y,'keyboard move');}
    const windowBounds=await shell.boundingBox();assert.ok(windowBounds.x>=0&&windowBounds.x+windowBounds.width<=width+1&&windowBounds.y+windowBounds.height<=height+1,'window stays within viewport');
    await page.screenshot({path:`../../work-tv-${name}.png`});
    await page.locator('[data-tv-lb="minimize"]').click();assert.equal(await page.locator('#liveBoardView').isVisible(),false);
    const pausedCalls=liveCalls;await page.waitForTimeout(300);assert.equal(liveCalls,pausedCalls);
    await page.locator('[data-tv-lb="minimize"]').click();assert.equal(await page.locator('#liveBoardView .lb-single').isVisible(),true);
    await page.locator('[data-tv-lb="club"]').click();await page.locator('#liveBoardView .lb-event').first().waitFor();
    assert.match(await page.locator('#liveBoardView .lb-event').first().innerText(),/Vereinsabend/);
    await page.locator('[data-tv-lb="close"]').click();assert.equal(await shell.isVisible(),false);
    assert.equal(await page.evaluate(()=>testFrame.src===testSrc&&frameChanges.length===0),true,'minimize, restore and close preserve video');
    // Independent switches and drafts survive changing the admin slot and saving.
    await page.evaluate(()=>selectTvAdminSlot('tv1'));await page.locator('#tvLiveBoardsEnabled').uncheck();
    await page.evaluate(()=>selectTvAdminSlot('tv2'));assert.equal(await page.locator('#tvLiveBoardsEnabled').isChecked(),false);
    await page.locator('#tvLiveBoardsEnabled').check();
    await page.locator('#tvLiveBoardsPicker').evaluate(el=>el.open=true);
    await page.locator('#tvLiveBoardsChoices input').first().waitFor();
    await page.locator('#tvLiveBoardsSearch').fill('Gamer Open');await page.locator('#tvLiveBoardsChoices input').check();
    await page.locator('#tvLiveBoardsStart').selectOption('first');
    await page.evaluate(()=>selectTvAdminSlot('tv1'));assert.equal(await page.locator('#tvLiveBoardsEnabled').isChecked(),false);
    assert.match(await page.locator('#tvLiveBoardsSelected').innerText(),/Gamer Open/);
    await page.evaluate(()=>saveHammerschachTv());assert.equal(config.slots[0].liveBoardsEnabled,false);assert.equal(config.slots[1].liveBoardsEnabled,true);assert.equal(config.slots[1].liveBoardEvents[0].id,'open');
    assert.equal(await page.locator('#tvLiveBoardsOpen').isVisible(),false);
    await page.evaluate(()=>selectHammerschachTvSlot('tv2'));
    await page.locator('#tvLiveBoardsOpen').click();await page.locator('#liveBoardView .lb-card').first().waitFor();
    await page.evaluate(()=>selectHammerschachTvSlot('tv3'));assert.equal(await shell.isVisible(),false,'changing TV slots closes the old window');
    await page.locator('#tvLiveBoardsOpen').click();await page.locator('#liveBoardView .lb-event').first().waitFor();assert.equal(await page.locator('[data-tv-lb="favorites"]').isVisible(),false,'no favorites uses the catalog');
    await page.evaluate(()=>openEmbeddedToolFromCurrentContext('live-board-tournament'));
    assert.equal(await shell.isVisible(),false);assert.equal(await page.locator('#liveBoardView').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#liveBoardView').length),1);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({name,normalBoard:normalBoard.width,floatingBoard:floatingBoard.width,passed:true}));await context.close();
  }
}finally{await browser.close();server.close();}
