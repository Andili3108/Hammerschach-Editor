'use strict';

let infoCenterItems = [];
let infoCenterSelectedId = '';
let infoCenterAddressHandled = false;
const infoCenterObjectUrls = new Set();

function setInfoCenterStatus(message, kind){
  if(!infoCenterStatus) return;
  infoCenterStatus.textContent = message || '';
  infoCenterStatus.classList.toggle('error', kind === 'error');
}

function infoCenterDate(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  try{ return date.toLocaleString('de-DE', {dateStyle:'medium', timeStyle:'short'}); }
  catch(_){ return date.toISOString(); }
}

function releaseInfoCenterObjectUrls(){
  infoCenterObjectUrls.forEach(url => { try{ URL.revokeObjectURL(url); } catch(_){} });
  infoCenterObjectUrls.clear();
}

function clearInfoCenter(){
  infoCenterItems = [];
  infoCenterSelectedId = '';
  infoCenterAddressHandled = false;
  releaseInfoCenterObjectUrls();
  if(infoCenterBar) infoCenterBar.hidden = true;
  if(infoCenterBackdrop) infoCenterBackdrop.hidden = true;
  if(infoCenterList) infoCenterList.innerHTML = '';
  if(infoCenterDetail) infoCenterDetail.innerHTML = '<div class="info-center-detail-empty">Wähle links eine Mitteilung aus.</div>';
  setInfoCenterStatus('', '');
}

function infoCenterUnreadCount(){
  return infoCenterItems.filter(item => item && item.unread).length;
}

function updateInfoCenterBar(){
  if(!infoCenterBar) return;
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  infoCenterBar.hidden = !loggedIn;
  if(!loggedIn) return;
  const latest = infoCenterItems[0] || null;
  if(infoCenterLatestText) infoCenterLatestText.textContent = latest ? (latest.title || 'Neue Mitteilung') : 'Noch keine Mitteilungen vorhanden';
  const unread = infoCenterUnreadCount();
  if(infoCenterUnreadBadge){
    infoCenterUnreadBadge.hidden = unread < 1;
    infoCenterUnreadBadge.textContent = unread === 1 ? '1 neu' : unread + ' neu';
  }
}

function renderInfoCenterList(){
  if(!infoCenterList) return;
  infoCenterList.innerHTML = '';
  if(!infoCenterItems.length){
    const empty = document.createElement('div');
    empty.className = 'info-center-list-empty';
    empty.textContent = 'Noch keine Mitteilungen vorhanden.';
    infoCenterList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  infoCenterItems.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'info-center-list-item' + (item.unread ? ' unread' : '') + (String(item.id) === infoCenterSelectedId ? ' active' : '');
    button.dataset.infoCenterId = String(item.id || '');
    const head = document.createElement('span');
    head.className = 'info-center-list-head';
    const category = document.createElement('span');
    category.className = 'info-center-list-category';
    category.textContent = (item.icon || 'ℹ️') + ' ' + (item.categoryLabel || 'Mitteilung');
    const date = document.createElement('time');
    date.textContent = infoCenterDate(item.publishedAt || item.startsAt);
    head.append(category, date);
    const title = document.createElement('strong');
    title.textContent = item.title || 'Mitteilung';
    const summary = document.createElement('span');
    summary.className = 'info-center-list-summary';
    summary.textContent = item.summary || '';
    button.append(head, title, summary);
    if(item.unread){
      const badge = document.createElement('span');
      badge.className = 'info-center-list-new';
      badge.textContent = 'Neu';
      button.appendChild(badge);
    }
    button.addEventListener('click', () => openInfoCenterItem(item.id));
    fragment.appendChild(button);
  });
  infoCenterList.appendChild(fragment);
}

async function fetchInfoCenterAttachment(attachment){
  const headers = {};
  if(onlineAuthToken) headers.authorization = 'Bearer ' + onlineAuthToken;
  const response = await fetch(onlineApiBaseUrl() + String(attachment && attachment.url || ''), {headers});
  if(!response.ok) throw new Error('Die Datei konnte nicht geladen werden.');
  return response.blob();
}

async function downloadInfoCenterAttachment(attachment, openInline){
  try{
    setInfoCenterStatus('Datei wird geladen…', '');
    const blob = await fetchInfoCenterAttachment(attachment);
    const url = URL.createObjectURL(blob);
    infoCenterObjectUrls.add(url);
    if(openInline && attachment.kind !== 'pgn'){
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name || 'Datei';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setInfoCenterStatus('', '');
    setTimeout(() => {
      try{ URL.revokeObjectURL(url); } catch(_){}
      infoCenterObjectUrls.delete(url);
    }, 60000);
  } catch(err){ setInfoCenterStatus(err && err.message ? err.message : 'Die Datei konnte nicht geladen werden.', 'error'); }
}

async function loadInfoCenterImage(attachment, image){
  try{
    const blob = await fetchInfoCenterAttachment(attachment);
    const url = URL.createObjectURL(blob);
    infoCenterObjectUrls.add(url);
    image.src = url;
  } catch(_){ image.hidden = true; }
}

function renderInfoCenterDetail(item){
  if(!infoCenterDetail) return;
  releaseInfoCenterObjectUrls();
  infoCenterDetail.innerHTML = '';
  if(!item){
    infoCenterDetail.innerHTML = '<div class="info-center-detail-empty">Die Mitteilung konnte nicht geladen werden.</div>';
    return;
  }
  const meta = document.createElement('div');
  meta.className = 'info-center-detail-meta';
  meta.textContent = (item.icon || 'ℹ️') + ' ' + (item.categoryLabel || 'Mitteilung') + ' · ' + infoCenterDate(item.publishedAt || item.startsAt);
  const title = document.createElement('h4');
  title.textContent = item.title || 'Mitteilung';
  const summary = document.createElement('p');
  summary.className = 'info-center-detail-summary';
  summary.textContent = item.summary || '';
  const body = document.createElement('div');
  body.className = 'info-center-detail-body';
  String(item.body || '').split(/\n{2,}/).forEach(block => {
    if(!block.trim()) return;
    const paragraph = document.createElement('p');
    paragraph.textContent = block.trim();
    body.appendChild(paragraph);
  });
  infoCenterDetail.append(meta, title, summary, body);

  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  if(attachments.length){
    const filesTitle = document.createElement('h5');
    filesTitle.textContent = 'Dateien';
    const files = document.createElement('div');
    files.className = 'info-center-detail-files';
    attachments.forEach(attachment => {
      const card = document.createElement('div');
      card.className = 'info-center-detail-file';
      if(attachment.kind === 'image'){
        const image = document.createElement('img');
        image.alt = attachment.altText || attachment.name || 'Bild zur Mitteilung';
        image.loading = 'lazy';
        card.appendChild(image);
        loadInfoCenterImage(attachment, image);
      }
      if(attachment.caption){
        const caption = document.createElement('div');
        caption.className = 'info-center-detail-file-caption';
        caption.textContent = attachment.caption;
        card.appendChild(caption);
      }
      const row = document.createElement('div');
      row.className = 'info-center-detail-file-row';
      const label = document.createElement('span');
      label.textContent = (attachment.kind === 'pgn' ? '♟️ ' : attachment.kind === 'document' ? '📄 ' : '🖼️ ') + (attachment.name || 'Datei');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button-flat';
      button.textContent = attachment.kind === 'pgn' ? 'PGN herunterladen' : 'Öffnen';
      button.addEventListener('click', () => downloadInfoCenterAttachment(attachment, attachment.kind !== 'pgn'));
      row.append(label, button);
      card.appendChild(row);
      files.appendChild(card);
    });
    infoCenterDetail.append(filesTitle, files);
  }
  if(item.linkUrl){
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'info-center-detail-action';
    action.textContent = item.actionLabel || 'Mehr erfahren';
    action.addEventListener('click', () => {
      try{
        const url = new URL(item.linkUrl, window.location.origin);
        if(['http:','https:'].includes(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch(_){}
    });
    infoCenterDetail.appendChild(action);
  }
}

async function openInfoCenterItem(itemId){
  const id = String(itemId || '');
  if(!id) return;
  infoCenterSelectedId = id;
  renderInfoCenterList();
  if(infoCenterDetail) infoCenterDetail.innerHTML = '<div class="info-center-detail-empty">Mitteilung wird geladen…</div>';
  try{
    const data = await authApi('/api/info-center/' + encodeURIComponent(id));
    const item = data.item || null;
    const listItem = infoCenterItems.find(entry => String(entry.id) === id);
    if(listItem) listItem.unread = false;
    updateInfoCenterBar();
    renderInfoCenterList();
    renderInfoCenterDetail(item);
    setInfoCenterStatus('', '');
  } catch(err){
    renderInfoCenterDetail(null);
    setInfoCenterStatus(err && err.message ? err.message : 'Die Mitteilung konnte nicht geladen werden.', 'error');
  }
}

function openInfoCenter(itemId){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  if(infoCenterBackdrop){ infoCenterBackdrop.hidden = false; delete infoCenterBackdrop.dataset.adminPreview; }
  renderInfoCenterList();
  const requested = String(itemId || '');
  const selected = infoCenterItems.find(item => String(item.id) === requested) || infoCenterItems[0] || null;
  if(selected) openInfoCenterItem(selected.id);
  else renderInfoCenterDetail(null);
}

function closeInfoCenter(){
  const reopenAdmin = !!(infoCenterBackdrop && infoCenterBackdrop.dataset.adminPreview === '1');
  if(infoCenterBackdrop){ infoCenterBackdrop.hidden = true; delete infoCenterBackdrop.dataset.adminPreview; }
  releaseInfoCenterObjectUrls();
  setInfoCenterStatus('', '');
  if(reopenAdmin && adminInfoCenterBackdrop) adminInfoCenterBackdrop.hidden = false;
}

async function loadInfoCenter(){
  if(!onlineAuthToken || !onlineAuthUser){ clearInfoCenter(); return; }
  try{
    const data = await authApi('/api/info-center');
    infoCenterItems = Array.isArray(data.items) ? data.items : [];
    updateInfoCenterBar();
    renderInfoCenterList();
    if(!infoCenterAddressHandled){
      let requested = '';
      try{ requested = String(new URLSearchParams(window.location.search || '').get('info') || ''); } catch(_){}
      infoCenterAddressHandled = true;
      if(requested && !hasOnlineTargetInAddress()) openInfoCenter(requested);
    }
  } catch(err){
    updateInfoCenterBar();
    setInfoCenterStatus(err && err.message ? err.message : 'Das Info-Center konnte nicht geladen werden.', 'error');
  }
}

if(infoCenterOpenBtn) infoCenterOpenBtn.addEventListener('click', () => openInfoCenter(''));
if(infoCenterCloseBtn) infoCenterCloseBtn.addEventListener('click', closeInfoCenter);
if(infoCenterCloseTopBtn) infoCenterCloseTopBtn.addEventListener('click', closeInfoCenter);
if(infoCenterBackdrop) infoCenterBackdrop.addEventListener('click', event => { if(event.target === infoCenterBackdrop) closeInfoCenter(); });
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && infoCenterBackdrop && !infoCenterBackdrop.hidden){ event.preventDefault(); closeInfoCenter(); }
});
