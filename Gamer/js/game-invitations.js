'use strict';

function closeInviteDialog(){
  if(inviteBackdrop) inviteBackdrop.hidden = true;
}
function isCurrentUserAdmin(){
  const user = onlineAuthUser || {};
  return user.isAdmin === true;
}
function updateInviteDialog(){
  if(!inviteBackdrop) return;
  updateInviteColorUi();
  updateRatingPreferenceUi();
  const link = onlineRoomId ? getInviteUrl() : '';
  if(inviteLinkInput) inviteLinkInput.value = link;
  if(inviteCopyTextBtn) inviteCopyTextBtn.disabled = !link;
  if(inviteCopyLinkBtn) inviteCopyLinkBtn.disabled = !link;

  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  if(memberSearchInput) memberSearchInput.disabled = !loggedIn;
  if(memberListBtn){
    memberListBtn.disabled = !loggedIn;
    memberListBtn.textContent = 'Mitgliederliste öffnen';
    memberListBtn.title = loggedIn ? 'Registrierte Mitglieder anzeigen.' : 'Mitgliederliste ist nur nach Login verfügbar.';
  }
  if(memberSearchHint){
    memberSearchHint.textContent = loggedIn
      ? 'Suche nach Benutzername oder öffne die Mitgliederliste. Online-Mitglieder stehen zuerst; über die Schaltfläche wird die Einladung automatisch per E-Mail versendet.'
      : 'Mitgliedersuche und Mitgliederliste sind nur nach Login verfügbar. Als Gast kannst du den Link kopieren.';
  }
  if(!loggedIn){
    inviteSelectedMember = null;
    if(memberSearchStatus) memberSearchStatus.textContent = 'Bitte einloggen, um registrierte Mitglieder zu suchen.';
    if(memberSearchResults) memberSearchResults.innerHTML = '<div class="member-empty">Keine Suche aktiv.</div>';
  } else if(memberSearchInput && !memberSearchInput.value.trim() && memberSearchResults && !memberSearchResults.dataset.loadedList){
    if(memberSearchStatus) memberSearchStatus.textContent = 'Mindestens 2 Zeichen eingeben oder Mitgliederliste öffnen.';
    if(memberSearchResults) memberSearchResults.innerHTML = '<div class="member-empty">Noch keine Suche gestartet.</div>';
  }
}
function setInviteCopyStatus(message, isError){
  if(!inviteCopyStatus) return;
  inviteCopyStatus.style.color = isError ? '#9A2D33' : '#226b36';
  inviteCopyStatus.textContent = message || '';
}
async function copyTextToClipboard(text){
  if(!text) return false;
  try{
    await navigator.clipboard.writeText(text);
    return true;
  } catch(_){
    return false;
  }
}
async function copyInviteLinkFromDialog(){
  const link = onlineRoomId ? getInviteUrl() : '';
  if(!link){ setInviteCopyStatus('Noch kein Einladungslink vorhanden.', true); return; }
  const ok = await copyTextToClipboard(link);
  if(ok){
    onlineLastMessage = 'Einladungslink wurde kopiert.';
    statusEl.textContent = 'Einladungslink wurde kopiert.';
    setInviteCopyStatus('Einladungslink wurde kopiert.', false);
  } else {
    try{ if(inviteLinkInput){ inviteLinkInput.focus(); inviteLinkInput.select(); } } catch(_){}
    setInviteCopyStatus('Automatisches Kopieren nicht möglich. Bitte den markierten Link manuell kopieren.', true);
  }
  updateOnlineUi();
}
function buildInvitationText(member){
  const link = onlineRoomId ? getInviteUrl() : '';
  const recipientName = member && member.username ? cleanDisplayName(member.username) : '';
  const senderName = onlineAuthUser && onlineAuthUser.username ? cleanDisplayName(onlineAuthUser.username) : cleanDisplayName(onlineDisplayName || 'Gast');
  const greeting = recipientName ? ('Hallo ' + recipientName + ',') : 'Hallo,';
  const timeControl = onlineRoomTimeControl || currentTimeControlPayload();
  const setup = onlineRoomGameSetup || currentGameSetupPayload();
  const details = [];
  if(setup) details.push('Spielmodus: ' + (setup.variant === GAME_VARIANT_FREESTYLE ? ('Freestyle · Stellung #' + setup.positionId) : 'Klassisch'));
  if(timeControl && timeControl.label) details.push('Bedenkzeit: ' + timeControl.label);
  details.push('Wertung: ' + (effectiveRatedPreference() ? 'Gewertet' : 'Ungewertet'));
  if(timeControl && timeControl.mode === 'daily') details.push('Hinweis: Daily Chess erfordert auf beiden Seiten einen registrierten und eingeloggten Account.');
  const detailText = details.length ? ('\n\n' + details.join('\n')) : '';
  return greeting + '\n\n' +
    'du wurdest von ' + (senderName || 'Gast') + ' zu einer Schachpartie auf Hammerschach eingeladen.' + detailText + '\n\n' +
    'Klicke einfach auf folgenden Link:\n\n' +
    link + '\n\n' +
    'Viele Grüße\n' +
    (senderName || 'Gast');
}
async function copyInvitationText(member){
  const link = onlineRoomId ? getInviteUrl() : '';
  if(!link){ setInviteCopyStatus('Noch kein Einladungslink vorhanden.', true); return; }
  if(member) inviteSelectedMember = member;
  const text = buildInvitationText(member || inviteSelectedMember || null);
  const ok = await copyTextToClipboard(text);
  if(ok){
    const suffix = member && member.username ? (' für ' + member.username) : '';
    setInviteCopyStatus('Einladungstext' + suffix + ' wurde kopiert.', false);
    onlineLastMessage = 'Einladungstext wurde kopiert.';
    statusEl.textContent = 'Einladungstext wurde kopiert.';
  } else {
    setInviteCopyStatus('Automatisches Kopieren nicht möglich. Bitte den Link oben manuell kopieren.', true);
  }
  updateOnlineUi();
}

async function sendEmailInvitationToMember(member, button){
  const link = onlineRoomId ? getInviteUrl() : '';
  if(!onlineAuthToken || !onlineAuthUser){ setInviteCopyStatus('Bitte einloggen, um Mitglieder per Mail einzuladen.', true); return; }
  if(!link || !onlineRoomId){ setInviteCopyStatus('Noch kein Einladungslink vorhanden.', true); return; }
  if(!member || !member.id){ setInviteCopyStatus('Bitte ein Mitglied auswählen.', true); return; }
  if(invitationSendBusy){ setInviteCopyStatus('Eine Einladung wird bereits versendet.', true); return; }

  inviteSelectedMember = member;
  invitationSendBusy = true;
  const recipientName = member.username || 'Mitglied';
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Wird gesendet…'; }
  setInviteCopyStatus('Einladung an ' + recipientName + ' wird versendet…', false);
  if(memberSearchStatus) memberSearchStatus.textContent = 'Der Hammerschach-Gamer übergibt die Einladung sicher an den Mailserver…';

  try{
    const data = await authApi('/api/invitations/email', {
      method:'POST',
      body:JSON.stringify({roomId:onlineRoomId, recipientUserId:member.id})
    });
    const baseMessage = data && data.message ? data.message : ('Einladung an ' + recipientName + ' wurde versendet.');
    const message = baseMessage + ' Falls sie nicht im Posteingang erscheint, bitte auch den Spamordner prüfen.';
    setInviteCopyStatus(message, false);
    if(memberSearchStatus) memberSearchStatus.textContent = 'Automatischer Mailversand erfolgreich. Bitte gegebenenfalls auch den Spamordner kontrollieren.';
    onlineLastMessage = message;
    statusEl.textContent = message;
  } catch(err){
    const message = err && err.message ? err.message : 'Die Einladung konnte nicht versendet werden. Bitte den Einladungslink kopieren.';
    setInviteCopyStatus(message, true);
    if(memberSearchStatus) memberSearchStatus.textContent = 'Versand fehlgeschlagen. Link und Einladungstext können weiterhin kopiert werden.';
  } finally {
    invitationSendBusy = false;
    if(button){ button.disabled = false; button.textContent = oldText || 'Einladung senden'; }
    updateOnlineUi();
  }
}

function createPresenceBadge(isOnline){
  const badge = document.createElement('span');
  badge.className = 'presence-badge' + (isOnline ? ' online' : '');
  badge.title = isOnline
    ? 'Innerhalb der letzten rund zweieinhalb Minuten im Hammerschach-Gamer aktiv.'
    : 'Derzeit keine aktuelle Aktivität im Hammerschach-Gamer erkannt.';
  const dot = document.createElement('span');
  dot.className = 'presence-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = isOnline ? 'Online' : 'Offline';
  badge.appendChild(dot);
  badge.appendChild(label);
  return badge;
}

function renderMemberSearchResults(users, options){
  options = options || {};
  if(!memberSearchResults) return;
  memberSearchResults.dataset.loadedList = options.source === 'list' ? 'yes' : '';
  memberSearchResults.innerHTML = '';
  if(!users || users.length === 0){
    const empty = document.createElement('div');
    empty.className = 'member-empty';
    empty.textContent = options.source === 'list' ? 'Keine registrierten Mitglieder gefunden.' : 'Kein passendes Mitglied gefunden.';
    memberSearchResults.appendChild(empty);
    return;
  }
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
    meta.textContent = 'Profil, Ratings und aktueller Gamer-Online-Status';
    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'member-result-actions';

    const profileBtn = document.createElement('button');
    profileBtn.type = 'button';
    profileBtn.className = 'button-flat';
    profileBtn.textContent = '👤 Profil';
    profileBtn.title = 'Mitgliederprofil und Ratings anzeigen';
    profileBtn.addEventListener('click', ev => { ev.stopPropagation(); openMemberProfile(user, 'invite'); });
    actions.appendChild(profileBtn);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button-flat';
    btn.textContent = 'Einladung senden';
    btn.title = 'Partieeinladung automatisch an ' + (user.username || 'dieses Mitglied') + ' senden';
    btn.addEventListener('click', ev => { ev.stopPropagation(); sendEmailInvitationToMember(user, btn); });
    actions.appendChild(btn);

    main.appendChild(avatar);
    main.appendChild(info);
    card.appendChild(main);
    card.appendChild(actions);
    memberSearchResults.appendChild(card);
  });
}
async function loadMemberList(){
  if(!onlineAuthToken || !onlineAuthUser){ updateInviteDialog(); return; }
  inviteSelectedMember = null;
  if(memberSearchStatus) memberSearchStatus.textContent = 'Mitgliederliste wird geladen...';
  if(memberListBtn) memberListBtn.disabled = true;
  try{
    const data = await authApi('/api/members/list?limit=50');
    renderMemberSearchResults(data.users || [], {source:'list'});
    const count = (data.users || []).length;
    if(memberSearchStatus) memberSearchStatus.textContent = count ? (count + ' Mitglied' + (count === 1 ? '' : 'er') + ' geladen. Profil ansehen oder Einladung senden.') : 'Keine weiteren Mitglieder gefunden.';
  } catch(err){
    renderMemberSearchResults([], {source:'list'});
    if(memberSearchStatus) memberSearchStatus.textContent = err && err.message ? err.message : 'Mitgliederliste konnte nicht geladen werden.';
  } finally {
    if(memberListBtn) memberListBtn.disabled = false;
  }
}
async function performMemberSearch(query, requestId){
  try{
    const data = await authApi('/api/members/search?q=' + encodeURIComponent(query));
    if(requestId !== memberSearchRequestId) return;
    renderMemberSearchResults(data.users || [], {source:'search'});
    if(memberSearchStatus) memberSearchStatus.textContent = (data.users || []).length ? 'Mitglied anklicken, um die Einladung automatisch zu senden.' : 'Keine Treffer.';
  } catch(err){
    if(requestId !== memberSearchRequestId) return;
    renderMemberSearchResults([], {source:'search'});
    if(memberSearchStatus) memberSearchStatus.textContent = err && err.message ? err.message : 'Mitgliedersuche fehlgeschlagen.';
  }
}
function scheduleMemberSearch(){
  if(memberSearchTimer) clearTimeout(memberSearchTimer);
  inviteSelectedMember = null;
  const query = memberSearchInput ? memberSearchInput.value.trim() : '';
  if(memberSearchResults) memberSearchResults.dataset.loadedList = '';
  memberSearchRequestId++;
  if(!onlineAuthToken || !onlineAuthUser){ updateInviteDialog(); return; }
  if(query.length < 2){
    if(memberSearchStatus) memberSearchStatus.textContent = 'Mindestens 2 Zeichen eingeben.';
    if(memberSearchResults) memberSearchResults.innerHTML = '<div class="member-empty">Noch keine Suche gestartet.</div>';
    return;
  }
  if(memberSearchStatus) memberSearchStatus.textContent = 'Suche läuft...';
  const requestId = memberSearchRequestId;
  memberSearchTimer = setTimeout(() => performMemberSearch(query, requestId), 260);
}
function requireAccountForInvitationCreation(){
  if(onlineAuthToken && onlineAuthUser) return true;
  const message = 'Zum Erstellen einer Partie ist ein kostenloser Mitglieder-Account erforderlich. Ein eingeladener Gegner darf einer Live-Partie weiterhin als Gast per Link beitreten.';
  onlineLastMessage = message;
  if(statusEl) statusEl.textContent = message;
  openAuthDialog('login');
  return false;
}
async function openInviteDialogForCurrentOrNewRoom(){
  if(isOnlineGameLiveForUi()) return false;
  if(!requireAccountForInvitationCreation()) return false;
  if(!onlineRoomId){
    let roomFromUrl = '';
    try{ roomFromUrl = cleanRoomId(new URL(window.location.href).searchParams.get('room')); } catch(_){}
    if(roomFromUrl){
      connectOnlineRoom(roomFromUrl, {reconnect:true});
    } else {
      const created = await createNewOnlineRoom({copyLink:false, openOffer:false});
      if(!created) return false;
    }
  } else if(onlineRoomCancelled || onlineGameStarted || onlineGameEnded || gameEnded || timeLost){
    const created = await createNewOnlineRoom({copyLink:false, openOffer:false});
    if(!created) return false;
  }
  updateInviteDialog();
  if(inviteBackdrop) inviteBackdrop.hidden = false;
  setTimeout(() => {
    try{
      if(onlineAuthToken && onlineAuthUser && memberSearchInput) memberSearchInput.focus();
      else if(inviteCopyLinkBtn) inviteCopyLinkBtn.focus();
    } catch(_){}
  }, 0);
  return true;
}
