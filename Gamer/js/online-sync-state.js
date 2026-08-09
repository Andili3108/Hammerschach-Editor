'use strict';

function closeOnlineSocket(){
  if(queuedPremove) cancelQueuedPremove({silent:true,render:false});
  if(onlineReconnectTimer){ clearTimeout(onlineReconnectTimer); onlineReconnectTimer = null; }
  if(onlineStatePollTimer){ clearInterval(onlineStatePollTimer); onlineStatePollTimer = null; }
  if(onlineSocket){
    try{ onlineSocket.onclose = null; onlineSocket.close(); } catch(_){}
    onlineSocket = null;
  }
}

function requestOnlineState(){
  if(!onlineRoomId || !onlineConnected) return false;
  const sent = sendOnlineMessage({type:'request_state'});
  if(sent) onlineLastFullSyncAt = Date.now();
  return sent;
}
function startOnlineStatePolling(){
  if(onlineStatePollTimer) clearInterval(onlineStatePollTimer);
  onlineLastPongAt = Date.now();
  onlineStatePollTimer = setInterval(() => {
    if(document.visibilityState !== 'visible' || !onlineRoomId || !onlineConnected) return;
    const now = Date.now();
    onlineLastPingSentAt = now;
    sendOnlineMessage({type:'ping', clientTs:now});
    const heartbeatMissing = now - onlineLastPongAt > ONLINE_HEARTBEAT_TIMEOUT_MS;
    const waitingNeedsSync = !onlineGameStarted && now - onlineLastFullSyncAt > ONLINE_WAITING_STATE_SYNC_MS;
    const dailyNeedsSync = isDailyTimeControl() && now - onlineLastFullSyncAt > ONLINE_DAILY_STATE_SYNC_MS;
    if(heartbeatMissing || waitingNeedsSync || dailyNeedsSync) requestOnlineState();
  }, ONLINE_HEARTBEAT_INTERVAL_MS);
}
function normalizeIncomingTimeControl(candidate){
  if(!candidate) return null;
  if(candidate.timeControl) return normalizeIncomingTimeControl(candidate.timeControl);
  if(candidate.time_control) return normalizeIncomingTimeControl(candidate.time_control);
  if(candidate.clock) return normalizeIncomingTimeControl(candidate.clock);
  const key = candidate.key || candidate.value || candidate.timeKey || candidate.time_control_key;
  let baseSeconds = Number(candidate.baseSeconds ?? candidate.base_seconds ?? candidate.base ?? candidate.initial ?? 0);
  let incrementSeconds = Number(candidate.incrementSeconds ?? candidate.increment_seconds ?? candidate.increment ?? candidate.inc ?? 0);
  let normalizedKey = key ? String(key) : '';
  if(!normalizedKey && baseSeconds > 0) normalizedKey = Math.floor(baseSeconds) + '+' + Math.floor(incrementSeconds || 0);
  if(!normalizedKey) return null;
  if((!baseSeconds || !Number.isFinite(baseSeconds)) && normalizedKey.includes('+')){
    const parts = normalizedKey.split('+').map(v => parseInt(v, 10));
    baseSeconds = parts[0] || 0;
    incrementSeconds = parts[1] || 0;
  }
  const category = candidate.category || candidate.timeCategory || candidate.time_category || '';
  const requestedMode = String(candidate.mode || candidate.clockMode || candidate.clock_mode || '').toLowerCase();
  const mode = requestedMode === 'daily' || category === 'daily' ? 'daily' : 'live';
  return {
    key: normalizedKey,
    category,
    mode,
    label: candidate.label || candidate.timeLabel || candidate.time_label || '',
    daysPerMove: mode === 'daily' ? Math.max(1, Math.floor(Number(candidate.daysPerMove ?? candidate.days_per_move ?? (baseSeconds / 86400)) || 1)) : 0,
    baseSeconds: Math.floor(baseSeconds || 0),
    incrementSeconds: Math.floor(incrementSeconds || 0),
    updatedByRole: candidate.updatedByRole || candidate.updated_by_role || candidate.byRole || ''
  };
}
function extractOnlineTimeControl(msg){
  return normalizeIncomingTimeControl(
    msg.timeControl || msg.time_control ||
    (msg.state && (msg.state.timeControl || msg.state.time_control)) ||
    (msg.roomState && (msg.roomState.timeControl || msg.roomState.time_control)) ||
    (msg.lobby && (msg.lobby.timeControl || msg.lobby.time_control)) ||
    (msg.type === 'time_control' || msg.type === 'time_control_set' || msg.type === 'set_time_control' || msg.type === 'time_control_ack' ? msg : null)
  );
}
function extractOnlineGameSetup(msg){
  if(!msg) return null;
  return msg.gameSetup || msg.game_setup || msg.startPosition || msg.start_position ||
    (msg.game && (msg.game.gameSetup || msg.game.game_setup || msg.game.startPosition || msg.game.start_position)) ||
    (msg.state && (msg.state.gameSetup || msg.state.game_setup || msg.state.startPosition || msg.state.start_position)) ||
    (msg.roomState && (msg.roomState.gameSetup || msg.roomState.game_setup || msg.roomState.startPosition || msg.roomState.start_position)) ||
    (msg.lobby && (msg.lobby.gameSetup || msg.lobby.game_setup || msg.lobby.startPosition || msg.lobby.start_position)) ||
    (msg.type === 'game_setup' || msg.type === 'game_setup_ack' || msg.type === 'set_game_setup' ? msg : null);
}
function shouldKeepLocalGameSetupForNewRoom(incomingSetup){
  if(!onlineDesiredGameSetupForNewRoom) return false;
  if(onlineGameStarted || actualMoveCount() > 0 || firstMoveDone || clockRunning || timeLost) return false;
  const desired = normalizeGameSetup(onlineDesiredGameSetupForNewRoom);
  const incoming = normalizeGameSetup(incomingSetup || {});
  if(sameGameSetup(incoming, desired)) return false;
  return sameGameSetup(currentGameSetup, desired);
}
function applyGameSetupFromOnline(gameSetup){
  const normalized = normalizeGameSetup(gameSetup || {});
  onlineRoomGameSetup = normalized;

  /*
    Beim Erstellen eines neuen Raums liefert der Worker zunächst seinen Default-Zustand
    aus. Der darf eine lokal gewählte Freestyle-Stellung nicht zurück auf Klassisch setzen.
    Stattdessen behalten wir die lokale Auswahl und senden sie direkt an den Raum.
  */
  if(shouldKeepLocalGameSetupForNewRoom(normalized)){
    onlinePendingGameSetupMessageId = null;
    onlineAutoSyncedInitialSetup = true;
    setTimeout(syncCurrentGameSetupToOnline, 50);
    setTimeout(syncCurrentGameSetupToOnline, 450);
    updateVariantUi();
    return;
  }

  onlinePendingGameSetupMessageId = null;
  if(onlineDesiredGameSetupForNewRoom && sameGameSetup(normalized, onlineDesiredGameSetupForNewRoom)){
    onlineDesiredGameSetupForNewRoom = null;
  }
  applyingRemoteGameSetup = true;
  try{
    applyGameSetup(normalized, {save:false, forceReset: actualMoveCount() === 0 && !onlineGameStarted});
  } finally {
    applyingRemoteGameSetup = false;
  }
}
function normalizeIncomingGame(candidate){
  if(!candidate) return null;
  if(candidate.game) return normalizeIncomingGame(candidate.game);
  if(candidate.gameState) return normalizeIncomingGame(candidate.gameState);
  const hasStartedFlag = Object.prototype.hasOwnProperty.call(candidate, 'started') || Object.prototype.hasOwnProperty.call(candidate, 'gameStarted') || Object.prototype.hasOwnProperty.call(candidate, 'isStarted');
  const hasEndedFlag = Object.prototype.hasOwnProperty.call(candidate, 'ended') || Object.prototype.hasOwnProperty.call(candidate, 'gameEnded') || Object.prototype.hasOwnProperty.call(candidate, 'isEnded');
  if(!hasStartedFlag && !hasEndedFlag && candidate.type !== 'game_started' && candidate.type !== 'start_game_ack') return null;
  return {
    started: !!(candidate.started ?? candidate.gameStarted ?? candidate.isStarted ?? (candidate.type === 'game_started' || candidate.type === 'start_game_ack')),
    startedAt: candidate.startedAt || candidate.started_at || candidate.time || null,
    ended: !!(candidate.ended ?? candidate.gameEnded ?? candidate.isEnded ?? false),
    endedAt: candidate.endedAt || candidate.ended_at || null,
    result: candidate.result || '*',
    winner: candidate.winner || null,
    endReason: candidate.endReason || candidate.end_reason || null
  };
}
function extractOnlineGame(msg){
  return normalizeIncomingGame(
    msg.game || msg.gameState ||
    (msg.state && (msg.state.game || msg.state.gameState)) ||
    (msg.roomState && (msg.roomState.game || msg.roomState.gameState)) ||
    (msg.lobby && (msg.lobby.game || msg.lobby.gameState)) ||
    (msg.type === 'game_started' || msg.type === 'start_game_ack' ? msg : null) ||
    (Object.prototype.hasOwnProperty.call(msg, 'started') || Object.prototype.hasOwnProperty.call(msg, 'gameStarted') || Object.prototype.hasOwnProperty.call(msg, 'ended') || Object.prototype.hasOwnProperty.call(msg, 'gameEnded') ? msg : null)
  );
}

function normalizeIncomingDrawOffer(candidate){
  if(!candidate || typeof candidate !== 'object') return null;
  const byRole = candidate.byRole || candidate.by_role || candidate.side || candidate.role || '';
  if(byRole !== 'w' && byRole !== 'b') return null;
  if(candidate.offered === false || candidate.active === false) return null;
  return {
    offered: true,
    byRole,
    byPlayer: candidate.byPlayer || candidate.by_player || candidate.playerId || null,
    offeredAt: candidate.offeredAt || candidate.offered_at || candidate.time || null
  };
}
function extractOnlineDrawOffer(msg){
  if(!msg) return null;
  const explicitEmpty = Object.prototype.hasOwnProperty.call(msg, 'drawOffer') && !msg.drawOffer;
  if(explicitEmpty) return {offered:false};
  const candidate = msg.drawOffer || msg.draw_offer ||
    (msg.state && (msg.state.drawOffer || msg.state.draw_offer)) ||
    (msg.roomState && (msg.roomState.drawOffer || msg.roomState.draw_offer)) ||
    (msg.lobby && (msg.lobby.drawOffer || msg.lobby.draw_offer)) ||
    null;
  const normalized = normalizeIncomingDrawOffer(candidate);
  return normalized || (candidate === null && Object.prototype.hasOwnProperty.call(msg, 'drawOffer') ? {offered:false} : null);
}
function applyOnlineDrawOffer(drawOffer){
  if(!drawOffer) return false;
  onlineDrawOffer = drawOffer.offered === false ? null : drawOffer;
  updateGameActionButtons();
  return true;
}
function formatOnlineEndMessage(game){
  if(!game) return 'Online-Partie beendet';
  const winnerName = game.winner === 'w' ? 'Weiß' : game.winner === 'b' ? 'Schwarz' : '';
  if(game.endReason === 'resignation') return 'Aufgabe — ' + (winnerName ? winnerName + ' gewinnt' : 'Partie beendet');
  if(game.endReason === 'draw_agreed') return 'Remis vereinbart — 1/2-1/2';
  if(game.endReason === 'insufficient_material') return 'Remis — unzureichendes Mattmaterial.';
  if(game.endReason === 'fifty_move_rule') return 'Remis — 50-Züge-Regel.';
  if(game.endReason === 'threefold_repetition') return 'Remis — dreifache Stellungswiederholung.';
  if(game.endReason === 'checkmate') return 'Schachmatt — ' + (winnerName ? winnerName + ' gewinnt' : 'Partie beendet');
  if(game.endReason === 'stalemate') return 'Patt — Unentschieden';
  if(game.endReason === 'time') return 'Zeit abgelaufen — ' + (winnerName ? winnerName + ' gewinnt' : 'Partie beendet');
  return game.result && game.result !== '*' ? 'Online-Partie beendet — Ergebnis: ' + game.result : 'Online-Partie beendet';
}

function normalizeIncomingClock(candidate){
  if(!candidate) return null;
  if(candidate.clock) return normalizeIncomingClock(candidate.clock);
  if(candidate.clocks) return normalizeIncomingClock(candidate.clocks);
  const remaining = candidate.remaining || candidate.remain || {};
  const wRaw = candidate.wMs ?? candidate.whiteMs ?? candidate.white_ms ?? candidate.w ?? candidate.white ?? remaining.w ?? remaining.white;
  const bRaw = candidate.bMs ?? candidate.blackMs ?? candidate.black_ms ?? candidate.b ?? candidate.black ?? remaining.b ?? remaining.black;
  const wMs = Number(wRaw);
  const bMs = Number(bRaw);
  if(!Number.isFinite(wMs) || !Number.isFinite(bMs)) return null;
  const active = candidate.active || candidate.turn || candidate.side || candidate.runningSide || candidate.running_side || '';
  const normalizedActive = active === 'white' ? 'w' : active === 'black' ? 'b' : active;
  let serverNow = Number(candidate.serverNow ?? candidate.server_now ?? candidate.now ?? 0);
  if(!Number.isFinite(serverNow) || serverNow <= 0){
    const serverTime = candidate.serverTime || candidate.server_time || candidate.time;
    serverNow = serverTime ? Date.parse(serverTime) : 0;
  }
  if(!Number.isFinite(serverNow) || serverNow <= 0) serverNow = Date.now();
  return {
    wMs: Math.max(0, Math.floor(wMs)),
    bMs: Math.max(0, Math.floor(bMs)),
    active: normalizedActive === 'w' || normalizedActive === 'b' ? normalizedActive : '',
    running: !!candidate.running,
    timeLost: !!(candidate.timeLost || candidate.time_lost || candidate.flagged),
    loser: candidate.loser || '',
    winner: candidate.winner || '',
    deadlineAt: Number(candidate.deadlineAt ?? candidate.deadline_at ?? 0) || null,
    mode: String(candidate.mode || candidate.clockMode || candidate.clock_mode || ''),
    daysPerMove: Math.max(0, Math.floor(Number(candidate.daysPerMove ?? candidate.days_per_move ?? 0) || 0)),
    serverNow,
    syncedAtClient: Date.now()
  };
}
function extractOnlineClock(msg){
  if(!msg) return null;
  return normalizeIncomingClock(
    msg.clock || msg.clocks ||
    (msg.game && (msg.game.clock || msg.game.clocks)) ||
    (msg.state && (msg.state.clock || msg.state.clocks)) ||
    (msg.roomState && (msg.roomState.clock || msg.roomState.clocks)) ||
    (msg.lobby && (msg.lobby.clock || msg.lobby.clocks)) ||
    (Object.prototype.hasOwnProperty.call(msg, 'wMs') || Object.prototype.hasOwnProperty.call(msg, 'whiteMs') ? msg : null)
  );
}
function applyOnlineClockState(clockState){
  const normalized = normalizeIncomingClock(clockState);
  if(!normalized) return false;
  onlineClockSync = normalized;
  clocks = {w: normalized.wMs, b: normalized.bMs};
  clockRunning = !!(normalized.running && !normalized.timeLost);
  if(onlineGameStarted || actualMoveCount() > 0) firstMoveDone = true;
  timeLost = !!normalized.timeLost;
  if(timeLost){
    pendingDailyMove = null;
    queuedPremove = null;
    selected = null;
    updatePremoveUi();
    onlineGameEnded = true;
    onlineGameResult = normalized.winner === 'w' ? '1-0' : normalized.winner === 'b' ? '0-1' : '*';
    onlineGameEndReason = 'time';
    onlineGameWinner = normalized.winner || null;
    onlineDrawOffer = null;
    stopClock();
    clockRunning = false;
    const loser = normalized.loser === 'w' ? 'Weiß' : normalized.loser === 'b' ? 'Schwarz' : '';
    const winner = normalized.winner === 'w' ? 'Weiß' : normalized.winner === 'b' ? 'Schwarz' : '';
    if(loser && winner){
      statusEl.textContent = 'Zeit abgelaufen — ' + loser + ' verliert, ' + winner + ' gewinnt.';
      timeStatusEl.textContent = 'Zeit abgelaufen.';
    }
    playGameResultSound(onlineGameResult, onlineGameWinner);
  } else if(clockRunning){
    startClock();
  }
  updateClockDisplay();
  return true;
}

function normalizeIncomingMove(candidate){
  if(!candidate) return null;
  if(candidate.move) return normalizeIncomingMove(candidate.move);
  const from = Array.isArray(candidate.from) ? candidate.from : null;
  const to = Array.isArray(candidate.to) ? candidate.to : null;
  if(!from || !to || from.length < 2 || to.length < 2) return null;
  const fx = parseInt(from[0], 10), fy = parseInt(from[1], 10), tx = parseInt(to[0], 10), ty = parseInt(to[1], 10);
  if([fx,fy,tx,ty].some(v => !Number.isFinite(v) || v < 0 || v > 7)) return null;
  const promotionRaw = candidate.promotion ? String(candidate.promotion).toUpperCase() : null;
  return {
    ply: Number.isFinite(Number(candidate.ply)) ? Math.floor(Number(candidate.ply)) : null,
    side: candidate.side || candidate.turn || candidate.color || '',
    from: [fx, fy],
    to: [tx, ty],
    promotion: promotionRaw && ['Q','R','B','N'].includes(promotionRaw) ? promotionRaw : null,
    castle: castleSideCode(candidate),
    san: candidate.san || '',
    messageId: candidate.messageId || candidate.message_id || ''
  };
}
function extractOnlineMove(msg){
  if(!msg) return null;
  return normalizeIncomingMove(
    msg.move ||
    (msg.type === 'move' || msg.type === 'move_ack' || msg.type === 'move_applied' ? msg : null)
  );
}
function extractOnlineMoves(msg){
  const list = msg.moves || msg.moveHistory || msg.history ||
    (msg.game && (msg.game.moves || msg.game.moveHistory)) ||
    (msg.state && (msg.state.moves || msg.state.moveHistory)) ||
    (msg.roomState && (msg.roomState.moves || msg.roomState.moveHistory));
  if(!Array.isArray(list)) return [];
  return list.map(normalizeIncomingMove).filter(Boolean);
}
function sameMoveCoords(a,b){
  if(!(a && b && a.from && b.from && a.to && b.to)) return false;
  const sameFrom = a.from[0] === b.from[0] && a.from[1] === b.from[1];
  const samePromotion = String(a.promotion || '') === String(b.promotion || '');
  if(!sameFrom || !samePromotion) return false;
  const castleA = castleSideCode(a);
  const castleB = castleSideCode(b);
  if(castleA && castleB) return castleA === castleB;
  return a.to[0] === b.to[0] && a.to[1] === b.to[1];
}
function commitRemoteMove(found, promotion){
  const wasAtLatestPosition = viewIndex === masterHistory.length;
  const beforeState = buildHistoryState(masterHistory.length);
  const before = beforeState.game;
  const mv = {from:found.from, to:found.to, meta:found.meta || {}, promotion};
  const info = before.clone();
  const applied = info.makeMove(mv, false);
  mv.piece = applied.piece;
  mv.taken = applied.taken;
  mv.san = moveToSan(before, mv, info);
  masterHistory.push(mv);
  invalidateHistoryStateCache();
  cacheAdvancedHistoryState(info,beforeState.positionCounts,beforeState.captures,before.turn,applied.taken);
  /* Wer gerade eine ältere Stellung betrachtet, bleibt dort. Nur in der
     Live-Ansicht folgt das Brett automatisch dem neu eingegangenen Zug. */
  viewIndex = wasAtLatestPosition ? masterHistory.length : Math.min(viewIndex, masterHistory.length);
  lastMove = {from:mv.from, to:mv.to, meta:mv.meta || {}};
  selected = null;
  afterMoveClock(before.turn);
  playMoveSound({opponent:true, capture:mv.taken !== '.', castle:!!(mv.meta && mv.meta.castle), promotion:!!mv.promotion, check:info.inCheck(info.turn)});
  return mv;
}
function applyOnlineMove(move,messageReceivedAt){
  const normalized = normalizeIncomingMove(move);
  if(!normalized) return false;
  if(normalized.messageId && normalized.messageId === onlineLastMoveMessageId){
    onlineLastMoveMessageId = null;
  }
  const themePly = currentThemePly();
  const playedPly = actualMoveCount();
  if(normalized.ply && normalized.ply <= playedPly){
    const existing = masterHistory[themePly + normalized.ply - 1];
    if(!sameMoveCoords(existing, normalized)){
      onlineLastMessage = 'Raumzug passt nicht zur lokalen Zugliste. Raumzustand wird neu abgefragt.';
      requestOnlineState();
      updateOnlineUi();
    }
    return false;
  }
  if(normalized.ply && normalized.ply > playedPly + 1){
    onlineLastMessage = 'Zugfolge ist voraus. Raumzustand wird neu abgefragt.';
    requestOnlineState();
    updateOnlineUi();
    return false;
  }
  const g = buildGameFromHistory(masterHistory.length);
  if(normalized.side && normalized.side !== g.turn){
    onlineLastMessage = 'Empfangener Zug passt nicht zur aktuellen Seite. Raumzustand wird neu abgefragt.';
    requestOnlineState();
    updateOnlineUi();
    return false;
  }
  const found = findMatchingLegalMove(g.legalMoves(), normalized);
  if(!found){
    onlineLastMessage = 'Empfangener Zug ist lokal nicht legal. Raumzustand wird neu abgefragt.';
    requestOnlineState();
    updateOnlineUi();
    return false;
  }
  pendingDailyMove = null;
  applyingRemoteMove = true;
  try{
    commitRemoteMove(found, normalized.promotion);
  } finally {
    applyingRemoteMove = false;
  }
  scheduleBoardRender(messageReceivedAt);
  onlineLastMessage = 'Online-Zug wurde übernommen.';
  return true;
}
function applyOnlineMoveList(moves,messageReceivedAt){
  if(!Array.isArray(moves) || moves.length === 0) return 0;
  const ordered = moves.slice().sort((a,b) => {
    const ap = Number(a.ply || 0), bp = Number(b.ply || 0);
    if(ap && bp) return ap - bp;
    return 0;
  });
  let applied = 0;
  for(const move of ordered){
    const beforeLen = masterHistory.length;
    if(applyOnlineMove(move,messageReceivedAt) && masterHistory.length > beforeLen) applied++;
  }
  return applied;
}

function normalizeOnlineRatingState(candidate){
  if(!candidate || typeof candidate !== 'object') return null;
  if(candidate.rating && candidate.rating !== candidate) return normalizeOnlineRatingState(candidate.rating);
  const type = String(candidate.type || candidate.ratingType || candidate.rating_type || '');
  const label = String(candidate.label || candidate.ratingLabel || candidate.rating_label || 'Rating');
  const players = candidate.players && typeof candidate.players === 'object' ? candidate.players : {};
  const normalizePlayer = value => {
    const source = value && typeof value === 'object' ? value : {};
    const rating = Number.isFinite(Number(source.rating)) ? Math.round(Number(source.rating)) : null;
    const after = Number.isFinite(Number(source.after)) ? Math.round(Number(source.after)) : null;
    const before = Number.isFinite(Number(source.before)) ? Math.round(Number(source.before)) : null;
    const deviation = Number.isFinite(Number(source.deviation)) ? Number(source.deviation) : 350;
    const provisional = typeof source.provisional === 'boolean' ? source.provisional : deviation > RATING_PROVISIONAL_DEVIATION;
    const effective = after !== null ? after : rating;
    return {
      member:source.member !== false && (source.member === true || effective !== null || before !== null),
      rating,
      before,
      after,
      delta:Number.isFinite(Number(source.delta)) ? Math.round(Number(source.delta)) : (after !== null && before !== null ? after - before : null),
      deviation,
      provisional,
      display:String(source.display || (effective !== null ? String(effective) + (provisional ? '?' : '') : '')),
      games:Math.max(0, Math.floor(Number(source.games || 0)))
    };
  };
  return {
    rated:!!candidate.rated,
    system:String(candidate.system || 'glicko2'),
    systemVersion:Number(candidate.systemVersion || candidate.system_version || 1),
    type,
    label,
    reason:String(candidate.reason || ''),
    requested:candidate.requested !== false,
    result:String(candidate.result || ''),
    ratedAt:candidate.ratedAt || candidate.rated_at || null,
    players:{white:normalizePlayer(players.white), black:normalizePlayer(players.black)}
  };
}
function extractOnlineRatingState(msg){
  if(!msg) return null;
  return normalizeOnlineRatingState(
    msg.rating || msg.ratingState || msg.rating_state ||
    (msg.state && (msg.state.rating || msg.state.ratingState || msg.state.rating_state)) ||
    (msg.roomState && (msg.roomState.rating || msg.roomState.ratingState || msg.roomState.rating_state)) ||
    (msg.lobby && (msg.lobby.rating || msg.lobby.ratingState || msg.lobby.rating_state))
  );
}
function applyOnlineRatingState(rating){
  const normalized = normalizeOnlineRatingState(rating);
  if(!normalized) return false;
  onlineRatingState = normalized;
  updateRoomRatingUi();
  return true;
}
function ratingReasonLabel(reason){
  const labels = {
    members_required:'Ungewertet · Gast beteiligt',
    same_account:'Ungewertet · gleicher Account',
    unsupported_time_control:'Ungewertet · unbekannte Kategorie',
    time_control_required:'Bedenkzeit noch nicht gewählt',
    rating_not_enabled_for_game:'Ungewertet · ältere Partie',
    not_rated:'Ungewertet'
  };
  return labels[String(reason || '')] || 'Ungewertet';
}
function renderPlayerRatingLine(role, element){
  if(!element) return;
  const state = onlineRatingState;
  if(!onlineRoomId || !state || !state.rated){
    element.hidden = true;
    return;
  }
  const assigned = role === 'w' ? onlineAssignedSeats.white : onlineAssignedSeats.black;
  const player = role === 'w' ? state.players.white : state.players.black;
  const labelEl = element.querySelector('.player-rating-label');
  const valueEl = element.querySelector('.player-rating-value');
  element.hidden = false;
  element.classList.remove('unrated');
  if(labelEl) labelEl.textContent = state.label || 'Rating';
  if(!assigned){
    if(valueEl) valueEl.textContent = 'wartet';
    element.title = 'Spielerplatz ist noch nicht besetzt.';
    return;
  }
  let value = player.display || (player.rating !== null ? String(player.rating) + (player.provisional ? '?' : '') : '—');
  if(player.delta !== null && (onlineGameEnded || gameEnded || timeLost)){
    value += ' (' + (player.delta > 0 ? '+' : '') + player.delta + ')';
  }
  if(valueEl) valueEl.textContent = value;
  element.title = state.label + ' · gewertete Partie nach Glicko-2';
}
function updateRoomRatingUi(){
  const state = onlineRatingState;
  const bothSeats = !!(onlineAssignedSeats.white && onlineAssignedSeats.black);
  const actuallyRated = !!(onlineRoomId && state && state.rated);
  renderPlayerRatingLine('w', whitePlayerRatingEl);
  renderPlayerRatingLine('b', blackPlayerRatingEl);
  if(roomRatingStatusEl){
    if(!onlineRoomId || !state || actuallyRated){
      roomRatingStatusEl.hidden = true;
    } else {
      roomRatingStatusEl.hidden = false;
      const selectedRatedPending = !!(onlineRatedRequested && (!bothSeats || state.reason === 'time_control_required' || state.reason === 'unsupported_time_control'));
      roomRatingStatusEl.textContent = selectedRatedPending ? 'Gewertet' : 'Ungewertet';
    }
  }
}

function normalizeHeadToHeadState(value){
  if(!value || typeof value !== 'object' || value.available !== true) return null;
  return {
    available:true,
    ratingType:String(value.ratingType || value.rating_type || ''),
    label:String(value.label || ''),
    wins:Math.max(0, Math.floor(Number(value.wins || 0))),
    draws:Math.max(0, Math.floor(Number(value.draws || 0))),
    losses:Math.max(0, Math.floor(Number(value.losses || 0))),
    total:Math.max(0, Math.floor(Number(value.total || 0)))
  };
}
function headToHeadShortLabel(state){
  const labels = {
    daily_classic:'Daily Classic',
    daily_freestyle:'Daily Freestyle',
    live_classic:'Classic',
    live_rapid:'Rapid',
    live_blitz:'Blitz',
    live_freestyle:'Freestyle'
  };
  return labels[String(state && state.ratingType || '')] || String(state && state.label || 'Modus');
}
function updateHeadToHeadUi(){
  if(whiteHeadToHeadEl) whiteHeadToHeadEl.hidden = true;
  if(blackHeadToHeadEl) blackHeadToHeadEl.hidden = true;
  const state = onlineHeadToHead;
  if(!onlineRoomId || !state || !state.available || (onlineRoleCode !== 'w' && onlineRoleCode !== 'b')) return;
  const target = onlineRoleCode === 'w' ? blackHeadToHeadEl : whiteHeadToHeadEl;
  if(!target) return;
  target.textContent = 'Direktvergleich: S ' + state.wins + ' · R ' + state.draws + ' · N ' + state.losses;
  target.title = 'Bisherige beendete Partien gegen diesen Gegner in derselben Hammerschach-Kategorie.';
  target.hidden = false;
}
function normalizeRematchState(value){
  if(!value || typeof value !== 'object' || value.available !== true) return null;
  const status = ['available','requested','incoming','creating','ready','declined'].includes(String(value.status || ''))
    ? String(value.status)
    : 'available';
  return {
    available:true,
    status,
    offerId:String(value.offerId || value.offer_id || ''),
    requestedByName:cleanDisplayName(value.requestedByName || value.requested_by_name || ''),
    opponentName:cleanDisplayName(value.opponentName || value.opponent_name || ''),
    roomId:cleanRoomId(value.roomId || value.room_id || ''),
    createdAt:value.createdAt || value.created_at || null
  };
}
function updateRematchUi(){
  if(!rematchBarEl || !rematchBtn || !rematchDeclineBtn) return;
  const state = onlineRematchState;
  rematchBarEl.hidden = !state || !state.available;
  if(rematchBarEl.hidden) return;
  rematchBtn.classList.remove('ready');
  rematchDeclineBtn.hidden = true;
  rematchBtn.disabled = !!rematchActionBusy;
  rematchDeclineBtn.disabled = !!rematchActionBusy;
  if(rematchHintEl) rematchHintEl.textContent = '';

  if(state.status === 'requested'){
    rematchBtn.textContent = '✓ Revanche angefragt';
    rematchBtn.disabled = true;
    if(rematchHintEl) rematchHintEl.textContent = 'Der Gegner kann die Revanche annehmen oder ablehnen.';
  } else if(state.status === 'incoming'){
    rematchBtn.textContent = rematchActionBusy ? 'Revanche wird angenommen…' : '🔁 Revanche annehmen';
    rematchDeclineBtn.hidden = false;
    if(rematchHintEl) rematchHintEl.textContent = (state.requestedByName || 'Dein Gegner') + ' bietet dir eine Revanche mit vertauschten Farben an.';
  } else if(state.status === 'creating'){
    rematchBtn.textContent = 'Revanche wird vorbereitet…';
    rematchBtn.disabled = true;
    if(rematchHintEl) rematchHintEl.textContent = 'Bedenkzeit, Spielmodus und Wertung werden übernommen.';
  } else if(state.status === 'ready'){
    rematchBtn.textContent = '🔁 Revanche öffnen';
    rematchBtn.classList.add('ready');
    rematchBtn.disabled = !state.roomId || !!rematchActionBusy;
    if(rematchHintEl) rematchHintEl.textContent = 'Die neue Partie ist bereit. Die Farben wurden getauscht.';
  } else if(state.status === 'declined'){
    rematchBtn.textContent = 'Revanche abgelehnt';
    rematchBtn.disabled = true;
    if(rematchHintEl) rematchHintEl.textContent = 'Für diese beendete Partie wird keine Revanche gestartet.';
  } else {
    rematchBtn.textContent = rematchActionBusy ? 'Revanche wird angefragt…' : '🔁 Revanche anbieten';
    if(rematchHintEl) rematchHintEl.textContent = 'Gleiche Einstellungen, vertauschte Farben.';
  }
  if(rematchLastError && rematchHintEl) rematchHintEl.textContent = '⚠️ ' + rematchLastError;
}
function openReadyRematchRoom(){
  const roomId = cleanRoomId(onlineRematchState && onlineRematchState.roomId || '');
  if(!roomId) return;
  rematchActionBusy = false;
  rematchAutoOpenWhenReady = false;
  onlineHeadToHead = null;
  onlineRematchState = null;
  onlineDesiredGameSetupForNewRoom = null;
  onlineDesiredPublicGameForNewRoom = false;
  onlineDesiredOpenOfferForNewRoom = false;
  connectOnlineRoom(roomId, {reconnect:true, spectatorOnly:false});
}
function handleRematchButtonClick(){
  const state = onlineRematchState;
  if(!state || rematchActionBusy) return;
  if(state.status === 'ready'){
    openReadyRematchRoom();
    return;
  }
  if(state.status === 'incoming'){
    rematchLastError = '';
    rematchActionBusy = true;
    rematchAutoOpenWhenReady = true;
    updateRematchUi();
    if(!sendOnlineMessage({type:'respond_rematch', accepted:true})){
      rematchActionBusy = false;
      rematchAutoOpenWhenReady = false;
      updateRematchUi();
    }
    return;
  }
  if(state.status !== 'available') return;
  rematchLastError = '';
  rematchActionBusy = true;
  updateRematchUi();
  if(!sendOnlineMessage({type:'request_rematch'})){
    rematchActionBusy = false;
    updateRematchUi();
  }
}
function handleRematchDeclineClick(){
  const state = onlineRematchState;
  if(!state || state.status !== 'incoming' || rematchActionBusy) return;
  rematchLastError = '';
  rematchActionBusy = true;
  rematchAutoOpenWhenReady = false;
  updateRematchUi();
  if(!sendOnlineMessage({type:'respond_rematch', accepted:false})){
    rematchActionBusy = false;
    updateRematchUi();
  }
}
if(rematchBtn) rematchBtn.addEventListener('click', handleRematchButtonClick);
if(rematchDeclineBtn) rematchDeclineBtn.addEventListener('click', handleRematchDeclineClick);

function extractOnlinePlayers(msg){
  return msg.players || (msg.state && msg.state.players) || (msg.roomState && msg.roomState.players) || (msg.lobby && msg.lobby.players) || null;
}
function extractOnlineRole(msg){
  return msg.role || msg.myRole || msg.assignedRole || (msg.me && msg.me.role) || (msg.self && msg.self.role) || (msg.state && (msg.state.role || msg.state.myRole)) || '';
}
function extractOnlineRoom(msg){
  return msg.room || msg.roomId || (msg.state && (msg.state.room || msg.state.roomId)) || (msg.roomState && (msg.roomState.room || msg.roomState.roomId)) || '';
}
function applyRoomCancelled(message){
  pendingDailyMove = null;
  queuedPremove = null;
  selected = null;
  updatePremoveUi();
  onlineRoomCancelled = true;
  onlinePublicGame = false;
  onlineOpenOffer = false;
  onlineOpenOfferStatus = 'withdrawn';
  onlineCreatedByMe = false;
  onlinePendingPublicGameMessageId = null;
  onlineReconnectSuppressed = true;
  onlineConnected = false;
  onlineConnectionState = 'cancelled';
  onlineRoleCode = 'local';
  onlineAssignedSeats = {white:false, black:false};
  onlineGameStarted = false;
  onlineGameEnded = false;
  onlineLastMessage = message || 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
  clearSeatCredentials(onlineRoomId);
  if(onlineReconnectTimer){ clearTimeout(onlineReconnectTimer); onlineReconnectTimer = null; }
  if(onlineStatePollTimer){ clearInterval(onlineStatePollTimer); onlineStatePollTimer = null; }
  updateOnlineUi();
  renderBoard();
  if(statusEl) statusEl.textContent = onlineLastMessage;
  if(onlineSocket){ try{ onlineSocket.close(); } catch(_){} }
}
