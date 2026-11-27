import assert from 'node:assert/strict';
import path from 'node:path';
import {handleLiveBoardApi} from '../src/live-board.js';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gamer = fileURLToPath(new URL('../../Gamer/', import.meta.url));
const origin = 'https://gamer.test';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE});
const failures = [];
const andili = {id:'test-andili',username:'Andili',isAdmin:true};
let saved = false;

async function center(square) {
  const rect = await square.boundingBox();
  assert.ok(rect, 'Feld muss sichtbar sein');
  return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
}

// Read the actual painted center in the outer screenshot. Driver-reported
// iframe coordinates need not include ancestor CSS zoom.
async function paintedCenter(page,square){
  await square.evaluate(el=>{
    const dot=document.createElement('i');
    dot.dataset.testCenter='';
    dot.style.cssText='position:absolute;left:50%;top:50%;width:6px;height:6px;transform:translate(-50%,-50%);background:rgb(13,241,177);pointer-events:none;z-index:100';
    el.append(dot);
  });
  const screenshot=await page.screenshot();
  const point=await page.evaluate(async encoded=>{
    const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const bytes=ctx.getImageData(0,0,image.width,image.height).data;
    let x=0,y=0,count=0;
    for(let i=0;i<bytes.length;i+=4){
      if(bytes[i]===13&&bytes[i+1]===241&&bytes[i+2]===177){
        x+=(i/4)%image.width;y+=Math.floor(i/4/image.width);count++;
      }
    }
    return count ? {x:x/count,y:y/count} : null;
  },screenshot.toString('base64'));
  await square.locator('[data-test-center]').evaluate(el=>el.remove());
  assert.ok(point,'Feldmittelpunkt auf dem sichtbaren Brett');
  return point;
}

async function grabAndAim(page, from, to) {
  await from.scrollIntoViewIfNeeded();
  const start = await center(from);
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, {steps: 10});
  assert.ok(await page.locator('.local-drag-ghost').isVisible(), 'Ziehgeste aktiv');
  return end;
}

async function fixture(page,account=andili){
    await page.addInitScript(user => {
      localStorage.setItem('hammerschachGamerAuthToken','fixture-token');
      localStorage.setItem('hammerschachGamerAuthUser',JSON.stringify(user));
    },account);

    await page.routeWebSocket(/.*/, socket => socket.close());
    // Serve only the local fixture. No live accounts, requests or games.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.pathname.startsWith('/api/live-board/')){
        const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_DEMO:'1',LIVE_BOARD_EVENTS:JSON.stringify([
          {id:'club',title:'Lokaler Test',category:'club',source:{type:'demo'}}])};
        const helpers={json:(d,o)=>Response.json(d,o),bearerTokenFromRequest:()=> 'fixture-token',
          lookupAuthSession:async()=>({user:andili})};
        const result=await handleLiveBoardApi(new Request(url),env,url,helpers);
        return route.fulfill({status:result.status,body:await result.text(),contentType:'application/json'});
      }
      if (url.pathname === '/api/account/preferences') {
        if(route.request().headers().authorization!=='Bearer fixture-token'){
          return route.fulfill({json:{ok:true,preferences:{screenFit:true}}});
        }
        if(route.request().method()==='POST'){
          const patch=route.request().postDataJSON().preferences;
          if(typeof patch.screenFit==='boolean')saved=patch.screenFit;
        }
        return route.fulfill({json:{ok:true,screenFitAccount:account.id,preferences:{screenFit:saved}}});
      }
      if(url.origin!==origin && url.pathname.startsWith('/api/'))return route.fulfill({json:{
        ok:true,user:account,christmasEnabled:true,allowed:true,stats:{},games:[],members:[],
        offers:[],items:[],entries:[],messages:[],tournaments:[],series:[]
      }});
      if (url.origin !== origin) return route.abort();
      const name = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const file = path.resolve(gamer, '.' + decodeURIComponent(name));
      if (!file.startsWith(path.resolve(gamer) + path.sep)) return route.abort();
      try { await route.fulfill({path: file}); }
      catch { await route.abort(); }
    });
}

try {
  for (const black of [false, true]) {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    await fixture(page);
    await page.goto(origin);
    await page.locator('#themeToggleBtn').click();
    const toggle=page.getByRole('checkbox',{name:'Automatische Bildschirmoptimierung'});
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(),black);
    if(!black){
      const before=await page.locator('.shell').boundingBox();
      await toggle.check();await toggle.uncheck();
      assert.deepEqual(await page.locator('.shell').boundingBox(),before);
      await toggle.check();
      for(const scheme of ['light','dark','soft']){
        await page.locator('#gamerSettings [data-preference="scheme"]').selectOption(scheme);
        assert.equal(await page.locator('html').getAttribute('data-color-scheme'),scheme);
      }
      await page.waitForFunction(()=>document.documentElement.classList.contains('gamer-screen-fit'));
      for(const [width,height,expectedContent] of [
        [1100,900,1100],[1280,900,1100],[1399,900,1100],[1400,900,1100],
        [1401,900,1100.85],[1440,900,1133.85],[1660,1080,1320],[1920,1080,1540],
        [2560,1440,1540],[1400,1080,1100],[1920,650,1100]
      ]){
        await page.setViewportSize({width,height});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const geom=await page.evaluate(()=>{
          const rect=document.querySelector('.shell').getBoundingClientRect();
          return {width:rect.width,left:rect.left,right:document.documentElement.clientWidth-rect.right,
            scale:HammerschachScreenFit.scale};
        });
        console.log(width,height,geom);
        assert.ok(Math.abs(geom.left-geom.right)<2);
        assert.ok(geom.width<=1541);
        assert.ok(Math.abs(geom.width-expectedContent)<0.2,'Inhaltsbreite bei '+width);
        if(width<=1400||height===650)assert.equal(geom.scale,1);
        else assert.ok(geom.scale>1);
        if(width===1920 && height===1080)assert.ok(Math.abs(geom.left-190)<1);
      }
      await page.setViewportSize({width:1920,height:1080});
    }
    await page.locator('#settingsDone').click();
    if(!black){
      await page.setViewportSize({width:1920,height:1600});
      for(const [tool,id] of [['analyzer','analyzer'],['trainer','trainer'],['schachlabor','schachlabor'],
          ['openings','openings'],['player','player'],['mate-school','mateSchool'],['reader','reader']]){
        await page.evaluate(tool=>setEmbeddedToolActive(tool),tool);
        const frame=page.frameLocator('#'+id+'ToolFrame');
        const cells=frame.locator('#board > *');
        await cells.first().waitFor({state:'attached',timeout:6000});
        const count=await cells.count();
        const rect=await frame.locator('#board').boundingBox();
        const grid=await cells.evaluateAll(nodes=>{
          const rects=nodes.map(el=>el.getBoundingClientRect());
          const axis=key=>new Set(rects.map(r=>Math.round(r[key]))).size;
          return [axis('left'),axis('top'),Math.max(...rects.map(r=>Math.abs(r.width-r.height)))];
        });
        assert.deepEqual(grid.slice(0,2),[8,8],tool+' acht Reihen und Linien');
        assert.ok(grid[2]<2,tool+' quadratische Felder');
        console.log(tool,count,'Felder');
        assert.ok(count===64 && Math.abs(rect.width-rect.height)<3,tool);
        if(tool==='analyzer'){
          const source=frame.locator('#board [data-x="4"][data-y="6"]');
          const dest=frame.locator('#board [data-x="4"][data-y="4"]');
          assert.equal(await dest.locator('img').count(),0);
          for(const cell of [source,dest]){
            const point=await paintedCenter(page,cell);
            await page.mouse.click(point.x,point.y);
          }
          assert.ok(await dest.locator('img').count(),'Analyzer e2–e4 per Klick');
        }
      }
      await page.evaluate(()=>HammerschachLiveBoard.open('club'));
      await page.locator('#liveBoardView .lb-event').first().click();
      await page.locator('.lb-card').first().click();
      const live=page.locator('.lb-single .lb-board');
      const box=await live.boundingBox();
      assert.ok(box && Math.abs(box.width-box.height)<2);
      assert.equal(await live.locator(':scope > *').count(),64);
      await page.evaluate(()=>closeEmbeddedTools());
      await page.locator('#weeklyBoard .square').first().waitFor({state:'attached'});
      assert.equal(await page.locator('#weeklyBoard .square').count(),64);
      await page.evaluate(()=>{window.trialPromotion=showPromotionOverlay('w',{forceChoice:true});});
      await page.locator('#promotionBackdrop [data-piece="N"]').click();
      assert.equal(await page.evaluate(()=>window.trialPromotion),'N');
      await page.setViewportSize({width:1920,height:1080});
    }
    await page.evaluate(() => {
      document.getElementById('localPlayTab').click();
      document.getElementById('localNoClock').click();
      document.getElementById('localGameStartBtn').click();
    });
    const board = page.locator('#localBoard');
    const square = name => board.locator('[data-square="' + name + '"]');
    assert.equal(await board.locator('.local-square').count(), 64);
    if (black) {
      await grabAndAim(page, square('e2'), square('e4'));
      await page.mouse.up();
      assert.equal(await square('e4').getAttribute('aria-label'), 'e4 · weißer Bauer');
    }
    assert.equal(await board.getAttribute('data-orientation'), black ? 'b' : 'w');
    const from = black ? 'g8' : 'g1';
    const aim = black ? 'f6' : 'f3';
    const other = black ? 'h6' : 'h3';
    const end = await grabAndAim(page, square(from), square(aim));
    const ghost=await center(page.locator('.local-drag-ghost'));
    assert.ok(Math.hypot(ghost.x-end.x,ghost.y-end.y)<2,'Figur am Mauszeiger');
    const alternate = await center(square(other));
    // Move the centered board by two files underneath a stationary pointer.
    await page.setViewportSize({width: 1920 + Math.round(2 * (end.x - alternate.x)), height: 1080});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.mouse.up();
    if (await square(other).locator('img').isVisible()) {
      failures.push(from + '–' + aim + ' anvisiert, ' + from + '–' + other + ' ausgeführt');
    }
    assert.ok(await square(from).locator('img').isVisible(),'Springer bleibt auf seinem Ausgangsfeld');
    await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:1920,height:1550}});
    await fixture(page);await page.goto(origin);
    await page.waitForFunction(()=>HammerschachScreenFit.enabled);
    await page.locator('#infoMenuBtn').click();
    assert.ok(await page.locator('#infoMenuPopup').isVisible());
    await page.locator('#infoMenuBtn').click();
    // A local room snapshot exercises the real render/input code without sending moves.
    await page.evaluate(()=>{
      onlineRoomId='screen-test';onlineConnected=true;onlineGameStarted=true;onlineRoleCode='w';
      activeTimeCategory='daily';
      currentGameSetup={variant:GAME_VARIANT_FREESTYLE,positionId:42,backRank:chess960BackRankById(42)};
      updateMemberLobbyUi();updateAnalyzerToolAvailability();renderBoard();
    });
    const square=(board,x,y)=>page.locator('#'+board+' .square[data-x="'+x+'"][data-y="'+y+'"]');
    await page.evaluate(()=>openVariationBoard());
    await square('variationBoard',4,6).click();await square('variationBoard',4,4).click();
    assert.equal(await page.evaluate(()=>variationHistory.length),1);
    await page.evaluate(()=>closeVariationBoard());
    await square('board',4,6).click();
    assert.ok(await page.locator('#board .legal').count()>0);
    await square('board',4,4).click();
    assert.equal(await page.evaluate(()=>pendingDailyMove?.move.san),'e4');
    await page.setViewportSize({width:1280,height:850});
    assert.equal(await page.evaluate(()=>pendingDailyMove?.move.san),'e4');
    await page.evaluate(()=>{
      cancelPendingDailyMove();activeTimeCategory='blitz';onlineRoleCode='b';orientationWhite=false;renderBoard();
    });
    await square('board',4,1).click();await square('board',4,3).click();
    assert.deepEqual(await page.evaluate(()=>queuedPremove?.to),[4,3]);
    await page.setViewportSize({width:1920,height:1080});
    assert.deepEqual(await page.evaluate(()=>queuedPremove?.to),[4,3]);
    await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await fixture(page);
    await page.route('https://host.test/',route=>route.fulfill({contentType:'text/html',
      body:'<style>*{margin:0}iframe{border:0;width:100%;height:3500px}</style><iframe src="https://gamer.test/"></iframe>'}));
    await page.goto('https://host.test/');
    const child=page.frames().find(f=>f.url().startsWith(origin));
    await child.waitForFunction(()=>HammerschachScreenFit.scale===1.4);
    await page.setViewportSize({width:1920,height:650});
    await child.waitForFunction(()=>HammerschachScreenFit.scale===1);
    await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:1720,height:900}});
    await fixture(page);await page.goto(origin);
    await page.waitForFunction(()=>HammerschachScreenFit.enabled);
    for(const tool of ['analyzer','player']){
      await page.evaluate(name=>setEmbeddedToolActive(name),tool);
      const id=tool+'ToolFrame';
      const frame=page.frameLocator('#'+id);
      await frame.locator('#board > *').first().waitFor();
      for(const [width,height] of [[1920,1080],[1440,900],[1400,900],[1720,900]]){
        await page.setViewportSize({width,height});
        await page.waitForFunction(id=>{
          const frame=document.getElementById(id);
          const doc=frame.contentDocument;
          const board=doc.querySelector('.board-column');
          const side=board?.nextElementSibling;
          if(!side?.offsetWidth)return false;
          const rect=side.getBoundingClientRect();
          const outer=frame.getBoundingClientRect(), section=frame.parentElement.getBoundingClientRect();
          return board.getBoundingClientRect().left>=-1 && rect.right<=frame.contentWindow.innerWidth+1
            && Math.abs(outer.right-section.right)<2 && outer.bottom<=section.bottom+2;
        },id);
      }
      const sizes=await page.evaluate(async({id,tool})=>{
        const iframe=document.getElementById(id);
        const shell=iframe.contentDocument.querySelector('.'+tool+'-shell');
        const spacer=iframe.contentDocument.createElement('div');
        spacer.style.height='200px';
        const settle=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        const widths=[], heights=[];
        for(let i=0;i<7;i++){
          shell.append(spacer);await settle();
          const expanded=iframe.offsetHeight;
          spacer.remove();await settle();
          if(expanded-iframe.offsetHeight<150)throw Error(tool+' Rahmen schrumpft nach Inhaltsänderung nicht zurück');
          widths.push(document.querySelector('.shell').getBoundingClientRect().width);
          heights.push(iframe.offsetHeight);
        }
        return {widths,heights};
      },{id,tool});
      assert.equal(new Set(sizes.heights).size,1,tool+' stabiler Rahmen bei wiederholter Messung');
      assert.equal(new Set(sizes.widths).size,1,tool+' stabile Breite');
    }
    await page.evaluate(()=>{
      closeEmbeddedTools();onlineRoomId='fit-room';onlineConnected=true;onlineGameStarted=true;
      onlineRoleCode='w';activeTimeCategory='blitz';
      updateMemberLobbyUi();updateAnalyzerToolAvailability();updateSidePanelLayout();renderBoard();
    });
    assert.ok(await page.locator('#boardPlayerTop').isVisible());
    assert.ok(await page.locator('#boardPlayerBottom').isVisible());
    await page.locator('#showChatPanelBtn').click();
    await page.evaluate(()=>{
      updateChatControls();
      appendChatMessage({id:'room-edge-test', senderName:'Schwarz', text:'Testnachricht '.repeat(18)},
        {suppressUnread:true});
    });
    for(const [width,height] of [[1920,1080],[1720,900],[1720,800],[2560,1440]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.waitForFunction(h=>{
        const board=document.querySelector('.top-layout .board-wrapper').getBoundingClientRect();
        const top=document.getElementById('boardPlayerTop').getBoundingClientRect().top;
        const bottom=document.getElementById('boardPlayerBottom').getBoundingClientRect().bottom;
        const scale=HammerschachScreenFit.scale;
        if(Math.abs(board.height-board.width)>1)return false;
        if((bottom-top)/scale+12>h)return scale===1;
        window.scrollBy(0,top-5);
        return (h<1080 || scale>1) && document.getElementById('boardPlayerTop').getBoundingClientRect().top>=0
          && document.getElementById('boardPlayerBottom').getBoundingClientRect().bottom<=h;
      },height);
      const send=page.locator('#chatSendBtn');
      await send.evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().top-innerHeight/2));
      assert.ok(await send.evaluate(el=>{
        const r=el.getBoundingClientRect();
        const panel=document.querySelector('#chatPanel').getBoundingClientRect();
        const message=document.querySelector('#chatMessages .chat-message-text');
        return message.scrollWidth<=message.clientWidth+1 && panel.left>=0 && panel.right<=document.documentElement.clientWidth
          && r.left>=panel.left && r.right<=panel.right+1
          && el.contains(document.elementFromPoint(r.right-3,r.top+r.height/2));
      }),'Rechte Chatkante und Senden-Schaltfläche erreichbar');
    }
    await page.close();
  }
  // A saved 1000 px board survives the trial even when the tool is already
  // open, the viewport crosses the breakpoint, or the account changes.
  {
    saved=false;
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await fixture(page);await page.goto(origin);
    await page.evaluate(()=>setEmbeddedToolActive('analyzer'));
    const child=page.frameLocator('#analyzerToolFrame');
    await child.locator('#board .square').first().waitFor();
    await page.evaluate(()=>HammerschachSettings.open());
    const toggle=page.getByRole('checkbox',{name:'Automatische Bildschirmoptimierung'});
    await toggle.waitFor();
    await page.locator('#gamerSettings [data-size="1000"]').click();
    const stored=()=>page.evaluate(()=>localStorage.getItem('hammerschach.desktopBoardSize.v1'));
    assert.equal(await stored(),'1000');
    const toolState=(automatic)=>page.waitForFunction(automatic=>{
      const doc=document.querySelector('#analyzerToolFrame').contentWindow;
      return doc.HammerschachBoardSize.get()===(automatic?760:1000)
        && doc.HammerschachBoardSize.available()===!automatic
        && doc.document.getElementById('boardSizeWrap').hidden===automatic;
    },automatic);
    await toolState(false);
    await toggle.check();
    await toolState(true);
    assert.equal(await page.locator('#settingsBoardSize').isVisible(),false);
    await page.waitForFunction(()=>HammerschachScreenFit.scale>1.2);
    await page.evaluate(()=>HammerschachBoardSize.set(860));
    assert.equal(await stored(),'1000');
    await page.setViewportSize({width:1100,height:850});
    await page.waitForFunction(()=>HammerschachScreenFit.scale===1);
    assert.equal(await page.evaluate(()=>HammerschachBoardSize.get()),760);
    await page.setViewportSize({width:1920,height:1080});
    await toggle.uncheck();await toolState(false);
    assert.equal(await page.locator('#settingsBoardSize').inputValue(),'1000');
    await toggle.check();await toolState(true);
    await page.evaluate(()=>saveAuthState('other',{id:'two',username:'Mitglied',isAdmin:false}));
    await page.waitForFunction(()=>!HammerschachScreenFit.enabled && HammerschachBoardSize.get()===1000);
    assert.equal(await stored(),'1000');
    await page.close();
    saved=true;
  }
  for(const [width,height] of [[390,844],[1024,768],[1366,1024]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
    await fixture(page);await page.goto(origin);
    await page.waitForFunction(()=>HammerschachScreenFit.enabled);
    if(width<=1100)assert.equal(await page.evaluate(()=>HammerschachScreenFit.scale),1);
    await page.evaluate(()=>{
      document.getElementById('localPlayTab').click();
      document.getElementById('localNoClock').click();
      document.getElementById('localGameStartBtn').click();
    });
    await page.locator('#localBoard [data-square="e2"]').tap();
    await page.locator('#localBoard [data-square="e4"]').tap();
    assert.equal(await page.locator('#localBoard [data-square="e4"]').getAttribute('aria-label'),'e4 · weißer Bauer');
    await page.evaluate(()=>saveAuthState('other',{id:'two',username:'Mitglied',isAdmin:false}));
    await page.waitForFunction(()=>!HammerschachScreenFit.enabled);
    await page.evaluate(()=>HammerschachSettings.open());
    assert.equal(await page.getByLabel('Automatische Bildschirmoptimierung').count(),0);
    await page.evaluate(()=>saveAuthState('',null));
    assert.equal(await page.evaluate(()=>HammerschachScreenFit.scale),1);
    await page.close();
  }
  {
    saved=false;
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await fixture(page,{id:'test-fabili',username:'Fabili',isAdmin:false});
    await page.goto(origin);
    await page.locator('#themeToggleBtn').click();
    const toggle=page.getByRole('checkbox',{name:'Automatische Bildschirmoptimierung'});
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(),false);
    await page.evaluate(()=>saveAuthState(onlineAuthToken,onlineAuthUser));
    assert.ok(await toggle.isVisible(),'Sitzungsbestätigung erhält Fabilis Schalter');
    await toggle.check();
    await page.evaluate(()=>saveAuthState(onlineAuthToken,onlineAuthUser));
    assert.ok(await toggle.isChecked(),'Sitzungsbestätigung erhält Fabilis Auswahl');
    await page.waitForFunction(()=>HammerschachScreenFit.scale>1);
    await page.reload();
    await page.waitForFunction(()=>HammerschachScreenFit.scale>1);
    await page.close();
  }
  assert.deepEqual(failures, [], 'Ein Größenwechsel darf keinen Zug auf ein anderes Feld auslösen.');
} finally {
  await browser.close();
}
