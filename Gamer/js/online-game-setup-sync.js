'use strict';

function sendOnlineMessage(payload){
  if(!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) return false;
  try{
    const outgoing = Object.assign({room: onlineRoomId || undefined}, payload || {});
    onlineSocket.send(JSON.stringify(outgoing));
    return true;
  } catch(_){
    return false;
  }
}
function currentGameSetupPayload(){
  return normalizeGameSetup(currentGameSetup);
}
function syncCurrentGameSetupToOnline(){
  if(applyingRemoteGameSetup) return;
  if(!onlineRoomId || !onlineConnected || onlineGameStarted) return;
  if(onlineRoleCode !== 'w' && !onlineCanSetTimeControl) return;
  const gameSetup = currentGameSetupPayload();
  const messageId = 'gs_' + Date.now() + '_' + randomToken(5);
  onlinePendingGameSetupMessageId = messageId;
  if(sendOnlineMessage({type:'set_game_setup', gameSetup, messageId})){
    onlineLastMessage = gameSetup.variant === GAME_VARIANT_FREESTYLE ? 'Freestyle-Stellung wird an die Lobby gesendet...' : 'Spielmodus wird an die Lobby gesendet...';
    updateOnlineUi();
    setTimeout(() => {
      if(onlinePendingGameSetupMessageId === messageId && onlineConnected && !sameGameSetup(onlineRoomGameSetup, gameSetup)){
        sendOnlineMessage({type:'set_game_setup', gameSetup, messageId: messageId + '_retry'});
        requestOnlineState();
      }
    }, 900);
  }
}
function currentTimeControlPayload(){
  if(!timeMode || !activeTimeKey || activeTimeKey === '0+0') return null;
  return {
    key: activeTimeKey,
    category: activeTimeCategory,
    mode: activeTimeCategory === 'daily' ? 'daily' : 'live',
    label: activeTimeLabel,
    baseSeconds: Math.floor(baseTimeMs / 1000),
    incrementSeconds: Math.floor(incrementMs / 1000)
  };
}
function syncCurrentTimeControlToOnline(){
  if(applyingRemoteTimeControl) return;
  if(!onlineRoomId || !onlineConnected || onlineGameStarted) return;
  if(onlineRoleCode !== 'w' && !onlineCanSetTimeControl) return;
  const timeControl = currentTimeControlPayload();
  if(!timeControl) return;
  const messageId = 'tc_' + Date.now() + '_' + randomToken(5);
  onlinePendingTimeControlMessageId = messageId;
  if(sendOnlineMessage({type:'set_time_control', timeControl, messageId})){
    onlineLastMessage = 'Bedenkzeit wird an die Lobby gesendet...';
    updateOnlineUi();
    setTimeout(() => {
      if(onlinePendingTimeControlMessageId === messageId && onlineConnected && !sameTimeControl(onlineRoomTimeControl, timeControl)){
        sendOnlineMessage({type:'set_time_control', timeControl, messageId: messageId + '_retry'});
        requestOnlineState();
        onlineLastMessage = 'Bedenkzeit wurde erneut gesendet. Warte auf Server-Bestätigung.';
        updateOnlineUi();
      }
    }, 900);
    setTimeout(() => {
      if(onlinePendingTimeControlMessageId === messageId){
        requestOnlineState();
        onlineLastMessage = 'Warte auf Bestätigung der Bedenkzeit vom Server.';
        updateOnlineUi();
      }
    }, 1800);
  }
}
function applyTimeControlFromOnline(timeControl){
  if(!timeControl || !timeControl.key) return;
  const previous = onlineRoomTimeControl ? Object.assign({}, onlineRoomTimeControl) : null;
  const changed = !sameTimeControl(previous, timeControl);
  onlineRoomTimeControl = timeControl;
  onlinePendingTimeControlMessageId = null;

  /*
    Wichtig: Der Worker sendet den Raumzustand regelmäßig erneut.
    Dieser Zustand enthält auch die Bedenkzeit. Während einer laufenden Partie
    darf diese Wiederholung die Uhren nicht zurück auf die Startzeit setzen.
    Sonst läuft die aktive Uhr kurz herunter und springt beim nächsten
    request_state/room_state wieder auf die Anfangszeit.
  */
  const mayResetClock = !onlineGameStarted && actualMoveCount() === 0 && !clockRunning && !firstMoveDone && !timeLost;

  applyingRemoteTimeControl = true;
  try{
    applyTimeControlFromKey(timeControl.key, timeControl.label, timeControl.category);
    try{
      localStorage.setItem(TIME_STORAGE_KEY, timeControl.key);
      localStorage.setItem(TIME_CATEGORY_STORAGE_KEY, timeControl.category || '');
    } catch(_){}
  } finally {
    applyingRemoteTimeControl = false;
  }

  if(timeControl.mode === 'daily' && !onlineAuthUser && !onlineDailyLoginPrompted){
    onlineDailyLoginPrompted = true;
    if(statusEl) statusEl.textContent = 'Daily Chess erfordert einen registrierten und eingeloggten Account.';
    setTimeout(() => openAuthDialog('login'), 120);
  }

  if(mayResetClock || changed && !onlineGameStarted && actualMoveCount() === 0){
    resetClockForNewGame();
  } else {
    updateTimeStatus();
    updateTimeControlsLock();
    updateClockDisplay();
  }
}
