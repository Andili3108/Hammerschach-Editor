'use strict';
const HammerschachLiveBoard = (() => {
  const dialog=document.getElementById('liveBoardView');
  dialog.setAttribute('aria-labelledby','liveBoardTitle');
  dialog.innerHTML=`<header class="lb-header"><div><h2 id="liveBoardTitle">Vereinsschach</h2></div></header>
    <div class="lb-toolbar"><button type="button" data-lb="back" hidden>← Veranstaltungen</button><button type="button" data-lb="refresh">Aktualisieren</button><label class="lb-round" hidden>Runde <select aria-label="Runde wählen"></select></label><button type="button" data-lb="remove" hidden>Übertragung entfernen</button></div>
    <div class="lb-catalog-tools" hidden><div class="lb-search"><label for="lbEventSearch">Veranstaltung suchen</label><input id="lbEventSearch" type="search" maxlength="100" placeholder="Name der Veranstaltung"><select id="lbEventState" aria-label="Veranstaltungsstatus"><option value="all">Alle Veranstaltungen</option><option value="live">Laufend</option><option value="upcoming">Geplant</option><option value="finished">Beendet</option></select></div>
    <details class="lb-add"><summary>Eigene Übertragung hinzufügen</summary><form class="lb-source-form"><label>Name<input name="title" required maxlength="160" autocomplete="off"></label><label>Übertragungslink<input name="url" type="url" required maxlength="2048" placeholder="DGT-, Lichess-Runden- oder PGN-Link" autocomplete="off"></label><label class="lb-dgt-round" hidden>DGT-Runde<input name="round" type="number" min="1" max="100" value="1"></label><button type="submit">Hinzufügen</button></form></details></div>
    <details class="lb-search-panel" hidden open><summary>Spieler oder Brett suchen</summary><form class="lb-search"><label for="lbSearch">Spieler oder Brett suchen</label><input id="lbSearch" type="search" maxlength="80" placeholder="Name oder Brettnummer" autocomplete="off"><button type="submit">Suchen / Springen</button><button type="button" data-lb="clear">Alle Bretter</button></form></details>
    <p class="lb-status" role="status" aria-live="polite"></p><div class="lb-content"></div>
    <nav class="lb-catalog-pages" aria-label="Veranstaltungsseiten" hidden><button type="button" data-lb="event-prev">← Zurück</button><span></span><button type="button" data-lb="event-next">Vor →</button></nav>
    <nav class="lb-pages" aria-label="Brettseiten" hidden><button type="button" data-lb="prev">← Zurück</button><span></span><button type="button" data-lb="next">Vor →</button></nav>`;
  const content=dialog.querySelector('.lb-content'),status=dialog.querySelector('.lb-status'),search=dialog.querySelector('.lb-search-panel form'),pages=dialog.querySelector('.lb-pages');
  const searchPanel=dialog.querySelector('.lb-search-panel');
  const catalogTools=dialog.querySelector('.lb-catalog-tools'),catalogPages=dialog.querySelector('.lb-catalog-pages'),roundControl=dialog.querySelector('.lb-round'),roundSelect=roundControl.querySelector('select'),sourceForm=dialog.querySelector('.lb-source-form');
  searchPanel.open=!window.matchMedia('(max-width:1000px)').matches;
  dialog.querySelectorAll('button').forEach(b=>b.classList.add('button-flat'));
  const button=name=>dialog.querySelector(`[data-lb="${name}"]`);
  const state={category:'club',event:null,events:[],page:1,pages:1,query:'',board:'',data:null,ply:null,flipped:false,timer:null,controller:null,generation:0,lastAt:0,delay:0,failures:0,token:'',returnFocus:null,catalogPage:1,catalogPages:1,catalogNotice:''};
  const replays=new Map();
  const member=()=>!!(onlineAuthToken&&String(onlineAuthUser?.username||'').trim().toLowerCase()==='andili');
  const visible=()=>!dialog.hidden&&!document.hidden&&navigator.onLine!==false&&member();
  function node(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;}
  function action(label,fn){const b=node('button','button-flat',label);b.type='button';b.addEventListener('click',fn);return b;}
  function setBusy(busy){sourceForm.querySelector('button').disabled=busy;button('remove').disabled=busy;button('refresh').disabled=busy;button('refresh').textContent=busy?'Wird aktualisiert …':'Aktualisieren';dialog.setAttribute('aria-busy',String(busy));}
  function stop(){clearTimeout(state.timer);state.timer=null;state.generation++;state.controller?.abort();state.controller=null;setBusy(false);}
  function schedule(delay){clearTimeout(state.timer);state.delay=delay;if(delay&&visible())state.timer=setTimeout(load,delay);}
  function clearPosition(){state.data=null;state.ply=null;replays.clear();content.replaceChildren();}
  function updateIdentity(){
    document.querySelectorAll('[data-live-board-member]').forEach(el=>el.hidden=!member());
    if(!dialog.hidden&&(!member()||state.token!==onlineAuthToken)){closeEmbeddedTools();}
  }
  function statusText(data){return (data.event.demo?'DEMO':'')+(data.stale?(data.event.demo?' · ':'')+'Übertragung verzögert.':'');}
  function chooseEvent(event){
    state.event=event;state.page=1;state.query='';state.board='';state.ply=null;
    dialog.querySelector('#lbSearch').value='';catalogTools.hidden=true;catalogPages.hidden=true;
    button('remove').hidden=true;button('remove').textContent='Übertragung entfernen';roundControl.hidden=true;button('back').hidden=false;button('back').textContent='← Veranstaltungen';
    clearPosition();navigate();
  }
  function catalog(){
    searchPanel.hidden=true;pages.hidden=true;button('back').hidden=true;roundControl.hidden=true;button('remove').hidden=true;catalogTools.hidden=false;
    content.className='lb-content lb-events';content.replaceChildren();
    const q=dialog.querySelector('#lbEventSearch').value.trim().toLocaleLowerCase('de'),filter=dialog.querySelector('#lbEventState').value;
    const events=state.events.filter(e=>e.category===state.category&&(!q||e.title.toLocaleLowerCase('de').includes(q))&&(filter==='all'||(filter==='live'?e.ongoing:filter==='finished'?e.finished:!e.finished&&!e.ongoing)));
    state.catalogPages=Math.max(1,Math.ceil(events.length/8));state.catalogPage=Math.min(state.catalogPage,state.catalogPages);
    catalogPages.hidden=state.catalogPages<=1;catalogPages.querySelector('span').textContent=`Seite ${state.catalogPage} / ${state.catalogPages} · ${events.length} Veranstaltungen`;
    button('event-prev').disabled=state.catalogPage<=1;button('event-next').disabled=state.catalogPage>=state.catalogPages;
    if(!events.length)content.append(node('p','lb-empty',q||filter!=='all'?'Keine passenden Veranstaltungen.':'Derzeit keine Veranstaltungen.'));
    for(const e of events.slice((state.catalogPage-1)*8,state.catalogPage*8)){
      const b=action('',()=>chooseEvent(e));b.className='button-flat lb-event';
      const round=/^\d+$/.test(e.round)?'Runde '+e.round:e.round;
      const label=e.demo?'DEMO':e.finished?'Beendet':e.ongoing?'Laufend':e.automatic?'Geplant':'Übertragung';
      b.append(node('strong','',e.title),node('span','',[round,label].filter(Boolean).join(' · ')));content.append(b);
    }
  }
  function replay(g){
    const key=JSON.stringify([g.id,g.fen,g.variant,g.moves,g.error]);
    if(!replays.has(key)){const value=LiveBoardPosition.replay(g);replays.set(key,value);while(replays.size>12)replays.delete(replays.keys().next().value);}
    return replays.get(key);
  }
  function boardView(position,flip){
    const el=node('div','lb-board');el.setAttribute('role','img');el.setAttribute('aria-label','Schachstellung; '+(position.turn==='w'?'Weiß':'Schwarz')+' am Zug');
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){
      const x=flip?7-col:col,y=flip?7-row:row;
      const sq=node('span','lb-square '+((x+y)%2?'lb-dark':'lb-light'));
      if(position.last?.some(([a,b])=>a===x&&b===y))sq.classList.add('lb-last');
      const p=position.board[y][x];if(p!=='.'){const img=document.createElement('img');img.src=pieceImg[p];img.alt='';img.draggable=false;sq.append(img);}
      if(col===0)sq.append(node('small','lb-rank',String(8-y)));
      if(row===7)sq.append(node('small','lb-file','abcdefgh'[x]));
      el.append(sq);
    }
    return el;
  }
  function card(g,single){
    const el=node('article','lb-card');
    const title=`Brett ${g.label||g.board} · ${g.result==='*'?'Läuft / wartet':g.result}`;
    const top=single&&state.flipped?'white':'black',bottom=top==='white'?'black':'white';
    const player=side=>{el.append(node('div','lb-player',`${side==='white'?'○':'●'} ${g[side]}`));if(single&&g.clocks?.[side])el.append(node('div','lb-clock',g.clocks[side]));};
    el.append(node('h3','',title));player(top);
    try{
      const r=replay(g),positions=r.positions;
      const ply=single&&state.ply!==null?Math.min(state.ply,positions.length-1):positions.length-1;
      el.append(boardView(positions[ply],single&&state.flipped));
      if(single){
        player(bottom);
        const controls=node('div','lb-replay');
        const at=p=>{state.ply=p;render(state.data);};
        const first=action('⏮',()=>at(0));first.setAttribute('aria-label','Startstellung');first.disabled=ply===0;
        const prev=action('◀',()=>at(ply-1));prev.setAttribute('aria-label','Voriger Zug');prev.disabled=ply===0;
        const next=action('▶',()=>at(ply+1));next.setAttribute('aria-label','Nächster Zug');next.disabled=ply===positions.length-1;
        controls.append(first,prev,node('span','',`${ply} / ${positions.length-1}`),next,action('Aktueller Stand',()=>at(null)),action('Brett drehen',()=>{state.flipped=!state.flipped;render(state.data);}));el.append(controls);
        const notation=node('div','lb-notation');notation.setAttribute('aria-label','Zugfolge');
        g.moves.forEach((san,i)=>{
          const n=r.firstNumber+Math.floor((i+(r.firstTurn==='b'?1:0))/2);
          const black=(i+(r.firstTurn==='b'?1:0))%2===1;
          const b=action(`${n}${black?'…':'.'} ${san}`,()=>at(i+1));b.classList.toggle('lb-selected',i+1===ply);if(i+1===ply)b.setAttribute('aria-current','step');notation.append(b);
        });el.append(notation);
      }
    }catch(error){el.append(node('p','lb-error',error.message));}
    if(!single||!el.querySelector('.lb-board'))player(bottom);
    if(g.stale)el.append(node('p','lb-error','Übertragung verzögert.'));
    if(!single){
      const open=()=>{state.board=g.id;state.ply=null;state.flipped=false;clearPosition();navigate();};
      el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`Brett ${g.label||g.board}: ${g.white} gegen ${g.black} öffnen`);
      el.addEventListener('click',open);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    }
    return el;
  }
  function render(data){
    state.data=data;state.event=data.event;state.pages=data.pages;state.page=data.page;
    catalogTools.hidden=true;catalogPages.hidden=true;
    roundControl.hidden=!data.event.rounds?.length;roundSelect.replaceChildren();
    for(const round of data.event.rounds||[]){const option=node('option','',round.name);option.value=round.id;roundSelect.append(option);}roundSelect.value=data.event.id;
    button('remove').hidden=!data.event.saved;
    dialog.querySelector('h2').textContent=data.event.title;
    button('back').hidden=false;button('back').textContent=state.board?'← Brettübersicht':'← Veranstaltungen';
    searchPanel.hidden=!!state.board;
    content.className='lb-content '+(state.board?'lb-single':'lb-grid');content.replaceChildren();
    if(!data.games.length)content.append(node('p','',state.query?'Keine passenden Bretter gefunden.':'Noch keine Bretter veröffentlicht.'));
    data.games.forEach(g=>content.append(card(g,!!state.board)));
    pages.hidden=!!state.board||data.pages<=1;pages.querySelector('span').textContent=`Seite ${data.page} / ${data.pages} · ${data.total} Bretter`;
    button('prev').disabled=data.page<=1;button('next').disabled=data.page>=data.pages;
  }
  function contentSignature(data){return JSON.stringify([data.event,data.page,data.pages,data.total,data.games.map(({updatedAt,...g})=>g)]);}
  async function load(manual=false){
    if(!visible()||state.controller){if(!dialog.hidden&&navigator.onLine===false)status.textContent='Offline – Aktualisieren ist erst mit Internetverbindung möglich.';return;}
    const generation=++state.generation,token=onlineAuthToken;
    const controller=new AbortController();state.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),25000);
    setBusy(true);status.textContent=state.event?'Brettdaten werden geladen …':'Veranstaltungen werden geprüft …';
    try{
      let path='/api/live-board/events';
      if(state.event){const params=new URLSearchParams({page:String(state.page),q:state.query});if(state.board)params.set('board',state.board);path+=`/${state.event.id}/boards?${params}`;}
      else path+='?category='+state.category;
      const data=await authApi(path,{signal:controller.signal,cache:'no-store'});
      if(generation!==state.generation||token!==onlineAuthToken||!visible())return;
      state.lastAt=Date.now();state.failures=0;
      if(!state.event){
        state.events=data.events;catalog();
        state.catalogNotice=data.discoveryUnavailable?'Veranstaltungssuche derzeit nicht erreichbar.':data.stale?'Veranstaltungsliste verzögert.':'';
        status.textContent=state.catalogNotice||(manual?'Aktualisiert.':'');
        schedule(0);
      }
      else{if(!state.data||contentSignature(state.data)!==contentSignature(data))render(data);else state.data=data;status.textContent=statusText(data);schedule(data.pollAfterMs);}
    }catch(error){
      if(generation!==state.generation)return;
      if(['NOT_AUTHENTICATED','LIVE_BOARD_RESTRICTED'].includes(error.data?.code)){stop();clearPosition();state.events=[];state.event=null;searchPanel.hidden=true;pages.hidden=true;catalogTools.hidden=true;catalogPages.hidden=true;roundControl.hidden=true;button('remove').hidden=true;button('back').hidden=true;status.textContent=error.data?.code==='LIVE_BOARD_RESTRICTED'?'LIVE-BOARD ist derzeit nur für Andili freigeschaltet.':'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.';state.delay=0;}
      else{status.textContent=(state.data?'Der letzte angezeigte Stand bleibt erhalten. ':'')+(error.name==='AbortError'?'Die Quelle antwortet zu langsam.':error.message);schedule(Math.min(240000,60000*2**state.failures++));}
    }finally{
      clearTimeout(timeout);
      if(state.controller===controller){state.controller=null;setBusy(false);}
    }
  }
  function navigate(manual=false){stop();state.delay=30000;load(manual);}
  function open(category){
    if(member())openEmbeddedToolFromCurrentContext(category==='tournament'?'live-board-tournament':'live-board-club');
  }
  function setView(category){
    if(!category){stop();dialog.hidden=true;clearPosition();state.events=[];sourceForm.reset();dialog.querySelector('.lb-add').open=false;return;}
    if(!dialog.hidden&&state.category===category&&state.token===onlineAuthToken)return;
    stop();clearPosition();state.token=onlineAuthToken;state.category=category;state.event=null;state.board='';state.query='';state.page=1;state.failures=0;state.catalogPage=1;state.catalogNotice='';dialog.querySelector('#lbEventSearch').value='';dialog.querySelector('#lbEventState').value='all';catalogTools.hidden=true;catalogPages.hidden=true;roundControl.hidden=true;button('remove').hidden=true;
    dialog.querySelector('h2').textContent=category==='club'?'Vereinsschach':'Turnierschach';
    searchPanel.hidden=true;pages.hidden=true;button('back').hidden=true;
    closeClubChessMenu();dialog.hidden=false;navigate();
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
  }
  button('refresh').addEventListener('click',()=>{if(!state.controller)navigate(true);});
  button('back').addEventListener('click',()=>{
    if(state.board){state.board='';clearPosition();navigate();}
    else{stop();state.event=null;clearPosition();dialog.querySelector('h2').textContent=state.category==='club'?'Vereinsschach':'Turnierschach';catalog();status.textContent=state.catalogNotice;state.delay=0;}
  });
  search.addEventListener('submit',e=>{e.preventDefault();state.query=dialog.querySelector('#lbSearch').value.trim();state.page=1;clearPosition();navigate();});
  button('clear').addEventListener('click',()=>{dialog.querySelector('#lbSearch').value='';state.query='';state.page=1;clearPosition();navigate();});
  button('prev').addEventListener('click',()=>{if(state.page>1){state.page--;clearPosition();navigate();}});
  button('next').addEventListener('click',()=>{if(state.page<state.pages){state.page++;clearPosition();navigate();}});
  roundSelect.addEventListener('change',()=>chooseEvent({...state.event,id:roundSelect.value}));
  for(const id of ['lbEventSearch','lbEventState'])dialog.querySelector('#'+id).addEventListener(id==='lbEventSearch'?'input':'change',()=>{state.catalogPage=1;catalog();});
  button('event-prev').addEventListener('click',()=>{if(state.catalogPage>1){state.catalogPage--;catalog();}});
  button('event-next').addEventListener('click',()=>{if(state.catalogPage<state.catalogPages){state.catalogPage++;catalog();}});
  sourceForm.elements.url.addEventListener('input',()=>{const value=sourceForm.elements.url.value;dialog.querySelector('.lb-dgt-round').hidden=!/livechesscloud\.com/i.test(value);const match=value.match(/\/(\d{1,3})\/?$/);if(match&&!dialog.querySelector('.lb-dgt-round').hidden)sourceForm.elements.round.value=match[1];});
  async function changeSource(path,options){
    if(!visible()||state.controller)return;
    stop();const generation=state.generation,token=onlineAuthToken,controller=new AbortController();state.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),25000);setBusy(true);status.textContent='Übertragung wird geprüft …';
    try{
      const data=await authApi(path,{...options,signal:controller.signal});
      if(generation!==state.generation||token!==onlineAuthToken||!visible())return;
      sourceForm.reset();dialog.querySelector('.lb-add').open=false;dialog.querySelector('.lb-dgt-round').hidden=true;
      state.controller=null;
      if(data.event){state.events.unshift(data.event);chooseEvent(data.event);}
      else{state.event=null;state.board='';clearPosition();dialog.querySelector('h2').textContent=state.category==='club'?'Vereinsschach':'Turnierschach';navigate(true);}
    }catch(error){if(generation===state.generation){status.textContent=error.name==='AbortError'?'Die Quelle antwortet zu langsam.':error.message;if(['NOT_AUTHENTICATED','LIVE_BOARD_RESTRICTED'].includes(error.data?.code)){stop();clearPosition();state.events=[];state.event=null;state.delay=0;catalogTools.hidden=true;catalogPages.hidden=true;pages.hidden=true;searchPanel.hidden=true;roundControl.hidden=true;button('back').hidden=true;button('remove').hidden=true;}}}
    finally{clearTimeout(timeout);if(state.controller===controller){state.controller=null;setBusy(false);}}
  }
  sourceForm.addEventListener('submit',e=>{e.preventDefault();changeSource('/api/live-board/sources',{method:'POST',body:JSON.stringify({category:state.category,title:sourceForm.elements.title.value,url:sourceForm.elements.url.value,round:dialog.querySelector('.lb-dgt-round').hidden?undefined:Number(sourceForm.elements.round.value)})});});
  button('remove').addEventListener('click',()=>{
    if(!state.event?.saved)return;
    if(button('remove').textContent!=='Wirklich entfernen?'){button('remove').textContent='Wirklich entfernen?';return;}
    changeSource('/api/live-board/sources/'+state.event.id,{method:'DELETE'});
  });
  function resume(){if(visible()&&state.delay&&!state.controller){const remaining=Math.max(0,state.lastAt+state.delay-Date.now());if(remaining)schedule(remaining);else load();}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else resume();});
  window.addEventListener('offline',()=>{stop();if(!dialog.hidden)status.textContent='Offline – Live-Aktualisierung pausiert.';});
  window.addEventListener('online',resume);window.addEventListener('focus',resume);
  document.querySelectorAll('[data-live-board-category]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.liveBoardCategory)));
  return {open,setView,updateIdentity};
})();
