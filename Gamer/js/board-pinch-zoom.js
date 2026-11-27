/* Native two-finger zoom takes priority over board moves. */
'use strict';
window.installBoardPinchZoom = function(containers,cancelDrag){
  const boards = containers.filter(Boolean);
  let pinching = false;
  let suppressClickUntil = 0;
  let moveMethod;
  function applyMoveMethod(){
    const next = window.HammerschachPreferences.get('moveMethod');
    if(next === moveMethod) return;
    if(moveMethod !== undefined){
      cancelDrag();
      suppressClickUntil = Date.now() + 500;
    }
    moveMethod = next;
    // Decide before the gesture starts: tap mode scrolls, drag mode moves pieces.
    boards.forEach(board => { board.style.touchAction = next === 'click' ? 'manipulation' : 'pinch-zoom'; });
  }
  window.addEventListener('hammerschach:preferences',applyMoveMethod);
  applyMoveMethod();

  // A resize between pointerdown and release can move a different legal
  // square under the pointer. Cancel before any board-specific drop handler.
  function trial(){
    if(window.HammerschachScreenFit) return window.HammerschachScreenFit;
    try { return window.parent.HammerschachScreenFit; } catch (_) { return null; }
  }
  let gesture=null;
  function geometry(board){
    const rect=board.getBoundingClientRect();
    const frame=window.frameElement?.getBoundingClientRect();
    return [rect.left,rect.top,rect.width,rect.height,frame?.left,frame?.top,frame?.width,frame?.height];
  }
  document.addEventListener('pointerdown',event=>{
    const board=boards.find(el=>el.contains(event.target));
    const fit=trial();
    if(board && fit && event.isPrimary){
      // A saved preference may arrive while a finger is already on the board.
      gesture={id:event.pointerId,board,rect:fit.enabled ? geometry(board) : null,revision:fit.revision};
    }
  },true);
  document.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const {board,rect,revision}=gesture;
    gesture=null;
    if(revision!==trial()?.revision || (rect && geometry(board).some((v,i)=>v!==rect[i]))){
      cancelDrag();
      suppressClickUntil=Date.now()+500;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('pointercancel',()=>{gesture=null;},true);

  function observeTouches(event){
    if(event.touches.length > 1){
      pinching = true;
      cancelDrag();
    }
    // Keep the board locked until BOTH fingers have left, even after
    // the browser has sent pointercancel to take over native zoom.
    if(pinching){
      suppressClickUntil = Date.now() + 500;
      if(event.touches.length === 0) pinching = false;
    }
  }
  for(const type of ['touchstart','touchmove','touchend','touchcancel']){
    document.addEventListener(type,observeTouches,{capture:true,passive:true});
  }
  document.addEventListener('click',event => {
    if(event.detail === 0 || (!pinching && Date.now() >= suppressClickUntil)) return;
    if(!boards.some(board => board.contains(event.target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  window.addEventListener('blur',() => {
    if(pinching) suppressClickUntil = Date.now() + 500;
    pinching = false;
    cancelDrag();
  });
  return {
    isActive:() => pinching,
    canDrag:() => !pinching && moveMethod !== 'click',
    canClick:(fromDrag=false) => !pinching && (fromDrag || moveMethod !== 'drag')
  };
};
