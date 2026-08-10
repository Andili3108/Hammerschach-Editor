'use strict';

function normalizeGameStartSummary(value){
  if(!value || typeof value!=='object')return null;
  const name=String(value.name || '').trim().slice(0,120);
  const moveText=String(value.moveText || '').replace(/\s+/g,' ').trim().slice(0,500);
  return moveText ? {name,moveText} : null;
}
function createGameStartSummaryPanel(game){
  const summary=normalizeGameStartSummary(game && game.startSummary);
  if(!summary || !game || !game.ended)return null;
  const panel=document.createElement('div');panel.className='game-start-summary';
  const heading=document.createElement('div');heading.className='game-start-summary-heading';heading.textContent=summary.name ? 'Eröffnung: '+summary.name : 'Partiebeginn';
  const moves=document.createElement('div');moves.className='game-start-summary-moves';moves.textContent=summary.moveText;
  panel.append(heading,moves);
  return panel;
}
