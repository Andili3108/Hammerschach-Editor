'use strict';
window.HammerschachCorner = (() => {
  const $=id=>document.getElementById(id), board=$('weeklyBoard'), panel=$('lobbyCornerPanel');
  const weekly=window.HammerschachWeeklyPuzzles;
  let identity='',identityVersion=0,allowed=false,active=false,accessPending=null;
  let database=null,loading=null,series=[],weekKey='',puzzle=null,game=null,selected=null,last=null,step=1;
  let level=0,played=[];
  let player='w',busy=false,revealed=false,timer=null,run=0,news=null,newsPending=false,newsRetryAt=0;
  function status(text,kind=''){ $('weeklyStatus').textContent=text;$('weeklyStatus').dataset.kind=kind; }
  function newsStatus(text=''){const el=$('gamerTickerStatus');el.textContent=text;el.hidden=!text;}
  function stop(){run++;clearTimeout(timer);timer=null;busy=false;cancelActivePieceDrag(board);}
  function visible(){return active&&!document.hidden&&!$('memberLobby').hidden;}
  function choose(view){
    const next=view==='corner'&&allowed;
    if(!next){stop();if(revealed&&step<puzzle?.moves.length){revealed=false;restart();}else if(game&&step<puzzle?.moves.length&&game.turn!==player){advance();status(step>=puzzle.moves.length?'Richtig gelöst!':(player==='w'?'Weiß':'Schwarz')+' am Zug.');}}
    active=next;panel.hidden=!next;$('lobbyChatPanel').hidden=next||view==='pending';
    const button=$('lobbyChatTab');button.classList.toggle('active',!$('lobbyChatPanel').hidden);button.setAttribute('aria-pressed',String(!$('lobbyChatPanel').hidden));
    window.HammerschachLobbyUnread?.markIfVisible();
    if(next){if(game)render();loadPuzzles();loadNews();}
    if(typeof hammerschachScheduleHeightReport==='function')hammerschachScheduleHeightReport(true);
  }
  async function updateIdentity(){
    const next=onlineAuthToken&&onlineAuthUser?String(onlineAuthUser.id)+'|'+onlineAuthToken:'';
    if(next===identity)return accessPending;
    identity=next;const version=++identityVersion;allowed=false;choose('pending');news=null;newsRetryAt=0;
    $('gamerTickerList').replaceChildren();newsStatus();
    if(!identity)return;
    accessPending=(async()=>{
      try{
        const result=await authApi('/api/schachecke/access');
        if(version!==identityVersion)return;
        allowed=result.allowed===true;
        choose(allowed?'corner':'chat');
      }catch(_){if(version===identityVersion)choose('chat');}
      finally{if(version===identityVersion)accessPending=null;}
    })();return accessPending;
  }
  async function toggleChat(){
    if(active){choose('chat');return;}
    if(accessPending)await accessPending;
    if(!allowed){
      const version=identityVersion;
      try{const data=await authApi('/api/schachecke/access');if(version===identityVersion)allowed=data.allowed===true;}catch(_){}
    }
    choose(allowed?'corner':'chat');
  }
  async function loadPuzzles(){
    if(!allowed)return;
    const version=identityVersion;
    try{
      if(!database){
        if(!loading)loading=fetch('Trainer/puzzles.json').then(r=>{if(!r.ok)throw Error('Aufgaben konnten nicht geladen werden.');return r.json();}).then(data=>{if(!Array.isArray(data))throw Error('Aufgabendatei ist ungültig.');database=data;}).finally(()=>{loading=null;});
        status('Aufgaben werden geladen…');await loading;
      }
      if(version!==identityVersion||!allowed||!active)return;
      const current=weekly.week();
      if(weekKey!==current){series=weekly.select(database,current);weekKey=current;restart();}
      else if(!game)restart();
    }catch(error){status(error.message+' Mit „Wiederholen“ erneut versuchen.','error');}
  }
  function restart(){
    stop();selected=null;revealed=false;step=1;played=[];$('weeklyLine').hidden=true;$('weeklyLine').textContent='';
    puzzle=series[Number($('weeklyDay').value)*4+level];
    if(!puzzle){loadPuzzles();return;}
    try{const prepared=weekly.prepare(puzzle);game=prepared.game;last=prepared.last;player=game.turn;status((player==='w'?'Weiß':'Schwarz')+' am Zug.');render();}
    catch(error){game=null;board.replaceChildren();status(error.message,'error');}
  }
  function highlight(){
    const legal=selected&&game?game.legalMoves().filter(m=>m.from[0]===selected[0]&&m.from[1]===selected[1]):[];
    for(const sq of board.children){const x=Number(sq.dataset.x),y=Number(sq.dataset.y);sq.classList.toggle('selected',!!selected&&selected[0]===x&&selected[1]===y);sq.classList.toggle('legal',legal.some(m=>m.to[0]===x&&m.to[1]===y));}
  }
  function render(){
    cancelActivePieceDrag(board);board.replaceChildren();if(!game)return;
    const names={p:'Bauer',n:'Springer',b:'Läufer',r:'Turm',q:'Dame',k:'König'};
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){
      const x=player==='w'?col:7-col,y=player==='w'?row:7-row,p=game.at(x,y);
      const sq=document.createElement('div');sq.className='square '+((x+y)%2?'dark':'light');sq.dataset.x=x;sq.dataset.y=y;sq.tabIndex=0;sq.setAttribute('role','button');
      sq.setAttribute('aria-label',coordToAlg(x,y)+(p!=='.'?' · '+(pieceColor(p)==='w'?'Weiß: ':'Schwarz: ')+names[p.toLowerCase()]:''));
      if(last&&[last.from,last.to].some(c=>c[0]===x&&c[1]===y))sq.classList.add('last-move');
      if(p!=='.'){const img=document.createElement('img');img.className='piece-img';img.src=pieceImg[p];img.alt='';sq.appendChild(img);}
      if(row===7){const label=document.createElement('span');label.className='coord-file';label.textContent=files[x];sq.appendChild(label);}
      if(col===0){const label=document.createElement('span');label.className='coord-rank';label.textContent=8-y;sq.appendChild(label);}
      sq.addEventListener('click',()=>click(x,y));sq.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();click(x,y,true);}});board.appendChild(sq);
    }
    highlight();
  }
  function canDrag(x,y){return !!(active&&allowed&&game&&!busy&&!revealed&&step<puzzle.moves.length&&game.turn===player&&game.at(x,y)!=='.'&&pieceColor(game.at(x,y))===player);}
  function selectDrag(from){selected=from.slice();highlight();playUiSound('pickup');}
  async function click(x,y,fromDrag=false){
    if(!boardPinchZoom.canClick(fromDrag)||!active||!allowed||!game||busy||revealed||step>=puzzle.moves.length||game.turn!==player)return;
    if(selected&&selected[0]===x&&selected[1]===y){selected=null;highlight();return;}
    if(!selected){if(canDrag(x,y)){selected=[x,y];highlight();}return;}
    const found=game.legalMoves().find(m=>m.from[0]===selected[0]&&m.from[1]===selected[1]&&m.to[0]===x&&m.to[1]===y);
    if(!found&&canDrag(x,y)){selected=[x,y];highlight();return;}
    if(!found){selected=null;highlight();status('Dieser Zug ist nicht möglich. Versuche es noch einmal.','error');return;}
    let promotion=null;const version=run;
    if(game.at(...found.from).toLowerCase()==='p'&&(y===0||y===7)){
      busy=true;promotion=await showPromotionOverlay(game.turn,{forceChoice:true});
      if(version!==run)return;busy=false;if(!promotion)return;
    }
    const uci=coordToAlg(...found.from)+coordToAlg(...found.to)+(promotion||'').toLowerCase();
    if(uci!==puzzle.moves[step]){
      const alternative=game.clone();alternative.makeMove({...found,promotion},true);
      if(alternative.gameOver()?.type==='checkmate'){apply({...found,promotion});step=puzzle.moves.length;status('Richtig – Schachmatt!','success');render();return;}
      selected=null;highlight();status('Das ist noch nicht die Lösung. Versuche es noch einmal.','error');return;
    }
    apply({...found,promotion});step++;render();
    if(step>=puzzle.moves.length){status('Richtig gelöst!','success');return;}
    status('Richtig. Der Gegenzug folgt…','success');busy=true;
    timer=setTimeout(()=>{if(version!==run)return;advance();busy=false;render();status(step>=puzzle.moves.length?'Richtig gelöst!':(player==='w'?'Weiß':'Schwarz')+' am Zug.',step>=puzzle.moves.length?'success':'');},450);
  }
  function apply(move){
    const before=game.clone(),number=game.fullmove,turn=game.turn;
    const applied=game.makeMove(move,true);
    const san=moveToSan(before,{...move,taken:applied.taken},game);
    played.push((turn==='w'?number+'. ':played.length===0?number+'... ':'')+san);
    $('weeklyLine').textContent=played.join(' ');$('weeklyLine').hidden=false;
    last=move;selected=null;
    playMoveSound({capture:applied.taken!=='.',promotion:!!move.promotion,castle:!!move.meta?.castle,check:game.inCheck(game.turn)});
  }
  function advance(){if(game&&step<puzzle.moves.length){apply(weekly.uciMove(game,puzzle.moves[step]));step++;}}
  function hint(){if(!game||busy||revealed||step>=puzzle.moves.length)return;const uci=puzzle.moves[step];selected=[uci.charCodeAt(0)-97,8-Number(uci[1])];highlight();status('Tipp: Ziehe die Figur auf '+uci.slice(0,2)+'.');}
  function solution(){
    if(!game||busy)return;
    if(step>=puzzle.moves.length){restart();if(!game)return;}
    revealed=true;busy=true;const version=run;status('Lösung wird vorgespielt…');
    const next=()=>{if(version!==run||!active)return;advance();render();if(step<puzzle.moves.length)timer=setTimeout(next,700);else{busy=false;status('Lösung gezeigt. Mit „Wiederholen“ selbst probieren.');}};
    timer=setTimeout(next,500);
  }
  function newsRender(){
    const list=$('gamerTickerList');list.replaceChildren();
    if(!news?.items?.length){newsStatus('Zurzeit sind keine Nachrichten abrufbar.');return;}
    const format=value=>new Date(value).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    newsStatus(news.stale?'Einzelne Quellen sind vorübergehend nicht erreichbar. Letzter verfügbarer Stand.':'');
    for(const item of news.items.slice(0,9)){
      let url;try{url=new URL(item.url);if(!['https:','http:'].includes(url.protocol))continue;}catch(_){continue;}
      const li=document.createElement('li'),meta=document.createElement('div'),a=document.createElement('a');meta.className='corner-meta';
      meta.textContent=item.source+' · '+(item.dateOnly?new Date(item.publishedAt).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'}):format(item.publishedAt));
      a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title+' ↗';li.append(meta,a);list.appendChild(li);
    }
  }
  async function loadNews(){
    if(!allowed||!active||newsPending||Date.now()<newsRetryAt)return;
    if(news&&Date.now()<Number(news.nextCheckAt)){newsRender();return;}
    newsPending=true;const version=identityVersion;
    try{const data=await authApi('/api/schachecke/ticker');if(version!==identityVersion||!allowed)return;news=data;newsRetryAt=Date.now()+60000;newsRender();}
    catch(error){if(version!==identityVersion)return;newsRetryAt=Date.now()+60000;if(news){news.stale=true;newsRender();}else newsStatus(error.message);}
    finally{newsPending=false;}
  }
  $('lobbyChatTab').addEventListener('click',toggleChat);
  $('weeklyDay').addEventListener('change',restart);
  document.querySelectorAll('[data-weekly-level]').forEach(button=>button.addEventListener('click',()=>{
    const next=Number(button.dataset.weeklyLevel);if(next===level)return;level=next;
    document.querySelectorAll('[data-weekly-level]').forEach(item=>{const on=Number(item.dataset.weeklyLevel)===level;item.classList.toggle('active',on);item.setAttribute('aria-pressed',String(on));});
    restart();
  }));
  $('weeklyHint').addEventListener('click',hint);$('weeklySolution').addEventListener('click',solution);$('weeklyRepeat').addEventListener('click',restart);
  new MutationObserver(()=>{if(active&&game)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-piece-set']});
  window.addEventListener('hammerschach:preferences',()=>{if(active&&game)render();});
  const refresh=()=>{if(visible()){loadPuzzles();loadNews();}};
  document.addEventListener('visibilitychange',refresh);
  let lobbyWasHidden=$('memberLobby').hidden;
  new MutationObserver(()=>{
    const hidden=$('memberLobby').hidden;
    if(lobbyWasHidden&&!hidden)choose(accessPending?'pending':allowed?'corner':'chat');
    lobbyWasHidden=hidden;
    window.HammerschachLobbyUnread?.markIfVisible();
    refresh();
  }).observe($('memberLobby'),{attributes:true,attributeFilter:['hidden']});
  setInterval(refresh,60000);
  // Authentication may already have completed while the later scripts loaded.
  queueMicrotask(updateIdentity);
  return {updateIdentity,canDrag,selectDrag,drop:(from,to)=>{selected=from.slice();click(...to,true);}};
})();
