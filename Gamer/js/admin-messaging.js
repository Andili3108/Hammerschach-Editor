'use strict';

const ADMIN_MESSAGE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const ADMIN_MESSAGE_ATTACHMENT_TYPES = {
  'application/pdf':['pdf'],
  'image/jpeg':['jpg','jpeg'],
  'image/png':['png'],
  'image/webp':['webp']
};
let adminMessageAudienceCount = 0;
let adminMessageBusy = false;
let selectedAdminMessageAttachment = null;
let adminMessageRecipientsLoaded = false;
let adminMessageRecipientsLoading = false;
function isPersonalAdminMessage(){
  return !!(adminMessageKindSelect && adminMessageKindSelect.value === 'personal');
}
function selectedAdminMessageRecipientName(){
  if(!adminMessageRecipientSelect || !adminMessageRecipientSelect.value) return '';
  const option = adminMessageRecipientSelect.options[adminMessageRecipientSelect.selectedIndex];
  return option ? String(option.textContent || '').trim() : '';
}
function updateAdminMessageRecipientUi(){
  const personal = isPersonalAdminMessage();
  if(adminMessageRecipientBox) adminMessageRecipientBox.hidden = !personal;
  if(adminMessageRecipientSelect) adminMessageRecipientSelect.disabled = adminMessageBusy || adminMessageRecipientsLoading || !personal;
  if(personal && !adminMessageRecipientsLoaded && !adminMessageRecipientsLoading) loadAdminMessageRecipients();
}
async function loadAdminMessageRecipients(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true || adminMessageRecipientsLoading) return;
  adminMessageRecipientsLoading = true;
  const previousValue = adminMessageRecipientSelect ? adminMessageRecipientSelect.value : '';
  if(adminMessageRecipientSelect){
    adminMessageRecipientSelect.disabled = true;
    adminMessageRecipientSelect.innerHTML = '<option value="">Mitglieder werden geladen…</option>';
  }
  try{
    const data = await authApi('/api/admin/member-message/recipients');
    const users = Array.isArray(data.users) ? data.users : [];
    if(adminMessageRecipientSelect){
      adminMessageRecipientSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = users.length ? 'Mitglied auswählen…' : 'Kein erreichbares Mitglied vorhanden';
      adminMessageRecipientSelect.appendChild(placeholder);
      users.forEach(user => {
        if(!user || !user.id || !user.username) return;
        const option = document.createElement('option');
        option.value = String(user.id);
        option.textContent = cleanDisplayName(user.username) || 'Mitglied';
        adminMessageRecipientSelect.appendChild(option);
      });
      if(previousValue && users.some(user => String(user && user.id || '') === previousValue)) adminMessageRecipientSelect.value = previousValue;
    }
    adminMessageRecipientsLoaded = true;
  } catch(err){
    adminMessageRecipientsLoaded = false;
    if(adminMessageRecipientSelect) adminMessageRecipientSelect.innerHTML = '<option value="">Mitglieder konnten nicht geladen werden</option>';
    setAdminMessageStatus(err && err.message ? err.message : 'Die auswählbaren Mitglieder konnten nicht geladen werden.', 'error');
  } finally {
    adminMessageRecipientsLoading = false;
    if(adminMessageRecipientBox) adminMessageRecipientBox.hidden = !isPersonalAdminMessage();
    if(adminMessageRecipientSelect) adminMessageRecipientSelect.disabled = adminMessageBusy || !isPersonalAdminMessage();
    refreshAdminMessageAudience();
  }
}
function adminMessageFileExtension(name){
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : '';
}
function adminMessageMimeFromFile(file){
  const browserType = String(file && file.type || '').toLowerCase();
  if(ADMIN_MESSAGE_ATTACHMENT_TYPES[browserType]) return browserType;
  const extension = adminMessageFileExtension(file && file.name);
  for(const [type, extensions] of Object.entries(ADMIN_MESSAGE_ATTACHMENT_TYPES)){
    if(extensions.includes(extension)) return type;
  }
  return '';
}
function formatAdminMessageFileSize(bytes){
  const size = Number(bytes || 0);
  if(size < 1024) return size + ' Byte';
  if(size < 1024 * 1024) return (size / 1024).toLocaleString('de-DE', {maximumFractionDigits:1}) + ' KB';
  return (size / (1024 * 1024)).toLocaleString('de-DE', {maximumFractionDigits:2}) + ' MB';
}
function updateAdminMessageAttachmentUi(){
  const attachment = selectedAdminMessageAttachment;
  if(adminMessageAttachmentSelected) adminMessageAttachmentSelected.hidden = !attachment;
  if(adminMessageAttachmentName) adminMessageAttachmentName.textContent = attachment ? attachment.name : '';
  if(adminMessageAttachmentMeta) adminMessageAttachmentMeta.textContent = attachment ? (formatAdminMessageFileSize(attachment.size) + ' · ' + attachment.type) : '';
  const isImage = !!(attachment && attachment.type.startsWith('image/'));
  if(adminMessageInlineOption) adminMessageInlineOption.hidden = !isImage;
  if(adminMessageInlineCheckbox){
    adminMessageInlineCheckbox.disabled = adminMessageBusy || !isImage;
    if(!isImage) adminMessageInlineCheckbox.checked = false;
  }
  if(attachment) attachment.inline = isImage && !!(adminMessageInlineCheckbox && adminMessageInlineCheckbox.checked);
  if(adminMessageAttachmentPreview){
    adminMessageAttachmentPreview.hidden = !isImage;
    adminMessageAttachmentPreview.src = isImage ? ('data:' + attachment.type + ';base64,' + attachment.base64) : '';
  }
  if(adminMessageAttachmentInput) adminMessageAttachmentInput.disabled = adminMessageBusy;
  if(adminMessageAttachmentRemoveBtn) adminMessageAttachmentRemoveBtn.disabled = adminMessageBusy;
  updateAdminMessageSendState();
}
function clearAdminMessageAttachment(){
  selectedAdminMessageAttachment = null;
  if(adminMessageAttachmentInput) adminMessageAttachmentInput.value = '';
  if(adminMessageInlineCheckbox) adminMessageInlineCheckbox.checked = true;
  if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
  updateAdminMessageAttachmentUi();
}
function readAdminMessageFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if(comma < 0) reject(new Error('Die Datei konnte nicht verarbeitet werden.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
async function handleAdminMessageAttachmentSelection(){
  const file = adminMessageAttachmentInput && adminMessageAttachmentInput.files ? adminMessageAttachmentInput.files[0] : null;
  if(!file){ clearAdminMessageAttachment(); return; }
  const type = adminMessageMimeFromFile(file);
  const extension = adminMessageFileExtension(file.name);
  if(!type || !ADMIN_MESSAGE_ATTACHMENT_TYPES[type] || !ADMIN_MESSAGE_ATTACHMENT_TYPES[type].includes(extension)){
    clearAdminMessageAttachment();
    setAdminMessageStatus('Erlaubt sind ausschließlich PDF-, JPG-, PNG- und WebP-Dateien.', 'error');
    return;
  }
  if(!file.size || file.size > ADMIN_MESSAGE_ATTACHMENT_MAX_BYTES){
    clearAdminMessageAttachment();
    setAdminMessageStatus('Der Anhang darf höchstens 3 MB groß sein.', 'error');
    return;
  }
  setAdminMessageStatus('Anhang wird eingelesen…', '');
  try{
    const base64 = await readAdminMessageFileAsBase64(file);
    selectedAdminMessageAttachment = {
      name:String(file.name || 'Anhang').slice(0, 100),
      type,
      size:file.size,
      base64,
      inline:type.startsWith('image/')
    };
    if(adminMessageInlineCheckbox) adminMessageInlineCheckbox.checked = type.startsWith('image/');
    if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
    updateAdminMessageAttachmentUi();
    setAdminMessageStatus('Anhang ausgewählt: ' + selectedAdminMessageAttachment.name, 'success');
  } catch(err){
    clearAdminMessageAttachment();
    setAdminMessageStatus(err && err.message ? err.message : 'Der Anhang konnte nicht gelesen werden.', 'error');
  }
}
function setAdminMessageStatus(message, kind){
  if(!adminMessageStatus) return;
  adminMessageStatus.textContent = message || '';
  adminMessageStatus.classList.toggle('error', kind === 'error');
  adminMessageStatus.classList.toggle('success', kind === 'success');
}
function updateAdminMessagePreview(){
  const subject = String(adminMessageSubjectInput && adminMessageSubjectInput.value || '').trim();
  const text = String(adminMessageTextInput && adminMessageTextInput.value || '').trim();
  if(adminMessagePreviewTitle) adminMessagePreviewTitle.textContent = subject || 'Betreff der Nachricht';
  if(adminMessagePreviewBody) adminMessagePreviewBody.textContent = text || 'Der Nachrichtentext erscheint hier.';
  if(adminMessageCharCount) adminMessageCharCount.textContent = String(adminMessageTextInput ? adminMessageTextInput.value.length : 0) + ' / 5000';
  updateAdminMessageSendState();
}
function updateAdminMessageSendState(){
  const personalRecipientReady = !isPersonalAdminMessage() || !!(adminMessageRecipientSelect && adminMessageRecipientSelect.value);
  const ready = !!(
    !adminMessageBusy &&
    adminMessageAudienceCount > 0 &&
    personalRecipientReady &&
    adminMessageConfirmCheckbox && adminMessageConfirmCheckbox.checked &&
    adminMessageSubjectInput && adminMessageSubjectInput.value.trim().length >= 3 &&
    adminMessageTextInput && adminMessageTextInput.value.trim().length >= 3
  );
  if(adminMessageSendBtn) adminMessageSendBtn.disabled = !ready;
  if(adminMessageTestBtn) adminMessageTestBtn.disabled = adminMessageBusy;
  if(adminMessageKindSelect) adminMessageKindSelect.disabled = adminMessageBusy;
  if(adminMessageRecipientSelect) adminMessageRecipientSelect.disabled = adminMessageBusy || adminMessageRecipientsLoading || !isPersonalAdminMessage();
  if(adminMessageSubjectInput) adminMessageSubjectInput.disabled = adminMessageBusy;
  if(adminMessageTextInput) adminMessageTextInput.disabled = adminMessageBusy;
  if(adminMessageAttachmentInput) adminMessageAttachmentInput.disabled = adminMessageBusy;
  if(adminMessageAttachmentRemoveBtn) adminMessageAttachmentRemoveBtn.disabled = adminMessageBusy;
  if(adminMessageInlineCheckbox) adminMessageInlineCheckbox.disabled = adminMessageBusy || !(selectedAdminMessageAttachment && selectedAdminMessageAttachment.type.startsWith('image/'));
}
async function refreshAdminMessageAudience(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  adminMessageAudienceCount = 0;
  updateAdminMessageSendState();
  if(adminMessageAudience) adminMessageAudience.textContent = 'Empfängerzahl wird ermittelt…';
  try{
    const kind = adminMessageKindSelect ? adminMessageKindSelect.value : 'news';
    const targetUserId = kind === 'personal' && adminMessageRecipientSelect ? adminMessageRecipientSelect.value : '';
    if(kind === 'personal' && !targetUserId){
      if(adminMessageAudience) adminMessageAudience.textContent = 'Bitte genau ein Mitglied auswählen. Die Nachricht wird ausschließlich an diesen Account gesendet.';
      updateAdminMessageSendState();
      return;
    }
    const data = await authApi('/api/admin/member-message/audience?kind=' + encodeURIComponent(kind) + (targetUserId ? '&targetUserId=' + encodeURIComponent(targetUserId) : ''));
    if(kind !== (adminMessageKindSelect ? adminMessageKindSelect.value : 'news')) return;
    if(kind === 'personal' && targetUserId !== (adminMessageRecipientSelect ? adminMessageRecipientSelect.value : '')) return;
    const audience = data.audience || {};
    adminMessageAudienceCount = Number(audience.count || 0);
    if(adminMessageAudience){
      adminMessageAudience.textContent = adminMessageAudienceCount.toLocaleString('de-DE') + ' Empfänger · ' + (audience.description || 'Berechtigte Mitglieder');
    }
  } catch(err){
    adminMessageAudienceCount = 0;
    if(adminMessageAudience) adminMessageAudience.textContent = err && err.message ? err.message : 'Empfängerzahl konnte nicht geladen werden.';
  }
  updateAdminMessageSendState();
}
function openAdminMessageDialog(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  if(adminMessageBackdrop) adminMessageBackdrop.hidden = false;
  if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
  setAdminMessageStatus('', '');
  updateAdminMessageRecipientUi();
  updateAdminMessagePreview();
  refreshAdminMessageAudience();
  setTimeout(() => { try{ if(adminMessageSubjectInput) adminMessageSubjectInput.focus(); } catch(_){} }, 0);
}
function closeAdminMessageDialog(reopenOverview){
  if(adminMessageBusy) return;
  if(adminMessageBackdrop) adminMessageBackdrop.hidden = true;
  setAdminMessageStatus('', '');
  if(reopenOverview && onlineAuthToken && onlineAuthUser && onlineAuthUser.isAdmin === true){
    if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
    refreshAdminOverview();
  }
}
function adminMessagePayload(confirmed){
  const attachment = selectedAdminMessageAttachment ? {
    name:selectedAdminMessageAttachment.name,
    type:selectedAdminMessageAttachment.type,
    size:selectedAdminMessageAttachment.size,
    base64:selectedAdminMessageAttachment.base64,
    inline:!!(selectedAdminMessageAttachment.type.startsWith('image/') && adminMessageInlineCheckbox && adminMessageInlineCheckbox.checked)
  } : null;
  return {
    kind:adminMessageKindSelect ? adminMessageKindSelect.value : 'news',
    targetUserId:isPersonalAdminMessage() && adminMessageRecipientSelect ? adminMessageRecipientSelect.value : '',
    subject:String(adminMessageSubjectInput && adminMessageSubjectInput.value || '').trim(),
    message:String(adminMessageTextInput && adminMessageTextInput.value || '').trim(),
    attachment,
    confirmed:confirmed === true
  };
}
async function sendAdminMessageTest(){
  if(adminMessageBusy) return;
  const payload = adminMessagePayload(false);
  if(payload.subject.length < 3 || payload.message.length < 3){ setAdminMessageStatus('Bitte zuerst Betreff und Nachricht vollständig eingeben.', 'error'); return; }
  adminMessageBusy = true;
  updateAdminMessageSendState();
  setAdminMessageStatus('Testmail wird versendet…', '');
  try{
    const data = await authApi('/api/admin/member-message/test', {method:'POST', body:JSON.stringify(payload)});
    setAdminMessageStatus(data.message || 'Testmail wurde versendet.', 'success');
  } catch(err){
    setAdminMessageStatus(err && err.message ? err.message : 'Die Testmail konnte nicht versendet werden.', 'error');
  } finally {
    adminMessageBusy = false;
    updateAdminMessageSendState();
  }
}
async function sendAdminMessageNow(){
  if(adminMessageBusy || !adminMessageSendBtn || adminMessageSendBtn.disabled) return;
  const payload = adminMessagePayload(true);
  const kindLabel = payload.kind === 'personal' ? 'persönliche Admin-Nachricht' : payload.kind === 'system' ? 'wichtige Systeminformation' : 'Neuigkeiten';
  const attachmentNote = payload.attachment ? (' Der Anhang „' + payload.attachment.name + '“ wird mit jeder Nachricht versendet.') : '';
  const recipientName = selectedAdminMessageRecipientName();
  const question = payload.kind === 'personal'
    ? 'Die persönliche Admin-Nachricht wird ausschließlich an „' + recipientName + '“ gesendet.' + attachmentNote + ' Wirklich fortfahren?'
    : 'Die ' + kindLabel + ' wird jetzt einzeln an ' + adminMessageAudienceCount.toLocaleString('de-DE') + ' Mitglieder versendet.' + attachmentNote + ' Wirklich fortfahren?';
  if(!window.confirm(question)) return;
  adminMessageBusy = true;
  updateAdminMessageSendState();
  setAdminMessageStatus(payload.kind === 'personal' ? ('Persönliche Nachricht an „' + recipientName + '“ wird versendet…') : 'Mitglieder-Nachricht wird versendet. Bitte dieses Fenster geöffnet lassen…', '');
  try{
    const data = await authApi('/api/admin/member-message/send', {method:'POST', body:JSON.stringify(payload)});
    setAdminMessageStatus(data.message || 'Mitglieder-Nachricht wurde verarbeitet.', Number(data.failedCount || 0) > 0 ? 'error' : 'success');
    if(Number(data.failedCount || 0) === 0){
      if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
      clearAdminMessageAttachment();
      updateAdminMessageSendState();
    }
  } catch(err){
    setAdminMessageStatus(err && err.message ? err.message : 'Die Mitglieder-Nachricht konnte nicht versendet werden.', 'error');
  } finally {
    adminMessageBusy = false;
    updateAdminMessageSendState();
    refreshAdminMessageAudience();
  }
}
if(adminMemberMessageOpenBtn) adminMemberMessageOpenBtn.addEventListener('click', openAdminMessageDialog);
if(adminMessageKindSelect) adminMessageKindSelect.addEventListener('change', () => {
  if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
  updateAdminMessageRecipientUi();
  refreshAdminMessageAudience();
  updateAdminMessageSendState();
});
if(adminMessageRecipientSelect) adminMessageRecipientSelect.addEventListener('change', () => {
  if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
  refreshAdminMessageAudience();
  updateAdminMessageSendState();
});
if(adminMessageSubjectInput) adminMessageSubjectInput.addEventListener('input', updateAdminMessagePreview);
if(adminMessageTextInput) adminMessageTextInput.addEventListener('input', updateAdminMessagePreview);
if(adminMessageAttachmentInput) adminMessageAttachmentInput.addEventListener('change', handleAdminMessageAttachmentSelection);
if(adminMessageAttachmentRemoveBtn) adminMessageAttachmentRemoveBtn.addEventListener('click', clearAdminMessageAttachment);
if(adminMessageInlineCheckbox) adminMessageInlineCheckbox.addEventListener('change', () => {
  if(selectedAdminMessageAttachment) selectedAdminMessageAttachment.inline = !!adminMessageInlineCheckbox.checked;
  if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.checked = false;
  updateAdminMessageAttachmentUi();
});
if(adminMessageConfirmCheckbox) adminMessageConfirmCheckbox.addEventListener('change', updateAdminMessageSendState);
if(adminMessageTestBtn) adminMessageTestBtn.addEventListener('click', sendAdminMessageTest);
if(adminMessageSendBtn) adminMessageSendBtn.addEventListener('click', sendAdminMessageNow);
if(adminMessageCloseBtn) adminMessageCloseBtn.addEventListener('click', () => closeAdminMessageDialog(true));
if(adminMessageBackdrop) adminMessageBackdrop.addEventListener('click', ev => { if(ev.target === adminMessageBackdrop) closeAdminMessageDialog(true); });
