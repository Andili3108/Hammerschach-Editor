'use strict';

function publicGameModeLabel(game){
  return game && game.mode === 'daily' ? 'Daily Chess' : 'Live-Partie';
}
function publicGameVariantLabel(game){
  if(game && game.variant === GAME_VARIANT_FREESTYLE){
    return Number.isFinite(Number(game.positionId)) ? ('Freestyle #' + Number(game.positionId)) : 'Freestyle';
  }
  return 'Klassisch';
}
// Both entry points use the same overview, optionally filtered by a member.
function openPublicGamesDialog(){
  window.openMemberGamesDialog(null);
}
function closePublicGamesDialog(){
  window.closeMemberGamesDialog();
}
if(publicGamesOpenBtn) publicGamesOpenBtn.addEventListener('click', openPublicGamesDialog);
