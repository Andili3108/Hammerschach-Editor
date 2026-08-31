'use strict';

function openAuthDialog(mode){
  authMode = mode === 'register' ? 'register' : 'login';
  updateAuthUi();
  if(onlineAuthToken && onlineAuthUser) refreshAuthSession();
  if(authBackdrop) authBackdrop.hidden = false;
  setTimeout(() => {
    try{
      if(onlineAuthUser){
        const modal = authBackdrop ? authBackdrop.querySelector('.identity-modal') : null;
        if(modal) modal.scrollTop = 0;
        if(authCancelBtn) authCancelBtn.focus({preventScroll:true});
      } else {
        const first = authMode === 'login' ? loginIdentifierInput : registerUsernameInput;
        if(first) first.focus();
      }
    } catch(_){}
  }, 0);
}
function closeAuthDialog(){ if(authBackdrop) authBackdrop.hidden = true; }
function setAuthMode(mode){ authMode = mode === 'register' ? 'register' : 'login'; updateAuthUi(); }

function normalizeClientRating(value, key, label){
  const source = value && typeof value === 'object' ? value : {};
  const rating = Number.isFinite(Number(source.rating)) ? Math.round(Number(source.rating)) : 1500;
  const deviation = Number.isFinite(Number(source.deviation)) ? Number(source.deviation) : 350;
  const games = Math.max(0, Math.floor(Number(source.games || 0)));
  const provisional = typeof source.provisional === 'boolean' ? source.provisional : deviation > RATING_PROVISIONAL_DEVIATION;
  return {
    key:key || source.key || '',
    label:label || source.label || '',
    rating,
    deviation,
    games,
    wins:Math.max(0, Math.floor(Number(source.wins || 0))),
    draws:Math.max(0, Math.floor(Number(source.draws || 0))),
    losses:Math.max(0, Math.floor(Number(source.losses || 0))),
    provisional,
    display:String(source.display || (String(rating) + (provisional ? '?' : '')))
  };
}
function renderAccountRatings(){
  if(!authRatingsGrid) return;
  authRatingsGrid.innerHTML = '';
  const ratings = onlineAuthUser && onlineAuthUser.ratings && typeof onlineAuthUser.ratings === 'object' ? onlineAuthUser.ratings : {};
  const frag = document.createDocumentFragment();
  RATING_TYPE_ORDER.forEach(info => {
    const rating = normalizeClientRating(ratings[info.key], info.key, info.label);
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
  authRatingsGrid.appendChild(frag);
}

function normalizeClientEmailNotifications(value){
  const source = value && typeof value === 'object' ? value : {};
  const enabled = (camel, snake, fallback) => {
    const raw = source[camel] !== undefined ? source[camel] : source[snake];
    if(raw === undefined || raw === null) return fallback;
    return !(raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false');
  };
  return {
    dailyTurnEnabled:enabled('dailyTurnEnabled', 'daily_turn_enabled', true),
    dailyResultEnabled:enabled('dailyResultEnabled', 'daily_result_enabled', true),
    memberNewsEnabled:enabled('memberNewsEnabled', 'member_news_enabled', false),
    tournamentEnabled:enabled('tournamentEnabled', 'tournament_enabled', true)
  };
}
function setEmailNotificationsStatus(message, kind){
  if(!emailNotificationsStatus) return;
  emailNotificationsStatus.textContent = message || '';
  emailNotificationsStatus.classList.toggle('error', kind === 'error');
  emailNotificationsStatus.classList.toggle('success', kind === 'success');
}
function renderEmailNotificationSettings(){
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  const preferences = normalizeClientEmailNotifications(onlineAuthUser && onlineAuthUser.emailNotifications);
  if(authEmailNotifications) authEmailNotifications.hidden = !loggedIn;
  if(dailyTurnEmailCheckbox){ dailyTurnEmailCheckbox.checked = preferences.dailyTurnEnabled; dailyTurnEmailCheckbox.disabled = !loggedIn; }
  if(dailyResultEmailCheckbox){ dailyResultEmailCheckbox.checked = preferences.dailyResultEnabled; dailyResultEmailCheckbox.disabled = !loggedIn; }
  if(memberNewsEmailCheckbox){ memberNewsEmailCheckbox.checked = preferences.memberNewsEnabled; memberNewsEmailCheckbox.disabled = !loggedIn; }
  if(tournamentEmailCheckbox){ tournamentEmailCheckbox.checked = preferences.tournamentEnabled; tournamentEmailCheckbox.disabled = !loggedIn; }
  if(emailNotificationsSaveBtn) emailNotificationsSaveBtn.disabled = !loggedIn;
  if(!loggedIn) setEmailNotificationsStatus('', '');
}
async function saveEmailNotificationSettings(){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  if(!emailNotificationsSaveBtn) return;
  emailNotificationsSaveBtn.disabled = true;
  setEmailNotificationsStatus('Einstellungen werden gespeichert…', '');
  try{
    const data = await authApi('/api/account/notifications', {
      method:'POST',
      body:JSON.stringify({
        dailyTurnEnabled:!!(dailyTurnEmailCheckbox && dailyTurnEmailCheckbox.checked),
        dailyResultEnabled:!!(dailyResultEmailCheckbox && dailyResultEmailCheckbox.checked),
        memberNewsEnabled:!!(memberNewsEmailCheckbox && memberNewsEmailCheckbox.checked),
        tournamentEnabled:!!(tournamentEmailCheckbox && tournamentEmailCheckbox.checked)
      })
    });
    saveAuthState(onlineAuthToken, data.user);
    setEmailNotificationsStatus(data.message || 'Einstellungen wurden gespeichert.', 'success');
  } catch(err){
    setEmailNotificationsStatus(err && err.message ? err.message : 'Einstellungen konnten nicht gespeichert werden.', 'error');
  } finally {
    if(emailNotificationsSaveBtn) emailNotificationsSaveBtn.disabled = false;
  }
}

function hasOnlineTargetInAddress(){
  try{
    const params = new URLSearchParams(window.location.search || '');
    return !!(String(params.get('room') || '').trim() || String(params.get('watch') || '').trim());
  } catch(_){
    return false;
  }
}
function isAnonymousVisitorStartView(){
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  return !loggedIn && !onlineRoomId && !hasOnlineTargetInAddress();
}
function updateVisitorLandingUi(){
  const active = isAnonymousVisitorStartView();
  const visitorHeaderActive = !(onlineAuthToken && onlineAuthUser);
  document.documentElement.classList.toggle('visitor-start-view', active);
  document.documentElement.classList.toggle('visitor-header-view', visitorHeaderActive);
  if(visitorBoardOverlay) visitorBoardOverlay.hidden = !active;
  if(visitorLearningOpenBtn) visitorLearningOpenBtn.hidden = !visitorHeaderActive;
  if(visitorTrainerOpenBtn) visitorTrainerOpenBtn.hidden = !visitorHeaderActive;
  if(visitorTrainerProgressHeaderBtn) visitorTrainerProgressHeaderBtn.hidden = !visitorHeaderActive || !trainerToolActive;
  if(visitorMattbilderOpenBtn) visitorMattbilderOpenBtn.hidden = !visitorHeaderActive;
  if(visitorPublicGamesOpenBtn) visitorPublicGamesOpenBtn.hidden = !visitorHeaderActive;
  updateAnalyzerToolAvailability();

  /* Für anonyme Besucher bleibt dieselbe reduzierte Navigation auch in einem
     Zuschauer-Spielraum erhalten. Nach dem Login kehrt das Info-Menü an seinen
     normalen Platz neben dem Status zurück. */
  if(infoMenuEl && matchActionsEl && infoMenuHome){
    if(visitorHeaderActive){
      const visitorInfoAnchor = toolsMenuEl && toolsMenuEl.parentNode === matchActionsEl ? toolsMenuEl : null;
      if(infoMenuEl.parentNode !== matchActionsEl || infoMenuEl.nextSibling !== visitorInfoAnchor){
        matchActionsEl.insertBefore(infoMenuEl, visitorInfoAnchor);
      }
    } else if(infoMenuEl.parentNode !== infoMenuHome.parent){
      infoMenuHome.parent.insertBefore(infoMenuEl, infoMenuHome.nextSibling);
    }
  }

  if(active && statusEl){
    statusEl.textContent = embeddedToolStatusText() || 'Bitte melde dich an, um eine Partie anzubieten oder jemanden einzuladen.';
  }
  updateMemberLobbyUi();
  hammerschachScheduleHeightReport(false);
}

if(visitorLearningOpenBtn){
  visitorLearningOpenBtn.addEventListener('click', () => {
    if(learningToolBtn && !learningToolBtn.disabled) learningToolBtn.click();
  });
}
if(visitorTrainerOpenBtn){
  visitorTrainerOpenBtn.addEventListener('click', () => {
    pendingTrainerStartMode='coach';
    try{sessionStorage.setItem('hammerschachTrainerRequestedMode','coach');}catch(_){ }
    if(trainerToolBtn && !trainerToolBtn.disabled) trainerToolBtn.click();
  });
}
if(visitorTrainerProgressHeaderBtn){
  visitorTrainerProgressHeaderBtn.addEventListener('click', () => {
    postTrainerToolMessage({type:'hammerschach-trainer-open-progress'});
  });
}
if(visitorMattbilderOpenBtn){
  visitorMattbilderOpenBtn.addEventListener('click', () => {
    if(mateSchoolToolBtn && !mateSchoolToolBtn.disabled) mateSchoolToolBtn.click();
  });
}
if(visitorPublicGamesOpenBtn){
  visitorPublicGamesOpenBtn.addEventListener('click', () => {
    if(publicGamesOpenBtn && !publicGamesOpenBtn.disabled) publicGamesOpenBtn.click();
  });
}

function hasTournamentViewerAccess(){
  return !!(onlineAuthToken && onlineAuthUser);
}
function updateAuthUi(){
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  const isAdmin = !!(loggedIn && onlineAuthUser.isAdmin === true);
  const canViewTournaments = loggedIn;
  const accountName = loggedIn ? (onlineAuthUser.username || 'aktiv') : '';
  if(authOpenBtn){
    authOpenBtn.hidden = loggedIn;
    authOpenBtn.textContent = '👤 Registrierung / Login';
    authOpenBtn.title = 'Registrierung oder Login öffnen';
  }
  if(playerMenuEl){
    playerMenuEl.hidden = !loggedIn;
    if(!loggedIn) closePlayerMenu();
  }
  if(profileOpenBtn){
    profileOpenBtn.hidden = !loggedIn;
    profileOpenBtn.disabled = !loggedIn;
    profileOpenBtn.title = loggedIn ? 'Angemeldet als ' + accountName + ' — Accountverwaltung und Logout öffnen.' : '';
  }
  if(tournamentsOpenBtn){
    tournamentsOpenBtn.setAttribute('aria-disabled', canViewTournaments ? 'false' : 'true');
    tournamentsOpenBtn.tabIndex = canViewTournaments ? 0 : -1;
    tournamentsOpenBtn.title = canViewTournaments ? 'Turnierbereich öffnen.' : '';
  }
  if(tournamentDraftsTab) tournamentDraftsTab.hidden = !isAdmin;
  if(tournamentCreateOpenBtn) tournamentCreateOpenBtn.hidden = !isAdmin;
  if(!canViewTournaments){
    if(tournamentCreateBackdrop) tournamentCreateBackdrop.hidden = true;
    if(tournamentBackdrop) tournamentBackdrop.hidden = true;
  }
  if(membersOpenBtn){
    membersOpenBtn.hidden = !loggedIn;
    membersOpenBtn.disabled = !loggedIn;
    membersOpenBtn.title = loggedIn ? 'Registrierte Mitglieder und Online-Status anzeigen.' : 'Mitgliederliste ist nur nach Login verfügbar.';
  }
  if(!loggedIn && membersBackdrop && !membersBackdrop.hidden) closeMembersDialog();
  if(dailyGamesOpenBtn){
    dailyGamesOpenBtn.disabled = false;
    dailyGamesOpenBtn.title = loggedIn ? 'Laufende Daily-Partien anzeigen.' : 'Für „Meine Partien“ bitte einloggen.';
  }
  if(tournamentGamesOpenBtn){
    tournamentGamesOpenBtn.disabled = !loggedIn;
    tournamentGamesOpenBtn.title = loggedIn ? 'Eigene Turnierpartien filtern.' : 'Für Turnierpartien bitte einloggen.';
  }
  if(!loggedIn && dailyGamesTurnCount){ dailyGamesTurnCount.hidden = true; dailyGamesTurnCount.textContent = '0'; }
  if(!loggedIn && tournamentGamesCount) tournamentGamesCount.hidden = true;
  if(authIntro){
    authIntro.textContent = loggedIn ? 'Hier kannst du deine Accountdaten verwalten oder dich ausloggen.' : 'Melde dich an, damit dein Accountname automatisch in Online-Partien angezeigt wird.';
  }
  if(authLoggedOut) authLoggedOut.hidden = loggedIn;
  if(authLoggedIn) authLoggedIn.hidden = !loggedIn;
  if(authLogoutBtn) authLogoutBtn.hidden = !loggedIn;
  if(authSubmitBtn) authSubmitBtn.hidden = loggedIn;
  if(authSubmitBtn) authSubmitBtn.textContent = authMode === 'register' ? 'Registrieren' : 'Einloggen';
  if(authLoginTab) authLoginTab.classList.toggle('active', authMode === 'login');
  if(authRegisterTab) authRegisterTab.classList.toggle('active', authMode === 'register');
  if(authLoginForm) authLoginForm.hidden = loggedIn || authMode !== 'login';
  if(authRegisterForm) authRegisterForm.hidden = loggedIn || authMode !== 'register';
  if(authAccountName) authAccountName.textContent = loggedIn ? (onlineAuthUser.username || '—') : '—';
  if(authAccountEmail) authAccountEmail.textContent = loggedIn ? (onlineAuthUser.email || '—') : '—';
  const emailVerified = !loggedIn || onlineAuthUser.emailVerified !== false;
  const pendingEmail = loggedIn ? String(onlineAuthUser.pendingEmail || '') : '';
  if(authEmailState) authEmailState.hidden = !loggedIn;
  if(authEmailStateBadge){
    authEmailStateBadge.classList.toggle('verified', emailVerified);
    authEmailStateBadge.classList.toggle('pending', !emailVerified || !!pendingEmail);
    authEmailStateBadge.textContent = emailVerified ? '✓ Mailadresse bestätigt' : '⚠ Bestätigung ausstehend';
  }
  if(authPendingEmailText){
    authPendingEmailText.hidden = !pendingEmail;
    authPendingEmailText.textContent = pendingEmail ? ('Neue Adresse wartet auf Bestätigung: ' + pendingEmail) : '';
  }
  if(resendPendingEmailBtn) resendPendingEmailBtn.hidden = !pendingEmail;
  renderAccountRatings();
  renderEmailNotificationSettings();
  if(accountProfileOpenBtn){
    accountProfileOpenBtn.disabled = !loggedIn;
    accountProfileOpenBtn.title = 'Freiwilliges Profilbild, echten Namen, Schachverein, DWZ und „Über mich“ bearbeiten.';
  }
  if(accountProfilePreviewBtn){
    accountProfilePreviewBtn.disabled = !loggedIn;
    accountProfilePreviewBtn.title = 'Das eigene Profil genau so anzeigen, wie es andere Mitglieder sehen.';
  }
  if(accountUsernameOpenBtn){
    accountUsernameOpenBtn.disabled = !loggedIn || isAdmin;
    accountUsernameOpenBtn.title = isAdmin ? 'Der Benutzername des Administrator-Accounts ist geschützt.' : 'Eigenen Benutzernamen ändern.';
  }
  if(accountEmailOpenBtn) accountEmailOpenBtn.disabled = !loggedIn;
  if(accountPasswordOpenBtn) accountPasswordOpenBtn.disabled = !loggedIn;
  if(accountDeleteOpenBtn){
    accountDeleteOpenBtn.disabled = !loggedIn || isAdmin;
    accountDeleteOpenBtn.title = isAdmin ? 'Der Administrator-Account kann nicht selbst gelöscht werden.' : 'Eigenen Account endgültig löschen.';
  }
  if(adminOverviewOpenBtn){
    adminOverviewOpenBtn.hidden = !isAdmin;
    adminOverviewOpenBtn.disabled = !isAdmin;
  }
  if(!isAdmin && adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(!isAdmin && adminTickerBackdrop) adminTickerBackdrop.hidden = true;
  if(!isAdmin && adminMessageBackdrop) adminMessageBackdrop.hidden = true;
  if(!isAdmin && adminDeleteMembersBackdrop) adminDeleteMembersBackdrop.hidden = true;
  if(!isAdmin && adminDeleteConfirmBackdrop) adminDeleteConfirmBackdrop.hidden = true;
  if(!isAdmin){
    adminDeleteMembers = [];
    adminDeleteTargetUser = null;
    adminDeleteBusy = false;
    if(adminDeletePasswordInput) adminDeletePasswordInput.value = '';
  }
  if(authAccountProtectionNote){
    authAccountProtectionNote.hidden = !isAdmin;
    authAccountProtectionNote.textContent = isAdmin ? 'Admin-Schutz: Benutzername und Selbstlöschung sind für diesen Account gesperrt. Mailadresse und Kennwort können geändert werden.' : '';
  }
  if(!loggedIn && accountEditBackdrop) accountEditBackdrop.hidden = true;
  if(authError){ authError.textContent = ''; authError.style.color = '#9A2D33'; }
  updatePublicVisibilityUi();
  updateVisitorLandingUi();
}
function applyLoggedInUserToOnlineRoom(){
  if(!onlineAuthUser) return;
  onlineDisplayName = cleanDisplayName(onlineAuthUser.username) || onlineDisplayName;
  if(onlineRoomId && onlineRoleCode === 'spectator'){
    const roomId = onlineRoomId;
    onlineLastMessage = 'Account erkannt. Spielerplatz wird erneut geprüft.';
    closeOnlineSocket();
    connectOnlineRoom(roomId, {reconnect:true});
    return;
  }
  if(onlineRoomId && onlineConnected){
    sendOnlineMessage({type:'set_player_name', displayName: onlineDisplayName, authToken: onlineAuthToken});
    onlineLastMessage = 'Accountname wurde für die Lobby übernommen.';
    updateOnlineUi();
  }
}
async function refreshAuthSession(){
  if(!onlineAuthToken){ updateAuthUi(); return; }
  try{
    const data = await authApi('/api/me');
    saveAuthState(onlineAuthToken, data.user);
  } catch(_){
    saveAuthState('', null);
  }
}
async function submitAuthDialog(){
  if(!authError || !authSubmitBtn) return;
  authError.textContent = '';
  authError.style.color = '#9A2D33';
  authSubmitBtn.disabled = true;
  try{
    let payload;
    if(authMode === 'register'){
      const username = cleanDisplayName(registerUsernameInput ? registerUsernameInput.value : '');
      const email = String(registerEmailInput ? registerEmailInput.value : '').trim();
      const password = String(registerPasswordInput ? registerPasswordInput.value : '');
      const passwordRepeat = String(registerPasswordRepeatInput ? registerPasswordRepeatInput.value : '');
      if(password.length < 8 || password.length > 128) throw new Error('Das Kennwort muss 8 bis 128 Zeichen haben.');
      if(password !== passwordRepeat) throw new Error('Die Kennwörter stimmen nicht überein.');
      payload = {username, email, password};
      const data = await authApi('/api/register', {method:'POST', body:JSON.stringify(payload)});
      saveAuthState('', null);
      setAuthMode('login');
      if(authError){
        authError.style.color = '#226b36';
        authError.textContent = data.message || 'Account wurde angelegt. Bitte Mailadresse bestätigen.';
      }
      if(loginIdentifierInput) loginIdentifierInput.value = email || username;
      return;
    } else {
      const identifier = String(loginIdentifierInput ? loginIdentifierInput.value : '').trim();
      const password = String(loginPasswordInput ? loginPasswordInput.value : '');
      payload = {identifier, password};
      const data = await authApi('/api/login', {method:'POST', body:JSON.stringify(payload)});
      saveAuthState(data.sessionToken, data.user);
    }
    applyLoggedInUserToOnlineRoom();
    closeAuthDialog();
  } catch(err){
    authError.textContent = err && err.message ? err.message : 'Anmeldung fehlgeschlagen.';
  } finally {
    authSubmitBtn.disabled = false;
  }
}
async function logoutAuth(){
  const oldToken = onlineAuthToken;
  const roomToReopen = onlineRoomId;
  const hadRoomConnection = !!(roomToReopen && onlineSocket);
  try{ if(oldToken) await sendPresenceHeartbeat(true, false); } catch(_){}
  try{ if(oldToken) await authApi('/api/logout', {method:'POST', body:JSON.stringify({})}); } catch(_){}

  // Vor dem Wechsel zur Gastidentität die accountgebundene Verbindung schließen.
  // Andernfalls könnte der alte Gastname denselben Spielerplatz umbenennen.
  if(hadRoomConnection) closeOnlineSocket();
  saveAuthState('', null);
  clearSeatCredentials(roomToReopen);
  closeAuthDialog();

  if(roomToReopen){
    onlineLastMessage = 'Logout abgeschlossen. Der Raum wird als Zuschauer neu verbunden.';
    connectOnlineRoom(roomToReopen, {reconnect:true});
  }
}

function hasTournamentAdminAccess(){
  return !!(onlineAuthToken && onlineAuthUser && onlineAuthUser.isAdmin === true);
}
