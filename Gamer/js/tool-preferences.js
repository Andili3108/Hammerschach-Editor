'use strict';
(function(){
 const P=HammerschachPreferences;
 // Only hide local appearance selectors when the Gamer owns this iframe.
 let owned=false,lastBoard='',lastPieces='';
 function apply(){const p=P.snapshot();
  if(lastBoard!==p.board){lastBoard=p.board;window.dispatchEvent(new StorageEvent('storage',{key:'hammerschachBoardColor',newValue:p.board}));if(typeof window.applyBoardColor==='function')window.applyBoardColor(p.board,false);if(typeof window.hammerschachReaderApplyBoardColor==='function')window.hammerschachReaderApplyBoardColor(p.board,false);}
  if(lastPieces!==p.pieces){lastPieces=p.pieces;window.dispatchEvent(new StorageEvent('storage',{key:'hammerschachPieceSet',newValue:p.pieces}));if(typeof window.applyPieceSet==='function')window.applyPieceSet(p.pieces,false);if(typeof window.hammerschachReaderApplyPieceSet==='function')window.hammerschachReaderApplyPieceSet(p.pieces,false);}
  window.HammerschachToolSound?.setEnabled(p.sound);
  window.dispatchEvent(new StorageEvent('storage',{key:'hammerschachGamerSoundEnabled',newValue:p.sound?'on':'off'}));
 }
 window.addEventListener('message',e=>{
  if(e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='hammerschach-preferences')return;
  if(!owned){owned=true;document.documentElement.classList.add('central-settings');
   for(const id of ['boardThemeBtn','pieceSetBtn']){const b=document.getElementById(id);if(b)b.closest('.appearance-control,.appearance-menu,.board-color-wrap')?.classList.add('settings-migrated-control');}
  }
  P.replace(e.data.preferences,false);
 });
 window.addEventListener('hammerschach:preferences',apply);
 if(window.parent!==window)window.parent.postMessage({type:'hammerschach-preferences-ready'},location.origin==='null'?'*':location.origin);
 // Standalone tools retain their controls and their original stored appearance.
 if(window.parent===window){document.documentElement.classList.remove('central-settings');return;}
 apply();
})();
