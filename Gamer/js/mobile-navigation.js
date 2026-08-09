'use strict';

/*
 * Sicherer Testschalter für die neue Mobil-/Tablet-Navigation.
 * Ohne bestätigten Mitglieder-Account und ohne aktivierten Geräteschalter
 * bleibt der bisherige Header sichtbar. ?nav=classic erzwingt den Altzustand.
 */
(function initialiseMobileNavigationTest(){
  const root = document.documentElement;
  const classicHeader = document.querySelector('.header');
  const testGroup = document.getElementById('mobileNavTestGroup');
  const phoneToggle = document.getElementById('mobileNavPhoneToggle');
  const tabletToggle = document.getElementById('mobileNavTabletToggle');
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
  const phoneDrawerToggle = document.getElementById('mobileNavPhoneDrawerToggle');
  const tabletDrawerToggle = document.getElementById('mobileNavTabletDrawerToggle');
  const disableButton = document.getElementById('mobileNavTestDisable');
  const turnCount = document.getElementById('mobileNavTestTurnCount');
  const sourceStatus = document.getElementById('status');
  const sourceTheme = document.getElementById('themeToggleBtn');
  const sourceTurnCount = document.getElementById('dailyGamesTurnCount');
  const roomLobbyButton = document.getElementById('roomLobbyBtn');
  const newGameButton = document.getElementById('newGameOpenBtn');
  const targetButtons = Array.from(document.querySelectorAll('[data-mobile-nav-target]'));
  const storagePrefix = 'hammerschachMobileNavMemberTest';
  let refreshFrame = 0;
  let lastFocus = null;

  function memberUser(){
    try{
      if(!onlineAuthToken || !onlineAuthUser) return null;
      if(!onlineAuthUser.id) return null;
      return onlineAuthUser;
    } catch(_){
      return null;
    }
  }

  function storageKey(device){
    const user = memberUser();
    return user && (device === 'phone' || device === 'tablet') ? storagePrefix + ':' + String(user.id) + ':' + device : '';
  }

  function classicForced(){
    try{
      return String(new URLSearchParams(window.location.search || '').get('nav') || '').trim().toLowerCase() === 'classic';
    } catch(_){
      return false;
    }
  }

  function featureEnabled(device){
    const key = storageKey(device);
    if(!key) return false;
    try{ return localStorage.getItem(key) === 'on'; } catch(_){ return false; }
  }

  function removeClassicOverride(){
    try{
      const url = new URL(window.location.href);
      if(String(url.searchParams.get('nav') || '').trim().toLowerCase() !== 'classic') return;
      url.searchParams.delete('nav');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch(_){ }
  }

  function setFeatureEnabled(device, enabled){
    const key = storageKey(device);
    if(!key) return;
    try{ localStorage.setItem(key, enabled ? 'on' : 'off'); } catch(_){ }
    if(enabled) removeClassicOverride();
    refresh();
  }

  function phoneViewport(){
    return window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 600px) and (max-width: 950px)').matches;
  }

  function tabletViewport(){
    return window.matchMedia('(min-width: 761px) and (max-width: 1180px)').matches;
  }

  function roomContext(){
    return root.classList.contains('hammerschach-room-view');
  }

  function currentDevice(){
    if(phoneViewport()) return 'phone';
    if(tabletViewport()) return 'tablet';
    return '';
  }

  function compactNavigationWanted(){
    if(!memberUser() || classicForced()) return false;
    if(phoneViewport()) return featureEnabled('phone');
    return tabletViewport() && roomContext() && featureEnabled('tablet');
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

  function syncControls(){
    syncStatus();
    syncTheme();
    syncTurnCount();
    syncPrimaryButton();
    targetButtons.forEach(syncTargetButton);
    const forcedClassic = classicForced();
    const phoneEnabled = featureEnabled('phone') && !forcedClassic;
    const tabletEnabled = featureEnabled('tablet') && !forcedClassic;
    [phoneToggle, phoneDrawerToggle].filter(Boolean).forEach(button => button.setAttribute('aria-pressed', phoneEnabled ? 'true' : 'false'));
    [tabletToggle, tabletDrawerToggle].filter(Boolean).forEach(button => button.setAttribute('aria-pressed', tabletEnabled ? 'true' : 'false'));
  }

  function refresh(){
    if(refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      const member = !!memberUser();
      const forcedClassic = classicForced();
      const active = !!(classicHeader && testHeader && openButton && backdrop && member && !forcedClassic && compactNavigationWanted());

      if(testGroup) testGroup.hidden = !member;
      [phoneToggle, tabletToggle].filter(Boolean).forEach(button => { button.hidden = !member; });
      if(phoneToggle) phoneToggle.title = forcedClassic ? 'Der Notausgang ?nav=classic ist aktiv.' : 'Neue Smartphone-Navigation auf diesem Gerät testen.';
      if(tabletToggle) tabletToggle.title = forcedClassic ? 'Der Notausgang ?nav=classic ist aktiv.' : 'Neue Tablet-Navigation auf diesem Gerät testen.';

      root.classList.toggle('mobile-nav-test-active', active);
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

  if(!classicHeader || !testGroup || !phoneToggle || !tabletToggle || !testHeader || !openButton || !backdrop || !drawer){
    root.classList.remove('mobile-nav-test-active');
    return;
  }

  phoneToggle.addEventListener('click', () => setFeatureEnabled('phone', !(featureEnabled('phone') && !classicForced())));
  tabletToggle.addEventListener('click', () => setFeatureEnabled('tablet', !(featureEnabled('tablet') && !classicForced())));
  if(phoneDrawerToggle) phoneDrawerToggle.addEventListener('click', () => setFeatureEnabled('phone', !featureEnabled('phone')));
  if(tabletDrawerToggle) tabletDrawerToggle.addEventListener('click', () => setFeatureEnabled('tablet', !featureEnabled('tablet')));
  openButton.addEventListener('click', openDrawer);
  closeButton.addEventListener('click', () => closeDrawer(true));
  disableButton.addEventListener('click', () => {
    const device = currentDevice();
    if(device) setFeatureEnabled(device, false);
  });
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
  [sourceStatus, sourceTheme, sourceTurnCount].filter(Boolean).forEach(element => {
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
      testHeader.hidden = true;
      closeDrawer(false);
    }
  });

  refresh();
  setTimeout(refresh, 800);
}());
