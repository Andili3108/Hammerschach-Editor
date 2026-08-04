'use strict';

const GAME_VARIANT_STORAGE_KEY = 'hammerschachGamerVariant';
const FREESTYLE_POSITION_STORAGE_KEY = 'hammerschachGamerFreestylePositionId';
const FREESTYLE_BACK_RANK_STORAGE_KEY = 'hammerschachGamerFreestyleBackRank';
let currentGameSetup = {variant: GAME_VARIANT_STANDARD, positionId: null, backRank: STANDARD_BACK_RANK};

function normalizeThemeDefinition(value){
  if(!value || typeof value !== 'object') return null;
  const moves = (Array.isArray(value.moves) ? value.moves : []).slice(0,40).map(move => {
    if(!move || !Array.isArray(move.from) || !Array.isArray(move.to)) return null;
    const from = move.from.slice(0,2).map(Number);
    const to = move.to.slice(0,2).map(Number);
    if(from.concat(to).some(square => !Number.isInteger(square) || square < 0 || square > 7)) return null;
    const promotion = ['Q','R','B','N'].includes(String(move.promotion || '').toUpperCase()) ? String(move.promotion).toUpperCase() : null;
    const castle = ['K','Q'].includes(String(move.castle || '').toUpperCase()) ? String(move.castle).toUpperCase() : null;
    return {from,to,promotion,castle,san:String(move.san || '').trim().slice(0,40)};
  }).filter(Boolean);
  const name = String(value.name || '').replace(/\s+/g,' ').trim().slice(0,100);
  if(!name || !moves.length) return null;
  return {
    id:String(value.id || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48),
    name,
    eco:String(value.eco || '').replace(/\s+/g,' ').trim().slice(0,12),
    moveText:String(value.moveText || value.move_text || '').replace(/\s+/g,' ').trim().slice(0,500),
    idea:String(value.idea || '').replace(/\s+/g,' ').trim().slice(0,500),
    startPly:moves.length,
    sideToMove:moves.length % 2 === 0 ? 'w' : 'b',
    moves
  };
}
function themeSignature(value){
  const theme = normalizeThemeDefinition(value);
  if(!theme) return '';
  return theme.id + '|' + theme.name + '|' + theme.moves.map(move => move.from.join('') + '-' + move.to.join('') + '-' + (move.promotion || '') + '-' + (move.castle || '')).join(',');
}
function normalizeGameSetup(setup){
  setup = setup || {};
  const variant = String(setup.variant || setup.mode || '').toLowerCase() === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD;
  if(variant !== GAME_VARIANT_FREESTYLE){
    return {variant: GAME_VARIANT_STANDARD, positionId: null, backRank: STANDARD_BACK_RANK, theme:normalizeThemeDefinition(setup.theme || setup.openingTheme || setup.opening_theme)};
  }
  let positionId = Number.isFinite(Number(setup.positionId ?? setup.position_id)) ? Math.floor(Number(setup.positionId ?? setup.position_id)) : null;
  if(positionId !== null) positionId = Math.max(0, Math.min(959, positionId));
  let backRank = String(setup.backRank || setup.back_rank || '').toUpperCase();

  /* Migration älterer Hammerschach-Stellungen:
     Eine vorhandene gültige Grundreihe ist maßgeblich. Ihre Nummer wird immer
     neu nach dem weltweit üblichen Scharnagl-Schema 0–959 berechnet. */
  if(isValidChess960BackRank(backRank)){
    positionId = chess960IdByBackRank(backRank);
  } else {
    positionId = positionId !== null ? positionId : 0;
    backRank = chess960BackRankById(positionId);
  }
  return {variant: GAME_VARIANT_FREESTYLE, positionId, backRank, theme:null};
}
function sameGameSetup(a,b){
  const left = normalizeGameSetup(a);
  const right = normalizeGameSetup(b);
  return left.variant === right.variant && left.positionId === right.positionId && left.backRank === right.backRank && themeSignature(left.theme) === themeSignature(right.theme);
}
function setupLabel(setup){
  const normalized = normalizeGameSetup(setup || currentGameSetup);
  if(normalized.theme) return 'Thementurnier · ' + normalized.theme.name + ' · Vorgabe: ' + (normalized.theme.moveText || (normalized.theme.startPly + ' Halbzüge'));
  if(normalized.variant !== GAME_VARIANT_FREESTYLE) return 'Klassisches Schach: normale Startstellung.';
  return 'Freestyle-Stellung #' + normalized.positionId + ' · Grundreihe: ' + normalized.backRank;
}
function loadGameSetupPreference(){
  let variant = GAME_VARIANT_STANDARD;
  let positionId = null;
  let backRank = '';
  try{
    variant = localStorage.getItem(GAME_VARIANT_STORAGE_KEY) || GAME_VARIANT_STANDARD;
    positionId = localStorage.getItem(FREESTYLE_POSITION_STORAGE_KEY);
    backRank = localStorage.getItem(FREESTYLE_BACK_RANK_STORAGE_KEY) || '';
  } catch(_){}
  currentGameSetup = normalizeGameSetup({variant, positionId, backRank});
  try{
    if(currentGameSetup.variant === GAME_VARIANT_FREESTYLE){
      localStorage.setItem(FREESTYLE_POSITION_STORAGE_KEY, String(currentGameSetup.positionId));
      localStorage.setItem(FREESTYLE_BACK_RANK_STORAGE_KEY, currentGameSetup.backRank);
    }
  } catch(_){}
}
function saveGameSetupPreference(setup){
  const normalized = normalizeGameSetup(setup);
  currentGameSetup = normalized;
  try{
    localStorage.setItem(GAME_VARIANT_STORAGE_KEY, normalized.variant);
    if(normalized.variant === GAME_VARIANT_FREESTYLE){
      localStorage.setItem(FREESTYLE_POSITION_STORAGE_KEY, String(normalized.positionId));
      localStorage.setItem(FREESTYLE_BACK_RANK_STORAGE_KEY, normalized.backRank);
    }
  } catch(_){}
  return normalized;
}
loadGameSetupPreference();
