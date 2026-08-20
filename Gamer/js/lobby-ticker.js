'use strict';

function clearLobbyTicker(){
  if(lobbyTickerList) lobbyTickerList.innerHTML = '';
  if(lobbyTicker) lobbyTicker.hidden = true;
}

function lobbyTournamentSortTime(tournament){
  const scheduled = Date.parse(tournament && tournament.scheduledStartAt || '');
  if(Number.isFinite(scheduled)) return scheduled;
  const updated = Date.parse(tournament && tournament.updatedAt || tournament && tournament.createdAt || '');
  return Number.isFinite(updated) ? updated : Number.MAX_SAFE_INTEGER;
}

function lobbyTournamentItems(){
  const items = Array.isArray(tournamentItems) ? tournamentItems.filter(item => item && ['open','full','running'].includes(item.status)) : [];
  return items.sort((a,b) => {
    const groupA = a.status === 'running' ? 1 : 0;
    const groupB = b.status === 'running' ? 1 : 0;
    if(groupA !== groupB) return groupA - groupB;
    if(groupA === 0){
      const openA = a.status === 'open' ? 0 : 1;
      const openB = b.status === 'open' ? 0 : 1;
      if(openA !== openB) return openA - openB;
      const aScheduled = Date.parse(a.scheduledStartAt || '');
      const bScheduled = Date.parse(b.scheduledStartAt || '');
      if(Number.isFinite(aScheduled) && Number.isFinite(bScheduled) && aScheduled !== bScheduled) return aScheduled - bScheduled;
      if(Number.isFinite(aScheduled) !== Number.isFinite(bScheduled)) return Number.isFinite(aScheduled) ? -1 : 1;
      return lobbyTournamentSortTime(b) - lobbyTournamentSortTime(a);
    }
    return lobbyTournamentSortTime(b) - lobbyTournamentSortTime(a);
  });
}

function lobbyTournamentMeta(tournament){
  if(tournament.status === 'running'){
    if(Number(tournament.currentRound || 0) > 0){
      const total = Number(tournament.totalRounds || 0);
      return 'Runde ' + Number(tournament.currentRound) + (total > 0 ? '/' + total : '') + ' · ' + (tournament.tournamentTypeLabel || 'Turnier');
    }
    return (tournament.tournamentTypeLabel || 'Turnier') + ' · läuft';
  }
  if(tournament.scheduledStartAt){
    const date = new Date(tournament.scheduledStartAt);
    if(!Number.isNaN(date.getTime())){
      try{
        return 'Start ' + date.toLocaleString('de-DE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) + ' Uhr';
      } catch(_){}
    }
  }
  const confirmed = Math.max(0, Number(tournament.confirmedCount || 0));
  const maxPlayers = Math.max(0, Number(tournament.players || 0));
  const participants = maxPlayers > 0 ? (confirmed + '/' + maxPlayers + ' Teilnehmer') : (confirmed + ' Teilnehmer');
  return (tournament.tournamentTypeLabel || 'Turnier') + ' · ' + participants;
}

function renderLobbyTournamentRow(tournament){
  const row = document.createElement('div');
  row.className = 'lobby-tournament-row';

  const main = document.createElement('div');
  main.className = 'lobby-tournament-main';
  const name = document.createElement('span');
  name.className = 'lobby-tournament-name';
  name.textContent = tournament.name || 'Turnier';
  const status = document.createElement('span');
  status.className = 'lobby-tournament-status ' + (tournament.status === 'running' ? 'running' : 'upcoming');
  status.textContent = tournament.status === 'running' ? 'Läuft' : (tournament.status === 'full' ? 'Ausgebucht' : 'Anmeldung offen');
  main.append(name, status);

  const meta = document.createElement('span');
  meta.className = 'lobby-tournament-meta';
  meta.textContent = lobbyTournamentMeta(tournament);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'button-flat lobby-tournament-open';
  open.textContent = 'Öffnen ›';
  open.addEventListener('click', () => openTournamentDialog(String(tournament.id || '')));

  row.append(main, meta, open);
  return row;
}

function renderLobbyTournaments(){
  if(!lobbyTicker || !lobbyTickerList) return;
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  if(!loggedIn){ clearLobbyTicker(); return; }
  const items = lobbyTournamentItems();
  const visibleItems = items.slice(0, 4);
  lobbyTickerList.innerHTML = '';
  lobbyTicker.hidden = items.length < 1;
  if(!items.length) return;
  const fragment = document.createDocumentFragment();
  visibleItems.forEach(tournament => fragment.appendChild(renderLobbyTournamentRow(tournament)));
  lobbyTickerList.appendChild(fragment);
}

async function loadLobbyTicker(){
  renderLobbyTournaments();
}

if(lobbyTickerActionBtn) lobbyTickerActionBtn.addEventListener('click', () => openTournamentDialog(''));
