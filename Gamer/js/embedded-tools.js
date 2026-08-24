'use strict';

let learningToolActive = false;
let analyzerToolActive = false;
let trainerToolActive = false;
let schachlaborToolActive = false;
let openingsToolActive = false;
let fairplayToolActive = false;
let tvToolActive = false;
let learningToolFrameStarted = false;
let analyzerToolFrameStarted = false;
let trainerToolFrameStarted = false;
let schachlaborToolFrameStarted = false;
let openingsToolFrameStarted = false;
let fairplayToolFrameStarted = false;
let learningToolLastOpenAt = 0;
let analyzerToolLastOpenAt = 0;
let trainerToolLastOpenAt = 0;
let schachlaborToolLastOpenAt = 0;
let openingsToolLastOpenAt = 0;
let fairplayToolLastOpenAt = 0;
let tvToolLastOpenAt = 0;
let analyzerToolReady = false;
let pendingAnalyzerOpeningPgn = '';
let pendingAnalyzerArchivePgn = '';
const EMBEDDED_TOOL_OPEN_DEBOUNCE_MS = 450;
const PENDING_EMBEDDED_TOOL_STORAGE_KEY = 'hammerschachPendingEmbeddedToolV1';
const ACTIVE_EMBEDDED_TOOL_STORAGE_KEY = 'hammerschachActiveEmbeddedToolV1';
const NAVIGABLE_EMBEDDED_TOOLS = new Set(['learning','analyzer','trainer','schachlabor','openings','tv']);
const RESTORABLE_EMBEDDED_TOOLS = new Set([...NAVIGABLE_EMBEDDED_TOOLS,'fairplay']);
function embeddedToolsAvailable(){
  return !!(onlineAuthToken && onlineAuthUser && !onlineRoomId && !hasOnlineTargetInAddress());
}
function embeddedToolsNavigable(){
  return !!(onlineAuthToken && onlineAuthUser && !onlineSpectatorOnly);
}
function learningToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function learningToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function memberEmbeddedToolActive(){
  return analyzerToolActive || trainerToolActive || schachlaborToolActive || openingsToolActive || fairplayToolActive || tvToolActive;
}
function embeddedToolActive(){
  return learningToolActive || memberEmbeddedToolActive();
}
function embeddedToolStatusText(){
  if(learningToolActive) return 'Hammerschach - Schach lernen';
  if(tvToolActive) return 'Hammerschach - TV';
  if(fairplayToolActive) return 'Hammerschach - Fairplay-Prüfung';
  if(openingsToolActive) return 'Hammerschach - Eröffnungsschule';
  if(schachlaborToolActive) return 'Hammerschach - Schachlabor';
  if(trainerToolActive) return 'Hammerschach - Trainer';
  if(analyzerToolActive) return 'Hammerschach - Analyzer';
  return '';
}
function updateAnalyzerToolAvailability(){
  const available = embeddedToolsAvailable();
  const navigable = embeddedToolsNavigable();
  const learningAvailable = learningToolAvailable();
  const learningNavigable = learningToolNavigable();
  const fairplayAvailable = available && !!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  document.documentElement.classList.toggle('hammerschach-room-view', !available);
  if((!available && memberEmbeddedToolActive()) || (!learningAvailable && learningToolActive)) setEmbeddedToolActive('');
  if(!fairplayAvailable && fairplayToolActive) setEmbeddedToolActive('');
  const titleFor = name => available ? `${name} öffnen` : `Spielraum verlassen und ${name} öffnen`;
  if(learningToolBtn){learningToolBtn.hidden=!learningNavigable;learningToolBtn.title=learningAvailable?'Hammerschach-Grundkurs öffnen':'Spielraum verlassen und den Hammerschach-Grundkurs öffnen';}
  if(analyzerToolBtn){analyzerToolBtn.hidden=!navigable;analyzerToolBtn.title=titleFor('Hammerschach-Analyzer');}
  if(trainerToolBtn){trainerToolBtn.hidden=!navigable;trainerToolBtn.title=titleFor('Hammerschach-Trainer');}
  if(schachlaborToolBtn){schachlaborToolBtn.hidden=!navigable;schachlaborToolBtn.title=titleFor('Hammerschach-Schachlabor');}
  if(openingsToolBtn){openingsToolBtn.hidden=!navigable;openingsToolBtn.title=titleFor('Hammerschach-Eröffnungsschule');}
  if(tvToolBtn){tvToolBtn.hidden=!navigable;tvToolBtn.title=titleFor('Hammerschach TV');}
  if(toolsMenuEl){
    toolsMenuEl.hidden = !navigable && !learningNavigable;
    if(toolsMenuEl.hidden) closeToolsMenu();
  }
  if(available || learningAvailable){
    let pending='';
    let remembered='';
    try{
      pending=String(sessionStorage.getItem(PENDING_EMBEDDED_TOOL_STORAGE_KEY)||'');
      remembered=String(sessionStorage.getItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY)||'');
      sessionStorage.removeItem(PENDING_EMBEDDED_TOOL_STORAGE_KEY);
    }catch(_){}
    const canRestore=tool=>tool==='learning'?learningAvailable:(available&&RESTORABLE_EMBEDDED_TOOLS.has(tool));
    const restorePending=NAVIGABLE_EMBEDDED_TOOLS.has(pending)&&canRestore(pending)?pending:'';
    const restoreRemembered=!embeddedToolActive()&&RESTORABLE_EMBEDDED_TOOLS.has(remembered)&&
      canRestore(remembered)&&(remembered!=='fairplay'||fairplayAvailable)?remembered:'';
    const restoreTool=restorePending||restoreRemembered;
    if(restoreTool){
      setTimeout(()=>setEmbeddedToolActive(restoreTool),0);
    }
  }
}
function embeddedToolTargetOrigin(){
  return window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
}
function postLearningToolMessage(message){
  if(!learningToolFrameStarted || !learningToolFrame || !learningToolFrame.contentWindow) return;
  try{ learningToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postAnalyzerToolMessage(message){
  if(!analyzerToolFrameStarted || !analyzerToolFrame || !analyzerToolFrame.contentWindow) return;
  try{ analyzerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postTrainerToolMessage(message){
  if(!trainerToolFrameStarted || !trainerToolFrame || !trainerToolFrame.contentWindow) return;
  try{ trainerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postSchachlaborToolMessage(message){
  if(!schachlaborToolFrameStarted || !schachlaborToolFrame || !schachlaborToolFrame.contentWindow) return;
  try{ schachlaborToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postOpeningsToolMessage(message){
  if(!openingsToolFrameStarted || !openingsToolFrame || !openingsToolFrame.contentWindow) return;
  try{ openingsToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postFairplayToolMessage(message){
  if(!fairplayToolFrameStarted || !fairplayToolFrame || !fairplayToolFrame.contentWindow) return;
  try{ fairplayToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postLearningToolContext(){
  postLearningToolMessage({
    type:'hammerschach-learning-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : ''
  });
}
function postAnalyzerToolContext(){
  postAnalyzerToolMessage({
    type:'hammerschach-analyzer-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : ''
  });
}
function postTrainerToolContext(){
  postTrainerToolMessage({
    type:'hammerschach-trainer-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    userId:onlineAuthUser ? String(onlineAuthUser.id || '') : '',
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : ''
  });
}
function postSchachlaborToolContext(){
  let boardColor='basis';
  let pieceSet='cburnett';
  try{
    boardColor=localStorage.getItem('hammerschachBoardColor')||'basis';
    pieceSet=localStorage.getItem('hammerschachPieceSet')||'cburnett';
  }catch(_){}
  postSchachlaborToolMessage({
    type:'hammerschach-schachlabor-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    userId:onlineAuthUser ? String(onlineAuthUser.id || '') : '',
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : '',
    boardColor,
    pieceSet
  });
}
function postOpeningsToolContext(){
  postOpeningsToolMessage({
    type:'hammerschach-openings-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : '',
    openingCatalog:Array.isArray(TOURNAMENT_THEME_CATALOG) ? TOURNAMENT_THEME_CATALOG : []
  });
}
function postFairplayToolContext(){
  postFairplayToolMessage({
    type:'hammerschach-fairplay-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    isAdmin:!!(onlineAuthUser && onlineAuthUser.isAdmin === true),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : ''
  });
}
function setEmbeddedToolActive(toolName){
  const fairplayAllowed=!!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  let requested='';
  if(toolName==='learning'&&learningToolAvailable())requested='learning';
  else if(embeddedToolsAvailable()){
    if(toolName==='tv')requested='tv';
    else if(toolName==='fairplay'&&fairplayAllowed)requested='fairplay';
    else if(toolName==='openings')requested='openings';
    else if(toolName==='schachlabor')requested='schachlabor';
    else if(toolName==='trainer')requested='trainer';
    else if(toolName==='analyzer')requested='analyzer';
  }
  try{
    if(requested)sessionStorage.setItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY,requested);
    else sessionStorage.removeItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY);
  }catch(_){}
  learningToolActive=requested==='learning';
  analyzerToolActive=requested==='analyzer';
  trainerToolActive=requested==='trainer';
  schachlaborToolActive=requested==='schachlabor';
  openingsToolActive=requested==='openings';
  fairplayToolActive=requested==='fairplay';
  const tvWasActive=tvToolActive;
  tvToolActive=requested==='tv';
  document.documentElement.classList.toggle('learning-tool-active',learningToolActive);
  document.documentElement.classList.toggle('analyzer-tool-active',analyzerToolActive);
  document.documentElement.classList.toggle('trainer-tool-active',trainerToolActive);
  document.documentElement.classList.toggle('schachlabor-tool-active',schachlaborToolActive);
  document.documentElement.classList.toggle('openings-tool-active',openingsToolActive);
  document.documentElement.classList.toggle('fairplay-tool-active',fairplayToolActive);
  document.documentElement.classList.toggle('tv-tool-active',tvToolActive);
  if(learningToolView)learningToolView.hidden=!learningToolActive;
  if(analyzerToolView)analyzerToolView.hidden=!analyzerToolActive;
  if(trainerToolView)trainerToolView.hidden=!trainerToolActive;
  if(schachlaborToolView)schachlaborToolView.hidden=!schachlaborToolActive;
  if(openingsToolView)openingsToolView.hidden=!openingsToolActive;
  if(fairplayToolView)fairplayToolView.hidden=!fairplayToolActive;
  if(tvToolView)tvToolView.hidden=!tvToolActive;
  if(embeddedToolActive()){
    closeNewGameMenu();
    closeGamesMenu();
    closeToolsMenu();
  }
  updateSiteFootnotePlacement();
  if(learningToolActive&&learningToolFrame&&!learningToolFrameStarted){
    learningToolFrameStarted=true;
    learningToolFrame.src=learningToolFrame.dataset.src||'./Schachlernen/';
  }
  if(analyzerToolActive&&analyzerToolFrame&&!analyzerToolFrameStarted){
    analyzerToolFrameStarted=true;
    analyzerToolFrame.src=analyzerToolFrame.dataset.src||'./Analyzer/';
  }
  if(trainerToolActive&&trainerToolFrame&&!trainerToolFrameStarted){
    trainerToolFrameStarted=true;
    trainerToolFrame.src=trainerToolFrame.dataset.src||'./Trainer/';
  }
  if(schachlaborToolActive&&schachlaborToolFrame&&!schachlaborToolFrameStarted){
    schachlaborToolFrameStarted=true;
    schachlaborToolFrame.src=schachlaborToolFrame.dataset.src||'./schachlabor/';
  }
  if(openingsToolActive&&openingsToolFrame&&!openingsToolFrameStarted){
    openingsToolFrameStarted=true;
    openingsToolFrame.src=openingsToolFrame.dataset.src||'./Openings/';
  }
  if(fairplayToolActive&&fairplayToolFrame&&!fairplayToolFrameStarted){
    fairplayToolFrameStarted=true;
    fairplayToolFrame.src=fairplayToolFrame.dataset.src||'./Fairplay/';
  }
  if(tvToolActive){
    loadHammerschachTv();
    startHammerschachTvPolling();
  }else if(tvWasActive){
    stopHammerschachTvPlayback();
  }
  postLearningToolMessage({type:'hammerschach-learning-visibility',visible:learningToolActive});
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
  postSchachlaborToolMessage({type:'hammerschach-schachlabor-visibility',visible:schachlaborToolActive});
  postOpeningsToolMessage({type:'hammerschach-openings-visibility',visible:openingsToolActive});
  postFairplayToolMessage({type:'hammerschach-fairplay-visibility',visible:fairplayToolActive});
  if(learningToolActive)postLearningToolContext();
  if(analyzerToolActive)postAnalyzerToolContext();
  if(trainerToolActive)postTrainerToolContext();
  if(schachlaborToolActive)postSchachlaborToolContext();
  if(openingsToolActive)postOpeningsToolContext();
  if(fairplayToolActive)postFairplayToolContext();
  if(statusEl){
    const toolStatus=embeddedToolStatusText();
    if(toolStatus)statusEl.textContent=toolStatus;else refreshHeaderStatusFromState();
  }
  updateOnlineActionButtons();
  if(embeddedToolActive()&&roomLobbyBtn){
    try{roomLobbyBtn.focus({preventScroll:true});}catch(_){roomLobbyBtn.focus();}
  }
  hammerschachScheduleHeightReport(true);
}
function setLearningToolActive(active){setEmbeddedToolActive(active?'learning':'');}
function setAnalyzerToolActive(active){setEmbeddedToolActive(active?'analyzer':'');}
function setTrainerToolActive(active){setEmbeddedToolActive(active?'trainer':'');}
function setSchachlaborToolActive(active){setEmbeddedToolActive(active?'schachlabor':'');}
function setOpeningsToolActive(active){setEmbeddedToolActive(active?'openings':'');}
function setFairplayToolActive(active){setEmbeddedToolActive(active?'fairplay':'');}
function setTvToolActive(active){setEmbeddedToolActive(active?'tv':'');}
function closeEmbeddedTools(){setEmbeddedToolActive('');}
function openEmbeddedToolFromCurrentContext(toolName){
  const requested=NAVIGABLE_EMBEDDED_TOOLS.has(toolName)?toolName:'';
  const isLearning=requested==='learning';
  if(!requested||(isLearning?!learningToolNavigable():!embeddedToolsNavigable()))return;
  if((isLearning&&learningToolAvailable())||(!isLearning&&embeddedToolsAvailable())){
    setEmbeddedToolActive(requested);
    return;
  }
  try{sessionStorage.setItem(PENDING_EMBEDDED_TOOL_STORAGE_KEY,requested);}catch(_){}
  if(typeof openNewGameView==='function'){
    openNewGameView();
    return;
  }
  try{
    const target=new URL(window.location.href);
    ['room','role','player','watch'].forEach(key=>target.searchParams.delete(key));
    target.searchParams.set('fresh','1');
    window.location.assign(target.toString());
  }catch(_){
    window.location.assign((window.location.pathname||'/')+'?fresh=1');
  }
}
function openLearningToolDebounced(){
  const now=Date.now();
  if(now-learningToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  learningToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('learning');
}
function openAnalyzerToolDebounced(){
  const now=Date.now();
  if(now-analyzerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  analyzerToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('analyzer');
}
function openTrainerToolDebounced(){
  const now=Date.now();
  if(now-trainerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  trainerToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('trainer');
}
function openSchachlaborToolDebounced(){
  const now=Date.now();
  if(now-schachlaborToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  schachlaborToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('schachlabor');
}
function openOpeningsToolDebounced(){
  const now=Date.now();
  if(now-openingsToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  openingsToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('openings');
}
function openFairplayToolDebounced(){
  const now=Date.now();
  if(now-fairplayToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  fairplayToolLastOpenAt=now;
  setFairplayToolActive(true);
}
function openTvToolDebounced(){
  const now=Date.now();
  if(now-tvToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  tvToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('tv');
}
if(learningToolBtn)learningToolBtn.addEventListener('click',openLearningToolDebounced);
if(analyzerToolBtn)analyzerToolBtn.addEventListener('click',openAnalyzerToolDebounced);
if(trainerToolBtn)trainerToolBtn.addEventListener('click',openTrainerToolDebounced);
if(schachlaborToolBtn)schachlaborToolBtn.addEventListener('click',openSchachlaborToolDebounced);
if(openingsToolBtn)openingsToolBtn.addEventListener('click',openOpeningsToolDebounced);
if(tvToolBtn)tvToolBtn.addEventListener('click',openTvToolDebounced);
if(learningToolFrame)learningToolFrame.addEventListener('load',()=>{
  postLearningToolContext();
  postLearningToolMessage({type:'hammerschach-learning-visibility',visible:learningToolActive});
});
if(analyzerToolFrame)analyzerToolFrame.addEventListener('load',()=>{
  postAnalyzerToolContext();
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
});
if(trainerToolFrame)trainerToolFrame.addEventListener('load',()=>{
  postTrainerToolContext();
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
});
if(schachlaborToolFrame)schachlaborToolFrame.addEventListener('load',()=>{
  postSchachlaborToolContext();
  postSchachlaborToolMessage({type:'hammerschach-schachlabor-visibility',visible:schachlaborToolActive});
});
if(openingsToolFrame)openingsToolFrame.addEventListener('load',()=>{
  postOpeningsToolContext();
  postOpeningsToolMessage({type:'hammerschach-openings-visibility',visible:openingsToolActive});
});
if(fairplayToolFrame)fairplayToolFrame.addEventListener('load',()=>{
  postFairplayToolContext();
  postFairplayToolMessage({type:'hammerschach-fairplay-visibility',visible:fairplayToolActive});
});
[newGameBtn,createOnlineBtn,newGameMenuBtn,gamesMenuBtn,membersOpenBtn,profileOpenBtn].forEach(button=>{
  if(button)button.addEventListener('click',closeEmbeddedTools,{capture:true});
});
window.addEventListener('message',async event=>{
  const fromLearning=!!(learningToolFrame&&event.source===learningToolFrame.contentWindow);
  const fromAnalyzer=!!(analyzerToolFrame&&event.source===analyzerToolFrame.contentWindow);
  const fromTrainer=!!(trainerToolFrame&&event.source===trainerToolFrame.contentWindow);
  const fromSchachlabor=!!(schachlaborToolFrame&&event.source===schachlaborToolFrame.contentWindow);
  const fromOpenings=!!(openingsToolFrame&&event.source===openingsToolFrame.contentWindow);
  const fromFairplay=!!(fairplayToolFrame&&event.source===fairplayToolFrame.contentWindow);
  if(!fromLearning&&!fromAnalyzer&&!fromTrainer&&!fromSchachlabor&&!fromOpenings&&!fromFairplay)return;
  if(embeddedToolTargetOrigin()!=='*'&&event.origin!==embeddedToolTargetOrigin())return;
  const message=event.data&&typeof event.data==='object'?event.data:{};
  if(fromLearning){
    if(message.type==='hammerschach-learning-ready'){
      postLearningToolContext();
      postLearningToolMessage({type:'hammerschach-learning-visibility',visible:learningToolActive});
      return;
    }
    if(message.type==='hammerschach-learning-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        learningToolFrame.style.height=Math.max(720,Math.min(5200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    return;
  }
  if(fromSchachlabor){
    if(message.type==='hammerschach-schachlabor-ready'){
      postSchachlaborToolContext();
      postSchachlaborToolMessage({type:'hammerschach-schachlabor-visibility',visible:schachlaborToolActive});
      return;
    }
    if(message.type==='hammerschach-schachlabor-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        schachlaborToolFrame.style.height=Math.max(720,Math.min(4600,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    if(message.type==='hammerschach-schachlabor-check-position'){
      const requestId=String(message.requestId||'');
      if(!onlineAuthToken||!onlineAuthUser){
        postSchachlaborToolMessage({type:'hammerschach-schachlabor-fairplay-result',requestId,ok:false,allowed:false,message:'Bitte zuerst im Gamer einloggen.'});
        return;
      }
      try{
        const data=await authApi('/api/schachlabor/fairplay-check',{
          method:'POST',
          body:JSON.stringify({
            fen:String(message.fen||'').trim().slice(0,200),
            variant:String(message.variant||'').slice(0,32),
            positionId:Number.isFinite(Number(message.positionId))?Number(message.positionId):null
          })
        });
        postSchachlaborToolMessage({
          type:'hammerschach-schachlabor-fairplay-result',requestId,ok:true,
          allowed:data&&data.allowed===true,
          message:data&&data.allowed===false?'Diese Stellung entspricht einer deiner laufenden Gamer-Partien. Die Engine-Analyse wird nach Partieende verfügbar.':''
        });
      }catch(err){
        postSchachlaborToolMessage({type:'hammerschach-schachlabor-fairplay-result',requestId,ok:false,allowed:false,message:err&&err.message?err.message:'Die Fairplay-Prüfung ist momentan nicht verfügbar.'});
      }
      return;
    }
    return;
  }
  if(fromFairplay){
    if(message.type==='hammerschach-fairplay-ready'){
      postFairplayToolContext();
      postFairplayToolMessage({type:'hammerschach-fairplay-visibility',visible:fairplayToolActive});
      return;
    }
    if(message.type==='hammerschach-fairplay-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        fairplayToolFrame.style.height=Math.max(720,Math.min(4200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    if(message.type==='hammerschach-fairplay-request-games'){
      const requestId=String(message.requestId||'');
      if(!onlineAuthToken||!onlineAuthUser||onlineAuthUser.isAdmin!==true){
        postFairplayToolMessage({type:'hammerschach-fairplay-games-result',requestId,ok:false,message:'Die Fairplay-Prüfung ist ausschließlich für den Administrator verfügbar.',games:[]});
        return;
      }
      try{
        const data=await authApi('/api/admin/fairplay/games');
        postFairplayToolMessage({type:'hammerschach-fairplay-games-result',requestId,ok:true,games:Array.isArray(data.games)?data.games:[]});
      }catch(err){
        postFairplayToolMessage({type:'hammerschach-fairplay-games-result',requestId,ok:false,message:err&&err.message?err.message:'Die Fairplay-Partien konnten nicht geladen werden.',games:[]});
      }
      return;
    }
    if(message.type==='hammerschach-fairplay-request-game'){
      const requestId=String(message.requestId||'');
      const roomId=cleanRoomId(message.roomId);
      if(!onlineAuthToken||!onlineAuthUser||onlineAuthUser.isAdmin!==true||!roomId){
        postFairplayToolMessage({type:'hammerschach-fairplay-game-result',requestId,ok:false,message:'Die Fairplay-Partie konnte nicht geladen werden.'});
        return;
      }
      try{
        const data=await authApi('/api/admin/fairplay/games/'+encodeURIComponent(roomId));
        postFairplayToolMessage({type:'hammerschach-fairplay-game-result',requestId,ok:true,game:data.game||null});
      }catch(err){
        postFairplayToolMessage({type:'hammerschach-fairplay-game-result',requestId,ok:false,message:err&&err.message?err.message:'Die Fairplay-Rohdaten konnten nicht geladen werden.'});
      }
      return;
    }
    return;
  }
  if(fromOpenings){
    if(message.type==='hammerschach-openings-ready'){
      postOpeningsToolContext();
      postOpeningsToolMessage({type:'hammerschach-openings-visibility',visible:openingsToolActive});
      return;
    }
    if(message.type==='hammerschach-openings-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        openingsToolFrame.style.height=Math.max(720,Math.min(3200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    if(message.type==='hammerschach-openings-open-analyzer'){
      const pgn=String(message.pgn||'').trim();
      if(!pgn)return;
      pendingAnalyzerOpeningPgn=pgn;
      setAnalyzerToolActive(true);
      if(analyzerToolReady){
        postAnalyzerToolMessage({type:'hammerschach-analyzer-import-opening',pgn:pendingAnalyzerOpeningPgn});
        pendingAnalyzerOpeningPgn='';
      }
      return;
    }
    return;
  }
  if(fromTrainer){
    if(message.type==='hammerschach-trainer-ready'){
      postTrainerToolContext();
      postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
      return;
    }
    if(message.type==='hammerschach-trainer-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        trainerToolFrame.style.height=Math.max(720,Math.min(3200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    if(message.type==='hammerschach-trainer-request-progress'){
      const requestId=String(message.requestId||'');
      if(!onlineAuthToken||!onlineAuthUser){
        postTrainerToolMessage({type:'hammerschach-trainer-progress-result',requestId,ok:false,message:'Bitte zuerst im Gamer einloggen.'});
        return;
      }
      try{
        const data=await authApi('/api/trainer/progress');
        postTrainerToolMessage({type:'hammerschach-trainer-progress-result',requestId,ok:true,progress:data.progress||null});
      }catch(err){
        postTrainerToolMessage({type:'hammerschach-trainer-progress-result',requestId,ok:false,message:err&&err.message?err.message:'Taktik-Rating konnte nicht geladen werden.'});
      }
      return;
    }
    if(message.type==='hammerschach-trainer-save-result'){
      const requestId=String(message.requestId||'');
      if(!onlineAuthToken||!onlineAuthUser){
        postTrainerToolMessage({type:'hammerschach-trainer-save-result',requestId,ok:false,message:'Bitte zuerst im Gamer einloggen.'});
        return;
      }
      try{
        const data=await authApi('/api/trainer/progress',{
          method:'POST',
          body:JSON.stringify({
            attemptId:String(message.attemptId||''),puzzleId:String(message.puzzleId||''),
            puzzleRating:Number(message.puzzleRating||1200),result:message.result==='success'?'success':'fail'
          })
        });
        postTrainerToolMessage({type:'hammerschach-trainer-save-result',requestId,ok:true,progress:data.progress||null,ratingChange:data.ratingChange||0});
      }catch(err){
        postTrainerToolMessage({type:'hammerschach-trainer-save-result',requestId,ok:false,message:err&&err.message?err.message:'Taktik-Ergebnis konnte nicht gespeichert werden.'});
      }
      return;
    }
    return;
  }
  if(message.type==='hammerschach-analyzer-ready'){
    analyzerToolReady=true;
    postAnalyzerToolContext();
    postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
    if(pendingAnalyzerOpeningPgn){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-import-opening',pgn:pendingAnalyzerOpeningPgn});
      pendingAnalyzerOpeningPgn='';
    }
    if(pendingAnalyzerArchivePgn){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-import-game',pgn:pendingAnalyzerArchivePgn});
      pendingAnalyzerArchivePgn='';
    }
    return;
  }
  if(message.type==='hammerschach-analyzer-height'){
    const requested=Math.ceil(Number(message.height||0));
    if(Number.isFinite(requested)&&requested>0){
      analyzerToolFrame.style.height=Math.max(720,Math.min(3200,requested+4))+'px';
      hammerschachScheduleHeightReport(true);
    }
    return;
  }
  if(message.type==='hammerschach-analyzer-request-games'){
    const requestId=String(message.requestId||'');
    if(!onlineAuthToken||!onlineAuthUser){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-games-result',requestId,ok:false,message:'Bitte zuerst im Gamer einloggen.',games:[]});
      return;
    }
    try{
      const data=await authApi('/api/analyzer/games');
      postAnalyzerToolMessage({type:'hammerschach-analyzer-games-result',requestId,ok:true,games:Array.isArray(data.games)?data.games:[]});
    }catch(err){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-games-result',requestId,ok:false,message:err&&err.message?err.message:'Beendete Partien konnten nicht geladen werden.',games:[]});
    }
    return;
  }
  if(message.type==='hammerschach-analyzer-request-pgn'){
    const requestId=String(message.requestId||'');
    const roomId=cleanRoomId(message.roomId);
    const source=message.source==='daily'?'daily':'archive';
    if(!onlineAuthToken||!onlineAuthUser||!roomId){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-pgn-result',requestId,ok:false,message:'Die beendete Partie konnte nicht geladen werden.'});
      return;
    }
    const path=source==='daily'?'/api/daily-games/'+encodeURIComponent(roomId)+'/pgn':'/api/analyzer/games/'+encodeURIComponent(roomId)+'/pgn';
    try{
      const response=await fetch(onlineApiBaseUrl()+path,{method:'GET',headers:{authorization:'Bearer '+onlineAuthToken}});
      if(!response.ok){
        let detail=null;
        try{detail=await response.json();}catch(_){detail=null;}
        throw new Error(detail&&detail.message?detail.message:'PGN konnte nicht geladen werden.');
      }
      const pgn=await response.text();
      postAnalyzerToolMessage({type:'hammerschach-analyzer-pgn-result',requestId,ok:true,pgn,roomId});
    }catch(err){
      postAnalyzerToolMessage({type:'hammerschach-analyzer-pgn-result',requestId,ok:false,message:err&&err.message?err.message:'PGN konnte nicht geladen werden.'});
    }
  }
});
