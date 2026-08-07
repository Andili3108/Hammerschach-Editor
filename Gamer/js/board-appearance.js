'use strict';

/* Brettfarben */
const boardColorWrap = document.getElementById('boardColorWrap');
const btnBoardColor = document.getElementById('btnBoardColor');
const boardColorPopup = document.getElementById('boardColorPopup');
const boardColorCurrent = document.getElementById('boardColorCurrent');

/* Premium-Endauswahl unabhängig vom bisherigen HTML-Stand freischalten.
   Dadurch funktioniert die Auswahl auch dann, wenn in einer älteren index.html
   noch die ehemaligen Admin-Attribute/hidden-Flags vorhanden sind. */
const premiumWarmBoardOption = document.querySelector('.board-color-option[data-board-color="onyx-elegance"]');
if(premiumWarmBoardOption){
  premiumWarmBoardOption.hidden = false;
  premiumWarmBoardOption.classList.remove('admin-premium-option');
  const label = premiumWarmBoardOption.querySelector('span:first-child');
  if(label) label.textContent = 'Premium · Warm';
  const swatches = premiumWarmBoardOption.querySelectorAll('.board-color-swatch span');
  if(swatches[0]) swatches[0].style.background = '#f2e7d2';
  if(swatches[1]) swatches[1].style.background = '#545a61';
}
const obsoleteMetalBoardOption = document.querySelector('.board-color-option[data-board-color="metal-prestige"]');
if(obsoleteMetalBoardOption) obsoleteMetalBoardOption.remove();

const premiumMetalPieceOption = document.querySelector('.piece-set-option[data-piece-set="metal-prestige"]');
if(premiumMetalPieceOption){
  premiumMetalPieceOption.hidden = false;
  premiumMetalPieceOption.classList.remove('admin-premium-option');
  const label = premiumMetalPieceOption.querySelector('span:first-child');
  if(label) label.textContent = 'Metal Prestige · Premium';
  const preview = premiumMetalPieceOption.querySelector('.piece-set-preview');
  if(preview) preview.src = 'assets/pieces/metal-prestige/wn.png?v=20260807-7';
}
const obsoleteOnyxPieceOption = document.querySelector('.piece-set-option[data-piece-set="onyx-elegance"]');
if(obsoleteOnyxPieceOption) obsoleteOnyxPieceOption.remove();

const boardColorOptions = document.querySelectorAll('.board-color-option[data-board-color]');
const pieceSetWrap = document.getElementById('pieceSetWrap');
const btnPieceSet = document.getElementById('btnPieceSet');
const pieceSetPopup = document.getElementById('pieceSetPopup');
const pieceSetCurrent = document.getElementById('pieceSetCurrent');
const pieceSetOptions = document.querySelectorAll('.piece-set-option[data-piece-set]');
const BOARD_COLOR_STORAGE_KEY = 'hammerschachBoardColor';
const LEGACY_BOARD_COLOR_STORAGE_KEY = 'hammerschachGamerBoardColor';
const boardColorPresets = [
  {id:'basis', name:'Hammerschach Rubin', light:'#f0d9b5', dark:'#843f46', material:'classic'},
  {id:'braun', name:'Walnuss', light:'#f3ddb7', dark:'#b4875e', material:'classic'},
  {id:'grau', name:'Schiefer', light:'#eeeeee', dark:'#9b9b9b', material:'classic'},
  {id:'gruen', name:'Turniergrün', light:'#eeeed2', dark:'#769656', material:'classic'},
  {
    id:'onyx-elegance',
    name:'Premium · Warm',
    light:'#f2e7d2f0',
    dark:'#7f8389d0',
    material:'onyx-elegance',
    frameDark:'#2a2f34',
    frameMid:'#50555c',
    frameLight:'#b58a43',
    coordLight:'#fff1d4',
    coordDark:'#0d0e10'
  }
];
function boardRgbFromHex(value){
  const normalized = String(value || '').trim().replace(/^#/,'');
  const full = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  if(!/^[0-9a-f]{6}$/i.test(full)) return {r:0,g:0,b:0};
  return {
    r:parseInt(full.slice(0,2),16),
    g:parseInt(full.slice(2,4),16),
    b:parseInt(full.slice(4,6),16)
  };
}
function mixBoardHex(base,overlay,amount){
  const from = boardRgbFromHex(base);
  const to = boardRgbFromHex(overlay);
  const ratio = Math.max(0,Math.min(1,Number(amount) || 0));
  const channel = key => Math.round(from[key] + (to[key] - from[key]) * ratio).toString(16).padStart(2,'0');
  return '#' + channel('r') + channel('g') + channel('b');
}
function applyBoardMaterialVariables(preset){
  const root = document.documentElement.style;
  root.setProperty('--board-frame-dark',preset.frameDark || mixBoardHex(preset.dark,'#000000',.62));
  root.setProperty('--board-frame-mid',preset.frameMid || mixBoardHex(preset.dark,'#000000',.31));
  root.setProperty('--board-frame-light',preset.frameLight || mixBoardHex(preset.dark,'#ffffff',.24));
  root.setProperty('--board-coord-dark',preset.coordDark || mixBoardHex(preset.dark,'#000000',.58));
  root.setProperty('--board-coord-light',preset.coordLight || mixBoardHex(preset.light,'#ffffff',.56));
  document.documentElement.dataset.boardMaterial = preset.material || 'classic';
}
function closeBoardColorPopup(){ boardColorPopup.hidden = true; btnBoardColor.setAttribute('aria-expanded','false'); }
function openBoardColorPopup(){ closePieceSetPopup(); boardColorPopup.hidden = false; btnBoardColor.setAttribute('aria-expanded','true'); }
function closePieceSetPopup(){ pieceSetPopup.hidden = true; btnPieceSet.setAttribute('aria-expanded','false'); }
function openPieceSetPopup(){ closeBoardColorPopup(); pieceSetPopup.hidden = false; btnPieceSet.setAttribute('aria-expanded','true'); }
function applyBoardColorPreset(id, closeAfter, persist = true){
  const preset = boardColorPresets.find(p => p.id === id) || boardColorPresets[0];
  document.documentElement.style.setProperty('--light-square', preset.light);
  document.documentElement.style.setProperty('--dark-square', preset.dark);
  applyBoardMaterialVariables(preset);
  boardColorCurrent.textContent = preset.name;
  boardColorOptions.forEach(btn => btn.classList.toggle('active', btn.dataset.boardColor === preset.id));
  if(persist) try{ localStorage.setItem(BOARD_COLOR_STORAGE_KEY, preset.id); } catch(_){}
  if(closeAfter) closeBoardColorPopup();
}
function applyPieceSetPreset(id, closeAfter = false, persist = true, rerender = true){
  const normalizedId = id === 'rhosgfx' ? 'merida' : id;
  const preset = pieceSetPresets.find(p => p.id === normalizedId) || pieceSetPresets[0];
  activePieceSetId = preset.id;
  document.documentElement.dataset.pieceSet = preset.id;
  Object.assign(pieceImg, preset.paths);
  pieceSetCurrent.textContent = preset.name;
  pieceSetOptions.forEach(btn => btn.classList.toggle('active', btn.dataset.pieceSet === preset.id));
  if(persist) try{ localStorage.setItem(PIECE_SET_STORAGE_KEY, preset.id); } catch(_){}
  if(rerender){
    renderBoard();
    if(variationModeActive) renderVariationBoard();
  }
  if(closeAfter) closePieceSetPopup();
}
btnBoardColor.addEventListener('click', ev => { ev.stopPropagation(); boardColorPopup.hidden ? openBoardColorPopup() : closeBoardColorPopup(); });
btnPieceSet.addEventListener('click', ev => { ev.stopPropagation(); pieceSetPopup.hidden ? openPieceSetPopup() : closePieceSetPopup(); });
boardColorOptions.forEach(btn => btn.addEventListener('click', ev => { ev.stopPropagation(); applyBoardColorPreset(btn.dataset.boardColor, true); }));
pieceSetOptions.forEach(btn => btn.addEventListener('click', ev => { ev.stopPropagation(); applyPieceSetPreset(btn.dataset.pieceSet, true); }));
document.addEventListener('click', ev => {
  if(boardColorWrap && !boardColorWrap.contains(ev.target)) closeBoardColorPopup();
  if(pieceSetWrap && !pieceSetWrap.contains(ev.target)) closePieceSetPopup();
});
document.addEventListener('keydown', ev => { if(ev.key === 'Escape'){ closeBoardColorPopup(); closePieceSetPopup(); } });
let savedBoardColorPreset = 'basis';
try{
  savedBoardColorPreset = localStorage.getItem(BOARD_COLOR_STORAGE_KEY) || localStorage.getItem(LEGACY_BOARD_COLOR_STORAGE_KEY) || 'basis';
  if(savedBoardColorPreset === 'metal-prestige') savedBoardColorPreset = 'onyx-elegance';
  localStorage.setItem(BOARD_COLOR_STORAGE_KEY, savedBoardColorPreset);
  localStorage.removeItem(LEGACY_BOARD_COLOR_STORAGE_KEY);
}catch(_){}
applyBoardColorPreset(savedBoardColorPreset, false, false);
applyPieceSetPreset(activePieceSetId, false, false, false);
window.addEventListener('storage', ev => {
  if(ev.key === BOARD_COLOR_STORAGE_KEY && ev.newValue) applyBoardColorPreset(ev.newValue === 'metal-prestige' ? 'onyx-elegance' : ev.newValue, false, false);
  if(ev.key === PIECE_SET_STORAGE_KEY && ev.newValue) applyPieceSetPreset(ev.newValue, false, false, true);
});
