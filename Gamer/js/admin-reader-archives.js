'use strict';

const ADMIN_READER_ARCHIVE_MAX = 15;
const ADMIN_READER_ARCHIVE_DEFAULTS = [
  {id:'archive_1', name:'SV Ruhrgebiet', file:'SVRuhrgebiet.txt', enabled:true},
  {id:'archive_2', name:'Unna Open', file:'UnnaOpen.txt', enabled:true},
  {id:'archive_3', name:'NRW-Klasse 1', file:'NRWKlasse1.txt', enabled:true},
  {id:'archive_4', name:'Verbandsbezirksliga 1', file:'Verbandsbezirksliga1.txt', enabled:true},
  {id:'archive_5', name:'NRW-Liga 1', file:'NRWLiga1.txt', enabled:true}
];
let adminReaderArchivesBusy = false;

function setAdminReaderArchivesStatus(message, kind){
  if(!adminReaderArchivesStatus) return;
  adminReaderArchivesStatus.textContent = message || '';
  adminReaderArchivesStatus.classList.toggle('error', kind === 'error');
  adminReaderArchivesStatus.classList.toggle('success', kind === 'success');
}

function adminReaderArchiveError(error, fallback){
  const message = String(error && error.message || fallback || 'Die Archivverwaltung konnte nicht geladen werden.');
  if(/Account-Endpunkt nicht gefunden|404|not found/i.test(message)){
    return 'Die Archivverwaltung benötigt den aktuellen Lobby-Worker. Bitte veröffentliche den Worker dieses Updates.';
  }
  return message;
}

function normalizeAdminReaderArchives(items, max){
  const source = Array.isArray(items) ? items : [];
  const count = Math.min(ADMIN_READER_ARCHIVE_MAX, Math.max(1, Number(max || ADMIN_READER_ARCHIVE_MAX)));
  const bySlot = new Map();
  source.forEach((item, index) => {
    const slot = Math.max(1, Math.min(count, Number(item && item.slot || index + 1)));
    if(!bySlot.has(slot)) bySlot.set(slot, item || {});
  });
  return Array.from({length:count}, (_, index) => {
    const slot = index + 1;
    const item = bySlot.get(slot) || {};
    return {
      slot,
      id:String(item.id || 'archive_' + slot),
      name:String(item.name || ''),
      file:String(item.file || ''),
      enabled:item.enabled === true
    };
  });
}

function renderAdminReaderArchives(items, max){
  if(!adminReaderArchivesList) return;
  const archives = normalizeAdminReaderArchives(items, max);
  adminReaderArchivesList.replaceChildren();
  const fragment = document.createDocumentFragment();
  archives.forEach(item => {
    const row = document.createElement('div');
    row.className = 'admin-reader-archive-row';
    row.dataset.slot = String(item.slot);
    row.dataset.id = item.id;

    const slot = document.createElement('div');
    slot.className = 'admin-reader-archive-slot';
    slot.textContent = 'Platz ' + item.slot;

    const nameLabel = document.createElement('label');
    nameLabel.className = 'admin-reader-archive-field';
    nameLabel.appendChild(document.createTextNode('Archivname'));
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.dataset.field = 'name';
    nameInput.value = item.name;
    nameInput.placeholder = 'z. B. Vereinsmeisterschaft';
    nameLabel.appendChild(nameInput);

    const fileLabel = document.createElement('label');
    fileLabel.className = 'admin-reader-archive-field';
    fileLabel.appendChild(document.createTextNode('TXT-Datei'));
    const fileInput = document.createElement('input');
    fileInput.type = 'text';
    fileInput.maxLength = 160;
    fileInput.dataset.field = 'file';
    fileInput.value = item.file;
    fileInput.placeholder = 'Partienarchiv.txt';
    fileLabel.appendChild(fileInput);

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'admin-reader-archive-enabled';
    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.dataset.field = 'enabled';
    enabledInput.checked = item.enabled;
    enabledLabel.append(enabledInput, document.createTextNode('Freigeschaltet'));

    row.append(slot, nameLabel, fileLabel, enabledLabel);
    fragment.appendChild(row);
  });
  adminReaderArchivesList.appendChild(fragment);
}

function readAdminReaderArchives(){
  if(!adminReaderArchivesList) return [];
  return Array.from(adminReaderArchivesList.querySelectorAll('.admin-reader-archive-row')).map((row, index) => {
    const name = row.querySelector('[data-field="name"]');
    const file = row.querySelector('[data-field="file"]');
    const enabled = row.querySelector('[data-field="enabled"]');
    return {
      slot:Number(row.dataset.slot || index + 1),
      id:String(row.dataset.id || 'archive_' + (index + 1)),
      name:String(name && name.value || '').trim(),
      file:String(file && file.value || '').trim(),
      enabled:!!(enabled && enabled.checked)
    };
  });
}

function setAdminReaderArchivesBusy(busy){
  adminReaderArchivesBusy = !!busy;
  [adminReaderArchivesReloadBtn, adminReaderArchivesSaveBtn, adminReaderArchivesCloseBtn].forEach(button => {
    if(button) button.disabled = adminReaderArchivesBusy;
  });
}

async function loadAdminReaderArchives(){
  if(!isCurrentUserAdmin() || adminReaderArchivesBusy) return;
  setAdminReaderArchivesBusy(true);
  setAdminReaderArchivesStatus('Archivkonfiguration wird geladen…', '');
  try{
    const data = await authApi('/api/admin/reader-archives');
    renderAdminReaderArchives(data.archives, data.max);
    setAdminReaderArchivesStatus('Die Archivkonfiguration ist aktuell.', 'success');
  } catch(error){
    setAdminReaderArchivesStatus(adminReaderArchiveError(error), 'error');
  } finally {
    setAdminReaderArchivesBusy(false);
  }
}

async function saveAdminReaderArchives(){
  if(!isCurrentUserAdmin() || adminReaderArchivesBusy) return;
  const archives = readAdminReaderArchives();
  const incomplete = archives.find(item => item.enabled && (!item.name || !item.file));
  if(incomplete){
    setAdminReaderArchivesStatus('Bitte bei jedem freigeschalteten Archiv Namen und TXT-Datei eintragen.', 'error');
    return;
  }
  setAdminReaderArchivesBusy(true);
  setAdminReaderArchivesStatus('Archivkonfiguration wird gespeichert…', '');
  try{
    const data = await authApi('/api/admin/reader-archives', {method:'POST', body:JSON.stringify({archives})});
    renderAdminReaderArchives(data.archives, data.max);
    setAdminReaderArchivesStatus(data.message || 'Die Archivkonfiguration wurde gespeichert.', 'success');
    if(typeof postReaderToolMessage === 'function') postReaderToolMessage({type:'hammerschach-reader-refresh-archives'});
  } catch(error){
    setAdminReaderArchivesStatus(adminReaderArchiveError(error, 'Die Archivkonfiguration konnte nicht gespeichert werden.'), 'error');
  } finally {
    setAdminReaderArchivesBusy(false);
  }
}

function openAdminReaderArchives(){
  if(!isCurrentUserAdmin()) return;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(adminReaderArchivesBackdrop) adminReaderArchivesBackdrop.hidden = false;
  renderAdminReaderArchives(ADMIN_READER_ARCHIVE_DEFAULTS, ADMIN_READER_ARCHIVE_MAX);
  loadAdminReaderArchives();
}

function closeAdminReaderArchives(reopenOverview){
  if(adminReaderArchivesBusy) return;
  if(adminReaderArchivesBackdrop) adminReaderArchivesBackdrop.hidden = true;
  setAdminReaderArchivesStatus('', '');
  if(reopenOverview && isCurrentUserAdmin()){
    if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
    refreshAdminOverview();
  }
}

if(adminReaderArchivesOpenBtn) adminReaderArchivesOpenBtn.addEventListener('click', openAdminReaderArchives);
if(adminReaderArchivesReloadBtn) adminReaderArchivesReloadBtn.addEventListener('click', loadAdminReaderArchives);
if(adminReaderArchivesSaveBtn) adminReaderArchivesSaveBtn.addEventListener('click', saveAdminReaderArchives);
if(adminReaderArchivesCloseBtn) adminReaderArchivesCloseBtn.addEventListener('click', () => closeAdminReaderArchives(true));
if(adminReaderArchivesBackdrop) adminReaderArchivesBackdrop.addEventListener('click', event => {
  if(event.target === adminReaderArchivesBackdrop) closeAdminReaderArchives(true);
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && adminReaderArchivesBackdrop && !adminReaderArchivesBackdrop.hidden) closeAdminReaderArchives(true);
});
