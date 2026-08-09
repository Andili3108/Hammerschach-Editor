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
  initialSpectatorOnly = !!initialPublicWatchId;
  freshGameRequested = initialUrl.searchParams.get('fresh') === '1';
  initialFirstStepsRequested = String(initialUrl.searchParams.get('info') || '').trim().toLowerCase() === 'erste-schritte';
  if(freshGameRequested){
    initialUrl.searchParams.delete('fresh');
    initialUrl.searchParams.delete('watch');
    initialSpectatorOnly = false;
    initialPublicWatchId = '';
    history.replaceState(null, '', initialUrl.toString());
  }
} catch(_){}
if(!initialRoomId && !initialPublicWatchId && !initialDailyInvitationRoomId && !freshGameRequested){
  initialRoomId = getRememberedRoomForReload();
  initialSpectatorOnly = false;
  initialPublicWatchId = '';
}
initialAuthRefreshPromise.finally(() => {
  if(initialVerifyEmailToken) confirmInitialEmailToken(initialVerifyEmailToken);
  else if(initialResetPasswordToken) openAuthRecoveryDialog('password-reset', initialResetPasswordToken);
  if(initialDailyInvitationRoomId){
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
