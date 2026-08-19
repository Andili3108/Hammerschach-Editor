'use strict';

const CONDITIONAL_MOVE_MAX_PLIES = 10;

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
  const rawLine = Array.isArray(value.line || value.moves || value.sequence)
    ? (value.line || value.moves || value.sequence)
    : [value.expectedMove || value.expected_move || value.expected, value.replyMove || value.reply_move || value.reply];
  const line = rawLine.slice(0,CONDITIONAL_MOVE_MAX_PLIES).map(normalizeMove);
  const basePly = Math.max(0,Math.floor(Number(value.basePly ?? value.base_ply ?? 0) || 0));
  if(line.length < 2 || line.length % 2 !== 0 || line.some(move => !move)) return null;
  return {
    basePly,
    line,
    expectedMove:line[0],
    replyMove:line[1],
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
  const hoverHelp = 'Du kannst bis zu 5 gegnerische Züge mit jeweils deiner Antwort vorbereiten.';
  const canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  if(canHover) conditionalMoveBtn.title = hoverHelp;
  else conditionalMoveBtn.removeAttribute('title');
  conditionalMoveBtn.setAttribute('aria-label',savedForPosition ? 'Gespeicherte bedingte Züge anzeigen oder ändern' : 'Bedingte Züge vorbereiten');
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
  const entries = [];
  for(const rawMove of saved.line){
    const entry = conditionalMoveEntryFromGame(variationGame,rawMove);
    if(!entry){
      variationGame = variationStartGame.clone();
      variationHistory = [];
      variationRedo = [];
      return false;
    }
    entries.push(entry);
  }
  variationHistory = entries;
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
  const count = variationHistory.length;
  const complete = count >= 2 && count % 2 === 0;
  const lineText = count ? variationHistory.map(conditionalMoveLabel).join(' → ') : 'noch keine Züge';
  if(conditionalMoveExpectedTextEl) conditionalMoveExpectedTextEl.textContent = lineText;
  if(conditionalMoveReplyTextEl) conditionalMoveReplyTextEl.textContent = count + ' von ' + CONDITIONAL_MOVE_MAX_PLIES + ' Halbzügen';
  if(conditionalMoveInstructionEl){
    conditionalMoveInstructionEl.classList.toggle('complete',complete);
    if(count === 0) conditionalMoveInstructionEl.textContent = 'Ziehe zuerst den erwarteten Zug deines Gegners.';
    else if(count % 2 === 1) conditionalMoveInstructionEl.textContent = 'Ziehe jetzt deine automatische Antwort.';
    else if(count >= CONDITIONAL_MOVE_MAX_PLIES) conditionalMoveInstructionEl.textContent = 'Maximal 5 gegnerische Züge mit jeweils deiner Antwort sind vorbereitet.';
    else conditionalMoveInstructionEl.textContent = 'Die Bedingung ist speicherbar. Oder füge den nächsten erwarteten Gegnerzug hinzu.';
  }
  if(conditionalMoveUndoBtn) conditionalMoveUndoBtn.disabled = conditionalMoveBusy || variationHistory.length === 0;
  if(conditionalMoveResetBtn) conditionalMoveResetBtn.disabled = conditionalMoveBusy || (variationHistory.length === 0 && variationRedo.length === 0);
  if(conditionalMoveDeleteBtn){
    conditionalMoveDeleteBtn.hidden = !onlineConditionalMove;
    conditionalMoveDeleteBtn.disabled = conditionalMoveBusy;
  }
  if(conditionalMoveSaveBtn){
    conditionalMoveSaveBtn.disabled = conditionalMoveBusy || !complete || conditionalMoveBasePly !== actualMoveCount();
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
  const line = variationHistory.slice(0,CONDITIONAL_MOVE_MAX_PLIES);
  if(line.length < 2 || line.length % 2 !== 0){
    setConditionalMoveStatus('Bitte die Zugfolge immer mit deiner Antwort abschließen.','error');
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
    line:line.map(conditionalMovePayload),
    expectedMove:conditionalMovePayload(line[0]),
    replyMove:conditionalMovePayload(line[1])
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

