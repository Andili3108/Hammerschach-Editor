'use strict';

function openLeitbildDialog(options){
  if(!leitbildBackdrop) return;
  leitbildAutomaticOpen = !!(options && options.automatic);
  if(leitbildStatus) leitbildStatus.textContent = leitbildAutomaticOpen ? 'Dieses Leitbild erscheint für jedes Mitglied einmalig.' : '';
  if(leitbildCloseBtn){
    leitbildCloseBtn.disabled = false;
    leitbildCloseBtn.textContent = 'Gemeinsam fair spielen';
  }
  leitbildBackdrop.hidden = false;
  setTimeout(() => {
    try{
      if(leitbildScroll){ leitbildScroll.scrollTop = 0; leitbildScroll.focus(); }
    } catch(_){}
  }, 0);
}
function closeLeitbildDialog(){
  if(leitbildBackdrop) leitbildBackdrop.hidden = true;
  leitbildAutomaticOpen = false;
}
function maybeOpenLeitbildAfterLogin(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.leitbildAcknowledged !== false) return;
  const userId = String(onlineAuthUser.id || '');
  if(!userId || leitbildOpenedForUserId === userId) return;
  leitbildOpenedForUserId = userId;
  openLeitbildDialog({automatic:true});
}
async function acknowledgeOrCloseLeitbild(){
  if(leitbildAcknowledgeBusy) return;
  const needsAcknowledgement = !!(onlineAuthToken && onlineAuthUser && onlineAuthUser.leitbildAcknowledged === false);
  if(!needsAcknowledgement){ closeLeitbildDialog(); return; }
  leitbildAcknowledgeBusy = true;
  if(leitbildCloseBtn){ leitbildCloseBtn.disabled = true; leitbildCloseBtn.textContent = 'Wird gespeichert…'; }
  if(leitbildStatus) leitbildStatus.textContent = 'Deine Bestätigung wird deinem Account zugeordnet…';
  try{
    const data = await authApi('/api/account/leitbild', {method:'POST', body:JSON.stringify({})});
    saveAuthState(onlineAuthToken, data.user);
    closeLeitbildDialog();
  } catch(err){
    if(leitbildStatus) leitbildStatus.textContent = err && err.message ? err.message : 'Die Bestätigung konnte nicht gespeichert werden.';
  } finally {
    leitbildAcknowledgeBusy = false;
    if(leitbildCloseBtn){ leitbildCloseBtn.disabled = false; leitbildCloseBtn.textContent = 'Gemeinsam fair spielen'; }
  }
}
if(leitbildOpenBtn) leitbildOpenBtn.addEventListener('click', () => openLeitbildDialog({automatic:false}));
if(leitbildCloseBtn) leitbildCloseBtn.addEventListener('click', acknowledgeOrCloseLeitbild);
if(leitbildBackdrop) leitbildBackdrop.addEventListener('click', ev => { if(ev.target === leitbildBackdrop) closeLeitbildDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && leitbildBackdrop && !leitbildBackdrop.hidden) closeLeitbildDialog(); });

let privacyPreviousFocus = null;
function openPrivacyDialog(){
  if(!privacyBackdrop) return;
  privacyPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  privacyBackdrop.hidden = false;
  setTimeout(() => {
    try{
      if(privacyScroll){
        privacyScroll.scrollTop = 0;
        privacyScroll.focus();
      }
    } catch(_){}
  }, 0);
}
function closePrivacyDialog(){
  if(privacyBackdrop) privacyBackdrop.hidden = true;
  const returnTarget = privacyPreviousFocus;
  privacyPreviousFocus = null;
  setTimeout(() => {
    try{ if(returnTarget && document.contains(returnTarget)) returnTarget.focus(); }
    catch(_){}
  }, 0);
}
[footerPrivacyOpenBtn, registerPrivacyOpenBtn, accountPrivacyOpenBtn].forEach(btn => {
  if(btn) btn.addEventListener('click', openPrivacyDialog);
});
if(privacyCloseBtn) privacyCloseBtn.addEventListener('click', closePrivacyDialog);
if(privacyBackdrop) privacyBackdrop.addEventListener('click', ev => { if(ev.target === privacyBackdrop) closePrivacyDialog(); });
document.addEventListener('keydown', ev => {
  if(ev.key === 'Escape' && privacyBackdrop && !privacyBackdrop.hidden){
    ev.preventDefault();
    closePrivacyDialog();
  }
});

