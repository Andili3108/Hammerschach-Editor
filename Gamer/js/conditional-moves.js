'use strict';

function normalizeConditionalMoveRecord(value){
  if(!value || typeof value !== 'object') return null;
  const normalizeMove = move => {
    const normalized = normalizeIncomingMove(move || null);
    if(!normalized) return null;
    return {
      from:normalized.from.slice(),
      to:normalized.to.slice(),
      promotion:normalized.promotion || null,
      castle:normalized.castle || null,
      san:String(normalized.san || '').slice(0,40)
    };
  };
  const expected = normalizeMove(value.expectedMove || value.expected_move || value.expected);
  const reply = normalizeMove(value.replyMove || value.reply_move || value.reply);
  const basePly = Math.max(0,Math.floor(Number(value.basePly ?? value.base_ply ?? 0) || 0));
  if(!expected || !reply) return null;
  return {
    basePly,
    expectedMove:expected,
    replyMove:reply,
    updatedAt:value.updatedAt || value.updated_at || null
  };
}

function conditionalMoveAvailable(){
  if(!isDailyTimeControl() || !onlineRoomId || !onlineConnected || !onlineGameStarted ||
     onlineGameEnded || gameEnded || timeLost || pendingDailyMove ||
     (onlineRoleCode !== 'w' && onlineRoleCode !== 'b')) return false;
  if(viewIndex !== masterHistory.length) return false;
  try{
    return buildGameFromHistory(masterHistory.length).turn !== onlineRoleCode;
  }catch(_){
    return false;
  }
}

function setConditionalMoveStatus(message,kind){
  if(!conditionalMoveStatusEl) return;
  conditionalMoveStatusEl.textContent = message || '';
  conditionalMoveStatusEl.classList.toggle('error',kind === 'error');
  conditionalMoveStatusEl.classList.toggle('success',kind === 'success');
}

function conditionalMovePayload(move){
  if(!move) return null;
  return {
    from:move.from.slice(),
    to:move.to.slice(),
    promotion:move.promotion || null,
    castle:castleSideCode(move) || null,
    san:move.san || ''
  };
}

function conditionalMoveLabel(move){
  if(!move) return 'noch nicht gewählt';
  if(move.san) return move.san;
  return coordToAlg(move.from[0],move.from[1]) + '–' + coordToAlg(move.to[0],move.to[1]) + (move.promotion ? '=' + String(move.promotion).toUpperCase() : '');
}

function updateConditionalMoveUi(){
  if(!conditionalMoveBtn) return;
  const available = conditionalMoveAvailable();
  const savedForPosition = !!(onlineConditionalMove && onlineConditionalMove.basePly === actualMoveCount());
  if(variationModeActive && variationPurpose === 'conditional' && !available){
    closeVariationBoard({skipLauncherUpdate:false});
  }
  conditionalMoveBtn.hidden = !available;
  conditionalMoveBtn.disabled = !available || conditionalMoveBusy;
  conditionalMoveBtn.classList.toggle('active',variationModeActive && variationPurpose === 'conditional');
  conditionalMoveBtn.setAttribute('aria-pressed',variationModeActive && variationPurpose === 'conditional' ? 'true' : 'false');
  conditionalMoveBtn.title = savedForPosition
    ? 'Gespeicherte bedingte Züge anzeigen oder ändern'
    : 'Bedingte Züge auf dem Brett vorbereiten';
  conditionalMoveBtn.setAttribute('aria-label',conditionalMoveBtn.title);
  if(conditionalMoveSavedMark) conditionalMoveSavedMark.hidden = !savedForPosition;
}

function conditionalMoveEntryFromGame(game,rawMove){
  if(!game || !rawMove) return null;
  const before = game.clone();
  const found = findMatchingLegalMove(game.legalMoves(),rawMove);
  if(!found) return null;
  const movingPiece = game.at(found.from[0],found.from[1]);
  const needsPromotion = movingPiece.toLowerCase() === 'p' && (found.to[1] === 0 || found.to[1] === 7);
  if(needsPromotion && !rawMove.promotion) return null;
  const entry = {
    from:found.from.slice(),
    to:found.to.slice(),
    meta:clone(found.meta || {}),
    promotion:needsPromotion ? rawMove.promotion : null,
    side:before.turn,
    moveNumber:before.fullmove,
    san:''
  };
  const applied = game.makeMove(entry,false);
  entry.piece = applied.piece;
  entry.taken = applied.taken;
  entry.san = moveToSan(before,entry,game);
  return entry;
}

function loadSavedConditionalMoveIntoEditor(){
  const saved = normalizeConditionalMoveRecord(onlineConditionalMove);
  if(!saved || saved.basePly !== conditionalMoveBasePly || !variationGame) return false;
  const expected = conditionalMoveEntryFromGame(variationGame,saved.expectedMove);
  if(!expected) return false;
  const reply = conditionalMoveEntryFromGame(variationGame,saved.replyMove);
  if(!reply){
    variationGame = variationStartGame.clone();
    return false;
  }
  variationHistory = [expected,reply];
  variationRedo = [];
  return true;
}

function openConditionalMoveBoard(){
  if(variationModeActive){
    if(variationPurpose === 'conditional'){
      closeConditionalMoveBoard();
      return;
    }
    closeVariationBoard();
  }
  if(!conditionalMoveAvailable() || !variationBoardEl || !variationSidePanelEl) return;
  conditionalMoveBasePly = actualMoveCount();
  variationPurpose = 'conditional';
  variationStartGame = buildGameFromHistory(masterHistory.length).clone();
  variationGame = variationStartGame.clone();
  variationHistory = [];
  variationRedo = [];
  variationSelected = null;
  variationOrientationWhite = orientationWhite;
  variationModeActive = true;
  const loaded = loadSavedConditionalMoveIntoEditor();
  syncVariationModeUi();
  renderVariationBoard();
  updateGameActionButtons();
  updateVariationLauncherUi();
  updateConditionalMoveUi();
  setConditionalMoveStatus(loaded ? 'Gespeicherte Bedingung geladen. Du kannst sie ändern oder löschen.' : '',loaded ? 'success' : '');
  refreshHeaderStatusFromState();
  hammerschachScheduleHeightReport(true);
}

function closeConditionalMoveBoard(){
  conditionalMoveCloseAfterAck = false;
  if(variationModeActive && variationPurpose === 'conditional') closeVariationBoard();
  updateConditionalMoveUi();
}

function resetConditionalMoveDraft(){
  if(!variationModeActive || variationPurpose !== 'conditional' || !variationStartGame || conditionalMoveBusy) return;
  variationGame = variationStartGame.clone();
  variationHistory = [];
  variationRedo = [];
  variationSelected = null;
  setConditionalMoveStatus('Vorbereitung wurde zurückgesetzt.','');
  renderVariationBoard();
}

function undoConditionalMoveDraft(){
  if(!variationModeActive || variationPurpose !== 'conditional' || !variationHistory.length || conditionalMoveBusy) return;
  setVariationViewIndex(variationHistory.length - 1);
  setConditionalMoveStatus('Letzter vorbereiteter Zug wurde zurückgenommen.','');
}

function updateConditionalMoveEditorUi(){
  if(!conditionalMovePanelEl || variationPurpose !== 'conditional') return;
  const expected = variationHistory[0] || null;
  const reply = variationHistory[1] || null;
  if(conditionalMoveExpectedTextEl) conditionalMoveExpectedTextEl.textContent = conditionalMoveLabel(expected);
  if(conditionalMoveReplyTextEl) conditionalMoveReplyTextEl.textContent = conditionalMoveLabel(reply);
  if(conditionalMoveInstructionEl){
    conditionalMoveInstructionEl.classList.toggle('complete',!!reply);
    if(!expected) conditionalMoveInstructionEl.textContent = '1. Ziehe auf dem Brett den erwarteten Zug deines Gegners.';
    else if(!reply) conditionalMoveInstructionEl.textContent = '2. Ziehe jetzt auf dem Brett deine automatische Antwort.';
    else conditionalMoveInstructionEl.textContent = 'Die Bedingung ist vollständig und kann gespeichert werden.';
  }
  if(conditionalMoveUndoBtn) conditionalMoveUndoBtn.disabled = conditionalMoveBusy || variationHistory.length === 0;
  if(conditionalMoveResetBtn) conditionalMoveResetBtn.disabled = conditionalMoveBusy || (variationHistory.length === 0 && variationRedo.length === 0);
  if(conditionalMoveDeleteBtn){
    conditionalMoveDeleteBtn.hidden = !onlineConditionalMove;
    conditionalMoveDeleteBtn.disabled = conditionalMoveBusy;
  }
  if(conditionalMoveSaveBtn){
    conditionalMoveSaveBtn.disabled = conditionalMoveBusy || !reply || conditionalMoveBasePly !== actualMoveCount();
    conditionalMoveSaveBtn.textContent = conditionalMoveBusy ? 'Wird gespeichert…' : 'Speichern & beenden';
  }
  if(conditionalMoveCloseBtn) conditionalMoveCloseBtn.disabled = conditionalMoveBusy;
}

function saveConditionalMove(){
  if(conditionalMoveBusy || !variationModeActive || variationPurpose !== 'conditional') return;
  if(conditionalMoveBasePly !== actualMoveCount()){
    setConditionalMoveStatus('Die Partie hat sich inzwischen verändert. Bitte öffne die Vorbereitung erneut.','error');
    return;
  }
  const expected = variationHistory[0];
  const reply = variationHistory[1];
  if(!expected || !reply){
    setConditionalMoveStatus('Bitte zuerst Gegnerzug und eigene Antwort auf dem Brett ziehen.','error');
    return;
  }
  const messageId = 'cm_' + Date.now() + '_' + randomToken(6);
  conditionalMoveBusy = true;
  conditionalMoveCloseAfterAck = true;
  setConditionalMoveStatus('Bedingung wird sicher auf dem Server gespeichert…','');
  updateConditionalMoveEditorUi();
  const sent = sendOnlineMessage({
    type:'set_conditional_move',
    messageId,
    basePly:conditionalMoveBasePly,
    expectedMove:conditionalMovePayload(expected),
    replyMove:conditionalMovePayload(reply)
  });
  if(!sent){
    conditionalMoveBusy = false;
    conditionalMoveCloseAfterAck = false;
    setConditionalMoveStatus('Bedingung konnte nicht gesendet werden. Bitte Verbindung prüfen.','error');
    updateConditionalMoveEditorUi();
  }
}

function deleteConditionalMove(){
  if(conditionalMoveBusy || !onlineConditionalMove) return;
  conditionalMoveBusy = true;
  conditionalMoveCloseAfterAck = true;
  setConditionalMoveStatus('Gespeicherte Bedingung wird gelöscht…','');
  updateConditionalMoveEditorUi();
  if(!sendOnlineMessage({type:'clear_conditional_move',messageId:'cm_clear_' + Date.now() + '_' + randomToken(5)})){
    conditionalMoveBusy = false;
    conditionalMoveCloseAfterAck = false;
    setConditionalMoveStatus('Bedingung konnte nicht gelöscht werden. Bitte Verbindung prüfen.','error');
    updateConditionalMoveEditorUi();
  }
}

function applyOnlineConditionalMoveState(value){
  onlineConditionalMove = normalizeConditionalMoveRecord(value);
  updateConditionalMoveUi();
  if(variationModeActive && variationPurpose === 'conditional') updateConditionalMoveEditorUi();
}

function handleConditionalMoveAck(msg){
  conditionalMoveBusy = false;
  applyOnlineConditionalMoveState(msg && msg.conditionalMove);
  const deleted = !!(msg && msg.cleared);
  onlineLastMessage = deleted ? 'Bedingter Zug wurde gelöscht.' : 'Bedingter Zug wurde gespeichert.';
  if(conditionalMoveCloseAfterAck){
    conditionalMoveCloseAfterAck = false;
    if(variationModeActive && variationPurpose === 'conditional') closeVariationBoard();
  } else {
    setConditionalMoveStatus(onlineLastMessage,'success');
    updateConditionalMoveEditorUi();
  }
  updateConditionalMoveUi();
}

function handleConditionalMoveError(message){
  conditionalMoveBusy = false;
  conditionalMoveCloseAfterAck = false;
  setConditionalMoveStatus(message || 'Bedingter Zug konnte nicht verarbeitet werden.','error');
  updateConditionalMoveEditorUi();
  updateConditionalMoveUi();
}

if(conditionalMoveBtn) conditionalMoveBtn.addEventListener('click',openConditionalMoveBoard);
if(conditionalMoveCloseBtn) conditionalMoveCloseBtn.addEventListener('click',closeConditionalMoveBoard);
if(conditionalMoveUndoBtn) conditionalMoveUndoBtn.addEventListener('click',undoConditionalMoveDraft);
if(conditionalMoveResetBtn) conditionalMoveResetBtn.addEventListener('click',resetConditionalMoveDraft);
if(conditionalMoveDeleteBtn) conditionalMoveDeleteBtn.addEventListener('click',deleteConditionalMove);
if(conditionalMoveSaveBtn) conditionalMoveSaveBtn.addEventListener('click',saveConditionalMove);

