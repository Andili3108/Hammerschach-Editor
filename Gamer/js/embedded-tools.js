'use strict';

let analyzerToolActive = false;
let trainerToolActive = false;
let openingsToolActive = false;
let fairplayToolActive = false;
let tvToolActive = false;
let analyzerToolFrameStarted = false;
let trainerToolFrameStarted = false;
let openingsToolFrameStarted = false;
let fairplayToolFrameStarted = false;
let analyzerToolLastOpenAt = 0;
let trainerToolLastOpenAt = 0;
let openingsToolLastOpenAt = 0;
let fairplayToolLastOpenAt = 0;
let tvToolLastOpenAt = 0;
let analyzerToolReady = false;
let pendingAnalyzerOpeningPgn = '';
let pendingAnalyzerArchivePgn = '';
const EMBEDDED_TOOL_OPEN_DEBOUNCE_MS = 450;
function embeddedToolsAvailable(){
  return !!(onlineAuthToken && onlineAuthUser && !onlineRoomId && !hasOnlineTargetInAddress());
}
function embeddedToolActive(){
  return analyzerToolActive || trainerToolActive || openingsToolActive || fairplayToolActive || tvToolActive;
}
function embeddedToolStatusText(){
  if(tvToolActive) return 'Hammerschach - TV';
  if(fairplayToolActive) return 'Hammerschach - Fairplay-Prüfung';
  if(openingsToolActive) return 'Hammerschach - Eröffnungsschule';
  if(trainerToolActive) return 'Hammerschach - Trainer';
  if(analyzerToolActive) return 'Hammerschach - Analyzer';
  return '';
}
function updateAnalyzerToolAvailability(){
  const available = embeddedToolsAvailable();
  const fairplayAvailable = available && !!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  document.documentElement.classList.toggle('hammerschach-room-view', !available);
  if(!available && embeddedToolActive()) setEmbeddedToolActive('');
  if(!fairplayAvailable && fairplayToolActive) setEmbeddedToolActive('');
  if(analyzerToolBtn){analyzerToolBtn.hidden=!available;analyzerToolBtn.title='Hammerschach-Analyzer öffnen';}
  if(trainerToolBtn){trainerToolBtn.hidden=!available;trainerToolBtn.title='Hammerschach-Trainer öffnen';}
  if(openingsToolBtn){openingsToolBtn.hidden=!available;openingsToolBtn.title='Hammerschach-Eröffnungsschule öffnen';}
  if(tvToolBtn){tvToolBtn.hidden=!available;tvToolBtn.title='Hammerschach TV öffnen';}
  if(toolsMenuEl){
    toolsMenuEl.hidden = !available;
    if(!available) closeToolsMenu();
  }
}
function embeddedToolTargetOrigin(){
  return window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
}
function postAnalyzerToolMessage(message){
  if(!analyzerToolFrameStarted || !analyzerToolFrame || !analyzerToolFrame.contentWindow) return;
  try{ analyzerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postTrainerToolMessage(message){
  if(!trainerToolFrameStarted || !trainerToolFrame || !trainerToolFrame.contentWindow) return;
  try{ trainerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postOpeningsToolMessage(message){
  if(!openingsToolFrameStarted || !openingsToolFrame || !openingsToolFrame.contentWindow) return;
  try{ openingsToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postFairplayToolMessage(message){
  if(!fairplayToolFrameStarted || !fairplayToolFrame || !fairplayToolFrame.contentWindow) return;
  try{ fairplayToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
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
  const requested=embeddedToolsAvailable()
    ? (toolName==='tv'?'tv':(toolName==='fairplay'&&fairplayAllowed?'fairplay':(toolName==='openings'?'openings':(toolName==='trainer'?'trainer':(toolName==='analyzer'?'analyzer':'')))))
    : '';
  analyzerToolActive=requested==='analyzer';
  trainerToolActive=requested==='trainer';
  openingsToolActive=requested==='openings';
  fairplayToolActive=requested==='fairplay';
  const tvWasActive=tvToolActive;
  tvToolActive=requested==='tv';
  document.documentElement.classList.toggle('analyzer-tool-active',analyzerToolActive);
  document.documentElement.classList.toggle('trainer-tool-active',trainerToolActive);
  document.documentElement.classList.toggle('openings-tool-active',openingsToolActive);
  document.documentElement.classList.toggle('fairplay-tool-active',fairplayToolActive);
  document.documentElement.classList.toggle('tv-tool-active',tvToolActive);
  if(analyzerToolView)analyzerToolView.hidden=!analyzerToolActive;
  if(trainerToolView)trainerToolView.hidden=!trainerToolActive;
  if(openingsToolView)openingsToolView.hidden=!openingsToolActive;
  if(fairplayToolView)fairplayToolView.hidden=!fairplayToolActive;
  if(tvToolView)tvToolView.hidden=!tvToolActive;
  if(embeddedToolActive()){
    closeNewGameMenu();
    closeGamesMenu();
    closeToolsMenu();
  }
  updateSiteFootnotePlacement();
  if(analyzerToolActive&&analyzerToolFrame&&!analyzerToolFrameStarted){
    analyzerToolFrameStarted=true;
    analyzerToolFrame.src=analyzerToolFrame.dataset.src||'./Analyzer/';
  }
  if(trainerToolActive&&trainerToolFrame&&!trainerToolFrameStarted){
    trainerToolFrameStarted=true;
    trainerToolFrame.src=trainerToolFrame.dataset.src||'./Trainer/';
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
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
  postOpeningsToolMessage({type:'hammerschach-openings-visibility',visible:openingsToolActive});
  postFairplayToolMessage({type:'hammerschach-fairplay-visibility',visible:fairplayToolActive});
  if(analyzerToolActive)postAnalyzerToolContext();
  if(trainerToolActive)postTrainerToolContext();
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
function setAnalyzerToolActive(active){setEmbeddedToolActive(active?'analyzer':'');}
function setTrainerToolActive(active){setEmbeddedToolActive(active?'trainer':'');}
function setOpeningsToolActive(active){setEmbeddedToolActive(active?'openings':'');}
function setFairplayToolActive(active){setEmbeddedToolActive(active?'fairplay':'');}
function setTvToolActive(active){setEmbeddedToolActive(active?'tv':'');}
function closeEmbeddedTools(){setEmbeddedToolActive('');}
function openAnalyzerToolDebounced(){
  const now=Date.now();
  if(now-analyzerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  analyzerToolLastOpenAt=now;
  setAnalyzerToolActive(true);
}
function openTrainerToolDebounced(){
  const now=Date.now();
  if(now-trainerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  trainerToolLastOpenAt=now;
  setTrainerToolActive(true);
}
function openOpeningsToolDebounced(){
  const now=Date.now();
  if(now-openingsToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  openingsToolLastOpenAt=now;
  setOpeningsToolActive(true);
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
  setTvToolActive(true);
}
if(analyzerToolBtn)analyzerToolBtn.addEventListener('click',openAnalyzerToolDebounced);
if(trainerToolBtn)trainerToolBtn.addEventListener('click',openTrainerToolDebounced);
if(openingsToolBtn)openingsToolBtn.addEventListener('click',openOpeningsToolDebounced);
if(tvToolBtn)tvToolBtn.addEventListener('click',openTvToolDebounced);
if(analyzerToolFrame)analyzerToolFrame.addEventListener('load',()=>{
  postAnalyzerToolContext();
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
});
if(trainerToolFrame)trainerToolFrame.addEventListener('load',()=>{
  postTrainerToolContext();
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
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
  const fromAnalyzer=!!(analyzerToolFrame&&event.source===analyzerToolFrame.contentWindow);
  const fromTrainer=!!(trainerToolFrame&&event.source===trainerToolFrame.contentWindow);
  const fromOpenings=!!(openingsToolFrame&&event.source===openingsToolFrame.contentWindow);
  const fromFairplay=!!(fairplayToolFrame&&event.source===fairplayToolFrame.contentWindow);
  if(!fromAnalyzer&&!fromTrainer&&!fromOpenings&&!fromFairplay)return;
  if(embeddedToolTargetOrigin()!=='*'&&event.origin!==embeddedToolTargetOrigin())return;
  const message=event.data&&typeof event.data==='object'?event.data:{};
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
