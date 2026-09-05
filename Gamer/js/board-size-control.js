'use strict';

/*
 * Freie Brettgröße für geeignete Desktopfenster.
 * Gemeinsame, bidirektionale Einstellung für Gamer und Werkzeug-Bretter.
 * Der äußere Desktop bestimmt die Verfügbarkeit, nicht die Größe des Iframes.
 */
(function initialiseBoardSizeControl(){
  const root = document.documentElement;
  const tool = root.dataset.boardSizeTool || '';
  const embedded = !!tool && window.parent !== window;
  const toolFrames = () => Array.from(document.querySelectorAll(
    '#analyzerToolFrame,#playerToolFrame,#trainerToolFrame,#mateSchoolToolFrame,#schachlaborToolFrame,#openingsToolFrame,#fairplayToolFrame,#readerToolFrame'
  ));
  const boardTools = ['analyzer','player','trainer','mate-school','schachlabor','openings','fairplay','reader'];
  const activeTool = () => boardTools.find(name => root.classList.contains(name + '-tool-active')) || '';
  let parentState = null;
  if(tool){
    const toolbar = document.querySelector('.board-tools,.controls,.board-nav-actions,.board-toolbar,.diagram-heading');
    if(!toolbar) return;
    const container = document.createElement('div');
    container.innerHTML = '<div id="boardSizeWrap" class="board-size-wrap" hidden>\n            <button id="boardSizeBtn" class="button-flat icon-btn board-size-btn" type="button" aria-haspopup="dialog" aria-controls="boardSizePopup" aria-expanded="false" title="Brettgröße ändern" aria-label="Brettgröße ändern"><span class="icon-label" aria-hidden="true">↔</span></button>\n            <div id="boardSizePopup" class="board-size-popup" role="dialog" aria-modal="false" aria-labelledby="boardSizePopupTitle" hidden>\n              <div class="board-size-popup-head">\n                <strong id="boardSizePopupTitle">Brettgröße</strong>\n                <button id="boardSizeCloseBtn" class="board-size-close-btn" type="button" aria-label="Brettgrößen-Auswahl schließen">×</button>\n              </div>\n              <div class="board-size-presets" aria-label="Voreingestellte Brettgrößen">\n                <button type="button" class="board-size-preset" data-board-size="760">Standard</button>\n                <button type="button" class="board-size-preset" data-board-size="860">Groß</button>\n                <button type="button" class="board-size-preset" data-board-size="1000">Sehr groß</button>\n              </div>\n              <div class="board-size-slider-row">\n                <button id="boardSizeMinusBtn" class="board-size-step-btn" type="button" aria-label="Brett verkleinern">−</button>\n                <input id="boardSizeRange" type="range" min="760" max="1000" step="10" value="760" aria-label="Gewünschte Brettgröße" aria-describedby="boardSizeHint" />\n                <button id="boardSizePlusBtn" class="board-size-step-btn" type="button" aria-label="Brett vergrößern">+</button>\n              </div>\n              <div class="board-size-reading"><span>Gewählt: <strong id="boardSizeValue">760 px</strong></span><span id="boardSizeEffective" hidden></span></div>\n              <p id="boardSizeHint" class="board-size-hint">Die Größe gilt für alle Gamer- und Werkzeug-Bretter auf diesem Gerät. Bei wenig Platz wird das Brett automatisch begrenzt.</p>\n              <button id="boardSizeResetBtn" class="button-flat board-size-reset-btn" type="button">Standard wiederherstellen</button>\n            </div>\n          </div>';
    toolbar.appendChild(container.firstElementChild);
  }
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

  if(!wrap || !boardButton || (!tool && !compactButton) || !popup || !range){
    root.classList.remove('desktop-board-sizing-active','desktop-board-compact');
    return;
  }

  document.body.appendChild(popup);

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
    if(embedded) return !!(parentState && parentState.desktop);
    return window.matchMedia('(min-width: 1101px) and (min-height: 720px) and (hover: hover) and (pointer: fine)').matches;
  }

  function roomContext(){
    const roomClass = root.classList.contains('hammerschach-room-view');
    const roomButtonVisible = !!(roomLobbyButton && !roomLobbyButton.hidden);
    const embeddedTool = ['player-tool-active','league-standings-tool-active','learning-tool-active','analyzer-tool-active','trainer-tool-active','mate-school-tool-active','schachlabor-tool-active','openings-tool-active','fairplay-tool-active','reader-tool-active','tournament-report-tool-active','tv-tool-active']
      .some(className => root.classList.contains(className));
    return (roomClass || roomButtonVisible)
      && !root.classList.contains('member-lobby-view')
      && !root.classList.contains('visitor-start-view')
      && !embeddedTool;
  }

  function maximumFittingSize(){
    if(embedded && parentState) return parentState.effective;
    const widthLimit = window.innerWidth - RIGHT_COLUMN - LAYOUT_GAP - PAGE_GUTTER;
    const heightLimit = window.innerHeight - 120;
    return clamp(Math.floor(Math.min(MAX_SIZE,widthLimit,heightLimit) / STEP) * STEP,MIN_SIZE,MAX_SIZE);
  }

  function effectiveSize(){
    return Math.min(preferredSize,maximumFittingSize());
  }

  function updateCompactMode(effective,forceDecision){
    if(tool || activeTool() || !forceDecision) return;
    const compactNow = root.classList.contains('desktop-board-compact');
    let compactNext = compactNow;
    if(compactNow && (preferredSize <= 780 || effective <= 760)) compactNext = false;
    if(!compactNow && preferredSize >= 820 && effective >= 780) compactNext = true;
    root.classList.toggle('desktop-board-compact',compactNext);
  }

  function updateControls(effective,available){
    if(tool && available){
      const board = document.querySelector('.board-wrapper,.reader-board-wrapper,#boardFrame,.board-frame,.board-wrap,#board,#chessBoard');
      const width = board ? Math.round(board.getBoundingClientRect().width) : 0;
      if(width > 0) effective = Math.min(effective,width);
    }
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
    if(compactButton) compactButton.setAttribute('aria-expanded','false');
    const anchor = popupAnchor;
    popupAnchor = null;
    if(restoreFocus !== false && anchor && typeof anchor.focus === 'function') anchor.focus();
  }

  function applySize(forceCompactDecision){
    const available = desktopViewport() && (!!tool || !!activeTool() || roomContext());
    root.classList.toggle('shared-desktop-board',available);
    wrap.hidden = !available;

    if(!available){
      root.classList.remove('desktop-board-sizing-active','desktop-board-compact');
      root.style.removeProperty('--board-max');
      root.style.removeProperty('--desktop-shell-width');
      if(compactButton) compactButton.hidden = true;
      closePopup(false);
      updateControls(DEFAULT_SIZE,false);
      broadcastState();
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
    if(compactButton) compactButton.hidden = !available || !!activeTool();
    updateControls(effective,true);

    window.dispatchEvent(new CustomEvent('hammerschach:board-size-change',{
      detail:{preferred:preferredSize,effective,compact:root.classList.contains('desktop-board-compact')}
    }));
    broadcastState();
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
    if(compactButton) compactButton.setAttribute('aria-expanded',String(anchor === compactButton));
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
    // In the Gamer, only the parent writes storage. A second writer could
    // replay an older change while the user is already changing another tool.
    if(embedded) postParent({type:'hammerschach-board-size-set',preferred:preferredSize,commit:!!commit});
    else if(commit) storeSize();
    applySize(commit);
    if(!popup.hidden && popupAnchor) requestAnimationFrame(() => positionPopup(popupAnchor));
  }

  boardButton.addEventListener('click',() => togglePopup(boardButton));
  if(compactButton) compactButton.addEventListener('click',() => togglePopup(compactButton));
  if(closeButton) closeButton.addEventListener('click',() => closePopup(true));
  range.addEventListener('input',() => setPreferredSize(range.value,false));
  range.addEventListener('change',() => setPreferredSize(range.value,true));
  if(minusButton) minusButton.addEventListener('click',() => setPreferredSize(preferredSize - STEP,true));
  if(plusButton) plusButton.addEventListener('click',() => setPreferredSize(preferredSize + STEP,true));
  if(resetButton) resetButton.addEventListener('click',() => setPreferredSize(DEFAULT_SIZE,true));
  presets.forEach(button => button.addEventListener('click',() => setPreferredSize(button.dataset.boardSize,true)));

  document.addEventListener('pointerdown',event => {
    if(popup.hidden) return;
    if(popup.contains(event.target) || boardButton.contains(event.target) || (compactButton && compactButton.contains(event.target))) return;
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

  function postParent(message){
    window.parent.postMessage(message,location.origin === 'null' ? '*' : location.origin);
  }

  function broadcastState(){
    if(tool) return;
    const message = {type:'hammerschach-board-size-state',preferred:preferredSize,
      effective:effectiveSize(),desktop:desktopViewport()};
    toolFrames().forEach(frame => {
      if(frame.contentWindow) frame.contentWindow.postMessage(message,location.origin === 'null' ? '*' : location.origin);
    });
  }

  window.addEventListener('message',event => {
    if(event.origin !== location.origin) return;
    const message = event.data;
    if(!message || typeof message !== 'object') return;
    if(embedded && event.source === window.parent && message.type === 'hammerschach-board-size-state'){
      if(!Number.isFinite(message.preferred) || !Number.isFinite(message.effective)) return;
      parentState = {desktop:message.desktop === true,effective:normalizedSize(message.effective)};
      preferredSize = normalizedSize(message.preferred);
      applySize(true);
    }else if(!tool && toolFrames().some(frame => frame.contentWindow === event.source)){
      if(message.type === 'hammerschach-board-size-ready') broadcastState();
      if(message.type === 'hammerschach-board-size-set' && Number.isFinite(message.preferred)){
        setPreferredSize(message.preferred,message.commit === true);
      }
    }
  });
  window.addEventListener('storage',event => {
    if(embedded) return; // The parent sends the authoritative state.
    if(event.key !== STORAGE_KEY && event.key !== null) return;
    preferredSize = readStoredSize();
    applySize(true);
  });
  // Include the tool name: switching directly between tools also needs a refresh.
  const contextKey = () => String(roomContext()) + ':' + activeTool();
  let observedRoomContext = contextKey();
  const rootObserver = new MutationObserver(() => {
    const nextRoomContext = contextKey();
    if(nextRoomContext === observedRoomContext) return;
    observedRoomContext = nextRoomContext;
    scheduleApply(true);
  });
  rootObserver.observe(root,{attributes:true,attributeFilter:['class']});
  if(roomLobbyButton){
    const roomButtonObserver = new MutationObserver(() => {
      observedRoomContext = contextKey();
      scheduleApply(true);
    });
    roomButtonObserver.observe(roomLobbyButton,{attributes:true,attributeFilter:['hidden']});
  }

  if(embedded) postParent({type:'hammerschach-board-size-ready'});
  toolFrames().forEach(frame => frame.addEventListener('load',broadcastState));
  applySize(true);
  setTimeout(() => applySize(true),800);
}());
