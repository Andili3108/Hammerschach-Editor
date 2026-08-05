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
  const allowed = live ? ['swiss','arena'] : ['single_round_robin','double_round_robin','swiss','groups_knockout'];
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

