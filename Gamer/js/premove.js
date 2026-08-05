'use strict';

function premoveSquareName(square){
  return square && square.length >= 2 ? coordToAlg(square[0],square[1]) : '';
}
function premoveLabel(move){
  if(!move) return '';
  return premoveSquareName(move.from) + '–' + premoveSquareName(move.visualTo || move.to) + (move.promotion ? '=' + String(move.promotion).toUpperCase() : '');
}
function canQueuePremove(gameState){
  const g = gameState || buildGameFromHistory(masterHistory.length);
  return !!(
    !isDailyTimeControl() && !variationModeActive && !pendingDailyMove &&
    viewIndex === masterHistory.length && onlineRoomId && onlineConnected && onlineGameStarted &&
    !onlineGameEnded && !gameEnded && !timeLost &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') &&
    g.turn !== onlineRoleCode
  );
}
function updatePremoveUi(){
  if(!premoveNoticeEl) return;
  const visible = !!queuedPremove;
  premoveNoticeEl.hidden = !visible;
  if(premoveNoticeTextEl) premoveNoticeTextEl.textContent = visible ? 'Premove ' + premoveLabel(queuedPremove) + ' vorgemerkt' : 'Premove vorgemerkt';
  if(premoveCancelBtn) premoveCancelBtn.disabled = !visible;
}
function cancelQueuedPremove(options){
  options = options || {};
  const existed = !!queuedPremove;
  queuedPremove = null;
  selected = null;
  updatePremoveUi();
  if(existed && options.render !== false) renderBoard();
  if(existed && !options.silent && statusEl){
    statusEl.textContent = 'Premove abgebrochen.';
    setTimeout(refreshHeaderStatusFromState,900);
  }
  return existed;
}
function premovePathClear(gameState,from,to){
  const dx = Math.sign(to[0] - from[0]);
  const dy = Math.sign(to[1] - from[1]);
  let x = from[0] + dx;
  let y = from[1] + dy;
  while(x !== to[0] || y !== to[1]){
    if(gameState.at(x,y) !== '.') return false;
    x += dx;
    y += dy;
  }
  return true;
}
function premoveGeometryAllows(gameState,from,to){
  if(!gameState || !from || !to) return false;
  const fx = from[0], fy = from[1], tx = to[0], ty = to[1];
  if([fx,fy,tx,ty].some(value => !Number.isInteger(value) || value < 0 || value > 7)) return false;
  if(fx === tx && fy === ty) return false;
  const piece = gameState.at(fx,fy);
  if(piece === '.' || pieceColor(piece) !== onlineRoleCode) return false;
  const dx = tx - fx;
  const dy = ty - fy;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  switch(piece.toLowerCase()){
    case 'p': {
      const direction = onlineRoleCode === 'w' ? -1 : 1;
      const startRank = onlineRoleCode === 'w' ? 6 : 1;
      if(ay === 1 && ax === 1 && dy === direction) return true;
      if(dx === 0 && dy === direction) return true;
      return dx === 0 && fy === startRank && dy === direction * 2 && gameState.at(fx,fy + direction) === '.';
    }
    case 'n': return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    case 'b': return ax === ay && premovePathClear(gameState,from,to);
    case 'r': return (dx === 0 || dy === 0) && premovePathClear(gameState,from,to);
    case 'q': return (dx === 0 || dy === 0 || ax === ay) && premovePathClear(gameState,from,to);
    case 'k': return ax <= 1 && ay <= 1;
    default: return false;
  }
}
function premoveCandidatesFrom(gameState,from){
  const candidates = [];
  const seen = new Set();
  const add = move => {
    if(!move || !move.to) return;
    const key = move.to[0] + ':' + move.to[1];
    if(seen.has(key)) return;
    seen.add(key);
    candidates.push(move);
  };
  try{
    const hypothetical = gameState.clone();
    hypothetical.turn = onlineRoleCode;
    hypothetical.legalMoves()
      .filter(move => move.from[0] === from[0] && move.from[1] === from[1])
      .forEach(add);
  } catch(_){}
  for(let y=0;y<8;y++){
    for(let x=0;x<8;x++){
      if(premoveGeometryAllows(gameState,from,[x,y])) add({from:from.slice(),to:[x,y],meta:{}});
    }
  }
  return candidates;
}
function findPremoveCandidate(gameState,from,to){
  return findMatchingLegalMove(premoveCandidatesFrom(gameState,from),{from,to});
}
function highlightPremoveSelection(x,y,gameState){
  clearBoardHighlights();
  markLastMove();
  markQueuedPremove();
  markSquare(x,y,'selected');
  const candidates = premoveCandidatesFrom(gameState,[x,y]);
  candidates.forEach(move => {
    const target = legalMoveSelectionTarget(move,candidates);
    markSquare(target[0],target[1],'premove-legal');
  });
}
function finishQueuePremove(candidate,promotion){
  const g = buildGameFromHistory(masterHistory.length);
  if(!canQueuePremove(g)){
    selected = null;
    renderBoard();
    showIllegalMoveFeedback('Der Gegner hat bereits gezogen — bitte deinen Zug jetzt normal ausführen.');
    return;
  }
  const currentCandidate = findPremoveCandidate(g,candidate.from,candidate.to);
  if(!currentCandidate){
    selected = null;
    renderBoard();
    showIllegalMoveFeedback('Dieser Premove kann nicht vorgemerkt werden.');
    return;
  }
  queuedPremove = {
    from:currentCandidate.from.slice(),
    to:currentCandidate.to.slice(),
    visualTo:visualKingDestination(currentCandidate).slice(),
    promotion:promotion || null,
    castle:castleSideCode(currentCandidate) || null,
    role:onlineRoleCode,
    queuedAtPly:actualMoveCount()
  };
  selected = null;
  renderBoard();
}
function queuePremoveCandidate(candidate,gameState){
  const movingPiece = gameState.at(candidate.from[0],candidate.from[1]);
  const needsPromotion = movingPiece.toLowerCase() === 'p' && (candidate.to[1] === 0 || candidate.to[1] === 7);
  if(needsPromotion){
    showPromotionOverlay(onlineRoleCode).then(choice => {
      if(choice) finishQueuePremove(candidate,choice);
      else { selected = null; renderBoard(); }
    });
  } else {
    finishQueuePremove(candidate,null);
  }
}
function onPremoveSquareClick(x,y,gameState){
  const g = gameState || buildGameFromHistory(masterHistory.length);
  const piece = g.at(x,y);
  if(queuedPremove){
    const clickedQueuedSquare = (queuedPremove.from[0] === x && queuedPremove.from[1] === y) || (queuedPremove.to[0] === x && queuedPremove.to[1] === y);
    if(clickedQueuedSquare){ cancelQueuedPremove(); return; }
    queuedPremove = null;
    updatePremoveUi();
  }
  if(!selected){
    if(piece === '.' || pieceColor(piece) !== onlineRoleCode) return;
    selected = [x,y];
    playMoveSound({pickup:true});
    highlightPremoveSelection(x,y,g);
    return;
  }
  if(selected[0] === x && selected[1] === y){
    selected = null;
    renderBoard();
    return;
  }
  const candidate = findPremoveCandidate(g,selected,[x,y]);
  if(piece !== '.' && pieceColor(piece) === onlineRoleCode && !candidate){
    selected = [x,y];
    playMoveSound({pickup:true});
    highlightPremoveSelection(x,y,g);
    return;
  }
  if(!candidate){
    selected = null;
    renderBoard();
    showIllegalMoveFeedback('Dieser Premove ist für die gewählte Figur nicht möglich.');
    return;
  }
  queuePremoveCandidate(candidate,g);
}
function executeQueuedPremove(){
  if(!queuedPremove) return false;
  const queued = queuedPremove;
  queuedPremove = null;
  selected = null;
  updatePremoveUi();
  const g = buildGameFromHistory(masterHistory.length);
  const ready = !!(
    queued.role === onlineRoleCode && !isDailyTimeControl() &&
    onlineRoomId && onlineConnected && onlineGameStarted &&
    !onlineGameEnded && !gameEnded && !timeLost &&
    viewIndex === masterHistory.length && g.turn === onlineRoleCode
  );
  const found = ready ? findMatchingLegalMove(g.legalMoves(),queued) : null;
  if(!found){
    renderBoard();
    if(statusEl){
      const message = 'Premove ' + premoveLabel(queued) + ' verworfen — nach dem gegnerischen Zug nicht legal.';
      setTimeout(() => {
        statusEl.textContent = message;
        setTimeout(refreshHeaderStatusFromState,1500);
      },0);
    }
    return false;
  }
  commitHumanMove(found,queued.promotion || null);
  return true;
}
if(premoveCancelBtn) premoveCancelBtn.addEventListener('click',() => cancelQueuedPremove());
