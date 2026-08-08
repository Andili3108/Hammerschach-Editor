'use strict';

(() => {
  const root = document.documentElement;
  const body = document.body;
  const mobileHeader = document.getElementById('mobileAppHeader');
  const mobileContext = document.getElementById('mobileAppContext');
  const mobileStatus = document.getElementById('mobileAppStatus');
  const openBtn = document.getElementById('mobileMenuOpenBtn');
  const closeBtn = document.getElementById('mobileMenuCloseBtn');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  const drawer = document.getElementById('mobileMenuDrawer');
  const desktopStatus = document.getElementById('status');
  const playerTop = document.getElementById('boardPlayerTop');
  const playerBottom = document.getElementById('boardPlayerBottom');
  const dailyCount = document.getElementById('dailyGamesTurnCount');
  const mobileDailyCount = document.getElementById('mobileDailyGamesCount');
  const tournamentsBadge = document.getElementById('tournamentsNewBadge');
  const mobileTournamentsBadge = document.getElementById('mobileTournamentsBadge');
  const proxyButtons = Array.from(document.querySelectorAll('[data-mobile-target]'));
  const sourceGroups = Array.from(document.querySelectorAll('[data-mobile-source-group]'));

  if(!mobileHeader || !openBtn || !closeBtn || !backdrop || !drawer) return;

  let lastFocus = null;

  function hasRoomTarget(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      return !!(String(params.get('room') || '').trim() || String(params.get('watch') || '').trim());
    }catch(_){
      return false;
    }
  }

  function gameFocusActive(){
    return hasRoomTarget() || !!(
      (playerTop && !playerTop.hidden) ||
      (playerBottom && !playerBottom.hidden)
    );
  }

  function currentContextLabel(){
    if(root.classList.contains('tv-tool-active')) return 'Hammerschach TV';
    if(root.classList.contains('fairplay-tool-active')) return 'Fairplay-Prüfung';
    if(root.classList.contains('openings-tool-active')) return 'Eröffnungen';
    if(root.classList.contains('trainer-tool-active')) return 'Trainer';
    if(root.classList.contains('analyzer-tool-active')) return 'Analyzer';
    if(gameFocusActive()) return 'Partie';
    return 'Lobby';
  }

  function compactStatusText(){
    const text = String(desktopStatus ? desktopStatus.textContent : '').replace(/\s+/g,' ').trim();
    if(text) return text;
    return gameFocusActive() ? 'Partie' : 'Bereit';
  }

  function syncProxyButton(proxy){
    const target = document.getElementById(proxy.dataset.mobileTarget || '');
    if(!target){
      proxy.hidden = true;
      return;
    }
    const owningMenu = target.closest('.header-menu');
    proxy.hidden = !!target.hidden || !!(owningMenu && owningMenu.hidden);
    proxy.disabled = !!target.disabled;
    proxy.setAttribute('aria-disabled', target.getAttribute('aria-disabled') === 'true' ? 'true' : 'false');
    if(proxy.dataset.mobileSyncLabel === 'true'){
      const targetText = String(target.textContent || '').replace(/\s+/g,' ').trim();
      const label = proxy.querySelector('span');
      if(label && targetText){
        label.textContent = targetText.replace(/^[^\p{L}\p{N}]+/u,'');
        proxy.firstChild.textContent = targetText.startsWith('☀️') ? '☀️ ' : '🌙 ';
      }
    }
  }

  function syncCount(source, destination){
    if(!source || !destination) return;
    destination.textContent = source.textContent;
    destination.hidden = !!source.hidden;
  }

  function syncUi(){
    const gameFocus = gameFocusActive();
    root.classList.toggle('mobile-game-focus', gameFocus);
    if(mobileContext) mobileContext.textContent = currentContextLabel();
    if(mobileStatus){
      mobileStatus.textContent = compactStatusText();
      mobileStatus.title = mobileStatus.textContent;
    }
    proxyButtons.forEach(syncProxyButton);
    sourceGroups.forEach(group => {
      const items = Array.from(group.querySelectorAll('[data-mobile-target]'));
      group.hidden = !items.some(item => !item.hidden);
    });
    syncCount(dailyCount, mobileDailyCount);
    syncCount(tournamentsBadge, mobileTournamentsBadge);
  }

  function setMenuOpen(open, restoreFocus){
    const shouldOpen = !!open;
    if(shouldOpen) lastFocus = document.activeElement;
    backdrop.hidden = !shouldOpen;
    root.classList.toggle('mobile-menu-open', shouldOpen);
    body.classList.toggle('mobile-menu-open', shouldOpen);
    openBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    openBtn.setAttribute('aria-label', shouldOpen ? 'Hammerschach-Menü schließen' : 'Hammerschach-Menü öffnen');
    if(shouldOpen){
      syncUi();
      requestAnimationFrame(() => closeBtn.focus());
    }else if(restoreFocus && lastFocus && typeof lastFocus.focus === 'function'){
      try{ lastFocus.focus({preventScroll:true}); }catch(_){ lastFocus.focus(); }
    }
  }

  openBtn.addEventListener('click', () => setMenuOpen(backdrop.hidden, true));
  closeBtn.addEventListener('click', () => setMenuOpen(false, true));
  backdrop.addEventListener('click', event => {
    if(event.target === backdrop) setMenuOpen(false, true);
  });
  drawer.addEventListener('click', event => {
    const proxy = event.target.closest('[data-mobile-target]');
    if(!proxy || proxy.disabled || proxy.getAttribute('aria-disabled') === 'true') return;
    const target = document.getElementById(proxy.dataset.mobileTarget || '');
    if(!target || target.hidden || target.disabled) return;
    setMenuOpen(false, false);
    target.click();
  });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && !backdrop.hidden){
      event.preventDefault();
      setMenuOpen(false, true);
      return;
    }
    if(event.key !== 'Tab' || backdrop.hidden) return;
    const focusable = Array.from(drawer.querySelectorAll('button:not([hidden]):not(:disabled),a[href]:not([hidden])'));
    if(!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if(event.shiftKey && document.activeElement === first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey && document.activeElement === last){
      event.preventDefault();
      first.focus();
    }
  });

  const observer = new MutationObserver(syncUi);
  const observed = [root, desktopStatus, playerTop, playerBottom, dailyCount, tournamentsBadge]
    .concat(proxyButtons.map(button => document.getElementById(button.dataset.mobileTarget || '')))
    .filter(Boolean);
  observed.forEach(element => observer.observe(element, {
    attributes:true,
    childList:true,
    subtree:true,
    attributeFilter:['class','hidden','disabled','aria-disabled']
  }));
  window.addEventListener('popstate', syncUi);
  window.addEventListener('resize', syncUi, {passive:true});
  syncUi();
})();
