'use strict';

function selectedTournament(){
  return tournamentItems.find(item => item.id === tournamentSelectedId) || null;
}
async function refreshSelectedTournament(message){
  await loadTournaments({keepDetail:true});
  const tournament = selectedTournament();
  if(tournament) renderTournamentDetail(tournament);
  if(statusEl && message) statusEl.textContent = message;
}
async function publishSelectedTournament(){
  const tournament = selectedTournament();
  if(!tournament || tournament.status !== 'draft' || !hasTournamentAdminAccess()) return;
  if(!window.confirm('Turnier „' + tournament.name + '“ jetzt veröffentlichen?\n\nDanach ist die Anmeldung für alle Mitglieder sichtbar und die einmalige Turniermail wird versendet. Die Turnierdaten können dann nicht mehr als Entwurf bearbeitet werden.')) return;
  if(tournamentPublishBtn) tournamentPublishBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/publish', {method:'POST',body:JSON.stringify({confirmed:true})});
    tournamentActiveListTab = 'current';
    await refreshSelectedTournament(data.message || 'Turnier wurde veröffentlicht.');
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Das Turnier konnte nicht veröffentlicht werden.'; }
  finally { if(tournamentPublishBtn) tournamentPublishBtn.disabled = false; }
}
async function joinSelectedTournament(){
  const tournament = selectedTournament();
  if(!tournament || !['open','full'].includes(tournament.status)) return;
  const waitlist = tournament.status === 'full';
  const question = waitlist
    ? 'Das Teilnehmerfeld ist voll. Möchtest du dich verbindlich auf die Warteliste setzen lassen?'
    : 'Möchtest du deine Teilnahme am Turnier „' + tournament.name + '“ verbindlich bestätigen?';
  if(!window.confirm(question)) return;
  if(tournamentJoinBtn) tournamentJoinBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/join', {method:'POST',body:JSON.stringify({confirmed:true})});
    await refreshSelectedTournament(data.message || 'Deine Teilnahme wurde gespeichert.');
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Die Teilnahme konnte nicht gespeichert werden.'; }
  finally { if(tournamentJoinBtn) tournamentJoinBtn.disabled = false; }
}
async function checkInSelectedTournament(){
  const tournament = selectedTournament();
  if(!tournament || !tournament.live || !['open','full'].includes(tournament.status) || tournament.userState !== 'confirmed' || tournament.checkedIn) return;
  if(!tournament.canCheckIn){
    if(statusEl) statusEl.textContent = 'Der Check-in öffnet eine Stunde vor dem geplanten Start.';
    return;
  }
  if(tournamentCheckInBtn) tournamentCheckInBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/check-in', {method:'POST',body:JSON.stringify({confirmed:true})});
    await refreshSelectedTournament(data.message || 'Du bist eingecheckt und startbereit. Bleib jetzt im Gamer.');
    startLiveTournamentPolling();
  } catch(err){
    if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Der Check-in konnte nicht gespeichert werden.';
  } finally {
    if(tournamentCheckInBtn) tournamentCheckInBtn.disabled = false;
  }
}
async function joinRunningArena(){
  const tournament = selectedTournament();
  if(!tournament || !tournament.arena || tournament.status !== 'running' || tournament.arenaClosedAt) return;
  if(!window.confirm('Jetzt in die laufende Arena „' + tournament.name + '“ einsteigen?\n\nSobald ein passender Gegner verfügbar ist, öffnet sich dein Brett automatisch.')) return;
  if(tournamentArenaJoinBtn) tournamentArenaJoinBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/arena/join', {method:'POST',body:JSON.stringify({confirmed:true})});
    await refreshSelectedTournament(data.message || 'Du bist in der Arena.');
    startLiveTournamentPolling();
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Der Arena-Einstieg ist fehlgeschlagen.'; }
  finally { if(tournamentArenaJoinBtn) tournamentArenaJoinBtn.disabled = false; }
}
async function toggleArenaPause(){
  const tournament = selectedTournament();
  if(!tournament || !tournament.arena || tournament.status !== 'running' || Number(tournament.arenaActive || 0) === 2) return;
  const resume = Number(tournament.arenaActive || 0) === 0;
  const tournamentId = String(tournament.id);
  if(tournamentArenaPauseBtn) tournamentArenaPauseBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournamentId) + '/arena/' + (resume ? 'resume' : 'pause'), {method:'POST',body:JSON.stringify({})});
    const message = data.message || (resume ? 'Arena fortgesetzt.' : 'Arena pausiert.');
    await refreshSelectedTournament(message);
    if(resume){
      liveTournamentWaitingDismissedKey = '';
    } else {
      const liveItem = tournamentItems.find(item => item && String(item.id) === tournamentId);
      if(liveItem){
        liveItem.arenaActive = 0;
        liveItem.arenaPairingNotBefore = null;
      }
      if(activeLiveTournamentStatus && String(activeLiveTournamentStatus.tournamentId || '') === tournamentId){
        activeLiveTournamentStatus = Object.assign({}, activeLiveTournamentStatus, {
          arenaActive:0,
          paused:true,
          pairingNotBefore:null
        });
      }
      closeTournamentDialog();
      if(statusEl) statusEl.textContent = message;
    }
    startLiveTournamentPolling();
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Die Arena-Pause konnte nicht geändert werden.'; }
  finally { if(tournamentArenaPauseBtn) tournamentArenaPauseBtn.disabled = false; }
}
async function withdrawSelectedTournament(){
  const tournament = selectedTournament();
  if(!tournament || !['open','full'].includes(tournament.status)) return;
  if(!window.confirm('Möchtest du deine Anmeldung für „' + tournament.name + '“ wirklich zurückziehen?')) return;
  if(tournamentWithdrawBtn) tournamentWithdrawBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/join', {method:'DELETE'});
    await refreshSelectedTournament(data.message || 'Deine Anmeldung wurde zurückgezogen.');
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Die Anmeldung konnte nicht zurückgezogen werden.'; }
  finally { if(tournamentWithdrawBtn) tournamentWithdrawBtn.disabled = false; }
}
async function startSelectedTournament(){
  const tournament = selectedTournament();
  if(!tournament || !hasTournamentAdminAccess()) return;
  const recoverable = tournament.status === 'running' && Array.isArray(tournament.games) && tournament.games.some(game => game.status === 'creating');
  const startReady = tournament.arena ? true : (tournament.live ? Number(tournament.checkedInCount || 0) >= 4 : Number(tournament.confirmedCount || 0) === Number(tournament.players || 0));
  if(!recoverable && !startReady){
    if(statusEl) statusEl.textContent = tournament.live
      ? 'Für den Start müssen mindestens vier angemeldete Spieler eingecheckt sein.'
      : 'Das Turnier kann erst bei vollständig belegtem Teilnehmerfeld gestartet werden.';
    return;
  }
  if(recoverable && !window.confirm('Die Vorbereitung dieser Turnierrunde wurde unterbrochen. Fehlende Turnierpartien jetzt erneut vorbereiten?')) return;
  const freestyleNote = tournament.variant === GAME_VARIANT_FREESTYLE ? '\n\nFür die erste Runde wird jetzt serverseitig eine zufällige Chess960-Stellung erzeugt.' : '';
  const liveNote = tournament.live
    ? (tournament.arena ? '\n\nDie Arena startet sofort und bleibt während der gewählten Dauer für spätere Einsteiger offen.' : ('\n\nEs starten ' + Number(tournament.checkedInCount || 0) + ' eingecheckte Spieler. Nicht eingecheckte Anmeldungen werden für dieses Turnier als abwesend markiert. Die Bretter öffnen sich automatisch.'))
    : '\n\nDadurch werden alle Partien der ersten Turnierrunde sofort eröffnet.';
  if(!recoverable && !window.confirm('Turnier „' + tournament.name + '“ jetzt starten?' + liveNote + freestyleNote)) return;
  if(tournamentStartBtn) tournamentStartBtn.disabled = true;
  try{
    const data = await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/start', {method:'POST',body:JSON.stringify({confirmed:true})});
    await refreshSelectedTournament(data.message || 'Das Turnier wurde gestartet.');
    if(tournament.live) startLiveTournamentPolling();
  } catch(err){ if(statusEl) statusEl.textContent = err && err.message ? err.message : 'Das Turnier konnte nicht gestartet werden.'; }
  finally { if(tournamentStartBtn) tournamentStartBtn.disabled = false; }
}

