'use strict';

async function copyInviteLink(){
  if(!onlineRoomId) return;
  const link = getInviteUrl();
  try{
    await navigator.clipboard.writeText(link);
    onlineLastMessage = 'Einladungslink wurde kopiert.';
    statusEl.textContent = 'Einladungslink wurde kopiert.';
  } catch(_){
    onlineLastMessage = 'Einladungslink: ' + link;
    statusEl.textContent = 'Link konnte nicht automatisch kopiert werden.';
  }
  updateOnlineUi();
}

function setMembersStatus(message, kind){
  if(!membersStatus) return;
  membersStatus.textContent = message || '';
  membersStatus.classList.toggle('error', kind === 'error');
  membersStatus.classList.toggle('success', kind === 'success');
}
function memberDirectoryParams(includeLimit){
  const params = new URLSearchParams();
  if(includeLimit) params.set('limit', '100');
  params.set('activity', membersActivityFilter || 'all');
  params.set('sort', membersSort || 'activity');
  if(membersFavoritesOnly) params.set('favorites', '1');
  return params;
}
function updateMemberDirectoryControls(){
  membersActivityFilterButtons.forEach(button => {
    const active = button.dataset.membersActivity === membersActivityFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if(membersFavoritesFilterBtn){
    membersFavoritesFilterBtn.classList.toggle('active', membersFavoritesOnly);
    membersFavoritesFilterBtn.setAttribute('aria-pressed', membersFavoritesOnly ? 'true' : 'false');
    membersFavoritesFilterBtn.textContent = membersFavoritesOnly ? '★ Favoriten' : '☆ Favoriten';
  }
  if(membersSortSelect) membersSortSelect.value = membersSort;
}
function currentMemberFilterLabel(){
  const activityLabel = {online:'Online', '24h':'letzte 24 Stunden', '7d':'letzte 7 Tage'}[membersActivityFilter] || 'alle';
  return membersFavoritesOnly ? 'Favoriten · ' + activityLabel : activityLabel;
}
function refreshStandaloneMemberDirectory(){
  if(membersSearchTimer){ clearTimeout(membersSearchTimer); membersSearchTimer = null; }
  const query = membersSearchInput ? membersSearchInput.value.trim() : '';
  membersSearchRequestId++;
  if(!query) return loadStandaloneMemberList();
  if(query.length < 2){
    if(membersResults) membersResults.innerHTML = '<div class="member-empty">Mindestens 2 Zeichen eingeben.</div>';
    setMembersStatus('Mindestens 2 Zeichen eingeben.', '');
    return;
  }
  const requestId = membersSearchRequestId;
  setMembersStatus('Suche läuft…', '');
  return performStandaloneMemberSearch(query, requestId);
}
function toggleMembersFavoritesFilter(){
  membersFavoritesOnly = !membersFavoritesOnly;
  updateMemberDirectoryControls();
  refreshStandaloneMemberDirectory();
}
function setMembersActivityFilter(value){
  const normalized = ['online','24h','7d'].includes(String(value || '')) ? String(value) : 'all';
  if(membersActivityFilter === normalized) return;
  membersActivityFilter = normalized;
  updateMemberDirectoryControls();
  refreshStandaloneMemberDirectory();
}
function setMembersSort(value){
  const normalized = String(value || '') === 'name' ? 'name' : 'activity';
  if(membersSort === normalized) return;
  membersSort = normalized;
  updateMemberDirectoryControls();
  refreshStandaloneMemberDirectory();
}
function closeMembersDialog(){
  if(membersBackdrop) membersBackdrop.hidden = true;
  if(membersSearchTimer){ clearTimeout(membersSearchTimer); membersSearchTimer = null; }
}
function standaloneInvitationAvailable(){
  return isMemberLobbyView() && !onlineRoomId;
}
async function waitForInvitationRoomReady(timeoutMs, expectedTimeControl, expectedGameSetup){
  const startedAt = Date.now();
  const maximum = Math.max(1000, Number(timeoutMs || 7000));
  let lastSyncAt = 0;
  while(Date.now() - startedAt < maximum){
    if(onlineRoomCancelled) throw new Error('Der neu erstellte Spielraum wurde zurückgezogen.');
    if(onlineGameStarted) throw new Error('Der neu erstellte Spielraum wurde unerwartet bereits gestartet.');
    const creatorReady = !!(onlineRoomId && onlineConnected && onlineCreatedByMe && (onlineRoleCode === 'w' || onlineRoleCode === 'b'));
    const timeReady = !!(expectedTimeControl && sameTimeControl(onlineRoomTimeControl, expectedTimeControl));
    const setupReady = !!(expectedGameSetup && sameGameSetup(onlineRoomGameSetup, expectedGameSetup));
    if(creatorReady && timeReady && setupReady) return true;
    if(creatorReady && Date.now() - lastSyncAt >= 700){
      lastSyncAt = Date.now();
      if(!setupReady) syncCurrentGameSetupToOnline();
      if(!timeReady) syncCurrentTimeControlToOnline();
      requestOnlineState();
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error('Der Spielraum wurde erstellt, aber Bedenkzeit und Spielmodus wurden vom Server noch nicht vollständig bestätigt. Bitte erneut senden oder mit „Abbrechen“ vollständig verwerfen.');
}
function formatMemberProfileSince(value){
  if(!value) return '—';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '—';
  try{
    return date.toLocaleDateString('de-DE', {month:'long', year:'numeric'});
  } catch(_){ return '—'; }
}
function formatMemberActivityAge(value, serverNow){
  const activityAt = Date.parse(value || '');
  if(!Number.isFinite(activityAt)) return '';
  const suppliedNow = Number(serverNow);
  const now = Number.isFinite(suppliedNow) && suppliedNow > 0 ? suppliedNow : Date.now();
  const elapsed = Math.max(0, now - activityAt);
  if(elapsed < 60 * 1000) return 'gerade aktiv';
  if(elapsed < 60 * 60 * 1000){
    const minutes = Math.max(1, Math.floor(elapsed / (60 * 1000)));
    return 'vor ' + minutes + ' Min.';
  }
  if(elapsed < 24 * 60 * 60 * 1000){
    const hours = Math.max(1, Math.floor(elapsed / (60 * 60 * 1000)));
    return 'vor ' + hours + ' Std.';
  }
  const days = Math.max(1, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  if(days === 1) return 'gestern';
  if(days < 7) return 'vor ' + days + ' Tagen';
  try{ return new Date(activityAt).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'}); }
  catch(_){ return ''; }
}
function memberRegistrationComplete(user){
  return !(user && user.registrationComplete === false);
}
function memberRegistrationPendingMessage(){
  return 'Anmeldung noch nicht abgeschlossen';
}
function createMemberActivityBadge(user, serverNow){
  const source = user && typeof user === 'object' ? user : {};
  const badge = document.createElement('span');
  badge.className = 'presence-badge';
  const dot = document.createElement('span');
  dot.className = 'presence-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');

  if(!memberRegistrationComplete(source)){
    badge.classList.add('registration-pending');
    label.textContent = 'Anmeldung offen';
    badge.title = 'Die Anmeldung dieses Kontos ist noch nicht abgeschlossen.';
  } else if(source.activityVisible === false){
    badge.classList.add('hidden-status');
    label.textContent = 'Privat';
    badge.title = 'Dieses Mitglied zeigt seinen Aktivitätsstatus nicht an.';
  } else if(source.isOnline === true){
    badge.classList.add('online');
    label.textContent = 'Online';
    badge.title = 'Innerhalb der letzten rund zweieinhalb Minuten im Hammerschach-Gamer aktiv.';
  } else {
    const age = formatMemberActivityAge(source.lastActiveAt, serverNow);
    if(age){
      badge.classList.add('recent');
      label.textContent = age;
      try{
        badge.title = 'Zuletzt aktiv: ' + new Date(source.lastActiveAt).toLocaleString('de-DE', {dateStyle:'medium', timeStyle:'short'});
      } catch(_){ badge.title = 'Zuletzt im Hammerschach-Gamer aktiv.'; }
    } else {
      label.textContent = 'Offline';
      badge.title = 'Derzeit keine aktuelle Aktivität im Hammerschach-Gamer erkannt.';
    }
  }
  badge.append(dot, label);
  return badge;
}
function setMemberProfileStatus(message, kind){
  if(!memberProfileStatus) return;
  memberProfileStatus.textContent = message || '';
  memberProfileStatus.classList.toggle('error', kind === 'error');
  memberProfileStatus.classList.toggle('success', kind === 'success');
  memberProfileStatus.classList.toggle('registration-pending', kind === 'registration-pending');
}
function renderMemberProfileRatings(ratings){
  if(!memberProfileRatingsGrid) return;
  memberProfileRatingsGrid.innerHTML = '';
  const source = ratings && typeof ratings === 'object' ? ratings : {};
  const frag = document.createDocumentFragment();
  RATING_TYPE_ORDER.forEach(info => {
    const rating = normalizeClientRating(source[info.key], info.key, info.label);
    const card = document.createElement('div');
    card.className = 'auth-rating-card';
    const name = document.createElement('div');
    name.className = 'auth-rating-name';
    name.textContent = info.label;
    const value = document.createElement('div');
    value.className = 'auth-rating-value';
    value.textContent = rating.display;
    const meta = document.createElement('div');
    meta.className = 'auth-rating-meta';
    meta.textContent = rating.games === 0
      ? 'Noch keine gewertete Partie'
      : rating.games + ' Partie' + (rating.games === 1 ? '' : 'n') + ' · ' + rating.wins + ' S · ' + rating.draws + ' R · ' + rating.losses + ' N';
    card.appendChild(name);
    card.appendChild(value);
    card.appendChild(meta);
    frag.appendChild(card);
  });
  memberProfileRatingsGrid.appendChild(frag);
}
function closeMemberProfileDialog(){
  if(memberProfileBackdrop) memberProfileBackdrop.hidden = true;
  memberProfileContext = '';
  memberProfileTarget = null;
  memberProfileRequestId++;
  setMemberProfileStatus('', '');
}
function updateMemberProfileInviteButton(){
  const isOwnProfile = !!(memberProfileTarget && memberProfileTarget.id && onlineAuthUser && memberProfileTarget.id === onlineAuthUser.id);
  if(memberProfileEditBtn){
    memberProfileEditBtn.hidden = !isOwnProfile;
    memberProfileEditBtn.disabled = !isOwnProfile;
    memberProfileEditBtn.title = isOwnProfile ? 'Eigenes Mitgliederprofil bearbeiten.' : '';
  }
  if(memberProfileChronicleBtn){
    memberProfileChronicleBtn.hidden = !isOwnProfile;
    memberProfileChronicleBtn.disabled = !isOwnProfile;
    memberProfileChronicleBtn.title = isOwnProfile ? 'Eigene Schachchronik öffnen.' : '';
  }
  const hasTarget = !!(memberProfileTarget && memberProfileTarget.id && onlineAuthUser && memberProfileTarget.id !== onlineAuthUser.id);
  const interactionAllowed = hasTarget && memberRegistrationComplete(memberProfileTarget);
  if(memberProfileMessageBtn){
    memberProfileMessageBtn.hidden = !hasTarget;
    memberProfileMessageBtn.disabled = !interactionAllowed;
    memberProfileMessageBtn.title = interactionAllowed ? 'Persönliche Nachricht schreiben.' : memberRegistrationPendingMessage();
  }
  if(!memberProfileInviteBtn) return;
  memberProfileInviteBtn.hidden = !hasTarget;
  if(!hasTarget) return;
  if(memberProfileContext === 'invite'){
    memberProfileInviteBtn.textContent = '✉️ Einladung senden';
    memberProfileInviteBtn.disabled = !onlineRoomId || !interactionAllowed;
    memberProfileInviteBtn.title = !interactionAllowed ? memberRegistrationPendingMessage() : (onlineRoomId ? 'Partieeinladung automatisch per E-Mail senden.' : 'Es ist kein Spielraum vorbereitet.');
  } else {
    const canInvite = standaloneInvitationAvailable();
    memberProfileInviteBtn.textContent = '✉️ Zur Partie einladen';
    memberProfileInviteBtn.disabled = !canInvite || !interactionAllowed;
    memberProfileInviteBtn.title = !interactionAllowed
      ? memberRegistrationPendingMessage()
      : canInvite
      ? 'Partieeinstellungen und persönliche Nachricht für dieses Mitglied vorbereiten.'
      : 'Neue Einladungen werden in der Mitglieder-Lobby vorbereitet.';
  }
}
async function openMemberProfile(user, context){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  const id = String(user && user.id || '').trim();
  if(!id) return;
  memberProfileContext = context === 'invite' ? 'invite' : (context === 'self' ? 'self' : 'standalone');
  memberProfileTarget = Object.assign({}, user || {});
  const requestId = ++memberProfileRequestId;
  if(memberProfileAvatar) applyAvatarToElement(memberProfileAvatar, user || {});
  if(memberProfileUsername) memberProfileUsername.textContent = user && user.username ? user.username : 'Mitgliederprofil';
  if(memberProfileRealName){ memberProfileRealName.textContent = ''; memberProfileRealName.hidden = true; }
  if(memberProfilePresence){ memberProfilePresence.innerHTML = ''; memberProfilePresence.appendChild(createMemberActivityBadge(user || {})); }
  if(memberProfileSince) memberProfileSince.textContent = formatMemberProfileSince(user && user.createdAt);
  if(memberProfileSinceCard) memberProfileSinceCard.style.gridColumn = '1 / -1';
  if(memberProfileDwzCard) memberProfileDwzCard.hidden = true;
  if(memberProfileClubCard) memberProfileClubCard.hidden = true;
  if(memberProfileAboutSection) memberProfileAboutSection.hidden = true;
  if(memberProfileRatingsGrid) memberProfileRatingsGrid.innerHTML = '<div class="member-empty">Ratings werden geladen…</div>';
  setMemberProfileStatus('Mitgliederprofil wird geladen…', '');
  updateMemberProfileInviteButton();
  if(memberProfileBackdrop) memberProfileBackdrop.hidden = false;
  try{
    const data = await authApi('/api/members/' + encodeURIComponent(id) + '/profile');
    if(requestId !== memberProfileRequestId) return;
    const member = data && data.member ? data.member : null;
    if(!member) throw new Error('Mitgliederprofil konnte nicht geladen werden.');
    memberProfileTarget = Object.assign({}, memberProfileTarget || {}, member);
    const profile = member.profile && typeof member.profile === 'object' ? member.profile : {};
    if(memberProfileAvatar) applyAvatarToElement(memberProfileAvatar, member);
    if(memberProfileUsername) memberProfileUsername.textContent = member.username || 'Mitglied';
    if(memberProfileRealName){
      const realName = String(profile.realName || '').trim();
      memberProfileRealName.textContent = realName;
      memberProfileRealName.hidden = !realName;
    }
    if(memberProfilePresence){
      memberProfilePresence.innerHTML = '';
      memberProfilePresence.appendChild(createMemberActivityBadge(member));
    }
    if(memberProfileSince) memberProfileSince.textContent = formatMemberProfileSince(member.createdAt);
    const dwz = Number(profile.dwz);
    const hasDwz = Number.isInteger(dwz) && dwz >= 100 && dwz <= 3500;
    if(memberProfileDwzCard) memberProfileDwzCard.hidden = !hasDwz;
    if(memberProfileSinceCard) memberProfileSinceCard.style.gridColumn = hasDwz ? '' : '1 / -1';
    if(memberProfileDwz) memberProfileDwz.textContent = hasDwz ? String(dwz) : '—';
    const clubName = String(profile.clubName || '').trim();
    if(memberProfileClubCard) memberProfileClubCard.hidden = !clubName;
    if(memberProfileClub) memberProfileClub.textContent = clubName || '—';
    const about = String(profile.about || '').trim();
    if(memberProfileAboutSection) memberProfileAboutSection.hidden = !about;
    if(memberProfileAboutText) memberProfileAboutText.textContent = about;
    renderMemberProfileRatings(member.ratings || {});
    updateMemberProfileInviteButton();
    setMemberProfileStatus(
      memberRegistrationComplete(member) ? '' : 'Die Anmeldung dieses Benutzers ist noch nicht abgeschlossen. Profilinformationen bleiben sichtbar; Einladungen und Nachrichten sind bis zur Mailbestätigung deaktiviert.',
      memberRegistrationComplete(member) ? '' : 'registration-pending'
    );
  } catch(err){
    if(requestId !== memberProfileRequestId) return;
    if(memberProfileRatingsGrid) memberProfileRatingsGrid.innerHTML = '<div class="member-empty">Ratings konnten nicht geladen werden.</div>';
    setMemberProfileStatus(err && err.message ? err.message : 'Mitgliederprofil konnte nicht geladen werden.', 'error');
  }
}
async function inviteFromMemberProfile(){
  const target = memberProfileTarget;
  const context = memberProfileContext;
  if(!target) return;
  if(!memberRegistrationComplete(target)){
    setMemberProfileStatus(memberRegistrationPendingMessage() + '. Einladungen sind erst nach der Mailbestätigung möglich.', 'registration-pending');
    return;
  }
  closeMemberProfileDialog();
  if(context === 'invite') openInvitationMessageDialog(target, null);
  else await inviteMemberFromStandaloneList(target, null);
}
if(memberProfileCloseBtn) memberProfileCloseBtn.addEventListener('click', closeMemberProfileDialog);
if(memberProfileEditBtn) memberProfileEditBtn.addEventListener('click', () => {
  closeMemberProfileDialog();
  openAccountEditDialog('profile');
});
if(memberProfileMessageBtn) memberProfileMessageBtn.addEventListener('click', () => {
  const target = memberProfileTarget;
  if(!target) return;
  if(!memberRegistrationComplete(target)){
    setMemberProfileStatus(memberRegistrationPendingMessage() + '. Nachrichten sind erst nach der Mailbestätigung möglich.', 'registration-pending');
    return;
  }
  closeMemberProfileDialog();
  if(typeof openPrivateMessagesCompose === 'function') openPrivateMessagesCompose(target);
});
if(memberProfileInviteBtn) memberProfileInviteBtn.addEventListener('click', inviteFromMemberProfile);
if(memberProfileBackdrop) memberProfileBackdrop.addEventListener('click', ev => { if(ev.target === memberProfileBackdrop) closeMemberProfileDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && memberProfileBackdrop && !memberProfileBackdrop.hidden) closeMemberProfileDialog(); });

function renderStandaloneMemberResults(users, options){
  options = options || {};
  if(!membersResults) return;
  membersResults.innerHTML = '';
  if(!users || users.length === 0){
    const empty = document.createElement('div');
    empty.className = 'member-empty';
    empty.textContent = options.source === 'search'
      ? 'Kein passendes Mitglied für Suche und Filter gefunden.'
      : (membersFavoritesOnly
          ? 'Noch kein Lieblingsmitglied für diese Auswahl vorhanden.'
          : (membersActivityFilter === 'all' ? 'Keine registrierten Mitglieder gefunden.' : 'Keine Mitglieder für diesen Aktivitätsfilter gefunden.'));
    membersResults.appendChild(empty);
    return;
  }
  const canInvite = standaloneInvitationAvailable();
  users.forEach(user => {
    const registrationComplete = memberRegistrationComplete(user);
    const card = document.createElement('div');
    card.className = 'member-result-card' + (user.favorite ? ' favorite' : '') + (registrationComplete ? '' : ' registration-pending');

    const main = document.createElement('div');
    main.className = 'member-result-main';
    const avatar = createMemberAvatarElement(user, 'profile-avatar-small');
    const info = document.createElement('div');
    info.className = 'member-result-info';
    const name = document.createElement('div');
    name.className = 'member-result-name';
    const nameText = document.createElement('span');
    nameText.className = 'member-result-name-text';
    nameText.textContent = user.username || 'Mitglied';
    name.appendChild(nameText);
    name.appendChild(createMemberActivityBadge(user, options.serverNow));
    if(onlineAuthUser && user.id && user.id !== onlineAuthUser.id){
      const favoriteBtn = document.createElement('button');
      favoriteBtn.type = 'button';
      favoriteBtn.className = 'member-favorite-btn';
      updateMemberFavoriteButton(favoriteBtn, user);
      favoriteBtn.disabled = !registrationComplete;
      if(!registrationComplete) favoriteBtn.title = memberRegistrationPendingMessage();
      favoriteBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        toggleStandaloneMemberFavorite(user, favoriteBtn);
      });
      name.appendChild(favoriteBtn);
    }
    const meta = document.createElement('div');
    meta.className = 'member-result-meta';
    meta.textContent = !registrationComplete
      ? memberRegistrationPendingMessage() + ' · Profil kann angesehen werden'
      : canInvite
      ? 'Profil ansehen oder Einladung mit eigenen Partieeinstellungen vorbereiten'
      : 'Profil ansehen · für eine neue Einladung bitte zur Lobby zurückkehren';
    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'member-result-actions';
    const profileBtn = document.createElement('button');
    profileBtn.type = 'button';
    profileBtn.className = 'button-flat';
    profileBtn.textContent = '👤 Profil';
    profileBtn.title = 'Mitgliederprofil und Ratings anzeigen';
    profileBtn.addEventListener('click', ev => { ev.stopPropagation(); openMemberProfile(user, 'standalone'); });
    actions.appendChild(profileBtn);
    if(onlineAuthUser && user.id && user.id !== onlineAuthUser.id){
      const messageBtn = document.createElement('button');
      messageBtn.type = 'button';
      messageBtn.className = 'button-flat';
      messageBtn.textContent = '✉️ Nachricht';
      messageBtn.disabled = !registrationComplete;
      messageBtn.title = registrationComplete ? 'Persönliche Nachricht schreiben' : memberRegistrationPendingMessage();
      messageBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        closeMembersDialog();
        if(typeof openPrivateMessagesCompose === 'function') openPrivateMessagesCompose(user);
      });
      actions.appendChild(messageBtn);
      const inviteBtn = document.createElement('button');
      inviteBtn.type = 'button';
      inviteBtn.className = 'button-flat';
      inviteBtn.textContent = 'Zur Partie einladen';
      inviteBtn.disabled = !canInvite || !registrationComplete;
      inviteBtn.title = !registrationComplete
        ? memberRegistrationPendingMessage()
        : canInvite
        ? 'Partieeinstellungen und persönliche Nachricht für dieses Mitglied öffnen.'
        : 'Neue Einladungen werden in der Mitglieder-Lobby vorbereitet.';
      inviteBtn.addEventListener('click', ev => { ev.stopPropagation(); inviteMemberFromStandaloneList(user, inviteBtn); });
      actions.appendChild(inviteBtn);
    }
    main.appendChild(avatar);
    main.appendChild(info);
    card.appendChild(main);
    card.appendChild(actions);
    membersResults.appendChild(card);
  });
}
function updateMemberFavoriteButton(button, user){
  if(!button) return;
  const favorite = !!(user && user.favorite);
  const username = String(user && user.username || 'dieses Mitglied');
  button.textContent = favorite ? '★' : '☆';
  button.classList.toggle('active', favorite);
  button.setAttribute('aria-pressed', favorite ? 'true' : 'false');
  button.setAttribute('aria-label', favorite ? username + ' aus den Favoriten entfernen' : username + ' als Favorit markieren');
  button.title = favorite ? 'Aus den Lieblingsmitgliedern entfernen' : 'Als Lieblingsmitglied markieren';
}
async function toggleStandaloneMemberFavorite(user, button){
  const targetId = String(user && user.id || '').trim();
  if(!onlineAuthToken || !onlineAuthUser || !targetId || targetId === onlineAuthUser.id) return;
  const desired = !user.favorite;
  if(button) button.disabled = true;
  try{
    const data = await authApi('/api/members/' + encodeURIComponent(targetId) + '/favorite', {
      method:'POST',
      body:JSON.stringify({favorite:desired})
    });
    user.favorite = !!data.favorite;
    updateMemberFavoriteButton(button, user);
    const card = button && button.closest ? button.closest('.member-result-card') : null;
    if(card) card.classList.toggle('favorite', user.favorite);
    await refreshStandaloneMemberDirectory();
    setMembersStatus(
      (user.username || 'Das Mitglied') + (user.favorite ? ' wurde zu deinen Lieblingsmitgliedern hinzugefügt.' : ' wurde aus deinen Lieblingsmitgliedern entfernt.'),
      'success'
    );
  } catch(err){
    setMembersStatus(err && err.message ? err.message : 'Das Lieblingsmitglied konnte nicht gespeichert werden.', 'error');
  } finally {
    if(button) button.disabled = false;
  }
}
async function loadStandaloneMemberList(options){
  options = options || {};
  if(!onlineAuthToken || !onlineAuthUser){ closeMembersDialog(); openAuthDialog('login'); return; }
  const requestId = ++membersSearchRequestId;
  if(membersRefreshBtn) membersRefreshBtn.disabled = true;
  if(!options.silent) setMembersStatus('Mitgliederliste wird geladen…', '');
  try{
    const data = await authApi('/api/members/list?' + memberDirectoryParams(true).toString());
    if(requestId !== membersSearchRequestId) return;
    const users = data.users || [];
    renderStandaloneMemberResults(users, {source:'list', serverNow:data.serverNow});
    const sortLabel = membersSort === 'name' ? 'Name A–Z' : 'zuletzt aktiv';
    setMembersStatus(users.length ? (users.length + ' Mitglied' + (users.length === 1 ? '' : 'er') + ' · Filter: ' + currentMemberFilterLabel() + ' · Sortierung: ' + sortLabel + '.') : 'Keine Mitglieder für diese Auswahl gefunden.', users.length ? 'success' : '');
  } catch(err){
    if(requestId !== membersSearchRequestId) return;
    renderStandaloneMemberResults([], {source:'list'});
    setMembersStatus(err && err.message ? err.message : 'Mitgliederliste konnte nicht geladen werden.', 'error');
  } finally {
    if(membersRefreshBtn) membersRefreshBtn.disabled = false;
  }
}
async function performStandaloneMemberSearch(query, requestId){
  try{
    const params = memberDirectoryParams(false);
    params.set('q', query);
    const data = await authApi('/api/members/search?' + params.toString());
    if(requestId !== membersSearchRequestId) return;
    const users = data.users || [];
    renderStandaloneMemberResults(users, {source:'search', serverNow:data.serverNow});
    setMembersStatus(users.length ? (users.length + ' Treffer gefunden.') : 'Keine Treffer.', users.length ? 'success' : '');
  } catch(err){
    if(requestId !== membersSearchRequestId) return;
    renderStandaloneMemberResults([], {source:'search'});
    setMembersStatus(err && err.message ? err.message : 'Mitgliedersuche fehlgeschlagen.', 'error');
  }
}
function scheduleStandaloneMemberSearch(){
  if(membersSearchTimer) clearTimeout(membersSearchTimer);
  const query = membersSearchInput ? membersSearchInput.value.trim() : '';
  membersSearchRequestId++;
  if(query.length === 0){ loadStandaloneMemberList({silent:true}); return; }
  if(query.length < 2){
    if(membersResults) membersResults.innerHTML = '<div class="member-empty">Mindestens 2 Zeichen eingeben.</div>';
    setMembersStatus('Mindestens 2 Zeichen eingeben.', '');
    return;
  }
  setMembersStatus('Suche läuft…', '');
  const requestId = membersSearchRequestId;
  membersSearchTimer = setTimeout(() => performStandaloneMemberSearch(query, requestId), 260);
}
async function openMembersDialog(){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  if(membersSearchInput) membersSearchInput.value = '';
  updateMemberDirectoryControls();
  if(membersSearchHint){
    membersSearchHint.textContent = standaloneInvitationAvailable()
      ? 'Wähle ein Mitglied aus. Danach legst du die Partieeinstellungen und eine optionale persönliche Nachricht fest. Noch wird kein Spielraum erstellt.'
      : 'Du kannst die Mitglieder und ihren freigegebenen Aktivitätsstatus ansehen. Für eine neue Einladung kehrst du anschließend zur Mitglieder-Lobby zurück.';
  }
  if(membersBackdrop) membersBackdrop.hidden = false;
  await loadStandaloneMemberList();
  setTimeout(() => { try{ if(membersSearchInput) membersSearchInput.focus(); } catch(_){} }, 0);
}
async function inviteMemberFromStandaloneList(member, button){
  if(!memberRegistrationComplete(member)){
    setMembersStatus(memberRegistrationPendingMessage() + '. Einladungen sind erst nach der Mailbestätigung möglich.', 'error');
    return;
  }
  if(!standaloneInvitationAvailable()){
    setMembersStatus('Bitte zuerst über „Zur Lobby“ in die Mitglieder-Lobby zurückkehren und dort die neue Partie vorbereiten.', 'error');
    return;
  }
  openDirectInvitationSetup(member, button || null);
}
