import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || undefined});
try{
for(const role of ['visitor','member','admin']){
 let enabled=true,failed=false,youtube=0;
 const user=role==='visitor'?null:{id:role,username:role==='admin'?'Andili':'Mitglied',isAdmin:role==='admin'};
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE'});
 if(user)await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
 await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();
 if(url.hostname.includes('youtube')){youtube++;return route.abort()}
 if(!url.pathname.startsWith('/api/'))return route.abort();
 if(url.pathname.includes('seasonal-design')){
 if(req.method()==='POST'){if(failed)return route.fulfill({status:503,json:{ok:false,message:'Testfehler'}});enabled=req.postDataJSON().christmasEnabled;}
 return route.fulfill({json:{ok:true,christmasEnabled:enabled}});}
 return route.fulfill({json:{ok:true,user,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0}});
 });
 await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(local);await page.waitForFunction(()=>document.documentElement.classList.contains('christmas-mode'));
 const panel=page.locator('#christmasWelcome');assert.equal(await panel.isVisible(),!user);assert.equal(youtube,0);
 if(!user){
 for(const width of [1440,820,390,320]){
 await page.setViewportSize({width,height:1000});await panel.scrollIntoViewIfNeeded();
 const dims=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),v=el.querySelector('.christmas-video').getBoundingClientRect(),g=el.querySelector('.christmas-greeting').getBoundingClientRect();return{left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth,vy:v.y,gy:g.y,vbottom:v.bottom}});
 assert.ok(dims.left>=0&&dims.right<=width+1&&dims.scroll<=dims.client+1,JSON.stringify(dims));if(width<701)assert.ok(dims.gy>=dims.vbottom);
 if(process.env.SCREENSHOT_DIR)await panel.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`christmas-${width}.png`)});
 }
 await page.locator('#christmasVideoLoad').click();assert.equal(await page.locator('#christmasVideo iframe').count(),1);assert.equal(await page.locator('#christmasVideo iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/cmm1gt_2SkQ');
 enabled=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>!document.documentElement.classList.contains('christmas-mode'));assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('#christmasVideo iframe').count(),0);
 enabled=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel.waitFor({state:'visible'});assert.equal(await page.locator('#christmasVideoLoad').isVisible(),true);
 }else{
 await page.waitForFunction(()=>document.querySelector('.lobby-welcome-motto')?.dataset.text.includes('Weihnachtszeit'));
 assert.equal(await page.locator('#christmasVideo iframe').count(),0);
 if(role==='admin'){
 await page.evaluate(()=>openAdminOverview());await page.locator('#seasonalAdmin').waitFor({state:'visible'});await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('christmas-mode'));
 assert.equal(await page.locator('.lobby-welcome-motto').getAttribute('data-text'),'Zeit für deinen nächsten Hammerzug.');
 failed=true;await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>document.getElementById('seasonalAdminStatus').textContent==='Testfehler');assert.equal(await page.locator('#christmasModeToggle').isChecked(),false);
 failed=false;await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>document.documentElement.classList.contains('christmas-mode'));
 } else assert.equal(await page.locator('#seasonalAdmin').isVisible(),false);
 }
 assert.deepEqual(errors,[]);console.log(role+': passed');await context.close();
}
}finally{await browser.close();server.close();}
