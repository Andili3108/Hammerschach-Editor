'use strict';

/*
 * Persönliche Schachchronik
 * ------------------------
 * Die Chronik ist keine eigene Oberfläche mehr. Ihre dauerhaften Daten werden
 * in „Meine Partien → Beendet“ eingeblendet und ergänzen dort die bestehenden
 * Partiekarten um Statistik, Suche, Ergebnisfilter, Monatsmarken und Meilensteine.
 */

const dailyGamesChronicleSummary = document.getElementById('dailyGamesChronicleSummary');
const dailyGamesChronicleMark = document.getElementById('dailyGamesChronicleMark');
const dailyGamesChronicleOpponentInput = document.getElementById('dailyGamesChronicleOpponentInput');
const dailyGamesChronicleResultButtons = Array.from(document.querySelectorAll('[data-chronicle-result-filter]'));

let integratedChessChronicleItems = [];
let integratedChessChronicleLoaded = false;
let integratedChessChronicleLoading = false;
let integratedChessChronicleError = '';
let integratedChessChronicleLoadPromise = null;
let integratedChessChronicleResultFilter = '';
let integratedChessChronicleRefreshTimer = null;

function chessChronicleFormatDate(value, options){
  const date = new Date(value || '');
  if(Number.isNaN(date.getTime())) return '';
  try{
    return date.toLocaleDateString('de-DE', options || {day:'2-digit', month:'2-digit', year:'numeric'});
  } catch(_){ return ''; }
}

function chessChronicleMonthKey(value){
  const date = new Date(value || '');
  if(Number.isNaN(date.getTime())) return 'Unbekannter Zeitraum';
  try{
    const text = date.toLocaleDateString('de-DE', {month:'long', year:'numeric'});
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unbekannter Zeitraum';
  } catch(_){ return 'Unbekannter Zeitraum'; }
}

function chessChronicleMilestoneIcon(code){
  if(code === 'first_win' || code === 'first_tournament') return '🏆';
  if(code === 'first_moment') return '❤️';
  return '♟️';
}

function createChessChronicleMilestones(game){
  const milestones = Array.isArray(game && game.milestones) ? game.milestones : [];
  if(!milestones.length) return null;
  const box = document.createElement('div');
  box.className = 'chess-chronicle-milestones';
  milestones.forEach(item => {
    const marker = document.createElement('div');
    marker.className = 'chess-chronicle-milestone ' + String(item.code || '');
    const icon = document.createElement('span');
    icon.textContent = chessChronicleMilestoneIcon(item.code);
    const text = document.createElement('strong');
    text.textContent = item.label || 'Meilenstein';
    marker.append(icon, text);
    box.appendChild(marker);
  });
  return box;
}

function normalizeChronicleSearch(value){
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE');
}

function integratedChessChronicleScopeItems(options){
  options = options || {};
  let items = integratedChessChronicleItems.slice();
  if(options.tournamentOnly) items = items.filter(game => !!(game && game.tournamentId));
  return items;
}

function integratedChessChronicleFilteredItems(options){
  options = options || {};
  let items = integratedChessChronicleScopeItems(options);
  const opponent = normalizeChronicleSearch(dailyGamesChronicleOpponentInput && dailyGamesChronicleOpponentInput.value);
  if(opponent){
    items = items.filter(game => normalizeChronicleSearch(game && game.opponentName).includes(opponent));
  }
  if(integratedChessChronicleResultFilter){
    items = items.filter(game => String(game && game.outcome && game.outcome.code || '') === integratedChessChronicleResultFilter);
  }
  if(options.momentsOnly){
    items = items.filter(game => game && game.favorite === true);
  }
  return items;
}

function integratedChessChronicleStats(items){
  const source = Array.isArray(items) ? items : [];
  return {
    total:source.length,
    wins:source.filter(game => game && game.outcome && game.outcome.code === 'win').length,
    draws:source.filter(game => game && game.outcome && game.outcome.code === 'draw').length,
    losses:source.filter(game => game && game.outcome && game.outcome.code === 'loss').length,
    moments:source.filter(game => game && game.favorite === true).length
  };
}

function renderIntegratedChessChronicleSummary(options){
  if(!dailyGamesChronicleSummary) return;
  options = options || {};
  dailyGamesChronicleSummary.innerHTML = '';
  const stats = integratedChessChronicleLoaded
    ? integratedChessChronicleStats(integratedChessChronicleScopeItems(options))
    : null;
  const values = [
    ['Partien', stats ? stats.total : '…'],
    ['Siege', stats ? stats.wins : '…'],
    ['Remis', stats ? stats.draws : '…'],
    ['Niederlagen', stats ? stats.losses : '…'],
    ['❤️ Momente', stats ? stats.moments : '…']
  ];
  values.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'chess-chronicle-stat';
    const number = document.createElement('strong');
    number.textContent = String(value);
    const name = document.createElement('span');
    name.textContent = label;
    card.append(number, name);
    dailyGamesChronicleSummary.appendChild(card);
  });
  if(dailyGamesChronicleMark){
    dailyGamesChronicleMark.title = options.tournamentOnly ? 'Deine Turnierchronik' : 'Deine persönliche Schachchronik';
  }
}

function updateIntegratedChessChronicleFilterUi(){
  dailyGamesChronicleResultButtons.forEach(button => {
    const value = String(button.dataset.chronicleResultFilter || '');
    const active = !!value && value === integratedChessChronicleResultFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function integratedChessChronicleState(){
  return {
    loaded:integratedChessChronicleLoaded,
    loading:integratedChessChronicleLoading,
    error:integratedChessChronicleError
  };
}

async function loadIntegratedChessChronicle(options){
  options = options || {};
  const force = options.force === true;
  if(!onlineAuthToken || !onlineAuthUser) return [];
  if(integratedChessChronicleLoading && integratedChessChronicleLoadPromise) return integratedChessChronicleLoadPromise;
  if(integratedChessChronicleLoaded && !force){
    renderIntegratedChessChronicleSummary({tournamentOnly:typeof dailyGamesTournamentOnly !== 'undefined' && dailyGamesTournamentOnly});
    return integratedChessChronicleItems;
  }

  integratedChessChronicleLoading = true;
  integratedChessChronicleError = '';
  if(!integratedChessChronicleLoaded){
    renderIntegratedChessChronicleSummary({tournamentOnly:typeof dailyGamesTournamentOnly !== 'undefined' && dailyGamesTournamentOnly});
  }

  integratedChessChronicleLoadPromise = (async () => {
    try{
      const first = await authApi('/api/chess-chronicle?page=1&limit=120');
      let items = Array.isArray(first && first.items) ? first.items.slice() : [];
      const pages = Math.max(1, Number(first && first.pages || 1));
      for(let page = 2; page <= pages; page += 1){
        const data = await authApi('/api/chess-chronicle?page=' + encodeURIComponent(page) + '&limit=120');
        if(Array.isArray(data && data.items)) items.push(...data.items);
      }
      const seen = new Set();
      integratedChessChronicleItems = items
        .filter(game => {
          const roomId = cleanRoomId(game && game.roomId);
          if(!roomId || seen.has(roomId)) return false;
          seen.add(roomId);
          return true;
        })
        .sort((a,b) => (Date.parse(b && b.endedAt || 0) || 0) - (Date.parse(a && a.endedAt || 0) || 0));
      integratedChessChronicleLoaded = true;
      integratedChessChronicleError = '';
    } catch(err){
      integratedChessChronicleError = err && err.message ? err.message : 'Die Schachchronik konnte nicht geladen werden.';
      if(!integratedChessChronicleLoaded) integratedChessChronicleItems = [];
    } finally {
      integratedChessChronicleLoading = false;
      integratedChessChronicleLoadPromise = null;
      renderIntegratedChessChronicleSummary({tournamentOnly:typeof dailyGamesTournamentOnly !== 'undefined' && dailyGamesTournamentOnly});
      if(typeof renderDailyGames === 'function' && typeof dailyGamesCache !== 'undefined') renderDailyGames(dailyGamesCache);
      if(typeof refreshDailyGamesCountStatus === 'function') refreshDailyGamesCountStatus();
    }
    return integratedChessChronicleItems;
  })();
  return integratedChessChronicleLoadPromise;
}

function syncIntegratedChessChronicleGame(game){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId) return;
  const target = integratedChessChronicleItems.find(item => cleanRoomId(item && item.roomId) === roomId);
  if(!target) return;
  target.favorite = game.favorite === true;
  target.momentNote = String(game.momentNote || '').slice(0, 240);
  target.momentAt = game.momentAt || null;
  renderIntegratedChessChronicleSummary({tournamentOnly:typeof dailyGamesTournamentOnly !== 'undefined' && dailyGamesTournamentOnly});
  if(integratedChessChronicleRefreshTimer) clearTimeout(integratedChessChronicleRefreshTimer);
  integratedChessChronicleRefreshTimer = setTimeout(() => {
    integratedChessChronicleRefreshTimer = null;
    loadIntegratedChessChronicle({force:true});
  }, 350);
}

function chronicleFallbackModeLabel(game){
  if(game && game.mode === 'daily'){
    const days = Number(game.daysPerMove || 0);
    return days > 0 ? ('Daily · ' + days + ' Tag' + (days === 1 ? '' : 'e') + '/Zug') : 'Daily';
  }
  return 'Live-Partie';
}

function chronicleFallbackVariantLabel(game){
  if(game && game.variant === 'freestyle960'){
    const positionId = Number(game.positionId);
    return Number.isFinite(positionId) ? ('Freestyle #' + positionId) : 'Freestyle';
  }
  return 'Klassisch';
}

function createIntegratedChessChronicleCard(entry){
  const game = entry || {};
  game.ended = true;
  game.isParticipant = true;
  game.startSummary = game.startSummary || game.opening || null;

  const card = document.createElement('div');
  card.className = 'daily-game-card completed chronicle-archive-card' + (game.tournamentId ? ' tournament-game' : '');
  const content = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'daily-game-title';
  title.textContent = 'gegen ' + (cleanDisplayName(game.opponentName) || 'Gegner');
  content.appendChild(title);

  if(game.tournamentId){
    const tournamentBadge = document.createElement('div');
    tournamentBadge.className = 'daily-tournament-badge';
    tournamentBadge.textContent = '🏆 ' + (game.tournamentName || 'Turnier') + (game.tournamentRoundLabel ? ' · ' + game.tournamentRoundLabel : '');
    content.appendChild(tournamentBadge);
  }

  const status = document.createElement('div');
  status.className = 'daily-game-status';
  const outcomeCode = String(game && game.outcome && game.outcome.code || 'ended');
  const outcomeLabel = outcomeCode === 'win' ? 'Gewonnen' : outcomeCode === 'loss' ? 'Verloren' : outcomeCode === 'draw' ? 'Remis' : 'Beendet';
  status.textContent = outcomeLabel + ' · ' + (typeof dailyResultLabel === 'function' ? dailyResultLabel(game.result) : String(game.result || '—'));
  if(outcomeCode === 'win') status.classList.add('result-win');
  else if(outcomeCode === 'loss') status.classList.add('result-loss');
  else if(outcomeCode === 'draw') status.classList.add('result-draw');
  content.appendChild(status);

  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  const endedAt = game.endedAt ? ('beendet: ' + (typeof formatDailyGameDeadline === 'function' ? formatDailyGameDeadline(game.endedAt) : chessChronicleFormatDate(game.endedAt))) : '';
  const ratingDelta = game.ratingDelta !== null && game.ratingDelta !== undefined
    ? ((game.ratingLabel ? game.ratingLabel + ' ' : '') + (Number(game.ratingDelta) > 0 ? '+' : '') + Number(game.ratingDelta))
    : (game.rated ? (game.ratingLabel ? game.ratingLabel + ' · gewertet' : 'Gewertet') : 'Ungewertet');
  const endReason = typeof myGamesEndReasonLabel === 'function' ? myGamesEndReasonLabel(game.endReason) : String(game.endReason || '').replace(/_/g, ' ');
  meta.textContent = [chronicleFallbackModeLabel(game), game.timeLabel || '', chronicleFallbackVariantLabel(game), ratingDelta, endReason, endedAt].filter(Boolean).join(' · ');
  content.appendChild(meta);

  const startSummary = typeof createGameStartSummaryPanel === 'function' ? createGameStartSummaryPanel(game) : null;
  if(startSummary) content.appendChild(startSummary);

  const momentPanel = typeof createGameMomentPanel === 'function' ? createGameMomentPanel(game, {
    statusElement:typeof dailyGamesStatusEl !== 'undefined' ? dailyGamesStatusEl : null,
    onChange:changed => {
      syncIntegratedChessChronicleGame(changed);
      if(typeof renderDailyGames === 'function' && typeof dailyGamesCache !== 'undefined') renderDailyGames(dailyGamesCache);
    }
  }) : null;
  if(momentPanel) content.appendChild(momentPanel);

  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  if(game.archiveAvailable && game.roomId){
    const openLink = document.createElement('a');
    openLink.className = 'daily-game-open-btn';
    openLink.href = typeof dailyGameRoomUrl === 'function' ? (dailyGameRoomUrl(game) || '#') : '#';
    openLink.textContent = 'Partie ansehen';
    openLink.title = 'Beendete Partie im aktuellen Tab öffnen';
    actions.appendChild(openLink);

    if(typeof openArchiveInAnalyzer === 'function'){
      const analyzerBtn = document.createElement('button');
      analyzerBtn.type = 'button';
      analyzerBtn.className = 'daily-game-pgn-btn';
      analyzerBtn.textContent = 'Analyzer';
      analyzerBtn.addEventListener('click', () => openArchiveInAnalyzer(game, analyzerBtn));
      actions.appendChild(analyzerBtn);
    }
    if(typeof downloadArchivePgn === 'function'){
      const pgnBtn = document.createElement('button');
      pgnBtn.type = 'button';
      pgnBtn.className = 'daily-game-pgn-btn';
      pgnBtn.textContent = 'PGN';
      pgnBtn.addEventListener('click', () => downloadArchivePgn(game, pgnBtn));
      actions.appendChild(pgnBtn);
    }
  } else {
    const archiveNote = document.createElement('span');
    archiveNote.className = 'chronicle-archive-note';
    archiveNote.textContent = 'Chronikeintrag · Partie nicht mehr im normalen Archiv';
    actions.appendChild(archiveNote);
  }

  card.append(content, actions);
  return card;
}

dailyGamesChronicleResultButtons.forEach(button => button.addEventListener('click', () => {
  const value = String(button.dataset.chronicleResultFilter || '');
  integratedChessChronicleResultFilter = integratedChessChronicleResultFilter === value ? '' : value;
  updateIntegratedChessChronicleFilterUi();
  if(typeof renderDailyGames === 'function' && typeof dailyGamesCache !== 'undefined') renderDailyGames(dailyGamesCache);
}));

if(dailyGamesChronicleOpponentInput){
  dailyGamesChronicleOpponentInput.addEventListener('input', () => {
    if(typeof renderDailyGames === 'function' && typeof dailyGamesCache !== 'undefined') renderDailyGames(dailyGamesCache);
  });
}


window.loadIntegratedChessChronicle = loadIntegratedChessChronicle;
window.integratedChessChronicleState = integratedChessChronicleState;
window.integratedChessChronicleFilteredItems = integratedChessChronicleFilteredItems;
window.integratedChessChronicleScopeItems = integratedChessChronicleScopeItems;
window.renderIntegratedChessChronicleSummary = renderIntegratedChessChronicleSummary;
window.syncIntegratedChessChronicleGame = syncIntegratedChessChronicleGame;
window.createIntegratedChessChronicleCard = createIntegratedChessChronicleCard;
window.createChessChronicleMilestones = createChessChronicleMilestones;
window.chessChronicleMonthKey = chessChronicleMonthKey;
