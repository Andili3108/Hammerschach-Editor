'use strict';

(() => {
  const root = document.documentElement;
  const layout = document.querySelector('.top-layout');
  const column = document.querySelector('.board-column');
  const board = document.querySelector('.board-wrapper');
  const lowerPlayer = document.getElementById('boardPlayerBottom');
  const side = document.querySelector('.moves-right');
  const footer = column && column.querySelector('.site-footnote');
  const navigation = document.getElementById('roomGamesNavigation');
  const defaults = document.getElementById('roomDefaultActions');
  const openButton = document.getElementById('roomMyGamesBtn');
  const sourceCount = document.getElementById('dailyGamesTurnCount');
  const roomCount = document.getElementById('roomGamesTurnCount');
  const confirmation = document.getElementById('dailyMoveConfirmation');
  const dialog = document.getElementById('dailyMoveDialog');
  if(!layout || !column || !board || !lowerPlayer || !side || !navigation || !defaults || !openButton || !confirmation || !dialog) return;

  openButton.addEventListener('click', () => openDailyGamesDialog(false, {running:true}));
  // Escape means the same as the undo button. Backdrop clicks do nothing;
  // only the existing confirmation button can commit a move.
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancelPendingDailyMove();
  });
  let scheduled = 0;
  let popupFocus = null;

  function syncCount(){
    if(!sourceCount || !roomCount) return;
    const text = sourceCount.textContent || '0';
    if(roomCount.textContent !== text) roomCount.textContent = text;
    roomCount.hidden = sourceCount.hidden;
    const label = sourceCount.getAttribute('aria-label');
    if(label) roomCount.setAttribute('aria-label',label);
    else roomCount.removeAttribute('aria-label');
  }

  function positionDialog(){
    const rect = board.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0;
    const top = viewport ? viewport.offsetTop : 0;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    const popupWidth = Math.min(420, Math.max(0, rect.width - 16), width - 24);
    dialog.style.width = popupWidth + 'px';
    const halfHeight = (dialog.getBoundingClientRect().height || 80) / 2;
    const x = Math.max(left + popupWidth / 2 + 12, Math.min(left + width - popupWidth / 2 - 12, rect.left + rect.width / 2));
    const y = Math.max(top + halfHeight + 12, Math.min(top + height - halfHeight - 12, rect.top + rect.height / 2));
    dialog.style.left = x + 'px';
    dialog.style.top = y + 'px';
  }

  function closePopup(){
    if(!dialog.open) return;
    dialog.close();
    // The trigger was a square (or a drag), not necessarily a focusable button.
    // Keep keyboard focus out of the now closed dialog without scrolling.
    const target = popupFocus && popupFocus.isConnected && popupFocus.getClientRects().length && !popupFocus.closest('[hidden],dialog:not([open])')
      ? popupFocus : board;
    if(target === board && !board.hasAttribute('tabindex')) board.tabIndex = -1;
    target.focus({preventScroll:true});
    popupFocus = null;
  }

  function update(){
    scheduled = 0;
    const room = !!onlineRoomId && !onlineRoomCancelled;
    const member = !!onlineAuthToken && !!onlineAuthUser;
    const player = onlineRoleCode === 'w' || onlineRoleCode === 'b';
    const pending = room && !confirmation.hidden;
    navigation.hidden = !room || (!member && !player);
    openButton.hidden = !member;
    defaults.hidden = pending;
    navigation.classList.toggle('room-confirming', pending);
    // Hide only the desktop presentation, not the source control: the mobile
    // drawer intentionally delegates clicks to that same source button.
    root.classList.toggle('room-actions-active', room && member);
    syncCount();

    // Use the real column positions, including tablet landscape and split view.
    const boardRect = board.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();
    const stacked = getComputedStyle(layout).flexDirection === 'column' ||
      (boardRect.width > 0 && sideRect.left < boardRect.right - 1);
    layout.classList.toggle('room-board-aligned', room && !stacked);
    layout.classList.toggle('room-board-stacked', room && stacked);
    if(stacked && room){
      if(navigation.previousElementSibling !== lowerPlayer) lowerPlayer.after(navigation);
      if(footer && footer.parentElement !== layout) layout.appendChild(footer);
    } else {
      if(navigation.parentElement !== side) side.prepend(navigation);
      if(footer && footer.parentElement !== column) column.appendChild(footer);
    }

    if(pending && stacked){
      if(confirmation.parentElement !== dialog) dialog.appendChild(confirmation);
      positionDialog();
      if(!dialog.open){
        popupFocus = document.activeElement;
        dialog.showModal();
        // Never focus the committing action automatically.
        dailyMoveCancelBtn.focus({preventScroll:true});
      }
      positionDialog();
    } else {
      closePopup();
      if(confirmation.parentElement !== navigation) navigation.appendChild(confirmation);
    }

    if(room && !stacked){
      const rect = board.getBoundingClientRect();
      const offset = Math.max(0, rect.top - column.getBoundingClientRect().top);
      const values = {'--room-board-offset':offset+'px','--room-board-height':rect.height+'px'};
      for(const [name,value] of Object.entries(values)){
        if(side.style.getPropertyValue(name) !== value) side.style.setProperty(name,value);
      }
    }
    const hint = document.getElementById('nextDailyGameHint');
    const next = document.getElementById('nextDailyGameBtn');
    if(hint && next) next.title = hint.textContent;
  }
  function schedule(){ if(!scheduled) scheduled = requestAnimationFrame(update); }
  const observer = new ResizeObserver(schedule);
  [layout,board,column,document.getElementById('boardPlayerTop')].filter(Boolean).forEach(element => observer.observe(element));
  new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['class']});
  for(const id of ['playersPanel','dailyMoveConfirmation','nextDailyGameBox']){
    const element = document.getElementById(id);
    if(element) new MutationObserver(schedule).observe(element,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});
  }
  if(sourceCount) new MutationObserver(syncCount).observe(sourceCount,{attributes:true,attributeFilter:['hidden','aria-label'],childList:true,subtree:true,characterData:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  window.addEventListener('pageshow',schedule,{passive:true});
  window.addEventListener('scroll',() => { if(dialog.open) positionDialog(); },{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',schedule,{passive:true});
    window.visualViewport.addEventListener('scroll',() => { if(dialog.open) positionDialog(); },{passive:true});
  }
  // Synchronize in the same render as the preview; do not wait for a frame in
  // which the old controls could still be clicked. No move logic is replaced.
  const previousConfirmation = updateDailyMoveConfirmationUi;
  updateDailyMoveConfirmationUi = function(){ previousConfirmation(); update(); };
  const previousRefresh = refreshNextDailyGameButton;
  refreshNextDailyGameButton = function(options){ schedule(); return previousRefresh(options); };
  schedule();
})();
