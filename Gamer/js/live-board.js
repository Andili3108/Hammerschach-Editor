'use strict';
const HammerschachLiveBoard = (() => {
  const scopeLabels={bundesliga:'Bundesliga',nrw:'Schachbund NRW (SBNRW)',ruhrgebiet:'Schachverband Ruhrgebiet (SVRuhrgebiet)',hamm:'Schachbezirk Hamm (SBHamm)',baden:'Baden',bayern:'Bayern',berlin:'Berlin',brandenburg:'Brandenburg',bremen:'Bremen',hamburg:'Hamburg',hessen:'Hessen','mecklenburg-vorpommern':'Mecklenburg-Vorpommern',niedersachsen:'Niedersachsen','rheinland-pfalz':'Rheinland-Pfalz',saarland:'Saarland',sachsen:'Sachsen','sachsen-anhalt':'Sachsen-Anhalt','schleswig-holstein':'Schleswig-Holstein',thueringen:'Thüringen',wuerttemberg:'Württemberg',own:'Weitere Vereinsübertragungen'};
  const intervalKey=()=> 'hammerschachLiveInterval:'+String(onlineAuthUser?.id||onlineAuthUser?.username||'');
  function storedInterval(){try{const n=Number(localStorage.getItem(intervalKey()));return [5000,10000,15000,30000].includes(n)?n:10000;}catch(_){return 10000;}}
  const dialog=document.getElementById('liveBoardView');
  dialog.setAttribute('aria-labelledby','liveBoardTitle');
  dialog.innerHTML=`<header class="lb-header"><div><h2 id="liveBoardTitle">Vereinsschach</h2></div></header>
    <div class="lb-toolbar"><button type="button" data-lb="back" hidden>← Veranstaltungen</button><button type="button" data-lb="refresh">Aktualisieren</button><label class="lb-round" hidden>Runde <select aria-label="Runde wählen"></select></label><button type="button" data-lb="remove" hidden>Übertragung entfernen</button></div>
    <div class="lb-catalog-tools" hidden><form class="lb-catalog-form"><div class="lb-search"><label for="lbEventSearch">Veranstaltung suchen</label><input id="lbEventSearch" type="search" maxlength="100" placeholder="Name der Veranstaltung"><select id="lbEventState" aria-label="Veranstaltungsstatus"><option value="all">Alle Veranstaltungen</option><option value="live">Laufend</option><option value="upcoming">Geplant</option><option value="finished">Beendet</option></select></div>
    <label class="lb-scope-filter" hidden>Verbandsebene <select id="lbClubScope"><option value="">Alle Ebenen</option><option value="bundesliga">Bundesliga</option><option value="nrw">Schachbund NRW (SBNRW)</option><option value="ruhrgebiet">Schachverband Ruhrgebiet (SVRuhrgebiet)</option><option value="hamm">Schachbezirk Hamm (SBHamm)</option><option value="own">Eigene Vereinsübertragungen</option></select></label>
    <div class="lb-search"><label for="lbPlayerSearch">Spieler suchen</label><input id="lbPlayerSearch" type="search" minlength="2" maxlength="80" placeholder="Spielername" autocomplete="off"><button type="submit">Suchen</button><button type="button" data-lb="reset-filters">Zurücksetzen</button></div></form>
    <details class="lb-add"><summary>Eigene Übertragung hinzufügen</summary><form class="lb-source-form"><label class="lb-source-scope" hidden>Verbandsebene<select name="clubScope" required><option value="">Bitte auswählen</option><option value="bundesliga">Bundesliga</option><option value="nrw">Schachbund NRW (SBNRW)</option><option value="ruhrgebiet">Schachverband Ruhrgebiet (SVRuhrgebiet)</option><option value="hamm">Schachbezirk Hamm (SBHamm)</option><option value="own">Eigene Vereinsübertragungen</option></select></label><label>Name<input name="title" required maxlength="160" autocomplete="off"></label><label>Übertragungslink<input name="url" type="url" required maxlength="2048" placeholder="DGT-, Lichess-Runden- oder PGN-Link" autocomplete="off"></label><label class="lb-dgt-round" hidden>DGT-Runde<input name="round" type="number" min="1" max="100" value="1"></label><button type="submit">Hinzufügen</button></form></details></div>
    <details class="lb-search-panel" hidden open><summary>Spieler oder Brett suchen</summary><form class="lb-search"><label for="lbSearch">Spieler oder Brett suchen</label><input id="lbSearch" type="search" maxlength="80" placeholder="Name oder Brettnummer" autocomplete="off"><button type="submit">Suchen / Springen</button><button type="button" data-lb="clear">Alle Bretter</button></form></details>
    <p class="lb-status" role="status" aria-live="polite"></p><div class="lb-content"></div>
    <button type="button" data-lb="search-more" hidden>Weitere Veranstaltungen durchsuchen</button><nav class="lb-catalog-pages" aria-label="Veranstaltungsseiten" hidden><button type="button" data-lb="event-prev">← Zurück</button><span></span><button type="button" data-lb="event-next">Vor →</button></nav>
    <nav class="lb-pages" aria-label="Brettseiten" hidden><button type="button" data-lb="prev">← Zurück</button><span></span><button type="button" data-lb="next">Vor →</button></nav>`;
  const content=dialog.querySelector('.lb-content'),status=dialog.querySelector('.lb-status'),search=dialog.querySelector('.lb-search-panel form'),pages=dialog.querySelector('.lb-pages');
  const searchPanel=dialog.querySelector('.lb-search-panel');
  const catalogTools=dialog.querySelector('.lb-catalog-tools'),catalogPages=dialog.querySelector('.lb-catalog-pages'),roundControl=dialog.querySelector('.lb-round'),roundSelect=roundControl.querySelector('select'),sourceForm=dialog.querySelector('.lb-source-form');
  searchPanel.open=!window.matchMedia('(max-width:1000px)').matches;
  dialog.querySelectorAll('button').forEach(b=>b.classList.add('button-flat'));
  const button=name=>dialog.querySelector(`[data-lb="${name}"]`);
  const state={category:'club',event:null,events:[],page:1,pages:1,query:'',board:'',data:null,ply:null,flipped:false,timer:null,controller:null,generation:0,lastAt:0,delay:0,failures:0,token:'',returnFocus:null,catalogPage:1,catalogPages:1,catalogNotice:''};
  state.interval=10000;state.tab='moves';state.filters={q:'',scope:'',status:'all',player:''};state.playerSearch=null;
  for(const select of [dialog.querySelector('#lbClubScope'),sourceForm.elements.clubScope]){
    const initial=select.firstElementChild;select.replaceChildren(initial);
    for(const [value,label] of Object.entries(scopeLabels)){const option=node('option','',label);option.value=value;select.append(option);}
  }
  const replays=new Map();
  const member=()=>!!(onlineAuthToken&&onlineAuthUser);
  const manager=()=>member()&&String(onlineAuthUser.username||'').trim().toLowerCase()==='andili';
  const visible=()=>!dialog.hidden&&!document.hidden&&navigator.onLine!==false&&member();
  function node(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;}
  function action(label,fn){const b=node('button','button-flat',label);b.type='button';b.addEventListener('click',fn);return b;}
  function setBusy(busy){sourceForm.querySelector('button').disabled=busy;button('remove').disabled=busy;button('refresh').disabled=busy;button('refresh').textContent=busy?'Wird aktualisiert …':'Aktualisieren';dialog.setAttribute('aria-busy',String(busy));}
  function stop(){clearTimeout(state.timer);state.timer=null;state.generation++;if(state.playerSearch?.running){state.playerSearch.running=false;state.playerSearch.interrupted=true;}state.controller?.abort();state.controller=null;setBusy(false);}
  function schedule(delay){clearTimeout(state.timer);state.delay=delay;if(delay&&visible())state.timer=setTimeout(load,delay);}
  function clearPosition(){state.data=null;state.ply=null;replays.clear();content.replaceChildren();}
  function updateIdentity(){
    document.querySelectorAll('[data-live-board-member]').forEach(el=>el.hidden=!member());
    if(!dialog.hidden&&(!member()||state.token!==onlineAuthToken)){closeEmbeddedTools();}
  }
  function statusText(data){return (data.event.demo?'DEMO':'')+(data.stale?(data.event.demo?' · ':'')+'Übertragung verzögert.':'');}
  function chooseEvent(event,board='',query=''){
    state.event=event;state.page=1;state.query=query;state.board=board;state.ply=null;state.tab='moves';button('search-more').hidden=true;
    dialog.querySelector('#lbSearch').value=query;catalogTools.hidden=true;catalogPages.hidden=true;
    button('remove').hidden=true;button('remove').textContent='Übertragung entfernen';roundControl.hidden=true;button('back').hidden=false;button('back').textContent='← Veranstaltungen';
    clearPosition();navigate();
  }
  const scopeMatches=(scope,event)=>!scope||event===scope||scope==='nrw'&&['ruhrgebiet','hamm'].includes(event)||scope==='ruhrgebiet'&&event==='hamm';
  function catalog(){
    searchPanel.hidden=true;pages.hidden=true;button('back').hidden=true;roundControl.hidden=true;button('remove').hidden=true;catalogTools.hidden=false;
    content.className='lb-content lb-events';content.replaceChildren();
    const scope=state.filters.scope;
    dialog.querySelector('.lb-scope-filter').hidden=state.category!=='club';dialog.querySelector('.lb-source-scope').hidden=state.category!=='club';sourceForm.elements.clubScope.disabled=state.category!=='club';
    const q=state.filters.q,filter=state.filters.status;
    dialog.querySelector('.lb-add').hidden=!manager();
    if(state.playerSearch){renderPlayerResults();return;}
    button('search-more').hidden=true;
    const events=state.events.filter(e=>e.category===state.category&&(state.category!=='club'||scopeMatches(scope,e.clubScope||'own'))&&(!q||e.title.toLocaleLowerCase('de').includes(q))&&(filter==='all'||(filter==='live'?e.ongoing:filter==='finished'?e.finished:e.status!=='unknown'&&!e.finished&&!e.ongoing)));
    const scopes=Object.keys(scopeLabels);
    if(state.category==='club')events.sort((a,b)=>scopes.indexOf(a.clubScope||'own')-scopes.indexOf(b.clubScope||'own'));
    state.catalogPages=Math.max(1,Math.ceil(events.length/8));state.catalogPage=Math.min(state.catalogPage,state.catalogPages);
    catalogPages.hidden=state.catalogPages<=1;catalogPages.querySelector('span').textContent=`Seite ${state.catalogPage} / ${state.catalogPages} · ${events.length} Veranstaltungen`;
    button('event-prev').disabled=state.catalogPage<=1;button('event-next').disabled=state.catalogPage>=state.catalogPages;
    if(!events.length)content.append(node('p','lb-empty',q||scope||filter!=='all'?'Keine passenden Veranstaltungen.':'Derzeit keine Veranstaltungen.'));
    let lastScope=null;
    for(const e of events.slice((state.catalogPage-1)*8,state.catalogPage*8)){
      if(state.category==='club'&&lastScope!==(e.clubScope||'own')){lastScope=e.clubScope||'own';content.append(node('h3','lb-scope-heading',scopeLabels[lastScope]||scopeLabels.own));}
      const b=action('',()=>chooseEvent(e));b.className='button-flat lb-event';
      const round=/^\d+$/.test(e.round)?'Runde '+e.round:e.round;
      const label=e.demo?'DEMO':e.finished?'Beendet':e.ongoing?'Laufend':e.status==='unknown'?'Übertragung':e.automatic?'Geplant':'Übertragung';
      b.append(node('strong','',e.title),node('span','',[round,label].filter(Boolean).join(' · ')));content.append(b);
    }
  }
  function filteredEvents(){
    const f=state.filters;
    return state.events.filter(e=>e.category===state.category&&(!f.q||e.title.toLocaleLowerCase('de').includes(f.q))&&(state.category!=='club'||scopeMatches(f.scope,e.clubScope||'own'))&&(f.status==='all'||(f.status==='live'?e.ongoing:f.status==='finished'?e.finished:e.status!=='unknown'&&!e.finished&&!e.ongoing)));
  }
  function renderPlayerResults(){
    const job=state.playerSearch;if(!job)return;
    content.className='lb-content lb-player-results';content.replaceChildren();catalogPages.hidden=true;
    for(const result of job.results){
      if(!result.matches?.length)continue;
      const group=node('section','lb-player-event');group.append(node('h3','',result.event.title));
      for(const g of result.matches){
        const b=action(`Brett ${g.label||g.board}: ${g.white} – ${g.black}`,()=>{
          chooseEvent(result.event,g.id);
        });group.append(b);
      }
      if(result.stale)group.append(node('p','','Paarungen verzögert.'));
      if(result.truncated)group.append(action('Weitere Treffer in dieser Veranstaltung',()=>{chooseEvent(result.event,'',job.query);}));
      content.append(group);
    }
    const unavailable=job.results.filter(r=>r.unavailable).length;
    const stale=job.results.filter(r=>r.stale).length;
    status.textContent=`${job.offset} / ${job.events.length} Veranstaltungen geprüft.`+(job.running?' Suche läuft …':job.interrupted?' Suche pausiert.':job.offset<job.events.length?' Weitere Veranstaltungen können durchsucht werden.':'')+(unavailable?` ${unavailable} nicht erreichbar.`:'')+(stale?` ${stale} mit älteren Paarungen.`:'');
    if(!job.results.some(r=>r.matches?.length))content.append(node('p','lb-empty',job.running?'Spieler wird gesucht …':'Bisher keine passenden Spieler in den geprüften Veranstaltungen gefunden.'));
    button('search-more').hidden=job.offset>=job.events.length;
    button('search-more').disabled=job.running;
  }
  async function searchPlayers(){
    const job=state.playerSearch;
    if(!job||job.running||!visible())return;
    stop();state.delay=0;job.running=true;job.interrupted=false;
    const generation=state.generation,token=onlineAuthToken,controller=new AbortController();state.controller=controller;setBusy(true);renderPlayerResults();
    const end=Math.min(job.events.length,job.offset+12);
    try{
      while(job.offset<end){
        const batch=job.events.slice(job.offset,Math.min(job.offset+3,end));
        const params=new URLSearchParams({q:job.query,events:batch.map(e=>e.id).join(',')});
        const timeout=setTimeout(()=>controller.abort(),35000);
        let data;try{data=await authApi('/api/live-board/players?'+params,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timeout);}
        if(generation!==state.generation||token!==onlineAuthToken||!visible())return;
        job.results.push(...data.results);job.offset+=batch.length;renderPlayerResults();
      }
    }catch(error){
      if(generation!==state.generation)return;
      job.interrupted=true;
      if(error.data?.code==='NOT_AUTHENTICATED'){closeEmbeddedTools();return;}
      job.error=error.name==='AbortError'?'Die Suche hat zu lange gedauert. Bitte erneut versuchen.':error.message;
    }finally{
      if(state.controller===controller){state.controller=null;job.running=false;setBusy(false);if(!state.event){renderPlayerResults();if(job.error){status.textContent+=' '+job.error;job.error='';}}}
    }
  }
  function applyFilters(){
    stop();state.delay=0;
    const player=dialog.querySelector('#lbPlayerSearch').value.trim();
    state.filters={q:dialog.querySelector('#lbEventSearch').value.trim().toLocaleLowerCase('de'),scope:dialog.querySelector('#lbClubScope').value,status:dialog.querySelector('#lbEventState').value,player};state.catalogPage=1;state.playerSearch=null;
    if(player&&player.length<2){state.filters.player='';catalog();status.textContent='Bitte mindestens zwei Zeichen für den Spielernamen eingeben.';return;}
    if(player){state.playerSearch={query:player,events:filteredEvents(),results:[],offset:0,running:false};catalog();searchPlayers();}
    else{catalog();status.textContent=state.catalogNotice;}
  }
  function replay(g){
    const key=JSON.stringify([g.id,g.fen,g.variant,g.moves,g.error]);
    if(!replays.has(key)){const value=LiveBoardPosition.replay(g);replays.set(key,value);while(replays.size>12)replays.delete(replays.keys().next().value);}
    return replays.get(key);
  }
  function boardView(position,flip,gamerStyle=false){
    const el=node('div','lb-board');el.setAttribute('role','img');el.setAttribute('aria-label','Schachstellung; '+(position.turn==='w'?'Weiß':'Schwarz')+' am Zug');
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){
      const x=flip?7-col:col,y=flip?7-row:row;
      const sq=node('span','lb-square '+(gamerStyle?'square '+((x+y)%2?'dark':'light'):((x+y)%2?'lb-dark':'lb-light')));
      if(position.last?.some(([a,b])=>a===x&&b===y))sq.classList.add(gamerStyle?'last-move':'lb-last');
      const p=position.board[y][x];if(p!=='.'){const img=document.createElement('img');img.src=pieceImg[p];img.alt='';img.draggable=false;if(gamerStyle)img.className='piece-img';sq.append(img);}
      if(col===0)sq.append(node('small','lb-rank',String(8-y)));
      if(row===7)sq.append(node('small','lb-file','abcdefgh'[x]));
      el.append(sq);
    }
    return el;
  }
  function singleCard(g){
    const el=node('article','lb-single-layout');
    const boardColumn=node('div','lb-board-column');
    const movesColumn=node('aside','lb-moves-column');movesColumn.setAttribute('aria-label','Zugliste');
    const panel=node('div','side-panel box lb-moves-panel');
    const movesPanel=node('div','side-content moves-panel');
    const title=node('div','moves-title');
    title.append(node('span','','Zugliste'),node('span','lb-moves-position',''));
    const heading=node('h3','lb-game-heading',`Brett ${g.label||g.board}${g.result==='*'?'':' · '+g.result}`);
    const top=state.flipped?'white':'black',bottom=top==='white'?'black':'white';
    const strip=(side,turn)=>{
      const wrapper=node('div','board-player-strip');
      const card=node('div','player-clock-card');card.classList.toggle('active',!g.finished&&turn===(side==='white'?'w':'b'));
      const head=node('div','player-clock-head');const dot=node('span','dot '+side);dot.setAttribute('aria-hidden','true');
      head.append(dot,node('span','player-clock-side',side==='white'?'Weiß':'Schwarz'));
      const names=node('div','player-clock-name-row'),name=node('div','player-clock-name',g[side]);name.title=g[side];names.append(name);
      card.append(head,names);
      if(g.clocks?.[side]){const clock=node('div','player-clock-time',g.clocks[side]);clock.title='Uhrenstand der Übertragung';card.append(clock);}
      wrapper.append(card);return wrapper;
    };
    try{
      const r=replay(g),positions=r.positions;
      const ply=state.ply===null?positions.length-1:Math.min(state.ply,positions.length-1);
      boardColumn.append(strip(top,positions.at(-1).turn),boardView(positions[ply],state.flipped,true),strip(bottom,positions.at(-1).turn));
      const controls=node('div','board-tools lb-replay'),nav=node('div','gamer-board-nav');nav.setAttribute('aria-label','Zugnavigation');
      const at=p=>{state.ply=p;render(state.data);};
      for(const [symbol,label,target,disabled] of [['«','Startstellung',0,ply===0],['‹','Voriger Zug',ply-1,ply===0],['›','Nächster Zug',ply+1,ply===positions.length-1],['»','Aktueller Stand',null,false]]){
        const b=action(symbol,()=>at(target));b.classList.add('gamer-board-nav-btn');b.setAttribute('aria-label',label);b.title=label;b.disabled=disabled;nav.append(b);
      }
      const flip=action('↻',()=>{state.flipped=!state.flipped;render(state.data);});flip.classList.add('icon-btn');flip.setAttribute('aria-label','Brett drehen');flip.title='Brett drehen';controls.append(nav,flip);boardColumn.append(controls);
      title.querySelector('.lb-moves-position').textContent=`${ply} / ${positions.length-1}`;
      const notation=node('div','lb-notation variation-moves');notation.setAttribute('aria-label','Zugfolge');
      g.moves.forEach((san,i)=>{
        const n=r.firstNumber+Math.floor((i+(r.firstTurn==='b'?1:0))/2),black=(i+(r.firstTurn==='b'?1:0))%2===1;
        if(!black||i===0){notation.append(node('span','variation-move-cell move-number',n+'.'));if(black)notation.append(node('span','variation-move-cell'));}
        const b=action(san,()=>at(i+1));b.className='variation-move-cell move-cell move-entry';b.setAttribute('aria-label',`${n}${black?'…':'.'} ${san}`);b.dataset.lbPly=String(i+1);
        b.classList.toggle('current',i+1===ply);if(i+1===ply)b.setAttribute('aria-current','step');notation.append(b);
      });
      if(g.moves.length&&(g.moves.length+(r.firstTurn==='b'?1:0))%2===1)notation.append(node('span','variation-move-cell'));
      if(!g.moves.length)notation.append(node('p','variation-moves-empty','Noch keine Züge.'));
      if(g.finished)notation.append(node('div','move-cell move-result',g.result));
      movesPanel.append(title,notation);const tabs=node('div','side-toggle-row lb-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Brettinformationen');
      const settings=node('div','side-content lb-refresh-panel');settings.id='lbRefreshPanel';settings.setAttribute('role','tabpanel');settings.setAttribute('aria-labelledby','lbRefreshTab');
      movesPanel.id='lbMovesPanel';movesPanel.setAttribute('role','tabpanel');movesPanel.setAttribute('aria-labelledby','lbMovesTab');
      const label=node('label','','Aktualisierung');label.htmlFor='lbInterval';const select=node('select','');select.id='lbInterval';
      for(const n of [5000,10000,15000,30000]){const option=node('option','',`${n/1000} Sekunden`);option.value=String(n);select.append(option);}select.value=String(state.interval);
      select.addEventListener('change',()=>{state.interval=Number(select.value);try{localStorage.setItem(intervalKey(),String(state.interval));}catch(_){}if(state.data?.pollAfterMs>0){if(state.data.stale||state.failures)return;stop();state.lastAt=Date.now();schedule(state.interval);}});
      settings.append(label,select);
      const updateTabs=()=>{movesPanel.hidden=state.tab!=='moves';settings.hidden=state.tab!=='refresh';for(const b of tabs.children){const selected=b.dataset.tab===state.tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}};
      for(const [key,text,id,target] of [['moves','Zugliste','lbMovesTab','lbMovesPanel'],['refresh','Aktualisierung','lbRefreshTab','lbRefreshPanel']]){
        const b=action(text,()=>{state.tab=key;updateTabs();});b.className='side-toggle-btn';b.id=id;b.dataset.tab=key;b.setAttribute('role','tab');b.setAttribute('aria-controls',target);tabs.append(b);
        b.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();state.tab=event.key==='Home'?'moves':event.key==='End'?'refresh':state.tab==='moves'?'refresh':'moves';updateTabs();tabs.querySelector('[aria-selected="true"]').focus();}});
      }
      updateTabs();panel.append(heading,tabs,movesPanel,settings);movesColumn.append(panel);el.append(boardColumn,movesColumn);
      // Scroll only the notation pane; never move the whole page while polling.
      requestAnimationFrame(()=>{if(!notation.isConnected)return;const current=notation.querySelector('[aria-current]');if(!current)return;const a=current.getBoundingClientRect(),b=notation.getBoundingClientRect();if(a.bottom>b.bottom)notation.scrollTop+=a.bottom-b.bottom;else if(a.top<b.top)notation.scrollTop+=a.top-b.top;});
    }catch(error){boardColumn.append(strip(top,''),node('p','lb-error',error.message),strip(bottom,''));el.append(boardColumn);}
    if(g.stale)boardColumn.append(node('p','lb-error','Übertragung verzögert.'));
    return el;
  }
  function card(g,single){
    if(single)return singleCard(g);
    const el=node('article','lb-card');
    const title=`Brett ${g.label||g.board} · ${g.result==='*'?'Läuft / wartet':g.result}`;
    const player=side=>el.append(node('div','lb-player',`${side==='white'?'○':'●'} ${g[side]}`));
    el.append(node('h3','',title));player('black');
    try{const positions=replay(g).positions;el.append(boardView(positions.at(-1),false));}
    catch(error){el.append(node('p','lb-error',error.message));}
    player('white');
    if(g.stale)el.append(node('p','lb-error','Übertragung verzögert.'));
    const open=()=>{state.board=g.id;state.ply=null;state.flipped=false;clearPosition();navigate();};
    el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`Brett ${g.label||g.board}: ${g.white} gegen ${g.black} öffnen`);
    el.addEventListener('click',open);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    return el;
  }
  function render(data){
    const focusId=dialog.contains(document.activeElement)?document.activeElement.id:'';
    state.data=data;state.event=data.event;state.pages=data.pages;state.page=data.page;
    catalogTools.hidden=true;catalogPages.hidden=true;
    roundControl.hidden=!data.event.rounds?.length;roundSelect.replaceChildren();
    for(const round of data.event.rounds||[]){const option=node('option','',round.name);option.value=round.id;roundSelect.append(option);}roundSelect.value=data.event.id;
    button('remove').hidden=!data.event.saved||!manager();
    dialog.querySelector('h2').textContent=data.event.title;
    button('back').hidden=false;button('back').textContent=state.board?'← Brettübersicht':'← Veranstaltungen';
    searchPanel.hidden=!!state.board;
    content.className='lb-content '+(state.board?'lb-single':'lb-grid');content.replaceChildren();
    if(!data.games.length)content.append(node('p','',state.query?'Keine passenden Bretter gefunden.':'Noch keine Bretter veröffentlicht.'));
    data.games.forEach(g=>content.append(card(g,!!state.board)));
    if(['lbInterval','lbMovesTab','lbRefreshTab'].includes(focusId))document.getElementById(focusId)?.focus({preventScroll:true});
    pages.hidden=!!state.board||data.pages<=1;pages.querySelector('span').textContent=`Seite ${data.page} / ${data.pages} · ${data.total} Bretter`;
    button('prev').disabled=data.page<=1;button('next').disabled=data.page>=data.pages;
  }
  function contentSignature(data){return JSON.stringify([data.event,data.page,data.pages,data.total,data.games.map(({updatedAt,...g})=>g)]);}
  async function load(manual=false){
    if(!visible()||state.controller){if(!dialog.hidden&&navigator.onLine===false)status.textContent='Offline – Aktualisieren ist erst mit Internetverbindung möglich.';return;}
    const generation=++state.generation,token=onlineAuthToken;
    const controller=new AbortController();state.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),25000);let startPlayerSearch=false;
    setBusy(true);status.textContent=state.event?'Brettdaten werden geladen …':'Veranstaltungen werden geprüft …';
    try{
      let path='/api/live-board/events';
      if(state.event){const params=new URLSearchParams({page:String(state.page),q:state.query});if(state.board){params.set('board',state.board);params.set('interval',String(state.interval));}path+=`/${state.event.id}/boards?${params}`;}
      else path+='?category='+state.category;
      const data=await authApi(path,{signal:controller.signal,cache:'no-store'});
      if(generation!==state.generation||token!==onlineAuthToken||!visible())return;
      state.lastAt=Date.now();state.failures=0;
      if(!state.event){
        state.events=data.events;state.playerSearch=null;catalog();
        state.catalogNotice=data.discoveryUnavailable&&data.publisherUnavailable?'Veranstaltungssuche derzeit nicht erreichbar.':data.discoveryUnavailable?'Lichess-Suche derzeit nicht erreichbar.':data.publisherUnavailable?'Einige Vereins- oder Verbandsseiten sind derzeit nicht erreichbar.':data.stale?'Veranstaltungsliste verzögert.':'';
        status.textContent=state.catalogNotice||(manual?'Aktualisiert.':'');
        schedule(0);
        if(state.filters.player){startPlayerSearch=true;state.playerSearch={query:state.filters.player,events:filteredEvents(),results:[],offset:0,running:false};catalog();}
      }
      else{if(!state.data||contentSignature(state.data)!==contentSignature(data))render(data);else state.data=data;status.textContent=statusText(data);schedule(data.pollAfterMs);}
    }catch(error){
      if(generation!==state.generation)return;
      if(['NOT_AUTHENTICATED','LIVE_BOARD_RESTRICTED'].includes(error.data?.code)){stop();clearPosition();state.events=[];state.event=null;searchPanel.hidden=true;pages.hidden=true;catalogTools.hidden=true;catalogPages.hidden=true;roundControl.hidden=true;button('remove').hidden=true;button('back').hidden=true;status.textContent=error.data?.code==='LIVE_BOARD_RESTRICTED'?'LIVE-BOARD ist für diese Anmeldung nicht verfügbar.':'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.';state.delay=0;}
      else{status.textContent=(state.data?'Der letzte angezeigte Stand bleibt erhalten. ':'')+(error.name==='AbortError'?'Die Quelle antwortet zu langsam.':error.message);schedule(Math.min(240000,60000*2**state.failures++));}
    }finally{
      clearTimeout(timeout);
      if(state.controller===controller){state.controller=null;setBusy(false);if(startPlayerSearch&&!state.event&&generation===state.generation)searchPlayers();}
    }
  }
  function navigate(manual=false){stop();state.delay=30000;load(manual);}
  function open(category){
    if(member())openEmbeddedToolFromCurrentContext(category==='tournament'?'live-board-tournament':'live-board-club');
  }
  function setView(category){
    if(!category){stop();dialog.hidden=true;clearPosition();state.events=[];state.playerSearch=null;sourceForm.reset();dialog.querySelector('.lb-add').open=false;return;}
    if(!dialog.hidden&&state.category===category&&state.token===onlineAuthToken)return;
    stop();clearPosition();state.token=onlineAuthToken;state.interval=storedInterval();state.tab='moves';state.filters={q:'',scope:'',status:'all',player:''};state.playerSearch=null;dialog.querySelector('#lbPlayerSearch').value='';button('search-more').hidden=true;state.category=category;state.event=null;state.board='';state.query='';state.page=1;state.failures=0;state.catalogPage=1;state.catalogNotice='';dialog.querySelector('#lbEventSearch').value='';dialog.querySelector('#lbEventState').value='all';dialog.querySelector('#lbClubScope').value='';catalogTools.hidden=true;catalogPages.hidden=true;roundControl.hidden=true;button('remove').hidden=true;
    dialog.querySelector('h2').textContent=category==='club'?'Vereinsschach':'Turnierschach';
    searchPanel.hidden=true;pages.hidden=true;button('back').hidden=true;
    closeClubChessMenu();dialog.hidden=false;navigate();
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
  }
  button('refresh').addEventListener('click',()=>{if(!state.controller)navigate(true);});
  button('back').addEventListener('click',()=>{
    if(state.board){state.board='';clearPosition();navigate();}
    else{stop();state.event=null;clearPosition();dialog.querySelector('h2').textContent=state.category==='club'?'Vereinsschach':'Turnierschach';catalog();if(!state.playerSearch)status.textContent=state.catalogNotice;state.delay=0;}
  });
  search.addEventListener('submit',e=>{e.preventDefault();state.query=dialog.querySelector('#lbSearch').value.trim();state.page=1;clearPosition();navigate();});
  button('clear').addEventListener('click',()=>{dialog.querySelector('#lbSearch').value='';state.query='';state.page=1;clearPosition();navigate();});
  button('prev').addEventListener('click',()=>{if(state.page>1){state.page--;clearPosition();navigate();}});
  button('next').addEventListener('click',()=>{if(state.page<state.pages){state.page++;clearPosition();navigate();}});
  roundSelect.addEventListener('change',()=>chooseEvent({...state.event,id:roundSelect.value}));
  dialog.querySelector('.lb-catalog-form').addEventListener('submit',e=>{e.preventDefault();applyFilters();});
  button('search-more').addEventListener('click',searchPlayers);
  button('reset-filters').addEventListener('click',()=>{dialog.querySelector('#lbEventSearch').value='';dialog.querySelector('#lbPlayerSearch').value='';dialog.querySelector('#lbEventState').value='all';dialog.querySelector('#lbClubScope').value='';applyFilters();});
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
      if(data.event){
        if(data.event.category!==state.category){open(data.event.category);return;}
        state.events=state.events.filter(e=>e.id!==data.event.id);state.events.unshift(data.event);chooseEvent(data.event);
      }
      else{state.event=null;state.board='';clearPosition();dialog.querySelector('h2').textContent=state.category==='club'?'Vereinsschach':'Turnierschach';navigate(true);}
    }catch(error){if(generation===state.generation){status.textContent=error.name==='AbortError'?'Die Quelle antwortet zu langsam.':error.message;if(['NOT_AUTHENTICATED','LIVE_BOARD_RESTRICTED'].includes(error.data?.code)){stop();clearPosition();state.events=[];state.event=null;state.delay=0;catalogTools.hidden=true;catalogPages.hidden=true;pages.hidden=true;searchPanel.hidden=true;roundControl.hidden=true;button('back').hidden=true;button('remove').hidden=true;}}}
    finally{clearTimeout(timeout);if(state.controller===controller){state.controller=null;setBusy(false);}}
  }
  sourceForm.addEventListener('submit',e=>{e.preventDefault();changeSource('/api/live-board/sources',{method:'POST',body:JSON.stringify({category:state.category,clubScope:state.category==='club'?sourceForm.elements.clubScope.value:undefined,title:sourceForm.elements.title.value,url:sourceForm.elements.url.value,round:dialog.querySelector('.lb-dgt-round').hidden?undefined:Number(sourceForm.elements.round.value)})});});
  button('remove').addEventListener('click',()=>{
    if(!state.event?.saved)return;
    if(button('remove').textContent!=='Wirklich entfernen?'){button('remove').textContent='Wirklich entfernen?';return;}
    changeSource('/api/live-board/sources/'+state.event.id,{method:'DELETE'});
  });
  function resume(){if(visible()&&!state.event&&state.playerSearch&&!state.playerSearch.running)renderPlayerResults();if(visible()&&state.delay&&!state.controller){const remaining=Math.max(0,state.lastAt+state.delay-Date.now());if(remaining)schedule(remaining);else load();}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else resume();});
  window.addEventListener('offline',()=>{stop();if(!dialog.hidden)status.textContent='Offline – Live-Aktualisierung pausiert.';});
  window.addEventListener('online',resume);window.addEventListener('focus',resume);
  document.querySelectorAll('[data-live-board-category]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.liveBoardCategory)));
  return {open,setView,updateIdentity};
})();
