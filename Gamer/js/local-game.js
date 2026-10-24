'use strict';

/* Oberfläche für „Zusammen spielen“. Nur der Start benötigt den Mitgliederzugang.
   Züge, Uhren und Ergebnisse dieser Partie werden nicht an den Server gesendet. */
(() => {
  const $ = id => document.getElementById(id);
  const setup = $('localPlayPanel');
  if (!setup) return;
  const modal = newGameBackdrop.querySelector('.new-game-modal');
  const timeSelect = $('localTimeSelect');
  const tabs = [$('onlinePlayTab'), $('localPlayTab')];
  let layout = 'desktop';
  let session = null;
  let room = null;
  let timer = null;
  let selection = null;
  let drag = null;
  let suppressClick = false;
  let orientation = 'w';
  let fixedBottom = 'w';
  let roomOptions = null;
  let promptAction = null;
  let promotionMove = null;
  let previousInert = [];
  let returnFocus = null;

  // Dieselbe Quelle wie die Online-Auswahl, ohne zusätzliche globale Zeit-Selektoren.
  document.querySelectorAll('#liveTimeSelectors select').forEach(select => {
    const group = document.createElement('optgroup');
    group.label = select.options[0].textContent.trim();
    Array.from(select.options).filter(option => option.value).forEach(option => {
      const copy = document.createElement('option');
      copy.value = option.value;
      copy.textContent = option.dataset.timeLabel || option.textContent;
      group.appendChild(copy);
    });
    timeSelect.appendChild(group);
  });

  function selectTab(local) {
    if (directInvitationSetupMember) local = false;
    modal.classList.toggle('local-setup-active', local);
    $('onlinePlayPanel').hidden = local;
    setup.hidden = !local;
    $('localGameStartBtn').hidden = !local;
    tabs.forEach((tab, index) => {
      const active = (index === 1) === local;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    setNewGameDialogStatus('');
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index === 1));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      selectTab(next === 1);
      tabs[next].focus();
    });
  });
  setup.querySelectorAll('[data-local-layout]').forEach(button => button.addEventListener('click', () => {
    layout = button.dataset.localLayout;
    setup.querySelectorAll('[data-local-layout]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    $('localAutoFlipLabel').hidden = layout === 'tablet';
  }));
  timeSelect.addEventListener('change', () => {
    $('localManualClockBox').hidden = timeSelect.value === '0+0';
  });

  function createRoom() {
    room = document.createElement('section');
    room.id = 'localGameRoom';
    room.className = 'local-game-room';
    room.hidden = true;
    room.setAttribute('role', 'dialog');
    room.setAttribute('aria-modal', 'true');
    room.setAttribute('aria-label', 'Zusammen spielen');
    const sideBar = position => `<div class="local-player-bar local-player-${position}" data-position="${position}">
      <button class="local-clock" type="button" data-clock="${position}"><span class="local-clock-time"></span><span class="local-clock-hint" aria-hidden="true"></span></button>
      <div class="local-actions">
        <button type="button" data-action="undo" aria-label="Letzten Zug zurücknehmen" title="Letzten Zug zurücknehmen">↶ <span>Zug zurück</span></button>
        <button type="button" data-action="pause">Ⅱ <span>Pause</span></button>
        <button type="button" data-action="menu" aria-label="Weitere Partieaktionen" aria-expanded="false" aria-controls="localGameMenu">⋯ <span>Mehr</span></button>
      </div>
    </div>`;
    room.innerHTML = `<div class="local-game-table">
      ${sideBar('top')}
      <div class="local-board-frame"><div id="localBoard" class="local-board" role="group" aria-label="Schachbrett"></div></div>
      ${sideBar('bottom')}
      <div class="local-game-footer"><div id="localGameStatus" role="status" aria-live="polite"></div>
        <button type="button" data-action="rematch" class="local-primary" hidden>Revanche</button>
      </div>
    </div>
    <div id="localGameMenu" class="local-dialog-shade" hidden><div class="local-dialog-card" role="dialog" aria-modal="true" aria-label="Partieaktionen">
      <button type="button" data-action="flip">Brett drehen</button>
      <label id="localRoomAutoFlipLabel" class="local-check"><input id="localRoomAutoFlip" type="checkbox"> Brett automatisch drehen</label>
      <button type="button" data-action="draw">Remis vereinbaren</button>
      <button type="button" data-action="resign">Aufgeben</button>
      <button type="button" data-action="new">Neue Partie</button>
      <button type="button" data-action="leave">Zur Lobby</button>
      <button type="button" data-action="close-menu">Zurück zum Brett</button>
    </div></div>
    <div id="localGamePrompt" class="local-dialog-shade" hidden><div class="local-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="localPromptTitle">
      <h3 id="localPromptTitle"></h3><p id="localPromptText"></p><div class="local-prompt-buttons">
      <button type="button" data-action="cancel-prompt">Abbrechen</button><button type="button" data-action="confirm-prompt" class="local-primary">Bestätigen</button></div>
    </div></div>
    <div id="localPromotion" class="local-dialog-shade" hidden><div class="local-dialog-card" role="dialog" aria-modal="true" aria-labelledby="localPromotionTitle">
      <h3 id="localPromotionTitle">Bauernumwandlung</h3><div class="local-promotion-pieces"></div>
      <button type="button" data-action="cancel-promotion">Abbrechen</button>
    </div></div>`;
    document.body.appendChild(room);
    const board = $('localBoard');
    for (let i = 0; i < 64; i++) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = 'local-square';
      square.innerHTML = '<img alt="" draggable="false"><span class="local-coord-file" aria-hidden="true"></span><span class="local-coord-rank" aria-hidden="true"></span>';
      board.appendChild(square);
    }
    room.addEventListener('click', onRoomClick);
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', clearDrag);
    board.addEventListener('lostpointercapture', clearDrag);
    board.addEventListener('dragstart', event => event.preventDefault());
    $('localRoomAutoFlip').addEventListener('change', event => {
      roomOptions.autoFlip = event.target.checked;
      render();
    });
    room.addEventListener('keydown', event => {
      // Keine globalen Online-Tastaturaktionen aus dem lokalen Spiel heraus.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!$('localPromotion').hidden) cancelPromotion();
        else if (!$('localGamePrompt').hidden) closePrompt();
        else if (!$('localGameMenu').hidden) closeMenu();
        else openMenu('bottom');
      }
      if (event.key === 'Tab') trapFocus(event);
      if (event.target.closest('.local-square') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const index = Array.from(board.children).indexOf(event.target.closest('.local-square'));
        const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8}[event.key];
        board.children[Math.max(0, Math.min(63, index + delta))].focus();
      }
    });
  }

  function start() {
    if (!onlineAuthToken || !onlineAuthUser || !isMemberLobbyView() || onlineRoomId) return;
    const [base, increment] = timeSelect.value.split('+').map(Number);
    roomOptions = {layout, autoFlip: $('localAutoFlip').checked, baseMs: base * 1000,
      incrementMs: increment * 1000, manualClock: base > 0 && $('localManualClock').checked};
    if (!room) createRoom();
    returnFocus = newGameOpenBtn;
    closeNewGameDialog({restoreFocus: false});
    previousInert = Array.from(document.body.children).filter(element => element !== room && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName))
      .map(element => ({element, inert: element.inert}));
    previousInert.forEach(({element}) => { element.inert = true; });
    room.hidden = false;
    document.documentElement.classList.add('local-game-open');
    fixedBottom = 'w';
    resetSession();
    hammerschachScheduleHeightReport(true);
    timer = setInterval(tick, 100);
    $('localBoard').querySelector('[data-square="e2"]').focus({preventScroll: true});
  }
  function resetSession() {
    clearDrag();
    session = new LocalChessGame(roomOptions);
    selection = null;
    promotionMove = null;
    promptAction = null;
    ['localGameMenu', 'localGamePrompt', 'localPromotion'].forEach(id => { $(id).hidden = true; });
    room.classList.toggle('local-tablet', roomOptions.layout === 'tablet');
    room.classList.toggle('local-no-clock', !roomOptions.baseMs);
    $('localRoomAutoFlipLabel').hidden = roomOptions.layout === 'tablet';
    $('localRoomAutoFlip').checked = roomOptions.autoFlip;
    render();
  }
  function exit(toSetup = false) {
    clearInterval(timer);
    timer = null;
    clearDrag();
    session = null;
    promotionMove = null;
    promptAction = null;
    room.hidden = true;
    document.documentElement.classList.remove('local-game-open');
    previousInert.forEach(({element, inert}) => { element.inert = inert; });
    previousInert = [];
    hammerschachScheduleHeightReport(true);
    if (toSetup) { openNewGameDialog(); selectTab(true); }
    else {
      const target = [returnFocus, $('mobileNavTestOpen')].find(element => element && !element.hidden && element.offsetParent !== null);
      if (target) target.focus({preventScroll: true});
    }
  }
  function tick() {
    if (!session) return;
    const oldResult = session.result;
    session.settle();
    if (oldResult !== session.result) {
      clearDrag();
      selection = null;
      promotionMove = null;
      $('localPromotion').hidden = true;
      closePrompt(false);
      closeMenu(false);
      render();
    } else renderClocks();
  }
  function sideAt(position) { return position === 'bottom' ? orientation : opposite(orientation); }
  function resultText(result) {
    if (!result) return '';
    const reasons = {checkmate: 'Schachmatt', stalemate: 'Patt', insufficient_material: 'Unzureichendes Material',
      threefold_repetition: 'Dreifache Stellungswiederholung', fivefold_repetition: 'Fünffache Stellungswiederholung',
      fifty_move_rule: '50-Züge-Regel', seventy_five_move_rule: '75-Züge-Regel', timeout: 'Zeit abgelaufen',
      timeout_draw: 'Zeit abgelaufen · kein Mattmaterial', resignation: 'Aufgegeben', agreement: 'Remis vereinbart'};
    return (result.winner ? (result.winner === 'w' ? '1–0' : '0–1') : '½–½') + ' · ' + (reasons[result.type] || 'Partie beendet');
  }
  function piecesFaceTop() {
    // Beide Farben zeigen zur aktiven Sitzseite; das Tablet-Brett bleibt fest.
    return roomOptions.layout === 'tablet' && (session.pendingClock || session.game.turn) !== orientation;
  }
  function render() {
    if (!session) return;
    orientation = roomOptions.layout === 'desktop' && roomOptions.autoFlip
      ? (session.pendingClock || session.game.turn) : fixedBottom;
    const board = $('localBoard');
    board.dataset.orientation = orientation;
    board.setAttribute('aria-label', 'Schachbrett' + (session.result ? ', Partie beendet' : session.paused ? ', Pause' : session.pendingClock ? ', Uhr drücken' : ', ' + (session.game.turn === 'w' ? 'Weiß' : 'Schwarz') + ' am Zug'));
    const legal = selection && session.canMove() ? session.game.legalMoves().filter(move => move.from[0] === selection[0] && move.from[1] === selection[1]) : [];
    const last = session.history.length ? session.history[session.history.length - 1].move : null;
    const king = session.game.inCheck(session.game.turn) ? session.game.findKing(session.game.turn) : null;
    const names = {p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König'};
    Array.from(board.children).forEach((square, index) => {
      const row = Math.floor(index / 8), col = index % 8;
      const x = orientation === 'w' ? col : 7 - col, y = orientation === 'w' ? row : 7 - row;
      const piece = session.game.at(x, y);
      const color = pieceColor(piece);
      square.dataset.x = x; square.dataset.y = y; square.dataset.square = coordToAlg(x, y);
      square.classList.toggle('local-dark', (x + y) % 2 === 1);
      square.classList.toggle('local-selected', !!selection && selection[0] === x && selection[1] === y);
      square.classList.toggle('local-legal', legal.some(move => move.to[0] === x && move.to[1] === y));
      square.classList.toggle('local-last', !!last && [last.from, last.to].some(at => at[0] === x && at[1] === y));
      square.classList.toggle('local-check-square', !!king && king[0] === x && king[1] === y);
      const img = square.querySelector('img');
      img.hidden = piece === '.';
      if (piece !== '.') img.src = pieceImg[piece];
      img.classList.toggle('local-opponent-piece', piecesFaceTop());
      square.querySelector('.local-coord-file').textContent = row === 7 ? files[x] : '';
      square.querySelector('.local-coord-rank').textContent = col === 0 ? String(8 - y) : '';
      square.setAttribute('aria-label', coordToAlg(x, y) + (piece !== '.' ? ' · ' + (color === 'w' ? 'weißer ' : 'schwarzer ') + names[piece.toLowerCase()] : ' · leer'));
      square.tabIndex = selection && selection[0] === x && selection[1] === y || !selection && index === 56 ? 0 : -1;
    });
    const status = session.result ? resultText(session.result) : session.paused ? 'Pause' : king ? 'Schach' : '';
    $('localGameStatus').textContent = status;
    room.querySelectorAll('[data-action="undo"]').forEach(button => { button.disabled = !session.history.length; });
    room.querySelectorAll('[data-action="pause"]').forEach(button => {
      button.hidden = !roomOptions.baseMs;
      button.disabled = !session.started || !!session.result;
      button.innerHTML = session.paused ? '▶ <span>Weiter</span>' : 'Ⅱ <span>Pause</span>';
      button.setAttribute('aria-pressed', String(session.paused));
      button.setAttribute('aria-label', session.paused ? 'Partie fortsetzen' : 'Partie pausieren');
    });
    room.querySelectorAll('[data-action="draw"], [data-action="resign"]').forEach(button => { button.disabled = !!session.result; });
    room.querySelector('[data-action="rematch"]').hidden = !session.result;
    board.classList.toggle('local-board-paused', session.paused);
    renderClocks();
    hammerschachScheduleHeightReport(false);
  }
  function renderClocks() {
    room.querySelectorAll('[data-clock]').forEach(clock => {
      const side = sideAt(clock.dataset.clock);
      const pending = session.pendingClock === side && !session.paused && !session.result;
      clock.classList.toggle('local-clock-white', side === 'w');
      clock.classList.toggle('local-clock-black', side === 'b');
      clock.classList.toggle('local-clock-active', session.runningSide === side && !session.paused && !session.result);
      clock.classList.toggle('local-clock-pending', pending);
      clock.disabled = !pending;
      clock.querySelector('.local-clock-time').textContent = formatTime(session.clocks[side]);
      clock.querySelector('.local-clock-hint').textContent = pending ? 'Drücken' : '';
      clock.setAttribute('aria-label', (side === 'w' ? 'Weiße' : 'Schwarze') + ' Uhr, ' + formatTime(session.clocks[side]) + (pending ? ', jetzt drücken' : ''));
    });
  }
  function boardReady() {
    if (!session) return false;
    tick();
    return session.canMove() && !promotionMove && $('localGamePrompt').hidden && $('localGameMenu').hidden;
  }
  function chooseSquare(x, y) {
    if (!boardReady()) return;
    const piece = session.game.at(x, y);
    if (selection && selection[0] === x && selection[1] === y) { selection = null; render(); return; }
    if (selection) {
      const found = findMatchingLegalMove(session.game.legalMoves(), {from: selection, to: [x, y]});
      if (found) { attemptMove(selection.slice(), [x, y]); return; }
    }
    selection = pieceColor(piece) === session.game.turn ? [x, y] : null;
    render();
  }
  function attemptMove(from, to, promotion = null) {
    const outcome = session.move(from, to, promotion);
    if (outcome.promotion) { openPromotion(from, to); return; }
    if (outcome.ok) {
      selection = null;
      const move = outcome.move;
      playMoveSound({capture: move.taken !== '.', castle: !!move.meta.castle, promotion: !!move.promotion, check: session.game.inCheck(session.game.turn)});
    }
    render();
  }
  function openPromotion(from, to) {
    promotionMove = {from, to};
    const holder = $('localPromotion').querySelector('.local-promotion-pieces');
    holder.replaceChildren();
    const names = {Q: 'Dame', R: 'Turm', B: 'Läufer', N: 'Springer'};
    Object.entries(names).forEach(([piece, name]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.promotion = piece; button.setAttribute('aria-label', name);
      const img = document.createElement('img'); img.src = pieceImg[session.game.turn === 'w' ? piece : piece.toLowerCase()]; img.alt = name;
      button.appendChild(img); holder.appendChild(button);
    });
    showLayer('localPromotion', roomOptions.layout === 'tablet' && session.game.turn !== orientation);
  }
  function cancelPromotion() {
    promotionMove = null; selection = null; $('localPromotion').hidden = true; render(); focusBoard();
  }
  function focusBoard() { $('localBoard').querySelector('[tabindex="0"]').focus({preventScroll: true}); }
  function showLayer(id, rotated) {
    const layer = $(id);
    layer.classList.toggle('local-layer-rotated', !!rotated);
    layer.hidden = false;
    layer.querySelector('button:not([disabled])').focus({preventScroll: true});
  }
  function openMenu(position) {
    $('localGameMenu').dataset.side = sideAt(position);
    const rotated = roomOptions.layout === 'tablet' && position === 'top';
    showLayer('localGameMenu', rotated);
    room.querySelectorAll('[data-action="menu"]').forEach(button => button.setAttribute('aria-expanded', 'true'));
  }
  function closeMenu(focus = true) {
    $('localGameMenu').hidden = true;
    room.querySelectorAll('[data-action="menu"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (focus && session) focusBoard();
  }
  function ask(title, text, action) {
    const rotated = !$('localGameMenu').hidden && $('localGameMenu').classList.contains('local-layer-rotated');
    closeMenu(false);
    promptAction = action;
    $('localPromptTitle').textContent = title;
    $('localPromptText').textContent = text;
    showLayer('localGamePrompt', rotated);
  }
  function closePrompt(focus = true) {
    promptAction = null; $('localGamePrompt').hidden = true;
    if (focus && session) focusBoard();
  }
  function onRoomClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || !session) return;
    if (button.classList.contains('local-square')) {
      if (!suppressClick) chooseSquare(Number(button.dataset.x), Number(button.dataset.y));
      return;
    }
    if (button.dataset.promotion && promotionMove) {
      const move = promotionMove; promotionMove = null; $('localPromotion').hidden = true;
      attemptMove(move.from, move.to, button.dataset.promotion); focusBoard(); return;
    }
    if (button.dataset.clock) { session.pressClock(sideAt(button.dataset.clock)); render(); return; }
    const action = button.dataset.action;
    if (action === 'undo') { clearDrag(); selection = null; session.undo(); render(); }
    if (action === 'pause') { clearDrag(); selection = null; session.togglePause(); render(); }
    if (action === 'menu') openMenu(button.closest('[data-position]').dataset.position);
    if (action === 'close-menu') closeMenu();
    if (action === 'cancel-prompt') closePrompt();
    if (action === 'cancel-promotion') cancelPromotion();
    if (action === 'confirm-prompt') { const next = promptAction; closePrompt(false); if (next) next(); }
    if (action === 'flip') {
      fixedBottom = opposite(orientation); roomOptions.autoFlip = false; $('localRoomAutoFlip').checked = false;
      closeMenu(false); render(); focusBoard();
    }
    if (action === 'draw') ask('Remis vereinbaren?', 'Sind beide mit dem Remis einverstanden?', () => { session.agreeDraw(); render(); focusBoard(); });
    if (action === 'resign') {
      const side = roomOptions.layout === 'tablet' ? $('localGameMenu').dataset.side : (session.pendingClock || session.game.turn);
      ask('Partie aufgeben?', (side === 'w' ? 'Weiß' : 'Schwarz') + ' gibt diese Partie auf.', () => { session.resign(side); render(); focusBoard(); });
    }
    if (action === 'leave' || action === 'new') {
      const leave = () => exit(action === 'new');
      if (session.started && !session.result) ask(action === 'new' ? 'Neue Partie?' : 'Zur Lobby?', 'Die laufende Partie wird beendet.', leave);
      else leave();
    }
    if (action === 'rematch') {
      fixedBottom = opposite(fixedBottom); resetSession(); focusBoard();
    }
  }
  function onPointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || !boardReady()) return;
    const square = event.target.closest('.local-square');
    if (!square) return;
    const from = [Number(square.dataset.x), Number(square.dataset.y)];
    if (pieceColor(session.game.at(...from)) !== session.game.turn) return;
    drag = {pointer: event.pointerId, from, x: event.clientX, y: event.clientY, moved: false, ghost: null};
    $('localBoard').setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) {
      drag.moved = true; selection = drag.from.slice(); render();
      drag.ghost = document.createElement('img'); drag.ghost.className = 'local-drag-ghost';
      drag.ghost.src = pieceImg[session.game.at(...drag.from)]; drag.ghost.alt = '';
      drag.ghost.style.transform = 'translate(-50%, -50%)' + (piecesFaceTop() ? ' rotate(180deg)' : '');
      drag.ghost.style.width = ($('localBoard').getBoundingClientRect().width / 8) + 'px';
      room.appendChild(drag.ghost);
    }
    if (drag.ghost) { drag.ghost.style.left = event.clientX + 'px'; drag.ghost.style.top = event.clientY + 'px'; }
  }
  function onPointerUp(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const move = drag;
    const square = document.elementFromPoint(event.clientX, event.clientY)?.closest('#localBoard .local-square');
    clearDrag();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (move.moved) {
      if (square && boardReady()) attemptMove(move.from, [Number(square.dataset.x), Number(square.dataset.y)]);
      else { selection = null; render(); }
    } else if (square) chooseSquare(Number(square.dataset.x), Number(square.dataset.y));
  }
  function clearDrag() {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.ghost) previous.ghost.remove();
    const board = $('localBoard');
    if (board && board.hasPointerCapture(previous.pointer)) board.releasePointerCapture(previous.pointer);
  }
  function trapFocus(event) {
    const layer = ['localPromotion', 'localGamePrompt', 'localGameMenu'].map($).find(element => !element.hidden) || room;
    const focusable = Array.from(layer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
      .filter(element => !element.hidden && element.offsetParent !== null && element.tabIndex >= 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (!layer.contains(document.activeElement) || event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  window.addEventListener('beforeunload', event => {
    if (session && session.started && !session.result) { event.preventDefault(); event.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (session) { clearDrag(); tick(); } });
  $('localGameStartBtn').addEventListener('click', start);
  window.HammerschachLocalPlay = {
    prepareDialog(options = {}) {
      $('playModeTabs').hidden = !!options.directInvitation;
      selectTab(false);
    }
  };
})();
