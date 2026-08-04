'use strict';

const GLOBAL_CHAT_MUTE_STORAGE_KEY = 'hammerschachGlobalChatMutedMembers';
let globalChatSocket = null;
let globalChatReconnectTimer = null;
let globalChatPingTimer = null;
let globalChatIntentionalClose = false;
let globalChatConnected = false;
let globalChatChatBlocked = false;
let globalChatIsAdmin = false;
let globalChatAuthenticatedUserId = '';
let globalChatAuthenticatedUsername = '';
let globalChatRequestedUserId = '';
let globalChatRequestedUsername = '';
let globalChatMessages = [];
let globalChatOnlineMembers = [];
let globalChatReportMessageId = '';
let globalChatMutedKeys = new Set();
try{
  const savedMuted = JSON.parse(localStorage.getItem(GLOBAL_CHAT_MUTE_STORAGE_KEY) || '[]');
  if(Array.isArray(savedMuted)) globalChatMutedKeys = new Set(savedMuted.map(value => String(value || '')).filter(Boolean));
}catch(_){}

function isMemberLobbyView(){
  return !!(onlineAuthToken && onlineAuthUser && !onlineRoomId && !hasOnlineTargetInAddress());
}
function saveGlobalChatMutedKeys(){
  try{ localStorage.setItem(GLOBAL_CHAT_MUTE_STORAGE_KEY, JSON.stringify(Array.from(globalChatMutedKeys).slice(0,200))); }catch(_){}
}
function setGlobalChatStatus(message, kind){
  if(!globalChatStatusEl) return;
  globalChatStatusEl.textContent = message || '';
  globalChatStatusEl.classList.toggle('error', kind === 'error');
  globalChatStatusEl.classList.toggle('success', kind === 'success');
}
function globalChatWebSocketUrl(){
  const configured = (window.HAMMERSCHACH_ONLINE_WORKER_URL || ONLINE_WORKER_URL || '').trim();
  let url;
  if(configured) url = new URL('/global-chat', configured.endsWith('/') ? configured : configured + '/');
  else {
    if(window.location.protocol !== 'http:' && window.location.protocol !== 'https:') throw new Error('Kein Online-Server für den Mitglieder-Chat erreichbar.');
    url = new URL('/global-chat', window.location.origin);
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
function formatGlobalChatTime(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '';
  try{
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay ? date.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : date.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }catch(_){ return ''; }
}
function normalizeGlobalChatMessage(value){
  if(!value || typeof value !== 'object') return null;
  const id = String(value.id || value.messageId || '').trim();
  const text = cleanChatText(value.text || value.message);
  const senderName = cleanDisplayName(value.senderName || value.name || 'Mitglied') || 'Mitglied';
  if(!id || !text) return null;
  return {id,messageId:id,text,senderName,senderKey:String(value.senderKey || ''),sentAt:value.sentAt || new Date().toISOString(),mine:value.mine === true};
}
function renderGlobalChatMembers(){
  if(globalChatOnlineCountEl){
    const count = globalChatOnlineMembers.length;
    globalChatOnlineCountEl.textContent = count + ' Mitglied' + (count === 1 ? '' : 'er') + ' online';
  }
  if(!globalChatMembersListEl) return;
  globalChatMembersListEl.innerHTML = '';
  if(!globalChatOnlineMembers.length){
    const empty = document.createElement('div'); empty.className='global-chat-member';
    const dot=document.createElement('span');dot.className='presence-dot';
    const name=document.createElement('span');name.className='global-chat-member-name';name.textContent='Noch niemand verbunden';
    empty.append(dot,name);globalChatMembersListEl.appendChild(empty);return;
  }
  const frag=document.createDocumentFragment();
  globalChatOnlineMembers.forEach(member=>{
    const row=document.createElement('div');row.className='global-chat-member'+(member.isAdmin?' admin':'');
    const dot=document.createElement('span');dot.className='presence-dot';
    const name=document.createElement('span');name.className='global-chat-member-name';name.textContent=(member.isAdmin?'♛ ':'')+(cleanDisplayName(member.name)||'Mitglied');
    row.append(dot,name);frag.appendChild(row);
  });
  globalChatMembersListEl.appendChild(frag);
}
function openGlobalChatReport(message){
  if(!message || message.mine) return;
  globalChatReportMessageId = message.id;
  if(globalChatReportIntro) globalChatReportIntro.textContent = 'Nachricht von „' + message.senderName + '“ vertraulich melden.';
  if(globalChatReportReason) globalChatReportReason.value = 'insult';
  if(globalChatReportComment) globalChatReportComment.value = '';
  if(globalChatReportStatus){globalChatReportStatus.textContent='';globalChatReportStatus.className='moderation-status';}
  if(globalChatReportBackdrop) globalChatReportBackdrop.hidden = false;
}
function closeGlobalChatReport(){
  globalChatReportMessageId = '';
  if(globalChatReportBackdrop) globalChatReportBackdrop.hidden = true;
}
async function submitGlobalChatReport(){
  if(!globalChatReportMessageId || !globalChatReportSubmitBtn) return;
  globalChatReportSubmitBtn.disabled = true;
  if(globalChatReportStatus){globalChatReportStatus.textContent='Meldung wird gesendet…';globalChatReportStatus.className='moderation-status';}
  try{
    const data=await authApi('/api/moderation/global-chat-report',{method:'POST',body:JSON.stringify({messageId:globalChatReportMessageId,reason:globalChatReportReason?globalChatReportReason.value:'other',comment:globalChatReportComment?globalChatReportComment.value:''})});
    if(globalChatReportStatus){globalChatReportStatus.textContent=data.message||'Meldung wurde gesendet.';globalChatReportStatus.className='moderation-status success';}
    setTimeout(closeGlobalChatReport,900);
  }catch(err){
    if(globalChatReportStatus){globalChatReportStatus.textContent=err&&err.message?err.message:'Meldung konnte nicht gesendet werden.';globalChatReportStatus.className='moderation-status error';}
  }finally{globalChatReportSubmitBtn.disabled=false;}
}
function toggleGlobalChatMute(message){
  if(!message || !message.senderKey) return;
  if(globalChatMutedKeys.has(message.senderKey)) globalChatMutedKeys.delete(message.senderKey); else globalChatMutedKeys.add(message.senderKey);
  saveGlobalChatMutedKeys();renderGlobalChatMessages();
}
function deleteGlobalChatMessage(message){
  if(!message || !globalChatSocket || globalChatSocket.readyState!==WebSocket.OPEN || !globalChatIsAdmin) return;
  if(!window.confirm('Diese Global-Chat-Nachricht wirklich für alle löschen?')) return;
  globalChatSocket.send(JSON.stringify({type:'delete_message',messageId:message.id}));
}
function renderGlobalChatMessages(){
  if(!globalChatMessagesEl) return;
  globalChatMessagesEl.innerHTML='';
  if(!globalChatMessages.length){
    const empty=document.createElement('div');empty.className='global-chat-empty';empty.textContent='Noch keine Nachrichten. Begrüße die Hammerschach-Mitglieder!';globalChatMessagesEl.appendChild(empty);return;
  }
  const frag=document.createDocumentFragment();
  globalChatMessages.slice().reverse().forEach(message=>{
    const muted=!!(!message.mine&&message.senderKey&&globalChatMutedKeys.has(message.senderKey));
    const item=document.createElement('div');item.className='global-chat-message'+(message.mine?' mine':'');
    const head=document.createElement('div');head.className='global-chat-message-head';
    const name=document.createElement('div');name.className='global-chat-message-name';name.textContent=message.senderName+(message.mine?' (Du)':'');
    const time=document.createElement('div');time.className='global-chat-message-time';time.textContent=formatGlobalChatTime(message.sentAt);
    head.append(name,time);
    const body=document.createElement('div');body.className='global-chat-message-text';body.textContent=muted?'Nachrichten dieses Mitglieds sind auf diesem Gerät stummgeschaltet.':message.text;
    item.append(head,body);
    if(!message.mine || globalChatIsAdmin){
      const actions=document.createElement('div');actions.className='global-chat-message-actions';
      if(!message.mine && message.senderKey){
        const mute=document.createElement('button');mute.type='button';mute.className='button-flat global-chat-message-action';mute.textContent=muted?'🔊 Einblenden':'🔇 Stumm';mute.addEventListener('click',()=>toggleGlobalChatMute(message));actions.appendChild(mute);
        if(!muted){const report=document.createElement('button');report.type='button';report.className='button-flat global-chat-message-action';report.textContent='🚩 Melden';report.addEventListener('click',()=>openGlobalChatReport(message));actions.appendChild(report);}
      }
      if(globalChatIsAdmin){const del=document.createElement('button');del.type='button';del.className='global-chat-message-action global-chat-message-delete';del.textContent='Löschen';del.addEventListener('click',()=>deleteGlobalChatMessage(message));actions.appendChild(del);}
      if(actions.childNodes.length) item.appendChild(actions);
    }
    frag.appendChild(item);
  });
  globalChatMessagesEl.appendChild(frag);
  globalChatMessagesEl.scrollTop=0;
}
function updateGlobalChatControls(){
  const usable=!!(isMemberLobbyView()&&globalChatConnected&&!globalChatChatBlocked);
  if(globalChatInputEl) globalChatInputEl.disabled=!usable;
  if(globalChatSendBtn) globalChatSendBtn.disabled=!usable;
  if(globalChatInputEl) globalChatInputEl.placeholder=globalChatChatBlocked?'Deine Chatfunktion ist derzeit gesperrt.':'Nachricht an die Hammerschach-Mitglieder schreiben…';
}
function appendGlobalChatMessage(raw){
  const message=normalizeGlobalChatMessage(raw);if(!message)return;
  if(globalChatMessages.some(item=>item.id===message.id))return;
  globalChatMessages.push(message);globalChatMessages=globalChatMessages.slice(-200);renderGlobalChatMessages();
}
function closeGlobalChat(intentional){
  globalChatIntentionalClose=intentional!==false;
  if(globalChatReconnectTimer){clearTimeout(globalChatReconnectTimer);globalChatReconnectTimer=null;}
  if(globalChatPingTimer){clearInterval(globalChatPingTimer);globalChatPingTimer=null;}
  const socket=globalChatSocket;globalChatSocket=null;globalChatConnected=false;globalChatAuthenticatedUserId='';globalChatAuthenticatedUsername='';globalChatRequestedUserId='';globalChatRequestedUsername='';
  if(socket){try{socket.close(1000,'Lobby verlassen');}catch(_){}}
  updateGlobalChatControls();
}
function scheduleGlobalChatReconnect(){
  if(globalChatIntentionalClose||!isMemberLobbyView()||globalChatReconnectTimer)return;
  globalChatReconnectTimer=setTimeout(()=>{globalChatReconnectTimer=null;connectGlobalChat();},3000);
}
function connectGlobalChat(){
  if(!isMemberLobbyView()||!onlineAuthToken||!onlineAuthUser)return;
  const expectedUserId=String(onlineAuthUser.id||'');
  const expectedName=cleanDisplayName(onlineAuthUser.username)||'Mitglied';
  if(globalChatSocket&&(globalChatSocket.readyState===WebSocket.OPEN||globalChatSocket.readyState===WebSocket.CONNECTING)){
    if(globalChatRequestedUserId===expectedUserId&&globalChatRequestedUsername===expectedName)return;
    closeGlobalChat(true);
  }
  globalChatIntentionalClose=false;globalChatConnected=false;globalChatChatBlocked=false;updateGlobalChatControls();setGlobalChatStatus('Mitglieder-Chat wird verbunden…','');
  let socket;try{socket=new WebSocket(globalChatWebSocketUrl());}catch(err){setGlobalChatStatus(err&&err.message?err.message:'Mitglieder-Chat konnte nicht geöffnet werden.','error');scheduleGlobalChatReconnect();return;}
  globalChatSocket=socket;globalChatRequestedUserId=expectedUserId;globalChatRequestedUsername=expectedName;
  let authSent=false;
  const sendAuthentication=()=>{if(authSent||globalChatSocket!==socket||socket.readyState!==WebSocket.OPEN)return;authSent=true;socket.send(JSON.stringify({type:'authenticate',authToken:onlineAuthToken}));};
  socket.addEventListener('open',sendAuthentication);
  socket.addEventListener('message',event=>{
    if(globalChatSocket!==socket)return;let data;try{data=JSON.parse(event.data);}catch(_){return;}
    if(data.type==='global_chat_challenge'){sendAuthentication();return;}
    if(data.type==='global_chat_ready'){
      globalChatConnected=true;globalChatChatBlocked=data.chatBlocked===true;globalChatIsAdmin=data.isAdmin===true;globalChatAuthenticatedUserId=String(onlineAuthUser&&onlineAuthUser.id||'');globalChatAuthenticatedUsername=cleanDisplayName(onlineAuthUser&&onlineAuthUser.username)||'';
      globalChatMessages=(Array.isArray(data.messages)?data.messages.map(normalizeGlobalChatMessage).filter(Boolean):[]).slice(-200);renderGlobalChatMessages();updateGlobalChatControls();setGlobalChatStatus(globalChatChatBlocked?'Du kannst mitlesen, deine Chatfunktion ist jedoch gesperrt.':'Verbunden – du kannst jetzt schreiben.','success');
      if(globalChatPingTimer)clearInterval(globalChatPingTimer);globalChatPingTimer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping'}));},25000);return;
    }
    if(data.type==='global_chat_presence'){globalChatOnlineMembers=Array.isArray(data.onlineMembers)?data.onlineMembers:[];renderGlobalChatMembers();return;}
    if(data.type==='global_chat_message'){appendGlobalChatMessage(data.message);return;}
    if(data.type==='global_chat_message_deleted'){globalChatMessages=globalChatMessages.filter(message=>message.id!==String(data.messageId||''));renderGlobalChatMessages();setGlobalChatStatus('Eine Nachricht wurde administrativ entfernt.','');return;}
    if(data.type==='global_chat_moderation'){globalChatChatBlocked=data.chatBlocked===true;updateGlobalChatControls();setGlobalChatStatus(globalChatChatBlocked?'Deine Chatfunktion wurde gesperrt.':'Deine Chatfunktion wurde wieder freigeschaltet.',globalChatChatBlocked?'error':'success');return;}
    if(data.type==='global_chat_error'){if(data.code==='CHAT_BLOCKED')globalChatChatBlocked=true;updateGlobalChatControls();setGlobalChatStatus(data.message||'Chatfehler.', 'error');}
  });
  socket.addEventListener('close',()=>{if(globalChatSocket!==socket)return;globalChatSocket=null;globalChatConnected=false;globalChatOnlineMembers=[];renderGlobalChatMembers();updateGlobalChatControls();if(!globalChatIntentionalClose){setGlobalChatStatus('Verbindung unterbrochen – erneuter Versuch folgt.','error');scheduleGlobalChatReconnect();}});
  socket.addEventListener('error',()=>{if(globalChatSocket===socket)setGlobalChatStatus('Der Mitglieder-Chat ist vorübergehend nicht erreichbar.','error');});
}
function sendGlobalChatMessage(){
  if(!globalChatInputEl||!globalChatSocket||globalChatSocket.readyState!==WebSocket.OPEN||!globalChatConnected)return;
  const text=cleanChatText(globalChatInputEl.value);if(!text)return;
  globalChatSocket.send(JSON.stringify({type:'send_message',text}));globalChatInputEl.value='';globalChatInputEl.focus();
}
let newGameDialogReturnFocus=null;
function setNewGameDialogStatus(message){
  if(newGameDialogStatus)newGameDialogStatus.textContent=String(message||'');
}
function openNewGameDialog(){
  if(!newGameBackdrop||!isMemberLobbyView())return;
  closeGamesMenu();closePlayerMenu();closeToolsMenu();closeInfoMenu();
  setNewGameDialogStatus('');
  newGameDialogReturnFocus=document.activeElement;
  newGameBackdrop.hidden=false;
  document.documentElement.classList.add('new-game-dialog-open');
  setTimeout(()=>{try{if(newGameCloseBtn)newGameCloseBtn.focus();}catch(_){}},0);
}
function closeNewGameDialog(options){
  options=options||{};
  if(!newGameBackdrop||newGameBackdrop.hidden)return;
  newGameBackdrop.hidden=true;
  document.documentElement.classList.remove('new-game-dialog-open');
  setNewGameDialogStatus('');
  if(options.restoreFocus!==false){
    const target=newGameDialogReturnFocus&&document.contains(newGameDialogReturnFocus)?newGameDialogReturnFocus:newGameOpenBtn;
    setTimeout(()=>{try{if(target&&!target.hidden)target.focus();}catch(_){}},0);
  }
  newGameDialogReturnFocus=null;
}
if(newGameOpenBtn)newGameOpenBtn.addEventListener('click',openNewGameDialog);
if(newGameCloseBtn)newGameCloseBtn.addEventListener('click',()=>closeNewGameDialog());
if(newGameCancelBtn)newGameCancelBtn.addEventListener('click',()=>closeNewGameDialog());
if(newGameBackdrop)newGameBackdrop.addEventListener('click',event=>{if(event.target===newGameBackdrop)closeNewGameDialog();});
document.addEventListener('keydown',event=>{
  if(!newGameBackdrop||newGameBackdrop.hidden)return;
  if(event.key==='Escape'){
    event.preventDefault();
    closeNewGameDialog();
    return;
  }
  if(event.key!=='Tab')return;
  const focusable=Array.from(newGameBackdrop.querySelectorAll('button:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')).filter(element=>element.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0];
  const last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
function updateMemberLobbyUi(){
  const active=isMemberLobbyView();
  document.documentElement.classList.toggle('member-lobby-view',active);
  if(memberLobbyEl)memberLobbyEl.hidden=!active;
  if(preRoomSetupPanelEl&&preRoomSetupPanelHome){
    if(active&&memberLobbySetupMountEl&&preRoomSetupPanelEl.parentNode!==memberLobbySetupMountEl)memberLobbySetupMountEl.appendChild(preRoomSetupPanelEl);
    else if(!active&&preRoomSetupPanelEl.parentNode!==preRoomSetupPanelHome.parent){
      if(preRoomSetupPanelHome.nextSibling&&preRoomSetupPanelHome.nextSibling.parentNode===preRoomSetupPanelHome.parent)preRoomSetupPanelHome.parent.insertBefore(preRoomSetupPanelEl,preRoomSetupPanelHome.nextSibling);else preRoomSetupPanelHome.parent.appendChild(preRoomSetupPanelEl);
    }
  }
  updateSiteFootnotePlacement();
  if(active){
    if(statusEl)statusEl.textContent=embeddedToolStatusText()||'Partie starten, Gegner finden oder chatten.';
    connectGlobalChat();
  }else{
    closeNewGameDialog({restoreFocus:false});
    closeGlobalChat(true);
  }
  hammerschachScheduleHeightReport(false);
}
if(globalChatSendBtn)globalChatSendBtn.addEventListener('click',sendGlobalChatMessage);
if(globalChatInputEl)globalChatInputEl.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGlobalChatMessage();}});
if(globalChatReportCloseBtn)globalChatReportCloseBtn.addEventListener('click',closeGlobalChatReport);
if(globalChatReportSubmitBtn)globalChatReportSubmitBtn.addEventListener('click',submitGlobalChatReport);
if(globalChatReportBackdrop)globalChatReportBackdrop.addEventListener('click',event=>{if(event.target===globalChatReportBackdrop)closeGlobalChatReport();});
