'use strict';

// A single, transient preview shared by all member links. No profile data is
// persisted; each deliberate hover reads the member's current privacy settings.
const MemberHovercard = (() => {
  const links = new WeakMap();
  const hoverDevice = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let card = null, anchor = null, openTimer = 0, closeTimer = 0, revision = 0;
  let keyboardNavigation = false, activeMemberId = '';
  const labels = {daily_classic:'Daily', live_classic:'Live Classic', live_rapid:'Rapid', live_blitz:'Blitz', daily_freestyle:'Daily', live_freestyle:'Live'};
  const signedIn = () => !!(onlineAuthToken && onlineAuthUser);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if(className) element.className = className;
    if(text !== undefined) element.textContent = text;
    return element;
  };
  function targetFor(element){
    const binding = links.get(element);
    const target = typeof binding === 'function' ? binding() : binding;
    return signedIn() && target && target.id ? target : null;
  }
  function hide(){
    clearTimeout(openTimer); clearTimeout(closeTimer);
    openTimer = closeTimer = 0;
    revision++;
    if(anchor){
      const descriptions = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'memberHovercard');
      if(descriptions.length) anchor.setAttribute('aria-describedby', descriptions.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null; activeMemberId = '';
    if(card){ card.hidden = true; card.replaceChildren(); }
  }
  function deferHide(){
    clearTimeout(openTimer); clearTimeout(closeTimer);
    closeTimer = setTimeout(hide, 220);
  }
  function ensureCard(){
    if(card) return card;
    card = node('aside', 'member-hovercard');
    card.id = 'memberHovercard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Spielerinfo');
    card.hidden = true;
    card.addEventListener('pointerenter', event => {
      if(event.pointerType === 'mouse') clearTimeout(closeTimer);
    });
    card.addEventListener('pointerleave', () => { if(!card.contains(document.activeElement)) deferHide(); });
    card.addEventListener('focusin', () => clearTimeout(closeTimer));
    card.addEventListener('focusout', event => { if(!card.contains(event.relatedTarget)) deferHide(); });
    document.body.appendChild(card);
    return card;
  }
  function position(){
    if(!anchor || !card || card.hidden) return;
    if(!anchor.isConnected || !anchor.getClientRects().length){ hide(); return; }
    const box = anchor.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const gap = 10, margin = 12;
    const size = card.getBoundingClientRect();
    // Prefer the side of the player strip, leaving the board itself uncovered.
    let left = box.right + gap, top = box.top;
    if(left + size.width > width - margin){
      if(box.left - gap - size.width >= margin) left = box.left - gap - size.width;
      else {
        left = box.left;
        top = box.bottom + gap;
        if(top + size.height > height - margin) top = box.top - gap - size.height;
      }
    }
    card.style.left = Math.max(margin, Math.min(left, width - size.width - margin)) + 'px';
    card.style.top = Math.max(margin, Math.min(top, height - size.height - margin)) + 'px';
  }
  function ratingKeys(target){
    return String(target.ratingType || '').includes('freestyle') || target.variant === 'freestyle960'
      ? ['daily_freestyle','live_freestyle']
      : ['daily_classic','live_classic','live_rapid','live_blitz'];
  }
  function render(member, target){
    const panel = ensureCard();
    panel.replaceChildren();
    const head = node('div', 'member-hovercard-head');
    head.appendChild(createMemberAvatarElement(member, 'member-hovercard-avatar'));
    const identity = node('div', 'member-hovercard-identity');
    identity.appendChild(node('strong', 'member-hovercard-name', member.username || 'Mitglied'));
    const activity = createMemberActivityBadge(member);
    if(member.activityVisible === false && member.registrationComplete !== false){
      activity.lastElementChild.textContent = 'Status verborgen';
    }
    identity.appendChild(activity);
    head.appendChild(identity);
    panel.appendChild(head);
    const profile = member.profile || {};
    const about = String(profile.about || '').trim();
    if(about) panel.appendChild(node('p', 'member-hovercard-about', about));
    const keys = ratingKeys(target);
    panel.appendChild(node('div', 'member-hovercard-section', keys[0] === 'daily_freestyle' ? 'Freestyle · Gamer-Ratings' : 'Klassisch · Gamer-Ratings'));
    const ratings = node('div', 'member-hovercard-ratings');
    let provisional = false;
    keys.forEach(key => {
      const rating = normalizeClientRating((member.ratings || {})[key], key, labels[key]);
      const relevant = key === target.ratingType;
      const item = node('div', 'member-hovercard-rating' + (relevant ? ' is-current' : ''));
      item.appendChild(node('span', 'member-hovercard-rating-label', labels[key]));
      const info = RATING_TYPE_ORDER.find(item => item.key === key);
      item.appendChild(createRatingHistoryButton(member, info, rating, 'member-hovercard-rating-value'));
      if(!rating.games) item.appendChild(node('span', 'member-hovercard-unrated', 'Noch ohne Wertung'));
      if(relevant) item.appendChild(node('span', 'member-hovercard-current', 'Diese Partie'));
      if(rating.games && rating.provisional) provisional = true;
      ratings.appendChild(item);
    });
    panel.appendChild(ratings);
    if(provisional) panel.appendChild(node('div', 'member-hovercard-note', '? = vorläufige Wertung'));
    const footer = node('div', 'member-hovercard-footer');
    if(String(profile.clubName || '').trim()) footer.appendChild(node('div', 'member-hovercard-club', profile.clubName));
    const since = formatMemberProfileSince(member.createdAt);
    if(since !== '—') footer.appendChild(node('div', 'member-hovercard-since', 'Mitglied seit ' + since));
    footer.appendChild(node('div', 'member-hovercard-hint', 'Klick auf den Namen öffnet das Profil'));
    const games = node('button', 'button-flat member-hovercard-games', '♟ Laufende Partien');
    games.type = 'button';
    games.title = 'Laufende Partien mit Brettvorschau';
    games.addEventListener('click', () => {
      const source = anchor;
      hide();
      openMemberGamesDialog(member, source);
    });
    footer.appendChild(games);
    panel.appendChild(footer);
    position();
  }
  async function show(element){
    const target = targetFor(element);
    if(!target || !element.isConnected || !element.getClientRects().length){ hide(); return; }
    anchor = element; activeMemberId = target.id;
    const token = onlineAuthToken, userId = onlineAuthUser.id;
    const request = ++revision;
    const panel = ensureCard();
    panel.replaceChildren(node('div', 'member-hovercard-loading', 'Spielerkarte wird geladen …'));
    panel.hidden = false;
    const descriptions = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    element.setAttribute('aria-describedby', [...new Set([...descriptions, panel.id])].join(' '));
    position();
    const current = () => request === revision && signedIn() && onlineAuthToken === token && onlineAuthUser.id === userId && element.isConnected && targetFor(element)?.id === target.id;
    try{
      const data = await authApi('/api/members/' + encodeURIComponent(target.id) + '/profile', {cache:'no-store'});
      if(!current()) return;
      if(!data || !data.member) throw new Error('Missing member');
      render(data.member, target);
    } catch(_){
      if(!current()) return;
      panel.replaceChildren(node('div', 'member-hovercard-loading', 'Kurzinfo gerade nicht verfügbar. Klicke auf den Namen, um das Profil zu öffnen.'));
      position();
    }
  }
  function schedule(element){
    if(anchor === element && card && !card.hidden){ clearTimeout(closeTimer); return; }
    hide();
    if(targetFor(element)){ anchor = element; openTimer = setTimeout(() => show(element), 500); }
  }
  function refresh(element){
    const target = targetFor(element);
    element.classList.toggle('member-profile-link', !!target);
    element.removeAttribute('title');
    if(element.tagName !== 'BUTTON'){
      if(target){ element.setAttribute('role','button'); element.tabIndex = 0; }
      else { element.removeAttribute('role'); element.removeAttribute('tabindex'); }
    }
    if(target) element.setAttribute('aria-label', 'Profil von ' + (target.username || 'Mitglied') + ' öffnen');
    else element.removeAttribute('aria-label');
    if(anchor === element && (!target || (activeMemberId && target.id !== activeMemberId))) hide();
  }
  function bind(element, target){
    if(!element) return;
    const isNew = !links.has(element);
    links.set(element, target);
    refresh(element);
    if(!isNew) return;
    const open = event => {
      const member = targetFor(element);
      if(!member) return;
      event.stopPropagation();
      hide();
      openMemberProfile(member, member.context || 'standalone');
    };
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => {
      if(event.key === 'ArrowDown' && anchor === element && card && !card.hidden){
        event.preventDefault(); clearTimeout(closeTimer);
        const first = card.querySelector('button');
        if(first) first.focus();
        return;
      }
      if(element.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')){
        event.preventDefault(); open(event);
      }
    });
    element.addEventListener('pointerenter', event => {
      // An actual mouse/trackpad event is required; touch-generated focus never opens a card.
      if(event.pointerType === 'mouse' && hoverDevice.matches) schedule(element);
    });
    element.addEventListener('pointerleave', () => { if(anchor === element || openTimer) deferHide(); });
    element.addEventListener('focus', () => { if(keyboardNavigation && hoverDevice.matches) schedule(element); });
    element.addEventListener('blur', () => { if(anchor === element || openTimer) deferHide(); });
  }
  document.addEventListener('pointerdown', event => {
    keyboardNavigation = false;
    if(!card || !card.contains(event.target)) hide();
  }, true);
  document.addEventListener('keydown', event => {
    if(event.key === 'Tab'){ keyboardNavigation = true; }
    if(event.key === 'Escape' && anchor){ event.preventDefault(); event.stopImmediatePropagation(); hide(); }
  }, true);
  document.addEventListener('scroll', event => { if(!card || !card.contains(event.target)) hide(); }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', () => { if(document.hidden) hide(); });
  window.addEventListener('hammerschach:auth-change', () => { hide(); refreshBoardMemberLinks(); });
  hoverDevice.addEventListener('change', () => { if(!hoverDevice.matches) hide(); });
  // Polling lists replace their rows, and dialogs can be closed without moving the mouse.
  const observer = new MutationObserver(() => {
    if(anchor && (!anchor.isConnected || anchor.closest('[hidden]'))) hide();
  });
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden']});
  return {bind, hide, ratingKeys};
})();

function memberCardRoomContext(){
  const control = onlineRoomTimeControl || {};
  const setup = onlineRoomGameSetup || {};
  const freestyle = setup.variant === 'freestyle960';
  const derived = control.mode === 'daily' ? (freestyle ? 'daily_freestyle' : 'daily_classic')
    : freestyle ? 'live_freestyle' : ({classic:'live_classic', rapid:'live_rapid', blitz:'live_blitz'}[control.category] || '');
  return {ratingType:onlineRatingState && onlineRatingState.type || derived, variant:setup.variant};
}
function refreshBoardMemberLinks(){
  [['w',whitePlayerNameEl],['b',blackPlayerNameEl]].forEach(([role, element]) => {
    MemberHovercard.bind(element, () => {
      const slot = onlinePlayers[role === 'w' ? 'white' : 'black'];
      if(!onlineRoomId || !slot || slot.guest || !slot.profileId) return null;
      return Object.assign({id:slot.profileId, username:slot.name}, memberCardRoomContext());
    });
  });
}
