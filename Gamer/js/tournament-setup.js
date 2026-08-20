'use strict';

function normalizeTournamentMode(value){
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_MODE_CONFIG, value) ? value : 'double_round_robin';
}
function normalizeTournamentType(value){
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_TYPE_CONFIG, value) ? value : 'daily';
}

function tournamentAdminStartReadiness(tournament){
  const item = tournament || {};
  const mode = normalizeTournamentMode(item.mode);
  const confirmed = Math.max(0, Number(item.confirmedCount || 0));
  const checkedIn = Math.max(0, Number(item.checkedInCount || 0));
  const maximum = Math.max(0, Number(item.players || 0));
  const live = !!item.live;
  const arena = !!item.arena || (live && mode === 'arena');
  if(arena) return {ok:true, mode, arena:true, count:checkedIn, minimum:0, maximum:0};
  if(mode === 'swiss'){
    const count = live ? checkedIn : confirmed;
    return {ok:count >= 4 && (maximum < 1 || count <= maximum), mode, flexible:true, count, minimum:4, maximum};
  }
  return {ok:maximum > 0 && confirmed === maximum, mode, flexible:false, count:confirmed, minimum:maximum, maximum};
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
function updateTournamentCreationFieldVisibility(){
  const type = normalizeTournamentType(tournamentEditingType);
  const config = TOURNAMENT_TYPE_CONFIG[type];
  const mode = normalizeTournamentMode(tournamentModeSelect ? tournamentModeSelect.value : 'double_round_robin');
  const arena = !!(config.live && mode === 'arena');
  if(tournamentArenaDurationField) tournamentArenaDurationField.hidden = !arena;
  if(tournamentPlayersField) tournamentPlayersField.hidden = arena;
  if(tournamentPlayersLabel) tournamentPlayersLabel.textContent = mode === 'swiss' ? 'Maximale Teilnehmerzahl' : 'Teilnehmerzahl';
  if(tournamentScheduleField) tournamentScheduleField.hidden = false;
  if(tournamentScheduleInput) tournamentScheduleInput.required = true;
  if(tournamentScheduleLabel) tournamentScheduleLabel.textContent = config.live ? 'Starttermin' : 'Geplanter Start';
}
function updateTournamentModeUi(preferredPlayers){
  updateTournamentCreationFieldVisibility();
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
function formatTournamentKnockoutScore(value){
  const score = Number(value || 0);
  if(Math.abs(score - 0.5) < 0.001) return '½';
  if(Math.abs(score - 1.5) < 0.001) return '1½';
  if(Math.abs(score - Math.round(score)) < 0.001) return String(Math.round(score));
  return String(score).replace('.', ',');
}
function tournamentKnockoutParticipantMap(tournament){
  return new Map((Array.isArray(tournament && tournament.participants) ? tournament.participants : []).map(item => [String(item.userId || ''), item]));
}
function tournamentKnockoutResultFor(tournament, roundNumber, pairingNumber){
  return (Array.isArray(tournament && tournament.knockoutResults) ? tournament.knockoutResults : []).find(item => Number(item.roundNumber) === Number(roundNumber) && Number(item.pairingNumber) === Number(pairingNumber)) || null;
}
function tournamentKnockoutGamesFor(tournament, roundNumber, pairingNumber){
  return (Array.isArray(tournament && tournament.games) ? tournament.games : []).filter(game => Number(game.roundNumber) === Number(roundNumber) && Number(game.pairingNumber) === Number(pairingNumber)).sort((a,b) => Number(a.gameNumber || 0) - Number(b.gameNumber || 0));
}
function tournamentKnockoutUserName(participantById, userId, fallback){
  const participant = participantById.get(String(userId || ''));
  return participant && participant.username ? String(participant.username) : (fallback || 'offen');
}
function tournamentKnockoutScoreFromGames(games, userId){
  let score = 0;
  let ended = 0;
  for(const game of games || []){
    if(!game || game.status !== 'ended' || !['1-0','0-1','1/2-1/2'].includes(String(game.result || ''))) continue;
    ended += 1;
    const whiteId = String(game.whiteUserId || '');
    const blackId = String(game.blackUserId || '');
    if(game.result === '1/2-1/2' && [whiteId,blackId].includes(String(userId))) score += 0.5;
    else if(game.result === '1-0' && whiteId === String(userId)) score += 1;
    else if(game.result === '0-1' && blackId === String(userId)) score += 1;
  }
  return {score, ended};
}
function tournamentKnockoutMatchData(tournament, players, roundNumber, pairingNumber){
  if(!tournament) return null;
  const participantById = tournamentKnockoutParticipantMap(tournament);
  const games = tournamentKnockoutGamesFor(tournament, roundNumber, pairingNumber);
  const result = tournamentKnockoutResultFor(tournament, roundNumber, pairingNumber);
  let firstId = '';
  let secondId = '';
  let firstFallback = '';
  let secondFallback = '';
  if(games.length){
    const firstGame = games[0];
    firstId = String(firstGame.whiteUserId || '');
    secondId = String(firstGame.blackUserId || '');
    firstFallback = firstGame.whiteName || '';
    secondFallback = firstGame.blackName || '';
  } else if(Number(roundNumber) === 1 && ['running','ended'].includes(String(tournament.status || ''))){
    const seeded = (Array.isArray(tournament.participants) ? tournament.participants : []).filter(item => item && item.status === 'confirmed').slice().sort((a,b) => Number(a.knockoutSeed || 9999) - Number(b.knockoutSeed || 9999));
    const offset = (Number(pairingNumber) - 1) * 2;
    firstId = seeded[offset] ? String(seeded[offset].userId || '') : '';
    secondId = seeded[offset + 1] ? String(seeded[offset + 1].userId || '') : '';
  } else if(Number(roundNumber) > 1){
    const left = tournamentKnockoutResultFor(tournament, Number(roundNumber) - 1, Number(pairingNumber) * 2 - 1);
    const right = tournamentKnockoutResultFor(tournament, Number(roundNumber) - 1, Number(pairingNumber) * 2);
    firstId = left ? String(left.winnerUserId || '') : '';
    secondId = right ? String(right.winnerUserId || '') : '';
  }
  if(!firstId && result) firstId = String(result.firstUserId || '');
  if(!secondId && result) secondId = String(result.secondUserId || '');
  const firstName = tournamentKnockoutUserName(participantById, firstId, firstFallback || 'offen');
  const secondName = tournamentKnockoutUserName(participantById, secondId, secondFallback || 'offen');
  const firstProgress = firstId ? tournamentKnockoutScoreFromGames(games, firstId) : {score:0, ended:0};
  const secondProgress = secondId ? tournamentKnockoutScoreFromGames(games, secondId) : {score:0, ended:0};
  const anyEnded = Math.max(firstProgress.ended, secondProgress.ended) > 0;
  let description = '';
  if(result){
    const winnerName = tournamentKnockoutUserName(participantById, result.winnerUserId, 'Sieger');
    if(result.resolution === 'lot') description = '1:1 – Ratingunterschied höchstens 25 Punkte; Losentscheid: ' + winnerName + '.';
    else if(result.resolution === 'lower_rating'){
      const winnerRating = String(result.winnerUserId) === String(result.firstUserId) ? result.firstRating : result.secondRating;
      const loserRating = String(result.winnerUserId) === String(result.firstUserId) ? result.secondRating : result.firstRating;
      description = '1:1 – ' + winnerName + ' kommt mit dem niedrigeren Start-Rating weiter (' + winnerRating + ' zu ' + loserRating + ').';
    } else description = winnerName + ' gewinnt die Begegnung ' + formatTournamentKnockoutScore(result.firstScore) + ':' + formatTournamentKnockoutScore(result.secondScore) + '.';
  } else if(anyEnded){
    description = 'Zwischenstand ' + formatTournamentKnockoutScore(firstProgress.score) + ':' + formatTournamentKnockoutScore(secondProgress.score) + '.';
  }
  return {
    first:{userId:firstId,name:firstName,score:anyEnded ? formatTournamentKnockoutScore(firstProgress.score) : '–'},
    second:{userId:secondId,name:secondName,score:anyEnded ? formatTournamentKnockoutScore(secondProgress.score) : '–'},
    winnerUserId:result ? String(result.winnerUserId || '') : '',
    description
  };
}
function createKnockoutPreviewMatch(label, data){
  const match = document.createElement('div');
  match.className = 'tournament-bracket-match';
  const matchData = data || {first:{name:'offen',score:'–',userId:''},second:{name:'offen',score:'–',userId:''},winnerUserId:'',description:''};
  match.setAttribute('aria-label', (label || 'K.-o.-Begegnung') + (matchData.description ? ': ' + matchData.description : ''));
  if(matchData.description) match.title = matchData.description;
  [matchData.first,matchData.second].forEach((entry,index) => {
    const slot = document.createElement('div');
    slot.className = 'tournament-bracket-slot' + (index ? ' tournament-bracket-slot-second' : '');
    if(entry && entry.userId && String(entry.userId) === String(matchData.winnerUserId || '')) slot.classList.add('winner');
    const name = document.createElement('span');
    name.className = 'tournament-bracket-player';
    name.textContent = entry && entry.name ? entry.name : 'offen';
    const score = document.createElement('span');
    score.className = 'tournament-bracket-score';
    score.textContent = entry && entry.score != null ? String(entry.score) : '–';
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
  const tournament = options && options.tournament ? options.tournament : null;
  container.innerHTML = '';
  container.dataset.players = String(players);
  const scroller = document.createElement('div');
  scroller.className = 'tournament-bracket-scroller';
  const tree = document.createElement('div');
  tree.className = 'tournament-bracket-tree';
  tree.style.setProperty('--bracket-first-matches', String(players / 2));
  labels.forEach((label,roundIndex) => {
    const roundNumber = roundIndex + 1;
    const column = document.createElement('section');
    column.className = 'tournament-bracket-round';
    const heading = document.createElement('div');
    heading.className = 'tournament-bracket-round-title';
    heading.textContent = label;
    const matches = document.createElement('div');
    matches.className = 'tournament-bracket-matches';
    const matchCount = Math.max(1, players / Math.pow(2, roundIndex + 1));
    for(let index=0; index<matchCount; index += 1){
      const data = tournament ? tournamentKnockoutMatchData(tournament, players, roundNumber, index + 1) : null;
      matches.appendChild(createKnockoutPreviewMatch(label + ' ' + (index + 1), data));
    }
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
  const finalRound = labels.length;
  const finalResult = tournament ? tournamentKnockoutResultFor(tournament, finalRound, 1) : null;
  let winnerName = 'offen';
  if(finalResult){
    winnerName = tournamentKnockoutUserName(tournamentKnockoutParticipantMap(tournament), finalResult.winnerUserId, 'Sieger');
  } else if(tournament && Array.isArray(tournament.winners) && tournament.winners[0] && tournament.winners[0].username){
    winnerName = String(tournament.winners[0].username);
  }
  const trophy = document.createElement('span');
  trophy.className = 'tournament-bracket-trophy';
  trophy.textContent = '🏆';
  const winnerText = document.createElement('span');
  winnerText.textContent = winnerName;
  winnerCard.appendChild(trophy);
  winnerCard.appendChild(winnerText);
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
  if(tournamentScheduleInput && !tournamentScheduleInput.value) tournamentScheduleInput.value = tournamentDefaultScheduleValue();
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

