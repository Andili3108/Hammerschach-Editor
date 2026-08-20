'use strict';

function normalizeTournamentMode(value){
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_MODE_CONFIG, value) ? value : 'double_round_robin';
}
function normalizeTournamentType(value){
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_TYPE_CONFIG, value) ? value : 'daily';
}
function defaultTournamentDescription(modeValue, typeValue){
  const type = normalizeTournamentType(typeValue);
  return TOURNAMENT_TYPE_CONFIG[type].label + '-' + TOURNAMENT_MODE_CONFIG[normalizeTournamentMode(modeValue)].label + ': ' + TOURNAMENT_MODE_CONFIG[normalizeTournamentMode(modeValue)].description;
}
function updateTournamentPlayerOptions(preferredValue){
  if(!tournamentPlayersSelect) return;
  const type = normalizeTournamentType(tournamentEditingType);
  const mode = normalizeTournamentMode(tournamentModeSelect ? tournamentModeSelect.value : 'double_round_robin');
  const arena = TOURNAMENT_TYPE_CONFIG[type].live && mode === 'arena';
  if(tournamentPlayersField) tournamentPlayersField.hidden = arena;
  if(arena) return;
  const allowed = TOURNAMENT_TYPE_CONFIG[type].live ? [8,12,16,24,32] : TOURNAMENT_MODE_CONFIG[mode].players;
  const preferred = Number(preferredValue == null ? tournamentPlayersSelect.value : preferredValue);
  tournamentPlayersSelect.innerHTML = '';
  allowed.forEach((players,index) => {
    const option = document.createElement('option');
    option.value = String(players);
    option.textContent = players + ' Teilnehmer';
    option.selected = allowed.includes(preferred) ? players === preferred : index === 0;
    tournamentPlayersSelect.appendChild(option);
  });
}
function updateTournamentModeOptions(preferredMode){
  if(!tournamentModeSelect) return;
  const live = TOURNAMENT_TYPE_CONFIG[normalizeTournamentType(tournamentEditingType)].live;
  const allowed = live ? ['swiss','arena'] : ['single_round_robin','double_round_robin','swiss','groups_knockout','knockout'];
  const requested = allowed.includes(String(preferredMode || '')) ? String(preferredMode) : (live ? 'swiss' : 'double_round_robin');
  tournamentModeSelect.innerHTML = '';
  allowed.forEach(mode => {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = TOURNAMENT_MODE_CONFIG[mode].label;
    option.selected = mode === requested;
    tournamentModeSelect.appendChild(option);
  });
}
function updateTournamentModeUi(preferredPlayers){
  const mode = normalizeTournamentMode(tournamentModeSelect ? tournamentModeSelect.value : 'double_round_robin');
  const arena = TOURNAMENT_TYPE_CONFIG[normalizeTournamentType(tournamentEditingType)].live && mode === 'arena';
  if(tournamentArenaDurationField) tournamentArenaDurationField.hidden = !arena;
  if(tournamentPlayersField) tournamentPlayersField.hidden = arena;
  updateTournamentPlayerOptions(preferredPlayers);
  updateTournamentKnockoutPreview();
}

function tournamentKnockoutRulesText(){
  return 'Jede Begegnung besteht aus zwei gleichzeitig gestarteten Daily-Partien mit vertauschten Farben. Bei 1:1 kommt der Spieler mit dem niedrigeren Rating bei Turnierstart weiter. Beträgt der Ratingunterschied höchstens 25 Punkte, entscheidet das Los. Die nächste Runde beginnt erst, wenn alle Begegnungen der aktuellen Runde beendet sind.';
}
function tournamentKnockoutRoundLabels(playerCount){
  const players = [4,8,16,32].includes(Number(playerCount)) ? Number(playerCount) : 8;
  const labels = [];
  let remaining = players;
  while(remaining > 1){
    if(remaining === 32) labels.push('Runde der 32');
    else if(remaining === 16) labels.push('Achtelfinale');
    else if(remaining === 8) labels.push('Viertelfinale');
    else if(remaining === 4) labels.push('Halbfinale');
    else labels.push('Finale');
    remaining /= 2;
  }
  return labels;
}
function createKnockoutPreviewMatch(label){
  const match = document.createElement('div');
  match.className = 'tournament-bracket-match';
  match.setAttribute('aria-label', label || 'K.-o.-Begegnung');
  ['offen','offen'].forEach((text,index) => {
    const slot = document.createElement('div');
    slot.className = 'tournament-bracket-slot' + (index ? ' tournament-bracket-slot-second' : '');
    const name = document.createElement('span');
    name.className = 'tournament-bracket-player';
    name.textContent = text;
    const score = document.createElement('span');
    score.className = 'tournament-bracket-score';
    score.textContent = '–';
    slot.appendChild(name);
    slot.appendChild(score);
    match.appendChild(slot);
  });
  return match;
}
function renderKnockoutBracket(container, playerCount, options){
  if(!container) return;
  const players = [4,8,16,32].includes(Number(playerCount)) ? Number(playerCount) : 8;
  const labels = tournamentKnockoutRoundLabels(players);
  container.innerHTML = '';
  container.dataset.players = String(players);
  const scroller = document.createElement('div');
  scroller.className = 'tournament-bracket-scroller';
  const tree = document.createElement('div');
  tree.className = 'tournament-bracket-tree';
  tree.style.setProperty('--bracket-first-matches', String(players / 2));
  labels.forEach((label,roundIndex) => {
    const column = document.createElement('section');
    column.className = 'tournament-bracket-round';
    const heading = document.createElement('div');
    heading.className = 'tournament-bracket-round-title';
    heading.textContent = label;
    const matches = document.createElement('div');
    matches.className = 'tournament-bracket-matches';
    const matchCount = Math.max(1, players / Math.pow(2, roundIndex + 1));
    for(let index=0; index<matchCount; index += 1) matches.appendChild(createKnockoutPreviewMatch(label + ' ' + (index + 1)));
    column.appendChild(heading);
    column.appendChild(matches);
    tree.appendChild(column);
  });
  const winner = document.createElement('section');
  winner.className = 'tournament-bracket-round tournament-bracket-winner-round';
  const winnerHeading = document.createElement('div');
  winnerHeading.className = 'tournament-bracket-round-title';
  winnerHeading.textContent = 'Sieger';
  const winnerMatches = document.createElement('div');
  winnerMatches.className = 'tournament-bracket-matches';
  const winnerCard = document.createElement('div');
  winnerCard.className = 'tournament-bracket-winner';
  winnerCard.innerHTML = '<span class="tournament-bracket-trophy">🏆</span><span>offen</span>';
  winnerMatches.appendChild(winnerCard);
  winner.appendChild(winnerHeading);
  winner.appendChild(winnerMatches);
  tree.appendChild(winner);
  scroller.appendChild(tree);
  container.appendChild(scroller);
  if(options && options.rules){
    const rules = document.createElement('div');
    rules.className = 'tournament-bracket-rules';
    rules.textContent = tournamentKnockoutRulesText();
    container.appendChild(rules);
  }
}
function updateTournamentKnockoutPreview(){
  const mode = normalizeTournamentMode(tournamentModeSelect ? tournamentModeSelect.value : 'double_round_robin');
  const players = Number(tournamentPlayersSelect ? tournamentPlayersSelect.value : 8);
  if(tournamentCreateBracketPreview){
    tournamentCreateBracketPreview.hidden = mode !== 'knockout';
    if(mode === 'knockout') renderKnockoutBracket(tournamentCreateBracketPreviewTree, players, {rules:true});
  }
}

function tournamentDefaultScheduleValue(){
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0,0,0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0,16);
}
function tournamentScheduleInputValue(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return tournamentDefaultScheduleValue();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0,16);
}
function updateTournamentTypeUi(typeValue, preferredPlayers, preferredTime, preferredMode){
  tournamentEditingType = normalizeTournamentType(typeValue);
  const config = TOURNAMENT_TYPE_CONFIG[tournamentEditingType];
  tournamentTypeButtons.forEach(button => {
    const active = button.dataset.tournamentType === tournamentEditingType;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  const currentMode = preferredMode || (tournamentModeSelect ? tournamentModeSelect.value : '');
  updateTournamentModeOptions(currentMode);
  if(tournamentModeSelect) tournamentModeSelect.disabled = false;
  if(tournamentModeField) tournamentModeField.title = config.live ? 'Wähle zwischen Schweizer System und offener Arena.' : '';
  if(tournamentPlayersLabel) tournamentPlayersLabel.textContent = config.live ? 'Maximale Teilnehmerzahl' : 'Teilnehmerzahl';
  updateTournamentModeUi(preferredPlayers);
  if(tournamentClockLabel) tournamentClockLabel.textContent = config.live ? (config.label + '-Bedenkzeit') : 'Daily-Bedenkzeit';
  if(tournamentClockSelect){
    const requested = String(preferredTime == null ? tournamentClockSelect.value : preferredTime);
    tournamentClockSelect.innerHTML = '';
    config.times.forEach((item,index) => {
      const option = document.createElement('option');
      option.value = item[0];
      option.textContent = item[1];
      option.selected = config.times.some(entry => entry[0] === requested) ? item[0] === requested : index === 0;
      tournamentClockSelect.appendChild(option);
    });
  }
  if(tournamentScheduleField) tournamentScheduleField.hidden = !config.live;
  if(tournamentScheduleInput){
    tournamentScheduleInput.required = config.live;
    if(config.live && !tournamentScheduleInput.value) tournamentScheduleInput.value = tournamentDefaultScheduleValue();
  }
}
const TOURNAMENT_STATUS_CONFIG = Object.freeze({
  draft:{label:'Entwurf',className:'status-draft'},
  open:{label:'Anmeldung offen',className:'status-open'},
  full:{label:'Ausgebucht',className:'status-full'},
  running:{label:'Läuft',className:'status-running'},
  ended:{label:'Beendet',className:'status-ended'},
  cancelled:{label:'Abgesagt',className:'status-cancelled'}
});
const TOURNAMENT_LIST_CONFIG = Object.freeze({
  current:{title:'Aktuelle Turniere',note:'Turniere mit offener Anmeldung und bereits laufende Wettbewerbe.',empty:'Derzeit ist noch kein Turnier veröffentlicht oder gestartet.'},
  mine:{title:'Meine Turniere',note:'Anmeldungen, Wartelistenplätze sowie laufende und frühere eigene Turniere.',empty:'Du bist derzeit bei keinem veröffentlichten Turnier angemeldet.'},
  archive:{title:'Archiv',note:'Beendete und abgesagte Turniere bleiben mit ihren Ergebnissen einsehbar.',empty:'Das Turnierarchiv ist momentan noch leer.'},
  drafts:{title:'Meine Entwürfe',note:'Serverseitig gespeicherte, noch nicht veröffentlichte Turnierentwürfe.',empty:'Noch keine Turnierentwürfe vorhanden.'}
});
let tournamentActiveListTab = 'current';
let tournamentSelectedId = '';
let tournamentEditingId = '';
let tournamentItems = [];
let tournamentUnreadCount = 0;
let tournamentBannerDismissedId = '';
let tournamentAddressHandled = false;
let activeLiveTournamentStatus = null;
let liveTournamentPollTimer = null;
let liveTournamentPollBusy = false;
let liveTournamentPollGeneration = 0;
let liveTournamentNavigatingRoomId = '';
let liveTournamentClockOffsetMs = 0;
let liveTournamentWaitingTournamentId = '';
let liveTournamentWaitingDismissedKey = '';

