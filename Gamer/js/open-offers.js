'use strict';

function formatPublicGameTime(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  try{ return date.toLocaleString('de-DE', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}); }
  catch(_){ return ''; }
}
function openOfferModeLabel(offer){
  return offer && offer.mode === 'daily' ? 'Daily Chess' : 'Live-Partie';
}
function openOfferVariantLabel(offer){
  if(offer && offer.variant === GAME_VARIANT_FREESTYLE){
    return Number.isFinite(Number(offer.positionId)) ? ('Freestyle #' + Number(offer.positionId)) : 'Freestyle';
  }
  return 'Klassisch';
}
function openOfferRoleLabel(role){ return role === 'b' ? 'Schwarz' : 'Weiß'; }
let openOffersRequestPromise = null;
function requestOpenOffers(){
  if(openOffersRequestPromise) return openOffersRequestPromise;
  openOffersRequestPromise = authApi('/api/open-offers').finally(() => { openOffersRequestPromise = null; });
  return openOffersRequestPromise;
}
function availableOpenOffersCount(offers){
  return (Array.isArray(offers) ? offers : []).filter(offer => offer && offer.mine !== true).length;
}
function updateOpenOffersBadge(offers){
  if(!openOffersCount) return;
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  const count = loggedIn ? availableOpenOffersCount(offers) : 0;
  openOffersCount.textContent = count > 99 ? '99+' : String(count);
  openOffersCount.hidden = count < 1;
  if(count > 0){
    const label = count === 1 ? '1 annehmbares Partieangebot' : count + ' annehmbare Partieangebote';
    openOffersCount.setAttribute('aria-label',label);
    openOffersCount.title = label;
  } else {
    openOffersCount.removeAttribute('aria-label');
    openOffersCount.removeAttribute('title');
  }
}
async function refreshOpenOffersBadge(){
  if(!onlineAuthToken || !onlineAuthUser){
    updateOpenOffersBadge([]);
    return [];
  }
  const data = await requestOpenOffers();
  const offers = data.offers || [];
  updateOpenOffersBadge(offers);
  return offers;
}
function createOpenOfferCard(offer){
  const card = document.createElement('div');
  card.className = 'open-offer-card' + (offer.mine ? ' mine' : '');
  const content = document.createElement('div');
  if(offer.mine){
    const kicker = document.createElement('div');
    kicker.className = 'open-offer-kicker';
    kicker.textContent = 'Dein Angebot';
    content.appendChild(kicker);
  }
  const title = document.createElement('div');
  title.className = 'open-offer-title';
  title.textContent = (cleanDisplayName(offer.creatorName) || 'Mitglied') + ' bietet eine Partie an';
  const status = document.createElement('div');
  status.className = 'open-offer-status';
  status.textContent = 'Anbieter spielt ' + openOfferRoleLabel(offer.creatorRole) + ' · frei ist ' + openOfferRoleLabel(offer.opponentRole);
  const meta = document.createElement('div');
  meta.className = 'open-offer-meta';
  const parts = [openOfferModeLabel(offer), offer.timeLabel || '', openOfferVariantLabel(offer), offer.rated === false ? 'Ungewertet' : 'Gewertet'];
  if(offer.createdAt) parts.push('angeboten: ' + formatPublicGameTime(offer.createdAt));
  meta.textContent = parts.filter(Boolean).join(' · ');
  content.appendChild(title); content.appendChild(status); content.appendChild(meta);
  const actions = document.createElement('div');
  actions.className = 'open-offer-actions';
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  if(offer.mine){
    actionBtn.className = 'open-offer-withdraw-btn';
    actionBtn.textContent = 'Angebot zurückziehen';
    actionBtn.addEventListener('click', () => withdrawOpenOffer(offer, actionBtn));
  } else {
    actionBtn.textContent = 'Partie annehmen';
    actionBtn.addEventListener('click', () => acceptOpenOffer(offer, actionBtn));
  }
  actions.appendChild(actionBtn);
  card.appendChild(content); card.appendChild(actions);
  return card;
}
function renderOpenOffers(offers){
  if(!openOffersListEl) return;
  openOffersListEl.innerHTML = '';
  const list = Array.isArray(offers) ? offers : [];
  if(!list.length){
    const empty = document.createElement('div');
    empty.className = 'open-offers-empty';
    empty.textContent = 'Derzeit wird keine offene Partie angeboten.';
    openOffersListEl.appendChild(empty);
    return;
  }
  list.forEach(offer => openOffersListEl.appendChild(createOpenOfferCard(offer)));
}
async function loadOpenOffers(options){
  options = options || {};
  const silent = !!options.silent;
  if(!silent && openOffersStatusEl) openOffersStatusEl.textContent = 'Offene Partien werden geladen…';
  if(!silent && openOffersRefreshBtn) openOffersRefreshBtn.disabled = true;
  try{
    const data = await requestOpenOffers();
    const offers = data.offers || [];
    updateOpenOffersBadge(offers);
    renderOpenOffers(offers);
    if(!silent && openOffersStatusEl) openOffersStatusEl.textContent = offers.length === 1 ? '1 offene Partie verfügbar.' : offers.length + ' offene Partien verfügbar.';
  } catch(err){
    if(!silent) renderOpenOffers([]);
    if(openOffersStatusEl) openOffersStatusEl.textContent = err && err.message ? err.message : 'Offene Partien konnten nicht geladen werden.';
  } finally {
    if(!silent && openOffersRefreshBtn) openOffersRefreshBtn.disabled = false;
  }
}
async function acceptOpenOffer(offer, button){
  if(!onlineAuthToken || !onlineAuthUser){
    closeOpenOffersDialog();
    openAuthDialog('login');
    if(authError) authError.textContent = 'Bitte einloggen, um eine offene Partie anzunehmen.';
    return;
  }
  if(!offer || !offer.roomId) return;
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Wird angenommen…'; }
  if(openOffersStatusEl) openOffersStatusEl.textContent = 'Partieangebot wird für dich reserviert…';
  try{
    const data = await authApi('/api/open-offers/' + encodeURIComponent(offer.roomId), {method:'POST', body:JSON.stringify({})});
    closeOpenOffersDialog();
    onlineDesiredOpenOfferForNewRoom = false;
    connectOnlineRoom(data.roomId || offer.roomId, {preferredRole:data.preferredRole || offer.opponentRole || '', spectatorOnly:false});
    if(statusEl) statusEl.textContent = data.message || 'Partieangebot wurde angenommen. Der Spielraum wird geöffnet.';
  } catch(err){
    if(openOffersStatusEl) openOffersStatusEl.textContent = err && err.message ? err.message : 'Das Partieangebot konnte nicht angenommen werden.';
    if(button){ button.disabled = false; button.textContent = oldText || 'Partie annehmen'; }
    loadOpenOffers({silent:true});
  }
}
async function withdrawOpenOffer(offer, button){
  if(!offer || !offer.roomId) return;
  if(!window.confirm('Dieses Partieangebot wirklich zurückziehen?')) return;
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Wird zurückgezogen…'; }
  if(openOffersStatusEl) openOffersStatusEl.textContent = 'Partieangebot wird zurückgezogen…';
  try{
    const data = await authApi('/api/open-offers/' + encodeURIComponent(offer.roomId), {method:'DELETE'});
    if(openOffersStatusEl) openOffersStatusEl.textContent = data.message || 'Partieangebot wurde zurückgezogen.';
    await loadOpenOffers({silent:true});
  } catch(err){
    if(openOffersStatusEl) openOffersStatusEl.textContent = err && err.message ? err.message : 'Das Partieangebot konnte nicht zurückgezogen werden.';
    if(button){ button.disabled = false; button.textContent = oldText || 'Angebot zurückziehen'; }
  }
}
function startOpenOffersRefresh(){
  if(openOffersRefreshTimer) clearInterval(openOffersRefreshTimer);
  openOffersRefreshTimer = setInterval(() => {
    if(openOffersBackdrop && !openOffersBackdrop.hidden) loadOpenOffers({silent:true});
  }, 15000);
}
function stopOpenOffersRefresh(){ if(openOffersRefreshTimer){ clearInterval(openOffersRefreshTimer); openOffersRefreshTimer = null; } }
function openOpenOffersDialog(){
  if(openOffersBackdrop) openOffersBackdrop.hidden = false;
  loadOpenOffers(); startOpenOffersRefresh();
}
function closeOpenOffersDialog(){
  if(openOffersBackdrop) openOffersBackdrop.hidden = true;
  stopOpenOffersRefresh();
}
if(openOffersOpenBtn) openOffersOpenBtn.addEventListener('click', openOpenOffersDialog);
if(openOffersRefreshBtn) openOffersRefreshBtn.addEventListener('click', () => loadOpenOffers());
if(openOffersCloseBtn) openOffersCloseBtn.addEventListener('click', closeOpenOffersDialog);
if(openOffersBackdrop) openOffersBackdrop.addEventListener('click', ev => { if(ev.target === openOffersBackdrop) closeOpenOffersDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && openOffersBackdrop && !openOffersBackdrop.hidden) closeOpenOffersDialog(); });
