'use strict';

function applyOnlineGameState(game){
  const wasStarted = onlineGameStarted;
  const wasEnded = onlineGameEnded;
  const openedAlreadyEnded = !!(game && game.started && game.ended && !wasStarted && !wasEnded);
  onlineGameStarted = !!(game && game.started);
  onlineGameEnded = !!(game && game.ended);
  onlineGameResult = game && game.result ? game.result : (onlineGameEnded ? onlineGameResult : '*');
  onlineGameEndReason = game && game.endReason ? game.endReason : (onlineGameEnded ? onlineGameEndReason : null);
  onlineGameWinner = game && game.winner ? game.winner : (onlineGameEnded ? onlineGameWinner : null);
  if(onlineGameStarted) onlinePendingStartMessageId = null;
  onlineGameStartedAt = game && game.startedAt ? game.startedAt : null;
  if(onlineGameStarted && !wasStarted){
    setRightPanelMode('moves');
    pendingDailyMove = null;
    queuedPremove = null;
    selected = null;
    stopClock();
    masterHistory = buildThemeHistory(currentGameSetup);
    invalidateHistoryStateCache();
    viewIndex = masterHistory.length;
    lastMove = masterHistory.length ? {from:masterHistory[masterHistory.length-1].from,to:masterHistory[masterHistory.length-1].to,meta:masterHistory[masterHistory.length-1].meta || {}} : null;
    // Beim Öffnen einer bereits beendeten Online-Partie darf der lokale
    // Brettzustand niemals kurzzeitig wieder als laufend markiert werden.
    gameEnded = !!onlineGameEnded;
    onlineDrawOffer = null;
    onlineDrawClaims = null;
    resetClockForNewGame();
    onlineClockSync = null;
    if(!onlineGameEnded){
      onlineLastMessage = isDailyTimeControl() ? 'Daily-Partie wurde automatisch gestartet.' : 'Online-Partie wurde gestartet.';
      playGameStartSound();
    }
    renderBoard();
  }
  if(onlineGameEnded && !wasEnded){
    gameEnded = true;
    stopClock();
    clockRunning = false;
    pendingDailyMove = null;
    queuedPremove = null;
    selected = null;
    updatePremoveUi();
    onlineDrawOffer = null;
    onlineDrawClaims = null;
    statusEl.textContent = formatOnlineEndMessage(game);
    // Beim bloßen Ansehen einer bereits beendeten Partie keinen Ergebnis-Sound
    // erneut abspielen. Nur ein tatsächlich live erlebtes Partieende signalisiert ihn.
    if(!openedAlreadyEnded) playGameResultSound(onlineGameResult, onlineGameWinner);
    updateGameActionButtons();
    updateOnlineUi();
  }
}

function startOnlineGame(){
  if(isDailyTimeControl()){
    statusEl.textContent = 'Daily Chess startet automatisch, sobald beide registrierten Spielerplätze angenommen wurden.';
    updateOnlineStartButton();
    return;
  }
  if(!onlineRoomId || onlineRoleCode !== 'w' || onlineGameStarted || onlinePendingStartMessageId) return;
  if(!timeMode){
    statusEl.textContent = 'Bitte zuerst eine Bedenkzeit auswählen.';
    updateOnlineStartButton();
    return;
  }
  const timeControl = currentTimeControlPayload();
  const gameSetup = currentGameSetupPayload();
  syncCurrentGameSetupToOnline();
  syncCurrentTimeControlToOnline();
  const messageId = 'sg_' + Date.now() + '_' + randomToken(5);
  onlinePendingStartMessageId = messageId;
  onlineLastMessage = 'Bedenkzeit wird gesendet, Partiestart folgt sofort.';
  updateOnlineUi();
  setTimeout(() => {
    if(onlineGameStarted || onlinePendingStartMessageId !== messageId) return;
    if(sendOnlineMessage({type:'start_game', timeControl, gameSetup, game:{started:true, gameSetup}, messageId})){
      onlineLastMessage = 'Partiestart wurde gesendet. Warte auf Server-Bestätigung.';
      updateOnlineUi();
      setTimeout(requestOnlineState, 250);
      setTimeout(requestOnlineState, 900);
      setTimeout(() => {
        if(onlinePendingStartMessageId === messageId && !onlineGameStarted){
          onlinePendingStartMessageId = null;
          requestOnlineState();
          onlineLastMessage = 'Partiestart wurde vom Server noch nicht bestätigt. Bitte erneut versuchen.';
          updateOnlineUi();
        }
      }, 2500);
    } else {
      onlinePendingStartMessageId = null;
      onlineLastMessage = 'Partiestart konnte nicht gesendet werden.';
      updateOnlineUi();
    }
  }, 300);
}
function isPlayerAllowedForGameAction(){
  return !!(onlineRoomId && onlineConnected && onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost && (onlineRoleCode === 'w' || onlineRoleCode === 'b'));
}
function respondToOnlineDrawOffer(action){
  if(!isPlayerAllowedForGameAction()){ updateGameActionButtons(); return; }
  if(!onlineDrawOffer || onlineDrawOffer.byRole === onlineRoleCode){ updateGameActionButtons(); return; }
  const normalizedAction = action === 'reject' ? 'reject' : 'accept';
  if(normalizedAction === 'accept' && !window.confirm('Remisangebot annehmen?')) return;
  if(sendOnlineMessage({type:'respond_draw', action:normalizedAction})){
    onlineLastMessage = normalizedAction === 'accept' ? 'Remisannahme wird gesendet...' : 'Remisangebot wird abgelehnt...';
    updateOnlineUi();
    setTimeout(requestOnlineState, 500);
  }
}
function handleDrawButtonClick(){
  if(!isPlayerAllowedForGameAction()){ updateGameActionButtons(); return; }
  if(onlineDrawOffer && onlineDrawOffer.byRole !== onlineRoleCode){
    respondToOnlineDrawOffer('accept');
    return;
  }
  if(onlineDrawOffer && onlineDrawOffer.byRole === onlineRoleCode) return;
  if(isDailyTimeControl()){
    const claimable = !!(onlineDrawClaims && onlineDrawClaims.claimantRole === onlineRoleCode && (onlineDrawClaims.threefold || onlineDrawClaims.fiftyMove));
    if(claimable){
      const reason = onlineDrawClaims.threefold ? 'threefold_repetition' : 'fifty_move_rule';
      if(sendOnlineMessage({type:'claim_draw', reason})){
        onlineLastMessage = 'Remisreklamation wird vom Server geprüft...';
        updateOnlineUi();
        setTimeout(requestOnlineState, 500);
      }
      return;
    }
    onlineLastMessage = 'Bei Daily Chess wird ein normales Remisangebot zusammen mit dem eigenen Zug angeboten.';
    updateOnlineUi();
    return;
  }
  if(!canOfferLiveDrawNow()){
    onlineLastMessage = actualMoveCount() < 2
      ? 'Remis kann erst angeboten werden, nachdem beide Spieler mindestens einen Zug gemacht haben.'
      : 'Bei Live-Partien kannst du Remis direkt nach deinem Zug anbieten, solange der Gegner am Zug ist.';
    updateOnlineUi();
    return;
  }
  if(sendOnlineMessage({type:'offer_draw'})){
    onlineLastMessage = 'Remisangebot wird gesendet...';
    updateOnlineUi();
    setTimeout(requestOnlineState, 500);
  }
}
function handleDeclineDrawButtonClick(){
  respondToOnlineDrawOffer('reject');
}
function closeResignDialog(options){
  options = options || {};
  if(!resignBackdropEl) return;
  resignBackdropEl.hidden = true;
  if(options.restoreFocus !== false && resignBtn && !resignBtn.disabled && !resignBtn.hidden){
    try{ resignBtn.focus({preventScroll:true}); } catch(_){ resignBtn.focus(); }
  }
}
function openResignDialog(){
  if(!isPlayerAllowedForGameAction()){ updateGameActionButtons(); return; }
  const side = onlineRoleCode === 'w' ? 'Weiß' : 'Schwarz';
  if(resignPromptEl) resignPromptEl.textContent = 'Du spielst mit ' + side + '. Möchtest du die laufende Partie wirklich aufgeben?';
  if(!resignBackdropEl) return;
  resignBackdropEl.hidden = false;
  setTimeout(() => {
    if(resignCancelBtn && !resignBackdropEl.hidden) resignCancelBtn.focus();
  }, 0);
}
function confirmResignation(){
  if(!isPlayerAllowedForGameAction()){
    closeResignDialog({restoreFocus:false});
    updateGameActionButtons();
    return;
  }
  closeResignDialog({restoreFocus:false});
  if(sendOnlineMessage({type:'resign'})){
    onlineLastMessage = 'Aufgabe wird gesendet...';
    updateOnlineUi();
    setTimeout(requestOnlineState, 500);
  }
}
function handleResignButtonClick(){
  openResignDialog();
}
function onlineInteractionBlockReason(gameState){
  if(!onlineRoomId) return 'Bitte zuerst eine Online-Partie erstellen oder einem Einladungslink folgen.';
  if(onlineRoomCancelled) return 'Diese Einladung wurde zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
  if(!onlineConnected) return 'Online-Verbindung ist noch nicht bereit.';
  if(!onlineGameStarted){
    if(isDailyTimeControl()){
      if(!onlineAssignedSeats.black) return 'Daily-Partie noch nicht angenommen. Warte auf den zweiten registrierten Spieler.';
      return 'Daily-Partie wird automatisch gestartet. Bitte den Raumzustand kurz aktualisieren.';
    }
    return onlineRoleCode === 'w' ? 'Online-Partie noch nicht gestartet. Bitte „Partie starten“ verwenden.' : 'Online-Partie noch nicht gestartet. Warte auf Weiß.';
  }
  if(onlineGameEnded || gameEnded || timeLost) return 'Diese Online-Partie ist beendet. Bitte eine neue Online-Partie erstellen.';
  if(onlineRoleCode === 'spectator') return 'Zuschauer können keine Züge ausführen.';
  if(onlineRoleCode !== 'w' && onlineRoleCode !== 'b') return 'Keine Spielerrolle zugewiesen.';
  if(onlineRoleCode !== gameState.turn) return 'Du spielst ' + roleLabel(onlineRoleCode) + '. ' + roleLabel(gameState.turn) + ' ist am Zug.';
  return '';
}
