'use strict';

/*
 * Kompakte Navigation ausschließlich für ein bewusst vergrößertes Desktopbrett.
 * Smartphone und Tablet behalten ihre bewährte responsive Standardansicht und
 * werden von der Desktop-Brettgrößenfunktion nicht umgeschaltet.
 */
(function initialiseMobileNavigation(){
  const root = document.documentElement;
  const classicHeader = document.querySelector('.header');
  const testHeader = document.getElementById('mobileNavTestHeader');
  const testBrand = document.getElementById('mobileNavTestBrand');
  const testContext = document.getElementById('mobileNavTestContext');
  const testStatus = document.getElementById('mobileNavTestStatus');
  const openButton = document.getElementById('mobileNavTestOpen');
  const backdrop = document.getElementById('mobileNavTestBackdrop');
  const drawer = document.getElementById('mobileNavTestDrawer');
  const closeButton = document.getElementById('mobileNavTestClose');
  const primaryButton = document.getElementById('mobileNavTestPrimary');
  const themeButton = document.getElementById('mobileNavTestTheme');
  const turnCount = document.getElementById('mobileNavTestTurnCount');
  const offersCount = document.getElementById('mobileNavTestOffersCount');
  const sourceStatus = document.getElementById('status');
  const sourceTheme = document.getElementById('themeToggleBtn');
  const sourceTurnCount = document.getElementById('dailyGamesTurnCount');
  const sourceOffersCount = document.getElementById('openOffersCount');
  const roomLobbyButton = document.getElementById('roomLobbyBtn');
  const newGameButton = document.getElementById('newGameOpenBtn');
  const targetButtons = Array.from(document.querySelectorAll('[data-mobile-nav-target]'));
  let refreshFrame = 0;
  let lastFocus = null;

  function roomContext(){
    return root.classList.contains('hammerschach-room-view') || !!(roomLobbyButton && !roomLobbyButton.hidden);
  }

  function desktopBoardCompactWanted(){
    return root.classList.contains('desktop-board-compact') && roomContext();
  }

  function closeDrawer(restoreFocus){
    if(!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    root.classList.remove('mobile-nav-test-drawer-open');
    document.body.classList.remove('mobile-nav-test-drawer-open');
    if(openButton) openButton.setAttribute('aria-expanded', 'false');
    if(restoreFocus !== false && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function openDrawer(){
    if(!backdrop || !drawer || !root.classList.contains('mobile-nav-test-active')) return;
    lastFocus = document.activeElement;
    syncControls();
    backdrop.hidden = false;
    root.classList.add('mobile-nav-test-drawer-open');
    document.body.classList.add('mobile-nav-test-drawer-open');
    if(openButton) openButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => closeButton && closeButton.focus());
  }

  function sourceDisabled(source){
    return !source || source.disabled || source.getAttribute('aria-disabled') === 'true';
  }

  function syncTargetButton(button){
    const source = document.getElementById(button.dataset.mobileNavTarget || '');
    const unavailable = !source || source.hidden || sourceDisabled(source);
    button.hidden = !source || source.hidden;
    button.disabled = unavailable;
  }

  function syncPrimaryButton(){
    if(!primaryButton) return;
    const backToLobby = !!(roomLobbyButton && !roomLobbyButton.hidden);
    const icon = primaryButton.querySelector('span');
    const label = primaryButton.querySelector('strong');
    if(icon) icon.textContent = backToLobby ? '↩️' : '♟️';
    if(label) label.textContent = backToLobby ? 'Zur Lobby' : 'Neue Partie';
    primaryButton.disabled = backToLobby ? sourceDisabled(roomLobbyButton) : sourceDisabled(newGameButton);
  }

  function syncStatus(){
    if(testStatus && sourceStatus) testStatus.textContent = sourceStatus.textContent || 'Hammerschach-Gamer';
    if(testContext){
      testContext.textContent = roomContext() ? 'Partie' : (root.classList.contains('member-lobby-view') ? 'Lobby' : 'Gamer');
    }
  }

  function syncTheme(){
    if(!themeButton || !sourceTheme) return;
    const icon = themeButton.querySelector('span');
    const label = themeButton.querySelector('strong');
    const dark = root.classList.contains('dark-mode');
    if(icon) icon.textContent = dark ? '☀️' : '🌙';
    if(label) label.textContent = dark ? 'Helle Darstellung' : 'Dunkle Darstellung';
  }

  function syncTurnCount(){
    if(!turnCount || !sourceTurnCount) return;
    const count = String(sourceTurnCount.textContent || '').trim();
    turnCount.textContent = count || '0';
    turnCount.hidden = sourceTurnCount.hidden || !count || count === '0';
  }

  function syncOffersCount(){
    if(!offersCount || !sourceOffersCount) return;
    const count = String(sourceOffersCount.textContent || '').trim();
    offersCount.textContent = count || '0';
    offersCount.hidden = sourceOffersCount.hidden || !count || count === '0';
    const label = sourceOffersCount.getAttribute('aria-label');
    if(label) offersCount.setAttribute('aria-label',label);
    else offersCount.removeAttribute('aria-label');
  }

  function syncControls(){
    syncStatus();
    syncTheme();
    syncTurnCount();
    syncOffersCount();
    syncPrimaryButton();
    targetButtons.forEach(syncTargetButton);
  }

  function refresh(){
    if(refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      const active = !!(classicHeader && testHeader && openButton && backdrop
        && desktopBoardCompactWanted());

      root.classList.toggle('mobile-nav-test-active', active);
      root.classList.toggle('mobile-nav-test-room', active && roomContext());
      if(testHeader) testHeader.hidden = !active;
      if(!active) closeDrawer(false);
      syncControls();
      if(typeof hammerschachScheduleHeightReport === 'function') hammerschachScheduleHeightReport(false);
    });
  }

  function runSourceAction(source){
    if(sourceDisabled(source) || source.hidden) return;
    closeDrawer(false);
    requestAnimationFrame(() => source.click());
  }

  if(!classicHeader || !testHeader || !openButton || !backdrop || !drawer){
    root.classList.remove('mobile-nav-test-active');
    root.classList.remove('mobile-nav-test-room');
    return;
  }

  openButton.addEventListener('click', openDrawer);
  closeButton.addEventListener('click', () => closeDrawer(true));
  themeButton.addEventListener('click', () => runSourceAction(sourceTheme));
  primaryButton.addEventListener('click', () => runSourceAction(roomLobbyButton && !roomLobbyButton.hidden ? roomLobbyButton : newGameButton));
  testBrand.addEventListener('click', () => {
    if(roomLobbyButton && !roomLobbyButton.hidden) runSourceAction(roomLobbyButton);
    else window.scrollTo({top:0, behavior:'smooth'});
  });
  targetButtons.forEach(button => {
    button.addEventListener('click', () => runSourceAction(document.getElementById(button.dataset.mobileNavTarget || '')));
  });
  backdrop.addEventListener('click', event => { if(event.target === backdrop) closeDrawer(true); });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && !backdrop.hidden){
      event.preventDefault();
      closeDrawer(true);
    }
  });
  window.addEventListener('resize', refresh, {passive:true});
  window.addEventListener('orientationchange', refresh, {passive:true});
  window.addEventListener('popstate', refresh);
  window.addEventListener('hammerschach:board-size-change', refresh);

  const rootObserver = new MutationObserver(refresh);
  rootObserver.observe(root, {attributes:true, attributeFilter:['class']});
  [sourceStatus, sourceTheme, sourceTurnCount, sourceOffersCount].filter(Boolean).forEach(element => {
    const observer = new MutationObserver(refresh);
    observer.observe(element, {attributes:true, childList:true, characterData:true, subtree:true});
  });
  const authMarker = document.getElementById('authOpenBtn');
  if(authMarker){
    const authObserver = new MutationObserver(refresh);
    authObserver.observe(authMarker, {attributes:true, attributeFilter:['hidden']});
  }

  window.addEventListener('error', event => {
    if(String(event.filename || '').includes('mobile-navigation.js')){
      root.classList.remove('mobile-nav-test-active');
      root.classList.remove('mobile-nav-test-room');
      testHeader.hidden = true;
      closeDrawer(false);
    }
  });

  refresh();
  setTimeout(refresh, 800);
}());
