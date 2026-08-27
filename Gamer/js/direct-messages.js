'use strict';

const privateMessagesOpenBtn = document.getElementById('privateMessagesOpenBtn');
const mobilePrivateMessagesOpenBtn = document.getElementById('mobilePrivateMessagesOpenBtn');
const mobileNavMessagesItem = document.getElementById('mobileNavMessagesItem');
const privateMessagesUnreadCount = document.getElementById('privateMessagesUnreadCount');
const mobilePrivateMessagesUnreadCount = document.getElementById('mobilePrivateMessagesUnreadCount');
const mobileNavMessagesCount = document.getElementById('mobileNavMessagesCount');
const privateMessagesBackdrop = document.getElementById('privateMessagesBackdrop');
const privateMessagesCloseBtn = document.getElementById('privateMessagesCloseBtn');
const privateMessagesCloseIconBtn = document.getElementById('privateMessagesCloseIconBtn');
const privateMessagesRefreshBtn = document.getElementById('privateMessagesRefreshBtn');
const privateMessagesInboxTab = document.getElementById('privateMessagesInboxTab');
const privateMessagesComposeTab = document.getElementById('privateMessagesComposeTab');
const privateMessagesInboxTabCount = document.getElementById('privateMessagesInboxTabCount');
const privateMessagesInboxPanel = document.getElementById('privateMessagesInboxPanel');
const privateMessagesComposePanel = document.getElementById('privateMessagesComposePanel');
const privateMessagesMobileBackBtn = document.getElementById('privateMessagesMobileBackBtn');
const privateMessagesList = document.getElementById('privateMessagesList');
const privateMessagesReader = document.getElementById('privateMessagesReader');
const privateMessagesStatus = document.getElementById('privateMessagesStatus');
const privateMessagesMemberSearch = document.getElementById('privateMessagesMemberSearch');
const privateMessagesSelectedRecipients = document.getElementById('privateMessagesSelectedRecipients');
const privateMessagesMembers = document.getElementById('privateMessagesMembers');
const privateMessagesText = document.getElementById('privateMessagesText');
const privateMessagesTextCount = document.getElementById('privateMessagesTextCount');
const privateMessagesComposeHint = document.getElementById('privateMessagesComposeHint');
const privateMessagesComposeStatus = document.getElementById('privateMessagesComposeStatus');
const privateMessagesClearBtn = document.getElementById('privateMessagesClearBtn');
const privateMessagesSendBtn = document.getElementById('privateMessagesSendBtn');

let privateMessagesInbox = [];
let privateMessagesMembersCache = [];
let privateMessagesSelected = new Map();
let privateMessagesActiveId = '';
let privateMessagesPollTimer = null;
let privateMessagesRequestId = 0;
let privateMessagesLastUnreadCount = null;
let privateMessagesMobileReaderActive = false;

function setPrivateMessagesStatus(message, kind, compose){
  const el = compose ? privateMessagesComposeStatus : privateMessagesStatus;
  if(!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', kind === 'error');
  el.classList.toggle('success', kind === 'success');
}

function privateMessagesLoggedIn(){
  return !!(typeof onlineAuthToken !== 'undefined' && onlineAuthToken && typeof onlineAuthUser !== 'undefined' && onlineAuthUser && onlineAuthUser.id);
}

function setPrivateMessagesBadge(count){
  const safe = Math.max(0, Math.floor(Number(count || 0)));
  const label = safe > 99 ? '99+' : String(safe);
  const increased = privateMessagesLastUnreadCount !== null && safe > privateMessagesLastUnreadCount;
  privateMessagesLastUnreadCount = safe;
  [privateMessagesUnreadCount, mobilePrivateMessagesUnreadCount, mobileNavMessagesCount, privateMessagesInboxTabCount].forEach(el => {
    if(!el) return;
    el.textContent = label;
    el.hidden = safe === 0;
  });
  if(privateMessagesOpenBtn) privateMessagesOpenBtn.setAttribute('aria-label', safe ? `Persönliche Nachrichten öffnen, ${safe} ungelesen` : 'Persönliche Nachrichten öffnen');
  if(mobilePrivateMessagesOpenBtn) mobilePrivateMessagesOpenBtn.setAttribute('aria-label', safe ? `Persönliche Nachrichten öffnen, ${safe} ungelesen` : 'Persönliche Nachrichten öffnen');
  if(increased){
    [privateMessagesOpenBtn, mobilePrivateMessagesOpenBtn].forEach(button => {
      if(!button) return;
      button.classList.remove('new-message');
      void button.offsetWidth;
      button.classList.add('new-message');
      setTimeout(() => button.classList.remove('new-message'), 1400);
    });
  }
}

function stopPrivateMessagesPolling(){
  if(privateMessagesPollTimer){ clearInterval(privateMessagesPollTimer); privateMessagesPollTimer = null; }
}

function startPrivateMessagesPolling(){
  stopPrivateMessagesPolling();
  if(!privateMessagesLoggedIn()) return;
  privateMessagesPollTimer = setInterval(() => {
    if(document.visibilityState === 'visible') refreshPrivateMessagesBadge().catch(() => {});
  }, 15000);
}

async function refreshPrivateMessagesBadge(){
  if(!privateMessagesLoggedIn()){ setPrivateMessagesBadge(0); return; }
  try{
    const data = await authApi('/api/private-messages?summary=1');
    setPrivateMessagesBadge(data.unreadCount || 0);
  } catch(_){}
}

function updatePrivateMessagesAuthState(){
  const loggedIn = privateMessagesLoggedIn();
  if(privateMessagesOpenBtn) privateMessagesOpenBtn.hidden = !loggedIn;
  if(mobilePrivateMessagesOpenBtn) mobilePrivateMessagesOpenBtn.hidden = !loggedIn;
  if(mobileNavMessagesItem) mobileNavMessagesItem.hidden = !loggedIn;
  if(memberProfileMessageBtn && !loggedIn) memberProfileMessageBtn.hidden = true;
  if(!loggedIn){
    privateMessagesLastUnreadCount = null;
    setPrivateMessagesBadge(0);
    privateMessagesLastUnreadCount = null;
    stopPrivateMessagesPolling();
    if(privateMessagesBackdrop) privateMessagesBackdrop.hidden = true;
    return;
  }
  refreshPrivateMessagesBadge().catch(() => {});
  startPrivateMessagesPolling();
}

function formatPrivateMessageTime(value, compact){
  const date = new Date(value || '');
  if(Number.isNaN(date.getTime())) return '';
  try{
    const today = new Date();
    const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    if(compact && sameDay) return date.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    return date.toLocaleString('de-DE', compact ? {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'} : {dateStyle:'medium', timeStyle:'short'});
  } catch(_){ return ''; }
}

function setPrivateMessagesTab(tab){
  const compose = tab === 'compose';
  setPrivateMessagesMobileReader(false);
  if(privateMessagesInboxTab){ privateMessagesInboxTab.classList.toggle('active', !compose); privateMessagesInboxTab.setAttribute('aria-selected', compose ? 'false' : 'true'); }
  if(privateMessagesComposeTab){ privateMessagesComposeTab.classList.toggle('active', compose); privateMessagesComposeTab.setAttribute('aria-selected', compose ? 'true' : 'false'); }
  if(privateMessagesInboxPanel) privateMessagesInboxPanel.hidden = compose;
  if(privateMessagesComposePanel) privateMessagesComposePanel.hidden = !compose;
  if(privateMessagesRefreshBtn) privateMessagesRefreshBtn.hidden = compose;
  setPrivateMessagesStatus('', '', false);
  if(compose) setTimeout(() => { try{ if(privateMessagesMemberSearch) privateMessagesMemberSearch.focus(); } catch(_){} }, 0);
}

function privateMessagesUsesSinglePane(){
  return !!(window.matchMedia && window.matchMedia('(max-width:700px)').matches);
}

function setPrivateMessagesMobileReader(active){
  privateMessagesMobileReaderActive = !!active;
  if(privateMessagesInboxPanel) privateMessagesInboxPanel.classList.toggle('mobile-reader-active', privateMessagesMobileReaderActive);
  if(privateMessagesMobileBackBtn) privateMessagesMobileBackBtn.hidden = !privateMessagesMobileReaderActive;
  if(!privateMessagesMobileReaderActive && privateMessagesList){
    const selectedRow = privateMessagesList.querySelector('.private-message-row.active');
    if(selectedRow && selectedRow.scrollIntoView){
      try{ selectedRow.scrollIntoView({block:'nearest'}); } catch(_){}
    }
  }
}

function closePrivateMessagesDialog(){
  setPrivateMessagesMobileReader(false);
  if(privateMessagesBackdrop) privateMessagesBackdrop.hidden = true;
}

function privateMessageConversationMember(message){
  return message && (message.otherUser || message.sender) ? (message.otherUser || message.sender) : null;
}

function privateMessageIsUnread(message){
  if(!message) return false;
  if(typeof message.unread === 'boolean') return message.unread;
  return !message.readAt;
}

function renderPrivateMessagesList(){
  if(!privateMessagesList) return;
  privateMessagesList.innerHTML = '';
  if(!privateMessagesInbox.length){
    setPrivateMessagesMobileReader(false);
    privateMessagesList.innerHTML = '<div class="private-messages-empty">Noch keine Unterhaltungen.</div>';
    if(privateMessagesReader) privateMessagesReader.innerHTML = '<div class="private-messages-empty">Hier erscheinen deine persönlichen Unterhaltungen.</div>';
    return;
  }
  privateMessagesInbox.forEach(message => {
    const member = privateMessageConversationMember(message);
    const unread = privateMessageIsUnread(message);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'private-message-row' + (unread ? ' unread' : '') + (message.id === privateMessagesActiveId ? ' active' : '');
    const sender = document.createElement('div');
    sender.className = 'private-message-row-sender';
    if(unread){ const dot=document.createElement('span'); dot.className='private-message-unread-dot'; sender.appendChild(dot); }
    sender.appendChild(document.createTextNode(member && member.username ? member.username : 'Mitglied'));
    const time = document.createElement('div');
    time.className = 'private-message-row-time';
    time.textContent = formatPrivateMessageTime(message.createdAt, true);
    const preview = document.createElement('div');
    preview.className = 'private-message-row-preview';
    const prefix = message.direction === 'outgoing' ? 'Du: ' : '';
    preview.textContent = prefix + String(message.text || '').replace(/\s+/g, ' ');
    button.append(sender, time, preview);
    button.addEventListener('click', () => openPrivateMessage(message.id));
    privateMessagesList.appendChild(button);
  });
}

function renderPrivateMessageReader(message, conversation){
  if(!privateMessagesReader) return;
  privateMessagesReader.innerHTML = '';
  if(!message){ privateMessagesReader.innerHTML = '<div class="private-messages-empty">Wähle links eine Unterhaltung aus.</div>'; return; }
  const member = privateMessageConversationMember(message);
  const memberName = member && member.username ? member.username : 'Mitglied';
  const head = document.createElement('div'); head.className='private-message-reader-head';
  const sender = document.createElement('div'); sender.className='private-message-reader-sender'; sender.textContent = 'Verlauf mit ' + memberName;
  const time = document.createElement('div'); time.className='private-message-reader-time'; time.textContent = 'Persönliche Nachrichten';
  head.append(sender,time);
  const thread = document.createElement('div'); thread.className='private-message-thread';
  const fallbackDirection = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const items = Array.isArray(conversation) && conversation.length ? conversation : [{direction:fallbackDirection,text:message.text,createdAt:message.createdAt}];
  items.forEach(item => {
    const row=document.createElement('div'); row.className='private-message-thread-row '+(item.direction==='outgoing'?'outgoing':'incoming');
    const bubble=document.createElement('div'); bubble.className='private-message-thread-bubble';
    const meta=document.createElement('div'); meta.className='private-message-thread-meta';
    meta.textContent=(item.direction==='outgoing'?'Du':memberName)+' · '+formatPrivateMessageTime(item.createdAt,false);
    const body=document.createElement('div'); body.className='private-message-thread-text'; body.textContent=item.text || '';
    bubble.append(meta,body); row.appendChild(bubble); thread.appendChild(row);
  });
  const actions = document.createElement('div'); actions.className='private-message-reader-actions';
  const reply = document.createElement('button'); reply.type='button'; reply.textContent='↩️ Antworten';
  reply.addEventListener('click', () => openPrivateMessagesCompose(member));
  actions.appendChild(reply);
  privateMessagesReader.append(head,thread,actions);
  setPrivateMessagesMobileReader(true);
  requestAnimationFrame(() => { try{ thread.scrollTop=thread.scrollHeight; } catch(_){} });
}

async function openPrivateMessage(id){
  const message = privateMessagesInbox.find(item => item.id === id);
  if(!message) return;
  privateMessagesActiveId = id;
  const member = privateMessageConversationMember(message);
  const memberId = String(member && member.id || '');
  let conversation = [];
  if(memberId){
    try{
      const threadData = await authApi('/api/private-messages/conversation/' + encodeURIComponent(memberId) + '?limit=250');
      conversation = Array.isArray(threadData.messages) ? threadData.messages : [];
      try{
        const readData = await authApi('/api/private-messages/conversation/' + encodeURIComponent(memberId) + '/read', {method:'POST', body:'{}'});
        message.unread = false;
        message.readAt = readData.readAt || message.readAt || new Date().toISOString();
        setPrivateMessagesBadge(readData.unreadCount || 0);
      } catch(_){}
    } catch(_){}
  }
  renderPrivateMessagesList();
  renderPrivateMessageReader(message, conversation);
}

async function loadPrivateMessagesInbox(options){
  options = options || {};
  if(!privateMessagesLoggedIn()) return;
  const requestId = ++privateMessagesRequestId;
  if(!options.silent) setPrivateMessagesStatus('Unterhaltungen werden geladen…', '', false);
  if(privateMessagesRefreshBtn) privateMessagesRefreshBtn.disabled = true;
  try{
    const data = await authApi('/api/private-messages?limit=150');
    if(requestId !== privateMessagesRequestId) return;
    privateMessagesInbox = Array.isArray(data.messages) ? data.messages : [];
    setPrivateMessagesBadge(data.unreadCount || 0);
    if(privateMessagesActiveId && !privateMessagesInbox.some(item => item.id === privateMessagesActiveId)) privateMessagesActiveId = '';
    renderPrivateMessagesList();
    if(privateMessagesActiveId && (!privateMessagesUsesSinglePane() || privateMessagesMobileReaderActive)){
      const activeId=privateMessagesActiveId;
      setTimeout(() => openPrivateMessage(activeId).catch(() => {}),0);
    }
    setPrivateMessagesStatus(privateMessagesInbox.length ? `${privateMessagesInbox.length} Unterhaltung${privateMessagesInbox.length === 1 ? '' : 'en'}.` : 'Noch keine Unterhaltungen.', privateMessagesInbox.length ? 'success' : '', false);
  } catch(err){
    if(requestId !== privateMessagesRequestId) return;
    setPrivateMessagesStatus(err && err.message ? err.message : 'Unterhaltungen konnten nicht geladen werden.', 'error', false);
  } finally {
    if(privateMessagesRefreshBtn) privateMessagesRefreshBtn.disabled = false;
  }
}

function renderPrivateMessageSelectedRecipients(){
  if(!privateMessagesSelectedRecipients) return;
  privateMessagesSelectedRecipients.innerHTML='';
  privateMessagesSelected.forEach((member,id) => {
    const chip=document.createElement('span'); chip.className='private-message-recipient-chip';
    const name=document.createElement('span'); name.textContent=member.username || 'Mitglied';
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.setAttribute('aria-label',(member.username || 'Mitglied')+' entfernen');
    remove.addEventListener('click', () => { privateMessagesSelected.delete(id); renderPrivateMessageSelectedRecipients(); renderPrivateMessagesMembers(); });
    chip.append(name,remove); privateMessagesSelectedRecipients.appendChild(chip);
  });
  if(privateMessagesComposeHint) privateMessagesComposeHint.textContent = privateMessagesSelected.size ? `${privateMessagesSelected.size} Empfänger ausgewählt.` : 'Du kannst eine oder mehrere Personen auswählen.';
}

function renderPrivateMessagesMembers(){
  if(!privateMessagesMembers) return;
  const query = String(privateMessagesMemberSearch && privateMessagesMemberSearch.value || '').trim().toLocaleLowerCase('de-DE');
  privateMessagesMembers.innerHTML='';
  if(privateMessagesUsesSinglePane() && query.length < 2){
    privateMessagesMembers.innerHTML='<div class="private-messages-empty">Gib mindestens zwei Zeichen ein, um weitere Empfänger zu suchen.</div>';
    return;
  }
  const matches = privateMessagesMembersCache.filter(member => !query || String(member.username || '').toLocaleLowerCase('de-DE').includes(query));
  const shown = privateMessagesUsesSinglePane() ? matches.slice(0,24) : matches;
  if(!shown.length){ privateMessagesMembers.innerHTML='<div class="private-messages-empty">Kein passendes Mitglied gefunden.</div>'; return; }
  shown.forEach(member => {
    const registrationComplete=memberRegistrationComplete(member);
    const label=document.createElement('label'); label.className='private-message-member-row'+(privateMessagesSelected.has(String(member.id))?' selected':'')+(registrationComplete?'':' registration-pending');
    const box=document.createElement('input'); box.type='checkbox'; box.checked=privateMessagesSelected.has(String(member.id)); box.disabled=!registrationComplete;
    box.addEventListener('change', () => {
      const id=String(member.id);
      if(box.checked) privateMessagesSelected.set(id,member); else privateMessagesSelected.delete(id);
      renderPrivateMessageSelectedRecipients(); renderPrivateMessagesMembers();
    });
    const name=document.createElement('span'); name.textContent=(member.username || 'Mitglied')+(registrationComplete?'':' · Anmeldung noch nicht abgeschlossen');
    if(!registrationComplete) label.title=memberRegistrationPendingMessage();
    label.append(box,name); privateMessagesMembers.appendChild(label);
  });
  if(matches.length > shown.length){
    const note=document.createElement('div'); note.className='private-messages-empty';
    note.textContent=`${matches.length-shown.length} weitere Treffer – bitte genauer suchen.`;
    privateMessagesMembers.appendChild(note);
  }
}

async function loadPrivateMessageMembers(){
  if(!privateMessagesLoggedIn()) return;
  if(privateMessagesMembersCache.length){ renderPrivateMessagesMembers(); return; }
  if(privateMessagesMembers) privateMessagesMembers.innerHTML='<div class="private-messages-empty">Mitglieder werden geladen…</div>';
  try{
    const data=await authApi('/api/members/list?limit=100&activity=all&sort=name');
    privateMessagesMembersCache=Array.isArray(data.users)?data.users:[];
    renderPrivateMessagesMembers();
  } catch(err){
    if(privateMessagesMembers) privateMessagesMembers.innerHTML='<div class="private-messages-empty">Mitglieder konnten nicht geladen werden.</div>';
    setPrivateMessagesStatus(err && err.message ? err.message : 'Mitglieder konnten nicht geladen werden.','error',true);
  }
}

function clearPrivateMessageCompose(keepRecipients){
  if(!keepRecipients) privateMessagesSelected.clear();
  if(privateMessagesMemberSearch) privateMessagesMemberSearch.value='';
  if(privateMessagesText) privateMessagesText.value='';
  if(privateMessagesTextCount) privateMessagesTextCount.textContent='0 / 1500';
  setPrivateMessagesStatus('', '', true);
  renderPrivateMessageSelectedRecipients();
  renderPrivateMessagesMembers();
}

async function sendPrivateMessageFromDialog(){
  if(!privateMessagesLoggedIn()) return;
  const text=String(privateMessagesText && privateMessagesText.value || '').trim();
  const ids=Array.from(privateMessagesSelected.keys());
  if(!ids.length){ setPrivateMessagesStatus('Bitte mindestens ein Mitglied auswählen.','error',true); return; }
  if(!text){ setPrivateMessagesStatus('Bitte eine Nachricht eingeben.','error',true); return; }
  if(privateMessagesSendBtn) privateMessagesSendBtn.disabled=true;
  setPrivateMessagesStatus('Nachricht wird gesendet…','',true);
  try{
    const data=await authApi('/api/private-messages',{method:'POST',body:JSON.stringify({recipientUserIds:ids,text})});
    setPrivateMessagesStatus(data.message || 'Nachricht wurde gesendet.','success',true);
    clearPrivateMessageCompose(false);
    setPrivateMessagesStatus(data.message || 'Nachricht wurde gesendet.','success',true);
  } catch(err){ setPrivateMessagesStatus(err && err.message ? err.message : 'Nachricht konnte nicht gesendet werden.','error',true); }
  finally { if(privateMessagesSendBtn) privateMessagesSendBtn.disabled=false; }
}

async function openPrivateMessagesDialog(tab){
  if(!privateMessagesLoggedIn()){ if(typeof openAuthDialog === 'function') openAuthDialog('login'); return; }
  if(privateMessagesBackdrop) privateMessagesBackdrop.hidden=false;
  setPrivateMessagesTab(tab === 'compose' ? 'compose' : 'inbox');
  if(tab === 'compose') await loadPrivateMessageMembers(); else await loadPrivateMessagesInbox();
}

async function openPrivateMessagesCompose(member){
  if(!privateMessagesLoggedIn()){ if(typeof openAuthDialog === 'function') openAuthDialog('login'); return; }
  if(member && !memberRegistrationComplete(member)){
    setPrivateMessagesStatus(memberRegistrationPendingMessage() + '. Nachrichten sind erst nach der Mailbestätigung möglich.','error',true);
    return;
  }
  if(member && member.id && (!onlineAuthUser || String(member.id)!==String(onlineAuthUser.id))){
    privateMessagesSelected.clear();
    privateMessagesSelected.set(String(member.id), {id:String(member.id), username:member.username || 'Mitglied'});
  }
  if(privateMessagesBackdrop) privateMessagesBackdrop.hidden=false;
  setPrivateMessagesTab('compose');
  renderPrivateMessageSelectedRecipients();
  await loadPrivateMessageMembers();
  renderPrivateMessagesMembers();
  setTimeout(() => { try{ if(privateMessagesText) privateMessagesText.focus(); } catch(_){} },0);
}

window.updatePrivateMessagesAuthState = updatePrivateMessagesAuthState;
window.openPrivateMessagesCompose = openPrivateMessagesCompose;
window.openPrivateMessagesDialog = openPrivateMessagesDialog;

if(privateMessagesOpenBtn) privateMessagesOpenBtn.addEventListener('click', () => openPrivateMessagesDialog('inbox'));
if(mobilePrivateMessagesOpenBtn) mobilePrivateMessagesOpenBtn.addEventListener('click', () => openPrivateMessagesDialog('inbox'));
if(privateMessagesCloseBtn) privateMessagesCloseBtn.addEventListener('click', closePrivateMessagesDialog);
if(privateMessagesCloseIconBtn) privateMessagesCloseIconBtn.addEventListener('click', closePrivateMessagesDialog);
if(privateMessagesRefreshBtn) privateMessagesRefreshBtn.addEventListener('click', () => loadPrivateMessagesInbox());
if(privateMessagesInboxTab) privateMessagesInboxTab.addEventListener('click', () => { setPrivateMessagesTab('inbox'); loadPrivateMessagesInbox({silent:true}); });
if(privateMessagesComposeTab) privateMessagesComposeTab.addEventListener('click', () => { setPrivateMessagesTab('compose'); loadPrivateMessageMembers(); });
if(privateMessagesMobileBackBtn) privateMessagesMobileBackBtn.addEventListener('click', () => setPrivateMessagesMobileReader(false));
if(privateMessagesMemberSearch) privateMessagesMemberSearch.addEventListener('input', renderPrivateMessagesMembers);
if(privateMessagesText) privateMessagesText.addEventListener('input', () => { if(privateMessagesTextCount) privateMessagesTextCount.textContent=String(privateMessagesText.value.length)+' / 1500'; });
if(privateMessagesClearBtn) privateMessagesClearBtn.addEventListener('click', () => clearPrivateMessageCompose(false));
if(privateMessagesSendBtn) privateMessagesSendBtn.addEventListener('click', sendPrivateMessageFromDialog);
if(privateMessagesBackdrop) privateMessagesBackdrop.addEventListener('click', ev => { if(ev.target===privateMessagesBackdrop) closePrivateMessagesDialog(); });
document.addEventListener('keydown', ev => { if(ev.key==='Escape' && privateMessagesBackdrop && !privateMessagesBackdrop.hidden) closePrivateMessagesDialog(); });
document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible') refreshPrivateMessagesBadge().catch(() => {}); });

updatePrivateMessagesAuthState();
