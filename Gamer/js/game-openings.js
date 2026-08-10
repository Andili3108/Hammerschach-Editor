'use strict';

let onlineGameOpening = null;

const onlineGameOpeningBarEl = document.getElementById('gameOpeningBar');
const onlineGameOpeningEcoEl = document.getElementById('gameOpeningEco');
const onlineGameOpeningNameEl = document.getElementById('gameOpeningName');
const onlineGameOpeningSchoolBtn = document.getElementById('gameOpeningSchoolBtn');

function normalizeRecognizedOpening(value){
  if(!value || typeof value !== 'object') return null;
  const id=String(value.id || value.openingId || '').trim().slice(0,160);
  const eco=String(value.eco || '').trim().slice(0,8);
  const name=String(value.name || '').trim().slice(0,160);
  const plyCount=Math.max(0,Math.floor(Number(value.plyCount || 0)));
  return id && eco && name ? {id,eco,name,plyCount} : null;
}
function applyOnlineGameOpening(value){
  onlineGameOpening=normalizeRecognizedOpening(value);
  updateOnlineGameOpeningUi();
}
function resetOnlineGameOpening(){
  onlineGameOpening=null;
  updateOnlineGameOpeningUi();
}
function updateOnlineGameOpeningUi(){
  if(!onlineGameOpeningBarEl)return;
  const visible=!!(onlineRoomId && onlineGameEnded && onlineGameOpening);
  onlineGameOpeningBarEl.hidden=!visible;
  if(!visible)return;
  if(onlineGameOpeningEcoEl)onlineGameOpeningEcoEl.textContent='ECO '+onlineGameOpening.eco;
  if(onlineGameOpeningNameEl)onlineGameOpeningNameEl.textContent=onlineGameOpening.name;
}
function showRecognizedOpeningInSchool(opening){
  const normalized=normalizeRecognizedOpening(opening);
  if(normalized && typeof openOpeningInSchool==='function')openOpeningInSchool(normalized);
}
if(onlineGameOpeningSchoolBtn)onlineGameOpeningSchoolBtn.addEventListener('click',()=>showRecognizedOpeningInSchool(onlineGameOpening));

function createRecognizedOpeningPanel(game){
  const opening=normalizeRecognizedOpening(game && game.opening);
  if(!opening || !game || !game.ended)return null;
  const panel=document.createElement('div');panel.className='recognized-opening-panel';
  const text=document.createElement('div');text.className='recognized-opening-text';
  const label=document.createElement('span');label.className='recognized-opening-label';label.textContent='Eröffnung · ECO '+opening.eco;
  const name=document.createElement('strong');name.textContent=opening.name;
  text.append(label,name);panel.appendChild(text);
  const button=document.createElement('button');button.type='button';button.className='recognized-opening-school-btn';button.textContent='♟ In der Eröffnungsschule ansehen';button.addEventListener('click',()=>showRecognizedOpeningInSchool(opening));panel.appendChild(button);
  return panel;
}
