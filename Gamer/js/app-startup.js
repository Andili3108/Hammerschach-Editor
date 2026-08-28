'use strict';

function mountDialogBackdropsAtViewportRoot(){
  document.querySelectorAll('.identity-backdrop,.info-backdrop').forEach(backdrop => {
    if(backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
  });
}

mountDialogBackdropsAtViewportRoot();
updateVariantUi();
renderBoard();
refreshSiteStats(true);
let initialRoomId = '';
let initialPublicWatchId = '';
let initialSpectatorOnly = false;
let freshGameRequested = false;
let initialVerifyEmailToken = '';
let initialResetPasswordToken = '';
let initialFirstStepsRequested = false;
let initialDailyInvitationRoomId = '';
let initialRematchOfferId = '';
try{
  const initialUrl = new URL(window.location.href);
  initialVerifyEmailToken = String(initialUrl.searchParams.get('verifyEmail') || '').trim();
  initialResetPasswordToken = String(initialUrl.searchParams.get('resetPassword') || '').trim();
  if(initialVerifyEmailToken || initialResetPasswordToken){
    initialUrl.searchParams.delete('verifyEmail');
    initialUrl.searchParams.delete('resetPassword');
    history.replaceState(null, '', initialUrl.toString());
  }
  initialRoomId = cleanRoomId(initialUrl.searchParams.get('room'));
  initialPublicWatchId = cleanPublicWatchId(initialUrl.searchParams.get('watch'));
  initialDailyInvitationRoomId = cleanRoomId(initialUrl.searchParams.get('dailyInvite'));
  initialRematchOfferId = cleanListedRematchOfferId(initialUrl.searchParams.get('rematch'));
  initialSpectatorOnly = !!initialPublicWatchId;
  freshGameRequested = initialUrl.searchParams.get('fresh') === '1';
  initialFirstStepsRequested = String(initialUrl.searchParams.get('info') || '').trim().toLowerCase() === 'erste-schritte';
  if(freshGameRequested){
    /* „Zur Lobby“ ist eine bewusste Abkehr vom zuletzt geöffneten Raum.
       Nur den automatischen Wiederaufnahme-Merker löschen; gespeicherte
       Spielerplatz-Zugangsdaten und die Partie selbst bleiben erhalten. */
    try{ sessionStorage.removeItem(ONLINE_LAST_ROOM_STORAGE_KEY); } catch(_){ }
    initialUrl.searchParams.delete('fresh');
    initialUrl.searchParams.delete('watch');
    initialSpectatorOnly = false;
    initialPublicWatchId = '';
    history.replaceState(null, '', initialUrl.toString());
  }
} catch(_){}
if(!initialRoomId && !initialPublicWatchId && !initialDailyInvitationRoomId && !initialRematchOfferId){
  /* Die reine Startadresse bleibt auch nach einem Browser-Reload die
     Besucher-Startseite. Eine alte Raumkennung aus derselben Browser-Sitzung
     darf hier weder einen Spielraum noch den Gastnamen-Dialog reaktivieren. */
  try{ sessionStorage.removeItem(ONLINE_LAST_ROOM_STORAGE_KEY); } catch(_){ }
}
initialAuthRefreshPromise.finally(() => {
  if(initialVerifyEmailToken) confirmInitialEmailToken(initialVerifyEmailToken);
  else if(initialResetPasswordToken) openAuthRecoveryDialog('password-reset', initialResetPasswordToken);
  if(initialRematchOfferId){
    onlineSpectatorOnly = false;
    onlinePublicWatchId = '';
    updateOnlineUi();
    setTimeout(maybeOpenRematchInvitationFromAddress, 80);
  } else if(initialDailyInvitationRoomId){
    onlineSpectatorOnly = false;
    onlinePublicWatchId = '';
    updateOnlineUi();
    setTimeout(maybeOpenDailyInvitationFromAddress, 80);
  } else if(initialPublicWatchId){
    onlineSpectatorOnly = true;
    onlinePublicWatchId = initialPublicWatchId;
    onlinePreferredRoleForNextConnect = '';
    connectOnlineRoom(initialPublicWatchId, {reconnect:true, spectatorOnly:true, publicWatchId:initialPublicWatchId});
  } else if(initialRoomId){
    onlineSpectatorOnly = false;
    onlinePublicWatchId = '';
    updateInviteUrlInAddressBar(initialRoomId);
    onlinePreferredRoleForNextConnect = '';
    ensureDisplayNameForOnline().then(ok => {
      if(ok) connectOnlineRoom(initialRoomId, {reconnect:true, spectatorOnly:false});
      else updateOnlineUi();
    });
  } else {
    onlineSpectatorOnly = false;
    onlinePublicWatchId = '';
    updateOnlineUi();
    if(initialFirstStepsRequested && !initialVerifyEmailToken && !initialResetPasswordToken) openFirstStepsDialog();
  }
});
