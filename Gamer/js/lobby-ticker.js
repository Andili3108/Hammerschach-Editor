'use strict';

let lobbyTickerItems = [];
let lobbyTickerIndex = 0;
let lobbyTickerRotationTimer = null;
function lobbyTickerStorageKey(){
  return 'hammerschachLobbyTickerDismissed:' + String(onlineAuthUser && onlineAuthUser.id || 'guest');
}
function lobbyTickerDismissedIds(){
  try{
    const value = JSON.parse(sessionStorage.getItem(lobbyTickerStorageKey()) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch(_){ return new Set(); }
}
function saveLobbyTickerDismissedIds(ids){
  try{ sessionStorage.setItem(lobbyTickerStorageKey(), JSON.stringify(Array.from(ids).slice(-100))); } catch(_){}
}
function stopLobbyTickerRotation(){
  if(lobbyTickerRotationTimer){ clearInterval(lobbyTickerRotationTimer); lobbyTickerRotationTimer = null; }
}
function startLobbyTickerRotation(){
  stopLobbyTickerRotation();
  if(lobbyTickerItems.length > 1){
    lobbyTickerRotationTimer = setInterval(() => showLobbyTickerAt(lobbyTickerIndex + 1), 9000);
  }
}
function clearLobbyTicker(){
  stopLobbyTickerRotation();
  lobbyTickerItems = [];
  lobbyTickerIndex = 0;
  if(lobbyTicker) lobbyTicker.hidden = true;
}
function currentLobbyTickerItem(){ return lobbyTickerItems[lobbyTickerIndex] || null; }
function showLobbyTickerAt(index){
  if(!lobbyTicker || !lobbyTickerItems.length){ clearLobbyTicker(); return; }
  lobbyTickerIndex = (Number(index || 0) + lobbyTickerItems.length) % lobbyTickerItems.length;
  const item = currentLobbyTickerItem();
  lobbyTicker.hidden = false;
  if(lobbyTickerIcon) lobbyTickerIcon.textContent = item.icon || (item.category === 'event' ? '📅' : item.category === 'welcome' ? '👋' : '📢');
  if(lobbyTickerTitle) lobbyTickerTitle.textContent = item.title || 'Hammerschach aktuell';
  if(lobbyTickerText) lobbyTickerText.textContent = item.message || '';
  const actionable = ['tournament','profile','link'].includes(String(item.actionKind || '')) && !!String(item.actionValue || '').trim();
  if(lobbyTickerActionBtn){
    lobbyTickerActionBtn.hidden = !actionable;
    lobbyTickerActionBtn.textContent = item.actionLabel || (item.actionKind === 'tournament' ? 'Turnier ansehen' : item.actionKind === 'profile' ? 'Profil ansehen' : 'Mehr erfahren');
  }
  if(lobbyTickerCounter) lobbyTickerCounter.textContent = lobbyTickerItems.length > 1 ? ((lobbyTickerIndex + 1) + '/' + lobbyTickerItems.length) : '';
  if(lobbyTickerPrevBtn) lobbyTickerPrevBtn.hidden = lobbyTickerItems.length < 2;
  if(lobbyTickerNextBtn) lobbyTickerNextBtn.hidden = lobbyTickerItems.length < 2;
}
async function loadLobbyTicker(){
  if(!onlineAuthToken || !onlineAuthUser){ clearLobbyTicker(); return; }
  const data = await authApi('/api/lobby-ticker');
  const dismissed = lobbyTickerDismissedIds();
  lobbyTickerItems = (Array.isArray(data.items) ? data.items : []).filter(item => item && item.id && !dismissed.has(String(item.id)));
  lobbyTickerIndex = Math.min(lobbyTickerIndex, Math.max(0, lobbyTickerItems.length - 1));
  showLobbyTickerAt(lobbyTickerIndex);
  startLobbyTickerRotation();
}
function dismissCurrentLobbyTickerItem(){
  const item = currentLobbyTickerItem();
  if(!item) return;
  const dismissed = lobbyTickerDismissedIds();
  dismissed.add(String(item.id));
  saveLobbyTickerDismissedIds(dismissed);
  lobbyTickerItems.splice(lobbyTickerIndex, 1);
  if(lobbyTickerIndex >= lobbyTickerItems.length) lobbyTickerIndex = 0;
  showLobbyTickerAt(lobbyTickerIndex);
  startLobbyTickerRotation();
}
function openCurrentLobbyTickerItem(){
  const item = currentLobbyTickerItem();
  if(!item) return;
  if(item.actionKind === 'tournament'){
    openTournamentDialog(String(item.actionValue || ''));
  } else if(item.actionKind === 'profile'){
    openMemberProfile({id:String(item.actionValue || '')}, 'standalone');
  } else if(item.actionKind === 'link'){
    const raw = String(item.actionValue || '').trim();
    try{
      const url = new URL(raw, window.location.origin);
      if(!['http:','https:'].includes(url.protocol)) return;
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch(_){}
  }
}
if(lobbyTickerPrevBtn) lobbyTickerPrevBtn.addEventListener('click', () => { showLobbyTickerAt(lobbyTickerIndex - 1); startLobbyTickerRotation(); });
if(lobbyTickerNextBtn) lobbyTickerNextBtn.addEventListener('click', () => { showLobbyTickerAt(lobbyTickerIndex + 1); startLobbyTickerRotation(); });
if(lobbyTickerCloseBtn) lobbyTickerCloseBtn.addEventListener('click', dismissCurrentLobbyTickerItem);
if(lobbyTickerActionBtn) lobbyTickerActionBtn.addEventListener('click', openCurrentLobbyTickerItem);
if(lobbyTicker){
  lobbyTicker.addEventListener('mouseenter', stopLobbyTickerRotation);
  lobbyTicker.addEventListener('mouseleave', startLobbyTickerRotation);
  lobbyTicker.addEventListener('focusin', stopLobbyTickerRotation);
  lobbyTicker.addEventListener('focusout', startLobbyTickerRotation);
}










