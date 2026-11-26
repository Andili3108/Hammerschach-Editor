import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05);};
try{
 for(const role of ['visitor','member','admin']){
  const user=role==='visitor'?null:{id:role,username:role==='admin'?'Andili':'Mitglied',isAdmin:role==='admin'};
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE'});
  if(user)await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===local)return route.continue();if(!url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname==='/api/stats/daily')return route.fulfill({json:{ok:true,day:'2026-11-26',...(req.headers().authorization?{stats:{totalMembers:123,today:{date:'2026-11-26',members:12,visitors:34},yesterday:{date:'2026-11-25',members:56,visitors:78}}}:{})}});
   return route.fulfill({json:{ok:true,user,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0}});
  });
  await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage();await page.goto(local);await page.evaluate(()=>refreshSiteStats(true));
  const footer=page.locator('.site-footnote');assert.equal(await footer.count(),1);
  assert.equal(await page.locator('#siteStats').isVisible(),!!user);assert.equal(await page.locator('#siteCommunity').isVisible(),!!user);
  if(user)assert.equal(await page.locator('#siteCommunity').innerText(),'Unsere Gemeinschaft: 123 Mitglieder');
  for(const width of [1440,820,390,320])for(const theme of ['light','dark','soft']){
   await page.setViewportSize({width,height:1000});await page.evaluate(theme=>{document.documentElement.classList.remove('dark-mode','soft-mode');if(theme!=='light')document.documentElement.classList.add(theme+'-mode');},theme);
   await footer.scrollIntoViewIfNeeded();
   const metrics=await footer.evaluate(el=>{
    const rgb=s=>s.match(/[\d.]+/g).map(Number);
    const bg=node=>{for(let p=node;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1)return c;}return [255,255,255];};
    const rect=el.getBoundingClientRect();return {width:rect.width,left:rect.left,right:rect.right,scroll:el.scrollWidth,client:el.clientWidth,font:getComputedStyle(el).fontSize,colors:[el,el.querySelector('.site-footnote-title'),el.querySelector('a'),el.querySelector('button')].map(n=>[rgb(getComputedStyle(n).color),bg(n)])};
   });
   assert.equal(metrics.font,'14px');assert.ok(metrics.scroll<=metrics.client+1,JSON.stringify(metrics));assert.ok(metrics.left>=-1&&metrics.right<=width+1,`${role} ${theme} ${width}: footer outside viewport`);
   for(const [fg,bg] of metrics.colors)assert.ok(contrast(fg,bg)>=4.5,`${theme}: contrast ${contrast(fg,bg)}`);
   if(role==='member'&&[1440,390].includes(width))await footer.screenshot({path:`/tmp/footer-${width}-${theme}.png`});
  }
  const href=await footer.locator('a').getAttribute('href');assert.equal(href,'impressum.html');assert.equal((await context.request.get(local+'/'+href)).status(),200);
  await page.locator('#footerPrivacyOpenBtn').click();assert.equal(await page.locator('#privacyBackdrop').isVisible(),true);
  await page.evaluate(()=>{saveAuthState('',null);});assert.equal(await page.locator('#siteStats').isVisible(),false);assert.equal(await page.locator('#siteCommunity').textContent(),'');
  console.log(role+': 12 theme/viewport combinations, legal links and logout passed');await context.close();
 }
}finally{await browser.close();server.close();}
