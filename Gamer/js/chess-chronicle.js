'use strict';

const chessChronicleBackdrop = document.getElementById('chessChronicleBackdrop');
const chessChronicleSubtitle = document.getElementById('chessChronicleSubtitle');
const chessChronicleSummary = document.getElementById('chessChronicleSummary');
const chessChronicleTimeline = document.getElementById('chessChronicleTimeline');
const chessChronicleStatus = document.getElementById('chessChronicleStatus');
const chessChronicleMoreBtn = document.getElementById('chessChronicleMoreBtn');
const chessChronicleRefreshBtn = document.getElementById('chessChronicleRefreshBtn');
const chessChronicleCloseBtn = document.getElementById('chessChronicleCloseBtn');
const gameChronicleOpenBtn = document.getElementById('gameChronicleOpenBtn');

let chessChroniclePage = 1;
let chessChroniclePages = 1;
let chessChronicleItems = [];
let chessChronicleLoading = false;

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

function chessChronicleVariantLabel(game){
  if(game && game.variant === 'freestyle960'){
    const positionId = Number(game.positionId);
    return Number.isFinite(positionId) ? ('Freestyle #' + positionId) : 'Freestyle';
  }
  return 'Klassisch';
}

function chessChronicleModeLabel(game){
  if(game && game.mode === 'daily'){
    const days = Number(game.daysPerMove || 0);
    return days > 0 ? ('Daily · ' + days + ' Tag' + (days === 1 ? '' : 'e') + '/Zug') : 'Daily';
  }
  return game && game.timeLabel ? ('Live · ' + game.timeLabel) : 'Live';
}

function chessChronicleMilestoneIcon(code){
  if(code === 'first_win') return '🏆';
  if(code === 'first_moment') return '❤️';
  if(code === 'first_tournament') return '🏆';
  return '♟️';
}

function chessChronicleRoomUrl(roomId){
  try{
    const cleanId = cleanRoomId(roomId || '');
    if(!cleanId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', cleanId);
    ['watch','fresh','role','player','tournament','dailyInvite','rematch'].forEach(key => url.searchParams.delete(key));
    return url.toString();
  } catch(_){ return ''; }
}

function renderChessChronicleSummary(summary){
  if(!chessChronicleSummary) return;
  chessChronicleSummary.innerHTML = '';
  const values = [
    ['Partien', Number(summary && summary.total || 0)],
    ['Siege', Number(summary && summary.wins || 0)],
    ['Remis', Number(summary && summary.draws || 0)],
    ['Niederlagen', Number(summary && summary.losses || 0)],
    ['❤️ Momente', Number(summary && summary.moments || 0)]
  ];
  values.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'chess-chronicle-stat';
    const number = document.createElement('strong');
    number.textContent = String(value);
    const name = document.createElement('span');
    name.textContent = label;
    card.appendChild(number);
    card.appendChild(name);
    chessChronicleSummary.appendChild(card);
  });
  if(chessChronicleSubtitle){
    const username = String(summary && summary.username || '').trim();
    const since = chessChronicleFormatDate(summary && summary.firstEndedAt, {day:'2-digit', month:'long', year:'numeric'});
    chessChronicleSubtitle.textContent = summary && Number(summary.total || 0) > 0
      ? ((username ? username + ' · ' : '') + 'Deine Geschichte im Hammerschach-Gamer' + (since ? ' seit ' + since : '') + '.')
      : 'Hier entsteht mit deiner ersten beendeten Partie deine persönliche Schachgeschichte.';
  }
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
    marker.appendChild(icon);
    marker.appendChild(text);
    box.appendChild(marker);
  });
  return box;
}

function createChessChronicleGameCard(game){
  const card = document.createElement('article');
  const outcomeCode = game && game.outcome && game.outcome.code ? game.outcome.code : 'ended';
  card.className = 'chess-chronicle-card outcome-' + outcomeCode + (game && game.favorite ? ' gamer-moment' : '');

  const head = document.createElement('div');
  head.className = 'chess-chronicle-card-head';
  const date = document.createElement('div');
  date.className = 'chess-chronicle-date';
  date.textContent = chessChronicleFormatDate(game && game.endedAt, {weekday:'short', day:'2-digit', month:'2-digit', year:'numeric'});
  const badges = document.createElement('div');
  badges.className = 'chess-chronicle-badges';
  if(game && game.favorite){
    const moment = document.createElement('span');
    moment.className = 'chess-chronicle-badge moment';
    moment.textContent = '❤️ Gamer-Moment';
    badges.appendChild(moment);
  }
  if(game && game.tournamentId){
    const tournament = document.createElement('span');
    tournament.className = 'chess-chronicle-badge tournament';
    tournament.textContent = '🏆 Turnier';
    badges.appendChild(tournament);
  }
  head.appendChild(date);
  head.appendChild(badges);
  card.appendChild(head);

  const title = document.createElement('div');
  title.className = 'chess-chronicle-title';
  title.textContent = 'gegen ' + (game && game.opponentName ? game.opponentName : 'Gegner');
  card.appendChild(title);

  const resultLine = document.createElement('div');
  resultLine.className = 'chess-chronicle-result ' + outcomeCode;
  const outcome = document.createElement('strong');
  outcome.textContent = game && game.outcome && game.outcome.label ? game.outcome.label : 'Beendet';
  const details = document.createElement('span');
  const detailParts = [chessChronicleModeLabel(game), chessChronicleVariantLabel(game)];
  if(game && game.ratingDelta !== null && game.ratingDelta !== undefined){
    const delta = Number(game.ratingDelta || 0);
    detailParts.push((game.ratingLabel ? game.ratingLabel + ' ' : '') + (delta > 0 ? '+' : '') + delta);
  } else if(game && game.rated && game.ratingLabel){
    detailParts.push(game.ratingLabel + ' · gewertet');
  }
  details.textContent = detailParts.filter(Boolean).join(' · ');
  resultLine.appendChild(outcome);
  resultLine.appendChild(details);
  card.appendChild(resultLine);

  if(game && game.tournamentName){
    const tournamentLine = document.createElement('div');
    tournamentLine.className = 'chess-chronicle-tournament-line';
    tournamentLine.textContent = game.tournamentName + (game.tournamentRoundLabel ? ' · ' + game.tournamentRoundLabel : '');
    card.appendChild(tournamentLine);
  }

  const opening = game && game.opening && typeof game.opening === 'object' ? game.opening : null;
  if(opening && (opening.name || opening.moveText)){
    const openingBox = document.createElement('div');
    openingBox.className = 'chess-chronicle-opening';
    const openingName = document.createElement('div');
    openingName.className = 'chess-chronicle-opening-name';
    openingName.textContent = opening.name || 'Partiebeginn';
    openingBox.appendChild(openingName);
    if(opening.moveText){
      const moves = document.createElement('div');
      moves.className = 'chess-chronicle-opening-moves';
      moves.textContent = opening.moveText;
      openingBox.appendChild(moves);
    }
    card.appendChild(openingBox);
  }

  if(game && game.favorite && game.momentNote){
    const note = document.createElement('div');
    note.className = 'chess-chronicle-note';
    const label = document.createElement('strong');
    label.textContent = 'Meine Erinnerung';
    const text = document.createElement('div');
    text.textContent = game.momentNote;
    note.appendChild(label);
    note.appendChild(text);
    card.appendChild(note);
  }

  if(game && game.archiveAvailable && game.roomId){
    const actions = document.createElement('div');
    actions.className = 'chess-chronicle-card-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button-flat';
    open.textContent = 'Partie ansehen';
    open.addEventListener('click', () => {
      const url = chessChronicleRoomUrl(game.roomId);
      if(url) window.location.href = url;
    });
    actions.appendChild(open);
    card.appendChild(actions);
  }
  return card;
}

function renderChessChronicleTimeline(){
  if(!chessChronicleTimeline) return;
  chessChronicleTimeline.innerHTML = '';
  if(!chessChronicleItems.length){
    const empty = document.createElement('div');
    empty.className = 'chess-chronicle-empty';
    empty.textContent = 'Noch keine beendete Partie – deine Schachchronik wartet auf ihre erste Seite.';
    chessChronicleTimeline.appendChild(empty);
    return;
  }

  let currentMonth = '';
  chessChronicleItems.forEach(game => {
    const month = chessChronicleMonthKey(game && game.endedAt);
    if(month !== currentMonth){
      currentMonth = month;
      const heading = document.createElement('div');
      heading.className = 'chess-chronicle-month';
      heading.textContent = month;
      chessChronicleTimeline.appendChild(heading);
    }
    const milestones = createChessChronicleMilestones(game);
    if(milestones) chessChronicleTimeline.appendChild(milestones);
    chessChronicleTimeline.appendChild(createChessChronicleGameCard(game));
  });
}

async function loadChessChronicle(options){
  options = options || {};
  if(chessChronicleLoading || !onlineAuthToken || !onlineAuthUser) return;
  const append = options.append === true;
  const page = append ? chessChroniclePage + 1 : 1;
  chessChronicleLoading = true;
  if(chessChronicleRefreshBtn) chessChronicleRefreshBtn.disabled = true;
  if(chessChronicleMoreBtn) chessChronicleMoreBtn.disabled = true;
  if(chessChronicleStatus) chessChronicleStatus.textContent = append ? 'Ältere Einträge werden geladen…' : 'Schachchronik wird geladen…';
  if(!append && chessChronicleTimeline) chessChronicleTimeline.innerHTML = '<div class="chess-chronicle-empty">Chronik wird geladen…</div>';
  try{
    const data = await authApi('/api/chess-chronicle?page=' + encodeURIComponent(page) + '&limit=60');
    const incoming = data && Array.isArray(data.items) ? data.items : [];
    chessChroniclePage = Math.max(1, Number(data && data.page || page));
    chessChroniclePages = Math.max(1, Number(data && data.pages || 1));
    chessChronicleItems = append ? chessChronicleItems.concat(incoming) : incoming;
    renderChessChronicleSummary(data && data.summary ? data.summary : null);
    renderChessChronicleTimeline();
    if(chessChronicleMoreBtn) chessChronicleMoreBtn.hidden = chessChroniclePage >= chessChroniclePages;
    if(chessChronicleStatus){
      const total = Number(data && data.total || 0);
      chessChronicleStatus.textContent = total > 0
        ? (chessChronicleItems.length + ' von ' + total + ' Partie' + (total === 1 ? '' : 'n'))
        : '';
    }
  } catch(err){
    if(!append) chessChronicleItems = [];
    renderChessChronicleTimeline();
    if(chessChronicleStatus) chessChronicleStatus.textContent = err && err.message ? err.message : 'Die Schachchronik konnte nicht geladen werden.';
    if(chessChronicleMoreBtn) chessChronicleMoreBtn.hidden = true;
  } finally {
    chessChronicleLoading = false;
    if(chessChronicleRefreshBtn) chessChronicleRefreshBtn.disabled = false;
    if(chessChronicleMoreBtn) chessChronicleMoreBtn.disabled = false;
  }
}

function openChessChronicleDialog(options){
  options = options || {};
  if(!onlineAuthToken || !onlineAuthUser){
    if(typeof openAuthDialog === 'function') openAuthDialog('login');
    return;
  }
  if(options.source === 'daily' && typeof closeDailyGamesDialog === 'function') closeDailyGamesDialog();
  if(options.source === 'profile' && typeof closeMemberProfileDialog === 'function') closeMemberProfileDialog();
  if(chessChronicleBackdrop) chessChronicleBackdrop.hidden = false;
  loadChessChronicle({append:false});
}

function closeChessChronicleDialog(){
  if(chessChronicleBackdrop) chessChronicleBackdrop.hidden = true;
}

if(dailyGamesChronicleBtn) dailyGamesChronicleBtn.addEventListener('click', () => openChessChronicleDialog({source:'daily'}));
if(memberProfileChronicleBtn) memberProfileChronicleBtn.addEventListener('click', () => openChessChronicleDialog({source:'profile'}));
if(gameChronicleOpenBtn) gameChronicleOpenBtn.addEventListener('click', () => openChessChronicleDialog({source:'room'}));
if(chessChronicleMoreBtn) chessChronicleMoreBtn.addEventListener('click', () => loadChessChronicle({append:true}));
if(chessChronicleRefreshBtn) chessChronicleRefreshBtn.addEventListener('click', () => loadChessChronicle({append:false}));
if(chessChronicleCloseBtn) chessChronicleCloseBtn.addEventListener('click', closeChessChronicleDialog);
if(chessChronicleBackdrop) chessChronicleBackdrop.addEventListener('click', ev => { if(ev.target === chessChronicleBackdrop) closeChessChronicleDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && chessChronicleBackdrop && !chessChronicleBackdrop.hidden) closeChessChronicleDialog(); });
