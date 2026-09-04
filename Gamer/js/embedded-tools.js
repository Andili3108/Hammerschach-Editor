'use strict';

let learningToolActive = false;
let analyzerToolActive = false;
let playerToolActive = false;
let trainerToolActive = false;
let mateSchoolToolActive = false;
let schachlaborToolActive = false;
let openingsToolActive = false;
let fairplayToolActive = false;
let readerToolActive = false;
let tournamentReportToolActive = false;
let tvToolActive = false;
let leagueStandingsToolActive = false;
let learningToolFrameStarted = false;
let analyzerToolFrameStarted = false;
let playerToolFrameStarted = false;
let trainerToolFrameStarted = false;
let mateSchoolToolFrameStarted = false;
let schachlaborToolFrameStarted = false;
let openingsToolFrameStarted = false;
let fairplayToolFrameStarted = false;
let readerToolFrameStarted = false;
let tournamentReportToolFrameStarted = false;
let tournamentReportCurrentId = 'unna-open-2025';
let learningToolLastOpenAt = 0;
let analyzerToolLastOpenAt = 0;
let playerToolLastOpenAt = 0;
let trainerToolLastOpenAt = 0;
let mateSchoolToolLastOpenAt = 0;
let schachlaborToolLastOpenAt = 0;
let openingsToolLastOpenAt = 0;
let fairplayToolLastOpenAt = 0;
let readerToolLastOpenAt = 0;
let tournamentReportToolLastOpenAt = 0;
let tvToolLastOpenAt = 0;
let leagueStandingsToolLastOpenAt = 0;
let analyzerToolReady = false;
let pendingTrainerStartMode = '';
let trainerHeaderState = {mode:'coach',detailsOpen:false,solved:0,total:65,stage:1,stageTotal:6,stageTitle:'Matt in einem Zug'};
let pendingAnalyzerOpeningPgn = '';
let pendingAnalyzerArchivePgn = '';
const EMBEDDED_TOOL_OPEN_DEBOUNCE_MS = 450;
const PENDING_EMBEDDED_TOOL_STORAGE_KEY = 'hammerschachPendingEmbeddedToolV1';
const ACTIVE_EMBEDDED_TOOL_STORAGE_KEY = 'hammerschachActiveEmbeddedToolV1';
const TOURNAMENT_REPORTS = Object.freeze({
  'unna-open-2025':{title:'Unna Open 2025',src:'./Turnierberichte/unna-open-2025/?embedded=1'},
  'quick-round-robin-2026':{title:'Quick-Round-Robin 2026',src:'./Turnierberichte/quick-round-robin-2026/?embedded=1'}
});
const NAVIGABLE_EMBEDDED_TOOLS = new Set(['learning','analyzer','player','trainer','mate-school','schachlabor','openings','reader','tournament-report','tv','league-standings']);
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
function trainerToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function trainerToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function mateSchoolToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function mateSchoolToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function leagueStandingsToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function leagueStandingsToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function readerToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function readerToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function tournamentReportToolAvailable(){
  return !!(!onlineRoomId && !hasOnlineTargetInAddress());
}
function tournamentReportToolNavigable(){
  return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);
}
function protectedEmbeddedToolActive(){
  return analyzerToolActive || playerToolActive || schachlaborToolActive || openingsToolActive || fairplayToolActive || tvToolActive;
}
function memberEmbeddedToolActive(){
  return analyzerToolActive || playerToolActive || trainerToolActive || mateSchoolToolActive || schachlaborToolActive || openingsToolActive || fairplayToolActive || readerToolActive || tournamentReportToolActive || tvToolActive || leagueStandingsToolActive;
}
function embeddedToolActive(){
  return learningToolActive || memberEmbeddedToolActive();
}
function embeddedToolStatusText(){
  if(learningToolActive) return 'Hammerschach - Schach lernen';
  if(leagueStandingsToolActive) return 'Hammerschach - Ergebnisdienst';
  if(tvToolActive) return 'Hammerschach - TV';
  if(fairplayToolActive) return 'Hammerschach - Fairplay-Prüfung';
  if(tournamentReportToolActive) return 'Turnierbericht '+(TOURNAMENT_REPORTS[tournamentReportCurrentId]||TOURNAMENT_REPORTS['unna-open-2025']).title;
  if(readerToolActive) return 'Hammerschach - Partienarchiv';
  if(openingsToolActive) return 'Hammerschach - Eröffnungsschule';
  if(mateSchoolToolActive) return 'Hammerschach - Mattbilder-Schule';
  if(schachlaborToolActive) return 'Hammerschach - Schachlabor';
  if(trainerToolActive) return 'Hammerschach - Trainer';
  if(analyzerToolActive) return 'Hammerschach - Analyzer';
  if(playerToolActive) return 'Hammerschach - Player';
  return '';
}
function updateAnalyzerToolAvailability(){
  const available = embeddedToolsAvailable();
  const navigable = embeddedToolsNavigable();
  const learningAvailable = learningToolAvailable();
  const learningNavigable = learningToolNavigable();
  const trainerAvailable = trainerToolAvailable();
  const trainerNavigable = trainerToolNavigable();
  const mateSchoolAvailable = mateSchoolToolAvailable();
  const mateSchoolNavigable = mateSchoolToolNavigable();
  const leagueStandingsAvailable = leagueStandingsToolAvailable();
  const leagueStandingsNavigable = leagueStandingsToolNavigable();
  const readerAvailable = readerToolAvailable();
  const readerNavigable = readerToolNavigable();
  const tournamentReportAvailable = tournamentReportToolAvailable();
  const tournamentReportNavigable = tournamentReportToolNavigable();
  const fairplayAvailable = available && !!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  document.documentElement.classList.toggle('hammerschach-room-view', !available);
  if((!available && protectedEmbeddedToolActive()) || (!learningAvailable && learningToolActive) || (!trainerAvailable && trainerToolActive) || (!mateSchoolAvailable && mateSchoolToolActive) || (!leagueStandingsAvailable && leagueStandingsToolActive) || (!readerAvailable && readerToolActive) || (!tournamentReportAvailable && tournamentReportToolActive)) setEmbeddedToolActive('');
  if(!fairplayAvailable && fairplayToolActive) setEmbeddedToolActive('');
  const titleFor = name => available ? `${name} öffnen` : `Spielraum verlassen und ${name} öffnen`;
  if(learningToolBtn){learningToolBtn.hidden=!learningNavigable;learningToolBtn.title=learningAvailable?'Hammerschach-Grundkurs öffnen':'Spielraum verlassen und den Hammerschach-Grundkurs öffnen';}
  if(analyzerToolBtn){analyzerToolBtn.hidden=!navigable;analyzerToolBtn.title=titleFor('Hammerschach-Analyzer');}
  if(playerToolBtn){playerToolBtn.hidden=!navigable;playerToolBtn.title=titleFor('Hammerschach-Player');}
  if(trainerToolBtn){trainerToolBtn.hidden=!trainerNavigable;trainerToolBtn.title=trainerAvailable?'Hammerschach-Trainer öffnen':'Spielraum verlassen und den Hammerschach-Trainer öffnen';}
  if(mateSchoolToolBtn){mateSchoolToolBtn.hidden=!mateSchoolNavigable;mateSchoolToolBtn.title=mateSchoolAvailable?'Hammerschach-Mattbilder-Schule öffnen':'Spielraum verlassen und die Mattbilder-Schule öffnen';}
  if(schachlaborToolBtn){schachlaborToolBtn.hidden=!navigable;schachlaborToolBtn.title=titleFor('Hammerschach-Schachlabor');}
  if(openingsToolBtn){openingsToolBtn.hidden=!navigable;openingsToolBtn.title=titleFor('Hammerschach-Eröffnungsschule');}
  if(tvToolBtn){tvToolBtn.hidden=!navigable;tvToolBtn.title=titleFor('Gamer-TV');tvToolBtn.setAttribute('aria-label',titleFor('Gamer-TV'));}
  if(readerToolBtn){readerToolBtn.hidden=!readerNavigable;readerToolBtn.title=readerAvailable?'Partienarchiv öffnen':'Spielraum verlassen und das Partienarchiv öffnen';}
  if(tournamentReportToolBtn){tournamentReportToolBtn.hidden=!tournamentReportNavigable;tournamentReportToolBtn.title=tournamentReportAvailable?'Turnierbericht öffnen':'Spielraum verlassen und den Turnierbericht öffnen';}
  if(leagueStandingsToolBtn){leagueStandingsToolBtn.hidden=!leagueStandingsNavigable;leagueStandingsToolBtn.title=leagueStandingsAvailable?'Ergebnisdienst öffnen':'Spielraum verlassen und den Ergebnisdienst öffnen';}
  if(toolsMenuEl){
    toolsMenuEl.hidden = !navigable && !learningNavigable && !trainerNavigable && !mateSchoolNavigable;
    if(toolsMenuEl.hidden) closeToolsMenu();
  }
  if(clubChessMenuEl){
    clubChessMenuEl.hidden = !leagueStandingsNavigable && !readerNavigable && !tournamentReportNavigable;
    if(clubChessMenuEl.hidden) closeClubChessMenu();
  }
  if(available || learningAvailable || trainerAvailable || mateSchoolAvailable || leagueStandingsAvailable || readerAvailable || tournamentReportAvailable){
    let pending='';
    let remembered='';
    try{
      pending=String(sessionStorage.getItem(PENDING_EMBEDDED_TOOL_STORAGE_KEY)||'');
      remembered=String(sessionStorage.getItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY)||'');
      sessionStorage.removeItem(PENDING_EMBEDDED_TOOL_STORAGE_KEY);
    }catch(_){}
    const canRestore=tool=>tool==='learning'?learningAvailable:(tool==='trainer'?trainerAvailable:(tool==='mate-school'?mateSchoolAvailable:(tool==='league-standings'?leagueStandingsAvailable:(tool==='reader'?readerAvailable:(tool==='tournament-report'?tournamentReportAvailable:(available&&RESTORABLE_EMBEDDED_TOOLS.has(tool)))))));
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
function postPlayerToolMessage(message){
  if(!playerToolFrameStarted || !playerToolFrame || !playerToolFrame.contentWindow) return;
  try{ playerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postTrainerToolMessage(message){
  if(!trainerToolFrameStarted || !trainerToolFrame || !trainerToolFrame.contentWindow) return;
  try{ trainerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postMateSchoolToolMessage(message){
  if(!mateSchoolToolFrameStarted || !mateSchoolToolFrame || !mateSchoolToolFrame.contentWindow) return;
  try{ mateSchoolToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function updateTrainerHeaderActions(){
  const active=!!trainerToolActive;
  const coach=trainerHeaderState.mode!=='free';
  const visitor=!(onlineAuthToken&&onlineAuthUser);
  if(trainerBeginnerMenuEl)trainerBeginnerMenuEl.hidden=!active||visitor;
  [trainerBeginnerHeaderBtn,trainerProgressHeaderBtn,trainerMattbilderHeaderBtn].forEach(button=>{if(button)button.hidden=!active||visitor;});
  if(trainerFreeHeaderBtn)trainerFreeHeaderBtn.hidden=!active||visitor;
  if(visitorTrainerProgressHeaderBtn){
    visitorTrainerProgressHeaderBtn.hidden=!active||!visitor;
    visitorTrainerProgressHeaderBtn.textContent='📊 Lernstand · '+Math.max(0,Number(trainerHeaderState.solved)||0)+'/'+Math.max(1,Number(trainerHeaderState.total)||65);
    visitorTrainerProgressHeaderBtn.classList.toggle('active',active&&visitor&&coach&&!!trainerHeaderState.detailsOpen);
  }
  if(visitorTrainerOpenBtn)visitorTrainerOpenBtn.classList.toggle('active',active&&visitor&&coach&&!trainerHeaderState.detailsOpen);
  if(trainerBeginnerMenuBtn){
    trainerBeginnerMenuBtn.classList.toggle('active',active&&coach);
    trainerBeginnerMenuBtn.setAttribute('aria-pressed',active&&coach?'true':'false');
  }
  if(trainerBeginnerHeaderBtn){
    const tasksActive=active&&coach&&!trainerHeaderState.detailsOpen;
    trainerBeginnerHeaderBtn.classList.toggle('active',tasksActive);
    if(tasksActive)trainerBeginnerHeaderBtn.setAttribute('aria-current','page');else trainerBeginnerHeaderBtn.removeAttribute('aria-current');
  }
  if(trainerFreeHeaderBtn){
    trainerFreeHeaderBtn.classList.toggle('active',active&&!coach);
    trainerFreeHeaderBtn.setAttribute('aria-pressed',active&&!coach?'true':'false');
  }
  if(trainerProgressHeaderBtn){
    trainerProgressHeaderBtn.classList.toggle('active',active&&coach&&!!trainerHeaderState.detailsOpen);
    if(active&&coach&&trainerHeaderState.detailsOpen)trainerProgressHeaderBtn.setAttribute('aria-current','page');else trainerProgressHeaderBtn.removeAttribute('aria-current');
    trainerProgressHeaderBtn.textContent='📊 Lernstand · '+Math.max(0,Number(trainerHeaderState.solved)||0)+'/'+Math.max(1,Number(trainerHeaderState.total)||65);
  }
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
function postReaderToolMessage(message){
  if(!readerToolFrameStarted || !readerToolFrame || !readerToolFrame.contentWindow) return;
  try{ readerToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
}
function postTournamentReportToolMessage(message){
  if(!tournamentReportToolFrameStarted || !tournamentReportToolFrame || !tournamentReportToolFrame.contentWindow) return;
  try{ tournamentReportToolFrame.contentWindow.postMessage(message, embeddedToolTargetOrigin()); } catch(_){ }
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
function postPlayerToolContext(){
  let boardColor='basis',pieceSet='cburnett';
  try{boardColor=localStorage.getItem('hammerschachBoardColor')||'basis';pieceSet=localStorage.getItem('hammerschachPieceSet')||'cburnett';}catch(_){ }
  postPlayerToolMessage({
    type:'hammerschach-player-context',darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken&&onlineAuthUser),username:onlineAuthUser?cleanDisplayName(onlineAuthUser.username||''):'',boardColor,pieceSet
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
function postMateSchoolToolContext(){
  let boardColor='basis';
  let pieceSet='cburnett';
  try{
    boardColor=localStorage.getItem('hammerschachBoardColor')||'basis';
    pieceSet=localStorage.getItem('hammerschachPieceSet')||'cburnett';
  }catch(_){}
  postMateSchoolToolMessage({
    type:'hammerschach-mate-school-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : '',
    boardColor,
    pieceSet
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
  let boardColor='basis';
  let pieceSet='cburnett';
  try{
    boardColor=localStorage.getItem('hammerschachBoardColor')||'basis';
    pieceSet=localStorage.getItem('hammerschachPieceSet')||'cburnett';
  }catch(_){}
  postOpeningsToolMessage({
    type:'hammerschach-openings-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : '',
    openingCatalog:Array.isArray(TOURNAMENT_THEME_CATALOG) ? TOURNAMENT_THEME_CATALOG : [],
    boardColor,
    pieceSet
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
function postReaderToolContext(){
  let boardColor='basis';
  let pieceSet='cburnett';
  try{
    boardColor=localStorage.getItem('hammerschachBoardColor')||'basis';
    pieceSet=localStorage.getItem('hammerschachPieceSet')||'cburnett';
  }catch(_){}
  postReaderToolMessage({
    type:'hammerschach-reader-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser),
    isAdmin:!!(onlineAuthUser && onlineAuthUser.isAdmin === true),
    username:onlineAuthUser ? cleanDisplayName(onlineAuthUser.username || '') : '',
    boardColor,
    pieceSet
  });
}
function postTournamentReportToolContext(){
  postTournamentReportToolMessage({
    type:'hammerschach-tournament-report-context',
    darkMode:!!darkModeEnabled,
    loggedIn:!!(onlineAuthToken && onlineAuthUser)
  });
}
function updateTournamentReportSwitcher(){
  const current=TOURNAMENT_REPORTS[tournamentReportCurrentId]||TOURNAMENT_REPORTS['unna-open-2025'];
  [[tournamentReportUnnaBtn,'unna-open-2025'],[tournamentReportQuickBtn,'quick-round-robin-2026']].forEach(([button,id])=>{
    if(!button)return;
    const active=id===tournamentReportCurrentId;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
  if(tournamentReportToolFrame){
    tournamentReportToolFrame.title='Turnierbericht '+current.title;
    tournamentReportToolFrame.dataset.src=current.src;
  }
  if(tournamentReportToolView)tournamentReportToolView.setAttribute('aria-label','Turnierbericht '+current.title);
}
function selectTournamentReport(reportId){
  if(!TOURNAMENT_REPORTS[reportId])return;
  const changed=tournamentReportCurrentId!==reportId;
  tournamentReportCurrentId=reportId;
  updateTournamentReportSwitcher();
  if(tournamentReportToolFrame&&tournamentReportToolActive&&(changed||!tournamentReportToolFrameStarted)){
    tournamentReportToolFrameStarted=true;
    tournamentReportToolFrame.src=TOURNAMENT_REPORTS[reportId].src;
  }
  if(tournamentReportToolActive&&statusEl)statusEl.textContent=embeddedToolStatusText();
}
function setEmbeddedToolActive(toolName){
  const trainerWasActive=trainerToolActive;
  const fairplayAllowed=!!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  let requested='';
  if(toolName==='learning'&&learningToolAvailable())requested='learning';
  else if(toolName==='trainer'&&trainerToolAvailable())requested='trainer';
  else if(toolName==='mate-school'&&mateSchoolToolAvailable())requested='mate-school';
  else if(toolName==='league-standings'&&leagueStandingsToolAvailable())requested='league-standings';
  else if(toolName==='reader'&&readerToolAvailable())requested='reader';
  else if(toolName==='tournament-report'&&tournamentReportToolAvailable())requested='tournament-report';
  else if(embeddedToolsAvailable()){
    if(toolName==='tv')requested='tv';
    else if(toolName==='fairplay'&&fairplayAllowed)requested='fairplay';
    else if(toolName==='openings')requested='openings';
    else if(toolName==='schachlabor')requested='schachlabor';
    else if(toolName==='analyzer')requested='analyzer';
    else if(toolName==='player')requested='player';
  }
  try{
    if(requested)sessionStorage.setItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY,requested);
    else sessionStorage.removeItem(ACTIVE_EMBEDDED_TOOL_STORAGE_KEY);
  }catch(_){}
  learningToolActive=requested==='learning';
  analyzerToolActive=requested==='analyzer';
  playerToolActive=requested==='player';
  trainerToolActive=requested==='trainer';
  mateSchoolToolActive=requested==='mate-school';
  schachlaborToolActive=requested==='schachlabor';
  openingsToolActive=requested==='openings';
  fairplayToolActive=requested==='fairplay';
  readerToolActive=requested==='reader';
  tournamentReportToolActive=requested==='tournament-report';
  const tvWasActive=tvToolActive;
  tvToolActive=requested==='tv';
  const leagueStandingsWasActive=leagueStandingsToolActive;
  leagueStandingsToolActive=requested==='league-standings';
  document.documentElement.classList.toggle('learning-tool-active',learningToolActive);
  document.documentElement.classList.toggle('analyzer-tool-active',analyzerToolActive);
  document.documentElement.classList.toggle('player-tool-active',playerToolActive);
  document.documentElement.classList.toggle('trainer-tool-active',trainerToolActive);
  document.documentElement.classList.toggle('mate-school-tool-active',mateSchoolToolActive);
  document.documentElement.classList.toggle('schachlabor-tool-active',schachlaborToolActive);
  document.documentElement.classList.toggle('openings-tool-active',openingsToolActive);
  document.documentElement.classList.toggle('fairplay-tool-active',fairplayToolActive);
  document.documentElement.classList.toggle('reader-tool-active',readerToolActive);
  document.documentElement.classList.toggle('tournament-report-tool-active',tournamentReportToolActive);
  document.documentElement.classList.toggle('tv-tool-active',tvToolActive);
  document.documentElement.classList.toggle('league-standings-tool-active',leagueStandingsToolActive);
  updateTrainerHeaderActions();
  if(learningToolView)learningToolView.hidden=!learningToolActive;
  if(analyzerToolView)analyzerToolView.hidden=!analyzerToolActive;
  if(playerToolView)playerToolView.hidden=!playerToolActive;
  if(trainerToolView)trainerToolView.hidden=!trainerToolActive;
  if(mateSchoolToolView)mateSchoolToolView.hidden=!mateSchoolToolActive;
  if(schachlaborToolView)schachlaborToolView.hidden=!schachlaborToolActive;
  if(openingsToolView)openingsToolView.hidden=!openingsToolActive;
  if(fairplayToolView)fairplayToolView.hidden=!fairplayToolActive;
  if(readerToolView)readerToolView.hidden=!readerToolActive;
  if(tournamentReportToolView)tournamentReportToolView.hidden=!tournamentReportToolActive;
  if(tvToolView)tvToolView.hidden=!tvToolActive;
  if(leagueStandingsView)leagueStandingsView.hidden=!leagueStandingsToolActive;
  if(embeddedToolActive()){
    closeNewGameMenu();
    closeTrainerBeginnerMenu();
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
  if(playerToolActive&&playerToolFrame&&!playerToolFrameStarted){
    playerToolFrameStarted=true;
    playerToolFrame.src=playerToolFrame.dataset.src||'./Player/';
  }
  if(trainerToolActive&&trainerToolFrame&&!trainerToolFrameStarted){
    trainerToolFrameStarted=true;
    trainerToolFrame.src=trainerToolFrame.dataset.src||'./Trainer/';
  }
  if(mateSchoolToolActive&&mateSchoolToolFrame&&!mateSchoolToolFrameStarted){
    mateSchoolToolFrameStarted=true;
    mateSchoolToolFrame.src=mateSchoolToolFrame.dataset.src||'./Mattbilder/';
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
  if(readerToolActive&&readerToolFrame&&!readerToolFrameStarted){
    readerToolFrameStarted=true;
    readerToolFrame.src=readerToolFrame.dataset.src||'./Reader/';
  }
  if(tournamentReportToolActive&&tournamentReportToolFrame&&!tournamentReportToolFrameStarted){
    tournamentReportToolFrameStarted=true;
    updateTournamentReportSwitcher();
    tournamentReportToolFrame.src=tournamentReportToolFrame.dataset.src||TOURNAMENT_REPORTS['unna-open-2025'].src;
  }
  if(tvToolActive){
    loadHammerschachTv();
    startHammerschachTvPolling();
  }else if(tvWasActive){
    stopHammerschachTvPlayback();
  }
  if(leagueStandingsToolActive){
    loadLeagueStandings();
    startLeagueStandingsPolling();
  }else if(leagueStandingsWasActive){
    stopLeagueStandingsPolling();
  }
  postLearningToolMessage({type:'hammerschach-learning-visibility',visible:learningToolActive});
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
  postPlayerToolMessage({type:'hammerschach-player-visibility',visible:playerToolActive});
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
  postMateSchoolToolMessage({type:'hammerschach-mate-school-visibility',visible:mateSchoolToolActive});
  postSchachlaborToolMessage({type:'hammerschach-schachlabor-visibility',visible:schachlaborToolActive});
  postOpeningsToolMessage({type:'hammerschach-openings-visibility',visible:openingsToolActive});
  postFairplayToolMessage({type:'hammerschach-fairplay-visibility',visible:fairplayToolActive});
  postReaderToolMessage({type:'hammerschach-reader-visibility',visible:readerToolActive});
  postTournamentReportToolMessage({type:'hammerschach-tournament-report-visibility',visible:tournamentReportToolActive});
  if(learningToolActive)postLearningToolContext();
  if(analyzerToolActive)postAnalyzerToolContext();
  if(playerToolActive)postPlayerToolContext();
  if(trainerToolActive)postTrainerToolContext();
  if(mateSchoolToolActive)postMateSchoolToolContext();
  if(schachlaborToolActive)postSchachlaborToolContext();
  if(openingsToolActive)postOpeningsToolContext();
  if(fairplayToolActive)postFairplayToolContext();
  if(readerToolActive)postReaderToolContext();
  if(tournamentReportToolActive)postTournamentReportToolContext();
  if(statusEl){
    const toolStatus=embeddedToolStatusText();
    if(toolStatus)statusEl.textContent=toolStatus;else refreshHeaderStatusFromState();
  }
  updateOnlineActionButtons();
  if(embeddedToolActive()&&roomLobbyBtn){
    try{roomLobbyBtn.focus({preventScroll:true});}catch(_){roomLobbyBtn.focus();}
  }
  if(trainerToolActive&&!trainerWasActive){
    requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
    setTimeout(()=>{if(trainerToolActive)window.scrollTo({top:0,left:0,behavior:'auto'});},250);
    setTimeout(()=>{if(trainerToolActive)window.scrollTo({top:0,left:0,behavior:'auto'});},900);
  }
  hammerschachScheduleHeightReport(true);
}
function setLearningToolActive(active){setEmbeddedToolActive(active?'learning':'');}
function setAnalyzerToolActive(active){setEmbeddedToolActive(active?'analyzer':'');}
function setPlayerToolActive(active){setEmbeddedToolActive(active?'player':'');}
function setTrainerToolActive(active){setEmbeddedToolActive(active?'trainer':'');}
function setMateSchoolToolActive(active){setEmbeddedToolActive(active?'mate-school':'');}
function setSchachlaborToolActive(active){setEmbeddedToolActive(active?'schachlabor':'');}
function setOpeningsToolActive(active){setEmbeddedToolActive(active?'openings':'');}
function setFairplayToolActive(active){setEmbeddedToolActive(active?'fairplay':'');}
function setReaderToolActive(active){setEmbeddedToolActive(active?'reader':'');}
function setTournamentReportToolActive(active){setEmbeddedToolActive(active?'tournament-report':'');}
function setTvToolActive(active){setEmbeddedToolActive(active?'tv':'');}
function setLeagueStandingsToolActive(active){setEmbeddedToolActive(active?'league-standings':'');}
function closeEmbeddedTools(){setEmbeddedToolActive('');}
function openEmbeddedToolFromCurrentContext(toolName){
  const requested=NAVIGABLE_EMBEDDED_TOOLS.has(toolName)?toolName:'';
  const isLearning=requested==='learning';
  const isTrainer=requested==='trainer';
  const isMateSchool=requested==='mate-school';
  const isLeagueStandings=requested==='league-standings';
  const isReader=requested==='reader';
  const isTournamentReport=requested==='tournament-report';
  const navigable=isLearning?learningToolNavigable():(isTrainer?trainerToolNavigable():(isMateSchool?mateSchoolToolNavigable():(isLeagueStandings?leagueStandingsToolNavigable():(isReader?readerToolNavigable():(isTournamentReport?tournamentReportToolNavigable():embeddedToolsNavigable())))));
  const available=isLearning?learningToolAvailable():(isTrainer?trainerToolAvailable():(isMateSchool?mateSchoolToolAvailable():(isLeagueStandings?leagueStandingsToolAvailable():(isReader?readerToolAvailable():(isTournamentReport?tournamentReportToolAvailable():embeddedToolsAvailable())))));
  if(!requested||!navigable)return;
  if(available){
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
function openPlayerToolDebounced(){
  const now=Date.now();
  if(now-playerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  playerToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('player');
}
function openTrainerToolDebounced(){
  const now=Date.now();
  if(now-trainerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  trainerToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('trainer');
  if(pendingTrainerStartMode&&trainerToolActive&&trainerToolFrameStarted){
    postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:pendingTrainerStartMode});
    pendingTrainerStartMode='';
  }
}
function openMateSchoolToolDebounced(){
  const now=Date.now();
  if(now-mateSchoolToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  mateSchoolToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('mate-school');
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
function openReaderToolDebounced(){
  const now=Date.now();
  if(now-readerToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  readerToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('reader');
}
function openTournamentReportToolDebounced(){
  const now=Date.now();
  if(now-tournamentReportToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  tournamentReportToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('tournament-report');
}
function openTvToolDebounced(){
  const now=Date.now();
  if(now-tvToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  tvToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('tv');
}
function openLeagueStandingsToolDebounced(){
  const now=Date.now();
  if(now-leagueStandingsToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  leagueStandingsToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('league-standings');
}
if(learningToolBtn)learningToolBtn.addEventListener('click',openLearningToolDebounced);
if(analyzerToolBtn)analyzerToolBtn.addEventListener('click',openAnalyzerToolDebounced);
if(playerToolBtn)playerToolBtn.addEventListener('click',openPlayerToolDebounced);
if(trainerToolBtn)trainerToolBtn.addEventListener('click',()=>{
  if(!(onlineAuthToken&&onlineAuthUser)){
    pendingTrainerStartMode='coach';
    try{sessionStorage.setItem('hammerschachTrainerRequestedMode','coach');}catch(_){ }
  }
  openTrainerToolDebounced();
});
if(mateSchoolToolBtn)mateSchoolToolBtn.addEventListener('click',openMateSchoolToolDebounced);
if(trainerBeginnerHeaderBtn)trainerBeginnerHeaderBtn.addEventListener('click',()=>postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:'coach'}));
if(trainerFreeHeaderBtn)trainerFreeHeaderBtn.addEventListener('click',()=>postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:'free'}));
if(trainerProgressHeaderBtn)trainerProgressHeaderBtn.addEventListener('click',()=>postTrainerToolMessage({type:'hammerschach-trainer-open-progress'}));
if(trainerMattbilderHeaderBtn)trainerMattbilderHeaderBtn.addEventListener('click',openMateSchoolToolDebounced);
if(schachlaborToolBtn)schachlaborToolBtn.addEventListener('click',openSchachlaborToolDebounced);
if(openingsToolBtn)openingsToolBtn.addEventListener('click',openOpeningsToolDebounced);
if(readerToolBtn)readerToolBtn.addEventListener('click',openReaderToolDebounced);
if(tournamentReportToolBtn)tournamentReportToolBtn.addEventListener('click',openTournamentReportToolDebounced);
if(tournamentReportUnnaBtn)tournamentReportUnnaBtn.addEventListener('click',()=>selectTournamentReport('unna-open-2025'));
if(tournamentReportQuickBtn)tournamentReportQuickBtn.addEventListener('click',()=>selectTournamentReport('quick-round-robin-2026'));
if(tvToolBtn)tvToolBtn.addEventListener('click',openTvToolDebounced);
if(leagueStandingsToolBtn)leagueStandingsToolBtn.addEventListener('click',openLeagueStandingsToolDebounced);
if(learningToolFrame)learningToolFrame.addEventListener('load',()=>{
  postLearningToolContext();
  postLearningToolMessage({type:'hammerschach-learning-visibility',visible:learningToolActive});
});
if(analyzerToolFrame)analyzerToolFrame.addEventListener('load',()=>{
  postAnalyzerToolContext();
  postAnalyzerToolMessage({type:'hammerschach-analyzer-visibility',visible:analyzerToolActive});
});
if(playerToolFrame)playerToolFrame.addEventListener('load',()=>{
  postPlayerToolContext();
  postPlayerToolMessage({type:'hammerschach-player-visibility',visible:playerToolActive});
});
if(trainerToolFrame)trainerToolFrame.addEventListener('load',()=>{
  postTrainerToolContext();
  postTrainerToolMessage({type:'hammerschach-trainer-visibility',visible:trainerToolActive});
  if(pendingTrainerStartMode){
    postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:pendingTrainerStartMode});
    pendingTrainerStartMode='';
  }
});
if(mateSchoolToolFrame)mateSchoolToolFrame.addEventListener('load',()=>{
  postMateSchoolToolContext();
  postMateSchoolToolMessage({type:'hammerschach-mate-school-visibility',visible:mateSchoolToolActive});
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
if(readerToolFrame)readerToolFrame.addEventListener('load',()=>{
  postReaderToolContext();
  postReaderToolMessage({type:'hammerschach-reader-visibility',visible:readerToolActive});
});
if(tournamentReportToolFrame)tournamentReportToolFrame.addEventListener('load',()=>{
  postTournamentReportToolContext();
  postTournamentReportToolMessage({type:'hammerschach-tournament-report-visibility',visible:tournamentReportToolActive});
});
[newGameBtn,createOnlineBtn,newGameMenuBtn,gamesMenuBtn,membersOpenBtn,profileOpenBtn,privateMessagesOpenBtn,dailyGamesOpenBtn,openOffersOpenBtn,tournamentsOpenBtn,publicGamesOpenBtn,gameArchiveOpenBtn,authOpenBtn,firstStepsOpenBtn,infoGuideOpenBtn,leitbildOpenBtn].forEach(button=>{
  if(button)button.addEventListener('click',closeEmbeddedTools,{capture:true});
});
window.addEventListener('message',async event=>{
  const fromLearning=!!(learningToolFrame&&event.source===learningToolFrame.contentWindow);
  const fromAnalyzer=!!(analyzerToolFrame&&event.source===analyzerToolFrame.contentWindow);
  const fromPlayer=!!(playerToolFrame&&event.source===playerToolFrame.contentWindow);
  const fromTrainer=!!(trainerToolFrame&&event.source===trainerToolFrame.contentWindow);
  const fromMateSchool=!!(mateSchoolToolFrame&&event.source===mateSchoolToolFrame.contentWindow);
  const fromSchachlabor=!!(schachlaborToolFrame&&event.source===schachlaborToolFrame.contentWindow);
  const fromOpenings=!!(openingsToolFrame&&event.source===openingsToolFrame.contentWindow);
  const fromFairplay=!!(fairplayToolFrame&&event.source===fairplayToolFrame.contentWindow);
  const fromReader=!!(readerToolFrame&&event.source===readerToolFrame.contentWindow);
  const fromTournamentReport=!!(tournamentReportToolFrame&&event.source===tournamentReportToolFrame.contentWindow);
  if(!fromLearning&&!fromAnalyzer&&!fromPlayer&&!fromTrainer&&!fromMateSchool&&!fromSchachlabor&&!fromOpenings&&!fromFairplay&&!fromReader&&!fromTournamentReport)return;
  if(embeddedToolTargetOrigin()!=='*'&&event.origin!==embeddedToolTargetOrigin())return;
  const message=event.data&&typeof event.data==='object'?event.data:{};
  if(fromPlayer){
    if(message.type==='hammerschach-player-ready'){
      postPlayerToolContext();postPlayerToolMessage({type:'hammerschach-player-visibility',visible:playerToolActive});return;
    }
    if(message.type==='hammerschach-player-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){playerToolFrame.style.height=Math.max(720,Math.min(3600,requested+4))+'px';hammerschachScheduleHeightReport(true);}
      return;
    }
    return;
  }
  if(fromTournamentReport){
    if(message.type==='hammerschach-tournament-report-return'){
      closeEmbeddedTools();
      requestAnimationFrame(()=>{
        window.scrollTo({top:0,left:0,behavior:'auto'});
        if(authOpenBtn&&!authOpenBtn.hidden){
          try{authOpenBtn.focus({preventScroll:true});}catch(_){authOpenBtn.focus();}
        }
      });
    }
    return;
  }
  if(fromMateSchool){
    if(message.type==='hammerschach-mate-school-ready'){
      postMateSchoolToolContext();
      postMateSchoolToolMessage({type:'hammerschach-mate-school-visibility',visible:mateSchoolToolActive});
      return;
    }
    if(message.type==='hammerschach-mate-school-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        mateSchoolToolFrame.style.height=Math.max(720,Math.min(4200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    return;
  }
  if(fromReader){
    const requestId=String(message.requestId||'');
    if(message.type==='hammerschach-reader-ready'){
      postReaderToolContext();
      postReaderToolMessage({type:'hammerschach-reader-visibility',visible:readerToolActive});
      return;
    }
    if(message.type==='hammerschach-reader-height'){
      const requested=Math.ceil(Number(message.height||0));
      if(Number.isFinite(requested)&&requested>0){
        readerToolFrame.style.height=Math.max(720,Math.min(5200,requested+4))+'px';
        hammerschachScheduleHeightReport(true);
      }
      return;
    }
    if(message.type==='hammerschach-reader-request-archives'){
      try{
        const data=await authApi('/api/reader/archives');
        postReaderToolMessage({type:'hammerschach-reader-archives-result',requestId,ok:true,archives:Array.isArray(data.archives)?data.archives:[],max:Number(data.max||15)});
      }catch(err){
        postReaderToolMessage({type:'hammerschach-reader-archives-result',requestId,ok:false,message:err&&err.message?err.message:'Die Partienarchive konnten nicht geladen werden.',archives:[]});
      }
      return;
    }
    if(message.type==='hammerschach-reader-request-admin-config'){
      if(!onlineAuthToken||!onlineAuthUser||onlineAuthUser.isAdmin!==true){
        postReaderToolMessage({type:'hammerschach-reader-admin-config-result',requestId,ok:false,message:'Diese Konfiguration ist ausschließlich für den Administrator verfügbar.'});
        return;
      }
      try{
        const data=await authApi('/api/admin/reader-archives');
        postReaderToolMessage({type:'hammerschach-reader-admin-config-result',requestId,ok:true,archives:Array.isArray(data.archives)?data.archives:[],max:Number(data.max||15)});
      }catch(err){
        postReaderToolMessage({type:'hammerschach-reader-admin-config-result',requestId,ok:false,message:err&&err.message?err.message:'Die Archivkonfiguration konnte nicht geladen werden.'});
      }
      return;
    }
    if(message.type==='hammerschach-reader-save-admin-config'){
      if(!onlineAuthToken||!onlineAuthUser||onlineAuthUser.isAdmin!==true){
        postReaderToolMessage({type:'hammerschach-reader-admin-save-result',requestId,ok:false,message:'Diese Konfiguration ist ausschließlich für den Administrator verfügbar.'});
        return;
      }
      try{
        const data=await authApi('/api/admin/reader-archives',{method:'POST',body:JSON.stringify({archives:Array.isArray(message.archives)?message.archives:[]})});
        postReaderToolMessage({type:'hammerschach-reader-admin-save-result',requestId,ok:true,archives:Array.isArray(data.archives)?data.archives:[],max:Number(data.max||15),message:data.message||'Die Archivkonfiguration wurde gespeichert.'});
      }catch(err){
        postReaderToolMessage({type:'hammerschach-reader-admin-save-result',requestId,ok:false,message:err&&err.message?err.message:'Die Archivkonfiguration konnte nicht gespeichert werden.'});
      }
      return;
    }
    return;
  }
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
    if(message.type==='hammerschach-learning-open-trainer'){
      pendingTrainerStartMode=message.mode==='free'?'free':'coach';
      try{sessionStorage.setItem('hammerschachTrainerRequestedMode',pendingTrainerStartMode);}catch(_){ }
      setTrainerToolActive(true);
      postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:pendingTrainerStartMode});
      if(trainerToolFrameStarted)pendingTrainerStartMode='';
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
    if(message.type==='hammerschach-trainer-ui-state'){
      const visitor=!(onlineAuthToken&&onlineAuthUser);
      const reportedMode=message.mode==='free'?'free':'coach';
      trainerHeaderState={
        mode:visitor?'coach':reportedMode,detailsOpen:visitor&&reportedMode==='free'?false:!!message.detailsOpen,
        solved:Math.max(0,Number(message.solved)||0),total:Math.max(1,Number(message.total)||65),
        stage:Math.max(1,Number(message.stage)||1),stageTotal:Math.max(1,Number(message.stageTotal)||6),
        stageTitle:String(message.stageTitle||'Anfängertraining')
      };
      if(visitor&&reportedMode==='free')postTrainerToolMessage({type:'hammerschach-trainer-open-mode',mode:'coach'});
      updateTrainerHeaderActions();
      if(trainerToolActive&&statusEl){
        statusEl.textContent=trainerHeaderState.mode==='free'
          ? 'Freies Training – Aufgaben und Schwierigkeitsgrad selbst wählen'
          : 'Block '+trainerHeaderState.stage+'/'+trainerHeaderState.stageTotal+' · '+trainerHeaderState.stageTitle+' · '+trainerHeaderState.solved+'/'+trainerHeaderState.total+' gemeistert';
      }
      return;
    }
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
