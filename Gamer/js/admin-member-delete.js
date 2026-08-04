'use strict';

let adminDeleteMembers = [];
let adminDeleteMembersLoading = false;
let adminDeleteTargetUser = null;
let adminDeleteBusy = false;
function setAdminDeleteMembersStatus(message, kind){
  if(!adminDeleteMembersStatus) return;
  adminDeleteMembersStatus.textContent = message || '';
  adminDeleteMembersStatus.classList.toggle('error', kind === 'error');
  adminDeleteMembersStatus.classList.toggle('success', kind === 'success');
}
function setAdminDeleteConfirmStatus(message, kind){
  if(!adminDeleteConfirmStatus) return;
  adminDeleteConfirmStatus.textContent = message || '';
  adminDeleteConfirmStatus.classList.toggle('error', kind === 'error');
  adminDeleteConfirmStatus.classList.toggle('success', kind === 'success');
}
function updateAdminDeleteConfirmButton(){
  const password = String(adminDeletePasswordInput && adminDeletePasswordInput.value || '');
  if(adminDeleteConfirmBtn) adminDeleteConfirmBtn.disabled = adminDeleteBusy || !adminDeleteTargetUser || password.length < 8;
  if(adminDeleteConfirmCancelBtn) adminDeleteConfirmCancelBtn.disabled = adminDeleteBusy;
}
function renderAdminDeleteMembers(){
  if(!adminDeleteMembersList) return;
  adminDeleteMembersList.innerHTML = '';
  if(adminDeleteMembersLoading){
    adminDeleteMembersList.innerHTML = '<div class="admin-list-empty">Mitgliederliste wird geladen…</div>';
    return;
  }
  const query = String(adminDeleteSearchInput && adminDeleteSearchInput.value || '').trim().toLocaleLowerCase('de-DE');
  const users = adminDeleteMembers
    .filter(user => !query || String(user && user.username || '').toLocaleLowerCase('de-DE').includes(query))
    .slice()
    .sort((a, b) => String(a && a.username || '').localeCompare(String(b && b.username || ''), 'de-DE', {sensitivity:'base'}));
  if(!users.length){
    const empty = document.createElement('div');
    empty.className = 'admin-list-empty';
    empty.textContent = query ? 'Kein passendes Mitglied gefunden.' : 'Keine löschbaren Mitglieder gefunden.';
    adminDeleteMembersList.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'admin-delete-card';
    const main = document.createElement('div');
    main.className = 'admin-delete-card-main';
    const name = document.createElement('div');
    name.className = 'admin-delete-name';
    const nameText = document.createElement('span');
    nameText.textContent = user.username || 'Mitglied';
    name.appendChild(nameText);
    name.appendChild(createPresenceBadge(!!user.isOnline));
    const meta = document.createElement('div');
    meta.className = 'admin-delete-meta';
    meta.textContent = 'Mitglied seit ' + formatMemberProfileSince(user.createdAt);
    main.append(name, meta);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-delete-btn';
    deleteBtn.textContent = 'Mitglied löschen';
    deleteBtn.title = 'Löschung von ' + (user.username || 'diesem Mitglied') + ' mit Admin-Kennwort vorbereiten';
    deleteBtn.disabled = adminDeleteBusy;
    deleteBtn.addEventListener('click', () => openAdminDeleteConfirmation(user));
    card.append(main, deleteBtn);
    frag.appendChild(card);
  });
  adminDeleteMembersList.appendChild(frag);
}
async function loadAdminDeleteMembers(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  adminDeleteMembersLoading = true;
  if(adminDeleteRefreshBtn) adminDeleteRefreshBtn.disabled = true;
  setAdminDeleteMembersStatus('Mitgliederliste wird sicher geladen…', '');
  renderAdminDeleteMembers();
  try{
    const data = await authApi('/api/admin/users');
    adminDeleteMembers = Array.isArray(data.users) ? data.users : [];
    setAdminDeleteMembersStatus(adminDeleteMembers.length + ' löschbare' + (adminDeleteMembers.length === 1 ? 's Mitglied' : ' Mitglieder') + ' geladen.', adminDeleteMembers.length ? 'success' : '');
  } catch(err){
    adminDeleteMembers = [];
    setAdminDeleteMembersStatus(err && err.message ? err.message : 'Die geschützte Mitgliederliste konnte nicht geladen werden.', 'error');
  } finally {
    adminDeleteMembersLoading = false;
    if(adminDeleteRefreshBtn) adminDeleteRefreshBtn.disabled = false;
    renderAdminDeleteMembers();
  }
}
function openAdminDeleteMembers(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(adminDeleteMembersBackdrop) adminDeleteMembersBackdrop.hidden = false;
  if(adminDeleteSearchInput) adminDeleteSearchInput.value = '';
  setAdminDeleteMembersStatus('', '');
  loadAdminDeleteMembers();
  setTimeout(() => { try{ if(adminDeleteSearchInput) adminDeleteSearchInput.focus(); } catch(_){} }, 0);
}
function closeAdminDeleteConfirmation(){
  if(adminDeleteBusy) return;
  if(adminDeleteConfirmBackdrop) adminDeleteConfirmBackdrop.hidden = true;
  if(adminDeletePasswordInput) adminDeletePasswordInput.value = '';
  if(adminDeleteTarget) adminDeleteTarget.textContent = '';
  adminDeleteTargetUser = null;
  setAdminDeleteConfirmStatus('', '');
  updateAdminDeleteConfirmButton();
}
function closeAdminDeleteMembers(reopenOverview){
  if(adminDeleteBusy) return;
  closeAdminDeleteConfirmation();
  if(adminDeleteMembersBackdrop) adminDeleteMembersBackdrop.hidden = true;
  adminDeleteMembers = [];
  setAdminDeleteMembersStatus('', '');
  if(reopenOverview && onlineAuthToken && onlineAuthUser && onlineAuthUser.isAdmin === true){
    if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
    refreshAdminOverview();
  }
}
function openAdminDeleteConfirmation(user){
  if(adminDeleteBusy || !user || !user.id || !isCurrentUserAdmin()) return;
  adminDeleteTargetUser = user;
  if(adminDeleteTarget) adminDeleteTarget.textContent = 'Ausgewählt: „' + (user.username || 'Mitglied') + '“';
  if(adminDeletePasswordInput) adminDeletePasswordInput.value = '';
  setAdminDeleteConfirmStatus('Erst nach erfolgreicher Kennwortprüfung wird die Löschung ausgeführt.', '');
  if(adminDeleteConfirmBackdrop) adminDeleteConfirmBackdrop.hidden = false;
  updateAdminDeleteConfirmButton();
  setTimeout(() => { try{ if(adminDeletePasswordInput) adminDeletePasswordInput.focus(); } catch(_){} }, 0);
}
async function deleteAdminMemberNow(){
  if(adminDeleteBusy || !adminDeleteTargetUser || !adminDeleteTargetUser.id || !isCurrentUserAdmin()) return;
  const password = String(adminDeletePasswordInput && adminDeletePasswordInput.value || '');
  if(password.length < 8){
    setAdminDeleteConfirmStatus('Bitte gib dein vollständiges aktuelles Admin-Kennwort ein.', 'error');
    return;
  }
  const target = adminDeleteTargetUser;
  const username = target.username || 'Mitglied';
  adminDeleteBusy = true;
  updateAdminDeleteConfirmButton();
  renderAdminDeleteMembers();
  setAdminDeleteConfirmStatus('Admin-Kennwort wird geprüft und die Löschung vorbereitet…', '');
  try{
    const data = await authApi('/api/admin/users/' + encodeURIComponent(target.id), {
      method:'DELETE',
      body:JSON.stringify({currentPassword:password})
    });
    adminDeleteMembers = adminDeleteMembers.filter(user => user && user.id !== target.id);
    adminDeleteBusy = false;
    closeAdminDeleteConfirmation();
    renderAdminDeleteMembers();
    const message = data && data.message ? data.message : ('Mitglied „' + username + '“ wurde gelöscht.');
    setAdminDeleteMembersStatus(message, 'success');
    if(statusEl) statusEl.textContent = message;
  } catch(err){
    if(adminDeletePasswordInput) adminDeletePasswordInput.value = '';
    setAdminDeleteConfirmStatus(err && err.message ? err.message : 'Das Mitglied konnte nicht gelöscht werden.', 'error');
    setTimeout(() => { try{ if(adminDeletePasswordInput) adminDeletePasswordInput.focus(); } catch(_){} }, 0);
  } finally {
    adminDeleteBusy = false;
    updateAdminDeleteConfirmButton();
    renderAdminDeleteMembers();
  }
}
if(adminMemberDeleteOpenBtn) adminMemberDeleteOpenBtn.addEventListener('click', openAdminDeleteMembers);
if(adminDeleteRefreshBtn) adminDeleteRefreshBtn.addEventListener('click', loadAdminDeleteMembers);
if(adminDeleteSearchInput) adminDeleteSearchInput.addEventListener('input', renderAdminDeleteMembers);
if(adminDeleteMembersCloseBtn) adminDeleteMembersCloseBtn.addEventListener('click', () => closeAdminDeleteMembers(true));
if(adminDeleteConfirmCancelBtn) adminDeleteConfirmCancelBtn.addEventListener('click', closeAdminDeleteConfirmation);
if(adminDeletePasswordInput) adminDeletePasswordInput.addEventListener('input', updateAdminDeleteConfirmButton);
if(adminDeleteConfirmBtn) adminDeleteConfirmBtn.addEventListener('click', deleteAdminMemberNow);
if(adminDeleteMembersBackdrop) adminDeleteMembersBackdrop.addEventListener('click', event => { if(event.target === adminDeleteMembersBackdrop) closeAdminDeleteMembers(true); });
if(adminDeleteConfirmBackdrop) adminDeleteConfirmBackdrop.addEventListener('click', event => { if(event.target === adminDeleteConfirmBackdrop) closeAdminDeleteConfirmation(); });
document.addEventListener('keydown', event => {
  if(event.key !== 'Escape') return;
  if(adminDeleteConfirmBackdrop && !adminDeleteConfirmBackdrop.hidden) closeAdminDeleteConfirmation();
  else if(adminDeleteMembersBackdrop && !adminDeleteMembersBackdrop.hidden) closeAdminDeleteMembers(true);
});
