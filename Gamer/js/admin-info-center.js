'use strict';

const ADMIN_INFO_CENTER_MAX_ATTACHMENTS = 4;
const ADMIN_INFO_CENTER_MAX_FILE_BYTES = 3 * 1024 * 1024;
const ADMIN_INFO_CENTER_MAX_PGN_BYTES = 2 * 1024 * 1024;
const ADMIN_INFO_CENTER_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
let adminInfoCenterItems = [];
let adminInfoCenterEditingId = '';
let adminInfoCenterExistingFiles = [];
let adminInfoCenterNewFiles = [];
let adminInfoCenterBusy = false;

function setAdminInfoCenterStatus(message, kind){
  if(!adminInfoCenterStatus) return;
  adminInfoCenterStatus.textContent = message || '';
  adminInfoCenterStatus.classList.toggle('error', kind === 'error');
  adminInfoCenterStatus.classList.toggle('success', kind === 'success');
}

function adminInfoCenterInputDate(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function adminInfoCenterOutputDate(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function adminInfoCenterFileExtension(name){
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : '';
}

function adminInfoCenterFileType(file){
  const extension = adminInfoCenterFileExtension(file && file.name);
  if(extension === 'pgn') return 'application/x-chess-pgn';
  const type = String(file && file.type || '').toLowerCase();
  const allowed = {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', pdf:'application/pdf'
  };
  return allowed[extension] === type || (!type && allowed[extension]) ? allowed[extension] : '';
}

function adminInfoCenterFileSize(bytes){
  const size = Math.max(0, Number(bytes || 0));
  if(size < 1024) return size + ' Byte';
  if(size < 1024 * 1024) return (size / 1024).toLocaleString('de-DE', {maximumFractionDigits:1}) + ' KB';
  return (size / (1024 * 1024)).toLocaleString('de-DE', {maximumFractionDigits:2}) + ' MB';
}

function readAdminInfoCenterFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Die Datei „' + String(file && file.name || '') + '“ konnte nicht gelesen werden.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if(comma < 0) reject(new Error('Die Datei konnte nicht verarbeitet werden.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function adminInfoCenterUpdateCounts(){
  if(adminInfoCenterSummaryCount) adminInfoCenterSummaryCount.textContent = String(adminInfoCenterSummary ? adminInfoCenterSummary.value.length : 0) + ' / 280';
  if(adminInfoCenterBodyCount) adminInfoCenterBodyCount.textContent = String(adminInfoCenterBody ? adminInfoCenterBody.value.length : 0) + ' / 12000';
}

function updateAdminInfoCenterChannelUi(){
  const published = !!(adminInfoCenterStatusSelect && adminInfoCenterStatusSelect.value === 'published');
  if(adminInfoCenterEmailCheckbox){
    adminInfoCenterEmailCheckbox.disabled = adminInfoCenterBusy || !published;
    if(!published) adminInfoCenterEmailCheckbox.checked = false;
  }
}

function adminInfoCenterAllFiles(){
  return adminInfoCenterExistingFiles.concat(adminInfoCenterNewFiles);
}

function renderAdminInfoCenterFiles(){
  if(!adminInfoCenterFilesList) return;
  adminInfoCenterFilesList.innerHTML = '';
  const files = adminInfoCenterAllFiles();
  if(!files.length){
    const empty = document.createElement('div');
    empty.className = 'admin-info-center-files-empty';
    empty.textContent = 'Keine Dateien ausgewählt.';
    adminInfoCenterFilesList.appendChild(empty);
    return;
  }
  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'admin-info-center-file';
    const row = document.createElement('div');
    row.className = 'admin-info-center-file-head';
    const label = document.createElement('span');
    const kind = file.kind || (String(file.type || '').startsWith('image/') ? 'image' : String(file.type || '').includes('pgn') ? 'pgn' : 'document');
    label.textContent = (kind === 'image' ? '🖼️ ' : kind === 'pgn' ? '♟️ ' : '📄 ') + (file.name || 'Datei') + ' · ' + adminInfoCenterFileSize(file.size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button-flat';
    remove.textContent = 'Entfernen';
    remove.disabled = adminInfoCenterBusy;
    remove.addEventListener('click', () => {
      if(file.id) adminInfoCenterExistingFiles = adminInfoCenterExistingFiles.filter(item => String(item.id) !== String(file.id));
      else adminInfoCenterNewFiles = adminInfoCenterNewFiles.filter(item => item.localId !== file.localId);
      renderAdminInfoCenterFiles();
    });
    row.append(label, remove);
    const fields = document.createElement('div');
    fields.className = 'admin-info-center-file-fields';
    const caption = document.createElement('input');
    caption.type = 'text';
    caption.maxLength = 240;
    caption.placeholder = kind === 'image' ? 'Bildunterschrift (optional)' : 'Beschreibung (optional)';
    caption.value = file.caption || '';
    caption.disabled = adminInfoCenterBusy;
    caption.setAttribute('aria-label', kind === 'image' ? 'Bildunterschrift' : 'Dateibeschreibung');
    caption.addEventListener('input', () => { file.caption = caption.value; });
    fields.appendChild(caption);
    if(kind === 'image'){
      const altText = document.createElement('input');
      altText.type = 'text';
      altText.maxLength = 240;
      altText.placeholder = 'Alternativtext für das Bild (optional)';
      altText.value = file.altText || '';
      altText.disabled = adminInfoCenterBusy;
      altText.setAttribute('aria-label', 'Alternativtext für das Bild');
      altText.addEventListener('input', () => { file.altText = altText.value; });
      fields.appendChild(altText);
    }
    card.append(row, fields);
    adminInfoCenterFilesList.appendChild(card);
  });
}

async function selectAdminInfoCenterFiles(){
  const selected = Array.from(adminInfoCenterFiles && adminInfoCenterFiles.files ? adminInfoCenterFiles.files : []);
  if(adminInfoCenterFiles) adminInfoCenterFiles.value = '';
  if(!selected.length) return;
  if(adminInfoCenterAllFiles().length + selected.length > ADMIN_INFO_CENTER_MAX_ATTACHMENTS){
    setAdminInfoCenterStatus('Pro Mitteilung sind höchstens vier Dateien möglich.', 'error');
    return;
  }
  const pending = [];
  let total = adminInfoCenterAllFiles().reduce((sum, file) => sum + Math.max(0, Number(file.size || 0)), 0);
  for(const file of selected){
    const type = adminInfoCenterFileType(file);
    if(!type){ setAdminInfoCenterStatus('Erlaubt sind ausschließlich JPG-, PNG-, WebP-, PDF- und PGN-Dateien.', 'error'); return; }
    const max = type === 'application/x-chess-pgn' ? ADMIN_INFO_CENTER_MAX_PGN_BYTES : ADMIN_INFO_CENTER_MAX_FILE_BYTES;
    if(!file.size || file.size > max){
      setAdminInfoCenterStatus(type === 'application/x-chess-pgn' ? 'Eine PGN-Datei darf höchstens 2 MB groß sein.' : 'Eine Datei darf höchstens 3 MB groß sein.', 'error');
      return;
    }
    total += file.size;
    pending.push({file, type});
  }
  if(total > ADMIN_INFO_CENTER_MAX_TOTAL_BYTES){ setAdminInfoCenterStatus('Alle Dateien zusammen dürfen höchstens 8 MB groß sein.', 'error'); return; }
  setAdminInfoCenterStatus('Dateien werden eingelesen…', '');
  try{
    for(const entry of pending){
      const base64 = await readAdminInfoCenterFile(entry.file);
      adminInfoCenterNewFiles.push({
        localId:'new_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name:String(entry.file.name || 'Datei').slice(0, 100),
        type:entry.type,
        size:entry.file.size,
        base64,
        kind:entry.type.startsWith('image/') ? 'image' : entry.type.includes('pgn') ? 'pgn' : 'document',
        caption:'',
        altText:''
      });
    }
    renderAdminInfoCenterFiles();
    setAdminInfoCenterStatus(pending.length === 1 ? 'Datei wurde hinzugefügt.' : pending.length + ' Dateien wurden hinzugefügt.', 'success');
  } catch(err){ setAdminInfoCenterStatus(err && err.message ? err.message : 'Die Dateien konnten nicht eingelesen werden.', 'error'); }
}

function resetAdminInfoCenterForm(){
  adminInfoCenterEditingId = '';
  adminInfoCenterExistingFiles = [];
  adminInfoCenterNewFiles = [];
  if(adminInfoCenterFormTitle) adminInfoCenterFormTitle.textContent = 'Neue Mitteilung';
  if(adminInfoCenterCategory) adminInfoCenterCategory.value = 'news';
  if(adminInfoCenterStatusSelect) adminInfoCenterStatusSelect.value = 'draft';
  if(adminInfoCenterItemTitle) adminInfoCenterItemTitle.value = '';
  if(adminInfoCenterSummary) adminInfoCenterSummary.value = '';
  if(adminInfoCenterBody) adminInfoCenterBody.value = '';
  if(adminInfoCenterLinkUrl) adminInfoCenterLinkUrl.value = '';
  if(adminInfoCenterActionLabel) adminInfoCenterActionLabel.value = '';
  if(adminInfoCenterStartsAt) adminInfoCenterStartsAt.value = adminInfoCenterInputDate(new Date());
  if(adminInfoCenterEndsAt) adminInfoCenterEndsAt.value = '';
  if(adminInfoCenterTickerCheckbox) adminInfoCenterTickerCheckbox.checked = false;
  if(adminInfoCenterEmailCheckbox) adminInfoCenterEmailCheckbox.checked = false;
  if(adminInfoCenterFiles) adminInfoCenterFiles.value = '';
  if(adminInfoCenterSaveBtn) adminInfoCenterSaveBtn.textContent = 'Mitteilung speichern';
  adminInfoCenterUpdateCounts();
  updateAdminInfoCenterChannelUi();
  renderAdminInfoCenterFiles();
}

function editAdminInfoCenterItem(item){
  if(!item) return;
  adminInfoCenterEditingId = String(item.id || '');
  adminInfoCenterExistingFiles = Array.isArray(item.attachments) ? item.attachments.slice() : [];
  adminInfoCenterNewFiles = [];
  if(adminInfoCenterFormTitle) adminInfoCenterFormTitle.textContent = 'Mitteilung bearbeiten';
  if(adminInfoCenterCategory) adminInfoCenterCategory.value = item.category || 'news';
  if(adminInfoCenterStatusSelect) adminInfoCenterStatusSelect.value = item.status || 'draft';
  if(adminInfoCenterItemTitle) adminInfoCenterItemTitle.value = item.title || '';
  if(adminInfoCenterSummary) adminInfoCenterSummary.value = item.summary || '';
  if(adminInfoCenterBody) adminInfoCenterBody.value = item.body || '';
  if(adminInfoCenterLinkUrl) adminInfoCenterLinkUrl.value = item.linkUrl || '';
  if(adminInfoCenterActionLabel) adminInfoCenterActionLabel.value = item.actionLabel || '';
  if(adminInfoCenterStartsAt) adminInfoCenterStartsAt.value = adminInfoCenterInputDate(item.startsAt || item.publishedAt || new Date());
  if(adminInfoCenterEndsAt) adminInfoCenterEndsAt.value = adminInfoCenterInputDate(item.endsAt);
  if(adminInfoCenterTickerCheckbox) adminInfoCenterTickerCheckbox.checked = item.showInTicker === true;
  if(adminInfoCenterEmailCheckbox) adminInfoCenterEmailCheckbox.checked = false;
  if(adminInfoCenterSaveBtn) adminInfoCenterSaveBtn.textContent = 'Änderungen speichern';
  adminInfoCenterUpdateCounts();
  updateAdminInfoCenterChannelUi();
  renderAdminInfoCenterFiles();
  if(adminInfoCenterItemTitle) adminInfoCenterItemTitle.focus();
}

function adminInfoCenterStatusLabel(item){
  if(item.status === 'published') return 'Veröffentlicht';
  if(item.status === 'archived') return 'Archiviert';
  return 'Entwurf';
}

function renderAdminInfoCenterItems(){
  if(!adminInfoCenterList) return;
  adminInfoCenterList.innerHTML = '';
  if(!adminInfoCenterItems.length){
    const empty = document.createElement('div'); empty.className = 'admin-list-empty'; empty.textContent = 'Noch keine Mitteilungen vorhanden.'; adminInfoCenterList.appendChild(empty); return;
  }
  adminInfoCenterItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'admin-info-center-card status-' + String(item.status || 'draft');
    const title = document.createElement('div'); title.className = 'admin-info-center-card-title'; title.textContent = (item.icon || 'ℹ️') + ' ' + (item.title || 'Mitteilung');
    const summary = document.createElement('div'); summary.className = 'admin-info-center-card-summary'; summary.textContent = item.summary || '';
    const meta = document.createElement('div'); meta.className = 'admin-info-center-card-meta';
    meta.textContent = adminInfoCenterStatusLabel(item) + ' · ' + (item.categoryLabel || 'Mitteilung') + ' · ' + formatAdminDateTime(item.publishedAt || item.startsAt || item.createdAt) + ' · ' + Number(item.attachmentCount || 0) + ' Datei(en)' + (item.showInTicker ? ' · Ticker' : '') + (item.emailSentAt ? ' · Mail versendet' : '');
    const actions = document.createElement('div'); actions.className = 'admin-info-center-card-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button-flat'; edit.textContent = 'Bearbeiten'; edit.addEventListener('click', () => editAdminInfoCenterItem(item));
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'button-flat'; preview.textContent = 'Ansehen'; preview.addEventListener('click', () => previewAdminInfoCenterItem(item));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button-flat'; remove.textContent = 'Löschen'; remove.addEventListener('click', () => deleteAdminInfoCenterItem(item));
    actions.append(edit, preview, remove);
    card.append(title, summary, meta, actions);
    adminInfoCenterList.appendChild(card);
  });
}

async function loadAdminInfoCenter(){
  if(!isCurrentUserAdmin()) return;
  setAdminInfoCenterStatus('Mitteilungen werden geladen…', '');
  try{
    const data = await authApi('/api/admin/info-center');
    adminInfoCenterItems = Array.isArray(data.items) ? data.items : [];
    renderAdminInfoCenterItems();
    setAdminInfoCenterStatus('Info-Center ist aktuell.', 'success');
  } catch(err){ setAdminInfoCenterStatus(err && err.message ? err.message : 'Die Info-Center-Verwaltung konnte nicht geladen werden.', 'error'); }
}

function openAdminInfoCenter(){
  if(!isCurrentUserAdmin()) return;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(adminInfoCenterBackdrop) adminInfoCenterBackdrop.hidden = false;
  resetAdminInfoCenterForm();
  loadAdminInfoCenter();
}

function closeAdminInfoCenter(reopenOverview){
  if(adminInfoCenterBusy) return;
  if(adminInfoCenterBackdrop) adminInfoCenterBackdrop.hidden = true;
  setAdminInfoCenterStatus('', '');
  if(reopenOverview && isCurrentUserAdmin()){
    if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
    refreshAdminOverview();
  }
}

function adminInfoCenterFormPreviewItem(){
  const category = String(adminInfoCenterCategory && adminInfoCenterCategory.value || 'news');
  const labels = {news:'Neuigkeit', update:'Gamer-Update', event:'Veranstaltung', service:'Servicehinweis'};
  const icons = {news:'ℹ️', update:'🛠️', event:'📅', service:'⚙️'};
  return {
    id:'preview', category, categoryLabel:labels[category] || 'Mitteilung', icon:icons[category] || 'ℹ️',
    title:String(adminInfoCenterItemTitle && adminInfoCenterItemTitle.value || '').trim() || 'Überschrift der Mitteilung',
    summary:String(adminInfoCenterSummary && adminInfoCenterSummary.value || '').trim() || 'Der Kurztext erscheint hier.',
    body:String(adminInfoCenterBody && adminInfoCenterBody.value || '').trim() || 'Der Nachrichtentext erscheint hier.',
    publishedAt:new Date().toISOString(), linkUrl:String(adminInfoCenterLinkUrl && adminInfoCenterLinkUrl.value || '').trim(),
    actionLabel:String(adminInfoCenterActionLabel && adminInfoCenterActionLabel.value || '').trim(), attachments:[]
  };
}

function previewAdminInfoCenterItem(item){
  if(adminInfoCenterBackdrop) adminInfoCenterBackdrop.hidden = true;
  if(infoCenterBackdrop){ infoCenterBackdrop.hidden = false; infoCenterBackdrop.dataset.adminPreview = '1'; }
  renderInfoCenterDetail(item || adminInfoCenterFormPreviewItem());
  if(infoCenterList) infoCenterList.innerHTML = '<div class="info-center-list-empty">Vorschau der Mitteilung</div>';
}

async function saveAdminInfoCenter(event){
  if(event) event.preventDefault();
  if(adminInfoCenterBusy || !isCurrentUserAdmin()) return;
  const sendEmail = !!(adminInfoCenterEmailCheckbox && adminInfoCenterEmailCheckbox.checked);
  if(sendEmail && !window.confirm('Diese Mitteilung wirklich zusätzlich per E-Mail an die berechtigten Mitglieder versenden?')) return;
  adminInfoCenterBusy = true;
  if(adminInfoCenterSaveBtn) adminInfoCenterSaveBtn.disabled = true;
  setAdminInfoCenterStatus('Mitteilung wird gespeichert…', '');
  try{
    const data = await authApi('/api/admin/info-center', {method:'POST', body:JSON.stringify({
      id:adminInfoCenterEditingId,
      category:String(adminInfoCenterCategory && adminInfoCenterCategory.value || 'news'),
      status:String(adminInfoCenterStatusSelect && adminInfoCenterStatusSelect.value || 'draft'),
      title:String(adminInfoCenterItemTitle && adminInfoCenterItemTitle.value || ''),
      summary:String(adminInfoCenterSummary && adminInfoCenterSummary.value || ''),
      body:String(adminInfoCenterBody && adminInfoCenterBody.value || ''),
      linkUrl:String(adminInfoCenterLinkUrl && adminInfoCenterLinkUrl.value || ''),
      actionLabel:String(adminInfoCenterActionLabel && adminInfoCenterActionLabel.value || ''),
      startsAt:adminInfoCenterOutputDate(adminInfoCenterStartsAt && adminInfoCenterStartsAt.value),
      endsAt:adminInfoCenterOutputDate(adminInfoCenterEndsAt && adminInfoCenterEndsAt.value),
      showInTicker:!!(adminInfoCenterTickerCheckbox && adminInfoCenterTickerCheckbox.checked),
      sendEmail,
      keepAttachmentIds:adminInfoCenterExistingFiles.map(file => String(file.id || '')).filter(Boolean),
      attachmentMeta:adminInfoCenterExistingFiles.map(file => ({id:String(file.id || ''), caption:String(file.caption || ''), altText:String(file.altText || '')})),
      attachments:adminInfoCenterNewFiles.map(file => ({name:file.name, type:file.type, size:file.size, base64:file.base64, caption:String(file.caption || ''), altText:String(file.altText || '')}))
    })});
    resetAdminInfoCenterForm();
    await loadAdminInfoCenter();
    await Promise.all([loadInfoCenter(), loadLobbyTicker()]);
    setAdminInfoCenterStatus(data.message || 'Die Mitteilung wurde gespeichert.', data.mailResult && data.mailResult.ok === false ? 'error' : 'success');
  } catch(err){ setAdminInfoCenterStatus(err && err.message ? err.message : 'Die Mitteilung konnte nicht gespeichert werden.', 'error'); }
  finally { adminInfoCenterBusy = false; if(adminInfoCenterSaveBtn) adminInfoCenterSaveBtn.disabled = false; updateAdminInfoCenterChannelUi(); renderAdminInfoCenterFiles(); }
}

async function deleteAdminInfoCenterItem(item){
  if(adminInfoCenterBusy || !item || !item.id) return;
  if(!window.confirm('Info-Center-Mitteilung „' + (item.title || 'ohne Titel') + '“ wirklich löschen?')) return;
  adminInfoCenterBusy = true;
  setAdminInfoCenterStatus('Mitteilung wird gelöscht…', '');
  try{
    const data = await authApi('/api/admin/info-center/' + encodeURIComponent(item.id), {method:'DELETE'});
    if(adminInfoCenterEditingId === String(item.id)) resetAdminInfoCenterForm();
    await loadAdminInfoCenter();
    await Promise.all([loadInfoCenter(), loadLobbyTicker()]);
    setAdminInfoCenterStatus(data.message || 'Die Mitteilung wurde gelöscht.', 'success');
  } catch(err){ setAdminInfoCenterStatus(err && err.message ? err.message : 'Die Mitteilung konnte nicht gelöscht werden.', 'error'); }
  finally { adminInfoCenterBusy = false; }
}

if(adminInfoCenterOpenBtn) adminInfoCenterOpenBtn.addEventListener('click', openAdminInfoCenter);
if(adminInfoCenterCloseBtn) adminInfoCenterCloseBtn.addEventListener('click', () => closeAdminInfoCenter(true));
if(adminInfoCenterResetBtn) adminInfoCenterResetBtn.addEventListener('click', resetAdminInfoCenterForm);
if(adminInfoCenterForm) adminInfoCenterForm.addEventListener('submit', saveAdminInfoCenter);
if(adminInfoCenterFiles) adminInfoCenterFiles.addEventListener('change', selectAdminInfoCenterFiles);
if(adminInfoCenterStatusSelect) adminInfoCenterStatusSelect.addEventListener('change', updateAdminInfoCenterChannelUi);
if(adminInfoCenterSummary) adminInfoCenterSummary.addEventListener('input', adminInfoCenterUpdateCounts);
if(adminInfoCenterBody) adminInfoCenterBody.addEventListener('input', adminInfoCenterUpdateCounts);
if(adminInfoCenterPreviewBtn) adminInfoCenterPreviewBtn.addEventListener('click', () => previewAdminInfoCenterItem(adminInfoCenterFormPreviewItem()));
if(adminInfoCenterBackdrop) adminInfoCenterBackdrop.addEventListener('click', event => { if(event.target === adminInfoCenterBackdrop) closeAdminInfoCenter(true); });
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && adminInfoCenterBackdrop && !adminInfoCenterBackdrop.hidden){ event.preventDefault(); closeAdminInfoCenter(true); }
});
