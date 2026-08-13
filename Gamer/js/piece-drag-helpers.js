'use strict';

function pieceDragCanStart(mode,x,y){
  if(mode === 'variation'){
    if(!variationGame || variationGame.gameOver()) return false;
    if(variationPurpose === 'conditional' && variationHistory.length >= 2) return false;
    const piece = variationGame.at(x,y);
    return piece !== '.' && pieceColor(piece) === variationGame.turn;
  }
  if(gameEnded || pendingDailyMove || viewIndex !== masterHistory.length) return false;
  const g = buildGameFromHistory(masterHistory.length);
  if(canQueuePremove(g)){
    const premovePiece = g.at(x,y);
    return premovePiece !== '.' && pieceColor(premovePiece) === onlineRoleCode;
  }
  if(onlineInteractionBlockReason(g)) return false;
  const piece = g.at(x,y);
  return piece !== '.' && pieceColor(piece) === g.turn;
}

function highlightVariationDragSelection(x,y){
  if(!variationBoardEl || !variationGame) return;
  variationBoardEl.querySelectorAll('.square.selected,.square.legal').forEach(square => square.classList.remove('selected','legal'));
  const source = getVariationSquareEl(x,y);
  if(source) source.classList.add('selected');
  const legal = variationGame.legalMoves()
    .filter(move => move.from[0] === x && move.from[1] === y);
  legal.forEach(move => {
      const selectionTarget = legalMoveSelectionTarget(move,legal);
      const target = getVariationSquareEl(selectionTarget[0],selectionTarget[1]);
      if(target) target.classList.add('legal');
    });
}

function positionPieceDragGhost(state,clientX,clientY){
  if(!state || !state.ghost) return;
  const left = clientX - state.ghostWidth / 2;
  const top = clientY - state.ghostHeight / 2;
  state.ghost.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0) scale(1.08)';
}

function activatePieceDrag(state,event){
  if(!state || state.dragging) return;
  state.dragging = true;
  const imageRect = state.sourceImg.getBoundingClientRect();
  state.ghostWidth = imageRect.width;
  state.ghostHeight = imageRect.height;
  const ghost = state.sourceImg.cloneNode(false);
  ghost.classList.remove('piece-drag-source');
  ghost.classList.add('piece-drag-ghost');
  ghost.removeAttribute('id');
  ghost.alt = '';
  ghost.setAttribute('aria-hidden','true');
  ghost.style.width = state.ghostWidth + 'px';
  ghost.style.height = state.ghostHeight + 'px';
  state.ghost = ghost;
  document.body.appendChild(ghost);
  state.sourceImg.classList.add('piece-drag-source');
  state.container.classList.add('piece-drag-active');
  positionPieceDragGhost(state,event.clientX,event.clientY);
  try{ state.container.setPointerCapture(state.pointerId); } catch(_){ }

  if(state.mode === 'variation'){
    variationSelected = state.from.slice();
    playUiSound('pickup');
    highlightVariationDragSelection(state.from[0],state.from[1]);
  } else {
    const g = buildGameFromHistory(masterHistory.length);
    selected = state.from.slice();
    playMoveSound({pickup:true});
    if(canQueuePremove(g)) highlightPremoveSelection(state.from[0],state.from[1],g);
    else highlightSelection(state.from[0],state.from[1],g);
  }
}

function cleanUpPieceDrag(state){
  if(!state) return;
  if(state.ghost && state.ghost.isConnected) state.ghost.remove();
  if(state.sourceImg) state.sourceImg.classList.remove('piece-drag-source');
  if(state.container) state.container.classList.remove('piece-drag-active');
  try{
    if(state.container && state.container.hasPointerCapture && state.container.hasPointerCapture(state.pointerId)){
      state.container.releasePointerCapture(state.pointerId);
    }
  } catch(_){ }
}

function cancelActivePieceDrag(container){
  if(!activePieceDrag || (container && activePieceDrag.container !== container)) return;
  const wasDragging = activePieceDrag.dragging;
  cleanUpPieceDrag(activePieceDrag);
  activePieceDrag = null;
  if(wasDragging) suppressPieceDragClickUntil = Date.now() + 500;
}

function pieceDragSquareAtPoint(container,clientX,clientY){
  if(!container) return null;
  const squares = container.querySelectorAll('.square');
  for(const square of squares){
    const rect = square.getBoundingClientRect();
    if(clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom){
      return [Number(square.dataset.x),Number(square.dataset.y)];
    }
  }
  return null;
}

function beginPiecePointer(event,container,mode){
  if(!container || activePieceDrag || event.isPrimary === false) return;
  if(event.pointerType === 'mouse' && event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  const square = target ? target.closest('.square') : null;
  if(!square || !container.contains(square)) return;
  const x = Number(square.dataset.x);
  const y = Number(square.dataset.y);
  const sourceImg = square.querySelector('.piece-img');
  if(!Number.isInteger(x) || !Number.isInteger(y) || !sourceImg || !pieceDragCanStart(mode,x,y)) return;
  activePieceDrag = {
    container,
    mode,
    pointerId:event.pointerId,
    pointerType:event.pointerType || 'mouse',
    startX:event.clientX,
    startY:event.clientY,
    from:[x,y],
    sourceImg,
    ghost:null,
    ghostWidth:0,
    ghostHeight:0,
    dragging:false
  };
}

function movePiecePointer(event){
  const state = activePieceDrag;
  if(!state || event.pointerId !== state.pointerId) return;
  if(!state.dragging){
    const distance = Math.hypot(event.clientX - state.startX,event.clientY - state.startY);
    const threshold = state.pointerType === 'touch' ? 9 : 5;
    if(distance < threshold) return;
    activatePieceDrag(state,event);
  }
  if(state.dragging){
    event.preventDefault();
    positionPieceDragGhost(state,event.clientX,event.clientY);
  }
}

function endPiecePointer(event,shouldDrop){
  const state = activePieceDrag;
  if(!state || event.pointerId !== state.pointerId) return;
  const wasDragging = state.dragging;
  const target = wasDragging && shouldDrop
    ? pieceDragSquareAtPoint(state.container,event.clientX,event.clientY)
    : null;
  cleanUpPieceDrag(state);
  activePieceDrag = null;
  if(!wasDragging) return;

  suppressPieceDragClickUntil = Date.now() + 500;
  event.preventDefault();
  if(!target) return;

  if(state.mode === 'variation'){
    variationSelected = state.from.slice();
    onVariationSquareClick(target[0],target[1]);
  } else {
    selected = state.from.slice();
    onSquareClick(target[0],target[1]);
  }
}

function suppressClickAfterPieceDrag(event){
  if(Date.now() >= suppressPieceDragClickUntil) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
