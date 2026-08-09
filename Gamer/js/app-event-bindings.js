'use strict';

if(authOpenBtn) authOpenBtn.addEventListener('click', () => openAuthDialog('login'));
if(profileOpenBtn) profileOpenBtn.addEventListener('click', () => openAuthDialog('login'));
if(membersOpenBtn) membersOpenBtn.addEventListener('click', openMembersDialog);
if(tournamentsOpenBtn) tournamentsOpenBtn.addEventListener('click', openTournamentDialog);
if(tournamentCloseBtn) tournamentCloseBtn.addEventListener('click', closeTournamentDialog);
if(tournamentDetailCloseBtn) tournamentDetailCloseBtn.addEventListener('click', closeTournamentDialog);
if(tournamentCreateOpenBtn) tournamentCreateOpenBtn.addEventListener('click', () => openTournamentCreateDialog(''));
if(tournamentBackToListBtn) tournamentBackToListBtn.addEventListener('click', () => openTournamentSelection(tournamentActiveListTab, true));
if(tournamentDetailEditBtn) tournamentDetailEditBtn.addEventListener('click', () => openTournamentCreateDialog(tournamentSelectedId));
if(tournamentPublishBtn) tournamentPublishBtn.addEventListener('click', publishSelectedTournament);
if(tournamentJoinBtn) tournamentJoinBtn.addEventListener('click', joinSelectedTournament);
if(tournamentCheckInBtn) tournamentCheckInBtn.addEventListener('click', checkInSelectedTournament);
if(tournamentArenaJoinBtn) tournamentArenaJoinBtn.addEventListener('click', joinRunningArena);
if(tournamentArenaPauseBtn) tournamentArenaPauseBtn.addEventListener('click', toggleArenaPause);
if(tournamentWithdrawBtn) tournamentWithdrawBtn.addEventListener('click', withdrawSelectedTournament);
if(tournamentStartBtn) tournamentStartBtn.addEventListener('click', startSelectedTournament);
if(tournamentLobbyViewBtn) tournamentLobbyViewBtn.addEventListener('click', () => openTournamentDialog(tournamentLobbyViewBtn.dataset.tournamentId || ''));
if(tournamentLobbyLaterBtn) tournamentLobbyLaterBtn.addEventListener('click', () => {
  tournamentBannerDismissedId = tournamentLobbyViewBtn ? String(tournamentLobbyViewBtn.dataset.tournamentId || '') : '';
  updateTournamentNotificationUi();
});
if(tournamentCreateCancelBtn) tournamentCreateCancelBtn.addEventListener('click', closeTournamentCreateDialog);
if(tournamentCreateForm) tournamentCreateForm.addEventListener('submit', saveTournamentDraft);
if(tournamentThemeCheckbox) tournamentThemeCheckbox.addEventListener('change', () => {
  updateTournamentThemeUi();
  if(tournamentThemeCheckbox.checked && !tournamentEditingTheme) openThemePicker();
});
if(tournamentThemeChooseBtn) tournamentThemeChooseBtn.addEventListener('click', openThemePicker);
if(themePickerSearch) themePickerSearch.addEventListener('input', renderThemePickerList);
if(themePickerGroup) themePickerGroup.addEventListener('change', renderThemePickerList);
if(themePickerCancelBtn) themePickerCancelBtn.addEventListener('click', closeThemePicker);
if(themePickerApplyBtn) themePickerApplyBtn.addEventListener('click', applyThemePickerSelection);
if(themePickerBackdrop) themePickerBackdrop.addEventListener('click', event => { if(event.target === themePickerBackdrop) closeThemePicker(); });
if(tournamentModeSelect) tournamentModeSelect.addEventListener('change', () => {
  updateTournamentModeUi();
});
tournamentTypeButtons.forEach(button => {
  button.addEventListener('click', () => updateTournamentTypeUi(button.dataset.tournamentType));
});
window.setInterval(() => {
  if(!onlineAuthToken || !onlineAuthUser) return;
  loadTournaments({keepDetail:!!(tournamentBackdrop && !tournamentBackdrop.hidden && tournamentSelectedId)}).catch(() => {});
  loadDailyGames({silent:true}).catch(() => {});
  loadLobbyTicker().catch(() => {});
  loadInfoCenter().catch(() => {});
}, 120000);
tournamentListTabButtons.forEach(button => {
  button.addEventListener('click', () => setTournamentListTab(button.dataset.tournamentListTab, false));
  button.addEventListener('keydown', event => {
    if(event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tournamentListTabButtons.indexOf(button);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = tournamentListTabButtons[(index + direction + tournamentListTabButtons.length) % tournamentListTabButtons.length];
    if(next) setTournamentListTab(next.dataset.tournamentListTab, true);
  });
});
tournamentTabButtons.forEach(button => {
  button.addEventListener('click', () => setTournamentTab(button.dataset.tournamentTab, false));
  button.addEventListener('keydown', event => {
    if(event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tournamentTabButtons.indexOf(button);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = tournamentTabButtons[(index + direction + tournamentTabButtons.length) % tournamentTabButtons.length];
    if(next) setTournamentTab(next.dataset.tournamentTab, true);
  });
});
if(tournamentBackdrop) tournamentBackdrop.addEventListener('click', event => { if(event.target === tournamentBackdrop) closeTournamentDialog(); });
if(tournamentCreateBackdrop) tournamentCreateBackdrop.addEventListener('click', event => { if(event.target === tournamentCreateBackdrop) closeTournamentCreateDialog(); });
document.addEventListener('keydown', event => {
  if(event.key !== 'Escape') return;
  if(themePickerBackdrop && !themePickerBackdrop.hidden){
    event.preventDefault();
    closeThemePicker();
  } else if(tournamentCreateBackdrop && !tournamentCreateBackdrop.hidden){
    event.preventDefault();
    closeTournamentCreateDialog();
  } else if(tournamentBackdrop && !tournamentBackdrop.hidden){
    event.preventDefault();
    closeTournamentDialog();
  }
});
if(visitorBoardLoginBtn) visitorBoardLoginBtn.addEventListener('click', () => openAuthDialog('login'));
if(authCancelBtn) authCancelBtn.addEventListener('click', closeAuthDialog);
if(authLoginTab) authLoginTab.addEventListener('click', () => setAuthMode('login'));
if(authRegisterTab) authRegisterTab.addEventListener('click', () => setAuthMode('register'));
if(authSubmitBtn) authSubmitBtn.addEventListener('click', submitAuthDialog);
if(authLogoutBtn) authLogoutBtn.addEventListener('click', logoutAuth);
if(accountProfileOpenBtn) accountProfileOpenBtn.addEventListener('click', () => openAccountEditDialog('profile'));
if(accountProfilePreviewBtn) accountProfilePreviewBtn.addEventListener('click', () => {
  if(!onlineAuthUser){ openAuthDialog('login'); return; }
  closeAuthDialog();
  openMemberProfile(onlineAuthUser, 'self');
});
if(accountUsernameOpenBtn) accountUsernameOpenBtn.addEventListener('click', () => openAccountEditDialog('username'));
if(accountEmailOpenBtn) accountEmailOpenBtn.addEventListener('click', () => openAccountEditDialog('email'));
if(accountPasswordOpenBtn) accountPasswordOpenBtn.addEventListener('click', () => openAccountEditDialog('password'));
if(accountDeleteOpenBtn) accountDeleteOpenBtn.addEventListener('click', () => openAccountEditDialog('delete'));
if(emailNotificationsSaveBtn) emailNotificationsSaveBtn.addEventListener('click', saveEmailNotificationSettings);
if(accountProfileAvatarInput) accountProfileAvatarInput.addEventListener('change', updateAccountProfileAvatarSelection);
if(accountProfileAvatarRemoveBtn) accountProfileAvatarRemoveBtn.addEventListener('click', removeAccountProfileAvatar);
if(accountProfileAboutInput) accountProfileAboutInput.addEventListener('input', updateAccountProfileAboutCount);
[dailyTurnEmailCheckbox, dailyResultEmailCheckbox, memberNewsEmailCheckbox, tournamentEmailCheckbox].forEach(input => {
  if(input) input.addEventListener('change', () => setEmailNotificationsStatus('Änderung noch nicht gespeichert.', ''));
});
if(accountEditCancelBtn) accountEditCancelBtn.addEventListener('click', () => closeAccountEditDialog(true));
if(accountEditSubmitBtn) accountEditSubmitBtn.addEventListener('click', submitAccountEdit);
if(authBackdrop) authBackdrop.addEventListener('click', ev => { if(ev.target === authBackdrop) closeAuthDialog(); });
if(accountEditBackdrop) accountEditBackdrop.addEventListener('click', ev => { if(ev.target === accountEditBackdrop) closeAccountEditDialog(true); });
[loginPasswordInput, registerPasswordRepeatInput].forEach(input => {
  if(input) input.addEventListener('keydown', ev => { if(ev.key === 'Enter') submitAuthDialog(); });
});
[accountUsernamePasswordInput, accountEmailPasswordInput, accountNewPasswordRepeatInput, accountDeleteConfirmationInput].forEach(input => {
  if(input) input.addEventListener('keydown', ev => { if(ev.key === 'Enter') submitAccountEdit(); });
});
document.addEventListener('keydown', ev => {
  if(ev.key === 'Escape' && accountEditBackdrop && !accountEditBackdrop.hidden) closeAccountEditDialog(true);
});

let publicGamesRefreshTimer = null;
loadAuthState();
updateAuthUi();
const initialAuthRefreshPromise = refreshAuthSession();
if(publicGameCheckbox) publicGameCheckbox.addEventListener('change', () => setPublicGamePreference(publicGameCheckbox.checked));
if(ratingRatedBtn) ratingRatedBtn.addEventListener('click', () => setRatingPreference(true));
if(ratingUnratedBtn) ratingUnratedBtn.addEventListener('click', () => setRatingPreference(false));
if(roomPublicGameCheckbox) roomPublicGameCheckbox.addEventListener('change', () => setCurrentRoomPublicGame(roomPublicGameCheckbox.checked));

inviteColorButtons.forEach(btn => btn.addEventListener('click', () => setInviteColorPreference(btn.dataset.inviteColor)));
updateInviteColorUi();
updateRatingPreferenceUi();
updatePublicVisibilityUi();
createOnlineBtn.addEventListener('click', inviteToOnlineGame);
if(copyInviteBtn) copyInviteBtn.addEventListener('click', copyInviteLink);
if(inviteCopyLinkBtn) inviteCopyLinkBtn.addEventListener('click', copyInviteLinkFromDialog);
if(inviteCopyTextBtn) inviteCopyTextBtn.addEventListener('click', () => copyInvitationText(inviteSelectedMember || null));
if(inviteCloseBtn) inviteCloseBtn.addEventListener('click', closeInviteDialog);
if(inviteBackdrop) inviteBackdrop.addEventListener('click', ev => { if(ev.target === inviteBackdrop) closeInviteDialog(); });
if(invitationMessageInput) invitationMessageInput.addEventListener('input', updateInvitationMessageCount);
if(invitationMessageCancelBtn) invitationMessageCancelBtn.addEventListener('click', () => closeInvitationMessageDialog(false));
if(invitationMessageSendBtn) invitationMessageSendBtn.addEventListener('click', submitInvitationMessage);
if(invitationMessageBackdrop) invitationMessageBackdrop.addEventListener('click', ev => { if(ev.target === invitationMessageBackdrop) closeInvitationMessageDialog(false); });
if(memberSearchInput) memberSearchInput.addEventListener('input', scheduleMemberSearch);
if(memberListBtn) memberListBtn.addEventListener('click', loadMemberList);
if(membersSearchInput) membersSearchInput.addEventListener('input', scheduleStandaloneMemberSearch);
if(membersRefreshBtn) membersRefreshBtn.addEventListener('click', () => loadStandaloneMemberList());
if(membersCloseBtn) membersCloseBtn.addEventListener('click', closeMembersDialog);
if(membersBackdrop) membersBackdrop.addEventListener('click', ev => { if(ev.target === membersBackdrop) closeMembersDialog(); });
document.addEventListener('keydown', ev => {
  if(ev.key !== 'Escape') return;
  if(invitationMessageBackdrop && !invitationMessageBackdrop.hidden) closeInvitationMessageDialog(false);
  else if(membersBackdrop && !membersBackdrop.hidden) closeMembersDialog();
  else if(inviteBackdrop && !inviteBackdrop.hidden) closeInviteDialog();
});
startOnlineBtn.addEventListener('click', startOnlineGame);
if(offerDrawBtn) offerDrawBtn.addEventListener('click', handleDrawButtonClick);
if(resignBtn) resignBtn.addEventListener('click', handleResignButtonClick);
if(resignCancelBtn) resignCancelBtn.addEventListener('click', () => closeResignDialog());
if(resignConfirmBtn) resignConfirmBtn.addEventListener('click', confirmResignation);
if(resignBackdropEl) resignBackdropEl.addEventListener('click', event => {
  if(event.target === resignBackdropEl) closeResignDialog();
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && resignBackdropEl && !resignBackdropEl.hidden){
    event.preventDefault();
    closeResignDialog();
  }
});

function installPieceDragInput(container,mode){
  if(!container || !window.PointerEvent) return;
  container.addEventListener('pointerdown',event => beginPiecePointer(event,container,mode));
  container.addEventListener('click',suppressClickAfterPieceDrag,true);
  container.addEventListener('dragstart',event => event.preventDefault());
}

installPieceDragInput(boardEl,'main');
installPieceDragInput(variationBoardEl,'variation');
document.addEventListener('pointermove',movePiecePointer,{passive:false});
document.addEventListener('pointerup',event => endPiecePointer(event,true),{passive:false});
document.addEventListener('pointercancel',event => endPiecePointer(event,false),{passive:false});
window.addEventListener('blur',() => cancelActivePieceDrag());
