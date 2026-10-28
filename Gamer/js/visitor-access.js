'use strict';

// Explain member-only actions consistently, including clicks forwarded by mobile menus.
const visitorMemberActions = new Set([
  'dailyGamesOpenBtn','gameArchiveOpenBtn','tournamentsOpenBtn',
  'openingsToolBtn','playerToolBtn','analyzerToolBtn','schachlaborToolBtn',
  'newGameBtn','createOnlineBtn'
]);
let membersOnlyReturnFocus=null;
const membersOnlyDialog=document.createElement('dialog');
membersOnlyDialog.className='members-only-dialog';
membersOnlyDialog.setAttribute('aria-labelledby','membersOnlyTitle');
membersOnlyDialog.innerHTML='<h2 id="membersOnlyTitle">Nur für Mitglieder</h2><p>Um diese Funktion zu nutzen, melde dich bitte an oder registriere dich kostenlos.</p><div class="members-only-actions"><button type="button" class="visitor-board-login-btn" data-member-login>Registrierung / Login</button><button type="button" class="button-flat" data-member-close>Schließen</button></div>';
document.body.append(membersOnlyDialog);
function showMembersOnlyNotice(){
  if(membersOnlyDialog.open)return;
  membersOnlyReturnFocus=document.activeElement;
  membersOnlyDialog.showModal();
}
membersOnlyDialog.querySelector('[data-member-close]').addEventListener('click',()=>membersOnlyDialog.close());
membersOnlyDialog.querySelector('[data-member-login]').addEventListener('click',()=>{membersOnlyDialog.close();openAuthDialog('login');});
membersOnlyDialog.addEventListener('click',event=>{if(event.target===membersOnlyDialog){const r=membersOnlyDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)membersOnlyDialog.close();}});
membersOnlyDialog.addEventListener('close',()=>{if(membersOnlyReturnFocus?.isConnected)membersOnlyReturnFocus.focus({preventScroll:true});});
document.addEventListener('click',event=>{
  if(onlineAuthToken&&onlineAuthUser)return;
  const button=event.target.closest('button');
  if(button&&visitorMemberActions.has(button.id)){
    event.preventDefault();event.stopImmediatePropagation();showMembersOnlyNotice();
  }
},true);
