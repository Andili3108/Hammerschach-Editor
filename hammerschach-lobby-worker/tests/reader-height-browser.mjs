import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.txt')?'text/plain':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
try{
 for(const [name,width,height,member] of [['desktop-visitor',1440,1000,false],['desktop-member',1440,1000,true],['tablet',820,1180,false],['phone',390,844,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});const errors=[];
  const user={id:'reader-test',username:'Archivtest',isAdmin:false};
  if(member)await context.addInitScript(user=>{try{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));}catch{}},user);
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin===local)return route.continue();if(!url.pathname.startsWith('/api/'))return route.abort();
    let data={ok:true,user:member?user:null,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0};
    if(url.pathname==='/api/reader/archives')data.archives=[{id:'test',name:'Unna Open',file:'UnnaOpen.txt'}];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(local);await page.evaluate(()=>openReaderToolDebounced());
  const frameElement=page.locator('#readerToolFrame');const frame=await (await frameElement.elementHandle()).contentFrame();
  await frame.waitForFunction(()=>document.querySelector('#board')?.children.length===64&&document.querySelector('#archiveSelect')?.value==='test'&&!document.querySelector('#archiveSelect').disabled);
  async function sample(){return page.evaluate(()=>{const frame=document.querySelector('#readerToolFrame'),foot=document.querySelector('.site-footnote');return {height:frame.getBoundingClientRect().height,foot:foot?.getBoundingClientRect().top+scrollY,content:frame.contentDocument.querySelector('.reader-shell').getBoundingClientRect().height}});}
  async function stable(label){
    await page.waitForTimeout(300);const samples=[];for(let i=0;i<6;i++){samples.push(await sample());await page.waitForTimeout(150);}
    const heights=samples.map(s=>s.height),feet=samples.map(s=>s.foot);console.log(name,label,JSON.stringify(samples));
    assert.ok(Math.max(...heights)-Math.min(...heights)<=1,label+': iframe height must stop growing');
    assert.ok(Math.max(...feet)-Math.min(...feet)<=1,label+': footer must stop moving');
    assert.ok(heights.at(-1)<Math.max(720,samples.at(-1).content+8)+2,label+': no accumulating empty area');
    return samples.at(-1);
  }
  const initial=await stable('initial');
  for(const id of ['showReaderMovesBtn','showReaderEngineBtn','showReaderGameBtn']){await frame.locator('#'+id).click();await stable(id);}
  // Fixed popups must not inflate the document, and changing real content must resize it.
  await frame.locator('#btnGames').click();await stable('game-list');await page.evaluate(()=>window.scrollTo(0,0));await frame.locator('#gameListClose').click();
  await page.setViewportSize({width:width>1000?700:1200,height});await stable('resized');
  await page.setViewportSize({width,height});const restored=await stable('restored');assert.ok(Math.abs(initial.height-restored.height)<=1,'height shrinks back after resize');
  await page.evaluate(()=>closeEmbeddedTools());await page.evaluate(()=>openReaderToolDebounced());await page.waitForTimeout(500);await stable('reopened');
  assert.deepEqual(errors,[],name+' browser errors');console.log(name+': passed');await context.close();
 }
}finally{await browser.close();server.close();}
