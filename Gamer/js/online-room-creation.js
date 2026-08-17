'use strict';

async function createNewOnlineRoom(opts){
  if(onlineRoomCreationPromise) return onlineRoomCreationPromise;
  onlineRoomCreationPromise = (async () => {
    opts = opts || {};
    if(isOnlineGameLiveForUi()) return false;

    // Ein vorhandener Raum in der Adresszeile wird bei Reload/Wiederaufnahme
    // niemals durch einen neuen Raum ersetzt.
    let roomFromUrl = '';
    let watchFromUrl = '';
    try{
      const currentUrl = new URL(window.location.href);
      roomFromUrl = cleanRoomId(currentUrl.searchParams.get('room'));
      watchFromUrl = cleanPublicWatchId(currentUrl.searchParams.get('watch'));
    } catch(_){}
    if(!onlineRoomId && watchFromUrl){
      connectOnlineRoom(watchFromUrl, {reconnect:true, spectatorOnly:true, publicWatchId:watchFromUrl});
      return true;
    }
    if(!onlineRoomId && roomFromUrl){
      connectOnlineRoom(roomFromUrl, {reconnect:true, spectatorOnly:false});
      return true;
    }

    if(!requireAccountForInvitationCreation()) return false;
    if(isDailyTimeControl() && !onlineAuthUser){
      statusEl.textContent = 'Daily Chess ist nur nach Registrierung oder Login verfügbar.';
      openAuthDialog('login');
      return false;
    }
    if(!(await ensureDisplayNameForOnline())) return false;
    const selectedGameSetupForRoom = currentGameSetupPayload();
    onlineSpectatorOnly = false;
    onlinePublicWatchId = '';
    onlineDesiredPublicGameForNewRoom = !!publicGamePreference;
    onlineDesiredOpenOfferForNewRoom = opts.openOffer === true;
    onlineRatedRequested = !!ratingPreference;
    onlinePublicGame = !!publicGamePreference;
    onlineOpenOffer = onlineDesiredOpenOfferForNewRoom;
    onlineOpenOfferStatus = onlineDesiredOpenOfferForNewRoom ? 'open' : 'none';
    closeOnlineSocket();
    onlineRoomId = null;
    onlineRoleCode = 'local';
    onlineConnected = false;
    onlineConnectionState = 'local';
    onlineGameStarted = false;
    onlineGameEnded = false;
    onlineGameResult = '*';
    onlineGameEndReason = null;
    onlineGameWinner = null;
    onlineDrawOffer = null;
    onlineDrawClaims = null;
    onlineRoomTimeControl = null;
    onlineRoomGameSetup = null;
  onlineRatingState = null;
    onlineDesiredGameSetupForNewRoom = selectedGameSetupForRoom;
    onlinePendingGameSetupMessageId = null;
    onlineAutoSyncedInitialSetup = false;
    onlineCanSetTimeControl = false;
    onlineCreatedByMe = false;
    onlinePendingPublicGameMessageId = null;
    onlineClockSync = null;
    onlineSeatClaimSent = false;
    onlineRoomCancelled = false;
    newGame();
    const roomId = createRoomId();
    onlinePreferredRoleForNextConnect = resolveInviteCreatorRole();
    // URL und Sitzungsmerker werden vor dem WebSocket-Aufbau gesetzt. Ein sofortiger
    // Browser-Reload kann dadurch denselben Raum wieder aufnehmen.
    updateInviteUrlInAddressBar(roomId);
    connectOnlineRoom(roomId, {preferredRole: onlinePreferredRoleForNextConnect, initialGameSetup: selectedGameSetupForRoom, spectatorOnly:false});
    if(opts.copyLink !== false) setTimeout(copyInviteLink, 250);
    return true;
  })();
  try{
    return await onlineRoomCreationPromise;
  } finally {
    onlineRoomCreationPromise = null;
  }
}
async function offerPreparedGame(event){
  if(event && event.isTrusted === false) return;
  if(onlineRoomId){ openNewGameView(); return; }
  setNewGameDialogStatus('');
  if(!requireAccountForInvitationCreation()) return;
  if(!timeMode || !currentTimeControlPayload()){
    const message = 'Bitte zuerst eine Bedenkzeit auswählen, bevor du die Partie anbietest.';
    statusEl.textContent = message;
    setNewGameDialogStatus(message);
    return;
  }
  if(isDailyTimeControl() && !onlineAuthUser){
    const message = 'Daily Chess ist nur nach Registrierung oder Login verfügbar.';
    statusEl.textContent = message;
    setNewGameDialogStatus(message);
    openAuthDialog('login');
    return;
  }
  if(newGameBtn) newGameBtn.disabled = true;
  try{
    const created = await createNewOnlineRoom({copyLink:false, openOffer:true});
    if(created){
      closeNewGameDialog({restoreFocus:false});
      onlineLastMessage = 'Partieangebot wird veröffentlicht. Warte auf einen Gegner.';
      statusEl.textContent = onlineLastMessage;
      setTimeout(requestOnlineState, 500);
      setTimeout(() => loadOpenOffers({silent:true}), 1200);
    }
  } finally {
    updateOnlineActionButtons();
  }
}

async function inviteToOnlineGame(event){
  if(event && event.isTrusted === false) return;
  setNewGameDialogStatus('');
  if(createOnlineBtn) createOnlineBtn.disabled = true;
  try{
    const opened = await openInviteDialogForCurrentOrNewRoom();
    if(opened) closeNewGameDialog({restoreFocus:false});
  } finally {
    updateOnlineActionButtons();
  }
}
