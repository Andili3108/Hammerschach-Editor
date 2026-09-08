'use strict';

(() => {
  const layout = document.querySelector('.top-layout');
  const column = document.querySelector('.board-column');
  const board = document.querySelector('.board-wrapper');
  const lowerPlayer = document.getElementById('boardPlayerBottom');
  const side = document.querySelector('.moves-right');
  const footer = column && column.querySelector('.site-footnote');
  const navigation = document.getElementById('roomGamesNavigation');
  const openButton = document.getElementById('roomMyGamesBtn');
  const nextBox = document.getElementById('nextDailyGameBox');
  if(!layout || !column || !board || !side || !navigation || !openButton) return;
  openButton.addEventListener('click', () => openDailyGamesDialog(false, {running:true}));
  let scheduled = 0;
  function update(){
    scheduled = 0;
    const room = !!onlineRoomId && !onlineRoomCancelled;
    const member = !!onlineAuthToken && !!onlineAuthUser;
    navigation.hidden = !room || !member;
    // A compact tablet header does not imply a stacked board layout. Measure
    // the actual columns so landscape, rotation and split view use one rule.
    const boardRect = board.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();
    const stacked = getComputedStyle(layout).flexDirection === 'column' ||
      (boardRect.width > 0 && sideRect.left < boardRect.right - 1);
    // Keep the original button (and its click listener) in the same navigation
    // group, including when it becomes visible after a move or reconnection.
    if(nextBox && (nextBox.parentElement !== navigation || nextBox.previousElementSibling !== openButton)) openButton.after(nextBox);
    layout.classList.toggle('room-board-aligned', room && !stacked);
    layout.classList.toggle('room-board-stacked', room && stacked);
    if(stacked && room){
      if(navigation.previousElementSibling !== lowerPlayer) lowerPlayer.after(navigation);
      if(footer && footer.parentElement !== layout) layout.appendChild(footer);
    } else {
      if(navigation.parentElement !== side) side.prepend(navigation);
      if(footer && footer.parentElement !== column) column.appendChild(footer);
    }
    if(room && !stacked){
      const rect = board.getBoundingClientRect();
      const offset = Math.max(0,rect.top-column.getBoundingClientRect().top);
      const height = rect.height;
      // Measure the real outer board, including its border and responsive size.
      const values = {'--room-board-offset':offset+'px','--room-board-height':height+'px'};
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
  [board,column,document.getElementById('boardPlayerTop')].filter(Boolean).forEach(element => observer.observe(element));
  new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  new MutationObserver(schedule).observe(document.getElementById('playersPanel'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(schedule).observe(document.getElementById('nextDailyGameBox'),{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  window.addEventListener('pageshow',schedule,{passive:true});
  // The online state refresh also runs on login, room entry and reconnection.
  const previousRefresh = refreshNextDailyGameButton;
  refreshNextDailyGameButton = function(options){ schedule(); return previousRefresh(options); };
  schedule();
})();
