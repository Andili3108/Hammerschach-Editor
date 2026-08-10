'use strict';

function connectOnlineRoom(roomId, opts){
  opts = opts || {};
  if(typeof opts.spectatorOnly === 'boolean') onlineSpectatorOnly = opts.spectatorOnly;
  else if(!opts.reconnect) onlineSpectatorOnly = false;
  if(opts.publicWatchId) onlinePublicWatchId = cleanPublicWatchId(opts.publicWatchId);
  else if(!opts.reconnect && !onlineSpectatorOnly) onlinePublicWatchId = '';
  if(opts.preferredRole && !onlineSpectatorOnly) onlinePreferredRoleForNextConnect = normalizeInviteColorPreference(opts.preferredRole) === 'b' ? 'b' : 'w';
  if(opts.initialGameSetup && !onlineSpectatorOnly) onlineDesiredGameSetupForNewRoom = normalizeGameSetup(opts.initialGameSetup);
  else if(!opts.reconnect) onlineDesiredGameSetupForNewRoom = null;
  roomId = cleanRoomId(roomId);
  if(!roomId) return;
  const previousRoomId = onlineRoomId;
  const restoringInterruptedConnection = !!(opts.reconnect && previousRoomId === roomId && (onlineConnectionState === 'closed' || onlineConnectionState === 'error'));
  if(previousRoomId !== roomId) resetChatMessages();
  onlineRoomId = roomId;
  updateAnalyzerToolAvailability();
  onlineRoleCode = 'local';
  onlineConnected = false;
  onlineConnectionState = 'connecting';
  onlinePlayers = emptyOnlinePlayers();
  onlineAssignedSeats = {white:false, black:false};
  onlineGameStarted = false;
  onlineGameStartedAt = null;
  onlineGameEnded = false;
  onlineGameResult = '*';
  onlineGameEndReason = null;
  onlineGameWinner = null;
  onlineDrawOffer = null;
  onlineRoomTimeControl = null;
  onlineRoomGameSetup = null;
  onlineRatingState = null;
  onlineHeadToHead = null;
  onlineRematchState = null;
  resetOnlineGameReactionState();
  rematchActionBusy = false;
  rematchAutoOpenWhenReady = false;
  rematchLastError = '';
  onlinePendingGameSetupMessageId = null;
  onlineCanSetTimeControl = false;
  onlineCreatedByMe = false;
  onlinePendingPublicGameMessageId = null;
  onlineAutoSyncedInitialSetup = false;
  onlineAutoSyncedInitialTime = false;
  onlineOrientationRoleApplied = null;
  onlinePendingTimeControlMessageId = null;
  onlinePendingStartMessageId = null;
  pendingDailyMove = null;
  applyingRemoteMove = false;
  onlineLastMoveMessageId = null;
  onlineClockSync = null;
  onlineLastPongAt = 0;
  onlineLastFullSyncAt = 0;
  onlineLastPingSentAt = 0;
  onlineRoundTripMs = null;
  onlineMoveTimings.clear();
  onlineSeatClaimSent = false;
  onlineReconnectSuppressed = false;
  onlineRoomCancelled = false;
  onlinePublicGame = false;
  onlineOpenOffer = false;
  onlineOpenOfferStatus = 'none';
  if(!opts.reconnect) onlineDailyLoginPrompted = false;
  onlineLastMessage = onlineSpectatorOnly ? 'Öffentliche Partie wird im Zuschauermodus geöffnet.' : 'Online-Raum wird verbunden.';
  updateInviteUrlInAddressBar(roomId);
  updateOnlineUi();
  closeOnlineSocket();

  let wsUrl;
  try{
    wsUrl = getWebSocketUrl(roomId);
  } catch(err){
    onlineConnected = false;
    onlineConnectionState = 'error';
    onlineLastMessage = err.message || 'Kein Online-Server erreichbar.';
    updateOnlineUi();
    return;
  }

  try{
    onlineSocket = new WebSocket(wsUrl);
  } catch(err){
    onlineConnected = false;
    onlineConnectionState = 'error';
    onlineLastMessage = 'WebSocket konnte nicht geöffnet werden.';
    updateOnlineUi();
    return;
  }

  onlineSocket.addEventListener('open', () => {
    onlineConnected = false;
    onlineConnectionState = 'authenticating';
    onlineLastMessage = onlineSpectatorOnly ? 'Verbindung geöffnet. Zuschauerzugang wird bestätigt.' : 'Verbindung geöffnet. Spielerplatz wird bestätigt.';
    updateOnlineUi();
  });
  onlineSocket.addEventListener('message', ev => {
    const messageReceivedAt = performance.now();
    let msg = null;
    try{ msg = JSON.parse(ev.data); } catch(_){ return; }
    if(msg.type === 'pong'){
      const now = Date.now();
      onlineLastPongAt = now;
      const echoedClientTs = Number(msg.clientTs || 0);
      if(Number.isFinite(echoedClientTs) && echoedClientTs > 0){
        onlineRoundTripMs = Math.max(0, now - echoedClientTs);
        recordOnlinePerformance('roundTripMs', onlineRoundTripMs);
      } else if(onlineLastPingSentAt){
        onlineRoundTripMs = Math.max(0, now - onlineLastPingSentAt);
        recordOnlinePerformance('roundTripMs', onlineRoundTripMs);
      }
      return;
    }
    if(Number.isFinite(Number(msg.serverProcessingMs))){
      recordOnlinePerformance('serverMoveMs', Number(msg.serverProcessingMs));
    }
    if(msg.type === 'move_ack' && msg.messageId && onlineMoveTimings.has(String(msg.messageId))){
      const timing = onlineMoveTimings.get(String(msg.messageId));
      onlineMoveTimings.delete(String(msg.messageId));
      recordOnlinePerformance('moveAckMs', performance.now() - timing.sentAt);
    }
    if(['hello_state','room_state','state','sync'].includes(msg.type)) onlineLastFullSyncAt = Date.now();
    if(msg.type === 'room_cancelled'){
      applyRoomCancelled(msg.message || 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.');
      return;
    }
    if(msg.type === 'seat_challenge'){
      sendSeatClaim();
      return;
    }
    if(msg.type === 'seat_replaced'){
      onlineReconnectSuppressed = true;
      clearSeatCredentials(onlineRoomId);
      onlineConnected = false;
      onlineConnectionState = 'closed';
      onlineLastMessage = msg.message || 'Dieser Spielerplatz wurde in einer neuen Verbindung geöffnet.';
      updateOnlineUi();
      try{ onlineSocket.close(); } catch(_){}
      return;
    }
    if(msg.type === 'hello'){
      if(msg.seatDenied) clearSeatCredentials(onlineRoomId);
      if(msg.spectatorMode === true) onlineSpectatorOnly = true;
      if((msg.role === 'w' || msg.role === 'b') && msg.seatToken) saveSeatCredentials(onlineRoomId, msg.role, msg.seatToken);
      onlineConnected = true;
      onlineConnectionState = 'connected';
      onlineLastMessage = msg.seatDenied ? (msg.message || 'Spielerplatz konnte nicht übernommen werden; Zuschauerrolle aktiv.') : (onlineSpectatorOnly ? 'Zuschauerzugang verbunden.' : 'Mit Lobby verbunden.');
      if(onlineDesiredGameSetupForNewRoom && !onlineSpectatorOnly){
        setTimeout(syncCurrentGameSetupToOnline, 180);
        setTimeout(syncCurrentGameSetupToOnline, 750);
      }
      const helloReceivedAt = Date.now();
      setTimeout(() => {
        if(onlineConnected && onlineLastFullSyncAt < helloReceivedAt) requestOnlineState();
      }, 1200);
      startOnlineStatePolling();
    }
    if(msg.type === 'error'){
      onlineLastMessage = msg.message || ('Online-Fehler: ' + (msg.code || 'Unbekannt'));
      if(msg.code === 'PUBLIC_SPECTATOR_ACCESS_UNAVAILABLE' || msg.code === 'PUBLIC_GAME_VISIBILITY_REVOKED' || String(msg.code || '').indexOf('OPEN_OFFER_') === 0) onlineReconnectSuppressed = true;
      if(String(msg.code || '').indexOf('CHAT_') === 0) setChatStatus(msg.message || 'Chat-Fehler.', true);
      if(String(msg.code || '').indexOf('REMATCH_') === 0){
        rematchActionBusy = false;
        rematchAutoOpenWhenReady = false;
        rematchLastError = msg.message || 'Die Revanche konnte nicht verarbeitet werden.';
        updateRematchUi();
      }
      if(msg.code === 'start_requires_time_control') onlinePendingStartMessageId = null;
      if(String(msg.code || '').indexOf('PUBLIC_GAME_') === 0 || msg.code === 'ONLY_CREATOR_CAN_SET_PUBLIC_GAME' || msg.code === 'GAME_ALREADY_ENDED') onlinePendingPublicGameMessageId = null;
      updateOnlineUi();
      if(statusEl){
        statusEl.textContent = onlineLastMessage;
        setTimeout(refreshHeaderStatusFromState, 3200);
      }
      return;
    }

    const previousTime = onlineRoomTimeControl ? Object.assign({}, onlineRoomTimeControl) : null;
    const previousStarted = onlineGameStarted;
    let orientationChanged = false;
    let handled = false;
    let shouldAutoOpenRematch = false;

    const incomingRoom = extractOnlineRoom(msg);
    if(incomingRoom){ onlineRoomId = cleanRoomId(incomingRoom) || onlineRoomId; handled = true; }

    const incomingRole = extractOnlineRole(msg);
    if(incomingRole){
      onlineRoleCode = incomingRole;
      orientationChanged = applyOnlineOrientationForRole(onlineRoleCode);
      handled = true;
    }

    if(Object.prototype.hasOwnProperty.call(msg, 'canSetTimeControl')){
      onlineCanSetTimeControl = !!msg.canSetTimeControl;
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'createdByMe')){
      onlineCreatedByMe = !!msg.createdByMe;
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'publicGame')){
      onlinePublicGame = !!msg.publicGame;
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'openOffer')){
      onlineOpenOffer = !!msg.openOffer;
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'openOfferStatus')){
      onlineOpenOfferStatus = String(msg.openOfferStatus || 'none');
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'ratedRequested')){
      onlineRatedRequested = msg.ratedRequested !== false;
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'spectatorMode') && msg.spectatorMode){
      onlineSpectatorOnly = true;
      handled = true;
    }

    const players = extractOnlinePlayers(msg);
    if(players){
      onlinePlayers = normalizeOnlinePlayers(players);
      handled = true;
    }
    if(msg.assigned || (msg.state && msg.state.assigned) || (msg.roomState && msg.roomState.assigned)){
      const assigned = msg.assigned || (msg.state && msg.state.assigned) || (msg.roomState && msg.roomState.assigned) || {};
      onlineAssignedSeats = {white:!!assigned.white, black:!!assigned.black};
      handled = true;
    }

    const incomingGameSetup = extractOnlineGameSetup(msg);
    if(incomingGameSetup){
      applyGameSetupFromOnline(incomingGameSetup);
      handled = true;
    }

    const incomingTimeControl = extractOnlineTimeControl(msg);
    if(incomingTimeControl){
      applyTimeControlFromOnline(incomingTimeControl);
      handled = true;
    }

    const incomingGame = extractOnlineGame(msg);
    if(incomingGame){
      applyOnlineGameState(incomingGame);
      handled = true;
    }

    const incomingRating = extractOnlineRatingState(msg);
    if(incomingRating){
      applyOnlineRatingState(incomingRating);
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'headToHead')){
      onlineHeadToHead = normalizeHeadToHeadState(msg.headToHead);
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'rematch')){
      onlineRematchState = normalizeRematchState(msg.rematch);
      rematchActionBusy = false;
      rematchLastError = '';
      shouldAutoOpenRematch = !!(rematchAutoOpenWhenReady && onlineRematchState && onlineRematchState.status === 'ready' && onlineRematchState.roomId);
      handled = true;
    }
    if(Object.prototype.hasOwnProperty.call(msg, 'gameReactions')){
      applyOnlineGameReactionState(msg.gameReactions);
      handled = true;
    }

    const incomingDrawOffer = extractOnlineDrawOffer(msg);
    if(incomingDrawOffer){
      applyOnlineDrawOffer(incomingDrawOffer);
      handled = true;
    }

    const incomingMoves = extractOnlineMoves(msg);
    const appliedMoveCount = applyOnlineMoveList(incomingMoves, messageReceivedAt);
    if(incomingMoves.length) handled = true;

    const incomingMove = extractOnlineMove(msg);
    const appliedSingleMove = incomingMove ? applyOnlineMove(incomingMove, messageReceivedAt) : false;
    if(incomingMove) handled = true;

    const incomingClock = extractOnlineClock(msg);
    if(incomingClock){
      applyOnlineClockState(incomingClock);
      handled = true;
    }

    let premoveExecuted = false;
    if((appliedMoveCount || appliedSingleMove) && queuedPremove){
      premoveExecuted = executeQueuedPremove();
    }

    const incomingChatHistory = extractOnlineChatHistory(msg);
    if(incomingChatHistory){
      applyChatHistory(incomingChatHistory);
      setChatStatus('Chat ist verbunden. Die letzten 80 Nachrichten bleiben gespeichert.', false);
      handled = true;
    }

    const incomingChatMessage = extractOnlineChatMessage(msg);
    if(incomingChatMessage){
      appendChatMessage(incomingChatMessage);
      setChatStatus('Chat ist verbunden. Die letzten 80 Nachrichten bleiben gespeichert.', false);
      handled = true;
    }

    if(msg.type === 'game_setup_ack'){
      onlinePendingGameSetupMessageId = null;
      if(onlineDesiredGameSetupForNewRoom && sameGameSetup(currentGameSetup, onlineDesiredGameSetupForNewRoom)){
        onlineDesiredGameSetupForNewRoom = null;
      }
      handled = true;
    }
    if(msg.type === 'time_control_ack'){
      onlinePendingTimeControlMessageId = null;
      handled = true;
    }
    if(msg.type === 'public_game_ack'){
      onlinePendingPublicGameMessageId = null;
      if(Object.prototype.hasOwnProperty.call(msg, 'publicGame')) onlinePublicGame = !!msg.publicGame;
      handled = true;
    }
    if((msg.type === 'start_game_ack' || (incomingGame && incomingGame.started)) && onlineGameStarted){
      onlinePendingStartMessageId = null;
      handled = true;
    }

    const knownStateTypes = ['seat_challenge','seat_replaced','hello','hello_state','lobby','room_state','state','sync','game_setup','game_setup_ack','time_control','time_control_set','time_control_ack','game_started','game_state','start_game_ack','move','move_ack','move_applied','clock','clock_sync','draw_offer','draw_response','game_finished','resignation','rematch_state','game_reaction_state','player_name','public_game_ack','chat_message','chat_ack','pong'];
    if(!handled && !knownStateTypes.includes(msg.type)) return;

    onlineConnected = true;
    onlineConnectionState = 'connected';

    if(msg.type === 'hello' && msg.seatDenied && msg.message) onlineLastMessage = msg.message;
    else if(premoveExecuted) onlineLastMessage = 'Premove wurde sofort ausgeführt und übertragen.';
    else if(appliedMoveCount || appliedSingleMove) onlineLastMessage = 'Online-Zug wurde übernommen.';
    else if(msg.type === 'move_ack') onlineLastMessage = 'Zug vom Server bestätigt.';
    else if(msg.type === 'draw_offer') onlineLastMessage = 'Remisangebot wurde aktualisiert.';
    else if(msg.type === 'draw_response') onlineLastMessage = 'Remisangebot wurde beantwortet.';
    else if(msg.type === 'rematch_state') onlineLastMessage = 'Revanche-Status wurde aktualisiert.';
    else if(msg.type === 'game_reaction_state') onlineLastMessage = 'Partie-Reaktion wurde aktualisiert.';
    else if(msg.type === 'game_finished' || msg.type === 'resignation') onlineLastMessage = 'Online-Partie beendet.';
    else if(incomingGame && onlineGameStarted && !previousStarted) onlineLastMessage = isDailyTimeControl() ? 'Daily-Partie wurde automatisch gestartet.' : 'Online-Partie wurde gestartet.';
    else if(incomingTimeControl && !sameTimeControl(previousTime, incomingTimeControl)){
      if(incomingTimeControl.updatedByRole && incomingTimeControl.updatedByRole === onlineRoleCode) onlineLastMessage = 'Bedenkzeit wurde bestätigt und an die Lobby verteilt.';
      else onlineLastMessage = 'Bedenkzeit aus der Lobby wurde übernommen.';
    } else if(msg.type === 'time_control_ack') onlineLastMessage = 'Bedenkzeit vom Server bestätigt.';
    else if(msg.type === 'public_game_ack') onlineLastMessage = onlinePublicGame ? 'Zuschauerfreigabe wurde aktiviert.' : 'Zuschauerfreigabe wurde aufgehoben.';
    else if(onlineGameStarted) onlineLastMessage = 'Online-Partie läuft.';
    else if(isOnlineSideConnected('w') && isOnlineSideConnected('b')) onlineLastMessage = 'Beide Spieler sind in der Lobby.';
    else if(onlineOpenOffer && onlineOpenOfferStatus === 'open' && onlineCreatedByMe) onlineLastMessage = 'Dein Partieangebot ist offen. Warte auf einen Gegner.';
    else if(onlineRoleCode === 'w') onlineLastMessage = 'Du hast die Partie erstellt. Warte auf Schwarz.';
    else if(onlineRoleCode === 'b') onlineLastMessage = 'Du bist der Partie beigetreten. Warte auf Partiestart durch Weiß.';
    else if(onlineRoleCode === 'spectator') onlineLastMessage = onlineSpectatorOnly ? 'Du schaust dieser öffentlichen Partie zu.' : 'Der Raum ist bereits mit Weiß und Schwarz besetzt.';
    if(msg.type === 'hello' && restoringInterruptedConnection && !msg.seatDenied) onlineLastMessage = 'Verbindung wiederhergestellt.';

    if(!onlineSpectatorOnly && !onlineAutoSyncedInitialSetup && (onlineRoleCode === 'w' || onlineCanSetTimeControl) && (!incomingGameSetup || onlineDesiredGameSetupForNewRoom) && !onlineGameStarted){
      onlineAutoSyncedInitialSetup = true;
      setTimeout(syncCurrentGameSetupToOnline, 80);
    }
    if(!onlineSpectatorOnly && !onlineAutoSyncedInitialTime && (onlineRoleCode === 'w' || onlineCanSetTimeControl) && !incomingTimeControl && timeMode && !onlineGameStarted){
      onlineAutoSyncedInitialTime = true;
      setTimeout(syncCurrentTimeControlToOnline, 100);
    }
    if(orientationChanged) renderBoard();
    updateOnlineUi();
    if(onlineAuthToken && onlineAuthUser && isDailyTimeControl() && ['game_started','move','move_ack','move_applied','game_finished','resignation'].includes(msg.type)){
      setTimeout(() => loadDailyGames({silent:true}).catch(() => {}), 250);
    }
    if(msg.type === 'hello' && restoringInterruptedConnection && !msg.seatDenied && statusEl){
      statusEl.textContent = 'Verbindung wiederhergestellt.';
      setTimeout(refreshHeaderStatusFromState, 2500);
    }
    if(shouldAutoOpenRematch) setTimeout(openReadyRematchRoom, 180);
    if(msg.type === 'hello' && msg.seatCode === 'DAILY_ACCOUNT_REQUIRED' && !onlineAuthUser){
      if(statusEl) statusEl.textContent = msg.message || 'Daily Chess erfordert einen Login.';
      setTimeout(() => openAuthDialog('login'), 120);
    }
    if(msg.type === 'hello' && msg.seatCode === 'ROOM_CREATOR_ACCOUNT_REQUIRED'){
      saveAuthState('', null);
      if(statusEl) statusEl.textContent = msg.message || 'Zum Erstellen einer Partie ist ein Mitglieder-Account erforderlich.';
      setTimeout(() => openAuthDialog('login'), 120);
    }
    if(msg.type === 'hello' && msg.seatCode === 'INVITATION_ACCEPTANCE_REQUIRED'){
      if(statusEl) statusEl.textContent = msg.message || 'Bitte beantworte die Daily-Einladung unter „Meine Partien“.';
      setTimeout(() => {
        if(onlineAuthToken && onlineAuthUser) openDailyGamesDialog(false);
        else openAuthDialog('login');
      }, 120);
    }
  });
  onlineSocket.addEventListener('close', event => {
    onlineConnected = false;
    queuedPremove = null;
    selected = null;
    updatePremoveUi();
    onlineConnectionState = onlineRoomCancelled ? 'cancelled' : 'closed';
    if(event && event.code === 4004){
      onlineRoomCancelled = true;
      onlineReconnectSuppressed = true;
      onlineLastMessage = 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
    }
    if(event && event.code === 4001){
      onlineReconnectSuppressed = true;
      clearSeatCredentials(onlineRoomId);
    }
    if(event && event.code === 4003){
      onlineReconnectSuppressed = true;
      onlineLastMessage = 'Dieser öffentliche Zuschauerzugang ist nicht mehr verfügbar.';
    }
    if(!onlineReconnectSuppressed) onlineLastMessage = 'Verbindung zum Spielraum unterbrochen – Wiederverbindung läuft automatisch.';
    updateOnlineUi();
    renderBoard();
    if(onlineRoomId && !onlineReconnectSuppressed){
      onlineReconnectTimer = setTimeout(() => connectOnlineRoom(onlineRoomId, {reconnect:true, spectatorOnly:onlineSpectatorOnly, publicWatchId:onlinePublicWatchId}), opts.reconnect ? 3500 : 2000);
    }
  });
  onlineSocket.addEventListener('error', () => {
    onlineConnected = false;
    queuedPremove = null;
    selected = null;
    updatePremoveUi();
    onlineConnectionState = 'error';
    onlineLastMessage = 'Verbindung zum Spielraum fehlgeschlagen.';
    updateOnlineUi();
    renderBoard();
  });
}
