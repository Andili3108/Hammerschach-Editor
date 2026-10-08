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
