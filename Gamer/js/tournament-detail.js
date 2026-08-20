'use strict';

function renderTournamentParticipants(tournament){
  if(!tournamentParticipantsList) return;
  tournamentParticipantsList.innerHTML = '';
  const participants = Array.isArray(tournament.participants) ? tournament.participants.filter(item => item && item.status !== 'withdrawn') : [];
  if(!participants.length){
    const empty = document.createElement('div');
    empty.className = 'tournament-empty';
    empty.textContent = tournament.status === 'draft' ? 'Der Entwurf ist noch nicht veröffentlicht.' : 'Noch keine Teilnehmer angemeldet.';
    tournamentParticipantsList.appendChild(empty);
    return;
  }
  participants.forEach((participant,index) => {
    const row = document.createElement('div');
    row.className = 'tournament-participant';
    const name = document.createElement('span');
    const icon = participant.status === 'waiting' ? '⏳ ' : participant.status === 'absent' ? '❌ ' : tournament.live && !participant.checkedIn && ['open','full'].includes(tournament.status) ? '🕒 ' : '✅ ';
    name.textContent = icon + (participant.username || 'Mitglied');
    const state = document.createElement('span');
    state.className = 'tournament-participant-state';
    const group = participant.groupName ? (' · Gruppe ' + participant.groupName) : '';
    if(participant.status === 'waiting') state.textContent = 'Warteliste · Platz ' + (participant.waitlistPosition || index + 1);
    else if(participant.status === 'absent') state.textContent = 'Nicht eingecheckt';
    else if(tournament.arena && tournament.status === 'running') state.textContent = Number(participant.arenaActive || 0) === 2 ? 'Spielt gerade' : Number(participant.arenaActive || 0) === 1 ? 'Aktiv · wartet auf Paarung' : 'Arena pausiert';
    else if(tournament.live) state.textContent = (participant.checkedIn ? 'Eingecheckt · startbereit' : 'Angemeldet · Check-in ausstehend') + group;
    else if(normalizeTournamentMode(tournament.mode) === 'knockout' && participant.startRating != null) state.textContent = 'Start-Rating ' + Math.round(Number(participant.startRating)) + ' · Teilnahme bestätigt';
    else state.textContent = 'Teilnahme bestätigt' + group;
    row.appendChild(name);
    row.appendChild(state);
    tournamentParticipantsList.appendChild(row);
  });
}
function renderTournamentPairings(tournament){
  if(!tournamentPairingsList) return;
  tournamentPairingsList.innerHTML = '';
  const rounds = Array.isArray(tournament.rounds) ? tournament.rounds : [];
  const games = Array.isArray(tournament.games) ? tournament.games : [];
  if(tournament.arena){
    if(!games.length){
      const empty = document.createElement('div');
      empty.className = 'tournament-empty';
      empty.textContent = tournament.status === 'running' ? 'Sobald mindestens zwei aktive Spieler im Gamer warten, erzeugt die Arena automatisch die erste Paarung.' : 'Arena-Paarungen entstehen nach dem automatischen Start.';
      tournamentPairingsList.appendChild(empty);
      return;
    }
    const block = document.createElement('div');
    block.className = 'tournament-round-block';
    const title = document.createElement('div');
    title.className = 'tournament-round-title';
    title.innerHTML = '<span>Arena-Partien</span><span></span>';
    title.children[1].textContent = games.length + ' Partie' + (games.length === 1 ? '' : 'n');
    block.appendChild(title);
    games.slice().sort((a,b) => Number(b.pairingNumber)-Number(a.pairingNumber)).forEach(game => {
      const row = document.createElement('div');
      row.className = 'tournament-pairing-row';
      const names = document.createElement('span');
      names.textContent = (game.pairingLabel || ('Arena-Partie ' + game.pairingNumber)) + ': ' + game.whiteName + ' ↔ ' + game.blackName;
      const links = document.createElement('span');
      links.className = 'tournament-pairing-links';
      const link = document.createElement('a');
      link.href = dailyGameRoomUrl({roomId:game.roomId}) || '#';
      link.textContent = game.status === 'ended' ? ('Ergebnis ' + game.result) : 'Partie öffnen';
      links.appendChild(link);
      row.append(names, links);
      block.appendChild(row);
    });
    tournamentPairingsList.appendChild(block);
    return;
  }
  if(!rounds.length){
    const empty = document.createElement('div');
    empty.className = 'tournament-empty';
    empty.textContent = 'Paarungen werden beim Turnierstart erzeugt. Live-Turniere starten zum geplanten Termin automatisch.';
    tournamentPairingsList.appendChild(empty);
    return;
  }
  rounds.forEach(round => {
    const block = document.createElement('div');
    block.className = 'tournament-round-block';
    const title = document.createElement('div');
    title.className = 'tournament-round-title';
    const state = round.status === 'ended' ? 'beendet' : 'läuft';
    const roundLabel = String(round.label || ('Runde ' + Number(round.roundNumber || 0)));
    title.innerHTML = '<span></span><span></span>';
    title.children[0].textContent = roundLabel;
    title.children[1].textContent = (tournament.variant === GAME_VARIANT_FREESTYLE ? ('Position ' + Number(round.positionId) + ' · ') : '') + state;
    block.appendChild(title);
    const roundGames = games.filter(game => Number(game.roundNumber) === Number(round.roundNumber));
    const roundBye = Array.isArray(tournament.byes) ? tournament.byes.find(bye => Number(bye.roundNumber) === Number(round.roundNumber)) : null;
    if(roundBye){
      const byeRow = document.createElement('div');
      byeRow.className = 'tournament-pairing-row';
      const byeName = document.createElement('span');
      byeName.textContent = 'Freilos: ' + (roundBye.username || 'Mitglied');
      const byePoints = document.createElement('span');
      byePoints.textContent = '+1 Punkt';
      byeRow.append(byeName, byePoints);
      block.appendChild(byeRow);
    }
    const pairingNumbers = Array.from(new Set(roundGames.map(game => Number(game.pairingNumber)))).sort((a,b) => a-b);
    pairingNumbers.forEach(pairingNumber => {
      const pairGames = roundGames.filter(game => Number(game.pairingNumber) === pairingNumber).sort((a,b) => Number(a.gameNumber)-Number(b.gameNumber));
      const first = pairGames[0];
      if(!first) return;
      const row = document.createElement('div');
      row.className = 'tournament-pairing-row';
      const names = document.createElement('span');
      names.textContent = (first.pairingLabel || ('Paarung ' + pairingNumber)) + ': ' + first.whiteName + ' ↔ ' + first.blackName;
      const links = document.createElement('span');
      links.className = 'tournament-pairing-links';
      pairGames.forEach(game => {
        const link = document.createElement('a');
        link.href = dailyGameRoomUrl({roomId:game.roomId}) || '#';
        const gameLabel = pairGames.length > 1 ? ('Partie ' + game.gameNumber) : 'Partie öffnen';
        link.textContent = gameLabel + (game.status === 'ended' ? ' · ' + game.result : '');
        links.appendChild(link);
      });
      row.appendChild(names);
      row.appendChild(links);
      block.appendChild(row);
    });
    tournamentPairingsList.appendChild(block);
  });
}
function renderTournamentStandings(tournament){
  if(!tournamentStandingsBody) return;
  tournamentStandingsBody.innerHTML = '';
  const standings = Array.isArray(tournament.standings) ? tournament.standings : [];
  const appendRows = (body, rows, emptyText) => {
    if(!rows.length){
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'tournament-table-empty';
      cell.colSpan = 8;
      cell.textContent = emptyText;
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    rows.forEach(item => {
      const row = document.createElement('tr');
      [item.rank,item.username,item.played,item.wins,item.draws,item.losses,Number(item.points || 0).toLocaleString('de-DE'),Number(item.buchholz || 0).toLocaleString('de-DE')].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  };
  if(tournamentGroupStandings){
    tournamentGroupStandings.innerHTML = '';
    const groups = Array.isArray(tournament.groupStandings) ? tournament.groupStandings : [];
    tournamentGroupStandings.hidden = normalizeTournamentMode(tournament.mode) !== 'groups_knockout' || !groups.length;
    groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'tournament-group-card';
      const title = document.createElement('h4');
      title.className = 'tournament-group-title';
      title.textContent = 'Gruppe ' + group.groupName;
      const wrap = document.createElement('div');
      wrap.className = 'tournament-table-wrap';
      const table = document.createElement('table');
      table.className = 'tournament-table';
      table.innerHTML = '<thead><tr><th>Rang</th><th>Spieler</th><th>Sp.</th><th>S</th><th>R</th><th>N</th><th>Punkte</th><th>BH</th></tr></thead>';
      const body = document.createElement('tbody');
      appendRows(body, Array.isArray(group.standings) ? group.standings : [], 'Noch keine Gruppenergebnisse.');
      table.appendChild(body);
      wrap.appendChild(table);
      card.appendChild(title);
      card.appendChild(wrap);
      tournamentGroupStandings.appendChild(card);
    });
  }
  if(!standings.length){
    appendRows(tournamentStandingsBody, [], 'Die Tabelle erscheint nach dem Turnierstart.');
  } else {
    appendRows(tournamentStandingsBody, standings, 'Die Tabelle erscheint nach dem Turnierstart.');
  }
  const winners = Array.isArray(tournament.winners) ? tournament.winners : [];
  const winnerEls = [tournamentWinner1,tournamentWinner2,tournamentWinner3];
  winnerEls.forEach((element,index) => { if(element) element.textContent = tournament.status === 'ended' && winners[index] ? winners[index].username : '—'; });
}
function renderTournamentDetail(tournament){
  const info = tournamentStatusInfo(tournament.status);
  const mode = normalizeTournamentMode(tournament.mode);
  const modeConfig = TOURNAMENT_MODE_CONFIG[mode];
  const type = normalizeTournamentType(tournament.tournamentType);
  const typeConfig = TOURNAMENT_TYPE_CONFIG[type];
  if(tournamentDetailName) tournamentDetailName.textContent = tournament.name;
  setTournamentStatusBadge(tournamentDetailStatus, tournament.status);
  if(tournamentOverviewKicker) tournamentOverviewKicker.textContent = tournament.status === 'draft' ? (typeConfig.label + ' · Serverentwurf · nicht veröffentlicht') : (typeConfig.label + ' · ' + info.label);
  if(tournamentOverviewName) tournamentOverviewName.textContent = tournament.name;
  if(tournamentOverviewText){
    const current = Array.isArray(tournament.rounds) ? tournament.rounds.find(round => Number(round.roundNumber) === Number(tournament.currentRound)) : null;
    const progress = tournament.status === 'running' ? (tournament.arena ? (' Die Arena läuft' + (tournament.arenaEndsAt ? ' bis ' + formatTournamentLocalDateTime(tournament.arenaEndsAt) : '') + '.') : (' Aktuell läuft ' + (current && current.label ? current.label : ('Runde ' + tournament.currentRound)) + ' von insgesamt ' + tournament.totalRounds + ' Runden.')) : '';
    const freestyle = tournament.variant === GAME_VARIANT_FREESTYLE ? (tournament.arena ? ' Jede Arena-Partie erhält serverseitig eine zufällige Chess960-Stellung.' : ' Jede Runde erhält serverseitig eine neue zufällige Chess960-Stellung; sie gilt für alle Begegnungen der Runde und wird erst beim Rundenstart sichtbar.') : '';
    const thematic = tournament.theme ? (' Thementurnier: Alle Partien beginnen nach „' + tournament.theme.name + '“ (' + tournament.theme.moveText + '). ' + themeSideToMoveLabel(tournament.theme)) : '';
    const schedule = tournament.scheduledStartAt ? (' Geplanter automatischer Start: ' + formatTournamentLocalDateTime(tournament.scheduledStartAt) + '.' + (tournament.live ? ' Der Check-in öffnet eine Stunde vorher.' : '')) : '';
    const flexibleField = mode === 'swiss';
    const capacity = tournament.arena ? 'mit offener Teilnehmerzahl' : ('für ' + (flexibleField ? ('bis zu ' + tournament.players) : tournament.players) + ' Teilnehmer');
    tournamentOverviewText.textContent = typeConfig.label + '-' + modeConfig.label + ' ' + capacity + '. ' + modeConfig.description + schedule + freestyle + thematic + progress;
  }
  if(tournamentLocalNote){
    tournamentLocalNote.hidden = tournament.status !== 'draft';
    tournamentLocalNote.textContent = mode === 'knockout'
      ? 'Dieser K.-o.-Entwurf ist serverseitig gespeichert und für Mitglieder unsichtbar. Erst „Turnier veröffentlichen“ öffnet die Anmeldung. Die tatsächliche Auslosung erfolgt erst beim Turnierstart; dann starten je Begegnung zwei Daily-Partien mit vertauschten Farben.'
      : 'Dieser Entwurf ist serverseitig gespeichert, aber für Mitglieder unsichtbar. Erst „Turnier veröffentlichen“ öffnet die Anmeldung und versendet die einmalige Turniermail. Der geplante Start erfolgt automatisch, sobald die Voraussetzungen erfüllt sind.' + (tournament.live ? ' Beim Live-Turnier bestätigen die Spieler ab einer Stunde vor dem Termin zusätzlich ihre Anwesenheit.' : '');
  }
  if(tournamentFactStatus) tournamentFactStatus.textContent = info.label;
  if(tournamentFactMode) tournamentFactMode.textContent = typeConfig.label + ' · ' + modeConfig.label;
  if(tournamentFactPlayers){
    if(tournament.arena) tournamentFactPlayers.textContent = String(tournament.confirmedCount || 0) + ' Teilnehmer · offen' + (tournament.status === 'running' ? (' · ' + String(tournament.arenaRunningGames || 0) + ' laufende Partien') : '');
    else if(tournament.status === 'draft') tournamentFactPlayers.textContent = (mode === 'swiss' ? 'max. ' : '') + String(tournament.players);
    else tournamentFactPlayers.textContent = String(tournament.confirmedCount || 0) + ' / ' + String(tournament.players) + (mode === 'swiss' ? ' max.' : '') + (tournament.live ? (' · ' + String(tournament.checkedInCount || 0) + ' eingecheckt') : '');
  }
  if(tournamentFactClock) tournamentFactClock.textContent = tournament.timeLabel || (tournament.hours + ' Stunden/Zug');
  if(tournamentFactScheduleWrap) tournamentFactScheduleWrap.hidden = !tournament.scheduledStartAt;
  if(tournamentFactSchedule) tournamentFactSchedule.textContent = tournament.scheduledStartAt ? formatTournamentLocalDateTime(tournament.scheduledStartAt) : '—';
  if(tournamentFactVariant) tournamentFactVariant.textContent = tournament.variant === GAME_VARIANT_FREESTYLE ? 'Freestyle (Chess960)' : 'Klassisch';
  if(tournamentFactThemeWrap) tournamentFactThemeWrap.hidden = !tournament.theme;
  if(tournamentFactTheme) tournamentFactTheme.textContent = tournament.theme ? (tournament.theme.name + ' · ' + tournament.theme.moveText) : '—';
  if(tournamentFactRating) tournamentFactRating.textContent = tournament.rated ? 'Gewertet' : 'Ohne Rating';
  if(tournamentDescriptionText){
    const baseDescription = tournament.description || defaultTournamentDescription(mode, tournament.tournamentType);
    tournamentDescriptionText.textContent = mode === 'knockout' ? (baseDescription + '\n\nFeste K.-o.-Regeln:\n' + tournamentKnockoutRulesText()) : baseDescription;
  }
  if(tournamentStandingsTab) tournamentStandingsTab.textContent = mode === 'knockout' ? 'Turnierbaum' : 'Tabelle';
  if(tournamentStandingsTitle) tournamentStandingsTitle.textContent = mode === 'knockout' ? 'Turnierbaum' : 'Turniertabelle';
  if(tournamentStandingsTableContent) tournamentStandingsTableContent.hidden = mode === 'knockout';
  if(tournamentKnockoutBracket){
    tournamentKnockoutBracket.hidden = mode !== 'knockout';
    if(mode === 'knockout') renderKnockoutBracket(tournamentKnockoutBracketTree, tournament.players, {rules:false,tournament});
  }
  renderTournamentParticipants(tournament);
  renderTournamentPairings(tournament);
  renderTournamentStandings(tournament);
  renderLiveTournamentWaiting(tournament);
  const admin = hasTournamentAdminAccess();
  const registered = ['confirmed','waiting','playing','finished'].includes(tournament.userState);
  if(tournamentDetailEditBtn) tournamentDetailEditBtn.hidden = !(tournament.status === 'draft' && admin);
  if(tournamentPublishBtn){
    tournamentPublishBtn.hidden = !(tournament.status === 'draft' && admin);
    tournamentPublishBtn.disabled = false;
    tournamentPublishBtn.title = mode === 'knockout' ? 'Anmeldung für dieses K.-o.-Turnier öffnen. Die Paarungen werden erst beim Turnierstart ausgelost.' : '';
  }
  if(tournamentJoinBtn){
    tournamentJoinBtn.hidden = !(['open','full'].includes(tournament.status) && !registered);
    tournamentJoinBtn.textContent = tournament.status === 'full' ? '⏳ Auf die Warteliste' : '✅ Am Turnier teilnehmen';
  }
  if(tournamentArenaJoinBtn){
    tournamentArenaJoinBtn.hidden = !(tournament.arena && tournament.status === 'running' && !tournament.arenaClosedAt && !registered);
    tournamentArenaJoinBtn.textContent = '⚔️ Jetzt in die Arena einsteigen';
  }
  if(tournamentArenaPauseBtn){
    const showArenaControl = !!(tournament.arena && tournament.status === 'running' && registered && !tournament.arenaClosedAt);
    tournamentArenaPauseBtn.hidden = !showArenaControl;
    tournamentArenaPauseBtn.disabled = Number(tournament.arenaActive || 0) === 2;
    tournamentArenaPauseBtn.textContent = Number(tournament.arenaActive || 0) === 0 ? '▶️ Arena fortsetzen' : Number(tournament.arenaActive || 0) === 2 ? '♟️ Partie läuft' : '⏸️ Arena pausieren';
    tournamentArenaPauseBtn.title = Number(tournament.arenaActive || 0) === 2 ? 'Während der laufenden Partie kannst du nicht pausieren.' : '';
  }
  if(tournamentCheckInBtn){
    const showCheckIn = !!(tournament.live && ['open','full'].includes(tournament.status) && tournament.userState === 'confirmed');
    tournamentCheckInBtn.hidden = !showCheckIn;
    tournamentCheckInBtn.disabled = !showCheckIn || tournament.checkedIn || !tournament.canCheckIn;
    if(tournament.checkedIn){
      tournamentCheckInBtn.textContent = '✅ Eingecheckt';
      tournamentCheckInBtn.title = 'Deine Anwesenheit ist bestätigt. Bleib zum Start im Gamer.';
    } else if(tournament.canCheckIn){
      tournamentCheckInBtn.textContent = '✅ Anwesenheit bestätigen';
      tournamentCheckInBtn.title = 'Jetzt einchecken und für den Live-Turnierstart bereithalten.';
    } else {
      const opens = formatTournamentLocalDateTime(tournament.checkInOpensAt);
      tournamentCheckInBtn.textContent = opens ? ('🕒 Check-in ab ' + opens) : '🕒 Check-in noch geschlossen';
      tournamentCheckInBtn.title = 'Der Check-in öffnet eine Stunde vor dem geplanten Start.';
    }
  }
  if(tournamentWithdrawBtn){
    tournamentWithdrawBtn.hidden = !(['open','full'].includes(tournament.status) && registered);
    tournamentWithdrawBtn.textContent = tournament.userState === 'waiting' ? 'Wartelistenplatz aufgeben' : 'Teilnahme zurückziehen';
  }
  if(tournamentStartBtn){
    const recoverable = tournament.status === 'running' && Array.isArray(tournament.games) && tournament.games.some(game => game.status === 'creating');
    const readiness = typeof tournamentAdminStartReadiness === 'function'
      ? tournamentAdminStartReadiness(tournament)
      : {ok:false, mode};
    const scheduledMs = Date.parse(tournament.scheduledStartAt || '');
    const scheduledDue = !Number.isFinite(scheduledMs) || scheduledMs <= Date.now();
    tournamentStartBtn.hidden = !(admin && (['open','full'].includes(tournament.status) || recoverable));
    tournamentStartBtn.disabled = !recoverable && !readiness.ok;
    tournamentStartBtn.textContent = recoverable
      ? '↻ Fehlende Partien vorbereiten'
      : (!scheduledDue && readiness.ok ? '▶️ Vorzeitig starten' : '▶️ Turnier starten');
    tournamentStartBtn.title = tournamentStartBtn.disabled
      ? (tournament.live ? 'Mindestens vier angemeldete Spieler müssen eingecheckt sein.' : readiness.mode === 'swiss' ? 'Das Schweizer System startet ab vier bestätigten Teilnehmern.' : readiness.mode === 'knockout' ? 'Das K.-o.-Turnier startet erst bei vollständig belegtem 4er-, 8er-, 16er- oder 32er-Feld.' : 'Der Start ist erst bei vollständig belegtem Teilnehmerfeld möglich.')
      : recoverable
        ? 'Eine unterbrochene Rundenvorbereitung fortsetzen.'
        : !scheduledDue
          ? 'Als Turnier-Admin kannst du den geplanten Starttermin übersteuern und das Turnier jetzt starten.'
          : 'Turnier jetzt manuell starten.';
  }
}
