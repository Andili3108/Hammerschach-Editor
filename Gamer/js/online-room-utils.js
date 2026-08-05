'use strict';

function cleanRoomId(value){
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}
function cleanPublicWatchId(value){
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,96}$/.test(token) ? token : '';
}
function createRoomId(){ return randomToken(10); }
function roleLabel(role){
  if(role === 'w') return 'Weiß';
  if(role === 'b') return 'Schwarz';
  if(role === 'spectator') return 'Zuschauer';
  return '—';
}
function applyOnlineOrientationForRole(role){
  if(role !== 'w' && role !== 'b') return false;
  if(onlineOrientationRoleApplied === role) return false;
  orientationWhite = role !== 'b';
  onlineOrientationRoleApplied = role;
  selected = null;
  return true;
}
function sameTimeControl(a,b){
  return !!(a && b && a.key === b.key && String(a.category || '') === String(b.category || '') && String(a.mode || 'live') === String(b.mode || 'live'));
}
function seatStorageKey(roomId){
  return ONLINE_SEAT_STORAGE_PREFIX + cleanRoomId(roomId || '');
}
function loadSeatCredentials(roomId){
  if(!roomId) return {role:'', token:''};
  try{
    const raw = sessionStorage.getItem(seatStorageKey(roomId));
    const data = raw ? JSON.parse(raw) : null;
    const role = data && (data.role === 'w' || data.role === 'b') ? data.role : '';
    const token = data && typeof data.token === 'string' ? data.token : '';
    return {role, token};
  } catch(_){ return {role:'', token:''}; }
}
function saveSeatCredentials(roomId, role, token){
  if(!roomId || (role !== 'w' && role !== 'b') || !token) return;
  try{ sessionStorage.setItem(seatStorageKey(roomId), JSON.stringify({role, token})); } catch(_){}
}
function clearSeatCredentials(roomId){
  if(!roomId) return;
  try{ sessionStorage.removeItem(seatStorageKey(roomId)); } catch(_){}
}
function sendSeatClaim(){
  if(!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN || onlineSeatClaimSent || !onlineRoomId) return false;
  const saved = onlineSpectatorOnly ? {role:'', token:''} : loadSeatCredentials(onlineRoomId);
  const preferredRole = onlineSpectatorOnly ? '' : (saved.role || onlinePreferredRoleForNextConnect || '');
  const displayName = onlineSpectatorOnly
    ? 'Zuschauer'
    : (onlineAuthUser ? (onlineDisplayName || defaultGuestName()) : displayNameForOnline(onlineDisplayName || defaultGuestName(), true));
  try{
    onlineSocket.send(JSON.stringify({
      type:'claim_seat',
      player:onlinePlayerId,
      displayName,
      preferredRole,
      seatToken:saved.token || '',
      authToken:onlineAuthToken || '',
      spectatorOnly:!!onlineSpectatorOnly,
      publicWatchId:onlinePublicWatchId || '',
      publicGame:!!onlineDesiredPublicGameForNewRoom,
      openOffer:!!onlineDesiredOpenOfferForNewRoom,
      ratedRequested:!!ratingPreference
    }));
    onlineSeatClaimSent = true;
    onlineConnectionState = 'authenticating';
    onlineLastMessage = onlineSpectatorOnly ? 'Zuschauerzugang wird bestätigt.' : 'Spielerplatz wird sicher bestätigt.';
    updateOnlineUi();
    return true;
  } catch(_){ return false; }
}
function updateInviteUrlInAddressBar(roomId){
  roomId = cleanRoomId(roomId);
  if(!roomId) return;
  try{
    sessionStorage.setItem(ONLINE_LAST_ROOM_STORAGE_KEY, roomId);
  } catch(_){}
  try{
    const url = new URL(window.location.href);
    url.searchParams.delete('fresh');
    if(onlineSpectatorOnly && onlinePublicWatchId){
      url.searchParams.delete('room');
      url.searchParams.set('watch', onlinePublicWatchId);
    } else {
      url.searchParams.set('room', roomId);
      url.searchParams.delete('watch');
    }
    history.replaceState(null, '', url.toString());
  } catch(_){}
}
function getRememberedRoomForReload(){
  try{
    const navigation = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const isReload = navigation ? navigation.type === 'reload' : (performance.navigation && performance.navigation.type === 1);
    if(!isReload) return '';
    return cleanRoomId(sessionStorage.getItem(ONLINE_LAST_ROOM_STORAGE_KEY) || '');
  } catch(_){ return ''; }
}
function buildPublicGamerUrl(parameters){
  try{
    const url = new URL(HAMMERSCHACH_PUBLIC_PAGE_URL);
    url.hash = '';
    url.search = '';
    Object.entries(parameters || {}).forEach(([key, value]) => {
      const text = String(value || '').trim();
      if(text) url.searchParams.set(key, text);
    });
    return url.toString();
  } catch(_){
    return window.location.href;
  }
}
function getInviteUrl(){
  const roomId = cleanRoomId(onlineRoomId || '');
  return buildPublicGamerUrl(roomId ? {room:roomId} : {});
}
function getSpectatorUrl(watchId){
  const token = cleanPublicWatchId(watchId || onlinePublicWatchId || '');
  return buildPublicGamerUrl(token ? {watch:token} : {});
}
function getWebSocketUrl(roomId){
  const configured = (window.HAMMERSCHACH_ONLINE_WORKER_URL || ONLINE_WORKER_URL || '').trim();
  let url;
  const path = onlineSpectatorOnly && onlinePublicWatchId ? '/watch' : '/ws';
  if(configured){
    url = new URL(path, configured.endsWith('/') ? configured : configured + '/');
  } else {
    if(window.location.protocol !== 'http:' && window.location.protocol !== 'https:'){
      throw new Error('Kein Online-Server konfiguriert. HTML über http(s) laden oder ONLINE_WORKER_URL setzen.');
    }
    url = new URL(path, window.location.origin);
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if(path === '/watch') url.searchParams.set('game', onlinePublicWatchId);
  else url.searchParams.set('room', roomId);
  return url.toString();
}
