'use strict';

// One greeting per account and page visit, stable through polling and profile refreshes.
let lobbyWelcomeState = null;
function lobbyWelcomeText(){
  if(!onlineAuthToken || !onlineAuthUser){
    lobbyWelcomeState = null;
    return 'Willkommen im Hammerschach-Gamer!';
  }
  const userId = String(onlineAuthUser.id || '');
  const token = onlineAuthToken;
  if(!lobbyWelcomeState || lobbyWelcomeState.userId !== userId || lobbyWelcomeState.token !== token){
    const visitId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
    lobbyWelcomeState = {userId, token, visitId, firstVisit:null, pending:false, retryAt:0};
  }
  const state = lobbyWelcomeState;
  if(userId && state.firstVisit === null && !state.pending && Date.now() >= state.retryAt &&
      isMemberLobbyView() && !embeddedToolActive() && !document.hidden){
    state.pending = true;
    authApi('/api/account/lobby-welcome', {method:'POST', body:JSON.stringify({visitId:state.visitId})})
      .then(data => {
        if(typeof data.firstVisit !== 'boolean') throw new Error('Missing greeting state');
        if(lobbyWelcomeState !== state || onlineAuthToken !== token || String(onlineAuthUser && onlineAuthUser.id || '') !== userId) return;
        const previousText = formatLobbyWelcome(state.firstVisit);
        state.firstVisit = data.firstVisit;
        // Keep action feedback, room status and tool titles intact.
        if(isMemberLobbyView() && !embeddedToolActive() && statusEl && statusEl.textContent === previousText)
          statusEl.textContent = formatLobbyWelcome(state.firstVisit);
      })
      .catch(() => { state.retryAt = Date.now() + 30000; })
      .finally(() => { state.pending = false; });
  }
  return formatLobbyWelcome(state.firstVisit);
}
function formatLobbyWelcome(firstVisit, christmas = document.documentElement.classList.contains('christmas-mode')){
  const name = cleanDisplayName(onlineAuthUser && onlineAuthUser.username);
  const suffix = name ? ', ' + name + '!' : '!';
  // While offline or loading, use a neutral welcome rather than guessing "zurück".
  return (firstVisit === false ? (christmas ? 'Frohe Weihnachtszeit' : 'Willkommen zurück') : 'Willkommen im Gamer') + suffix;
}

// The real status stays readable to the app and assistive technology.
// Visual copies share one grid cell so both messages reserve enough height.
function syncLobbyWelcomeDisplay(){
  const text = statusEl.textContent;
  const active = lobbyWelcomeState && onlineAuthToken === lobbyWelcomeState.token &&
    onlineAuthUser && String(onlineAuthUser.id || '') === lobbyWelcomeState.userId &&
    isMemberLobbyView() && !embeddedToolActive() && !variationModeActive &&
    !document.documentElement.classList.contains('local-game-open') &&
    [false, true].some(christmas => text === formatLobbyWelcome(lobbyWelcomeState.firstVisit, christmas));

  if(!active){
    statusEl.classList.remove('lobby-welcome-rotating');
    if(statusEl.firstElementChild?.classList.contains('lobby-welcome-source'))
      statusEl.textContent = text;
    return;
  }
  const greetingText = formatLobbyWelcome(lobbyWelcomeState.firstVisit);
  const reserveText = formatLobbyWelcome(lobbyWelcomeState.firstVisit, true);
  const mottoText = 'Zeit für deinen nächsten Hammerzug.';
  if(statusEl.firstElementChild?.classList.contains('lobby-welcome-source')){
    if(statusEl.firstElementChild.textContent !== greetingText)
      statusEl.firstElementChild.textContent = greetingText;
    const greeting = statusEl.querySelector('.lobby-welcome-greeting');
    greeting.dataset.text = greetingText;
    greeting.dataset.reserve = reserveText;
    statusEl.querySelector('.lobby-welcome-motto').dataset.text = mottoText;
    return;
  }
  const source = document.createElement('span');
  source.className = 'lobby-welcome-source';
  source.textContent = greetingText;
  const greeting = document.createElement('span');
  greeting.className = 'lobby-welcome-greeting';
  greeting.setAttribute('aria-hidden','true');
  greeting.dataset.text = greetingText;
  greeting.dataset.reserve = reserveText;
  const motto = document.createElement('span');
  motto.className = 'lobby-welcome-motto';
  motto.setAttribute('aria-hidden','true');
  motto.dataset.text = mottoText;
  statusEl.replaceChildren(source, greeting, motto);
  statusEl.classList.add('lobby-welcome-rotating');
}

if(typeof MutationObserver !== 'undefined' && statusEl){
  const observer = new MutationObserver(syncLobbyWelcomeDisplay);
  observer.observe(statusEl, {childList:true});
  observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
  syncLobbyWelcomeDisplay();
}
