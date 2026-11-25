import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const {handleNoticeBoard}=await import('../src/notice-board.js');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../Gamer/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
try {
 for(const [label,width,height,role] of [['desktop',1440,1000,'admin'],['ipad',820,1180,'admin'],['iphone',390,844,'admin'],['small-iphone',320,568,'visitor'],['visitor',1440,1000,'visitor'],['member',820,1180,'member']]){
  const db=new DatabaseSync(':memory:');const env={DB:{prepare(sql){let a=[];return {bind(...v){a=v;return this;},async first(){return db.prepare(sql).get(...a);},async all(){return {results:db.prepare(sql).all(...a)};},async run(){return {meta:{changes:db.prepare(sql).run(...a).changes}};}};}}};
  db.exec("CREATE TABLE league_standings_sources (id TEXT,title TEXT,enabled INTEGER,sort_order INTEGER); INSERT INTO league_standings_sources VALUES ('liga-test','Bezirksliga Test',1,0)");
  const context=await browser.newContext({viewport:{width,height},locale:'de-DE',isMobile:width<1000,hasTouch:width<1000});
  const user=role==='visitor'?null:{id:role,username:role==='admin'?'Andili':'Mitglied',isAdmin:role==='admin'};
  if(user)await context.addInitScript(user=>{localStorage.setItem('hammerschachGamerAuthToken','test-token');localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===local && ['/SchwarzesBrett/anhaenge/plakat.png','/SchwarzesBrett/anhaenge/logo.png'].includes(url.pathname))return route.fulfill({path:path.join(root,'Gamer-Logo.png')});
   if(url.origin===local)return route.continue();if(!url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname.startsWith('/api/notice-board')){
    const r=await handleNoticeBoard(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),env,{json:(b,i)=>new Response(JSON.stringify(b),i),session:async()=>user?{user}:null,isAdmin:u=>u.isAdmin,fetch:async(url,options)=>new Response(options.method==='HEAD'?null:'%PDF-test',{status:url.includes('missing')?404:200})});
    return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,leagues:[{id:'liga-test',title:'Bezirksliga Test',enabled:true}],user,allowed:true,firstVisit:false,stats:{},tournaments:[],games:[],members:[],offers:[],messages:[],items:[],entries:[],series:[],unread:0,unreadCount:0})});
  });
  await context.routeWebSocket(/.*/,socket=>{if(!socket.url().includes('/global-chat'))return socket.close();socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate')socket.send(JSON.stringify({type:'global_chat_ready',messages:[]}));});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(local);
  page.on('dialog',d=>d.accept());
  const tickerTab=page.locator('#newsTickerTab'),boardTab=page.locator('#newsBoardTab');
  await tickerTab.waitFor();
  assert.equal(await tickerTab.getAttribute('aria-selected'),'true');
  await boardTab.click();
  const boardPane=page.locator('#newsBoardPane');
  await boardPane.getByText('Derzeit keine aktuellen Meldungen',{exact:true}).waitFor();
  assert.equal(await page.locator('#noticeBoardDialog').isVisible(),false);
  assert.equal(await page.locator('#noticeBoardManage').isVisible(),role==='admin');
  if(role!=='visitor'){
    await page.locator('#lobbyChatTab').click();
    await page.locator('#globalChatInput').waitFor();
    assert.equal(await boardTab.isVisible(),false);
    await page.locator('#lobbyChatTab').click();
    await boardPane.waitFor();assert.equal(await boardTab.getAttribute('aria-selected'),'true');
  }
  await page.reload();await boardPane.waitFor();
  await boardTab.focus();await page.keyboard.press('ArrowLeft');await page.locator('#newsTickerPane').waitFor();
  await page.keyboard.press('ArrowRight');await boardPane.waitFor();
  if(role!=='admin'){
    const insert=db.prepare('INSERT INTO notice_board(id,revision,draft,published,published_at) VALUES (?,1,NULL,?,?)');
    for(const [id,title,days] of [['old','Ältere Einladung',8],['new','Neue Einladung',1]]){
      const doc={title,organizer:'Schachverein',description:'Beschreibung '+id,files:[],links:[]};
      insert.run(id,JSON.stringify(doc),new Date(Date.now()-days*86400000).toISOString());
    }
    await page.reload();
    const buttons=boardPane.locator('#noticeBoardRows button');
    await buttons.nth(1).waitFor();
    assert.match(await buttons.first().innerText(),/Neue Einladung/);
    assert.equal(await page.locator('#noticeBoardCount').innerText(),'1 neu');
    await buttons.nth(1).click();await page.getByText('Beschreibung old',{exact:true}).waitFor();
    assert.equal(await page.locator('#noticeBoardDialog .notice-board-card').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await buttons.nth(1).evaluate(b=>document.activeElement===b),true);
    console.log(label+': tabs, preference, sorted list and selected detail passed');await context.close();db.close();continue;
  }
  if(role==='admin'){
    await page.locator('#noticeBoardManage').click();await page.getByRole('button',{name:'＋ Neue Meldung',exact:true}).click();
    await page.locator('#noticeBoardDialog').getByLabel('Titel',{exact:true}).fill('Test <img src=x onerror=alert(1)>');await page.locator('#noticeBoardDialog').getByLabel('Beschreibung',{exact:true}).fill('Öffentliche Einladung\nZweite Zeile');
    await page.locator('#noticeBoardDialog').getByLabel('Dateinamen der Anhänge', {exact:false}).fill('missing.pdf');
    await page.getByRole('button',{name:'Entwurf speichern',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
    const editor=await page.locator('#noticeBoardDialog').boundingBox();
    assert.ok(editor.x>=0&&editor.x+editor.width<=width+1);assert.equal(await page.locator('.notice-board-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    await page.screenshot({path:'/tmp/notice-board-editor-'+label+'.png'});
    await page.getByRole('button',{name:'Vorschau',exact:true}).click();await page.getByText('Vorschau · noch nicht veröffentlicht',{exact:true}).waitFor();
    assert.equal(await page.locator('.notice-board-preview img').count(),0,'text is never interpreted as HTML');
    await page.getByRole('button',{name:'Veröffentlichen',exact:true}).click();await page.getByText('Bitte die öffentliche Freigabe bestätigen.',{exact:true}).waitFor();
    await page.getByRole('checkbox').filter({visible:true}).check();
    await page.getByRole('button',{name:'Veröffentlichen',exact:true}).click();await page.getByText('Anhang nicht erreichbar: missing.pdf (HTTP 404)',{exact:true}).waitFor();
    await page.locator('#noticeBoardDialog').getByLabel('Dateinamen der Anhänge',{exact:false}).fill('cup.pdf\nplakat.png\nliste.txt\nlogo.png');
    await page.locator('#noticeBoardDialog').getByLabel('Externe HTTPS-Links',{exact:false}).fill('https://example.org/anmeldung\nhttps://example.org/ergebnisse');
    const editorDialog=page.locator('#noticeBoardDialog');
    await editorDialog.getByLabel('Veranstalter (optional)',{exact:true}).fill('SV Ahlen 1954 e. V.');
    await editorDialog.getByLabel('Kategorie (optional)',{exact:true}).selectOption('Veranstaltung');
    await editorDialog.getByLabel('Anzeigen bis',{exact:false}).fill('2099-01-31');
    await editorDialog.getByLabel('Bild über dem Titel (optional)',{exact:true}).selectOption('logo.png');
    await editorDialog.getByLabel('Breite des Bildes über dem Titel').selectOption('25');
    await editorDialog.getByLabel('Schriftgröße des Titels').selectOption('xl');
    await editorDialog.getByLabel('Schriftgröße des Inhaltstexts').selectOption('large');
    const description=editorDialog.getByLabel('Beschreibung',{exact:true});
    await description.evaluate(input=>input.setSelectionRange(0,11));
    const toggleBold=editorDialog.getByRole('button',{name:'Fett',exact:true});
    await toggleBold.click();
    await toggleBold.click();
    assert.equal(await editorDialog.locator('.notice-board-description strong').count(),0);
    await toggleBold.click();
    await editorDialog.getByLabel('Beschreibung',{exact:true}).evaluate(input=>input.setSelectionRange(21,21));
    await editorDialog.getByLabel('Bild aus den Anhängen').selectOption('plakat.png');
    await editorDialog.getByLabel('Bildbreite').selectOption('50');
    await editorDialog.getByRole('button',{name:'Bild einfügen',exact:true}).click();
    const preview=editorDialog.locator('.notice-board-preview');
    assert.equal(await preview.locator('.notice-board-description .notice-board-inline-image').evaluate(a=>a.style.width),'50%');
    await editorDialog.getByLabel('Bildbreite').selectOption('75');
    await editorDialog.getByLabel('Zur Ausschreibung (optional)').selectOption('cup.pdf');
    await editorDialog.getByLabel('Zur Turnierseite (optional)').selectOption('https://example.org/anmeldung');
    const checkCard=async card=>{
      await card.locator('.notice-board-organizer + h3').waitFor();
      const logo=card.getByRole('link',{name:'logo.png',exact:true});
      assert.equal(await logo.evaluate(a=>a.style.width),'25%');
      assert.ok(await logo.evaluate(a=>a.parentElement.firstElementChild===a));
      await logo.locator('img[alt="logo.png"]').evaluate(img=>img.decode());
      assert.equal(await card.locator('h3[data-size="xl"]').count(),1);
      assert.equal(await card.locator('.notice-board-description[data-size="large"] strong').innerText(),'Öffentliche');
      assert.equal(await card.locator('.notice-board-organizer + h3').count(),1);
      assert.equal(await card.locator('.notice-board-organizer').innerText(),'SV Ahlen 1954 e. V.');
      assert.equal(await card.locator('.notice-board-meta').count(),0);
      await card.locator('.notice-board-description img').evaluate(img=>img.decode());
      assert.equal(await card.locator('.notice-board-description .notice-board-inline-image').evaluate(a=>a.style.width),'75%');
      assert.equal(await card.getByRole('link',{name:'Zur Turnierseite'}).getAttribute('href'),'https://example.org/anmeldung');
      assert.equal(await card.locator('.notice-board-links a').count(),2);
      assert.equal(await card.getByRole('link',{name:'Zur Ausschreibung'}).getAttribute('target'),'_blank');
    };
    await checkCard(preview);
    const previewPopup=context.waitForEvent('page');
    await preview.getByRole('link',{name:'Zur Ausschreibung'}).click();
    await (await previewPopup).close();
    assert.equal(await editorDialog.getByLabel('Veranstalter (optional)').inputValue(),'SV Ahlen 1954 e. V.');
    await page.getByRole('button',{name:'Veröffentlichen',exact:true}).click();await page.getByRole('button',{name:'Öffentliche Ansicht',exact:true}).click();
    await page.locator('#noticeBoardCount').getByText('1 neu',{exact:true}).waitFor({state:'attached'});
    await checkCard(editorDialog.locator('.notice-board-card'));
    const file=page.getByRole('link',{name:'Zur Ausschreibung',exact:true});await file.waitFor();assert.equal(await file.getAttribute('target'),'_blank');
    const popupWait=context.waitForEvent('page');await file.click();const popup=await popupWait;await popup.close();assert.equal(await page.locator('#noticeBoardDialog').isVisible(),true);
    await page.locator('#noticeBoardDialog').getByRole('button',{name:'Meldungen verwalten',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
    await page.locator('#noticeBoardDialog').getByLabel('Titel',{exact:true}).fill('Unveröffentlichte Änderung');await page.getByRole('button',{name:'Entwurf speichern',exact:true}).click();
    await page.getByRole('button',{name:'Öffentliche Ansicht',exact:true}).click();await page.getByRole('heading',{name:'Test <img src=x onerror=alert(1)> NEU',exact:false}).waitFor();
    assert.equal(await page.getByText('Unveröffentlichte Änderung',{exact:true}).count(),0);
  }
  const modal=await page.locator('#noticeBoardDialog').boundingBox();assert.ok(modal.x>=0&&modal.y>=0&&modal.x+modal.width<=width+1&&modal.y+modal.height<=height+1);
  assert.equal(await page.locator('.notice-board-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  if(width<601)assert.ok(modal.height>height*.9,'nearly fullscreen on phone');
  await page.screenshot({path:'/tmp/notice-board-'+label+'.png'});
  await page.evaluate(()=>window.HammerschachAppearance.select('dark'));
  await page.screenshot({path:'/tmp/notice-board-dark-'+label+'.png'});
  await page.evaluate(()=>window.HammerschachAppearance.select('soft'));
  await page.getByRole('button',{name:'Schließen',exact:true}).filter({visible:true}).focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.querySelector('#noticeBoardDialog').contains(document.activeElement)),true,'focus stays inside modal');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#noticeBoardDialog').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'noticeBoardManage');

  if(role==='admin'){
    await page.locator('#noticeBoardManage').click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
    await page.getByRole('button',{name:'Ausblenden',exact:true}).click();await page.getByRole('button',{name:'Öffentliche Ansicht',exact:true}).click();await page.locator('#noticeBoardDialog').getByText('Derzeit keine aktuellen Meldungen',{exact:true}).waitFor();
    await page.locator('#noticeBoardDialog').getByRole('button',{name:'Meldungen verwalten',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
    await page.getByRole('button',{name:'Löschen',exact:true}).click();await page.getByText('Noch keine Meldungen angelegt.',{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Schwarzes Brett schließen',exact:true}).click();
  assert.deepEqual(errors,[]);console.log(label+': layout, modal, permissions and '+(role==='admin'?'editor lifecycle':'public empty state')+' passed');await context.close();db.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
