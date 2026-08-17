'use strict';

function setOnlineValueClass(el, state){
  if(!el) return;
  el.classList.remove('good','wait','neutral');
  el.classList.add(state || 'neutral');
}
function refreshHeaderStatusFromState(){
  if(!statusEl || !boardEl) return;
  if(variationModeActive){
    statusEl.textContent = variationPurpose === 'conditional' ? 'Bedingte Züge' : 'Variantenbrett';
    return;
  }
  if(embeddedToolActive()){
    statusEl.textContent = embeddedToolStatusText();
    return;
  }
  if(isAnonymousVisitorStartView()){
    statusEl.textContent = 'Bitte melde dich an, um eine Partie anzubieten oder jemanden einzuladen.';
    return;
  }
  if(isMemberLobbyView()){
    statusEl.textContent = 'Partie starten, Gegner finden oder chatten.';
    return;
  }
  try{ updateStatus(buildGameFromHistory(viewIndex)); } catch(_){}
}
function updateOnlineActionButtons(){
  const live = isOnlineGameLiveForUi();
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  const offerOpen = !!(onlineRoomId && onlineOpenOffer && onlineOpenOfferStatus === 'open');
  const inRoom = !!onlineRoomId;
  const directInvitationMode = !!directInvitationSetupMember;
  const showLobbyButton = inRoom || embeddedToolActive();
  if(openOffersOpenBtn){
    openOffersOpenBtn.hidden = showLobbyButton;
    openOffersOpenBtn.title = 'Offene Partieangebote anzeigen.';
  }
  if(newGameOpenBtn){
    newGameOpenBtn.hidden = !loggedIn || showLobbyButton;
    newGameOpenBtn.disabled = !loggedIn || showLobbyButton;
    newGameOpenBtn.title = loggedIn ? 'Farbe, Spielmodus, Bedenkzeit und Wertung einstellen.' : 'Zum Erstellen einer Partie bitte einloggen.';
  }
  if((!loggedIn || showLobbyButton) && !directInvitationMode && newGameBackdrop && !newGameBackdrop.hidden) closeNewGameDialog({restoreFocus:false});
  if(newGameMenuEl){
    newGameMenuEl.hidden = showLobbyButton;
    if(showLobbyButton) closeNewGameMenu();
  }
  if(roomLobbyBtn){
    roomLobbyBtn.hidden = !showLobbyButton;
    roomLobbyBtn.title = embeddedToolActive()
      ? ((openingsToolActive ? 'Eröffnungsschule' : (trainerToolActive ? 'Trainer' : 'Analyzer')) + ' schließen und zur Lobby zurückkehren.')
      : 'Im aktuellen Browser-Tab zur Mitglieder-Lobby zurückkehren.';
  }
  if(createOnlineBtn){
    createOnlineBtn.hidden = inRoom || directInvitationMode;
    createOnlineBtn.disabled = inRoom || live || offerOpen;
    createOnlineBtn.title = inRoom
      ? ''
      : (live
          ? 'Während einer laufenden Online-Partie kann kein neuer Raum erstellt werden.'
          : (offerOpen
              ? 'Diese Partie ist bereits unter „Offene Partien“ angeboten.'
              : (!loggedIn
                  ? 'Zum Erstellen einer Partie ist ein kostenloser Mitglieder-Account erforderlich. Eingeladene Gäste dürfen Live-Partien weiterhin per Link beitreten.'
                  : (onlineRoomCancelled ? 'Eine neue Online-Partie erstellen.' : 'Online-Partie erstellen und Einladungs-Popup öffnen.'))));
  }
  if(newGameBtn){
    newGameBtn.disabled = inRoom;
    newGameBtn.hidden = directInvitationMode;
    newGameBtn.textContent = '♟️ Partie anbieten';
    newGameBtn.title = loggedIn ? 'Die gewählten Einstellungen als offene Partie veröffentlichen.' : 'Zum Anbieten einer Partie bitte einloggen.';
  }
  if(directInvitationSendBtn){
    directInvitationSendBtn.hidden = !directInvitationMode;
    directInvitationSendBtn.disabled = !directInvitationMode || directInvitationSendBusy;
    directInvitationSendBtn.title = directInvitationMode
      ? 'Spielraum mit diesen Einstellungen erstellen und Einladung endgültig senden.'
      : '';
  }
}
function updateGameActionButtons(){
  const live = !!(onlineRoomId && onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost && (onlineRoleCode === 'w' || onlineRoleCode === 'b'));
  if(gameActionsEl) gameActionsEl.hidden = !live;
  if(!live && resignBackdropEl && !resignBackdropEl.hidden) closeResignDialog({restoreFocus:false});
  if(!offerDrawBtn || !resignBtn) return;
  const incomingDrawOffer = !!(onlineDrawOffer && onlineDrawOffer.byRole !== onlineRoleCode);
  const outgoingDrawOffer = !!(onlineDrawOffer && onlineDrawOffer.byRole === onlineRoleCode);
  const daily = isDailyTimeControl();
  const drawAgreementAvailable = actualMoveCount() >= 2;
  const dailyClaimAvailable = !!(daily && onlineDrawClaims && onlineDrawClaims.claimantRole === onlineRoleCode && (onlineDrawClaims.threefold || onlineDrawClaims.fiftyMove));
  offerDrawBtn.hidden = !!(live && daily && !incomingDrawOffer && !outgoingDrawOffer && !dailyClaimAvailable);
  offerDrawBtn.classList.toggle('draw-offer-accept-btn', incomingDrawOffer || dailyClaimAvailable);
  if(declineDrawBtn){
    declineDrawBtn.hidden = !incomingDrawOffer;
    declineDrawBtn.disabled = !live || variationModeActive || !incomingDrawOffer;
    declineDrawBtn.title = incomingDrawOffer ? 'Remisangebot ablehnen und die Partie fortsetzen.' : '';
  }
  offerDrawBtn.disabled = !live;
  resignBtn.disabled = !live;
  if(!live){
    offerDrawBtn.textContent = '½ Remis';
    offerDrawBtn.title = 'Remisangebot ist nur während einer laufenden Online-Partie möglich.';
    resignBtn.title = 'Aufgeben ist nur während einer laufenden Online-Partie möglich.';
    return;
  }
  if(variationModeActive){
    offerDrawBtn.disabled = true;
    resignBtn.disabled = true;
    offerDrawBtn.title = 'Bitte zuerst zum Partiebrett zurückkehren.';
    resignBtn.title = 'Bitte zuerst zum Partiebrett zurückkehren.';
    return;
  }
  if(outgoingDrawOffer){
    offerDrawBtn.textContent = '½ Angebot offen';
    offerDrawBtn.disabled = true;
    offerDrawBtn.title = 'Dein Remisangebot wartet auf Antwort.';
  } else if(incomingDrawOffer){
    offerDrawBtn.textContent = '🤝 Remis annehmen';
    offerDrawBtn.disabled = false;
    offerDrawBtn.title = 'Remisangebot des Gegners annehmen.';
  } else if(dailyClaimAvailable){
    offerDrawBtn.textContent = '½ Remis reklamieren';
    offerDrawBtn.disabled = false;
    offerDrawBtn.title = 'Remis reklamieren: ' + onlineDrawClaimLabel(onlineDrawClaims) + '.';
  } else {
    offerDrawBtn.textContent = '½ Remis';
    offerDrawBtn.disabled = daily || !drawAgreementAvailable;
    offerDrawBtn.title = daily
      ? 'Bei Daily Chess wird das Remisangebot nach der Zugauswahl zusammen mit „Zug bestätigen“ gesendet.'
      : drawAgreementAvailable
        ? 'Dem Gegner Remis anbieten.'
        : 'Ein Remis durch Vereinbarung ist erst möglich, nachdem beide Spieler mindestens einen Zug gemacht haben.';
  }
  resignBtn.title = onlineRoleCode === 'w' ? 'Als Weiß aufgeben.' : 'Als Schwarz aufgeben.';
}
function updateOnlineStartButton(){
  if(!startOnlineBtn || !liveStartBoxEl) return;
  const daily = isDailyTimeControl();
  const roomWaiting = !!(onlineRoomId && !daily && !onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
  const bothSeats = !!(onlineAssignedSeats.white && onlineAssignedSeats.black);
  const bothConnected = !!(isOnlineSideConnected('w') && isOnlineSideConnected('b'));
  const show = roomWaiting && bothSeats && bothConnected && (onlineRoleCode === 'w' || onlineRoleCode === 'b');
  liveStartBoxEl.hidden = !show;
  if(!show){
    startOnlineBtn.hidden = true;
    startOnlineBtn.disabled = true;
    if(liveStartHintEl) liveStartHintEl.textContent = 'Sobald beide Spieler verbunden sind, kann Weiß die Live-Partie starten.';
    return;
  }
  if(onlineRoleCode === 'b'){
    startOnlineBtn.hidden = true;
    startOnlineBtn.disabled = true;
    if(liveStartHintEl) liveStartHintEl.textContent = 'Beide Spieler sind verbunden. Weiß startet die Partie.';
    return;
  }
  startOnlineBtn.hidden = false;
  const canStart = onlineConnected && bothConnected && !!timeMode && !onlinePendingStartMessageId;
  startOnlineBtn.disabled = !canStart;
  startOnlineBtn.textContent = onlinePendingStartMessageId ? 'Partiestart wird gesendet…' : 'Partie starten';
  if(liveStartHintEl){
    if(!timeMode) liveStartHintEl.textContent = 'Bitte zuerst eine Bedenkzeit auswählen.';
    else if(onlinePendingStartMessageId) liveStartHintEl.textContent = 'Der Partiestart wartet auf die Bestätigung des Servers.';
    else liveStartHintEl.textContent = 'Beide Spieler sind verbunden. Du spielst Weiß und kannst die Live-Partie starten.';
  }
  startOnlineBtn.title = canStart ? 'Live-Partie mit der gewählten Bedenkzeit starten.' : (timeMode ? 'Partiestart ist noch nicht möglich.' : 'Bitte zuerst eine Bedenkzeit auswählen.');
}
function updateOnlineUi(){
  updateVisitorLandingUi();
  if(!onlineRoomId){
    onlineCanSetTimeControl = false;
    onlinePublicGame = false;
    onlineOpenOffer = false;
    onlineOpenOfferStatus = 'none';
    onlineRatedRequested = !!ratingPreference;
    onlineCreatedByMe = false;
    onlinePendingPublicGameMessageId = null;
    onlineAssignedSeats = {white:false, black:false};
    onlineStatusEl.textContent = 'Nicht verbunden';
    onlineRoleEl.textContent = '—';
    onlineRoomEl.textContent = '—';
    if(onlineGameStateEl) onlineGameStateEl.textContent = 'Keine Partie';
    onlineHintEl.textContent = 'Bitte eine Online-Partie erstellen oder einem Einladungslink folgen.';
    if(copyInviteBtn) copyInviteBtn.disabled = true;
    onlineConnectionState = 'local';
    whitePlayerNameEl.textContent = '—';
    blackPlayerNameEl.textContent = '—';
    whitePlayerNameEl.removeAttribute('title');
    blackPlayerNameEl.removeAttribute('title');
    onlineRatingState = null;
    onlineHeadToHead = null;
    onlineRematchState = null;
    rematchActionBusy = false;
    rematchAutoOpenWhenReady = false;
    rematchLastError = '';
    updateRoomRatingUi();
    updateHeadToHeadUi();
    updateRematchUi();
    updateOnlineGameReactionUi();
    updateOnlineGameMomentUi();
    setOnlineValueClass(onlineStatusEl, 'neutral');
    setOnlineValueClass(onlineRoleEl, 'neutral');
    setOnlineValueClass(onlineRoomEl, 'neutral');
    setOnlineValueClass(onlineGameStateEl, 'neutral');
    updateOnlineStartButton();
    updateOnlineActionButtons();
    updateGameActionButtons();
    updateChatControls();
    updateTimeSetupVisibility();
    updateVariantUi();
    updateInviteColorUi();
    updateRatingPreferenceUi();
    updatePublicVisibilityUi();
    updateSidePanelLayout();
    updatePlayerPresenceBadges();
    updateVariationLauncherUi();
    if(typeof updateConditionalMoveUi === 'function') updateConditionalMoveUi();
    refreshHeaderStatusFromState();
    refreshNextDailyGameButton();
    return;
  }

  if(onlineRoomCancelled){
    onlineStatusEl.textContent = 'Zurückgezogen';
    onlineRoleEl.textContent = '—';
    onlineRoomEl.textContent = onlineRoomId || '—';
    if(onlineGameStateEl) onlineGameStateEl.textContent = 'Nicht verfügbar';
    onlineHintEl.textContent = onlineLastMessage || 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
    whitePlayerNameEl.textContent = '—';
    blackPlayerNameEl.textContent = '—';
    whitePlayerNameEl.removeAttribute('title');
    blackPlayerNameEl.removeAttribute('title');
    onlineRatingState = null;
    onlineHeadToHead = null;
    onlineRematchState = null;
    rematchActionBusy = false;
    rematchAutoOpenWhenReady = false;
    rematchLastError = '';
    updateRoomRatingUi();
    updateHeadToHeadUi();
    updateRematchUi();
    updateOnlineGameReactionUi();
    updateOnlineGameMomentUi();
    setOnlineValueClass(onlineStatusEl, 'wait');
    setOnlineValueClass(onlineRoleEl, 'neutral');
    setOnlineValueClass(onlineRoomEl, 'neutral');
    setOnlineValueClass(onlineGameStateEl, 'neutral');
    if(copyInviteBtn) copyInviteBtn.disabled = true;
    updateOnlineStartButton();
    updateOnlineActionButtons();
    updateGameActionButtons();
    updateChatControls();
    updatePublicVisibilityUi();
    updateSidePanelLayout();
    updatePlayerPresenceBadges();
    updateVariationLauncherUi();
    if(typeof updateConditionalMoveUi === 'function') updateConditionalMoveUi();
    refreshHeaderStatusFromState();
    refreshNextDailyGameButton();
    return;
  }

  const bothConnected = !!(isOnlineSideConnected('w') && isOnlineSideConnected('b'));
  if(onlineConnectionState === 'error'){
    onlineStatusEl.textContent = 'Online-Fehler';
    setOnlineValueClass(onlineStatusEl, 'wait');
  } else if(onlineConnectionState === 'closed'){
    onlineStatusEl.textContent = 'Getrennt';
    setOnlineValueClass(onlineStatusEl, 'wait');
  } else if(!onlineConnected){
    onlineStatusEl.textContent = 'Verbinde...';
    setOnlineValueClass(onlineStatusEl, 'wait');
  } else if(onlineRoleCode === 'spectator'){
    onlineStatusEl.textContent = 'Zuschauen';
    setOnlineValueClass(onlineStatusEl, 'good');
  } else if(isDailyTimeControl() && onlineGameStarted){
    onlineStatusEl.textContent = 'Daily aktiv';
    setOnlineValueClass(onlineStatusEl, 'good');
  } else if(bothConnected){
    onlineStatusEl.textContent = 'Verbunden';
    setOnlineValueClass(onlineStatusEl, 'good');
  } else {
    onlineStatusEl.textContent = 'Warte auf Gegner';
    setOnlineValueClass(onlineStatusEl, 'wait');
  }

  onlineRoleEl.textContent = roleLabel(onlineRoleCode);
  onlineRoomEl.textContent = onlineSpectatorOnly ? 'Öffentlich' : onlineRoomId;
  if(copyInviteBtn) copyInviteBtn.disabled = onlineRoleCode === 'spectator';
  setOnlineValueClass(onlineRoleEl, onlineRoleCode === 'spectator' ? 'wait' : 'good');
  setOnlineValueClass(onlineRoomEl, 'neutral');

  if(onlineGameStateEl){
    const ended = onlineGameEnded || gameEnded || timeLost;
    onlineGameStateEl.textContent = ended ? 'Beendet' : (onlineGameStarted ? 'Gestartet' : 'Lobby');
    setOnlineValueClass(onlineGameStateEl, ended ? 'neutral' : (onlineGameStarted ? 'good' : 'wait'));
  }

  const whitePlayerDisplayName = onlineSideText('w');
  const blackPlayerDisplayName = onlineSideText('b');
  whitePlayerNameEl.textContent = whitePlayerDisplayName;
  blackPlayerNameEl.textContent = blackPlayerDisplayName;
  whitePlayerNameEl.title = whitePlayerDisplayName;
  blackPlayerNameEl.title = blackPlayerDisplayName;
  updatePlayerPresenceBadges();
  updateRoomRatingUi();
  updateHeadToHeadUi();
  updateRematchUi();
  updateOnlineGameReactionUi();
  updateOnlineGameMomentUi();

  let syncNote;
  if(onlineRoleCode === 'spectator'){
    syncNote = 'Zuschauermodus: Du kannst Brett, Zugliste und Zeiten verfolgen. Spielerplätze, Züge und der private Partie-Chat bleiben gesperrt.';
  } else if(onlineGameEnded || gameEnded || timeLost){
    syncNote = 'Partie beendet. Für eine neue Partie bitte einen neuen Online-Raum erstellen.';
  } else if(isDailyTimeControl()){
    syncNote = onlineGameStarted
      ? 'Daily-Partie läuft. Der Gegner muss nicht gleichzeitig online sein; Züge und Zugfristen werden serverseitig gespeichert.'
      : 'Daily Chess startet automatisch, sobald beide registrierten Spielerplätze angenommen wurden.';
  } else {
    syncNote = onlineGameStarted
      ? 'Partie gestartet. Züge werden synchronisiert und serverseitig geprüft.'
      : 'Weiß startet die Partie. Die Bedenkzeit wählt Weiß oder der Einladende. Züge werden synchronisiert und serverseitig geprüft.';
  }
  if(onlineRoomTimeControl && onlineRoomTimeControl.label){
    syncNote = 'Raum-Bedenkzeit: ' + onlineRoomTimeControl.label + '. ' + syncNote;
  }
  onlineHintEl.textContent = onlineLastMessage ? (onlineLastMessage + ' ' + syncNote) : syncNote;
  updateOnlineStartButton();
  updateOnlineActionButtons();
  updateGameActionButtons();
  updateChatControls();
  updateTimeControlsLock();
  updateTimeSetupVisibility();
  updateVariantUi();
  updateInviteColorUi();
  updateRatingPreferenceUi();
  updatePublicVisibilityUi();
  updateSidePanelLayout();
  updateVariationLauncherUi();
  if(typeof updateConditionalMoveUi === 'function') updateConditionalMoveUi();
  refreshHeaderStatusFromState();
  refreshNextDailyGameButton();
}
