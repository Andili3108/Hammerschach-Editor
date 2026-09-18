'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const adminBox = byId('adminAccountRecoveryBackdrop');
  const publicBox = byId('accountAccessRecoveryBackdrop');
  if (!adminBox || !publicBox) return;
  const a = suffix => byId('adminAccountRecovery' + suffix);
  const p = suffix => byId('accountAccessRecovery' + suffix);
  let member = null, pending = null, adminBusy = false, adminVersion = 0;
  let token = '', publicBusy = false, publicVersion = 0;
  const status = (element, message, kind = '') => {
    element.textContent = message || '';
    element.classList.toggle('error', kind === 'error');
    element.classList.toggle('success', kind === 'success');
  };
  const adminAllowed = () => !!(onlineAuthUser && onlineAuthUser.isAdmin === true && onlineAuthToken);
  const setAdminBusy = busy => {
    adminBusy = busy;
    adminBox.querySelectorAll('button, input, textarea, select').forEach(element => { element.disabled = busy; });
  };
  function clearSelection() {
    member = null; pending = null;
    a('Form').reset(); a('Form').hidden = true;
    a('Member').hidden = true; a('Member').textContent = '';
    a('Pending').hidden = true; a('Pending').textContent = '';
    a('RevokeBtn').hidden = true; a('SendBtn').hidden = true;
    a('Password').value = '';
  }
  window.resetAdminAccountRecovery = () => {
    adminVersion += 1;
    setAdminBusy(false); clearSelection();
    a('Username').value = '';
    status(a('Status'), ''); adminBox.hidden = true;
  };
  function showMember(data) {
    member = data.user; pending = data.pending || null;
    a('Member').textContent = 'Ausgewählt: ' + member.username + ' · bisheriges Postfach: ' + member.maskedEmail;
    a('Member').hidden = false; a('Form').hidden = false; a('SendBtn').hidden = false;
    a('Pending').hidden = !pending; a('RevokeBtn').hidden = !pending;
    a('Pending').textContent = pending
      ? 'Offener Auftrag an ' + pending.new_email + ' · gültig bis ' + new Date(pending.expires_at).toLocaleString('de-DE') +
        '. Prüfvermerk: ' + pending.identity_note
      : '';
  }
  a('OpenBtn').addEventListener('click', () => {
    if (!adminAllowed()) return;
    window.resetAdminAccountRecovery();
    if (adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
    adminBox.hidden = false; a('Username').focus();
  });
  a('CloseBtn').addEventListener('click', () => {
    if (adminBusy) return;
    window.resetAdminAccountRecovery();
    if (adminAllowed()) openAdminOverview();
  });
  a('Username').addEventListener('input', () => {
    adminVersion += 1; clearSelection(); status(a('Status'), '');
  });
  a('LookupForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (adminBusy || !adminAllowed()) return;
    const version = ++adminVersion;
    clearSelection(); setAdminBusy(true); status(a('Status'), 'Mitglied wird gesucht…');
    try {
      const data = await authApi('/api/admin/account-recovery?username=' + encodeURIComponent(a('Username').value.trim()));
      if (version !== adminVersion || !adminAllowed()) return;
      showMember(data); status(a('Status'), 'Bitte Accountzuordnung und Identität prüfen.');
    } catch (error) {
      if (version === adminVersion) status(a('Status'), error.message || 'Mitglied konnte nicht geladen werden.', 'error');
    } finally { if (version === adminVersion) setAdminBusy(false); }
  });
  async function submitAdmin(revoke) {
    if (adminBusy || !adminAllowed() || !member || (revoke && !pending)) return;
    const version = adminVersion;
    const password = a('Password').value;
    if (password.length < 8 || password.length > 128) {
      status(a('Status'), 'Bitte dein aktuelles Admin-Kennwort eingeben.', 'error'); a('Password').focus(); return;
    }
    const body = {userId:member.id, username:member.username, currentPassword:password};
    if (revoke) body.requestId = pending.id;
    else {
      body.newEmail = a('Email').value.trim(); body.repeatEmail = a('EmailRepeat').value.trim();
      body.identityMethod = a('Method').value; body.identityNote = a('Note').value.trim();
      body.identityConfirmed = a('Verified').checked;
      if (body.newEmail.toLowerCase() !== body.repeatEmail.toLowerCase()) {
        status(a('Status'), 'Die beiden Mailadressen stimmen nicht überein.', 'error'); return;
      }
    }
    setAdminBusy(true); status(a('Status'), revoke ? 'Link wird widerrufen…' : 'Kennwort wird geprüft und Mail versendet…');
    try {
      const data = await authApi('/api/admin/account-recovery', {method:revoke ? 'DELETE' : 'POST', body:JSON.stringify(body)});
      if (version !== adminVersion || !adminAllowed()) return;
      status(a('Status'), data.message, 'success');
      a('Form').reset();
      try {
        const updated = await authApi('/api/admin/account-recovery?username=' + encodeURIComponent(member.username));
        if (version === adminVersion && adminAllowed()) showMember(updated);
      } catch (_) {
        if (version === adminVersion) {
          clearSelection();
          status(a('Status'), data.message + ' Bitte das Mitglied erneut suchen, um den aktuellen Auftrag anzuzeigen.', 'success');
        }
      }
    } catch (error) {
      if (version === adminVersion) {
        status(a('Status'), error.message || 'Die Wiederherstellung konnte nicht verarbeitet werden.', 'error');
        // Nach einem Versandfehler kann ein bisheriger Auftrag bereits
        // widerrufen sein; keine veraltete Widerrufsaktion anbieten.
        pending = null; a('Pending').hidden = true; a('RevokeBtn').hidden = true;
      }
    } finally {
      if (version === adminVersion) { a('Password').value = ''; setAdminBusy(false); }
    }
  }
  a('Form').addEventListener('submit', event => { event.preventDefault(); submitAdmin(false); });
  a('RevokeBtn').addEventListener('click', () => submitAdmin(true));

  function setPublicBusy(busy) {
    publicBusy = busy;
    publicBox.querySelectorAll('button, input').forEach(element => { element.disabled = busy; });
  }
  window.openAccountAccessRecovery = async recoveryToken => {
    const version = ++publicVersion;
    token = String(recoveryToken || '').trim();
    if (authBackdrop) authBackdrop.hidden = true;
    p('Form').reset(); p('Form').hidden = true;
    p('Intro').textContent = 'Dein Wiederherstellungslink wird geprüft.';
    status(p('Status'), ''); publicBox.hidden = false; setPublicBusy(true);
    try {
      const data = await authApi('/api/auth/account-recovery/preview', {method:'POST', body:JSON.stringify({token})});
      if (version !== publicVersion) return;
      p('Intro').textContent = 'Account: ' + data.username + ' · Neue Mailadresse: ' + data.newEmail +
        ' · Link gültig bis ' + new Date(data.expiresAt).toLocaleString('de-DE');
      p('Form').hidden = false;
    } catch (error) {
      if (version === publicVersion) {
        token = ''; p('Intro').textContent = 'Die Wiederherstellung ist mit diesem Link nicht möglich.';
        status(p('Status'), error.message || 'Bitte wende dich an den Administrator.', 'error');
      }
    } finally {
      if (version === publicVersion) { setPublicBusy(false); if (!p('Form').hidden) p('Password').focus(); }
    }
  };
  p('Form').addEventListener('submit', async event => {
    event.preventDefault();
    if (publicBusy || !token) return;
    const password = p('Password').value;
    if (password.length < 8 || password.length > 128 || password !== p('Repeat').value) {
      status(p('Status'), 'Bitte ein Kennwort mit 8 bis 128 Zeichen zweimal übereinstimmend eingeben.', 'error'); return;
    }
    const version = publicVersion;
    setPublicBusy(true); status(p('Status'), 'Dein Zugang wird gespeichert…');
    try {
      const data = await authApi('/api/auth/account-recovery/confirm', {method:'POST', body:JSON.stringify({token, newPassword:password})});
      if (version !== publicVersion) return;
      token = ''; p('Form').reset(); p('Form').hidden = true;
      saveAuthState('', null);
      if (loginIdentifierInput) loginIdentifierInput.value = data.username;
      status(p('Status'), data.message, 'success');
    } catch (error) {
      if (version === publicVersion) status(p('Status'), error.message || 'Dein Zugang konnte nicht gespeichert werden.', 'error');
    } finally { if (version === publicVersion) setPublicBusy(false); }
  });
  p('CloseBtn').addEventListener('click', () => {
    if (publicBusy) return;
    publicVersion += 1; token = ''; p('Form').reset(); publicBox.hidden = true;
    openAuthDialog('login');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!adminBox.hidden && !adminBusy) a('CloseBtn').click();
    if (!publicBox.hidden && !publicBusy) p('CloseBtn').click();
  });
})();
