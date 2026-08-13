'use strict';

let opponentChatMuted = false;
const chatCountEl = document.getElementById('chatCount');
const CHAT_MESSAGE_MAX_LENGTH = 300;
const CHAT_HISTORY_MAX = 80;
const CHAT_SEND_COOLDOWN_MS = 1200;
let chatMessages = [];
let chatMessageIds = new Set();
let chatLastSentAt = 0;
let chatUnreadCount = 0;
let rightPanelMode = 'moves';

function syncBoardPlayerStrips(){
  if(!boardPlayerTopEl || !boardPlayerBottomEl) return;
  const whiteCard = document.getElementById('clockCardW');
  const blackCard = document.getElementById('clockCardB');
  if(!whiteCard || !blackCard) return;
  const whiteAtBottom = variationModeActive ? variationOrientationWhite : orientationWhite;
  const topCard = whiteAtBottom ? blackCard : whiteCard;
  const bottomCard = whiteAtBottom ? whiteCard : blackCard;
  if(topCard.parentElement !== boardPlayerTopEl) boardPlayerTopEl.appendChild(topCard);
  if(bottomCard.parentElement !== boardPlayerBottomEl) boardPlayerBottomEl.appendChild(bottomCard);
}

function updateSidePanelLayout(){
  const inRoom = (typeof onlineRoomId !== 'undefined') && !!onlineRoomId;
  const spectator = inRoom && onlineRoleCode === 'spectator';
  if(spectator && rightPanelMode === 'chat') rightPanelMode = 'moves';
  syncBoardPlayerStrips();
  if(boardPlayerTopEl) boardPlayerTopEl.hidden = !inRoom;
  if(boardPlayerBottomEl) boardPlayerBottomEl.hidden = !inRoom;
  if(preRoomSetupPanelEl) preRoomSetupPanelEl.hidden = inRoom;
  if(sideToggleRowEl){
    sideToggleRowEl.hidden = !inRoom;
    sideToggleRowEl.classList.toggle('spectator', spectator);
  }
  if(showChatPanelBtn) showChatPanelBtn.hidden = spectator;
  if(!inRoom){
    if(playersPanelEl) playersPanelEl.hidden = true;
    if(movesPanelEl) movesPanelEl.hidden = true;
    if(chatPanelEl) chatPanelEl.hidden = true;
  } else {
    if(playersPanelEl) playersPanelEl.hidden = false;
    if(movesPanelEl) movesPanelEl.hidden = rightPanelMode !== 'moves';
    if(chatPanelEl) chatPanelEl.hidden = spectator || rightPanelMode !== 'chat';
  }
  if(showMovesPanelBtn) showMovesPanelBtn.classList.toggle('active', rightPanelMode === 'moves');
  if(showChatPanelBtn) showChatPanelBtn.classList.toggle('active', rightPanelMode === 'chat');
  if(typeof updateDailyMoveConfirmationUi === 'function') updateDailyMoveConfirmationUi();
}
function setRightPanelMode(mode){
  rightPanelMode = mode === 'chat' ? 'chat' : 'moves';
  updateSidePanelLayout();
  if(rightPanelMode === 'chat') clearChatUnreadIndicator();
  if(rightPanelMode === 'chat') renderChatMessages();
  updateChatUnreadIndicator();
}
if(showMovesPanelBtn) showMovesPanelBtn.addEventListener('click', () => setRightPanelMode('moves'));
if(showChatPanelBtn) showChatPanelBtn.addEventListener('click', () => setRightPanelMode('chat'));
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => setRightPanelMode('moves'), {once:true});
} else {
  setRightPanelMode('moves');
}

function cleanChatText(value){
  return String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LENGTH);
}
function setChatStatus(message, isError){
  if(!chatStatusEl) return;
  chatStatusEl.style.color = isError ? '#9A2D33' : '#666';
  chatStatusEl.textContent = message || '';
}
function resetChatMessages(){
  chatMessages = [];
  chatMessageIds = new Set();
  chatUnreadCount = 0;
  renderChatMessages();
  updateChatUnreadIndicator();
}
function updateChatUnreadIndicator(){
  if(!showChatPanelBtn) return;
  const hasUnread = chatUnreadCount > 0 && rightPanelMode !== 'chat';
  showChatPanelBtn.classList.toggle('has-unread', hasUnread);
  showChatPanelBtn.textContent = hasUnread ? ('💬 Chat · ' + Math.min(chatUnreadCount, 99)) : 'Chat';
  showChatPanelBtn.title = hasUnread ? (chatUnreadCount + ' neue Chatnachricht' + (chatUnreadCount === 1 ? '' : 'en')) : 'Partie-Chat öffnen';
  showChatPanelBtn.setAttribute('aria-label', hasUnread ? ('Chat öffnen, ' + chatUnreadCount + ' neue Nachricht' + (chatUnreadCount === 1 ? '' : 'en')) : 'Chat öffnen');
}
function clearChatUnreadIndicator(){
  if(chatUnreadCount === 0) return;
  chatUnreadCount = 0;
  updateChatUnreadIndicator();
}
function formatChatTime(value){
  const d = value ? new Date(value) : new Date();
  if(Number.isNaN(d.getTime())) return '';
  try{ return d.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'}); } catch(_){ return ''; }
}
function normalizeChatMessage(message){
  const chat = message && message.chat ? message.chat : message;
  if(!chat) return null;
  const text = cleanChatText(chat.text || chat.message);
  if(!text) return null;
  const id = String(chat.id || chat.messageId || message.messageId || ('chat_local_' + Date.now() + '_' + Math.random())).slice(0, 80);
  const role = chat.role === 'w' || chat.role === 'b' || chat.role === 'spectator' ? chat.role : '';
  const playerId = chat.playerId || chat.byPlayer || '';
  const fallbackName = role === 'w' ? 'Weiß' : role === 'b' ? 'Schwarz' : 'Zuschauer';
  const senderName = cleanDisplayName(chat.senderName || chat.name || chat.displayName || fallbackName) || fallbackName;
  return {
    id,
    messageId: id,
    role,
    playerId,
    senderName,
    text,
    sentAt: chat.sentAt || chat.time || new Date().toISOString(),
    mine: typeof chat.mine === 'boolean' ? chat.mine : !!(playerId && playerId === onlinePlayerId)
  };
}
function appendChatMessage(message, options){
  options = options || {};
  const chat = normalizeChatMessage(message);
  if(!chat) return false;
  if(chatMessageIds.has(chat.id)) return false;
  chatMessageIds.add(chat.id);
  chatMessages.push(chat);
  if(chatMessages.length > CHAT_HISTORY_MAX){
    chatMessages = chatMessages.slice(-CHAT_HISTORY_MAX);
    chatMessageIds = new Set(chatMessages.map(m => m.id));
  }
  if(!options.suppressUnread && !chat.mine && rightPanelMode !== 'chat'){
    chatUnreadCount = Math.min(99, chatUnreadCount + 1);
  }
  if(!options.deferRender){
    renderChatMessages();
    updateChatUnreadIndicator();
  }
  return true;
}
function applyChatHistory(messages){
  if(!Array.isArray(messages)) return 0;
  let added = 0;
  messages.slice(-CHAT_HISTORY_MAX).forEach(message => {
    if(appendChatMessage(message, {suppressUnread:true, deferRender:true})) added++;
  });
  if(added){
    chatMessages.sort((a,b) => {
      const at = Date.parse(a.sentAt || '') || 0;
      const bt = Date.parse(b.sentAt || '') || 0;
      return at - bt;
    });
    chatMessages = chatMessages.slice(-CHAT_HISTORY_MAX);
    chatMessageIds = new Set(chatMessages.map(message => message.id));
    renderChatMessages();
    updateChatUnreadIndicator();
  }
  return added;
}
function renderChatMessages(){
  if(chatCountEl) chatCountEl.textContent = String(chatMessages.length);
  if(!chatMessagesEl) return;
  chatMessagesEl.innerHTML = '';
  if(chatMessages.length === 0){
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = 'Noch keine Chatnachrichten.';
    chatMessagesEl.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  chatMessages.slice().reverse().forEach(chat => {
    if(opponentChatMuted && !chat.mine) return;
    const item = document.createElement('div');
    item.className = 'chat-message' + (chat.mine ? ' mine' : '');
    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const name = document.createElement('span');
    name.textContent = chat.senderName;
    const time = document.createElement('span');
    time.textContent = formatChatTime(chat.sentAt);
    meta.appendChild(name);
    meta.appendChild(time);
    const body = document.createElement('div');
    body.className = 'chat-message-text';
    body.textContent = chat.text;
    item.appendChild(meta);
    item.appendChild(body);
    frag.appendChild(item);
  });
  chatMessagesEl.appendChild(frag);
  chatMessagesEl.scrollTop = 0;
}
function updateChatControls(){
  try{ opponentChatMuted=!!(onlineRoomId && localStorage.getItem('hammerschachMute:'+onlineRoomId)==='yes'); }catch(_){}
  const spectator = onlineRoleCode === 'spectator';
  const enabled = !!(onlineRoomId && onlineConnected && !spectator);
  if(chatInputEl){
    chatInputEl.disabled = !enabled;
    chatInputEl.placeholder = enabled ? 'Nachricht schreiben…' : 'Chat verfügbar nach Online-Verbindung…';
  }
  if(chatSendBtn) chatSendBtn.disabled = !enabled;
  const playerActionsEnabled = !!(onlineRoomId && (onlineRoleCode === 'w' || onlineRoleCode === 'b'));
  if(muteOpponentBtn) muteOpponentBtn.disabled = !playerActionsEnabled;
  if(reportPlayerBtn) reportPlayerBtn.disabled = !playerActionsEnabled || !onlineAuthToken;
  if(muteOpponentBtn) muteOpponentBtn.textContent = opponentChatMuted ? '🔊 Chat wieder anzeigen' : '🔇 Chat stummschalten';
  if(!enabled){
    if(spectator) setChatStatus('Der Partie-Chat ist privat und nur für Weiß und Schwarz sichtbar.', false);
    else if(!onlineRoomId) setChatStatus('Chat verfügbar, sobald ein Online-Raum erstellt ist.', false);
    else setChatStatus('Chat wird freigegeben, sobald die Lobby verbunden ist.', false);
  } else if(chatStatusEl && (!chatStatusEl.textContent || chatStatusEl.textContent.includes('sobald') || chatStatusEl.textContent.includes('freigegeben'))){
    setChatStatus('Chat ist verbunden. Die letzten 80 Nachrichten bleiben gespeichert.', false);
  }
}
function extractOnlineChatHistory(msg){
  if(!msg) return null;
  const history = msg.chatMessages || msg.chatHistory ||
    (msg.state && (msg.state.chatMessages || msg.state.chatHistory)) ||
    (msg.roomState && (msg.roomState.chatMessages || msg.roomState.chatHistory)) ||
    (msg.lobby && (msg.lobby.chatMessages || msg.lobby.chatHistory));
  return Array.isArray(history) ? history : null;
}
function extractOnlineChatMessage(msg){
  if(!msg) return null;
  if(msg.type !== 'chat_message' && msg.type !== 'chat_ack') return null;
  return msg.chat || msg;
}
function sendChatMessage(){
  if(onlineRoleCode === 'spectator'){ setChatStatus('Zuschauer können den privaten Partie-Chat nicht verwenden.', true); return; }
  if(!onlineRoomId){ setChatStatus('Bitte zuerst eine Online-Partie erstellen oder einem Link folgen.', true); return; }
  if(!onlineConnected){ setChatStatus('Lobby ist noch nicht verbunden.', true); return; }
  const text = cleanChatText(chatInputEl ? chatInputEl.value : '');
  if(!text){ setChatStatus('Bitte eine Nachricht eingeben.', true); return; }
  const now = Date.now();
  if(now - chatLastSentAt < CHAT_SEND_COOLDOWN_MS){
    setChatStatus('Bitte kurz warten, bevor du die nächste Nachricht sendest.', true);
    return;
  }
  const messageId = 'chat_' + now + '_' + randomToken(5);
  if(sendOnlineMessage({type:'chat_message', text, messageId})){
    chatLastSentAt = now;
    if(chatInputEl) chatInputEl.value = '';
    setChatStatus('Nachricht wird gesendet...', false);
  } else {
    setChatStatus('Nachricht konnte nicht gesendet werden.', true);
  }
}
if(chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
if(chatInputEl){
  chatInputEl.addEventListener('keydown', ev => {
    if(ev.key === 'Enter'){
      ev.preventDefault();
      sendChatMessage();
    }
  });
}

function currentOpponentRole(){ return onlineRoleCode === 'w' ? 'b' : onlineRoleCode === 'b' ? 'w' : ''; }
function setModerationReportStatus(message,kind){ if(!moderationReportStatus)return; moderationReportStatus.textContent=message||''; moderationReportStatus.classList.toggle('error',kind==='error'); moderationReportStatus.classList.toggle('success',kind==='success'); }
function toggleOpponentMute(){
  if(!currentOpponentRole()) return;
  opponentChatMuted=!opponentChatMuted;
  try{ if(onlineRoomId) localStorage.setItem('hammerschachMute:'+onlineRoomId,opponentChatMuted?'yes':'no'); }catch(_){}
  renderChatMessages(); updateChatControls();
  setChatStatus(opponentChatMuted?'Chatnachrichten des Gegners werden auf diesem Gerät ausgeblendet.':'Chatnachrichten des Gegners werden wieder angezeigt.',false);
}
function openModerationReport(){
  if(!onlineAuthToken){ openAuthDialog('login'); if(authError)authError.textContent='Bitte einloggen, um einen Spieler zu melden.'; return; }
  if(!onlineRoomId||!currentOpponentRole()) return;
  if(moderationCommentInput) moderationCommentInput.value=''; setModerationReportStatus('','');
  if(moderationReportBackdrop) moderationReportBackdrop.hidden=false;
}
function closeModerationReport(){ if(moderationReportBackdrop) moderationReportBackdrop.hidden=true; setModerationReportStatus('',''); }
async function submitModerationReport(){
  if(!onlineRoomId||!currentOpponentRole()) return;
  if(moderationReportSubmitBtn) moderationReportSubmitBtn.disabled=true;
  setModerationReportStatus('Meldung wird übermittelt…','');
  try{
    const data=await authApi('/api/moderation/report',{method:'POST',body:JSON.stringify({roomId:onlineRoomId,reportedRole:currentOpponentRole(),reason:moderationReasonSelect?moderationReasonSelect.value:'other',comment:moderationCommentInput?moderationCommentInput.value:''})});
    setModerationReportStatus(data.message||'Meldung wurde gesendet.','success'); setTimeout(closeModerationReport,900);
  }catch(err){ setModerationReportStatus(err&&err.message?err.message:'Die Meldung konnte nicht gesendet werden.','error'); }
  finally{ if(moderationReportSubmitBtn) moderationReportSubmitBtn.disabled=false; }
}
if(muteOpponentBtn) muteOpponentBtn.addEventListener('click',toggleOpponentMute);
if(reportPlayerBtn) reportPlayerBtn.addEventListener('click',openModerationReport);
if(moderationReportCloseBtn) moderationReportCloseBtn.addEventListener('click',closeModerationReport);
if(moderationReportSubmitBtn) moderationReportSubmitBtn.addEventListener('click',submitModerationReport);
if(moderationReportBackdrop) moderationReportBackdrop.addEventListener('click',ev=>{if(ev.target===moderationReportBackdrop)closeModerationReport();});
