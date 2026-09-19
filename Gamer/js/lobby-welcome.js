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
function formatLobbyWelcome(firstVisit){
  const name = cleanDisplayName(onlineAuthUser && onlineAuthUser.username);
  const suffix = name ? ', ' + name + '!' : '!';
  // While offline or loading, use a neutral welcome rather than guessing "zurück".
  return (firstVisit === false ? 'Willkommen zurück' : 'Willkommen im Hammerschach-Gamer') + suffix;
}
