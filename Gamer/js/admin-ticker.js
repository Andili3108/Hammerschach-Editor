'use strict';

let adminTickerItems = [];
let adminTickerEditingId = '';
let adminTickerBusy = false;
function setAdminTickerStatus(message, kind){
  if(!adminTickerStatus) return;
  adminTickerStatus.textContent = message || '';
  adminTickerStatus.classList.toggle('error', kind === 'error');
  adminTickerStatus.classList.toggle('success', kind === 'success');
}
function adminTickerInputDate(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function resetAdminTickerForm(){
  adminTickerEditingId = '';
  if(adminTickerFormTitle) adminTickerFormTitle.textContent = 'Neue Meldung';
  if(adminTickerCategory) adminTickerCategory.value = 'event';
  if(adminTickerPriority) adminTickerPriority.value = '50';
  if(adminTickerItemTitle) adminTickerItemTitle.value = '';
  if(adminTickerItemMessage) adminTickerItemMessage.value = '';
  if(adminTickerLinkUrl) adminTickerLinkUrl.value = '';
  if(adminTickerActionLabel) adminTickerActionLabel.value = '';
  const now = Date.now();
  if(adminTickerStartsAt) adminTickerStartsAt.value = adminTickerInputDate(new Date(now));
  if(adminTickerEndsAt) adminTickerEndsAt.value = adminTickerInputDate(new Date(now + 7 * 24 * 60 * 60 * 1000));
  if(adminTickerItemActive) adminTickerItemActive.checked = true;
  if(adminTickerSaveBtn) adminTickerSaveBtn.textContent = 'Meldung speichern';
}
function editAdminTickerItem(item){
  if(!item || item.category === 'welcome') return;
  adminTickerEditingId = String(item.id || '');
  if(adminTickerFormTitle) adminTickerFormTitle.textContent = 'Meldung bearbeiten';
  if(adminTickerCategory) adminTickerCategory.value = item.category === 'event' ? 'event' : 'news';
  if(adminTickerPriority) adminTickerPriority.value = ['50','80','100'].includes(String(item.priority)) ? String(item.priority) : '50';
  if(adminTickerItemTitle) adminTickerItemTitle.value = item.title || '';
  if(adminTickerItemMessage) adminTickerItemMessage.value = item.message || '';
  if(adminTickerLinkUrl) adminTickerLinkUrl.value = item.actionKind === 'link' ? (item.actionValue || '') : '';
  if(adminTickerActionLabel) adminTickerActionLabel.value = item.actionLabel || '';
  if(adminTickerStartsAt) adminTickerStartsAt.value = adminTickerInputDate(item.startsAt);
  if(adminTickerEndsAt) adminTickerEndsAt.value = adminTickerInputDate(item.endsAt);
  if(adminTickerItemActive) adminTickerItemActive.checked = item.active !== false;
  if(adminTickerSaveBtn) adminTickerSaveBtn.textContent = 'Änderungen speichern';
  if(adminTickerItemTitle) adminTickerItemTitle.focus();
}
function adminTickerCategoryLabel(item){
  if(item.category === 'welcome') return '👋 Automatische Begrüßung';
  if(item.category === 'event') return '📅 Veranstaltung';
  return '📢 Neuigkeit';
}
function renderAdminTickerItems(){
  if(!adminTickerList) return;
  adminTickerList.innerHTML = '';
  if(!adminTickerItems.length){
    const empty = document.createElement('div');
    empty.className = 'admin-list-empty';
    empty.textContent = 'Noch keine gespeicherten Ticker-Meldungen vorhanden.';
    adminTickerList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  adminTickerItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'admin-ticker-card' + (item.active === false ? ' inactive' : '');
    const title = document.createElement('div');
    title.className = 'admin-ticker-card-title';
    title.textContent = (item.icon || '') + ' ' + (item.title || 'Ticker-Meldung');
    const message = document.createElement('div');
    message.className = 'admin-ticker-card-text';
    message.textContent = item.message || '';
    const meta = document.createElement('div');
    meta.className = 'admin-ticker-card-meta';
    meta.textContent = adminTickerCategoryLabel(item) + ' · Priorität ' + Number(item.priority || 0) + ' · ' + formatAdminDateTime(item.startsAt) + ' bis ' + formatAdminDateTime(item.endsAt) + (item.active === false ? ' · AUSGEBLENDET' : '');
    const actions = document.createElement('div');
    actions.className = 'admin-ticker-card-actions';
    if(item.category !== 'welcome'){
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'button-flat'; edit.textContent = 'Bearbeiten';
      edit.addEventListener('click', () => editAdminTickerItem(item));
      actions.appendChild(edit);
    }
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'button-flat'; toggle.textContent = item.active === false ? 'Einblenden' : 'Ausblenden';
    toggle.addEventListener('click', () => setAdminTickerItemActive(item, item.active === false));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'button-flat'; remove.textContent = 'Löschen';
    remove.addEventListener('click', () => deleteAdminTickerItem(item));
    actions.append(toggle, remove);
    card.append(title, message, meta, actions);
    fragment.appendChild(card);
  });
  adminTickerList.appendChild(fragment);
}
async function loadAdminTicker(){
  if(!isCurrentUserAdmin()) return;
  setAdminTickerStatus('Ticker-Daten werden geladen…', '');
  try{
    const data = await authApi('/api/admin/lobby-ticker');
    adminTickerItems = Array.isArray(data.items) ? data.items : [];
    const settings = data.settings || {};
    if(adminTickerWelcomeEnabled) adminTickerWelcomeEnabled.checked = settings.welcomeEnabled !== false;
    if(adminTickerWelcomeDuration) adminTickerWelcomeDuration.value = String(settings.welcomeDurationHours || 72);
    if(adminTickerWelcomeTemplate) adminTickerWelcomeTemplate.value = settings.welcomeTemplate || 'Herzlich willkommen bei Hammerschach, {username}! Schön, dass du dabei bist.';
    renderAdminTickerItems();
    setAdminTickerStatus('Ticker-Verwaltung ist aktuell.', 'success');
  } catch(err){
    setAdminTickerStatus(err && err.message ? err.message : 'Die Ticker-Verwaltung konnte nicht geladen werden.', 'error');
  }
}
function openAdminTicker(){
  if(!isCurrentUserAdmin()) return;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(adminTickerBackdrop) adminTickerBackdrop.hidden = false;
  resetAdminTickerForm();
  loadAdminTicker();
}
function closeAdminTicker(reopenOverview){
  if(adminTickerBusy) return;
  if(adminTickerBackdrop) adminTickerBackdrop.hidden = true;
  setAdminTickerStatus('', '');
  if(reopenOverview && isCurrentUserAdmin()){
    if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
    refreshAdminOverview();
  }
}
async function saveAdminTickerWelcomeSettings(){
  if(adminTickerBusy || !isCurrentUserAdmin()) return;
  adminTickerBusy = true;
  if(adminTickerWelcomeSaveBtn) adminTickerWelcomeSaveBtn.disabled = true;
  setAdminTickerStatus('Begrüßungseinstellung wird gespeichert…', '');
  try{
    const data = await authApi('/api/admin/lobby-ticker', {method:'POST', body:JSON.stringify({
      action:'save_settings',
      welcomeEnabled:!!(adminTickerWelcomeEnabled && adminTickerWelcomeEnabled.checked),
      welcomeDurationHours:Number(adminTickerWelcomeDuration && adminTickerWelcomeDuration.value || 72),
      welcomeTemplate:String(adminTickerWelcomeTemplate && adminTickerWelcomeTemplate.value || '')
    })});
    setAdminTickerStatus(data.message || 'Die automatische Begrüßung wurde gespeichert.', 'success');
  } catch(err){ setAdminTickerStatus(err && err.message ? err.message : 'Die Begrüßungseinstellung konnte nicht gespeichert werden.', 'error'); }
  finally { adminTickerBusy = false; if(adminTickerWelcomeSaveBtn) adminTickerWelcomeSaveBtn.disabled = false; }
}
async function saveAdminTickerForm(event){
  if(event) event.preventDefault();
  if(adminTickerBusy || !isCurrentUserAdmin()) return;
  const starts = new Date(String(adminTickerStartsAt && adminTickerStartsAt.value || ''));
  const ends = new Date(String(adminTickerEndsAt && adminTickerEndsAt.value || ''));
  if(Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts){
    setAdminTickerStatus('Bitte einen gültigen Anzeigezeitraum eingeben; das Ende muss nach dem Beginn liegen.', 'error');
    return;
  }
  adminTickerBusy = true;
  if(adminTickerSaveBtn) adminTickerSaveBtn.disabled = true;
  setAdminTickerStatus('Ticker-Meldung wird gespeichert…', '');
  try{
    const data = await authApi('/api/admin/lobby-ticker', {method:'POST', body:JSON.stringify({
      id:adminTickerEditingId,
      category:adminTickerCategory && adminTickerCategory.value || 'event',
      priority:Number(adminTickerPriority && adminTickerPriority.value || 50),
      title:String(adminTickerItemTitle && adminTickerItemTitle.value || ''),
      message:String(adminTickerItemMessage && adminTickerItemMessage.value || ''),
      linkUrl:String(adminTickerLinkUrl && adminTickerLinkUrl.value || ''),
      actionLabel:String(adminTickerActionLabel && adminTickerActionLabel.value || ''),
      startsAt:starts.toISOString(), endsAt:ends.toISOString(),
      active:!!(adminTickerItemActive && adminTickerItemActive.checked)
    })});
    resetAdminTickerForm();
    await loadAdminTicker();
    await loadLobbyTicker();
    setAdminTickerStatus(data.message || 'Die Ticker-Meldung wurde gespeichert.', 'success');
  } catch(err){ setAdminTickerStatus(err && err.message ? err.message : 'Die Ticker-Meldung konnte nicht gespeichert werden.', 'error'); }
  finally { adminTickerBusy = false; if(adminTickerSaveBtn) adminTickerSaveBtn.disabled = false; }
}
async function setAdminTickerItemActive(item, active){
  if(adminTickerBusy || !item || !item.id) return;
  adminTickerBusy = true;
  setAdminTickerStatus(active ? 'Meldung wird eingeblendet…' : 'Meldung wird ausgeblendet…', '');
  try{
    const data = await authApi('/api/admin/lobby-ticker/' + encodeURIComponent(item.id) + '/status', {method:'POST', body:JSON.stringify({active})});
    await loadAdminTicker(); await loadLobbyTicker();
    setAdminTickerStatus(data.message || 'Der Status wurde geändert.', 'success');
  } catch(err){ setAdminTickerStatus(err && err.message ? err.message : 'Der Status konnte nicht geändert werden.', 'error'); }
  finally { adminTickerBusy = false; }
}
async function deleteAdminTickerItem(item){
  if(adminTickerBusy || !item || !item.id) return;
  if(!window.confirm('Ticker-Meldung „' + (item.title || 'ohne Titel') + '“ wirklich löschen?')) return;
  adminTickerBusy = true;
  setAdminTickerStatus('Ticker-Meldung wird gelöscht…', '');
  try{
    const data = await authApi('/api/admin/lobby-ticker/' + encodeURIComponent(item.id), {method:'DELETE'});
    if(adminTickerEditingId === String(item.id)) resetAdminTickerForm();
    await loadAdminTicker(); await loadLobbyTicker();
    setAdminTickerStatus(data.message || 'Die Ticker-Meldung wurde gelöscht.', 'success');
  } catch(err){ setAdminTickerStatus(err && err.message ? err.message : 'Die Ticker-Meldung konnte nicht gelöscht werden.', 'error'); }
  finally { adminTickerBusy = false; }
}
if(adminTickerOpenBtn) adminTickerOpenBtn.addEventListener('click', openAdminTicker);
if(adminTickerCloseBtn) adminTickerCloseBtn.addEventListener('click', () => closeAdminTicker(true));
if(adminTickerWelcomeSaveBtn) adminTickerWelcomeSaveBtn.addEventListener('click', saveAdminTickerWelcomeSettings);
if(adminTickerForm) adminTickerForm.addEventListener('submit', saveAdminTickerForm);
if(adminTickerResetBtn) adminTickerResetBtn.addEventListener('click', resetAdminTickerForm);
if(adminTickerBackdrop) adminTickerBackdrop.addEventListener('click', event => { if(event.target === adminTickerBackdrop) closeAdminTicker(true); });
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && adminTickerBackdrop && !adminTickerBackdrop.hidden){
    event.preventDefault(); closeAdminTicker(true);
  }
});
