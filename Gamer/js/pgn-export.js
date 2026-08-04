'use strict';

function pgnEscapeTagValue(value){
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ')
    .trim();
}
function fenBoardPartFromBoard(board){
  return board.map(row => {
    let out = '';
    let empty = 0;
    row.forEach(piece => {
      if(!piece || piece === '.'){ empty++; return; }
      if(empty){ out += String(empty); empty = 0; }
      out += piece;
    });
    if(empty) out += String(empty);
    return out;
  }).join('/');
}
function initialFenForSetup(setup){
  const g = new Game(setup);
  return fenBoardPartFromBoard(g.board) + ' w KQkq - 0 1';
}
function currentPgnDate(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '.' + m + '.' + day;
}
function pgnPlayerNameForRole(role){
  if(onlineRoomId) return cleanDisplayName(onlineSideName(role)) || (role === 'w' ? 'Weiß' : 'Schwarz');
  return role === 'w' ? 'Weiß' : 'Schwarz';
}
function pgnTimeControlTag(){
  if(!timeMode || !baseTimeMs || isDailyTimeControl()) return '-';
  return Math.floor(baseTimeMs / 1000) + '+' + Math.floor(incrementMs / 1000);
}
function pgnResultFromState(go){
  if(onlineGameResult && onlineGameResult !== '*') return onlineGameResult;
  if(timeLost){
    const g = buildGameFromHistory(masterHistory.length);
    return g.turn === 'w' ? '0-1' : '1-0';
  }
  if(go && go.type === 'checkmate') return go.winner === 'w' ? '1-0' : '0-1';
  if(go) return '1/2-1/2';
  return '*';
}
function buildPgnMoveText(result){
  const parts = [];
  for(let i=0; i<masterHistory.length; i+=2){
    parts.push((Math.floor(i/2)+1) + '.');
    if(masterHistory[i] && masterHistory[i].san) parts.push(masterHistory[i].san);
    if(masterHistory[i+1] && masterHistory[i+1].san) parts.push(masterHistory[i+1].san);
  }
  parts.push(result || '*');
  return parts.join(' ');
}
function buildPgn(){
  const setup = normalizeGameSetup(currentGameSetup);
  const g = buildGameFromHistory(masterHistory.length);
  const go = gameOverForHistory(masterHistory.length, g);
  const result = pgnResultFromState(go);
  const tags = [
    ['Event', 'Hammerschach-Gamer'],
    ['Site', 'Andili.de'],
    ['Date', currentPgnDate()],
    ['Round', '-'],
    ['White', pgnPlayerNameForRole('w')],
    ['Black', pgnPlayerNameForRole('b')],
    ['Result', result],
    ['TimeControl', pgnTimeControlTag()]
  ];
  if(isDailyTimeControl()){
    tags.push(['HammerschachMode', 'Daily']);
    tags.push(['HammerschachDaysPerMove', String(Math.max(1, Math.round(baseTimeMs / 86400000)))]);
  }
  if(setup.variant === GAME_VARIANT_FREESTYLE){
    tags.push(['Variant', 'Chess960']);
    tags.push(['SetUp', '1']);
    tags.push(['FEN', initialFenForSetup(setup)]);
    tags.push(['HammerschachPosition', String(setup.positionId)]);
    tags.push(['HammerschachBackRank', setup.backRank]);
  }
  if(setup.theme){
    tags.push(['HammerschachTournamentTheme', '1']);
    tags.push(['Opening', setup.theme.name]);
    tags.push(['ThemeStartPly', String(setup.theme.startPly)]);
    if(setup.theme.moveText) tags.push(['HammerschachThemeMoves', setup.theme.moveText]);
  }
  const header = tags.map(([key, value]) => '[' + key + ' "' + pgnEscapeTagValue(value) + '"]').join('\n');
  return header + '\n\n' + buildPgnMoveText(result);
}
function safePgnFilePart(value){
  return String(value || '')
    .replace(/[^A-Za-z0-9_\-äöüÄÖÜß]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'Partie';
}
function buildPgnFileName(){
  const setup = normalizeGameSetup(currentGameSetup);
  const datePart = currentPgnDate().replace(/\./g, '-');
  const variantPart = setup.theme ? ('Thementurnier-' + safePgnFilePart(setup.theme.name)) : (setup.variant === GAME_VARIANT_FREESTYLE ? 'Freestyle-' + String(setup.positionId) : 'Klassisch');
  const whitePart = safePgnFilePart(pgnPlayerNameForRole('w'));
  const blackPart = safePgnFilePart(pgnPlayerNameForRole('b'));
  return safePgnFilePart('Hammerschach-' + datePart + '-' + variantPart + '-' + whitePart + '-vs-' + blackPart) + '.pgn';
}
function downloadPgnFile(){
  if(!canExportCurrentGamePgn()){
    updatePgnExportUi();
    return;
  }
  const pgn = buildPgn();
  if(!pgn){
    statusEl.textContent = 'Noch keine PGN-Daten vorhanden.';
    return;
  }
  try{
    const blob = new Blob([pgn + '\n'], {type:'application/x-chess-pgn;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildPgnFileName();
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try{ URL.revokeObjectURL(url); } catch(_){}
      try{ link.remove(); } catch(_){}
    }, 1000);
    statusEl.textContent = 'PGN-Datei wurde erstellt.';
  } catch(_){
    statusEl.textContent = 'PGN-Datei konnte nicht erzeugt werden.';
  }
  setTimeout(() => renderBoard(), 1000);
}
document.getElementById('copyPgnBtn').addEventListener('click', downloadPgnFile);
