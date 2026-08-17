'use strict';

function syncMoveToOnline(mv, movedSide, options){
  options = options || {};
  if(applyingRemoteMove) return;
  if(!onlineRoomId || !onlineGameStarted || !onlineConnected) return;
  if(onlineRoleCode !== movedSide) return;
  const messageId = 'mv_' + Date.now() + '_' + randomToken(5);
  const move = {
    ply: actualMoveCount(),
    side: movedSide,
    from: mv.from,
    to: mv.to,
    promotion: mv.promotion || null,
    castle: castleSideCode(mv) || null,
    san: mv.san || '',
    messageId
  };
  onlineLastMoveMessageId = messageId;
  const payload = {type:'move', move, messageId};
  if(options.claimDraw === true && isDailyTimeControl()){
    payload.claimDraw = true;
    if(options.claimDrawReason) payload.claimDrawReason = options.claimDrawReason;
  } else if(options.offerDraw === true && isDailyTimeControl()){
    payload.offerDraw = true;
  }
  if(sendOnlineMessage(payload)){
    onlineMoveTimings.set(messageId,{sentAt:performance.now()});
    if(onlineMoveTimings.size > 12) onlineMoveTimings.delete(onlineMoveTimings.keys().next().value);
    onlineLastMessage = 'Zug wird übertragen...';
    updateOnlineUi();
    setTimeout(() => {
      if(onlineLastMoveMessageId === messageId && onlineConnected){
        requestOnlineState();
      }
    }, 1800);
  } else {
    onlineLastMessage = 'Zug konnte nicht übertragen werden.';
    updateOnlineUi();
  }
}
function commitHumanMove(found, promotion, options){
  if(viewIndex < masterHistory.length){
    masterHistory.splice(viewIndex);
    invalidateHistoryStateCache();
  }
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
  viewIndex = masterHistory.length;
  lastMove = {from:mv.from, to:mv.to, meta:mv.meta || {}};
  selected = null;
  afterMoveClock(before.turn);
  playMoveSound({capture:mv.taken !== '.', castle:!!(mv.meta && mv.meta.castle), promotion:!!mv.promotion, check:info.inCheck(info.turn)});
  syncMoveToOnline(mv, before.turn, options);
  scheduleBoardRender();
}
function showPromotionOverlay(color){
  return new Promise(resolve => {
    const old = document.getElementById('promotionBackdrop');
    if(old) old.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'promotionBackdrop';
    backdrop.className = 'promo-backdrop';
    const modal = document.createElement('div');
    modal.className = 'promo-modal';
    const pieces = color === 'w' ? {Q:'♕',R:'♖',B:'♗',N:'♘'} : {Q:'♛',R:'♜',B:'♝',N:'♞'};
    modal.innerHTML = '<h3>Bauernumwandlung</h3><p>Bitte wähle die gewünschte Figur:</p><div class="promo-grid">' +
      Object.entries(pieces).map(([key,val]) => '<button class="promo-btn" data-piece="'+key+'"><span class="promo-piece">'+val+'</span>'+({Q:'Dame',R:'Turm',B:'Läufer',N:'Springer'}[key])+'</button>').join('') +
      '</div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="promoCancel" class="button-flat">Abbrechen</button></div>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    modal.querySelectorAll('.promo-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); backdrop.remove(); resolve(btn.dataset.piece); }));
    modal.querySelector('#promoCancel').addEventListener('click', e => { e.stopPropagation(); backdrop.remove(); resolve(null); });
  });
}
moveListEl.addEventListener('click', event => {
  const cell = event.target instanceof Element ? event.target.closest('.move-cell[data-move-index]') : null;
  if(!cell || !moveListEl.contains(cell) || isMoveNavigationLocked()) return;
  const index = Number(cell.dataset.moveIndex);
  if(!Number.isInteger(index) || index < 0 || index >= masterHistory.length) return;
  viewIndex = index + 1;
  selected = null;
  renderBoard();
});
