'use strict';

function onSquareClick(x,y){
  if(gameEnded) return;
  if(pendingDailyMove){
    statusEl.textContent = 'Zugvorschau aktiv — bitte unter dem Brett bestätigen oder zurücknehmen.';
    return;
  }
  const g = buildGameFromHistory(masterHistory.length);
  if(viewIndex !== masterHistory.length) return;
  if(canQueuePremove(g)){
    onPremoveSquareClick(x,y,g);
    return;
  }
  const blockReason = onlineInteractionBlockReason(g);
  if(blockReason){ showIllegalMoveFeedback(blockReason); return; }
  const piece = g.at(x,y);
  if(!selected){
    if(piece === '.' || pieceColor(piece) !== g.turn) return;
    selected = [x,y];
    playMoveSound({pickup:true});
    highlightSelection(x,y,g);
    return;
  }
  if(selected[0] === x && selected[1] === y){
    selected = null;
    renderBoard();
    return;
  }
  const selectedLegalMove = findMatchingLegalMove(g.legalMoves(), {from:selected, to:[x,y]});
  if(piece !== '.' && pieceColor(piece) === g.turn && !selectedLegalMove){
    selected = [x,y];
    playMoveSound({pickup:true});
    highlightSelection(x,y,g);
    return;
  }
  const found = selectedLegalMove;
  if(!found){
    showIllegalMoveFeedback('Illegaler Zug — König im Schach oder Zug nicht erlaubt');
    highlightSelection(selected[0], selected[1], g);
    return;
  }
  const movingPiece = g.at(found.from[0], found.from[1]);
  const needsPromotion = movingPiece.toLowerCase() === 'p' && (found.to[1] === 0 || found.to[1] === 7);
  if(needsPromotion){
    showPromotionOverlay(g.turn).then(choice => {
      if(!choice){ selected = null; renderBoard(); return; }
      handleChosenHumanMove(found, choice);
    });
  } else {
    handleChosenHumanMove(found, null);
  }
}

