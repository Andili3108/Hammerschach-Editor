'use strict';

let gameArchiveScope = 'mine';
let gameArchivePage = 1;
let gameArchiveTotal = 0;
let gameArchiveGames = [];
let gameArchiveFilterTimer = null;
const gameArchiveMomentsFilter = document.getElementById('gameArchiveMomentsFilter');

function archiveDateLabel(value){
  const date = new Date(value || '');
  if(!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(date);
}
function archiveEndReasonLabel(reason){
  const labels={checkmate:'Matt',resignation:'Aufgabe',timeout:'Zeitüberschreitung',time:'Zeitüberschreitung',draw_agreed:'Remisvereinbarung',draw_agreement:'Remisvereinbarung',stalemate:'Patt',insufficient_material:'Unzureichendes Material',threefold_repetition:'Dreifache Stellungswiederholung',fivefold_repetition:'Fünffache Stellungswiederholung',fifty_move_rule:'50-Züge-Regel',seventy_five_move_rule:'75-Züge-Regel',time_insufficient_material:'Zeitüberschreitung · Matt unmöglich',resignation_insufficient_material:'Aufgabe · Matt unmöglich'};
  return labels[String(reason||'')] || String(reason||'').replace(/_/g,' ');
}
function archiveVariantLabel(game){
  return game&&game.variant===GAME_VARIANT_FREESTYLE?(game.positionId?'Freestyle #'+game.positionId:'Freestyle'):'Klassisch';
}
function archiveQuery(page){
  const params=new URLSearchParams({scope:gameArchiveScope,page:String(page||1),limit:'24'});
  const filters=[['member',gameArchiveMemberFilter],['mode',gameArchiveModeFilter],['variant',gameArchiveVariantFilter],['speed',gameArchiveSpeedFilter],['tournament',gameArchiveTournamentFilter],['result',gameArchiveResultFilter],['from',gameArchiveFromFilter],['to',gameArchiveToFilter]];
  filters.forEach(([key,element])=>{const value=element?String(element.value||'').trim():'';if(value)params.set(key,value);});
  if(gameArchiveScope==='mine'&&gameArchiveMomentsFilter&&gameArchiveMomentsFilter.value==='1')params.set('moments','1');
  return '/api/game-archive?'+params.toString();
}
async function fetchArchivePgn(game){
  const roomId=cleanRoomId(game&&game.roomId);
  if(!onlineAuthToken||!roomId)throw new Error('Bitte zuerst einloggen.');
  const response=await fetch(onlineApiBaseUrl()+'/api/game-archive/'+encodeURIComponent(roomId)+'/pgn',{headers:{authorization:'Bearer '+onlineAuthToken}});
  if(!response.ok){let detail=null;try{detail=await response.json();}catch(_){detail=null;}throw new Error(detail&&detail.message?detail.message:'PGN konnte nicht geladen werden.');}
  return {pgn:await response.text(),disposition:response.headers.get('content-disposition')||''};
}
async function downloadArchivePgn(game,button){
  const old=button&&button.textContent;if(button){button.disabled=true;button.textContent='Lade …';}
  try{
    const loaded=await fetchArchivePgn(game);
    const blob=new Blob([loaded.pgn],{type:'application/x-chess-pgn;charset=utf-8'});
    const match=loaded.disposition.match(/filename="?([^";]+)"?/i);
    const filename=match&&match[1]?match[1]:'Hammerschach-Partie.pgn';
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }catch(err){if(gameArchiveStatusEl)gameArchiveStatusEl.textContent=err&&err.message?err.message:'PGN konnte nicht geladen werden.';}
  finally{if(button){button.disabled=false;button.textContent=old||'PGN herunterladen';}}
}
async function openArchiveInAnalyzer(game,button){
  const old=button&&button.textContent;if(button){button.disabled=true;button.textContent='Öffne …';}
  try{
    const loaded=await fetchArchivePgn(game);
    pendingAnalyzerArchivePgn=loaded.pgn;
    closeGameArchiveDialog();
    setAnalyzerToolActive(true);
    if(analyzerToolReady){postAnalyzerToolMessage({type:'hammerschach-analyzer-import-game',pgn:pendingAnalyzerArchivePgn});pendingAnalyzerArchivePgn='';}
  }catch(err){if(gameArchiveStatusEl)gameArchiveStatusEl.textContent=err&&err.message?err.message:'Analyzer konnte nicht geöffnet werden.';}
  finally{if(button){button.disabled=false;button.textContent=old||'Im Analyzer öffnen';}}
}
function viewArchiveGame(game,button){
  const roomId=game&&game.isParticipant?cleanRoomId(game.roomId):'';
  const watchId=cleanPublicWatchId(game&&game.watchId);
  const target=roomId?dailyGameRoomUrl({roomId}):(watchId?getSpectatorUrl(watchId):'');
  if(target){window.open(target,'_blank','noopener,noreferrer');return;}
  openArchiveInAnalyzer(game,button);
}
function refreshArchiveAfterMomentChange(){
  if(gameArchiveScope==='mine'&&gameArchiveMomentsFilter&&gameArchiveMomentsFilter.value==='1')loadGameArchive();
  else renderGameArchive();
}
function createArchiveGameCard(game){
  const card=document.createElement('div');card.className='game-archive-card'+(game.favorite?' favorite':'');
  const content=document.createElement('div');
  const title=document.createElement('div');title.className='game-archive-title';title.textContent=(cleanDisplayName(game.whiteName)||'Weiß')+' – '+(cleanDisplayName(game.blackName)||'Schwarz');
  const result=document.createElement('span');result.className='game-archive-result';result.textContent=game.result||'*';title.appendChild(result);content.appendChild(title);
  const meta=document.createElement('div');meta.className='game-archive-meta';meta.textContent=[archiveDateLabel(game.endedAt),game.mode==='daily'?'Daily':'Live',game.timeLabel||'',archiveVariantLabel(game),archiveEndReasonLabel(game.endReason)].filter(Boolean).join(' · ');content.appendChild(meta);
  const badges=document.createElement('div');badges.className='game-archive-badges';
  if(game.tournamentId){const badge=document.createElement('span');badge.className='game-archive-badge';badge.textContent='🏆 '+(game.tournamentName||game.tournamentRoundLabel||'Turnierpartie');badges.appendChild(badge);}
  if(game.publicGame){const badge=document.createElement('span');badge.className='game-archive-badge';badge.textContent='🌍 öffentlich';badges.appendChild(badge);}
  if(game.favorite){const badge=document.createElement('span');badge.className='game-archive-badge moment';badge.textContent='❤️ Gamer-Moment';badges.appendChild(badge);}
  if(badges.childNodes.length)content.appendChild(badges);
  if(gameArchiveScope==='mine'&&game.isParticipant){
    const opponentName=game.participantRole==='w'?game.blackName:game.whiteName;
    const momentPanel=createGameMomentPanel(game,{statusElement:gameArchiveStatusEl,onChange:refreshArchiveAfterMomentChange});
    if(momentPanel)content.appendChild(momentPanel);
    const reactionPanel=createGameReactionPanel(game,{opponentName,statusElement:gameArchiveStatusEl,onChange:renderGameArchive});
    if(reactionPanel)content.appendChild(reactionPanel);
  }
  const actions=document.createElement('div');actions.className='game-archive-card-actions';
  const view=document.createElement('button');view.type='button';view.className='button-flat';view.textContent='Partie ansehen';view.addEventListener('click',()=>viewArchiveGame(game,view));actions.appendChild(view);
  const analyzer=document.createElement('button');analyzer.type='button';analyzer.className='button-flat';analyzer.textContent='Im Analyzer öffnen';analyzer.addEventListener('click',()=>openArchiveInAnalyzer(game,analyzer));actions.appendChild(analyzer);
  const pgn=document.createElement('button');pgn.type='button';pgn.className='button-flat';pgn.textContent='PGN herunterladen';pgn.addEventListener('click',()=>downloadArchivePgn(game,pgn));actions.appendChild(pgn);
  card.appendChild(content);card.appendChild(actions);return card;
}
function renderGameArchive(){
  if(!gameArchiveListEl)return;gameArchiveListEl.innerHTML='';
  if(!gameArchiveGames.length){const empty=document.createElement('div');empty.className='game-archive-empty';empty.textContent=gameArchiveScope==='mine'&&gameArchiveMomentsFilter&&gameArchiveMomentsFilter.value==='1'?'Noch keine Gamer-Momente in dieser Auswahl.':(gameArchiveScope==='mine'?'Noch keine eigene beendete Partie im Archiv.':'Keine passende öffentliche Partie gefunden.');gameArchiveListEl.appendChild(empty);}
  else gameArchiveGames.forEach(game=>gameArchiveListEl.appendChild(createArchiveGameCard(game)));
  if(gameArchiveMoreBtn)gameArchiveMoreBtn.hidden=gameArchiveGames.length>=gameArchiveTotal;
}
async function loadGameArchive(options){
  options=options||{};const append=!!options.append;const page=append?gameArchivePage+1:1;
  if(gameArchiveStatusEl)gameArchiveStatusEl.textContent='Archiv wird geladen …';
  if(gameArchiveRefreshBtn)gameArchiveRefreshBtn.disabled=true;if(gameArchiveMoreBtn)gameArchiveMoreBtn.disabled=true;
  try{
    const data=await authApi(archiveQuery(page));const games=Array.isArray(data.games)?data.games:[];
    gameArchivePage=page;gameArchiveTotal=Math.max(0,Number(data.total||0));gameArchiveGames=append?gameArchiveGames.concat(games):games;renderGameArchive();
    if(gameArchiveStatusEl)gameArchiveStatusEl.textContent=gameArchiveTotal===1?'1 Partie im Archiv.':gameArchiveTotal+' Partien im Archiv.';
  }catch(err){if(!append){gameArchiveGames=[];gameArchiveTotal=0;renderGameArchive();}if(gameArchiveStatusEl)gameArchiveStatusEl.textContent=err&&err.message?err.message:'Partienarchiv konnte nicht geladen werden.';}
  finally{if(gameArchiveRefreshBtn)gameArchiveRefreshBtn.disabled=false;if(gameArchiveMoreBtn)gameArchiveMoreBtn.disabled=false;}
}
function setGameArchiveScope(scope){
  gameArchiveScope=scope==='public'?'public':'mine';
  [gameArchiveMineTab,gameArchivePublicTab].forEach((tab,index)=>{if(!tab)return;const active=(index===0)===(gameArchiveScope==='mine');tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false');});
  if(gameArchiveMomentsFilter)gameArchiveMomentsFilter.disabled=gameArchiveScope!=='mine';
  loadGameArchive();
}
function scheduleGameArchiveFilter(){if(gameArchiveFilterTimer)clearTimeout(gameArchiveFilterTimer);gameArchiveFilterTimer=setTimeout(()=>loadGameArchive(),300);}
function openGameArchiveDialog(){
  if(!onlineAuthToken||!onlineAuthUser){if(gameArchiveStatusEl)gameArchiveStatusEl.textContent='Bitte zuerst einloggen.';if(authBackdrop)authBackdrop.hidden=false;return;}
  if(gameArchiveBackdrop)gameArchiveBackdrop.hidden=false;setGameArchiveScope(gameArchiveScope);
}
function closeGameArchiveDialog(){if(gameArchiveBackdrop)gameArchiveBackdrop.hidden=true;}
if(gameArchiveOpenBtn)gameArchiveOpenBtn.addEventListener('click',openGameArchiveDialog);
if(gameArchiveMineTab)gameArchiveMineTab.addEventListener('click',()=>setGameArchiveScope('mine'));
if(gameArchivePublicTab)gameArchivePublicTab.addEventListener('click',()=>setGameArchiveScope('public'));
[gameArchiveMemberFilter,gameArchiveModeFilter,gameArchiveVariantFilter,gameArchiveSpeedFilter,gameArchiveTournamentFilter,gameArchiveResultFilter,gameArchiveMomentsFilter,gameArchiveFromFilter,gameArchiveToFilter].forEach(element=>{if(!element)return;element.addEventListener(element.type==='search'?'input':'change',scheduleGameArchiveFilter);});
if(gameArchiveMoreBtn)gameArchiveMoreBtn.addEventListener('click',()=>loadGameArchive({append:true}));
if(gameArchiveRefreshBtn)gameArchiveRefreshBtn.addEventListener('click',()=>loadGameArchive());
if(gameArchiveCloseBtn)gameArchiveCloseBtn.addEventListener('click',closeGameArchiveDialog);
if(gameArchiveBackdrop)gameArchiveBackdrop.addEventListener('click',event=>{if(event.target===gameArchiveBackdrop)closeGameArchiveDialog();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gameArchiveBackdrop&&!gameArchiveBackdrop.hidden)closeGameArchiveDialog();});
