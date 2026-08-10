'use strict';
function updateDirectInvitationMessageCount(){
  if(!directInvitationMessageCount) return;
  const length = directInvitationMessageInput ? directInvitationMessageInput.value.length : 0;
  directInvitationMessageCount.textContent = Math.min(length, INVITATION_PERSONAL_MESSAGE_MAX_LENGTH) + '/' + INVITATION_PERSONAL_MESSAGE_MAX_LENGTH;
}
function renderDirectInvitationRecipient(member){
  if(!directInvitationRecipient) return;
  directInvitationRecipient.innerHTML = '';
  if(!member){ directInvitationRecipient.hidden = true; return; }
  directInvitationRecipient.appendChild(createMemberAvatarElement(member, 'profile-avatar-small'));
  const copy = document.createElement('div');
  copy.className = 'direct-invitation-recipient-copy';
  const kicker = document.createElement('div');
  kicker.className = 'direct-invitation-recipient-kicker';
  kicker.textContent = 'Ausgewählter Empfänger';
  const name = document.createElement('div');
  name.className = 'direct-invitation-recipient-name';
  name.textContent = cleanDisplayName(member.username) || 'Mitglied';
  const meta = document.createElement('div');
  meta.className = 'direct-invitation-recipient-meta';
  meta.appendChild(createPresenceBadge(!!member.isOnline));
  const note = document.createElement('span');
  note.textContent = 'Die folgenden Einstellungen gelten nur für diese Einladung.';
  meta.appendChild(note);
  copy.appendChild(kicker);
  copy.appendChild(name);
  copy.appendChild(meta);
  directInvitationRecipient.appendChild(copy);
  directInvitationRecipient.hidden = false;
}
function resetDirectInvitationSetup(){
  directInvitationSetupMember = null;
  directInvitationSourceButton = null;
  directInvitationCreatedRoomId = '';
  directInvitationSendBusy = false;
  const modal = newGameBackdrop ? newGameBackdrop.querySelector('.new-game-modal') : null;
  if(modal) modal.classList.remove('direct-invitation-mode');
  if(newGameDialogTitle) newGameDialogTitle.textContent = '♟️ Neue Partie';
  if(newGameDialogIntro) newGameDialogIntro.textContent = 'Farbe, Spielmodus, Bedenkzeit und Wertung festlegen.';
  if(newGameCloseBtn) newGameCloseBtn.setAttribute('aria-label', 'Partievorbereitung schließen');
  if(directInvitationRecipient){ directInvitationRecipient.hidden = true; directInvitationRecipient.innerHTML = ''; }
  if(directInvitationMessageBox) directInvitationMessageBox.hidden = true;
  if(directInvitationMessageInput) directInvitationMessageInput.value = '';
  updateDirectInvitationMessageCount();
  if(directInvitationSendBtn){ directInvitationSendBtn.hidden = true; directInvitationSendBtn.disabled = false; directInvitationSendBtn.textContent = '✉️ Einladung senden'; }
  if(newGameBtn) newGameBtn.hidden = false;
  if(createOnlineBtn) createOnlineBtn.hidden = !!onlineRoomId;
  if(newGameCancelBtn) newGameCancelBtn.textContent = 'Abbrechen';
  if(typeof updateOnlineActionButtons === 'function') updateOnlineActionButtons();
}
function openDirectInvitationSetup(member, sourceButton){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  if(!member || !member.id){ setMembersStatus('Bitte ein Mitglied auswählen.', 'error'); return; }
  if(onlineAuthUser && String(member.id) === String(onlineAuthUser.id)){
    setMembersStatus('Du kannst deinen eigenen Account nicht einladen.', 'error');
    return;
  }
  if(!standaloneInvitationAvailable()){
    setMembersStatus('Eine neue Einladung kann nur aus der Mitglieder-Lobby vorbereitet werden.', 'error');
    return;
  }
  directInvitationSetupMember = Object.assign({}, member);
  directInvitationSourceButton = sourceButton || null;
  directInvitationCreatedRoomId = '';
  const recipientName = cleanDisplayName(member.username) || 'Mitglied';
  const modal = newGameBackdrop ? newGameBackdrop.querySelector('.new-game-modal') : null;
  if(modal) modal.classList.add('direct-invitation-mode');
  if(newGameDialogTitle) newGameDialogTitle.textContent = '✉️ Einladung an ' + recipientName;
  if(newGameDialogIntro) newGameDialogIntro.textContent = 'Partie einstellen, persönliche Nachricht ergänzen und anschließend endgültig senden.';
  if(newGameCloseBtn) newGameCloseBtn.setAttribute('aria-label', 'Einladungsvorbereitung abbrechen');
  renderDirectInvitationRecipient(member);
  if(directInvitationMessageBox) directInvitationMessageBox.hidden = false;
  if(directInvitationMessageInput) directInvitationMessageInput.value = '';
  updateDirectInvitationMessageCount();
  if(newGameBtn) newGameBtn.hidden = true;
  if(createOnlineBtn) createOnlineBtn.hidden = true;
  if(directInvitationSendBtn){ directInvitationSendBtn.hidden = false; directInvitationSendBtn.disabled = false; directInvitationSendBtn.textContent = '✉️ Einladung senden'; }
  if(newGameCancelBtn) newGameCancelBtn.textContent = 'Abbrechen';
  closeMemberProfileDialog();
  closeMembersDialog();
  openNewGameDialog({directInvitation:true, returnFocus:sourceButton || null});
}
function setDirectInvitationSetupBusy(busy){
  directInvitationSendBusy = !!busy;
  if(!newGameBackdrop) return;
  const controls = Array.from(newGameBackdrop.querySelectorAll('button,input,select,textarea'));
  controls.forEach(control => {
    if(busy){
      control.dataset.directInvitationWasDisabled = control.disabled ? 'yes' : 'no';
      control.disabled = true;
    } else {
      control.disabled = control.dataset.directInvitationWasDisabled === 'yes';
      delete control.dataset.directInvitationWasDisabled;
    }
  });
  if(!busy){
    updateTimeControlsLock();
    updateVariantUi();
    updateInviteColorUi();
    updateRatingPreferenceUi();
    updatePublicVisibilityUi();
  }
}
async function cancelPreparedInvitationRoom(roomId){
  roomId = cleanRoomId(roomId);
  if(!roomId) return {ok:true};
  return await authApi('/api/invitations/' + encodeURIComponent(roomId) + '/prepared', {method:'DELETE'});
}
async function cancelDirectInvitationSetup(){
  if(directInvitationSendBusy) return;
  const roomId = cleanRoomId(directInvitationCreatedRoomId || '');
  if(!roomId){ closeNewGameDialog({force:true}); return; }
  setDirectInvitationSetupBusy(true);
  if(directInvitationSendBtn) directInvitationSendBtn.textContent = 'Wird zurückgenommen…';
  setNewGameDialogStatus('Der vorbereitete Spielraum wird vollständig entfernt…');
  try{
    await cancelPreparedInvitationRoom(roomId);
    setDirectInvitationSetupBusy(false);
    if(roomId === onlineRoomId) applyRoomCancelled('Die nicht versendete Einladung wurde verworfen.');
    closeNewGameDialog({force:true, restoreFocus:false});
    openNewGameView();
  } catch(err){
    const message = err && err.message ? err.message : 'Der vorbereitete Spielraum konnte nicht entfernt werden.';
    setNewGameDialogStatus(message + ' Bitte erneut auf „Abbrechen“ klicken.');
    setDirectInvitationSetupBusy(false);
    if(directInvitationSendBtn) directInvitationSendBtn.textContent = '✉️ Einladung erneut senden';
  }
}
async function submitDirectInvitationSetup(){
  if(directInvitationSendBusy) return;
  const member = directInvitationSetupMember;
  if(!member || !member.id){ setNewGameDialogStatus('Bitte ein gültiges Mitglied auswählen.'); return; }
  const expectedTimeControl = currentTimeControlPayload();
  if(!timeMode || !expectedTimeControl){
    setNewGameDialogStatus('Bitte zuerst eine Bedenkzeit auswählen.');
    return;
  }
  if(isDailyTimeControl() && !onlineAuthUser){
    setNewGameDialogStatus('Daily Chess ist nur nach Registrierung oder Login verfügbar.');
    return;
  }
  const personalMessage = normalizedInvitationPersonalMessage(directInvitationMessageInput && directInvitationMessageInput.value);
  if(personalMessage.length > INVITATION_PERSONAL_MESSAGE_MAX_LENGTH){
    setNewGameDialogStatus('Die persönliche Nachricht darf höchstens 300 Zeichen lang sein.');
    return;
  }
  setDirectInvitationSetupBusy(true);
  if(directInvitationSendBtn) directInvitationSendBtn.textContent = directInvitationCreatedRoomId ? 'Wird erneut gesendet…' : 'Spielraum wird erstellt…';
  setNewGameDialogStatus(directInvitationCreatedRoomId ? 'Einladung wird erneut versendet…' : 'Spielraum wird jetzt erstellt und anschließend versendet…');
  try{
    if(!directInvitationCreatedRoomId){
      const created = await createNewOnlineRoom({copyLink:false, openOffer:false});
      if(!created || !onlineRoomId) throw new Error('Der Spielraum konnte nicht erstellt werden.');
      directInvitationCreatedRoomId = cleanRoomId(onlineRoomId);
    } else if(cleanRoomId(onlineRoomId) !== cleanRoomId(directInvitationCreatedRoomId)){
      throw new Error('Der vorbereitete Spielraum ist nicht mehr geöffnet.');
    }
    if(directInvitationSendBtn) directInvitationSendBtn.textContent = 'Einladung wird gesendet…';
    setNewGameDialogStatus('Spielraum bestätigt – Einladung wird sicher versendet…');
    const result = await sendEmailInvitationToMember(member, null, personalMessage, directInvitationSourceButton);
    if(!result || !result.ok) throw new Error(result && result.message ? result.message : 'Die Einladung konnte nicht versendet werden.');
    setNewGameDialogStatus('Einladung wurde versendet.');
    setDirectInvitationSetupBusy(false);
    closeNewGameDialog({force:true, restoreFocus:false});
  } catch(err){
    const message = err && err.message ? err.message : 'Die Einladung konnte nicht versendet werden.';
    setNewGameDialogStatus(message + (directInvitationCreatedRoomId ? ' Du kannst erneut senden oder den vorbereiteten Raum mit „Abbrechen“ vollständig entfernen.' : ''));
  } finally {
    if(newGameBackdrop && !newGameBackdrop.hidden){
      setDirectInvitationSetupBusy(false);
      if(directInvitationSendBtn) directInvitationSendBtn.textContent = directInvitationCreatedRoomId ? '✉️ Einladung erneut senden' : '✉️ Einladung senden';
    } else {
      directInvitationSendBusy = false;
    }
    updateOnlineUi();
  }
}
if(directInvitationMessageInput) directInvitationMessageInput.addEventListener('input', updateDirectInvitationMessageCount);
if(directInvitationSendBtn) directInvitationSendBtn.addEventListener('click', submitDirectInvitationSetup);

function updateInvitationMessageCount(){
  if(!invitationMessageCount) return;
  const length = invitationMessageInput ? invitationMessageInput.value.length : 0;
  invitationMessageCount.textContent = Math.min(length, INVITATION_PERSONAL_MESSAGE_MAX_LENGTH) + '/' + INVITATION_PERSONAL_MESSAGE_MAX_LENGTH;
}
function closeInvitationMessageDialog(force){
  if(invitationSendBusy && !force) return;
  if(invitationMessageBackdrop) invitationMessageBackdrop.hidden = true;
  pendingInvitationMember = null;
  pendingInvitationSourceButton = null;
  if(invitationMessageStatus) invitationMessageStatus.textContent = '';
}
function openInvitationMessageDialog(member, sourceButton){
  if(!onlineAuthToken || !onlineAuthUser){ setInviteCopyStatus('Bitte einloggen, um Mitglieder per Mail einzuladen.', true); return; }
  if(!member || !member.id){ setInviteCopyStatus('Bitte ein Mitglied auswählen.', true); return; }
  pendingInvitationMember = member;
  pendingInvitationSourceButton = sourceButton || null;
  const recipientName = cleanDisplayName(member.username) || 'das Mitglied';
  if(invitationMessageTitle) invitationMessageTitle.textContent = 'Einladung an ' + recipientName;
  if(invitationMessageIntro) invitationMessageIntro.textContent = 'Schreibe eine persönliche Nachricht – oder versende die Einladung ohne zusätzlichen Text.';
  if(invitationMessageInput) invitationMessageInput.value = '';
  if(invitationMessageStatus) invitationMessageStatus.textContent = '';
  updateInvitationMessageCount();
  if(invitationMessageBackdrop) invitationMessageBackdrop.hidden = false;
  setTimeout(() => { try{ if(invitationMessageInput) invitationMessageInput.focus(); } catch(_){} }, 0);
}
async function submitInvitationMessage(){
  if(invitationSendBusy) return;
  const member = pendingInvitationMember;
  if(!member){ closeInvitationMessageDialog(true); return; }
  const personalMessage = normalizedInvitationPersonalMessage(invitationMessageInput && invitationMessageInput.value);
  if(personalMessage.length > INVITATION_PERSONAL_MESSAGE_MAX_LENGTH){
    if(invitationMessageStatus) invitationMessageStatus.textContent = 'Die persönliche Nachricht darf höchstens 300 Zeichen lang sein.';
    return;
  }
  await sendEmailInvitationToMember(member, invitationMessageSendBtn, personalMessage, pendingInvitationSourceButton);
}

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

async function sendEmailInvitationToMember(member, button, personalMessage, sourceButton){
  const link = onlineRoomId ? getInviteUrl() : '';
  if(!onlineAuthToken || !onlineAuthUser){ const message='Bitte einloggen, um Mitglieder per Mail einzuladen.'; setInviteCopyStatus(message, true); return {ok:false,message}; }
  if(!link || !onlineRoomId){ const message='Noch kein Einladungslink vorhanden.'; setInviteCopyStatus(message, true); return {ok:false,message}; }
  if(!member || !member.id){ const message='Bitte ein Mitglied auswählen.'; setInviteCopyStatus(message, true); return {ok:false,message}; }
  if(invitationSendBusy){ const message='Eine Einladung wird bereits versendet.'; setInviteCopyStatus(message, true); return {ok:false,message}; }

  const normalizedPersonalMessage = normalizedInvitationPersonalMessage(personalMessage);
  const expectedTimeControl = currentTimeControlPayload();
  const expectedGameSetup = currentGameSetupPayload();
  if(!expectedTimeControl || !expectedGameSetup){
    const message = 'Bitte zuerst Bedenkzeit und Spielmodus vollständig auswählen.';
    if(invitationMessageStatus) invitationMessageStatus.textContent = message;
    return {ok:false,message};
  }
  const expectedMode = expectedTimeControl.mode === 'daily' ? 'daily' : 'live';
  if(normalizedPersonalMessage.length > INVITATION_PERSONAL_MESSAGE_MAX_LENGTH){
    const message = 'Die persönliche Nachricht darf höchstens 300 Zeichen lang sein.';
    if(invitationMessageStatus) invitationMessageStatus.textContent = message;
    return {ok:false,message};
  }

  inviteSelectedMember = member;
  invitationSendBusy = true;
  const recipientName = member.username || 'Mitglied';
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Wird gesendet…'; }
  if(sourceButton) sourceButton.disabled = true;
  setInviteCopyStatus('Einladung an ' + recipientName + ' wird versendet…', false);
  if(invitationMessageStatus) invitationMessageStatus.textContent = 'Einladung wird sicher versendet…';
  if(memberSearchStatus) memberSearchStatus.textContent = 'Der Hammerschach-Gamer übergibt die Einladung sicher an den Mailserver…';

  try{
    if(invitationMessageStatus) invitationMessageStatus.textContent = 'Bedenkzeit und Spielmodus werden vom Server bestätigt…';
    await waitForInvitationRoomReady(10000, expectedTimeControl, expectedGameSetup);
    const data = await authApi('/api/invitations/email', {
      method:'POST',
      body:JSON.stringify({roomId:onlineRoomId, recipientUserId:member.id, personalMessage:normalizedPersonalMessage, expectedMode})
    });
    const emailSent = !(data && data.emailSent === false);
    const baseMessage = data && data.message ? data.message : ('Einladung an ' + recipientName + ' wurde versendet.');
    const message = emailSent
      ? baseMessage + ' Falls sie nicht im Posteingang erscheint, bitte auch den Spamordner prüfen.'
      : baseMessage;
    setInviteCopyStatus(message, false);
    if(memberSearchStatus) memberSearchStatus.textContent = emailSent
      ? 'Automatischer Mailversand erfolgreich. Bitte gegebenenfalls auch den Spamordner kontrollieren.'
      : 'Die digitale Einladung wurde erfolgreich zugestellt; nur die zusätzliche E-Mail ist fehlgeschlagen.';
    onlineLastMessage = message;
    statusEl.textContent = message;
    closeInvitationMessageDialog(true);
    return {ok:true,data,message};
  } catch(err){
    const message = err && err.message ? err.message : 'Die Einladung konnte nicht versendet werden. Bitte den Einladungslink kopieren.';
    setInviteCopyStatus(message, true);
    if(invitationMessageStatus) invitationMessageStatus.textContent = message;
    if(memberSearchStatus) memberSearchStatus.textContent = 'Versand fehlgeschlagen. Link und Einladungstext können weiterhin kopiert werden.';
    return {ok:false,message};
  } finally {
    invitationSendBusy = false;
    if(button){ button.disabled = false; button.textContent = oldText || 'Einladung senden'; }
    if(sourceButton) sourceButton.disabled = false;
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
    btn.addEventListener('click', ev => { ev.stopPropagation(); openInvitationMessageDialog(user, btn); });
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
