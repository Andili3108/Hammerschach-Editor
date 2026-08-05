'use strict';

function setTournamentCreateStatus(message, kind){
  if(!tournamentCreateStatus) return;
  tournamentCreateStatus.textContent = message || '';
  tournamentCreateStatus.classList.toggle('error', kind === 'error');
  tournamentCreateStatus.classList.toggle('success', kind === 'success');
}
function closeTournamentCreateDialog(){
  closeThemePicker();
  if(tournamentCreateBackdrop) tournamentCreateBackdrop.hidden = true;
  setTournamentCreateStatus('', '');
}
function closeTournamentDialog(){
  const closingTournamentId = String(tournamentSelectedId || '');
  const closingLiveStatus = activeLiveTournamentStatus && (!closingTournamentId || String(activeLiveTournamentStatus.tournamentId || '') === closingTournamentId)
    ? activeLiveTournamentStatus
    : null;
  if(closingLiveStatus && tournamentBackdrop && !tournamentBackdrop.hidden){
    liveTournamentWaitingDismissedKey = liveTournamentWaitingStateKey(closingLiveStatus);
  }
  closeTournamentCreateDialog();
  if(tournamentBackdrop) tournamentBackdrop.hidden = true;
  tournamentSelectedId = '';
  try{ refreshHeaderStatusFromState(); } catch(_){ }
  hammerschachScheduleHeightReport(false);
}
function updateTournamentNotificationUi(){
  tournamentUnreadCount = tournamentItems.filter(item => item.unread && item.status !== 'draft').length;
  if(tournamentsNewBadge){
    tournamentsNewBadge.hidden = tournamentUnreadCount < 1;
    tournamentsNewBadge.textContent = tournamentUnreadCount > 1 ? ('NEU ' + tournamentUnreadCount) : 'NEU';
  }
  const newest = tournamentItems.find(item => item.unread && ['open','full','running'].includes(item.status));
  const showBanner = !!(onlineAuthToken && onlineAuthUser && newest && tournamentBannerDismissedId !== newest.id);
  if(tournamentLobbyBanner) tournamentLobbyBanner.hidden = !showBanner;
  if(tournamentLobbyBannerText && newest) tournamentLobbyBannerText.textContent = '„' + newest.name + '“ – ' + (newest.status === 'running' ? 'das Turnier läuft.' : 'die Anmeldung ist geöffnet.');
  if(tournamentLobbyViewBtn) tournamentLobbyViewBtn.dataset.tournamentId = newest ? newest.id : '';
}
async function loadTournaments(options){
  if(!onlineAuthToken || !onlineAuthUser){
    tournamentItems = [];
    updateTournamentNotificationUi();
    renderTournamentList();
    return [];
  }
  const data = await authApi('/api/tournaments');
  if(hasTournamentAdminAccess()){
    try{
      const migrationKey = 'hammerschachTournamentServerMigrationV1';
      if(localStorage.getItem(migrationKey) !== 'done'){
        const raw = localStorage.getItem(TOURNAMENT_LIST_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const legacyDrafts = (Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.tournaments) ? parsed.tournaments : []).filter(item => item && (!item.status || item.status === 'draft'));
        const serverNames = new Set((data.tournaments || []).filter(item => item.status === 'draft').map(item => String(item.name || '').trim().toLocaleLowerCase('de-DE')));
        for(const legacy of legacyDrafts){
          const normalized = normalizeLocalTournament(legacy,0);
          if(!normalized || serverNames.has(normalized.name.toLocaleLowerCase('de-DE'))) continue;
          const imported = await authApi('/api/tournaments', {method:'POST',body:JSON.stringify({name:normalized.name,description:normalized.description,players:normalized.players,hours:normalized.hours,rated:normalized.rated,variant:normalized.variant,mode:normalized.mode})});
          if(imported && imported.tournament) data.tournaments.push(imported.tournament);
        }
        localStorage.setItem(migrationKey,'done');
      }
    } catch(_){ }
  }
  tournamentItems = (Array.isArray(data.tournaments) ? data.tournaments : []).map((item,index) => normalizeLocalTournament(item,index)).filter(Boolean);
  tournamentUnreadCount = Number(data.unreadCount || 0);
  updateTournamentNotificationUi();
  renderTournamentList();
  if(options && options.keepDetail && tournamentSelectedId){
    const selected = tournamentItems.find(item => item.id === tournamentSelectedId);
    if(selected) renderTournamentDetail(selected);
  }
  return tournamentItems;
}
function openTournamentSelection(tabName, focusTab){
  tournamentSelectedId = '';
  if(tournamentSelectionView) tournamentSelectionView.hidden = false;
  if(tournamentDetailView) tournamentDetailView.hidden = true;
  setTournamentListTab(tabName || tournamentActiveListTab, !!focusTab);
  hammerschachScheduleHeightReport(false);
}
async function openTournamentDetail(tournamentId){
  const tournament = loadLocalTournamentList().find(item => item.id === String(tournamentId || ''));
  if(!tournament){
    openTournamentSelection(tournamentActiveListTab, false);
    return;
  }
  tournamentSelectedId = tournament.id;
  renderTournamentDetail(tournament);
  setTournamentTab('overview', false);
  if(tournamentSelectionView) tournamentSelectionView.hidden = true;
  if(tournamentDetailView) tournamentDetailView.hidden = false;
  if(tournament.unread && tournament.status !== 'draft'){
    tournament.unread = false;
    updateTournamentNotificationUi();
    try{ await authApi('/api/tournaments/' + encodeURIComponent(tournament.id) + '/viewed', {method:'POST',body:JSON.stringify({})}); } catch(_){ }
  }
  setTimeout(() => { if(tournamentBackToListBtn) tournamentBackToListBtn.focus(); }, 0);
  hammerschachScheduleHeightReport(false);
}
async function openTournamentDialog(tournamentId){
  if(!hasTournamentViewerAccess()) return;
  closeEmbeddedTools();
  closePlayerMenu();
  if(tournamentBackdrop) tournamentBackdrop.hidden = false;
  if(tournamentListGrid) tournamentListGrid.innerHTML = '<div class="tournament-list-empty">Turniere werden geladen…</div>';
  try{ await loadTournaments(); }
  catch(err){
    if(tournamentListGrid){
      tournamentListGrid.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tournament-list-empty';
      empty.textContent = err && err.message ? err.message : 'Turniere konnten nicht geladen werden.';
      tournamentListGrid.appendChild(empty);
    }
  }
  const tournaments = loadLocalTournamentList();
  const hasCurrent = tournamentsForList('current', tournaments).length > 0;
  const hasDrafts = tournamentsForList('drafts', tournaments).length > 0;
  if(tournamentTestBadge) tournamentTestBadge.textContent = hasTournamentAdminAccess() ? '🔒 Turnierverwaltung' : '🏆 Mitgliederbereich';
  openTournamentSelection(hasTournamentAdminAccess() && !hasCurrent && hasDrafts ? 'drafts' : 'current', false);
  const requestedId = typeof tournamentId === 'string' ? tournamentId : '';
  if(requestedId && tournaments.some(item => item.id === requestedId)) openTournamentDetail(requestedId);
  if(statusEl) statusEl.textContent = 'Hammerschach – Turniere';
  setTimeout(() => {
    const activeTab = tournamentListTabButtons.find(button => button.classList.contains('active'));
    if(activeTab) activeTab.focus();
  }, 0);
  hammerschachScheduleHeightReport(false);
}
function openTournamentCreateDialog(tournamentId){
  if(!hasTournamentAdminAccess()) return;
  const requestedId = typeof tournamentId === 'string' ? tournamentId : '';
  const draft = requestedId ? loadLocalTournamentList().find(item => item.id === requestedId && item.status === 'draft') : null;
  const type = normalizeTournamentType(draft ? draft.tournamentType : 'daily');
  tournamentEditingId = draft ? draft.id : '';
  if(tournamentCreateTitle) tournamentCreateTitle.textContent = draft ? 'Turnierentwurf bearbeiten' : 'Turnier erstellen';
  if(tournamentCreateIntro) tournamentCreateIntro.textContent = draft
    ? 'Bearbeite diesen serverseitigen Entwurf. Mitglieder werden weiterhin nicht informiert und es entstehen noch keine Partien.'
    : 'Erstelle zunächst einen serverseitigen Entwurf. Erst die getrennte Veröffentlichung öffnet die Anmeldung und versendet die einmalige Turniermail.';
  if(tournamentCreatePreviewBtn) tournamentCreatePreviewBtn.textContent = draft ? 'Änderungen speichern' : 'Entwurf speichern';
  if(tournamentNameInput) tournamentNameInput.value = draft ? draft.name : '';
  if(tournamentModeSelect) tournamentModeSelect.value = normalizeTournamentMode(draft ? draft.mode : 'double_round_robin');
  if(tournamentScheduleInput) tournamentScheduleInput.value = tournamentScheduleInputValue(draft ? draft.scheduledStartAt : '');
  updateTournamentTypeUi(type, draft ? draft.players : (type === 'daily' ? 6 : 16), draft ? (draft.live ? draft.timeKey : draft.hours) : undefined, draft ? draft.mode : undefined);
  if(tournamentArenaDurationSelect) tournamentArenaDurationSelect.value = String(draft && draft.arenaDurationMinutes ? draft.arenaDurationMinutes : 90);
  if(tournamentVariantSelect) tournamentVariantSelect.value = draft && draft.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD;
  tournamentEditingTheme = draft && draft.theme ? themeCatalogEntry(draft.theme) : null;
  if(tournamentThemeCheckbox) tournamentThemeCheckbox.checked = !!tournamentEditingTheme;
  updateTournamentThemeUi();
  if(tournamentRatingSelect) tournamentRatingSelect.value = draft && !draft.rated ? 'unrated' : 'rated';
  if(tournamentDescriptionInput) tournamentDescriptionInput.value = draft ? draft.description : '';
  setTournamentCreateStatus('', '');
  if(tournamentCreateBackdrop) tournamentCreateBackdrop.hidden = false;
  setTimeout(() => { if(tournamentNameInput) tournamentNameInput.focus(); }, 0);
}
async function saveTournamentDraft(event){
  if(event) event.preventDefault();
  if(!hasTournamentAdminAccess()) return;
  const name = String(tournamentNameInput ? tournamentNameInput.value : '').trim();
  if(!name){
    setTournamentCreateStatus('Bitte einen Turniernamen eingeben.', 'error');
    if(tournamentNameInput) tournamentNameInput.focus();
    return;
  }
  const players = Number(tournamentPlayersSelect ? tournamentPlayersSelect.value : 6);
  const tournamentType = normalizeTournamentType(tournamentEditingType);
  const live = TOURNAMENT_TYPE_CONFIG[tournamentType].live;
  const selectedMode = normalizeTournamentMode(tournamentModeSelect ? tournamentModeSelect.value : 'double_round_robin');
  const mode = live ? (selectedMode === 'arena' ? 'arena' : 'swiss') : selectedMode;
  const allowedPlayers = mode === 'arena' ? [0] : (live ? [8,12,16,24,32] : TOURNAMENT_MODE_CONFIG[mode].players);
  const timeValue = String(tournamentClockSelect ? tournamentClockSelect.value : (live ? TOURNAMENT_TYPE_CONFIG[tournamentType].times[0][0] : '24'));
  const thematic = !!(tournamentThemeCheckbox && tournamentThemeCheckbox.checked);
  const theme = thematic ? themeCatalogEntry(tournamentEditingTheme) : null;
  if(thematic && !theme){
    setTournamentCreateStatus('Bitte eine Eröffnung für das Thementurnier auswählen.', 'error');
    openThemePicker();
    return;
  }
  let scheduledStartAt = null;
  if(live){
    const scheduled = new Date(String(tournamentScheduleInput ? tournamentScheduleInput.value : ''));
    if(Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()){
      setTournamentCreateStatus('Bitte einen zukünftigen Starttermin für das Live-Turnier wählen.', 'error');
      if(tournamentScheduleInput) tournamentScheduleInput.focus();
      return;
    }
    scheduledStartAt = scheduled.toISOString();
  }
  if(tournamentCreatePreviewBtn) tournamentCreatePreviewBtn.disabled = true;
  setTournamentCreateStatus('Entwurf wird gespeichert…', '');
  try{
    const data = await authApi('/api/tournaments', {
      method:'POST',
      body:JSON.stringify({
        id:tournamentEditingId || '',
        name:name.slice(0,80),
        description:String(tournamentDescriptionInput ? tournamentDescriptionInput.value : '').trim().slice(0,1200),
        tournamentType,
        players:allowedPlayers.includes(players) ? players : allowedPlayers[0],
        mode,
        hours:live ? 24 : ([24,48,72].includes(Number(timeValue)) ? Number(timeValue) : 24),
        timeKey:live ? timeValue : '',
        arenaDurationMinutes:mode === 'arena' ? Number(tournamentArenaDurationSelect ? tournamentArenaDurationSelect.value : 90) : null,
        scheduledStartAt,
        variant:theme ? GAME_VARIANT_STANDARD : (tournamentVariantSelect && tournamentVariantSelect.value === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD),
        theme,
        rated:!tournamentRatingSelect || tournamentRatingSelect.value !== 'unrated'
      })
    });
    tournamentEditingId = '';
    closeTournamentCreateDialog();
    await loadTournaments();
    tournamentActiveListTab = 'drafts';
    if(data.tournament) openTournamentDetail(data.tournament.id);
    if(statusEl) statusEl.textContent = data.message || 'Turnierentwurf wurde gespeichert.';
  } catch(err){
    setTournamentCreateStatus(err && err.message ? err.message : 'Der Turnierentwurf konnte nicht gespeichert werden.', 'error');
  } finally {
    if(tournamentCreatePreviewBtn) tournamentCreatePreviewBtn.disabled = false;
  }
}
