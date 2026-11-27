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
 for (const scheme of ['light','soft','dark']) {
 await page.evaluate(s => window.HammerschachAppearance.select(s), scheme);
 for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:1180,height:820},{width:390,height:844},{width:844,height:390},{width:320,height:720}]){
 const {width} = viewport;
 await page.setViewportSize(viewport);await panel.scrollIntoViewIfNeeded();
 const dims=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),v=el.querySelector('.christmas-video').getBoundingClientRect(),g=el.querySelector('.christmas-greeting').getBoundingClientRect();return{left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth,vy:v.y,gy:g.y,vbottom:v.bottom}});
 assert.ok(dims.left>=0&&dims.right<=width+1&&dims.scroll<=dims.client+1,JSON.stringify(dims));if(width<701)assert.ok(dims.gy>=dims.vbottom);
 if(process.env.SCREENSHOT_DIR)await panel.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`christmas-${width}-${scheme}.png`)});
 }

   await page.evaluate(s => window.HammerschachAppearance.select(s), scheme);
   const palette = await panel.evaluate(el => {
     const s = getComputedStyle(el);
     return [s.getPropertyValue('--card-top').trim(), s.getPropertyValue('--card-accent').trim(), getComputedStyle(el.querySelector('.christmas-video')).backgroundImage, getComputedStyle(el.querySelector('.christmas-video')).color];
   });
   assert.deepEqual(palette, scheme === 'dark' ? ['#253c34','#f2d597','none','rgb(255, 245, 223)'] : ['#fbf3df','#792638','linear-gradient(135deg, rgb(188, 153, 85), rgb(155, 119, 60))','rgb(23, 15, 5)']);
 }
 await page.locator('#christmasVideoLoad').click();assert.equal(await page.locator('#christmasVideo iframe').count(),1);assert.equal(await page.locator('#christmasVideo iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/cmm1gt_2SkQ');
 enabled=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>!document.documentElement.classList.contains('christmas-mode'));assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('#christmasVideo iframe').count(),0);
 enabled=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel.waitFor({state:'visible'});assert.equal(await page.locator('#christmasVideoLoad').isVisible(),true);
 }else{
 await page.waitForFunction(()=>document.querySelector('.lobby-welcome-greeting')?.dataset.text.startsWith('Frohe Weihnachtszeit'));
 assert.equal(await page.locator('#christmasVideo iframe').count(),0);
 for (const username of ['Mitglied', 'Alexandra-Maria-LangerBe']) {
   await page.evaluate(name => { onlineAuthUser.username = name; statusEl.textContent = lobbyWelcomeText(); }, username);
   for (const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:1180,height:820},{width:390,height:844},{width:844,height:390},{width:320,height:720}]) {
     await page.setViewportSize(viewport);
     for (const scheme of ['light','soft','dark']) {
       await page.evaluate(s => window.HammerschachAppearance.select(s), scheme);
       await page.waitForTimeout(80);
       const inspect = () => page.evaluate(() => {
         const header = [...document.querySelectorAll('.shell > header')].find(el => el.getBoundingClientRect().height > 0);
         const r = header.getBoundingClientRect();
         const controls = [...header.querySelectorAll('button,a,img,.status,.mobile-nav-test-status')].filter(el => el.getClientRects().length);
         const branches = [...header.querySelectorAll('.lobby-christmas-branch:not([hidden])')].filter(el => el.getClientRects().length);
         for (const branch of branches) {
           const b = branch.getBoundingClientRect();
           if (branch.querySelectorAll('rect').length !== 3 || !branch.querySelector('radialGradient')) throw Error('Missing baubles or lights');
           if (Math.abs(b.width / b.height - 240 / 88) > .01) throw Error('Branch distorted');
           if (b.left < r.left || b.right > r.right || b.top < r.top || b.bottom > r.bottom) throw Error('Branch outside header');
           for (const control of controls) {
             const c = control.getBoundingClientRect();
             if (b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top) throw Error('Decoration covers ' + control.id);
           }
           if (getComputedStyle(branch).pointerEvents !== 'none') throw Error('Decoration receives clicks');
         }
         for (const id of ['themeToggleBtn','infoMenuBtn']) {
           const el = document.getElementById(id), b = el.getBoundingClientRect();
           if (b.width && b.height && !el.contains(document.elementFromPoint(b.x + b.width / 2,b.y + b.height / 2))) throw Error('Button obscured: ' + id);
         }
         return {height:r.height,width:r.width,status:document.getElementById('status').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth > innerWidth};
       });
       const before = await inspect();
       assert.equal(before.overflow,false);
       assert.equal(await page.locator('#status .lobby-welcome-greeting').getAttribute('data-text'), 'Frohe Weihnachtszeit, ' + username + '!');
       assert.equal(await page.locator('#status .lobby-welcome-motto').getAttribute('data-text'), 'Zeit für deinen nächsten Hammerzug.');
       // Sample both phases of the existing eight-second animation without waiting.
       await page.evaluate(() => { for(const el of document.querySelectorAll('.lobby-welcome-rotating')) { const a = el.getAnimations()[0]; if(a) { a.pause(); a.currentTime = 1000; } } });
       const first = await inspect();
       await page.evaluate(() => { for(const el of document.querySelectorAll('.lobby-welcome-rotating')) { const a = el.getAnimations()[0]; if(a) a.currentTime = 5000; } });
       assert.deepEqual(await inspect(), first);
       assert.equal(await page.evaluate(() => {
         const el = [...document.querySelectorAll('.lobby-welcome-rotating')].find(el => el.getBoundingClientRect().height > 0);
         return getComputedStyle(el.querySelector('.lobby-welcome-motto')).opacity;
       }), '1');
       enabled=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
       await page.waitForFunction(()=>!document.documentElement.classList.contains('christmas-mode'));
       assert.equal(await page.locator('#status .lobby-welcome-greeting').getAttribute('data-text'),'Willkommen zurück, ' + username + '!');
       const off = await inspect();
       assert.deepEqual(off, before, 'Header/status dimensions must stay stable when Christmas changes');
       enabled=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
       await page.waitForFunction(()=>document.documentElement.classList.contains('christmas-mode'));
       await page.evaluate(() => { for(const el of document.querySelectorAll('.lobby-welcome-rotating')) { const a = el.getAnimations()[0]; if(a) a.currentTime = 1000; } });
       if(process.env.SCREENSHOT_DIR && username==='Mitglied') await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`lobby-${viewport.width}-${scheme}.png`)});
     }
   }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#infoMenuBtn').click();
 assert.equal(await page.locator('#infoMenuPopup').isVisible(),true);
 await page.locator('#infoMenuBtn').click();
 await page.locator('#themeToggleBtn').click();
 assert.equal(await page.locator('#gamerSettings').isVisible(),true);
 await page.locator('#settingsDone').click();
 if(role==='admin'){
 await page.evaluate(()=>openAdminOverview());await page.locator('#seasonalAdmin').waitFor({state:'visible'});await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('christmas-mode'));
 assert.equal(await page.locator('#status .lobby-welcome-motto').getAttribute('data-text'),'Zeit für deinen nächsten Hammerzug.');
 failed=true;await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>document.getElementById('seasonalAdminStatus').textContent==='Testfehler');assert.equal(await page.locator('#christmasModeToggle').isChecked(),false);
 failed=false;await page.locator('#christmasModeToggle').click();await page.waitForFunction(()=>document.documentElement.classList.contains('christmas-mode'));
 } else assert.equal(await page.locator('#seasonalAdmin').isVisible(),false);
 }
 assert.deepEqual(errors,[]);console.log(role+': passed');await context.close();
}
}finally{await browser.close();server.close();}
