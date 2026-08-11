'use strict';

let accountEditMode = '';
function setAccountEditStatus(message, kind){
  if(!accountEditStatus) return;
  accountEditStatus.textContent = message || '';
  accountEditStatus.classList.toggle('error', kind === 'error');
  accountEditStatus.classList.toggle('success', kind === 'success');
}
function updateAccountProfileAboutCount(){
  if(accountProfileAboutCount) accountProfileAboutCount.textContent = String(accountProfileAboutInput ? accountProfileAboutInput.value.length : 0) + ' / 400';
}
function renderAccountProfileAvatar(){
  if(!accountProfileAvatar) return;
  applyAvatarToElement(accountProfileAvatar, onlineAuthUser || {});
  const profile = onlineAuthUser && onlineAuthUser.profile && typeof onlineAuthUser.profile === 'object' ? onlineAuthUser.profile : {};
  const hasAvatar = !!profile.hasAvatar;
  if(accountProfileAvatarRemoveBtn){
    accountProfileAvatarRemoveBtn.disabled = !hasAvatar;
    accountProfileAvatarRemoveBtn.title = hasAvatar ? 'Gespeichertes Profilbild endgültig entfernen.' : 'Es ist kein Profilbild gespeichert.';
  }
}
function resetAccountProfileAvatarSelection(){
  if(accountProfileAvatarInput) accountProfileAvatarInput.value = '';
  if(accountProfileAvatarMeta) accountProfileAvatarMeta.textContent = 'Kein neues Bild ausgewählt.';
}
function updateAccountProfileAvatarSelection(){
  const file = accountProfileAvatarInput && accountProfileAvatarInput.files ? accountProfileAvatarInput.files[0] : null;
  if(!file){ resetAccountProfileAvatarSelection(); return; }
  if(accountProfileAvatarMeta) accountProfileAvatarMeta.textContent = file.name + ' · ' + formatAvatarFileSize(file.size) + ' · wird beim Speichern automatisch verarbeitet';
}
async function removeAccountProfileAvatar(){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  const profile = onlineAuthUser.profile && typeof onlineAuthUser.profile === 'object' ? onlineAuthUser.profile : {};
  if(!profile.hasAvatar) return;
  if(!window.confirm('Profilbild wirklich entfernen?')) return;
  if(accountProfileAvatarRemoveBtn) accountProfileAvatarRemoveBtn.disabled = true;
  setAccountEditStatus('Profilbild wird entfernt…', '');
  try{
    const data = await authApi('/api/account/avatar', {method:'DELETE', body:JSON.stringify({})});
    invalidateAvatarCacheForUser(onlineAuthUser.id);
    saveAuthState(onlineAuthToken, data.user);
    resetAccountProfileAvatarSelection();
    renderAccountProfileAvatar();
    setAccountEditStatus(data.message || 'Profilbild wurde entfernt.', 'success');
  }catch(err){
    setAccountEditStatus(err && err.message ? err.message : 'Profilbild konnte nicht entfernt werden.', 'error');
    renderAccountProfileAvatar();
  }
}
function clearAccountEditInputs(){
  [accountUsernamePasswordInput, accountEmailPasswordInput, accountCurrentPasswordInput, accountNewPasswordInput, accountNewPasswordRepeatInput, accountDeletePasswordInput, accountDeleteConfirmationInput].forEach(input => { if(input) input.value = ''; });
}
function openAccountEditDialog(mode){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  const isAdmin = onlineAuthUser.isAdmin === true;
  if(mode === 'username' && isAdmin){
    if(authError) authError.textContent = 'Der Benutzername des Administrator-Accounts ist geschützt.';
    return;
  }
  if(mode === 'delete' && isAdmin){
    if(authError) authError.textContent = 'Der Administrator-Account kann nicht selbst gelöscht werden.';
    return;
  }
  accountEditMode = ['profile','username','email','password','delete'].includes(mode) ? mode : '';
  if(!accountEditMode) return;
  if(authBackdrop) authBackdrop.hidden = true;
  if(accountProfileForm) accountProfileForm.hidden = accountEditMode !== 'profile';
  if(accountUsernameForm) accountUsernameForm.hidden = accountEditMode !== 'username';
  if(accountEmailForm) accountEmailForm.hidden = accountEditMode !== 'email';
  if(accountPasswordForm) accountPasswordForm.hidden = accountEditMode !== 'password';
  if(accountDeleteForm) accountDeleteForm.hidden = accountEditMode !== 'delete';
  clearAccountEditInputs();
  const publicProfile = onlineAuthUser && onlineAuthUser.profile && typeof onlineAuthUser.profile === 'object' ? onlineAuthUser.profile : {};
  resetAccountProfileAvatarSelection();
  renderAccountProfileAvatar();
  if(accountProfileRealNameInput) accountProfileRealNameInput.value = String(publicProfile.realName || '');
  if(accountProfileClubInput) accountProfileClubInput.value = String(publicProfile.clubName || '');
  const storedProfileDwz = publicProfile.dwz !== null && publicProfile.dwz !== undefined && String(publicProfile.dwz).trim() !== '' ? Number(publicProfile.dwz) : null;
  if(accountProfileDwzInput) accountProfileDwzInput.value = Number.isInteger(storedProfileDwz) ? String(storedProfileDwz) : '';
  if(accountProfileAboutInput) accountProfileAboutInput.value = String(publicProfile.about || '');
  if(accountProfileActivityCheckbox) accountProfileActivityCheckbox.checked = publicProfile.showActivityStatus !== false;
  updateAccountProfileAboutCount();
  if(accountUsernameInput) accountUsernameInput.value = onlineAuthUser.username || '';
  if(accountEmailInput) accountEmailInput.value = onlineAuthUser.email || '';
  if(accountEditSubmitBtn){
    accountEditSubmitBtn.disabled = false;
    accountEditSubmitBtn.classList.toggle('account-edit-submit-danger', accountEditMode === 'delete');
  }
  const config = {
    profile:{title:'Mein Mitgliederprofil bearbeiten', intro:'Profilbild, echter Name, Schachverein, DWZ und „Über mich“ sind freiwillig. Andere eingeloggte Mitglieder können diese Angaben in deinem Profil sehen.', submit:'Profil speichern', focus:accountProfileRealNameInput},
    username:{title:'Benutzernamen ändern', intro:'Der neue Benutzername muss eindeutig sein. Deine interne Benutzer-ID und deine Partien bleiben unverändert.', submit:'Benutzername speichern', focus:accountUsernameInput},
    email:{title:'Mailadresse ändern', intro:'Die neue Mailadresse darf noch keinem anderen Account zugeordnet sein. Sie wird erst nach Klick auf den zugesandten Bestätigungslink übernommen.', submit:'Mailadresse speichern', focus:accountEmailInput},
    password:{title:'Kennwort ändern', intro:'Nach der Änderung werden alle anderen Anmeldungen dieses Accounts beendet.', submit:'Kennwort speichern', focus:accountCurrentPasswordInput},
    delete:{title:'Account löschen', intro:'Prüfe die Hinweise sorgfältig. Dieser Vorgang kann nicht rückgängig gemacht werden.', submit:'Account endgültig löschen', focus:accountDeletePasswordInput}
  }[accountEditMode];
  if(accountEditTitle) accountEditTitle.textContent = config.title;
  if(accountEditIntro) accountEditIntro.textContent = config.intro;
  if(accountEditSubmitBtn) accountEditSubmitBtn.textContent = config.submit;
  setAccountEditStatus('', '');
  if(accountEditBackdrop) accountEditBackdrop.hidden = false;
  setTimeout(() => { try{ if(config.focus){ config.focus.focus(); if(accountEditMode !== 'password' && accountEditMode !== 'delete') config.focus.select(); } } catch(_){} }, 0);
}
function closeAccountEditDialog(reopenAccount){
  if(accountEditBackdrop) accountEditBackdrop.hidden = true;
  accountEditMode = '';
  setAccountEditStatus('', '');
  if(reopenAccount && onlineAuthToken && onlineAuthUser) openAuthDialog('login');
}
async function submitAccountEdit(){
  if(!onlineAuthToken || !onlineAuthUser){ closeAccountEditDialog(false); openAuthDialog('login'); return; }
  if(!accountEditMode || !accountEditSubmitBtn) return;
  accountEditSubmitBtn.disabled = true;
  setAccountEditStatus('Änderung wird geprüft…', '');
  try{
    let data = null;
    if(accountEditMode === 'profile'){
      const realName = String(accountProfileRealNameInput ? accountProfileRealNameInput.value : '').trim();
      const clubName = String(accountProfileClubInput ? accountProfileClubInput.value : '').trim();
      const dwzText = String(accountProfileDwzInput ? accountProfileDwzInput.value : '').trim();
      const about = String(accountProfileAboutInput ? accountProfileAboutInput.value : '').trim();
      const showActivityStatus = !accountProfileActivityCheckbox || accountProfileActivityCheckbox.checked;
      if(realName.length > 60) throw new Error('Der echte Name darf höchstens 60 Zeichen enthalten.');
      if(clubName.length > 80) throw new Error('Der Vereinsname darf höchstens 80 Zeichen enthalten.');
      if(about.length > 400) throw new Error('Der Text „Über mich“ darf höchstens 400 Zeichen enthalten.');
      if(dwzText){
        const dwz = Number(dwzText);
        if(!Number.isInteger(dwz) || dwz < 100 || dwz > 3500) throw new Error('Die DWZ muss eine ganze Zahl zwischen 100 und 3500 sein.');
      }
      const selectedAvatarFile = accountProfileAvatarInput && accountProfileAvatarInput.files ? accountProfileAvatarInput.files[0] : null;
      data = await authApi('/api/account/profile', {method:'POST', body:JSON.stringify({realName, clubName, dwz:dwzText || null, about, showActivityStatus})});
      saveAuthState(onlineAuthToken, data.user);
      if(selectedAvatarFile){
        setAccountEditStatus('Profilangaben sind gespeichert. Profilbild wird jetzt zugeschnitten und hochgeladen…', '');
        try{
          const avatarBlob = await prepareAvatarBlob(selectedAvatarFile);
          const avatarData = await uploadAccountAvatar(avatarBlob);
          invalidateAvatarCacheForUser(onlineAuthUser.id);
          saveAuthState(onlineAuthToken, avatarData.user);
          resetAccountProfileAvatarSelection();
          renderAccountProfileAvatar();
          data = avatarData;
          data.message = 'Profil und Profilbild wurden gespeichert.';
        }catch(avatarError){
          renderAccountProfileAvatar();
          throw new Error('Die Profilangaben wurden gespeichert, das Profilbild jedoch nicht: ' + (avatarError && avatarError.message ? avatarError.message : 'Upload fehlgeschlagen.'));
        }
      }
    } else if(accountEditMode === 'username'){
      const username = String(accountUsernameInput ? accountUsernameInput.value : '').trim();
      const currentPassword = String(accountUsernamePasswordInput ? accountUsernamePasswordInput.value : '');
      if(!/^[A-Za-z0-9_-]{3,24}$/.test(username)) throw new Error('Benutzername: 3 bis 24 Zeichen, erlaubt sind Buchstaben, Zahlen, _ und -.');
      if(!currentPassword) throw new Error('Bitte das aktuelle Kennwort eingeben.');
      data = await authApi('/api/account/username', {method:'POST', body:JSON.stringify({username, currentPassword})});
      saveAuthState(onlineAuthToken, data.user);
      applyLoggedInUserToOnlineRoom();
    } else if(accountEditMode === 'email'){
      const email = String(accountEmailInput ? accountEmailInput.value : '').trim();
      const currentPassword = String(accountEmailPasswordInput ? accountEmailPasswordInput.value : '');
      if(!email || !email.includes('@')) throw new Error('Bitte eine gültige Mailadresse eingeben.');
      if(!currentPassword) throw new Error('Bitte das aktuelle Kennwort eingeben.');
      data = await authApi('/api/account/email', {method:'POST', body:JSON.stringify({email, currentPassword})});
      saveAuthState(onlineAuthToken, data.user);
    } else if(accountEditMode === 'password'){
      const currentPassword = String(accountCurrentPasswordInput ? accountCurrentPasswordInput.value : '');
      const newPassword = String(accountNewPasswordInput ? accountNewPasswordInput.value : '');
      const repeat = String(accountNewPasswordRepeatInput ? accountNewPasswordRepeatInput.value : '');
      if(!currentPassword) throw new Error('Bitte das aktuelle Kennwort eingeben.');
      if(newPassword.length < 8 || newPassword.length > 128) throw new Error('Das neue Kennwort muss 8 bis 128 Zeichen haben.');
      if(newPassword !== repeat) throw new Error('Die neuen Kennwörter stimmen nicht überein.');
      data = await authApi('/api/account/password', {method:'POST', body:JSON.stringify({currentPassword, newPassword})});
      saveAuthState(onlineAuthToken, data.user);
    } else if(accountEditMode === 'delete'){
      const currentPassword = String(accountDeletePasswordInput ? accountDeletePasswordInput.value : '');
      const confirmation = String(accountDeleteConfirmationInput ? accountDeleteConfirmationInput.value : '').trim();
      if(!currentPassword) throw new Error('Bitte das aktuelle Kennwort eingeben.');
      if(confirmation.toUpperCase() !== 'LÖSCHEN') throw new Error('Bitte zur Bestätigung LÖSCHEN eingeben.');
      if(!window.confirm('Account wirklich endgültig löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.')){
        setAccountEditStatus('Löschen wurde abgebrochen.', '');
        return;
      }
      data = await authApi('/api/account', {method:'DELETE', body:JSON.stringify({currentPassword, confirmation})});
      const cancelled = Number(data.cancelledInvitations || 0);
      const anonymized = Number(data.anonymizedRooms || 0);
      const removedGlobalChatMessages = Number(data.removedGlobalChatMessages || 0);
      saveAuthState('', null);
      closeAccountEditDialog(false);
      closeAuthDialog();
      const details = [];
      if(cancelled) details.push(cancelled + ' offene Einladung' + (cancelled === 1 ? '' : 'en') + ' zurückgezogen');
      if(anonymized) details.push(anonymized + ' ältere' + (anonymized === 1 ? 'r Spielraum' : ' Spielräume') + ' anonymisiert');
      if(removedGlobalChatMessages) details.push(removedGlobalChatMessages + ' Global-Chat-Nachricht' + (removedGlobalChatMessages === 1 ? '' : 'en') + ' entfernt');
      if(statusEl) statusEl.textContent = 'Account wurde gelöscht' + (details.length ? ' · ' + details.join(' · ') + '.' : '.');
      return;
    }
    setAccountEditStatus((data && data.message) || 'Änderung wurde gespeichert.', 'success');
    setTimeout(() => { closeAccountEditDialog(false); openAuthDialog('login'); }, 550);
  } catch(err){
    setAccountEditStatus(err && err.message ? err.message : 'Änderung fehlgeschlagen.', 'error');
  } finally {
    if(accountEditSubmitBtn) accountEditSubmitBtn.disabled = false;
  }
}

