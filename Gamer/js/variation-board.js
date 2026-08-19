'use strict';

function variationBoardAvailable(){
  return !!(
    isDailyTimeControl() && onlineRoomId && onlineGameStarted &&
    !onlineGameEnded && !gameEnded && !timeLost &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b')
  );
}
function updateVariationLauncherUi(){
  if(!variationLauncherEl || !variationOpenBtn) return;
  const available = variationBoardAvailable();
  if(variationModeActive && (!available || pendingDailyMove)){
    closeVariationBoard({skipLauncherUpdate:true});
  }
  variationLauncherEl.hidden = !available || !!pendingDailyMove || (variationModeActive && variationPurpose === 'conditional');
  variationOpenBtn.disabled = !available || !!pendingDailyMove;
  variationOpenBtn.classList.toggle('active',variationModeActive);
  variationOpenBtn.setAttribute('aria-pressed',variationModeActive ? 'true' : 'false');
  variationOpenBtn.setAttribute('aria-label',variationModeActive ? 'Zum Partiebrett zurückkehren' : 'Variantenbrett öffnen');
  variationOpenBtn.title = pendingDailyMove
    ? 'Bitte den vorgemerkten Daily-Zug zuerst bestätigen oder zurücknehmen.'
    : (variationModeActive ? 'Variantenbrett schließen und zur echten Partie zurückkehren.' : 'Aktuelle Daily-Stellung gefahrlos ausprobieren.');
}
function syncVariationModeUi(){
  if(boardEl) boardEl.hidden = variationModeActive;
  if(variationBoardEl) variationBoardEl.hidden = !variationModeActive;
  if(variationBoardBadgeEl) variationBoardBadgeEl.hidden = !variationModeActive;
  if(mainSidePanelEl) mainSidePanelEl.hidden = variationModeActive;
  if(variationSidePanelEl) variationSidePanelEl.hidden = !variationModeActive;
  if(variationAnalysisPanelEl) variationAnalysisPanelEl.hidden = variationPurpose === 'conditional';
  if(conditionalMovePanelEl) conditionalMovePanelEl.hidden = variationPurpose !== 'conditional';
  if(variationBoardBadgeEl) variationBoardBadgeEl.textContent = variationPurpose === 'conditional' ? 'BEDINGTE ZÜGE' : 'VARIANTENBRETT';
  document.documentElement.classList.toggle('variation-mode-active',variationModeActive);
  document.documentElement.classList.toggle('conditional-move-mode-active',variationModeActive && variationPurpose === 'conditional');
  syncBoardPlayerStrips();
  if(flipBoardBtn){
    const flipTitle = variationModeActive
      ? (variationPurpose === 'conditional' ? 'Brett für bedingte Züge drehen' : 'Variantenbrett drehen')
      : 'Brett drehen';
    flipBoardBtn.title = flipTitle;
    flipBoardBtn.setAttribute('aria-label',flipTitle);
  }
  if(variationOpenBtn){
    variationOpenBtn.classList.toggle('active',variationModeActive);
    variationOpenBtn.setAttribute('aria-pressed',variationModeActive ? 'true' : 'false');
  }
  updateBoardNavControls();
}
function openVariationBoard(){
  if(variationModeActive){
    closeVariationBoard();
    return;
  }
  if(!variationBoardAvailable() || pendingDailyMove || !variationBoardEl || !variationSidePanelEl) return;
  variationPurpose = 'analysis';
  variationStartGame = buildGameFromHistory(masterHistory.length).clone();
  variationGame = variationStartGame.clone();
  variationHistory = [];
  variationRedo = [];
  variationSelected = null;
  variationOrientationWhite = orientationWhite;
  variationModeActive = true;
  syncVariationModeUi();
  renderVariationBoard();
  updateGameActionButtons();
  updateVariationLauncherUi();
  refreshHeaderStatusFromState();
  hammerschachScheduleHeightReport(true);
}
function closeVariationBoard(options){
  if(!variationModeActive) return;
  options = options || {};
  cancelActivePieceDrag(variationBoardEl);
  variationModeActive = false;
  syncVariationModeUi();
  variationStartGame = null;
  variationGame = null;
  variationHistory = [];
  variationRedo = [];
  variationSelected = null;
  const closedPurpose = variationPurpose;
  variationPurpose = 'analysis';
  updateGameActionButtons();
  if(!options.skipLauncherUpdate) updateVariationLauncherUi();
  if(closedPurpose === 'conditional' && typeof updateConditionalMoveUi === 'function') updateConditionalMoveUi();
  refreshHeaderStatusFromState();
  hammerschachScheduleHeightReport(true);
}
function rebuildVariationGame(){
  if(!variationStartGame) return;
  variationGame = variationStartGame.clone();
  for(const entry of variationHistory){
    const found = findMatchingLegalMove(variationGame.legalMoves(), entry);
    if(!found) break;
    variationGame.makeMove({
      from:found.from.slice(),
      to:found.to.slice(),
      meta:clone(found.meta || {}),
      promotion:entry.promotion || null
    }, true);
  }
}
function variationGameOverText(go){
  if(!go) return '';
  if(go.type === 'checkmate') return 'Matt in der Variante — ' + (go.winner === 'w' ? 'Weiß' : 'Schwarz') + ' gewinnt.';
  if(go.type === 'stalemate') return 'Patt in der Variante.';
  if(go.type === 'insufficient_material') return 'Remis in der Variante — unzureichendes Material.';
  if(go.type === 'fifty_move_rule') return 'Remis in der Variante — 50-Züge-Regel.';
  if(go.type === 'threefold_repetition') return 'Remis in der Variante — dreifache Wiederholung.';
  if(go.type === 'fivefold_repetition') return 'Remis in der Variante — fünffache Wiederholung.';
  if(go.type === 'seventy_five_move_rule') return 'Remis in der Variante — 75-Züge-Regel.';
  return 'Die Variante ist beendet.';
}
function updateVariationStatus(){
  if(!variationStatusEl || !variationGame) return;
  if(variationPurpose === 'conditional'){
    if(typeof updateConditionalMoveEditorUi === 'function') updateConditionalMoveEditorUi();
    return;
  }
  const go = variationGame.gameOver();
  if(go){
    variationStatusEl.textContent = variationGameOverText(go);
    return;
  }
  const side = variationGame.turn === 'w' ? 'Weiß' : 'Schwarz';
  variationStatusEl.textContent = side + ' am Zug' + (variationGame.inCheck(variationGame.turn) ? ' — Schach!' : '.');
}
function completeVariationLine(){
  return variationHistory.concat(variationRedo.slice().reverse());
}
function setVariationViewIndex(targetIndex){
  if(!variationStartGame) return;
  const line = completeVariationLine();
  const target = Math.max(0,Math.min(line.length,Math.floor(Number(targetIndex) || 0)));
  variationHistory = line.slice(0,target);
  variationRedo = line.slice(target).reverse();
  variationSelected = null;
  rebuildVariationGame();
  renderVariationBoard();
}
function renderVariationMoveList(){
  if(variationPurpose === 'conditional'){
    if(typeof updateConditionalMoveEditorUi === 'function') updateConditionalMoveEditorUi();
    return;
  }
  if(!variationMoveListEl) return;
  variationMoveListEl.innerHTML = '';
  const line = completeVariationLine();
  const currentIndex = variationHistory.length;
  if(variationMovesInfoEl) variationMovesInfoEl.textContent = line.length === 0 ? '0/0' : currentIndex + '/' + line.length;
  if(line.length === 0){
    const empty = document.createElement('div');
    empty.className = 'variation-moves-empty';
    empty.textContent = 'Noch keine Variantenzüge.';
    variationMoveListEl.appendChild(empty);
    return;
  }

  const fullMoves = [];
  for(let index=0;index<line.length;index++){
    const entry = line[index];
    let group = fullMoves[fullMoves.length - 1];
    if(!group || group.moveNumber !== entry.moveNumber){
      group = {moveNumber:entry.moveNumber,white:null,black:null};
      fullMoves.push(group);
    }
    group[entry.side === 'w' ? 'white' : 'black'] = {entry,index};
  }

  function appendCell(text,className,secondPair){
    const cell = document.createElement('div');
    cell.className = className;
    if(secondPair) cell.classList.add('hide-mobile-pair');
    cell.textContent = text || '';
    variationMoveListEl.appendChild(cell);
    return cell;
  }
  function appendMoveCell(item,secondPair){
    const cell = appendCell(item ? item.entry.san : '','variation-move-cell move-entry',secondPair);
    if(!item){
      cell.style.cursor = 'default';
      return;
    }
    const positionIndex = item.index + 1;
    if(positionIndex === currentIndex) cell.classList.add('current');
    if(positionIndex > currentIndex) cell.classList.add('future');
    cell.title = 'Zu dieser Variantenstellung springen';
    cell.addEventListener('click', () => setVariationViewIndex(positionIndex));
  }
  function appendMoveGroup(group,secondPair){
    appendCell(group ? group.moveNumber + '.' : '','variation-move-cell move-number',secondPair);
    appendMoveCell(group ? group.white : null,secondPair);
    appendMoveCell(group ? group.black : null,secondPair);
  }

  for(let index=0;index<fullMoves.length;index+=2){
    appendMoveGroup(fullMoves[index],false);
    appendMoveGroup(fullMoves[index + 1] || null,true);
  }
  const currentCell = variationMoveListEl.querySelector('.variation-move-cell.current');
  if(currentCell){
    const targetTop = currentCell.offsetTop - Math.max(0,(variationMoveListEl.clientHeight - currentCell.offsetHeight) / 2);
    variationMoveListEl.scrollTop = Math.max(0,targetTop);
  } else {
    variationMoveListEl.scrollTop = 0;
  }
}
function getVariationSquareEl(x,y){
  if(!variationBoardEl) return null;
  return variationBoardEl.querySelector('.square[data-x="' + x + '"][data-y="' + y + '"]');
}
function renderVariationBoard(){
  syncBoardPlayerStrips();
  cancelActivePieceDrag(variationBoardEl);
  if(!variationBoardEl || !variationGame) return;
  variationBoardEl.innerHTML = '';
  const legalFromSelection = variationSelected
    ? variationGame.legalMoves().filter(move => move.from[0] === variationSelected[0] && move.from[1] === variationSelected[1])
    : [];
  const last = variationHistory.length ? variationHistory[variationHistory.length - 1] : null;
  for(let row=0; row<8; row++){
    for(let col=0; col<8; col++){
      const x = variationOrientationWhite ? col : 7-col;
      const y = variationOrientationWhite ? row : 7-row;
      const sq = document.createElement('div');
      sq.className = 'square ' + (((x+y)%2===0) ? 'light' : 'dark');
      sq.dataset.x = x;
      sq.dataset.y = y;
      if(variationSelected && variationSelected[0] === x && variationSelected[1] === y) sq.classList.add('selected');
      if(legalFromSelection.some(move => {
        const target = legalMoveSelectionTarget(move,legalFromSelection);
        return target[0] === x && target[1] === y;
      })) sq.classList.add('legal');
      const lastVisualTo = last ? visualKingDestination(last) : null;
      if(last && ((last.from[0] === x && last.from[1] === y) || (lastVisualTo[0] === x && lastVisualTo[1] === y))) sq.classList.add('last-move');
      const piece = variationGame.at(x,y);
      if(piece !== '.'){
        const img = document.createElement('img');
        img.className = 'piece-img';
        img.src = pieceImg[piece];
        img.alt = pieceChar[piece] || '';
        sq.appendChild(img);
      }
      if(row === 7){
        const fileLabel = document.createElement('span');
        fileLabel.className = 'coord-file';
        fileLabel.textContent = files[x];
        sq.appendChild(fileLabel);
      }
      if(col === 0){
        const rankLabel = document.createElement('span');
        rankLabel.className = 'coord-rank';
        rankLabel.textContent = 8 - y;
        sq.appendChild(rankLabel);
      }
      sq.addEventListener('click', () => onVariationSquareClick(x,y));
      variationBoardEl.appendChild(sq);
    }
  }
  updateVariationStatus();
  renderVariationMoveList();
  updateBoardNavControls();
}
function commitVariationMove(found, promotion){
  if(!variationGame) return;
  if(variationPurpose === 'conditional' && variationHistory.length >= CONDITIONAL_MOVE_MAX_PLIES) return;
  const before = variationGame.clone();
  const entry = {
    from:found.from.slice(),
    to:found.to.slice(),
    meta:clone(found.meta || {}),
    promotion:promotion || null,
    side:before.turn,
    moveNumber:before.fullmove,
    san:''
  };
  const applied = variationGame.makeMove(entry, false);
  entry.piece = applied.piece;
  entry.taken = applied.taken;
  entry.san = moveToSan(before, entry, variationGame);
  variationHistory.push(entry);
  variationRedo = [];
  variationSelected = null;
  playMoveSound({
    capture:entry.taken !== '.',
    castle:!!(entry.meta && entry.meta.castle),
    promotion:!!entry.promotion,
    check:variationGame.inCheck(variationGame.turn)
  });
  renderVariationBoard();
  if(variationPurpose === 'conditional' && typeof updateConditionalMoveEditorUi === 'function') updateConditionalMoveEditorUi();
}
function onVariationSquareClick(x,y){
  if(!variationGame || variationGame.gameOver()) return;
  if(variationPurpose === 'conditional' && variationHistory.length >= CONDITIONAL_MOVE_MAX_PLIES) return;
  const piece = variationGame.at(x,y);
  if(!variationSelected){
    if(piece === '.' || pieceColor(piece) !== variationGame.turn) return;
    variationSelected = [x,y];
    playUiSound('pickup');
    renderVariationBoard();
    return;
  }
  if(variationSelected[0] === x && variationSelected[1] === y){
    variationSelected = null;
    renderVariationBoard();
    return;
  }
  const found = findMatchingLegalMove(variationGame.legalMoves(), {from:variationSelected, to:[x,y]});
  if(piece !== '.' && pieceColor(piece) === variationGame.turn && !found){
    variationSelected = [x,y];
    playUiSound('pickup');
    renderVariationBoard();
    return;
  }
  if(!found){
    variationSelected = null;
    playUiSound('illegal');
    renderVariationBoard();
    return;
  }
  const movingPiece = variationGame.at(found.from[0], found.from[1]);
  const needsPromotion = movingPiece.toLowerCase() === 'p' && (found.to[1] === 0 || found.to[1] === 7);
  if(needsPromotion){
    showPromotionOverlay(variationGame.turn).then(choice => {
      if(choice && variationGame) commitVariationMove(found, choice);
      else { variationSelected = null; renderVariationBoard(); }
    });
  } else {
    commitVariationMove(found, null);
  }
}
if(variationOpenBtn) variationOpenBtn.addEventListener('click', openVariationBoard);
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && variationModeActive && !document.getElementById('promotionBackdrop')){
    if(variationPurpose === 'conditional' && typeof closeConditionalMoveBoard === 'function') closeConditionalMoveBoard();
    else closeVariationBoard();
  }
});
