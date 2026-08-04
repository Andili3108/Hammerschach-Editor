'use strict';

function currentTheme(){
  return normalizeGameSetup(currentGameSetup).theme;
}
function currentThemePly(){
  const theme = currentTheme();
  return theme ? theme.moves.length : 0;
}
function actualMoveCount(){
  return Math.max(0, masterHistory.length - currentThemePly());
}
function buildThemeHistory(setup){
  const normalized = normalizeGameSetup(setup || currentGameSetup);
  const theme = normalized.theme;
  if(!theme) return [];
  const g = new Game({variant:GAME_VARIANT_STANDARD});
  const history = [];
  for(let index=0; index<theme.moves.length; index++){
    const source = theme.moves[index];
    const found = findMatchingLegalMove(g.legalMoves(), source);
    if(!found){
      console.warn('Themenzug konnte nicht aufgebaut werden:', theme.name, index + 1);
      return [];
    }
    const before = g.clone();
    const mv = {from:found.from.slice(),to:found.to.slice(),meta:clone(found.meta || {}),promotion:source.promotion || null,themePreset:true,themeIndex:index};
    const applied = g.makeMove(mv,false);
    mv.piece = applied.piece;
    mv.taken = applied.taken;
    mv.san = source.san || moveToSan(before,mv,g);
    history.push(mv);
  }
  return history;
}

function buildHistoryState(n){
  const safeN = Math.max(0, Math.min(Number(n) || 0, masterHistory.length));
  const cached = historyStateCache.get(safeN);
  if(cached && cached.revision === masterHistoryRevision) return cached;
  const g = new Game();
  const counts = new Map();
  const addCurrent = () => {
    const key = g.repetitionKey();
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  addCurrent();
  for(let i=0; i<safeN; i++){
    const h = masterHistory[i];
    const legal = g.legalMoves();
    const found = findMatchingLegalMove(legal, h);
    const mv = found ? {from:found.from, to:found.to, meta:found.meta || {}, promotion:h.promotion || null} : {from:h.from, to:h.to, meta:h.meta || {}, promotion:h.promotion || null};
    g.makeMove(mv, true);
    addCurrent();
  }
  const state = {
    revision:masterHistoryRevision,
    game:g,
    positionCounts:counts,
    repetitionCount:counts.get(g.repetitionKey()) || 1
  };
  historyStateCache.set(safeN,state);
  return state;
}
function buildGameFromHistory(n){
  return buildHistoryState(n).game;
}
function repetitionCountForHistory(n){
  return buildHistoryState(n).repetitionCount;
}
function gameOverForHistory(n, gameState){
  const g = gameState || buildGameFromHistory(n);
  return g.gameOver(repetitionCountForHistory(n));
}
function drawReasonText(type){
  if(type === 'insufficient_material') return 'Remis — unzureichendes Mattmaterial.';
  if(type === 'fifty_move_rule') return 'Remis — 50-Züge-Regel.';
  if(type === 'threefold_repetition') return 'Remis — dreifache Stellungswiederholung.';
  if(type === 'stalemate') return 'Patt — Unentschieden';
  return 'Remis — Unentschieden';
}
let boardRenderFrame = null;
let boardRenderReceivedAt = 0;
function scheduleBoardRender(messageReceivedAt){
  const startedAt = Number(messageReceivedAt || 0);
  if(Number.isFinite(startedAt) && startedAt > 0 && (!boardRenderReceivedAt || startedAt < boardRenderReceivedAt)){
    boardRenderReceivedAt = startedAt;
  }
  if(boardRenderFrame !== null) return;
  boardRenderFrame = requestAnimationFrame(() => {
    boardRenderFrame = null;
    const receivedAt = boardRenderReceivedAt;
    boardRenderReceivedAt = 0;
    renderBoard();
    if(receivedAt) recordOnlinePerformance('remoteRenderMs',performance.now() - receivedAt);
  });
}
