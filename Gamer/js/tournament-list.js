'use strict';

function createLocalTournamentId(){
  return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9);
}
function normalizeLocalTournament(value, index){
  if(!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim().slice(0,80);
  if(!name) return null;
  const tournamentType = normalizeTournamentType(value.tournamentType);
  const live = value.live === true || TOURNAMENT_TYPE_CONFIG[tournamentType].live;
  const requestedMode = normalizeTournamentMode(value.mode);
  const mode = live ? (requestedMode === 'arena' ? 'arena' : 'swiss') : requestedMode;
  const allowedPlayers = mode === 'arena' ? [0] : (live ? [8,12,16,24,32] : TOURNAMENT_MODE_CONFIG[mode].players);
  const players = mode === 'arena' ? 0 : (allowedPlayers.includes(Number(value.players)) ? Number(value.players) : allowedPlayers[0]);
  const hours = [24,48,72].includes(Number(value.hours)) ? Number(value.hours) : 24;
  const status = Object.prototype.hasOwnProperty.call(TOURNAMENT_STATUS_CONFIG, value.status) ? value.status : 'draft';
  const createdAt = String(value.createdAt || value.created_at || new Date().toISOString());
  const updatedAt = String(value.updatedAt || value.updated_at || createdAt);
  const participants = Array.isArray(value.participants) ? value.participants.slice(0,2000) : [];
  const userState = ['confirmed','waiting','playing','finished','absent'].includes(String(value.userState || '')) ? String(value.userState) : '';
  const theme = themeCatalogEntry(value.theme || value.openingTheme || value.opening_theme);
  return {
    id:String(value.id || ('local_migrated_' + Date.now().toString(36) + '_' + Number(index || 0))).slice(0,100),
    name,
    description:String(value.description || '').trim().slice(0,1200),
    players,
    hours,
    rated:value.rated !== false,
    variant:theme ? GAME_VARIANT_STANDARD : (value.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD),
    theme,
    mode,
    modeLabel:String(value.modeLabel || TOURNAMENT_MODE_CONFIG[mode].label),
    tournamentType,
    tournamentTypeLabel:String(value.tournamentTypeLabel || TOURNAMENT_TYPE_CONFIG[tournamentType].label),
    live,
    timeKey:String(value.timeKey || ''),
    timeLabel:String(value.timeLabel || (live ? '' : (hours + ' Stunden pro Zug'))),
    scheduledStartAt:value.scheduledStartAt || null,
    arena:mode === 'arena' || value.arena === true,
    arenaDurationMinutes:[60,90,120,180,240,1440].includes(Number(value.arenaDurationMinutes)) ? Number(value.arenaDurationMinutes) : (mode === 'arena' ? 90 : null),
    arenaEndsAt:value.arenaEndsAt || null,
    arenaClosedAt:value.arenaClosedAt || null,
    arenaActive:Math.max(0,Math.min(2,Number(value.arenaActive || 0))),
    arenaPairingNotBefore:value.arenaPairingNotBefore || value.pairingNotBefore || null,
    arenaRunningGames:Math.max(0,Number(value.arenaRunningGames || 0)),
    canArenaJoin:value.canArenaJoin === true,
    checkInOpensAt:value.checkInOpensAt || null,
    checkInOpen:value.checkInOpen === true,
    nextRoundAt:value.nextRoundAt || null,
    roundPauseSeconds:Math.max(10,Number(value.roundPauseSeconds || 60)),
    status,
    participants,
    confirmedCount:Math.max(0,Number(value.confirmedCount || participants.filter(item => item && item.status === 'confirmed').length)),
    waitingCount:Math.max(0,Number(value.waitingCount || participants.filter(item => item && item.status === 'waiting').length)),
    checkedInCount:Math.max(0,Number(value.checkedInCount || participants.filter(item => item && item.status === 'confirmed' && item.checkedIn).length)),
    checkedIn:value.checkedIn === true,
    canCheckIn:value.canCheckIn === true,
    currentRound:Math.max(0,Number(value.currentRound || 0)),
    totalRounds:Math.max(0,Number(value.totalRounds || 0)),
    rounds:Array.isArray(value.rounds) ? value.rounds : [],
    games:Array.isArray(value.games) ? value.games : [],
    byes:Array.isArray(value.byes) ? value.byes : [],
    standings:Array.isArray(value.standings) ? value.standings : [],
    groupStandings:Array.isArray(value.groupStandings) ? value.groupStandings : [],
    winners:Array.isArray(value.winners) ? value.winners : [],
    waitlistPosition:value.waitlistPosition == null ? null : Number(value.waitlistPosition),
    unread:value.unread === true,
    userState,
    createdAt,
    updatedAt
  };
}
function saveLocalTournamentList(tournaments){
  try{
    localStorage.setItem(TOURNAMENT_LIST_STORAGE_KEY, JSON.stringify({version:2,tournaments:tournaments.map((item,index) => normalizeLocalTournament(item,index)).filter(Boolean)}));
    return true;
  } catch(_){ return false; }
}
function loadLocalTournamentList(){
  return tournamentItems.slice();
}
function tournamentStatusInfo(status){
  return TOURNAMENT_STATUS_CONFIG[status] || TOURNAMENT_STATUS_CONFIG.draft;
}
function tournamentBelongsToList(tournament, tabName){
  if(tabName === 'drafts') return tournament.status === 'draft';
  if(tabName === 'current') return ['open','full','running'].includes(tournament.status);
  if(tabName === 'archive') return ['ended','cancelled'].includes(tournament.status);
  if(tabName === 'mine') return !!tournament.userState;
  return false;
}
function tournamentsForList(tabName, tournaments){
  return tournaments.filter(tournament => tournamentBelongsToList(tournament, tabName)).sort((a,b) => {
    const bt = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    const at = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    return bt - at || a.name.localeCompare(b.name, 'de');
  });
}
function formatTournamentLocalDate(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  try{ return date.toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'}); }
  catch(_){ return ''; }
}
function formatTournamentLocalDateTime(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  try{ return date.toLocaleString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) + ' Uhr'; }
  catch(_){ return ''; }
}
function setTournamentStatusBadge(element, status){
  if(!element) return;
  const info = tournamentStatusInfo(status);
  Object.values(TOURNAMENT_STATUS_CONFIG).forEach(item => element.classList.remove(item.className));
  element.classList.add(info.className);
  element.textContent = info.label;
}
function appendTournamentMeta(container, text){
  const chip = document.createElement('span');
  chip.textContent = text;
  container.appendChild(chip);
}
function createTournamentListCard(tournament){
  const card = document.createElement('article');
  card.className = 'tournament-list-card';

  const head = document.createElement('div');
  head.className = 'tournament-list-card-head';
  const name = document.createElement('div');
  name.className = 'tournament-list-card-name';
  name.textContent = (tournament.unread ? '🆕 ' : '') + tournament.name;
  const badge = document.createElement('div');
  badge.className = 'tournament-status-badge';
  setTournamentStatusBadge(badge, tournament.status);
  head.appendChild(name);
  head.appendChild(badge);

  const description = document.createElement('div');
  description.className = 'tournament-list-card-description';
  description.textContent = tournament.description || defaultTournamentDescription(tournament.mode, tournament.tournamentType);

  const meta = document.createElement('div');
  meta.className = 'tournament-list-meta';
  const participantCount = Number(tournament.confirmedCount || 0);
  appendTournamentMeta(meta, (tournament.tournamentType === 'blitz' ? '⚡ ' : tournament.tournamentType === 'rapid' ? '⏱️ ' : '⏳ ') + tournament.tournamentTypeLabel);
  appendTournamentMeta(meta, tournament.arena ? ('👥 ' + participantCount + ' Teilnehmer · offen') : (tournament.status === 'draft' ? ('👥 ' + (normalizeTournamentMode(tournament.mode) === 'swiss' ? 'max. ' : '') + tournament.players + ' Plätze') : ('👥 ' + participantCount + ' / ' + tournament.players + (normalizeTournamentMode(tournament.mode) === 'swiss' ? ' max.' : ''))));
  appendTournamentMeta(meta, '⏱ ' + (tournament.timeLabel || (tournament.hours + ' Std./Zug')));
  if(tournament.scheduledStartAt) appendTournamentMeta(meta, '📅 ' + formatTournamentLocalDateTime(tournament.scheduledStartAt));
  if(tournament.arena) appendTournamentMeta(meta, '⌛ ' + (Number(tournament.arenaDurationMinutes) === 1440 ? '24 Stunden' : (tournament.arenaDurationMinutes + ' Minuten')));
  appendTournamentMeta(meta, tournament.rated ? '★ Gewertet' : '○ Ohne Rating');
  appendTournamentMeta(meta, tournament.variant === GAME_VARIANT_FREESTYLE ? '♜ Freestyle' : '♟ Klassisch');
  if(tournament.theme) appendTournamentMeta(meta, '🎯 Thementurnier · ' + tournament.theme.name);
  appendTournamentMeta(meta, '🏁 ' + TOURNAMENT_MODE_CONFIG[normalizeTournamentMode(tournament.mode)].label);

  const foot = document.createElement('div');
  foot.className = 'tournament-list-card-foot';
  const updated = document.createElement('div');
  updated.className = 'tournament-list-updated';
  const dateText = formatTournamentLocalDate(tournament.updatedAt);
  updated.textContent = tournament.status === 'draft' ? ('Zuletzt bearbeitet' + (dateText ? ': ' + dateText : '')) : (dateText ? 'Stand: ' + dateText : '');
  const actions = document.createElement('div');
  actions.className = 'tournament-list-actions';
  const viewButton = document.createElement('button');
  viewButton.type = 'button';
  viewButton.className = 'button-flat';
  viewButton.textContent = 'Turnier ansehen';
  viewButton.addEventListener('click', () => openTournamentDetail(tournament.id));
  actions.appendChild(viewButton);
  if(tournament.status === 'draft' && hasTournamentAdminAccess()){
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = '✏️ Bearbeiten';
    editButton.addEventListener('click', () => openTournamentCreateDialog(tournament.id));
    actions.appendChild(editButton);
  }
  foot.appendChild(updated);
  foot.appendChild(actions);

  card.appendChild(head);
  card.appendChild(description);
  card.appendChild(meta);
  card.appendChild(foot);
  return card;
}
function updateTournamentListCounts(tournaments){
  if(tournamentCurrentCount) tournamentCurrentCount.textContent = String(tournamentsForList('current', tournaments).length);
  if(tournamentMineCount) tournamentMineCount.textContent = String(tournamentsForList('mine', tournaments).length);
  if(tournamentArchiveCount) tournamentArchiveCount.textContent = String(tournamentsForList('archive', tournaments).length);
  if(tournamentDraftCount) tournamentDraftCount.textContent = String(tournamentsForList('drafts', tournaments).length);
}
function renderTournamentList(){
  const tournaments = loadLocalTournamentList();
  updateTournamentListCounts(tournaments);
  const config = TOURNAMENT_LIST_CONFIG[tournamentActiveListTab] || TOURNAMENT_LIST_CONFIG.current;
  if(tournamentListHeading) tournamentListHeading.textContent = config.title;
  if(tournamentListNote) tournamentListNote.textContent = config.note;
  if(!tournamentListGrid) return;
  tournamentListGrid.innerHTML = '';
  const items = tournamentsForList(tournamentActiveListTab, tournaments);
  if(items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'tournament-list-empty';
    empty.textContent = config.empty;
    tournamentListGrid.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(tournament => fragment.appendChild(createTournamentListCard(tournament)));
  tournamentListGrid.appendChild(fragment);
}
function setTournamentListTab(tabName, focusTab){
  const requested = String(tabName || 'current');
  const allowed = Object.prototype.hasOwnProperty.call(TOURNAMENT_LIST_CONFIG, requested) && (requested !== 'drafts' || hasTournamentAdminAccess());
  const valid = allowed ? requested : 'current';
  tournamentActiveListTab = valid;
  tournamentListTabButtons.forEach(button => {
    const active = button.dataset.tournamentListTab === valid;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
    if(active && focusTab) button.focus();
  });
  renderTournamentList();
}
function setTournamentTab(tabName, focusTab){
  const requested = String(tabName || 'overview');
  const valid = tournamentTabButtons.some(button => button.dataset.tournamentTab === requested) ? requested : 'overview';
  tournamentTabButtons.forEach(button => {
    const active = button.dataset.tournamentTab === valid;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
    if(active && focusTab) button.focus();
  });
  tournamentTabPanels.forEach(panel => { panel.hidden = panel.dataset.tournamentPanel !== valid; });
}
