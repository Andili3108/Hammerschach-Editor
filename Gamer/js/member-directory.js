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
function setMemberProfileStatus(message, kind){
  if(!memberProfileStatus) return;
  memberProfileStatus.textContent = message || '';
  memberProfileStatus.classList.toggle('error', kind === 'error');
  memberProfileStatus.classList.toggle('success', kind === 'success');
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
  if(!memberProfileInviteBtn) return;
  const hasTarget = !!(memberProfileTarget && memberProfileTarget.id && onlineAuthUser && memberProfileTarget.id !== onlineAuthUser.id);
  memberProfileInviteBtn.hidden = !hasTarget;
  if(!hasTarget) return;
  if(memberProfileContext === 'invite'){
    memberProfileInviteBtn.textContent = '✉️ Einladung senden';
    memberProfileInviteBtn.disabled = !onlineRoomId;
    memberProfileInviteBtn.title = onlineRoomId ? 'Partieeinladung automatisch per E-Mail senden.' : 'Es ist kein Spielraum vorbereitet.';
  } else {
    const canInvite = standaloneInvitationAvailable();
    memberProfileInviteBtn.textContent = '✉️ Zur Partie einladen';
    memberProfileInviteBtn.disabled = !canInvite;
    memberProfileInviteBtn.title = canInvite
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
  if(memberProfilePresence){ memberProfilePresence.innerHTML = ''; memberProfilePresence.appendChild(createPresenceBadge(!!(user && user.isOnline))); }
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
      memberProfilePresence.appendChild(createPresenceBadge(!!member.isOnline));
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
    setMemberProfileStatus('', '');
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
  closeMemberProfileDialog();
  if(context === 'invite') openInvitationMessageDialog(target, null);
  else await inviteMemberFromStandaloneList(target, null);
}
if(memberProfileCloseBtn) memberProfileCloseBtn.addEventListener('click', closeMemberProfileDialog);
if(memberProfileEditBtn) memberProfileEditBtn.addEventListener('click', () => {
  closeMemberProfileDialog();
  openAccountEditDialog('profile');
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
    empty.textContent = options.source === 'search' ? 'Kein passendes Mitglied gefunden.' : 'Keine registrierten Mitglieder gefunden.';
    membersResults.appendChild(empty);
    return;
  }
  const canInvite = standaloneInvitationAvailable();
  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'member-result-card';

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
    name.appendChild(createPresenceBadge(!!user.isOnline));
    const meta = document.createElement('div');
    meta.className = 'member-result-meta';
    meta.textContent = canInvite
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
      const inviteBtn = document.createElement('button');
      inviteBtn.type = 'button';
      inviteBtn.className = 'button-flat';
      inviteBtn.textContent = 'Zur Partie einladen';
      inviteBtn.disabled = !canInvite;
      inviteBtn.title = canInvite
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
async function loadStandaloneMemberList(options){
  options = options || {};
  if(!onlineAuthToken || !onlineAuthUser){ closeMembersDialog(); openAuthDialog('login'); return; }
  if(membersRefreshBtn) membersRefreshBtn.disabled = true;
  if(!options.silent) setMembersStatus('Mitgliederliste wird geladen…', '');
  try{
    const data = await authApi('/api/members/list?limit=50');
    const users = data.users || [];
    renderStandaloneMemberResults(users, {source:'list'});
    setMembersStatus(users.length ? (users.length + ' Mitglied' + (users.length === 1 ? '' : 'er') + ' geladen.') : 'Keine weiteren Mitglieder gefunden.', users.length ? 'success' : '');
  } catch(err){
    renderStandaloneMemberResults([], {source:'list'});
    setMembersStatus(err && err.message ? err.message : 'Mitgliederliste konnte nicht geladen werden.', 'error');
  } finally {
    if(membersRefreshBtn) membersRefreshBtn.disabled = false;
  }
}
async function performStandaloneMemberSearch(query, requestId){
  try{
    const data = await authApi('/api/members/search?q=' + encodeURIComponent(query));
    if(requestId !== membersSearchRequestId) return;
    const users = data.users || [];
    renderStandaloneMemberResults(users, {source:'search'});
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
  if(membersSearchHint){
    membersSearchHint.textContent = standaloneInvitationAvailable()
      ? 'Wähle ein Mitglied aus. Danach legst du die Partieeinstellungen und eine optionale persönliche Nachricht fest. Noch wird kein Spielraum erstellt.'
      : 'Du kannst die Mitglieder und ihren Online-Status ansehen. Für eine neue Einladung kehrst du anschließend zur Mitglieder-Lobby zurück.';
  }
  if(membersBackdrop) membersBackdrop.hidden = false;
  await loadStandaloneMemberList();
  setTimeout(() => { try{ if(membersSearchInput) membersSearchInput.focus(); } catch(_){} }, 0);
}
async function inviteMemberFromStandaloneList(member, button){
  if(!standaloneInvitationAvailable()){
    setMembersStatus('Bitte zuerst über „Zur Lobby“ in die Mitglieder-Lobby zurückkehren und dort die neue Partie vorbereiten.', 'error');
    return;
  }
  openDirectInvitationSetup(member, button || null);
}
