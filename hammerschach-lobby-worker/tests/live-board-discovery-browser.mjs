// First run live-board-external.mjs with LIVE_BOARD_RECORD. This browser test
// replays that real provider response, without repeated external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handleLiveBoardApi} from '../src/live-board.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const record=JSON.parse(await fs.readFile(process.env.LIVE_BOARD_RECORD,'utf8'));
const dgtRecord=!!record.report.publisher;
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{
  try{
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
    if(!file.startsWith(root))throw Error('path');
    const body=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(body);
  }catch(_){res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const local='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const user={id:'test-user',username:'Andili'};
const helpers={json:(data,init)=>new Response(JSON.stringify(data),init),lookupAuthSession:async(e,t)=>t==='Bearer test-token'?{user}:null,bearerTokenFromRequest:r=>r.headers.get('authorization')};
const deps={cache:null,fetcher:async url=>{const r=record.records[url];assert.ok(r,'unrecorded source '+url);return new Response(r.body,{status:r.status});}};
const report=[];
try{
  for(const [name,width,height] of [['desktop',1440,1000],['ipad',820,1180],['iphone',390,844]]){
    const sql=new DatabaseSync(':memory:');
    const env={LIVE_BOARD_PAGE_DISCOVERY:dgtRecord?'1':'0',LIVE_BOARD_DISCOVERY_PAGES:dgtRecord?JSON.stringify([{id:'realtest',name:'Chess Castle',url:record.report.publisher,category:'tournament'}]):undefined,DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async run(){return {meta:{changes:sql.prepare(text).run(...args).changes}};},async all(){return {results:sql.prepare(text).all(...args)};},async first(){return sql.prepare(text).get(...args)||null;}};}}};
    const context=await browser.newContext({viewport:{width,height},isMobile:name!=='desktop',hasTouch:name!=='desktop'});
    await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
    let calls=0;
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();
      if(url.pathname.startsWith('/api/live-board/')){
        calls++;const response=await handleLiveBoardApi(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()||undefined}),env,url,helpers,deps);
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,user,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
      return route.abort();
    });
    await context.routeWebSocket(/.*/,socket=>socket.close());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(local);await page.waitForFunction(()=>typeof HammerschachLiveBoard!=='undefined');
    await page.evaluate(user=>{onlineAuthToken='test-token';onlineAuthUser=user;updateAuthUi();HammerschachLiveBoard.open('tournament');},user);
    const view=page.locator('#liveBoardView');await view.locator('.lb-event').first().waitFor();
    const before=calls;await view.locator('#lbEventSearch').fill('No match at all');assert.equal(await view.locator('.lb-event').count(),0);
    await view.locator('#lbEventSearch').fill(record.report.event.title);assert.equal(calls,before,'catalog filtering is local');
    await view.locator('.lb-event').click();await view.locator('.lb-board').first().waitFor();
    assert.equal(await view.locator('.lb-board').count(),4);
    assert.equal(await view.locator('.lb-error').count(),0);
    assert.equal(await view.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.equal(await view.locator('.site-footnote').isVisible(),true);
    const bounds=await view.locator('.lb-pages').boundingBox();if(bounds)assert.ok(bounds.y+bounds.height<=height+2,`four boards and controls must fit: ${name} ${bounds.y+bounds.height}`);
    const shots=process.env.LIVE_BOARD_SCREENSHOTS;
    if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'-real-overview.png')});}
    if(!dgtRecord&&record.report.total>4){await view.locator('[data-lb="next"]').click();await page.waitForFunction(()=>document.querySelector('.lb-pages span').textContent.startsWith('Seite 2'));}
    await view.locator('.lb-card').first().click();await view.locator('.lb-single .lb-board').waitFor();
    assert.equal(await view.locator('.lb-board').count(),1);assert.equal(await view.locator('.lb-error').count(),0);
    const boardBox=await view.locator('.lb-board').boundingBox(),notationBox=await view.locator('.lb-moves-panel').boundingBox();
    assert.ok(width>760?notationBox.x>=boardBox.x+boardBox.width:notationBox.y>=boardBox.y+boardBox.height);
    assert.equal(await view.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.equal(await view.locator('.lb-single .square').count(),64);
    if(shots)await page.screenshot({path:path.join(shots,name+'-real-single.png'),fullPage:true});
    await view.getByRole('button',{name:'Startstellung'}).click();await view.getByRole('button',{name:'Aktueller Stand'}).click();
    if(record.report.previousRound){
      await view.locator('.lb-round select').selectOption(record.report.previousRound.id);await view.locator('.lb-grid .lb-board').first().waitFor();
      await page.clock.install();const stopped=calls;await page.clock.fastForward(90000);assert.equal(calls,stopped,'completed round does not poll');
    }
    if(await view.locator('.lb-single').isVisible()){await view.locator('[data-lb="back"]').click();await view.locator('.lb-grid').waitFor();}
    await view.locator('[data-lb="back"]').click();await view.locator('#lbEventSearch').fill('');
    await view.locator('.lb-add summary').click();
    await view.locator('[name="title"]').fill('Eigene Testübertragung');
    await view.locator('[name="url"]').fill('https://not-allowed.example/live.pgn');await view.locator('.lb-source-form button').click();
    await page.waitForFunction(()=>document.querySelector('#liveBoardView .lb-status').textContent.includes('LIVE_BOARD_PGN_HOSTS'));
    await view.locator('[name="url"]').fill(dgtRecord?'https://view.livechesscloud.com/#'+record.report.event.id.match(/dg-realtest-(.+)-\d+$/)[1]+'/1':record.report.requests.find(u=>u.endsWith('.pgn')));
    await view.locator('.lb-source-form button').click();await view.locator('.lb-grid .lb-board').first().waitFor({timeout:10000});
    assert.equal(await view.locator('h2').textContent(),'Eigene Testübertragung');
    await view.locator('[data-lb="back"]').click();await view.locator('#lbEventSearch').fill('Eigene Testübertragung');await view.locator('.lb-event').click();await view.locator('[data-lb="remove"]').waitFor();
    await view.locator('[data-lb="remove"]').click();await view.getByRole('button',{name:'Wirklich entfernen?'}).click();
    await view.locator('.lb-catalog-tools').waitFor();assert.equal(await view.locator('.lb-event').count(),0);
    await page.locator('#roomLobbyBtn').evaluate(el=>el.click());assert.equal(await view.isVisible(),false);assert.equal(await page.locator('.member-lobby .site-footnote').isVisible(),true);
    assert.deepEqual(errors,[]);report.push({name,calls,errors});await context.close();sql.close();
  }
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
