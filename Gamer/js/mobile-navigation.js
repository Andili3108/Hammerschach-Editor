'use strict';

/*
 * Automatische Mobil-/Tablet-Navigation.
 * Smartphone und schmale Fenster: kompakte, stets einzeilige Navigation.
 * Tablet: kompakte Navigation im Spielraum auch oberhalb der schmalen Ansicht.
 * Große Desktopbretter verwenden einen getrennten Kompaktmodus, ohne die
 * mobilen Layoutklassen zu aktivieren.
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
  const navigationSections = Array.from(document.querySelectorAll('.mobile-nav-test-list section'));
  const visitorInfoTargets = new Set(['firstStepsOpenBtn','infoGuideOpenBtn','leitbildOpenBtn']);
  const trainerHeaderTargets = new Set(['trainerBeginnerHeaderBtn','trainerFreeHeaderBtn','trainerProgressHeaderBtn']);
  let refreshFrame = 0;
  let lastFocus = null;
  let drawerScrollY = 0;

  function memberUser(){
    try{
      if(!onlineAuthToken || !onlineAuthUser) return null;
      if(!onlineAuthUser.id) return null;
      return onlineAuthUser;
    } catch(_){
      return null;
    }
  }

  function memberContext(){
    return !!memberUser() || root.classList.contains('member-lobby-view');
  }

  function phoneViewport(){
    return window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 600px) and (max-width: 950px)').matches;
  }

  function tabletViewport(){
    return window.matchMedia('(min-width: 761px) and (max-width: 1400px)').matches;
  }

  function roomContext(){
    return (root.classList.contains('hammerschach-room-view') && !root.classList.contains('visitor-start-view')) || !!(roomLobbyButton && !roomLobbyButton.hidden);
  }

  function compactNavigationWanted(){
    if(phoneViewport()) return true;
    if(tabletViewport() && roomContext()) return true;
    return window.matchMedia('(min-width: 761px) and (max-width: 1100px)').matches;
  }

  function desktopBoardCompactWanted(){
    return root.classList.contains('desktop-board-compact')
      && roomContext()
      && window.matchMedia('(min-width: 1101px) and (min-height: 720px) and (hover: hover) and (pointer: fine)').matches;
  }

  function compactHeaderActive(){
    return root.classList.contains('mobile-nav-test-active') || root.classList.contains('desktop-board-header-active');
  }

  function setRootClass(name,active){
    if(root.classList.contains(name) !== active) root.classList.toggle(name,active);
  }

  function closeDrawer(restoreFocus){
    if(!backdrop || backdrop.hidden) return;
    const restoreScrollY=drawerScrollY;
    backdrop.hidden = true;
    root.classList.remove('mobile-nav-test-drawer-open');
    document.body.classList.remove('mobile-nav-test-drawer-open');
    window.scrollTo({top:restoreScrollY,left:0,behavior:'auto'});
    requestAnimationFrame(()=>window.scrollTo({top:restoreScrollY,left:0,behavior:'auto'}));
    if(openButton) openButton.setAttribute('aria-expanded', 'false');
    if(restoreFocus !== false && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function openDrawer(){
    if(!backdrop || !drawer || !compactHeaderActive()) return;
    drawerScrollY=window.scrollY;
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
    const targetId = button.dataset.mobileNavTarget || '';
    const source = document.getElementById(targetId);
    const visitor = root.classList.contains('visitor-header-view');
    const trainerContext = root.classList.contains('trainer-tool-active');
    const visitorOnly = button.hasAttribute('data-mobile-nav-visitor-only');
    const visitorBlocked = trainerContext&&trainerHeaderTargets.has(targetId)
      ? false
      : (visitor ? (!visitorOnly && !visitorInfoTargets.has(targetId)) : visitorOnly);
    const visitorTrainerTarget=visitor&&(targetId==='visitorTrainerOpenBtn'||targetId==='visitorTrainerProgressHeaderBtn');
    const trainerBlocked = trainerContext&&!trainerHeaderTargets.has(targetId)&&!visitorInfoTargets.has(targetId)&&!visitorTrainerTarget;
    const unavailable = !source || source.hidden || sourceDisabled(source) || visitorBlocked || trainerBlocked;
    button.hidden = !source || source.hidden || visitorBlocked || trainerBlocked;
    button.disabled = unavailable;
  }

  function syncPrimaryButton(){
    if(!primaryButton) return;
    const backToLobby = !!(roomLobbyButton && !roomLobbyButton.hidden);
    const visitor = root.classList.contains('visitor-header-view');
    primaryButton.hidden = visitor || (!backToLobby && (!newGameButton || newGameButton.hidden));
    const icon = primaryButton.querySelector('span');
    const label = primaryButton.querySelector('strong');
    if(icon) icon.textContent = backToLobby ? '↩️' : '♟️';
    if(label) label.textContent = backToLobby ? (visitor ? 'Zur Startseite' : 'Zur Lobby') : 'Neue Partie';
    primaryButton.disabled = backToLobby ? sourceDisabled(roomLobbyButton) : sourceDisabled(newGameButton);
    if(testBrand) testBrand.setAttribute('aria-label',backToLobby?(visitor?'Zur Startseite':'Zur Lobby'):'Zum Seitenanfang');
  }

  function syncSections(){
    navigationSections.forEach(section => {
      const visibleItem = Array.from(section.querySelectorAll('.mobile-nav-test-item')).some(button => !button.hidden);
      section.hidden = !visibleItem;
    });
  }

  function syncStatus(){
    if(testStatus && sourceStatus) testStatus.textContent = sourceStatus.textContent || 'Hammerschach-Gamer';
    if(testContext){
      const learning = root.classList.contains('learning-tool-active');
      const area = root.classList.contains('analyzer-tool-active') || root.classList.contains('trainer-tool-active') || root.classList.contains('schachlabor-tool-active') || root.classList.contains('openings-tool-active') || root.classList.contains('tv-tool-active');
      testContext.textContent = learning ? 'Schach lernen' : (area ? 'Bereich' : (roomContext() ? 'Partie' : (root.classList.contains('member-lobby-view') ? 'Lobby' : 'Gamer')));
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
    syncSections();
  }

  function refresh(){
    if(refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      const controlsReady = !!(classicHeader && testHeader && openButton && backdrop);
      const mobileActive = controlsReady && compactNavigationWanted();
      const desktopActive = controlsReady && !mobileActive && desktopBoardCompactWanted();
      const active = mobileActive || desktopActive;

      setRootClass('mobile-nav-test-active',mobileActive);
      setRootClass('mobile-nav-test-room',mobileActive && roomContext());
      setRootClass('desktop-board-header-active',desktopActive);
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
    root.classList.remove('desktop-board-header-active');
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

  const rootObserver = new MutationObserver(refresh);
  rootObserver.observe(root, {attributes:true, attributeFilter:['class']});
  [sourceStatus, sourceTheme, sourceTurnCount, sourceOffersCount,
    document.getElementById('trainerBeginnerHeaderBtn'),document.getElementById('trainerFreeHeaderBtn'),document.getElementById('trainerProgressHeaderBtn'),
    document.getElementById('visitorTrainerOpenBtn'),document.getElementById('visitorTrainerProgressHeaderBtn')].filter(Boolean).forEach(element => {
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
      root.classList.remove('desktop-board-header-active');
      testHeader.hidden = true;
      closeDrawer(false);
    }
  });

  refresh();
  setTimeout(refresh, 800);
}());
