'use strict';

/*
 * Freie Brettgröße für geeignete Desktopfenster.
 * Die Einstellung bleibt gerätebezogen; Lobby, Mobilgeräte und kleine Fenster
 * verwenden weiterhin unverändert die 1100-px-Basis mit 760-px-Brett.
 */
(function initialiseBoardSizeControl(){
  const root = document.documentElement;
  const wrap = document.getElementById('boardSizeWrap');
  const boardButton = document.getElementById('boardSizeBtn');
  const compactButton = document.getElementById('compactBoardSizeBtn');
  const popup = document.getElementById('boardSizePopup');
  const closeButton = document.getElementById('boardSizeCloseBtn');
  const range = document.getElementById('boardSizeRange');
  const minusButton = document.getElementById('boardSizeMinusBtn');
  const plusButton = document.getElementById('boardSizePlusBtn');
  const resetButton = document.getElementById('boardSizeResetBtn');
  const valueOutput = document.getElementById('boardSizeValue');
  const effectiveOutput = document.getElementById('boardSizeEffective');
  const presets = Array.from(document.querySelectorAll('[data-board-size]'));
  const roomLobbyButton = document.getElementById('roomLobbyBtn');

  if(!wrap || !boardButton || !compactButton || !popup || !range){
    root.classList.remove('desktop-board-sizing-active','desktop-board-compact');
    return;
  }

  const STORAGE_KEY = 'hammerschach.desktopBoardSize.v1';
  const DEFAULT_SIZE = 760;
  const MIN_SIZE = 760;
  const MAX_SIZE = 1000;
  const STEP = 10;
  const RIGHT_COLUMN = 324;
  const LAYOUT_GAP = 16;
  const PAGE_GUTTER = 24;
  let preferredSize = readStoredSize();
  let popupAnchor = null;
  let refreshFrame = 0;

  function clamp(value,min,max){
    return Math.min(max,Math.max(min,value));
  }

  function normalizedSize(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return DEFAULT_SIZE;
    return clamp(Math.round(numeric / STEP) * STEP,MIN_SIZE,MAX_SIZE);
  }

  function readStoredSize(){
    try{
      return normalizedSize(localStorage.getItem(STORAGE_KEY));
    }catch(_){
      return DEFAULT_SIZE;
    }
  }

  function storeSize(){
    try{ localStorage.setItem(STORAGE_KEY,String(preferredSize)); }catch(_){ }
  }

  function desktopViewport(){
    return window.matchMedia('(min-width: 1101px) and (min-height: 720px) and (hover: hover) and (pointer: fine)').matches;
  }

  function roomContext(){
    const roomClass = root.classList.contains('hammerschach-room-view');
    const roomButtonVisible = !!(roomLobbyButton && !roomLobbyButton.hidden);
    const embeddedTool = ['learning-tool-active','analyzer-tool-active','trainer-tool-active','schachlabor-tool-active','openings-tool-active','fairplay-tool-active','reader-tool-active','tv-tool-active']
      .some(className => root.classList.contains(className));
    return (roomClass || roomButtonVisible)
      && !root.classList.contains('member-lobby-view')
      && !root.classList.contains('visitor-start-view')
      && !embeddedTool;
  }

  function maximumFittingSize(){
    const widthLimit = window.innerWidth - RIGHT_COLUMN - LAYOUT_GAP - PAGE_GUTTER;
    const heightLimit = window.innerHeight - 120;
    return clamp(Math.floor(Math.min(MAX_SIZE,widthLimit,heightLimit) / STEP) * STEP,MIN_SIZE,MAX_SIZE);
  }

  function effectiveSize(){
    return Math.min(preferredSize,maximumFittingSize());
  }

  function updateCompactMode(effective,forceDecision){
    if(!forceDecision) return;
    const compactNow = root.classList.contains('desktop-board-compact');
    let compactNext = compactNow;
    if(compactNow && (preferredSize <= 780 || effective <= 760)) compactNext = false;
    if(!compactNow && preferredSize >= 820 && effective >= 780) compactNext = true;
    root.classList.toggle('desktop-board-compact',compactNext);
  }

  function updateControls(effective,available){
    range.value = String(preferredSize);
    range.setAttribute('aria-valuetext',preferredSize === DEFAULT_SIZE ? 'Standardgröße' : preferredSize + ' Pixel');
    if(valueOutput) valueOutput.textContent = preferredSize + ' px';
    if(effectiveOutput){
      const constrained = available && effective < preferredSize;
      effectiveOutput.hidden = !constrained;
      effectiveOutput.classList.toggle('board-size-effective',constrained);
      effectiveOutput.textContent = constrained ? 'Aktuell möglich: ' + effective + ' px' : '';
    }
    if(minusButton) minusButton.disabled = preferredSize <= MIN_SIZE;
    if(plusButton) plusButton.disabled = preferredSize >= MAX_SIZE;
    presets.forEach(button => {
      const active = Number(button.dataset.boardSize) === preferredSize;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }

  function closePopup(restoreFocus){
    if(popup.hidden) return;
    popup.hidden = true;
    boardButton.setAttribute('aria-expanded','false');
    compactButton.setAttribute('aria-expanded','false');
    const anchor = popupAnchor;
    popupAnchor = null;
    if(restoreFocus !== false && anchor && typeof anchor.focus === 'function') anchor.focus();
  }

  function applySize(forceCompactDecision){
    const available = desktopViewport() && roomContext();
    wrap.hidden = !available;

    if(!available){
      root.classList.remove('desktop-board-sizing-active','desktop-board-compact');
      root.style.removeProperty('--board-max');
      root.style.removeProperty('--desktop-shell-width');
      compactButton.hidden = true;
      closePopup(false);
      updateControls(DEFAULT_SIZE,false);
      return;
    }

    const effective = effectiveSize();
    const customSize = effective > DEFAULT_SIZE;
    root.style.setProperty('--board-max',effective + 'px');
    root.style.setProperty('--desktop-shell-width',(effective + RIGHT_COLUMN + LAYOUT_GAP) + 'px');
    root.classList.toggle('desktop-board-sizing-active',customSize);
    updateCompactMode(effective,forceCompactDecision);
    /* Der kompakte Header ist unabhängig von der Brettgröße. Der Zugriff auf
       die Brettgröße bleibt trotzdem an die bestehende Desktopprüfung gebunden. */
    compactButton.hidden = !available;
    updateControls(effective,true);

    window.dispatchEvent(new CustomEvent('hammerschach:board-size-change',{
      detail:{preferred:preferredSize,effective,compact:root.classList.contains('desktop-board-compact')}
    }));
    if(typeof hammerschachScheduleHeightReport === 'function') hammerschachScheduleHeightReport(false);
  }

  function scheduleApply(forceCompactDecision){
    if(refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      applySize(forceCompactDecision);
      if(!popup.hidden && popupAnchor) positionPopup(popupAnchor);
    });
  }

  function positionPopup(anchor){
    if(!anchor || popup.hidden) return;
    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const gutter = 12;
    let left = anchorRect.left + (anchorRect.width - popupRect.width) / 2;
    left = clamp(left,gutter,window.innerWidth - popupRect.width - gutter);
    let top = anchorRect.bottom + 9;
    if(top + popupRect.height > window.innerHeight - gutter) top = anchorRect.top - popupRect.height - 9;
    top = clamp(top,gutter,Math.max(gutter,window.innerHeight - popupRect.height - gutter));
    popup.style.left = Math.round(left) + 'px';
    popup.style.top = Math.round(top) + 'px';
  }

  function openPopup(anchor){
    if(anchor.hidden || wrap.hidden) return;
    popupAnchor = anchor;
    popup.hidden = false;
    boardButton.setAttribute('aria-expanded',String(anchor === boardButton));
    compactButton.setAttribute('aria-expanded',String(anchor === compactButton));
    requestAnimationFrame(() => {
      positionPopup(anchor);
      range.focus({preventScroll:true});
    });
  }

  function togglePopup(anchor){
    if(!popup.hidden && popupAnchor === anchor){
      closePopup(true);
      return;
    }
    openPopup(anchor);
  }

  function setPreferredSize(value,commit){
    preferredSize = normalizedSize(value);
    if(commit) storeSize();
    applySize(commit);
    if(!popup.hidden && popupAnchor) requestAnimationFrame(() => positionPopup(popupAnchor));
  }

  boardButton.addEventListener('click',() => togglePopup(boardButton));
  compactButton.addEventListener('click',() => togglePopup(compactButton));
  if(closeButton) closeButton.addEventListener('click',() => closePopup(true));
  range.addEventListener('input',() => setPreferredSize(range.value,false));
  range.addEventListener('change',() => setPreferredSize(range.value,true));
  if(minusButton) minusButton.addEventListener('click',() => setPreferredSize(preferredSize - STEP,true));
  if(plusButton) plusButton.addEventListener('click',() => setPreferredSize(preferredSize + STEP,true));
  if(resetButton) resetButton.addEventListener('click',() => setPreferredSize(DEFAULT_SIZE,true));
  presets.forEach(button => button.addEventListener('click',() => setPreferredSize(button.dataset.boardSize,true)));

  document.addEventListener('pointerdown',event => {
    if(popup.hidden) return;
    if(popup.contains(event.target) || boardButton.contains(event.target) || compactButton.contains(event.target)) return;
    closePopup(false);
  });
  document.addEventListener('keydown',event => {
    if(event.key === 'Escape' && !popup.hidden){
      event.preventDefault();
      closePopup(true);
    }
  });
  window.addEventListener('resize',() => scheduleApply(true),{passive:true});
  window.addEventListener('orientationchange',() => scheduleApply(true),{passive:true});
  window.addEventListener('popstate',() => scheduleApply(true));

  let observedRoomContext = roomContext();
  const rootObserver = new MutationObserver(() => {
    const nextRoomContext = roomContext();
    if(nextRoomContext === observedRoomContext) return;
    observedRoomContext = nextRoomContext;
    scheduleApply(true);
  });
  rootObserver.observe(root,{attributes:true,attributeFilter:['class']});
  if(roomLobbyButton){
    const roomButtonObserver = new MutationObserver(() => {
      observedRoomContext = roomContext();
      scheduleApply(true);
    });
    roomButtonObserver.observe(roomLobbyButton,{attributes:true,attributeFilter:['hidden']});
  }

  applySize(true);
  setTimeout(() => applySize(true),800);
}());
