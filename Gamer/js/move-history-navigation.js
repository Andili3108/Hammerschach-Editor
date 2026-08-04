'use strict';

function renderMoveList(){
  const theme = currentTheme();
  const themePly = currentThemePly();
  if(themeMoveNotice){
    themeMoveNotice.hidden = !theme;
    themeMoveNotice.textContent = theme ? ('🎯 Thementurnier: ' + theme.name + ' · ' + themePly + ' vorgegebene Halbzüge. Mit den Pfeilen lässt sich ihre Entstehung vollständig zurückverfolgen.') : '';
  }
  if(masterHistory.length === 0){
    let empty = moveListEl.firstElementChild;
    if(!empty){
      empty = document.createElement('div');
      moveListEl.appendChild(empty);
    }
    empty.className = '';
    empty.textContent = '—';
    empty.removeAttribute('data-move-index');
    while(moveListEl.children.length > 1) moveListEl.lastElementChild.remove();
    return;
  }
  const cells = [];
  for(let i=0; i<masterHistory.length; i+=4){
    const num1 = Math.floor(i/2) + 1;
    const num2 = num1 + 1;
    cells.push({txt:num1 + '.', idx:null}, {txt:masterHistory[i]?.san || '', idx:i}, {txt:masterHistory[i+1]?.san || '', idx:i+1});
    cells.push({txt:masterHistory[i+2] || masterHistory[i+3] ? num2 + '.' : '', idx:null}, {txt:masterHistory[i+2]?.san || '', idx:i+2}, {txt:masterHistory[i+3]?.san || '', idx:i+3});
  }
  const navigationLocked = isMoveNavigationLocked();
  cells.forEach((c, cellIndex) => {
    let div = moveListEl.children[cellIndex];
    if(!div){
      div = document.createElement('div');
      moveListEl.appendChild(div);
    }
    div.className = 'move-cell';
    if(cellIndex % 6 >= 3) div.classList.add('hide-mobile-pair');
    div.textContent = c.txt;
    div.removeAttribute('data-move-index');
    div.title = '';
    div.style.cursor = '';
    if(c.idx !== null){
      div.dataset.moveIndex = String(c.idx);
      if(c.idx < themePly) div.classList.add('theme-move');
      if(c.idx === themePly - 1) div.classList.add('theme-end');
      if(viewIndex === c.idx + 1) div.classList.add('current');
      if(navigationLocked){
        div.title = 'Bitte die Daily-Zugvorschau zuerst bestätigen oder zurücknehmen.';
        div.style.cursor = 'default';
      } else {
        div.title = 'Zu dieser Stellung springen';
        div.style.cursor = 'pointer';
      }
    }
  });
  while(moveListEl.children.length > cells.length) moveListEl.lastElementChild.remove();
}
function updateBoardNavControls(){
  if(!boardNavStartBtn || !boardNavBackBtn || !boardNavForwardBtn || !boardNavEndBtn) return;
  let current = viewIndex;
  let total = masterHistory.length;
  let locked = isMoveNavigationLocked();
  let labels = ['Anfang der Partie','Einen Halbzug zurück','Einen Halbzug vor','Letzte Stellung'];
  if(variationModeActive){
    current = variationHistory.length;
    total = completeVariationLine().length;
    locked = false;
    labels = ['Ausgangsstellung der Variante','Einen Variantenzug zurück','Einen Variantenzug vor','Letzte Variantenstellung'];
  }
  const buttons = [boardNavStartBtn,boardNavBackBtn,boardNavForwardBtn,boardNavEndBtn];
  buttons.forEach((button,index) => {
    button.title = labels[index];
    button.setAttribute('aria-label',labels[index]);
  });
  boardNavStartBtn.disabled = locked || total === 0 || current === 0;
  boardNavBackBtn.disabled = locked || total === 0 || current === 0;
  boardNavForwardBtn.disabled = locked || total === 0 || current === total;
  boardNavEndBtn.disabled = locked || total === 0 || current === total;
}
function updateNavControls(){
  const total = masterHistory.length;
  const locked = isMoveNavigationLocked();
  navStartBtn.disabled = locked || total === 0 || viewIndex === 0;
  navBackBtn.disabled = locked || total === 0 || viewIndex === 0;
  navForwardBtn.disabled = locked || total === 0 || viewIndex === total;
  navEndBtn.disabled = locked || total === 0 || viewIndex === total;
  movesInfoEl.textContent = total === 0 ? '0/0' : viewIndex + '/' + total;
  updateBoardNavControls();
}
function canExportCurrentGamePgn(){
  return masterHistory.length > 0 && !!(onlineGameEnded || gameEnded || timeLost);
}
function updatePgnExportUi(){
  const button = document.getElementById('copyPgnBtn');
  if(!button) return;
  const available = canExportCurrentGamePgn();
  button.hidden = !available;
  button.disabled = !available;
  button.title = available ? 'Beendete Partie als PGN-Datei herunterladen' : 'PGN steht erst nach Partieende bereit';
}
navStartBtn.addEventListener('click', () => { if(isMoveNavigationLocked()) return; viewIndex = 0; selected = null; renderBoard(); });
navBackBtn.addEventListener('click', () => { if(isMoveNavigationLocked()) return; viewIndex = Math.max(0, viewIndex - 1); selected = null; renderBoard(); });
navForwardBtn.addEventListener('click', () => { if(isMoveNavigationLocked()) return; viewIndex = Math.min(masterHistory.length, viewIndex + 1); selected = null; renderBoard(); });
navEndBtn.addEventListener('click', () => { if(isMoveNavigationLocked()) return; viewIndex = masterHistory.length; selected = null; renderBoard(); });
if(boardNavStartBtn) boardNavStartBtn.addEventListener('click', () => {
  if(variationModeActive){ setVariationViewIndex(0); return; }
  if(isMoveNavigationLocked()) return;
  viewIndex = 0;
  selected = null;
  renderBoard();
});
if(boardNavBackBtn) boardNavBackBtn.addEventListener('click', () => {
  if(variationModeActive){ setVariationViewIndex(variationHistory.length - 1); return; }
  if(isMoveNavigationLocked()) return;
  viewIndex = Math.max(0,viewIndex - 1);
  selected = null;
  renderBoard();
});
if(boardNavForwardBtn) boardNavForwardBtn.addEventListener('click', () => {
  if(variationModeActive){ setVariationViewIndex(variationHistory.length + 1); return; }
  if(isMoveNavigationLocked()) return;
  viewIndex = Math.min(masterHistory.length,viewIndex + 1);
  selected = null;
  renderBoard();
});
if(boardNavEndBtn) boardNavEndBtn.addEventListener('click', () => {
  if(variationModeActive){ setVariationViewIndex(completeVariationLine().length); return; }
  if(isMoveNavigationLocked()) return;
  viewIndex = masterHistory.length;
  selected = null;
  renderBoard();
});
