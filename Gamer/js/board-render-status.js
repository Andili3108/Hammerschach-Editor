'use strict';

function ensureBoardSquares(){
  if(boardEl.children.length === 64 && Array.from(boardEl.children).every(el => el.classList.contains('square'))) return;
  const fragment = document.createDocumentFragment();
  for(let row=0; row<8; row++){
    for(let col=0; col<8; col++){
      const sq = document.createElement('div');
      sq.className = 'square';
      if(row === 7){
        const file = document.createElement('span');
        file.className = 'coord-file';
        sq.appendChild(file);
      }
      if(col === 0){
        const rank = document.createElement('span');
        rank.className = 'coord-rank';
        sq.appendChild(rank);
      }
      fragment.appendChild(sq);
    }
  }
  boardEl.replaceChildren(fragment);
}
boardEl.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('.square') : null;
  if(!target || !boardEl.contains(target)) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if(Number.isInteger(x) && Number.isInteger(y)) onSquareClick(x,y);
});
const MATERIAL_PIECE_VALUES = {p:1,n:3,b:3,r:5,q:9};
const MATERIAL_DISPLAY_ORDER = {p:0,b:1,n:2,r:3,q:4};
function materialScores(gameState){
  const scores = {w:0,b:0};
  for(const row of gameState.board){
    for(const piece of row){
      const value = MATERIAL_PIECE_VALUES[String(piece).toLowerCase()] || 0;
      const color = pieceColor(piece);
      if(value && color) scores[color] += value;
    }
  }
  return scores;
}
function sortedCapturedPieces(pieces){
  return (pieces || [])
    .filter(piece => Object.prototype.hasOwnProperty.call(MATERIAL_PIECE_VALUES,String(piece).toLowerCase()))
    .slice()
    .sort((left,right) => MATERIAL_DISPLAY_ORDER[String(left).toLowerCase()] - MATERIAL_DISPLAY_ORDER[String(right).toLowerCase()]);
}
function capturedPieceSummary(pieces){
  const names = {
    p:['Bauer','Bauern'],
    n:['Springer','Springer'],
    b:['Läufer','Läufer'],
    r:['Turm','Türme'],
    q:['Dame','Damen']
  };
  const counts = {};
  pieces.forEach(piece => {
    const type = String(piece).toLowerCase();
    counts[type] = (counts[type] || 0) + 1;
  });
  return Object.keys(MATERIAL_DISPLAY_ORDER)
    .sort((left,right) => MATERIAL_DISPLAY_ORDER[left] - MATERIAL_DISPLAY_ORDER[right])
    .filter(type => counts[type])
    .map(type => counts[type] + ' ' + names[type][counts[type] === 1 ? 0 : 1])
    .join(', ');
}
function renderPlayerMaterial(container,pieces,advantage){
  if(!container) return;
  const sortedPieces = sortedCapturedPieces(pieces);
  const visible = sortedPieces.length > 0 || advantage > 0;
  container.replaceChildren();
  container.hidden = !visible;
  if(!visible){
    container.removeAttribute('aria-label');
    container.removeAttribute('title');
    return;
  }
  const fragment = document.createDocumentFragment();
  sortedPieces.forEach(piece => {
    const img = document.createElement('img');
    img.className = 'player-material-piece';
    img.src = pieceImg[piece];
    img.alt = '';
    img.setAttribute('aria-hidden','true');
    img.draggable = false;
    fragment.appendChild(img);
  });
  if(advantage > 0){
    const score = document.createElement('span');
    score.className = 'player-material-advantage';
    score.textContent = '+' + advantage;
    fragment.appendChild(score);
  }
  container.appendChild(fragment);
  const summary = sortedPieces.length ? 'Geschlagen: ' + capturedPieceSummary(sortedPieces) + '.' : 'Keine geschlagenen Figuren.';
  const accessibleText = summary + (advantage > 0 ? ' Materialvorteil +' + advantage + '.' : '');
  container.setAttribute('aria-label',accessibleText);
  container.title = accessibleText;
}
function renderCapturedMaterial(gameState,historyIndex){
  const captures = capturedPiecesForHistory(historyIndex);
  if(pendingDailyMove && historyIndex === masterHistory.length){
    const capturedPiece = pendingDailyMove.move && pendingDailyMove.move.taken;
    if(capturedPiece && capturedPiece !== '.' && captures[pendingDailyMove.movedSide]) captures[pendingDailyMove.movedSide].push(capturedPiece);
  }
  const scores = materialScores(gameState);
  renderPlayerMaterial(whiteCapturedMaterialEl,captures.w,Math.max(0,scores.w - scores.b));
  renderPlayerMaterial(blackCapturedMaterialEl,captures.b,Math.max(0,scores.b - scores.w));
}
function renderBoard(){
  syncBoardPlayerStrips();
  if(boardRenderFrame !== null){
    cancelAnimationFrame(boardRenderFrame);
    boardRenderFrame = null;
    boardRenderReceivedAt = 0;
  }
  cancelActivePieceDrag(boardEl);
  if(isMoveNavigationLocked() && viewIndex !== masterHistory.length) viewIndex = masterHistory.length;
  const g = buildGameFromHistory(viewIndex);
  let displayGame = g;
  if(pendingDailyMove && viewIndex === masterHistory.length){
    displayGame = g.clone();
    displayGame.makeMove({
      from:pendingDailyMove.move.from.slice(),
      to:pendingDailyMove.move.to.slice(),
      meta:clone(pendingDailyMove.move.meta || {}),
      promotion:pendingDailyMove.move.promotion || null
    }, true);
  }
  ensureBoardSquares();
  for(let row=0; row<8; row++){
    for(let col=0; col<8; col++){
      const x = orientationWhite ? col : 7-col;
      const y = orientationWhite ? row : 7-row;
      const sq = boardEl.children[row * 8 + col];
      sq.className = 'square ' + (((x+y)%2===0) ? 'light' : 'dark');
      sq.dataset.x = x;
      sq.dataset.y = y;
      const p = displayGame.at(x,y);
      let img = sq.querySelector('.piece-img');
      if(p !== '.'){
        if(!img){
          img = document.createElement('img');
          img.className = 'piece-img';
          sq.insertBefore(img,sq.firstChild);
        }
        if(img.dataset.piece !== p || img.getAttribute('src') !== pieceImg[p]){
          img.dataset.piece = p;
          img.src = pieceImg[p];
        }
        img.alt = pieceChar[p] || '';
      } else if(img) img.remove();
      const file = sq.querySelector('.coord-file');
      if(file) file.textContent = files[x];
      const rank = sq.querySelector('.coord-rank');
      if(rank) rank.textContent = 8 - y;
    }
  }
  renderCapturedMaterial(displayGame,viewIndex);
  markLastMove();
  markPendingDailyMove();
  markQueuedPremove();
  reapplySelectionHighlight(g);
  updateStatus(g);
  if(pendingDailyMove) statusEl.textContent = 'Zugvorschau — rechts „Zug bestätigen“ oder „Zug zurücknehmen“ wählen.';
  updatePremoveUi();
  renderMoveList();
  updateNavControls();
  updatePgnExportUi();
  updateClockDisplay(g);
  updateGameActionButtons();
  updateDailyMoveConfirmationUi();
  updateVariationLauncherUi();
  if(typeof updateConditionalMoveUi === 'function') updateConditionalMoveUi();
}
function getSquareEl(x,y){ return boardEl.querySelector('.square[data-x="' + x + '"][data-y="' + y + '"]'); }
function markSquare(x,y,cls){ const el = getSquareEl(x,y); if(el) el.classList.add(cls); }
function clearBoardHighlights(){ boardEl.querySelectorAll('.square.selected,.square.legal,.square.last-move,.square.pending-move,.square.premove-from,.square.premove-to,.square.premove-legal').forEach(el => el.classList.remove('selected','legal','last-move','pending-move','premove-from','premove-to','premove-legal')); }
function visualKingDestination(move){
  if(move && move.meta && move.meta.castle && Number.isInteger(move.meta.kingTo) && move.from){
    return [move.meta.kingTo,move.from[1]];
  }
  return move && move.to ? move.to : [0,0];
}
function legalMoveSelectionTarget(move,siblingMoves){
  if(!castleSideCode(move)) return move.to;
  const kingTarget = visualKingDestination(move);
  if(kingTarget[0] === move.from[0] && kingTarget[1] === move.from[1]) return move.to;
  const ordinaryMoveUsesKingTarget = (siblingMoves || []).some(other =>
    other !== move && !castleSideCode(other) &&
    other.to[0] === kingTarget[0] && other.to[1] === kingTarget[1]
  );
  return ordinaryMoveUsesKingTarget ? move.to : kingTarget;
}
function markLastMove(){
  if(!lastMove || viewIndex !== masterHistory.length) return;
  markSquare(lastMove.from[0], lastMove.from[1], 'last-move');
  const visualTo = visualKingDestination(lastMove);
  markSquare(visualTo[0], visualTo[1], 'last-move');
}
function markPendingDailyMove(){
  if(!pendingDailyMove || viewIndex !== masterHistory.length) return;
  markSquare(pendingDailyMove.move.from[0], pendingDailyMove.move.from[1], 'pending-move');
  const visualTo = visualKingDestination(pendingDailyMove.move);
  markSquare(visualTo[0], visualTo[1], 'pending-move');
}
function markQueuedPremove(){
  if(!queuedPremove || viewIndex !== masterHistory.length) return;
  markSquare(queuedPremove.from[0],queuedPremove.from[1],'premove-from');
  const visualTo = queuedPremove.visualTo || queuedPremove.to;
  markSquare(visualTo[0],visualTo[1],'premove-to');
}
function highlightSelection(x,y,gameState){
  clearBoardHighlights();
  markLastMove();
  markSquare(x,y,'selected');
  const g = gameState || buildGameFromHistory(masterHistory.length);
  const legal = g.legalMoves().filter(m => m.from[0] === x && m.from[1] === y);
  legal.forEach(move => {
    const target = legalMoveSelectionTarget(move,legal);
    markSquare(target[0],target[1],'legal');
  });
}
function reapplySelectionHighlight(g){
  if(!selected || viewIndex !== masterHistory.length) return;
  const piece = g.at(selected[0], selected[1]);
  if(canQueuePremove(g) && piece !== '.' && pieceColor(piece) === onlineRoleCode){
    highlightPremoveSelection(selected[0],selected[1],g);
    return;
  }
  if(piece !== '.' && pieceColor(piece) === g.turn) highlightSelection(selected[0], selected[1], g);
}
function updateStatus(g){
  if(variationModeActive){
    statusEl.textContent = 'Variantenbrett';
    return;
  }
  if(embeddedToolActive()){
    statusEl.textContent = embeddedToolStatusText();
    return;
  }
  const go = gameOverForHistory(viewIndex, g);
  gameEnded = !!go;
  if(go){
    stopClock();
    if(go.type === 'checkmate') statusEl.textContent = 'Schachmatt — ' + (go.winner === 'w' ? 'Weiß' : 'Schwarz') + ' gewinnt';
    else statusEl.textContent = drawReasonText(go.type);
    return;
  }
  if(!onlineRoomId){
    if(isAnonymousVisitorStartView()){
      statusEl.textContent = 'Bitte melde dich an, um eine Partie anzubieten oder jemanden einzuladen.';
    } else if(hasOnlineTargetInAddress()){
      statusEl.textContent = 'Spielraum wird geladen…';
    } else {
      statusEl.textContent = 'Spielmodus, Farbe und Bedenkzeit wählen – dann einladen oder anbieten.';
    }
    return;
  }
  if(onlineRoomId){
    if(onlineRoomCancelled){
      statusEl.textContent = onlineLastMessage || 'Dieser Spielraum wurde zurückgezogen und ist nicht mehr verfügbar.';
      return;
    }
    if(onlineGameEnded || timeLost){
      if(timeLost) return;
      statusEl.textContent = formatOnlineEndMessage({result:onlineGameResult, endReason:onlineGameEndReason, winner:onlineGameWinner});
      return;
    }
    if(!onlineGameStarted){
      if(isDailyTimeControl()){
        if(onlineRoleCode === 'w') statusEl.textContent = onlineAssignedSeats.black ? 'Daily-Partie angenommen — automatischer Start wird vorbereitet.' : (onlineLastMessage === 'Einladungslink wurde kopiert.' ? 'Einladungslink kopiert — warte auf Annahme durch Schwarz.' : 'Daily-Partie erstellt — warte auf Annahme durch Schwarz.');
        else if(onlineRoleCode === 'b') statusEl.textContent = 'Daily-Partie angenommen — sie startet automatisch. ' + (currentThemePly() % 2 ? 'Schwarz' : 'Weiß') + ' führt den ersten freien Zug aus.';
        else if(onlineRoleCode === 'spectator') statusEl.textContent = 'Zuschaueransicht — Daily-Partie wartet auf Annahme.';
        else statusEl.textContent = 'Daily-Raum wird verbunden.';
      } else {
        if(onlineRoleCode === 'w'){
          if(onlineOpenOffer && onlineOpenOfferStatus === 'open' && !onlineAssignedSeats.black) statusEl.textContent = 'Partieangebot ist offen — warte auf einen Gegner.';
          else statusEl.textContent = isOnlineSideConnected('b') ? onlineSideName('b') + ' verbunden — starte die Partie direkt unter dem Brett.' : (onlineLastMessage === 'Einladungslink wurde kopiert.' ? 'Einladungslink kopiert — warte auf Schwarz.' : 'Online-Lobby — warte auf Schwarz.');
        }
        else if(onlineRoleCode === 'b') statusEl.textContent = isOnlineSideConnected('w') ? 'Online-Lobby — warte auf Partiestart durch Weiß.' : 'Du spielst Schwarz — warte auf Weiß.';
        else if(onlineRoleCode === 'spectator') statusEl.textContent = 'Zuschaueransicht — warte auf Partiestart.';
        else statusEl.textContent = 'Online-Lobby wird verbunden.';
      }
      return;
    }
    if(onlineRoleCode === 'spectator'){
      statusEl.textContent = 'Zuschaueransicht — ' + (g.turn === 'w' ? 'Weiß' : 'Schwarz') + ' am Zug';
      return;
    }
    if(onlineDrawOffer){
      if(onlineDrawOffer.byRole === onlineRoleCode){
        statusEl.textContent = 'Remisangebot gesendet — warte auf Antwort.';
      } else {
        statusEl.textContent = 'Gegner bietet Remis an — Remis annehmen oder weiterspielen.';
      }
      return;
    }
  }
  let text = (g.turn === 'w' ? 'Weiß' : 'Schwarz') + ' am Zug';
  if(onlineRoomId && onlineGameStarted){
    if(onlineRoleCode === g.turn) text = 'Du bist am Zug (' + roleLabel(onlineRoleCode) + ')';
    else text = (g.turn === 'w' ? 'Weiß' : 'Schwarz') + ' am Zug — du spielst ' + roleLabel(onlineRoleCode);
  }
  if(queuedPremove && canQueuePremove(g)) text = 'Premove ' + premoveLabel(queuedPremove) + ' vorgemerkt — Gegner ist am Zug';
  if(g.inCheck(g.turn)) text += ' — Schach!';
  if(viewIndex !== masterHistory.length){
    text = currentTheme() && viewIndex <= currentThemePly()
      ? 'Themenvorgabe — hier kannst du die Entstehung der Startstellung prüfen'
      : 'Analyseansicht — gehe zum letzten Zug, um weiterzuspielen';
  }
  statusEl.textContent = text;
}
function showIllegalMoveFeedback(message){
  if(illegalFlashEl){
    illegalFlashEl.classList.add('active');
    setTimeout(() => illegalFlashEl.classList.remove('active'), 420);
  }
  const previous = statusEl.textContent;
  statusEl.textContent = message || 'Illegaler Zug — nicht erlaubt';
  setTimeout(() => { if(statusEl.textContent === (message || 'Illegaler Zug — nicht erlaubt')) statusEl.textContent = previous; }, 900);
  playUiSound('illegal');
  if(navigator.vibrate) navigator.vibrate(80);
}
function isDailyMoveConfirmationMode(gameState){
  const g = gameState || buildGameFromHistory(masterHistory.length);
  return !!(
    isDailyTimeControl() &&
    onlineRoomId && onlineConnected && onlineGameStarted &&
    !onlineGameEnded && !gameEnded && !timeLost &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') &&
    onlineRoleCode === g.turn
  );
}
function updateDailyMoveConfirmationUi(){
  if(!dailyMoveConfirmationEl) return;
  const g = pendingDailyMove ? buildGameFromHistory(masterHistory.length) : null;
  const visible = !!(
    pendingDailyMove && g && isDailyTimeControl() &&
    onlineRoomId && onlineConnected && onlineGameStarted &&
    !onlineGameEnded && !gameEnded && !timeLost &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') &&
    onlineRoleCode === g.turn
  );
  dailyMoveConfirmationEl.hidden = !visible;
  if(dailyMoveCancelBtn) dailyMoveCancelBtn.disabled = !visible;
  if(dailyMoveConfirmBtn) dailyMoveConfirmBtn.disabled = !visible;
}
function stageDailyMove(found, promotion){
  const before = buildGameFromHistory(masterHistory.length);
  if(!isDailyMoveConfirmationMode(before)){
    commitHumanMove(found, promotion);
    return;
  }
  const mv = {from:found.from.slice(), to:found.to.slice(), meta:clone(found.meta || {}), promotion:promotion || null};
  const preview = before.clone();
  const applied = preview.makeMove(mv, false);
  mv.piece = applied.piece;
  mv.taken = applied.taken;
  mv.san = moveToSan(before, mv, preview);
  pendingDailyMove = {move:mv, movedSide:before.turn};
  selected = null;
  renderBoard();
}
function cancelPendingDailyMove(){
  if(!pendingDailyMove) return;
  pendingDailyMove = null;
  selected = null;
  renderBoard();
}
function confirmPendingDailyMove(){
  if(!pendingDailyMove) return;
  const pending = pendingDailyMove;
  const g = buildGameFromHistory(masterHistory.length);
  if(!isDailyMoveConfirmationMode(g) || pending.movedSide !== g.turn){
    pendingDailyMove = null;
    selected = null;
    renderBoard();
    showIllegalMoveFeedback('Der Raumzustand hat sich geändert. Bitte den Zug neu auswählen.');
    return;
  }
  const found = findMatchingLegalMove(g.legalMoves(), pending.move);
  if(!found){
    pendingDailyMove = null;
    selected = null;
    renderBoard();
    showIllegalMoveFeedback('Dieser Zug ist nicht mehr gültig. Bitte neu auswählen.');
    return;
  }
  pendingDailyMove = null;
  commitHumanMove(found, pending.move.promotion || null);
}
function handleChosenHumanMove(found, promotion){
  const g = buildGameFromHistory(masterHistory.length);
  if(isDailyMoveConfirmationMode(g)) stageDailyMove(found, promotion);
  else commitHumanMove(found, promotion);
}
if(dailyMoveCancelBtn) dailyMoveCancelBtn.addEventListener('click', cancelPendingDailyMove);
if(dailyMoveConfirmBtn) dailyMoveConfirmBtn.addEventListener('click', confirmPendingDailyMove);
