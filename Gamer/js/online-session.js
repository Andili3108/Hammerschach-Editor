'use strict';

const RATING_TYPE_ORDER = [
  {key:'daily_classic', label:'Daily Classic'},
  {key:'daily_freestyle', label:'Daily Freestyle'},
  {key:'live_classic', label:'Live Classic'},
  {key:'live_rapid', label:'Live Rapid'},
  {key:'live_blitz', label:'Live Blitz'},
  {key:'live_freestyle', label:'Live Freestyle'}
];
const RATING_PROVISIONAL_DEVIATION = 110;


/* Online-Schach: Räume, Einladungslink, Rollen, Bedenkzeit, Partiestart und Zugsynchronisierung.

   Konfiguration:
   - Wenn diese HTML direkt vom Lobby-Worker ausgeliefert wird, leer lassen.
   - Wenn die HTML auf Pages/anderer Domain liegt, hier die Worker-URL eintragen,
     z. B. 'https://hammerschach-gamer-lobby.DEIN-ACCOUNT.workers.dev'.
*/
const ONLINE_WORKER_URL = 'https://hammerschach-hammerschach-lobby-worker.webmaster-5bb.workers.dev';
const HAMMERSCHACH_PUBLIC_PAGE_URL = 'https://hammerschach-gamer.webmaster-5bb.workers.dev/';
const ONLINE_PLAYER_STORAGE_KEY = 'hammerschachGamerOnlinePlayerId';
const ONLINE_PLAYER_NAME_STORAGE_KEY = 'hammerschachGamerOnlineDisplayName';
const ONLINE_PLAYER_NAME_CONFIRMED_KEY = 'hammerschachGamerOnlineDisplayNameConfirmed';
const ONLINE_AUTH_TOKEN_STORAGE_KEY = 'hammerschachGamerAuthToken';
const ONLINE_AUTH_USER_STORAGE_KEY = 'hammerschachGamerAuthUser';
const TOURNAMENT_DRAFT_STORAGE_KEY = 'hammerschachTournamentLocalDraftV1';
const TOURNAMENT_LIST_STORAGE_KEY = 'hammerschachTournamentLocalListV2';
const ONLINE_INVITE_COLOR_STORAGE_KEY = 'hammerschachGamerInviteColorPreference';
const ONLINE_SEAT_STORAGE_PREFIX = 'hammerschachGamerSeat:';
const ONLINE_LAST_ROOM_STORAGE_KEY = 'hammerschachGamerLastActiveRoom';
const ONLINE_PUBLIC_GAME_STORAGE_KEY = 'hammerschachGamerPublicGamePreference';
let inviteColorPreference = 'w';
let publicGamePreference = false;
let ratingPreference = true;
try{ inviteColorPreference = normalizeInviteColorPreference(localStorage.getItem(ONLINE_INVITE_COLOR_STORAGE_KEY) || 'w'); } catch(_){ inviteColorPreference = 'w'; }
try{ publicGamePreference = localStorage.getItem(ONLINE_PUBLIC_GAME_STORAGE_KEY) === 'yes'; } catch(_){ publicGamePreference = false; }
let onlinePreferredRoleForNextConnect = '';
let onlineCanSetTimeControl = false;
let onlineSocket = null;
let onlineReconnectTimer = null;
let onlineRoomId = null;
let onlineRoleCode = 'local';
let onlineConnected = false;
let onlineConnectionState = 'local';
let onlinePlayers = emptyOnlinePlayers();
let onlineAssignedSeats = {white:false, black:false};
let onlineLastMessage = 'Keine Online-Partie aktiv.';
let onlineGameStarted = false;
let onlineGameStartedAt = null;
let onlineGameEnded = false;
let onlineGameResult = '*';
let onlineGameEndReason = null;
let onlineGameWinner = null;
let onlineDrawOffer = null;
let onlineRoomTimeControl = null;
let onlineRoomGameSetup = null;
let onlineDesiredGameSetupForNewRoom = null;
let onlinePendingGameSetupMessageId = null;
let onlineAutoSyncedInitialSetup = false;
let applyingRemoteGameSetup = false;
let applyingRemoteTimeControl = false;
let onlineAutoSyncedInitialTime = false;
let onlineOrientationRoleApplied = null;
let onlinePendingTimeControlMessageId = null;
let onlinePendingStartMessageId = null;
let onlineStatePollTimer = null;
const ONLINE_HEARTBEAT_INTERVAL_MS = 15000;
const ONLINE_HEARTBEAT_TIMEOUT_MS = 45000;
const ONLINE_WAITING_STATE_SYNC_MS = 45000;
const ONLINE_DAILY_STATE_SYNC_MS = 120000;
let onlineLastPongAt = 0;
let onlineLastFullSyncAt = 0;
let onlineLastPingSentAt = 0;
let onlineRoundTripMs = null;
let applyingRemoteMove = false;
let onlineLastMoveMessageId = null;
let onlineClockSync = null;
let onlineSeatClaimSent = false;
let onlineReconnectSuppressed = false;
let onlineRoomCreationPromise = null;
let onlineDailyLoginPrompted = false;
let onlineRoomCancelled = false;
let onlinePublicGame = false;
let onlineCreatedByMe = false;
let onlineDesiredPublicGameForNewRoom = false;
let onlineDesiredOpenOfferForNewRoom = false;
let onlineOpenOffer = false;
let onlineOpenOfferStatus = 'none';
let onlinePendingPublicGameMessageId = null;
let onlineSpectatorOnly = false;
let onlinePublicWatchId = '';
let onlineRatingState = null;
let onlineRatedRequested = true;
let onlineHeadToHead = null;
let onlineRematchState = null;
let rematchActionBusy = false;
let rematchAutoOpenWhenReady = false;
let rematchLastError = '';
const onlineMoveTimings = new Map();
const onlinePerformanceState = {
  roundTripMs:null,
  moveAckMs:null,
  serverMoveMs:null,
  remoteRenderMs:null,
  updatedAt:null
};
function recordOnlinePerformance(name,value){
  const numeric = Number(value);
  if(!Number.isFinite(numeric) || numeric < 0) return;
  onlinePerformanceState[name] = Math.round(numeric * 10) / 10;
  onlinePerformanceState.updatedAt = new Date().toISOString();
}
window.getHammerschachPerformance = function(){
  return Object.assign({}, onlinePerformanceState, {
    connected:!!onlineConnected,
    room:onlineRoomId || '',
    historyLength:masterHistory.length
  });
};


function randomToken(len){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
function getOnlinePlayerId(){
  try{
    let id = sessionStorage.getItem(ONLINE_PLAYER_STORAGE_KEY);
    if(!id){
      id = (crypto.randomUUID ? crypto.randomUUID() : 'p_' + randomToken(18));
      sessionStorage.setItem(ONLINE_PLAYER_STORAGE_KEY, id);
    }
    return id;
  } catch(_){
    return 'p_' + randomToken(18);
  }
}
let onlinePlayerId = getOnlinePlayerId();
let onlineAuthToken = '';
let onlineAuthUser = null;
let leitbildAutomaticOpen = false;
let leitbildOpenedForUserId = '';
let leitbildAcknowledgeBusy = false;
let authMode = 'login';
const PRESENCE_HEARTBEAT_MS = 60000;
const PRESENCE_MIN_SEND_INTERVAL_MS = 25000;
let presenceHeartbeatTimer = null;
let presenceLastSentAt = 0;

function stopPresenceHeartbeat(){
  if(presenceHeartbeatTimer){ clearInterval(presenceHeartbeatTimer); presenceHeartbeatTimer = null; }
}
async function sendPresenceHeartbeat(force, online){
  const active = online !== false;
  if(!onlineAuthToken || !onlineAuthUser) return false;
  const now = Date.now();
  if(active && !force && now - presenceLastSentAt < PRESENCE_MIN_SEND_INTERVAL_MS) return false;
  try{
    await authApi('/api/presence', {method:'POST', body:JSON.stringify({online:active})});
    if(active) presenceLastSentAt = now;
    return true;
  } catch(_){ return false; }
}
function startPresenceHeartbeat(){
  stopPresenceHeartbeat();
  if(!onlineAuthToken || !onlineAuthUser) return;
  sendPresenceHeartbeat(true, true);
  presenceHeartbeatTimer = setInterval(() => sendPresenceHeartbeat(false, true), PRESENCE_HEARTBEAT_MS);
}
window.addEventListener('focus', () => sendPresenceHeartbeat(true, true));
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible'){
    sendPresenceHeartbeat(true, true);
    requestOnlineState();
  }
});
function cleanDisplayName(value){
  return String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}
function defaultGuestName(){
  return 'Gast';
}
function isGeneratedGuestName(name){
  return /^Gast-[A-Z0-9]{2,}$/i.test(String(name || '').trim());
}
function displayNameForOnline(name, isGuest){
  const cleaned = cleanDisplayName(name);
  if(!cleaned) return isGuest ? defaultGuestName() : '';
  if(!isGuest) return cleaned;
  if(cleaned === 'Gast' || isGeneratedGuestName(cleaned) || /\(Gast\)$/i.test(cleaned)) return cleaned;
  return cleanDisplayName(cleaned + ' (Gast)') || cleaned;
}
function getStoredDisplayName(){
  try{
    const saved = cleanDisplayName(localStorage.getItem(ONLINE_PLAYER_NAME_STORAGE_KEY));
    if(saved) return isGeneratedGuestName(saved) ? defaultGuestName() : saved;
  } catch(_){}
  return defaultGuestName();
}
function hasConfirmedDisplayName(){
  try{ return localStorage.getItem(ONLINE_PLAYER_NAME_CONFIRMED_KEY) === 'yes'; } catch(_){ return false; }
}
let onlineDisplayName = getStoredDisplayName();
function saveDisplayName(name, confirmed){
  const cleaned = cleanDisplayName(name) || defaultGuestName();
  onlineDisplayName = cleaned;
  try{
    localStorage.setItem(ONLINE_PLAYER_NAME_STORAGE_KEY, cleaned);
    if(confirmed) localStorage.setItem(ONLINE_PLAYER_NAME_CONFIRMED_KEY, 'yes');
  } catch(_){}
  updatePlayerNameButton();
  if(onlineRoomId && onlineConnected) sendOnlineMessage({type:'set_player_name', displayName: cleaned});
  return cleaned;
}
function updatePlayerNameButton(){
  /* Die frühere Header-Schaltfläche „Gastname ändern“ wurde bewusst entfernt.
     Gäste bestätigen ihren Namen nur noch beim Erstellen/Beitreten einer Online-Partie. */
}
function emptyOnlinePlayers(){
  return {
    white:{connected:false, gamerOnline:false, name:'', guest:true},
    black:{connected:false, gamerOnline:false, name:'', guest:true},
    spectators:0
  };
}
function normalizeOnlinePlayerSlot(slot){
  if(!slot) return {connected:false, gamerOnline:false, name:'', guest:true};
  if(typeof slot === 'boolean') return {connected:slot, gamerOnline:false, name:'', guest:true};
  return {
    connected: !!(slot.connected),
    gamerOnline: !!(slot.gamerOnline ?? slot.gamer_online ?? slot.isOnline ?? slot.is_online),
    name: cleanDisplayName(slot.name || slot.displayName || slot.username || ''),
    guest: slot.guest !== false,
    playerId: slot.playerId || slot.id || null
  };
}
function normalizeOnlinePlayers(players){
  return {
    white: normalizeOnlinePlayerSlot(players && players.white),
    black: normalizeOnlinePlayerSlot(players && players.black),
    spectators: Number(players && players.spectators || 0)
  };
}
function isOnlineSideConnected(role){
  const key = role === 'w' ? 'white' : role === 'b' ? 'black' : '';
  return !!(key && onlinePlayers[key] && onlinePlayers[key].connected);
}
function onlineSideName(role){
  const key = role === 'w' ? 'white' : role === 'b' ? 'black' : '';
  const fallback = role === 'w' ? 'Weiß' : role === 'b' ? 'Schwarz' : 'Spieler';
  const slot = key ? onlinePlayers[key] : null;
  return slot && slot.name ? displayNameForOnline(slot.name, slot.guest !== false) : fallback;
}
function onlineSideText(role){
  const side = role === 'w' ? 'Weiß' : 'Schwarz';
  const name = onlineSideName(role);
  if(role === onlineRoleCode) return name + ' (Du)';
  if(name && name !== side) return name;
  return 'Warte auf ' + side;
}
function setPlayerPresenceBadge(role, element){
  if(!element) return;
  const gameIsRunning = !!(onlineRoomId && onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
  const assigned = role === 'w' ? onlineAssignedSeats.white : onlineAssignedSeats.black;
  if(!gameIsRunning || !assigned){
    element.hidden = true;
    return;
  }

  const key = role === 'w' ? 'white' : 'black';
  const slot = onlinePlayers[key] || {};
  const daily = isDailyTimeControl();
  const connectedToRoom = !!slot.connected;
  const activeInGamer = !!slot.gamerOnline || connectedToRoom || (role === onlineRoleCode && onlineConnected);
  const isOnline = daily ? activeInGamer : connectedToRoom;
  const label = element.querySelector('.player-presence-label');

  element.hidden = false;
  element.classList.toggle('online', isOnline);
  if(label) label.textContent = isOnline ? 'Online' : 'Offline';
  if(daily){
    element.title = isOnline
      ? 'Innerhalb der letzten rund zweieinhalb Minuten im Hammerschach-Gamer aktiv – nicht zwingend in dieser Partie.'
      : 'Derzeit keine aktuelle Aktivität im Hammerschach-Gamer erkannt.';
  } else {
    element.title = isOnline
      ? 'Gerade mit diesem Spielraum verbunden.'
      : 'Derzeit nicht mit diesem Spielraum verbunden.';
  }
  element.setAttribute('aria-label', (role === 'w' ? 'Weiß' : 'Schwarz') + ': ' + (isOnline ? 'online' : 'offline'));
}
function updatePlayerPresenceBadges(){
  setPlayerPresenceBadge('w', whitePlayerPresenceEl);
  setPlayerPresenceBadge('b', blackPlayerPresenceEl);
}
let playerNameDialogResolve = null;
function closePlayerNameDialog(result){
  if(playerNameBackdrop) playerNameBackdrop.hidden = true;
  if(playerNameDialogResolve){
    const resolve = playerNameDialogResolve;
    playerNameDialogResolve = null;
    resolve(!!result);
  }
}
function showPlayerNameDialog(){
  if(!playerNameBackdrop || !playerNameInput) return Promise.resolve(false);
  const current = cleanDisplayName(onlineDisplayName);
  playerNameInput.value = current && current !== defaultGuestName() ? current.replace(/\s*\(Gast\)$/i, '') : '';
  if(playerNameError) playerNameError.textContent = '';
  playerNameBackdrop.hidden = false;
  setTimeout(() => { try{ playerNameInput.focus(); playerNameInput.select(); } catch(_){} }, 0);
  return new Promise(resolve => { playerNameDialogResolve = resolve; });
}
function submitPlayerNameFromDialog(confirmName){
  const typed = cleanDisplayName(playerNameInput ? playerNameInput.value : '');
  if(confirmName && typed.length < 2){
    if(playerNameError) playerNameError.textContent = 'Bitte mindestens 2 Zeichen eingeben oder „Als Gast spielen“ wählen.';
    return;
  }
  saveDisplayName(confirmName ? displayNameForOnline(typed, true) : defaultGuestName(), true);
  closePlayerNameDialog(true);
}
async function ensureDisplayNameForOnline(){
  if(onlineAuthUser){
    onlineDisplayName = cleanDisplayName(onlineAuthUser.username) || onlineDisplayName || defaultGuestName();
    updatePlayerNameButton();
    return true;
  }
  if(hasConfirmedDisplayName()){
    onlineDisplayName = displayNameForOnline(onlineDisplayName || defaultGuestName(), true);
    return true;
  }
  return await showPlayerNameDialog();
}
if(editPlayerNameBtn) editPlayerNameBtn.addEventListener('click', () => showPlayerNameDialog());
if(playerNameCancelBtn) playerNameCancelBtn.addEventListener('click', () => closePlayerNameDialog(false));
if(playerNameGuestBtn) playerNameGuestBtn.addEventListener('click', () => submitPlayerNameFromDialog(false));
if(playerNameSaveBtn) playerNameSaveBtn.addEventListener('click', () => submitPlayerNameFromDialog(true));
if(playerNameInput){
  playerNameInput.addEventListener('keydown', ev => {
    if(ev.key === 'Enter') submitPlayerNameFromDialog(true);
    if(ev.key === 'Escape') closePlayerNameDialog(false);
  });
}
updatePlayerNameButton();
function onlineApiBaseUrl(){
  const configured = (window.HAMMERSCHACH_ONLINE_WORKER_URL || ONLINE_WORKER_URL || '').trim();
  if(configured) return configured.replace(/\/+$/, '');
  return window.location.origin;
}
function formatStatsNumber(value){
  const number = Number(value || 0);
  if(!Number.isFinite(number)) return '0';
  try{ return Math.max(0, Math.floor(number)).toLocaleString('de-DE'); } catch(_){ return String(Math.max(0, Math.floor(number))); }
}
function renderSiteStats(stats){
  if(!siteStatsEl || !stats) return;
  const visits = formatStatsNumber(stats.visits ?? stats.pageViews ?? stats.page_views ?? 0);
  const games = formatStatsNumber(stats.gamesPlayed ?? stats.games_played ?? 0);
  siteStatsEl.textContent = 'Gamer-Aufrufe: ' + visits + ' · Gespielte Online-Partien: ' + games;
  siteStatsEl.hidden = false;
}
async function refreshSiteStats(countVisit){
  if(!siteStatsEl) return;
  try{
    const response = await fetch(onlineApiBaseUrl() + (countVisit ? '/api/stats/visit' : '/api/stats'), {method: countVisit ? 'POST' : 'GET'});
    const data = await response.json();
    if(response.ok && data && data.ok) renderSiteStats(data.stats || data);
  } catch(_){
    /* Statistik bleibt ausgeblendet, wenn der Worker/D1 gerade nicht erreichbar ist. */
  }
}
function loadAuthState(){
  try{
    onlineAuthToken = localStorage.getItem(ONLINE_AUTH_TOKEN_STORAGE_KEY) || '';
    const raw = localStorage.getItem(ONLINE_AUTH_USER_STORAGE_KEY);
    onlineAuthUser = raw ? JSON.parse(raw) : null;
  } catch(_){ onlineAuthToken = ''; onlineAuthUser = null; }
  if(onlineAuthUser && onlineAuthUser.id){
    onlinePlayerId = 'u_' + String(onlineAuthUser.id);
    onlineDisplayName = cleanDisplayName(onlineAuthUser.username) || onlineDisplayName;
  }
  updatePlayerNameButton();
  if(onlineAuthToken && onlineAuthUser){
    startPresenceHeartbeat();
    startLiveTournamentPolling();
  }
}
function saveAuthState(token, user){
  const previousUserId = onlineAuthUser && onlineAuthUser.id ? String(onlineAuthUser.id) : '';
  onlineAuthToken = token || '';
  onlineAuthUser = user || null;
  const nextUserId = onlineAuthUser && onlineAuthUser.id ? String(onlineAuthUser.id) : '';
  if(previousUserId !== nextUserId){
    leitbildOpenedForUserId = '';
    leitbildAutomaticOpen = false;
  }
  if(previousUserId && previousUserId !== nextUserId) clearAvatarObjectUrlCache();
  try{
    if(onlineAuthToken && onlineAuthUser){
      localStorage.setItem(ONLINE_AUTH_TOKEN_STORAGE_KEY, onlineAuthToken);
      localStorage.setItem(ONLINE_AUTH_USER_STORAGE_KEY, JSON.stringify(onlineAuthUser));
    } else {
      localStorage.removeItem(ONLINE_AUTH_TOKEN_STORAGE_KEY);
      localStorage.removeItem(ONLINE_AUTH_USER_STORAGE_KEY);
    }
  } catch(_){}
  if(onlineAuthUser && onlineAuthUser.id){
    onlinePlayerId = 'u_' + String(onlineAuthUser.id);
    onlineDisplayName = cleanDisplayName(onlineAuthUser.username) || onlineDisplayName || defaultGuestName();
    updatePlayerNameButton();
  } else {
    onlinePlayerId = getOnlinePlayerId();
    onlineDisplayName = getStoredDisplayName();
    updatePlayerNameButton();
  }
  updateAuthUi();
  updateOnlineUi();
  if(onlineAuthToken && onlineAuthUser){
    loadDailyGames({silent:true}).catch(() => {});
    setTimeout(() => {
      try{ maybeOpenDailyInvitationFromAddress(); } catch(_){ }
    }, 80);
    loadLobbyTicker().catch(() => {});
    loadInfoCenter().catch(() => {});
    loadTournaments().then(() => {
      if(tournamentAddressHandled) return;
      let requested = '';
      try{ requested = String(new URLSearchParams(window.location.search || '').get('tournament') || ''); } catch(_){ }
      if(requested && !hasOnlineTargetInAddress()){ tournamentAddressHandled = true; openTournamentDialog(requested); }
    }).catch(() => {});
  } else {
    tournamentItems = [];
    tournamentAddressHandled = false;
    updateTournamentNotificationUi();
    clearLobbyTicker();
    clearInfoCenter();
  }
  if(onlineAuthToken && onlineAuthUser){
    startPresenceHeartbeat();
    startLiveTournamentPolling();
  } else {
    stopPresenceHeartbeat();
    stopLiveTournamentPolling();
  }
  setTimeout(() => {
    try{ updateTimeControlsLock(); updateTimePickerUi(); } catch(_){}
  }, 0);
  if(inviteBackdrop && !inviteBackdrop.hidden) updateInviteDialog();
  postAnalyzerToolContext();
  postTrainerToolContext();
  postOpeningsToolContext();
  postFairplayToolContext();
  setTimeout(maybeOpenLeitbildAfterLogin, 80);
}
async function authApi(path, options){
  const headers = {'content-type':'application/json'};
  if(onlineAuthToken) headers.authorization = 'Bearer ' + onlineAuthToken;
  const response = await fetch(onlineApiBaseUrl() + path, Object.assign({method:'GET', headers}, options || {}));
  let data = null;
  try{ data = await response.json(); } catch(_){ data = {ok:false, message:'Antwort konnte nicht gelesen werden.'}; }
  if(!response.ok || !data.ok){
    const err = new Error(data.message || 'Anfrage fehlgeschlagen.');
    err.data = data;
    throw err;
  }
  return data;
}
