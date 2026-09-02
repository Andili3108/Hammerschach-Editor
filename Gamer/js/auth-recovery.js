'use strict';

let authRecoveryMode = 'password-request';
let authRecoveryToken = '';
function setAuthRecoveryStatus(message, kind){
  if(!authRecoveryStatus) return;
  authRecoveryStatus.textContent = message || '';
  authRecoveryStatus.classList.toggle('error', kind === 'error');
  authRecoveryStatus.classList.toggle('success', kind === 'success');
}
function openAuthRecoveryDialog(mode, token){
  authRecoveryMode = mode || 'password-request';
  const emailCorrection = authRecoveryMode === 'email-correction';
  if(authRecoverySubmitBtn) authRecoverySubmitBtn.hidden = false;
  authRecoveryToken = String(token || '').trim();
  if(authBackdrop) authBackdrop.hidden = true;
  if(authRecoveryRequestForm) authRecoveryRequestForm.hidden = authRecoveryMode === 'password-reset' || emailCorrection;
  if(authRecoveryResetForm) authRecoveryResetForm.hidden = authRecoveryMode !== 'password-reset';
  if(authEmailCorrectionForm) authEmailCorrectionForm.hidden = !emailCorrection;
  if(authRecoveryTitle) authRecoveryTitle.textContent = authRecoveryMode === 'password-reset'
    ? 'Neues Kennwort festlegen'
    : authRecoveryMode === 'verification-request'
      ? 'Bestätigungsmail erneut senden'
      : emailCorrection
        ? 'E-Mail-Adresse korrigieren'
        : 'Kennwort zurücksetzen';
  if(authRecoveryIntro){
    authRecoveryIntro.textContent = authRecoveryMode === 'password-reset'
      ? 'Lege ein neues Kennwort für deinen Account fest. Der Link kann nur einmal verwendet werden.'
      : authRecoveryMode === 'verification-request'
        ? 'Gib deinen Benutzernamen oder deine Mailadresse ein. Falls der Account noch nicht bestätigt ist, wird eine neue Bestätigungsmail versendet.'
        : emailCorrection
          ? 'Hast du dich bei der E-Mail-Adresse vertippt? Bestätige deinen noch nicht freigeschalteten Account mit Benutzername und Kennwort und gib die richtige Adresse ein.'
          : 'Gib deinen Benutzernamen oder deine Mailadresse ein. Falls ein passender bestätigter Account existiert, erhältst du einen zeitlich begrenzten Link.';
  }
  if(authRecoverySubmitBtn) authRecoverySubmitBtn.textContent = authRecoveryMode === 'password-reset'
    ? 'Kennwort speichern'
    : authRecoveryMode === 'verification-request'
      ? 'Bestätigungsmail anfordern'
      : emailCorrection
        ? 'Neue Bestätigungsmail senden'
        : 'Link anfordern';
  if(authRecoveryIdentifierInput && authRecoveryMode !== 'password-reset') authRecoveryIdentifierInput.value = loginIdentifierInput ? loginIdentifierInput.value : '';
  if(authEmailCorrectionUsernameInput){
    const loginValue = String(loginIdentifierInput ? loginIdentifierInput.value : '').trim();
    authEmailCorrectionUsernameInput.value = loginValue && !loginValue.includes('@') ? loginValue : '';
  }
  if(authRecoveryPasswordInput) authRecoveryPasswordInput.value = '';
  if(authRecoveryPasswordRepeatInput) authRecoveryPasswordRepeatInput.value = '';
  if(authEmailCorrectionPasswordInput) authEmailCorrectionPasswordInput.value = '';
  if(authEmailCorrectionEmailInput) authEmailCorrectionEmailInput.value = '';
  if(authEmailCorrectionEmailRepeatInput) authEmailCorrectionEmailRepeatInput.value = '';
  if(typeof refreshEmailDomainHints === 'function') refreshEmailDomainHints();
  setAuthRecoveryStatus('', '');
  if(authRecoveryBackdrop) authRecoveryBackdrop.hidden = false;
  setTimeout(() => {
    try{
      const focus = authRecoveryMode === 'password-reset'
        ? authRecoveryPasswordInput
        : emailCorrection
          ? authEmailCorrectionUsernameInput
          : authRecoveryIdentifierInput;
      if(focus) focus.focus();
    } catch(_){}
  }, 0);
}
function closeAuthRecoveryDialog(reopenLogin){
  if(authRecoveryBackdrop) authRecoveryBackdrop.hidden = true;
  authRecoveryToken = '';
  if(reopenLogin) openAuthDialog('login');
}
async function submitAuthRecovery(){
  if(!authRecoverySubmitBtn) return;
  authRecoverySubmitBtn.disabled = true;
  setAuthRecoveryStatus('Anfrage wird verarbeitet…', '');
  try{
    if(authRecoveryMode === 'password-reset'){
      const password = String(authRecoveryPasswordInput ? authRecoveryPasswordInput.value : '');
      const repeat = String(authRecoveryPasswordRepeatInput ? authRecoveryPasswordRepeatInput.value : '');
      if(password.length < 8 || password.length > 128) throw new Error('Das neue Kennwort muss 8 bis 128 Zeichen haben.');
      if(password !== repeat) throw new Error('Die neuen Kennwörter stimmen nicht überein.');
      const data = await authApi('/api/auth/password-reset/confirm', {method:'POST', body:JSON.stringify({token:authRecoveryToken, newPassword:password})});
      setAuthRecoveryStatus(data.message || 'Kennwort wurde geändert.', 'success');
      authRecoverySubmitBtn.hidden = true;
      setTimeout(() => { authRecoverySubmitBtn.hidden = false; closeAuthRecoveryDialog(true); }, 1300);
    } else if(authRecoveryMode === 'email-correction'){
      const username = String(authEmailCorrectionUsernameInput ? authEmailCorrectionUsernameInput.value : '').trim();
      const password = String(authEmailCorrectionPasswordInput ? authEmailCorrectionPasswordInput.value : '');
      const newEmail = String(authEmailCorrectionEmailInput ? authEmailCorrectionEmailInput.value : '').trim();
      const repeatEmail = String(authEmailCorrectionEmailRepeatInput ? authEmailCorrectionEmailRepeatInput.value : '').trim();
      if(!/^[A-Za-z0-9_-]{3,24}$/.test(username)) throw new Error('Bitte deinen Benutzernamen eingeben.');
      if(password.length < 8 || password.length > 128) throw new Error('Bitte dein Kennwort eingeben.');
      if(!newEmail || !newEmail.includes('@')) throw new Error('Bitte eine gültige neue E-Mail-Adresse eingeben.');
      if(newEmail.toLowerCase() !== repeatEmail.toLowerCase()) throw new Error('Die neuen E-Mail-Adressen stimmen nicht überein.');
      const data = await authApi('/api/auth/email-correction', {method:'POST', body:JSON.stringify({username, password, newEmail})});
      if(authEmailCorrectionPasswordInput) authEmailCorrectionPasswordInput.value = '';
      if(loginIdentifierInput) loginIdentifierInput.value = data.username || username;
      if(typeof showAuthVerificationNotice === 'function'){
        showAuthVerificationNotice({username:data.username || username, email:data.email || newEmail, mailSent:true, source:'registration'});
      }
      setAuthRecoveryStatus(data.message || 'Die neue Bestätigungsmail wurde versendet.', 'success');
    } else {
      const identifier = String(authRecoveryIdentifierInput ? authRecoveryIdentifierInput.value : '').trim();
      if(!identifier) throw new Error('Bitte Benutzername oder Mailadresse eingeben.');
      const path = authRecoveryMode === 'verification-request' ? '/api/auth/email-verification/request' : '/api/auth/password-reset/request';
      const data = await authApi(path, {method:'POST', body:JSON.stringify({identifier})});
      setAuthRecoveryStatus(data.message || 'Anfrage wurde verarbeitet.', 'success');
    }
  } catch(err){
    setAuthRecoveryStatus(err && err.message ? err.message : 'Die Anfrage konnte nicht verarbeitet werden.', 'error');
  } finally {
    if(authRecoverySubmitBtn) authRecoverySubmitBtn.disabled = false;
  }
}
async function resendPendingEmailVerification(){
  if(!onlineAuthToken || !onlineAuthUser) return;
  if(resendPendingEmailBtn) resendPendingEmailBtn.disabled = true;
  try{
    const data = await authApi('/api/account/email/resend', {method:'POST', body:JSON.stringify({})});
    setEmailNotificationsStatus(data.message || 'Bestätigungsmail wurde versendet.', 'success');
  } catch(err){
    setEmailNotificationsStatus(err && err.message ? err.message : 'Bestätigungsmail konnte nicht versendet werden.', 'error');
  } finally {
    if(resendPendingEmailBtn) resendPendingEmailBtn.disabled = false;
  }
}
async function confirmInitialEmailToken(token){
  openAuthRecoveryDialog('verification-result', '');
  if(authRecoveryTitle) authRecoveryTitle.textContent = 'Mailadresse bestätigen';
  if(authRecoveryIntro) authRecoveryIntro.textContent = 'Der Bestätigungslink wird geprüft.';
  if(authRecoveryRequestForm) authRecoveryRequestForm.hidden = true;
  if(authRecoveryResetForm) authRecoveryResetForm.hidden = true;
  if(authRecoverySubmitBtn) authRecoverySubmitBtn.hidden = true;
  setAuthRecoveryStatus('Bestätigung wird geprüft…', '');
  try{
    const data = await authApi('/api/auth/email-verification/confirm', {method:'POST', body:JSON.stringify({token})});
    saveAuthState('', null);
    setAuthRecoveryStatus(data.message || 'Mailadresse wurde bestätigt.', 'success');
    if(authRecoveryIntro) authRecoveryIntro.textContent = data.emailChanged ? 'Die Mailadressänderung ist abgeschlossen.' : 'Die Registrierung ist jetzt abgeschlossen.';
  } catch(err){
    setAuthRecoveryStatus(err && err.message ? err.message : 'Der Bestätigungslink konnte nicht verwendet werden.', 'error');
  }
}
if(forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', () => openAuthRecoveryDialog('password-request'));
if(resendVerificationLoggedOutBtn) resendVerificationLoggedOutBtn.addEventListener('click', () => openAuthRecoveryDialog('verification-request'));
if(correctRegistrationEmailBtn) correctRegistrationEmailBtn.addEventListener('click', () => openAuthRecoveryDialog('email-correction'));
if(resendPendingEmailBtn) resendPendingEmailBtn.addEventListener('click', resendPendingEmailVerification);
if(authRecoveryCloseBtn) authRecoveryCloseBtn.addEventListener('click', () => closeAuthRecoveryDialog(true));
if(authRecoverySubmitBtn) authRecoverySubmitBtn.addEventListener('click', submitAuthRecovery);
if(authRecoveryBackdrop) authRecoveryBackdrop.addEventListener('click', ev => { if(ev.target === authRecoveryBackdrop) closeAuthRecoveryDialog(true); });
[authRecoveryIdentifierInput, authRecoveryPasswordRepeatInput, authEmailCorrectionEmailRepeatInput].forEach(input => {
  if(input) input.addEventListener('keydown', ev => { if(ev.key === 'Enter') submitAuthRecovery(); });
});
