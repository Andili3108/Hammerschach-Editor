'use strict';

let adminOverviewLoading = false;
function setAdminOverviewStatus(message, kind){
  if(!adminOverviewStatus) return;
  adminOverviewStatus.textContent = message || '';
  adminOverviewStatus.classList.toggle('error', kind === 'error');
  adminOverviewStatus.classList.toggle('success', kind === 'success');
}
function formatAdminDateTime(value){
  const date = value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return '—';
  try{ return date.toLocaleString('de-DE', {dateStyle:'medium', timeStyle:'short'}); } catch(_){ return date.toISOString(); }
}
function adminNumber(value){
  const number = Number(value || 0);
  if(!Number.isFinite(number)) return '0';
  try{ return Math.max(0, Math.floor(number)).toLocaleString('de-DE'); } catch(_){ return String(Math.max(0, Math.floor(number))); }
}
function replaceChildrenWithCards(container, cards){
  if(!container) return;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  cards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'admin-stat-card' + (card.alert ? ' alert' : '');
    const label = document.createElement('div');
    label.className = 'admin-stat-label';
    label.textContent = card.label;
    const value = document.createElement('div');
    value.className = 'admin-stat-value';
    value.textContent = card.value;
    item.appendChild(label);
    item.appendChild(value);
    frag.appendChild(item);
  });
  container.appendChild(frag);
}
function replaceInlineStats(container, stats){
  if(!container) return;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  stats.forEach(stat => {
    const item = document.createElement('div');
    item.className = 'admin-inline-stat';
    item.appendChild(document.createTextNode(stat.label));
    const strong = document.createElement('strong');
    strong.textContent = stat.value;
    item.appendChild(strong);
    frag.appendChild(item);
  });
  container.appendChild(frag);
}
const ADMIN_EVENT_LABELS = {
  login:'Login', register:'Registrierung', password_reset_request:'Kennwort-Reset angefordert',
  password_reset_confirm:'Kennwort-Reset bestätigt', email_verification_request:'Mailbestätigung angefordert',
  email_verification_confirm:'Mailbestätigung bestätigt'
};
const ADMIN_OUTCOME_LABELS = {
  success:'Erfolg', failure:'Fehlgeschlagen', rejected:'Abgelehnt', blocked:'Blockiert', throttled:'Rate-Limit',
  error:'Fehler', skipped:'Übersprungen', not_found:'Nicht gefunden', sent:'Gesendet'
};
const ADMIN_DETAIL_LABELS = {
  RATE_LIMITED:'Zu viele Versuche', INVALID_CREDENTIALS:'Falsche Zugangsdaten', INVALID_LOGIN:'Ungültiger Login',
  MISSING_LOGIN:'Angaben fehlen', EMAIL_NOT_VERIFIED:'Mail noch nicht bestätigt', ACCOUNT_DISABLED:'Account deaktiviert',
  SESSION_CREATED:'Sitzung erstellt', REGISTRATION_VERIFIED:'Registrierung bestätigt', EMAIL_CHANGED:'Mailadresse geändert',
  PASSWORD_CHANGED:'Kennwort geändert', INVALID_OR_EXPIRED_TOKEN:'Link ungültig oder abgelaufen', TOKEN_ALREADY_USED:'Link bereits verwendet',
  DUPLICATE_ACCOUNT_DATA:'Doppelte Accountdaten', WEAK_PASSWORD:'Kennwort zu schwach', INTERNAL_ERROR:'Interner Fehler',
  GENERIC_RESPONSE:'Neutrale Antwort', ALREADY_VERIFIED:'Bereits bestätigt'
};
const ADMIN_MAIL_TYPE_LABELS = {
  invitation:'Partieeinladung', email_verification:'Mailbestätigung', password_reset:'Kennwort-Reset',
  email_change_verification:'Neue Mailadresse', email_change_notice:'Hinweis zur Mailänderung',
  daily_turn:'Daily: am Zug', daily_result:'Daily: Ergebnis', member_news:'Mitglieder-Neuigkeiten', member_system:'Mitglieder-Systeminfo', member_personal:'Persönliche Admin-Nachricht', member_news_test:'Test: Neuigkeiten', member_system_test:'Test: Systeminfo', member_personal_test:'Test: persönliche Admin-Nachricht', transactional:'Systemmail'
};
const ADMIN_TABLE_LABELS = {
  users:'Accounts', sessions:'Sitzungen', daily_games:'Daily-Partien', public_games:'Öffentliche Partien',
  rated_games:'Gewertete Partien', user_ratings:'Ratingkonten', trainer_progress:'Taktik-Ratings', trainer_attempts:'Taktik-Versuche', auth_security_events:'Sicherheitsereignisse',
  auth_rate_limit_log:'Rate-Limit-Einträge', account_action_tokens:'Aktionslinks', mail_delivery_log:'Mailprotokoll',
  email_notification_log:'Daily-Mailprotokoll', user_onboarding:'Leitbild-Bestätigungen', admin_member_messages:'Mitglieder-Nachrichten', admin_member_message_recipients:'Nachrichten-Empfänger',
  lobby_ticker_items:'Lobby-Ticker-Meldungen', info_center_items:'Info-Center-Mitteilungen',
  info_center_attachments:'Info-Center-Dateien', info_center_reads:'Info-Center-Lesestände'
};
function renderAdminSecurityEvents(events){
  if(!adminSecurityEvents) return;
  adminSecurityEvents.innerHTML = '';
  const list = Array.isArray(events) ? events : [];
  if(!list.length){
    const empty = document.createElement('div'); empty.className = 'admin-list-empty'; empty.textContent = 'Noch keine Sicherheitsereignisse protokolliert.'; adminSecurityEvents.appendChild(empty); return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(event => {
    const row = document.createElement('div');
    const negative = ['failure','rejected','blocked','throttled','error'].includes(String(event.outcome || ''));
    row.className = 'admin-event-row' + (negative ? ' failure' : '');
    const type = document.createElement('div');
    type.textContent = ADMIN_EVENT_LABELS[event.eventType] || event.eventType || 'Ereignis';
    const main = document.createElement('div'); main.className = 'admin-event-main';
    const parts = [ADMIN_OUTCOME_LABELS[event.outcome] || event.outcome || '—'];
    if(event.username) parts.push(event.username);
    if(event.detailCode) parts.push(ADMIN_DETAIL_LABELS[event.detailCode] || event.detailCode);
    main.textContent = parts.join(' · ');
    const time = document.createElement('div'); time.className = 'admin-event-time'; time.textContent = formatAdminDateTime(event.createdAt);
    row.appendChild(type); row.appendChild(main); row.appendChild(time); frag.appendChild(row);
  });
  adminSecurityEvents.appendChild(frag);
}
function renderAdminMailFailures(failures){
  if(!adminMailFailures) return;
  adminMailFailures.innerHTML = '';
  const list = Array.isArray(failures) ? failures : [];
  if(!list.length){
    const empty = document.createElement('div'); empty.className = 'admin-list-empty'; empty.textContent = 'Keine protokollierten Mailfehler.'; adminMailFailures.appendChild(empty); return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const row = document.createElement('div'); row.className = 'admin-event-row failure';
    const type = document.createElement('div'); type.textContent = ADMIN_MAIL_TYPE_LABELS[item.mailType] || item.mailType || 'Systemmail';
    const main = document.createElement('div'); main.className = 'admin-event-main';
    main.textContent = [item.provider || 'unbekannt', item.errorCode || 'MAIL_FAILED', item.errorMessage || 'Versand fehlgeschlagen'].join(' · ');
    const time = document.createElement('div'); time.className = 'admin-event-time'; time.textContent = formatAdminDateTime(item.createdAt);
    row.appendChild(type); row.appendChild(main); row.appendChild(time); frag.appendChild(row);
  });
  adminMailFailures.appendChild(frag);
}

const MODERATION_REASON_LABELS={insult:'Beleidigung',threat:'Drohung',discrimination:'Diskriminierung',spam:'Spam/Werbung',username:'Benutzername',stalling:'Störung/Zeitverzögerung',cheating:'Unerlaubte Schachhilfe',other:'Sonstiges'};
async function moderationAdminAction(report,userId,action){
  if(!userId){ window.alert('Bei Gästen ist keine dauerhafte Accountsperre möglich. Die Meldung kann dennoch abgeschlossen werden.'); return; }
  let hours=24; if(action==='suspend'){ const raw=window.prompt('Dauer der Sperre in Stunden:','24'); if(raw===null)return; hours=Math.max(1,Number(raw||24)); }
  const reason=window.prompt('Interner Grund der Maßnahme:',MODERATION_REASON_LABELS[report.reason]||report.reason||'') ; if(reason===null)return;
  await authApi('/api/admin/moderation/action',{method:'POST',body:JSON.stringify({userId,action,hours,reason,note:'Meldung '+report.id})});
  await authApi('/api/admin/moderation/resolve',{method:'POST',body:JSON.stringify({reportId:report.id,status:'resolved',resolution:action,note:reason})});
  await refreshAdminModeration();
}
async function resolveModerationReport(report,status){
  const note=window.prompt(status==='dismissed'?'Interne Begründung für das Verwerfen:':'Interne Abschlussnotiz:',''); if(note===null)return;
  await authApi('/api/admin/moderation/resolve',{method:'POST',body:JSON.stringify({reportId:report.id,status,resolution:status,note})}); await refreshAdminModeration();
}
function renderAdminModeration(reports){
  const list=Array.isArray(reports)?reports:[]; const open=list.filter(r=>r.status==='open');
  replaceInlineStats(adminModerationStats,[{label:'Offene Meldungen',value:adminNumber(open.length)},{label:'Meldungen insgesamt',value:adminNumber(list.length)},{label:'Gemeldete Accounts',value:adminNumber(new Set(list.filter(r=>r.reportedUserId).map(r=>r.reportedUserId)).size)},{label:'Erledigt/verworfen',value:adminNumber(list.length-open.length)}]);
  if(!adminModerationList)return; adminModerationList.innerHTML=''; if(!list.length){const e=document.createElement('div');e.className='admin-list-empty';e.textContent='Keine Meldungen vorhanden.';adminModerationList.appendChild(e);return;}
  list.forEach(report=>{ const card=document.createElement('div');card.className='admin-report-card '+(report.status==='open'?'open':'');
    const head=document.createElement('div');head.className='admin-report-head';head.innerHTML='<span></span><span></span>';head.children[0].textContent=(report.reportedName||'Spieler')+' · '+(MODERATION_REASON_LABELS[report.reason]||report.reason);head.children[1].textContent=report.status==='open'?'OFFEN':String(report.status||'').toUpperCase();card.appendChild(head);
    const meta=document.createElement('div');meta.className='admin-report-meta';meta.textContent='Gemeldet von '+(report.reporterName||'—')+' · '+(report.roomId==='global-chat'?'Mitglieder-Chat':('Raum '+report.roomId))+' · '+formatAdminDateTime(report.createdAt);card.appendChild(meta);
    if(report.comment){const c=document.createElement('div');c.className='admin-report-comment';c.textContent='Erläuterung: '+report.comment;card.appendChild(c);}
    if(Array.isArray(report.chatSnapshot)&&report.chatSnapshot.length){const ch=document.createElement('div');ch.className='admin-report-chat';ch.textContent=report.chatSnapshot.map(m=>(m.senderName||m.role||'Spieler')+': '+(m.text||'')).join('\n');card.appendChild(ch);}
    if(report.status==='open'){const a=document.createElement('div');a.className='admin-report-actions';[['Verwerfen','dismiss'],['Verwarnen','warn'],['Chat sperren','chat_block'],['24h+ sperren','suspend'],['Dauerhaft sperren','ban']].forEach(([label,act])=>{const b=document.createElement('button');b.type='button';b.className='button-flat';b.textContent=label;b.addEventListener('click',async()=>{try{if(act==='dismiss')await resolveModerationReport(report,'dismissed');else await moderationAdminAction(report,report.reportedUserId,act);}catch(err){setAdminOverviewStatus(err&&err.message?err.message:'Moderationsmaßnahme fehlgeschlagen.','error');}});a.appendChild(b);});card.appendChild(a);} adminModerationList.appendChild(card);
  });
}
async function refreshAdminModeration(){ if(!onlineAuthToken||!onlineAuthUser||onlineAuthUser.isAdmin!==true)return; try{const data=await authApi('/api/admin/moderation/reports');renderAdminModeration(data.reports);}catch(err){if(adminModerationList)adminModerationList.innerHTML='<div class="admin-list-empty">Moderationsdaten konnten nicht geladen werden.</div>';}}

function renderAdminOverview(data){
  const overview = data && data.overview ? data.overview : data || {};
  const accounts = overview.accounts || {};
  const games = overview.games || {};
  const security = overview.security || {};
  const mail = overview.mail || {};
  const database = overview.database || {};
  const archive = database.archive || {};
  const backup = overview.backup || {};
  if(adminOverviewGenerated) adminOverviewGenerated.textContent = 'Stand: ' + formatAdminDateTime(overview.generatedAt);
  replaceChildrenWithCards(adminOverviewSummary, [
    {label:'Accounts', value:adminNumber(accounts.total)},
    {label:'Mail bestätigt', value:adminNumber(accounts.verified)},
    {label:'Neue Accounts · 7 Tage', value:adminNumber(accounts.new7d)},
    {label:'Aktive Sitzungen', value:adminNumber(accounts.activeSessions)},
    {label:'Laufende Daily-Partien', value:adminNumber(games.dailyRunning)},
    {label:'Offene Daily-Einladungen', value:adminNumber(games.dailyInvitations)},
    {label:'Loginfehler · 24 Std.', value:adminNumber(security.failedLogins24h), alert:Number(security.failedLogins24h || 0) > 0},
    {label:'Mailfehler · 7 Tage', value:adminNumber(mail.failed7d), alert:Number(mail.failed7d || 0) > 0}
  ]);
  replaceInlineStats(adminSecurityStats, [
    {label:'Aktive Account-Sperren', value:adminNumber(security.activeSubjectBlocks)},
    {label:'Aktive IP-Sperren', value:adminNumber(security.activeIpBlocks)},
    {label:'Rate-Limits · 24 Std.', value:adminNumber(security.throttled24h)},
    {label:'Reset-Anfragen · 24 Std.', value:adminNumber(security.resetRequests24h)},
    {label:'Bestätigungs-Anfragen · 24 Std.', value:adminNumber(security.verificationRequests24h)},
    {label:'Loginfehler · 7 Tage', value:adminNumber(security.failedLogins7d)},
    {label:'Registrierungen · 7 Tage', value:adminNumber(security.registrations7d)},
    {label:'Unbestätigte Accounts', value:adminNumber(accounts.unverified)}
  ]);
  renderAdminSecurityEvents(security.recentEvents);
  replaceInlineStats(adminMailStats, [
    {label:'Alle Systemmails · 7 Tage', value:adminNumber(mail.sent7d)},
    {label:'Fehler · 24 Std.', value:adminNumber(mail.failed24h)},
    {label:'Daily-Mails gesendet · 7 Tage', value:adminNumber(mail.dailySent7d)},
    {label:'Daily-Mailfehler · 7 Tage', value:adminNumber(mail.dailyFailed7d)},
    {label:'Daily-Mails ausstehend', value:adminNumber(mail.dailyPending)}
  ]);
  renderAdminMailFailures(mail.recentFailures);
  replaceInlineStats(adminDatabaseStats, [
    {label:'D1-Tabellen', value:adminNumber(database.tableCount)},
    {label:'Wichtige Tabellenzeilen', value:adminNumber(database.importantRowsTotal)},
    {label:'Gespielte Online-Partien', value:adminNumber(games.gamesPlayed)},
    {label:'Gamer-Aufrufe', value:adminNumber(games.pageViews)},
    {label:'Beendete Daily-Partien', value:adminNumber(games.dailyEnded)},
    {label:'Öffentlich laufend', value:adminNumber(games.publicRunning)},
    {label:'Archivpartien', value:adminNumber(archive.games)},
    {label:'Öffentlich im Archiv', value:adminNumber(archive.publicVisible)},
    {label:'Geschützt / Favoriten', value:adminNumber(Number(archive.protectedGames||0)+Number(archive.favoriteGames||0))},
    {label:'Archivdaten · '+String(archive.status||'green').toUpperCase(), value:formatAvatarFileSize(archive.bytes||0)+' · '+String(archive.percent||0).replace('.',',')+' %', alert:['orange','red'].includes(archive.status)}
  ]);
  if(adminDatabaseRows){
    adminDatabaseRows.innerHTML = '';
    const entries = Object.entries(database.importantRows || {});
    if(!entries.length){
      const empty = document.createElement('div'); empty.className = 'admin-list-empty'; empty.textContent = 'Keine Tabellenzahlen verfügbar.'; adminDatabaseRows.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      entries.forEach(([key, value]) => {
        const item = document.createElement('div'); item.className = 'admin-database-item';
        const label = document.createElement('span'); label.textContent = ADMIN_TABLE_LABELS[key] || key;
        const count = document.createElement('strong'); count.textContent = adminNumber(value);
        item.appendChild(label); item.appendChild(count); frag.appendChild(item);
      });
      adminDatabaseRows.appendChild(frag);
    }
  }
  if(adminBackupText){
    adminBackupText.textContent = backup.lastManualAt
      ? 'Letzter manuell vermerkter SQL-Export: ' + formatAdminDateTime(backup.lastManualAt)
      : 'Noch kein manueller SQL-Export im System vermerkt.';
  }
}
async function refreshAdminOverview(){
  if(adminOverviewLoading || !onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  adminOverviewLoading = true;
  if(adminOverviewRefreshBtn) adminOverviewRefreshBtn.disabled = true;
  if(adminBackupMarkBtn) adminBackupMarkBtn.disabled = true;
  setAdminOverviewStatus('Systemdaten werden geladen…', '');
  try{
    const data = await authApi('/api/admin/overview');
    renderAdminOverview(data);
    await refreshAdminModeration();
    setAdminOverviewStatus('Systemübersicht wurde aktualisiert.', 'success');
  } catch(err){
    setAdminOverviewStatus(err && err.message ? err.message : 'Die Systemübersicht konnte nicht geladen werden.', 'error');
  } finally {
    adminOverviewLoading = false;
    if(adminOverviewRefreshBtn) adminOverviewRefreshBtn.disabled = false;
    if(adminBackupMarkBtn) adminBackupMarkBtn.disabled = false;
  }
}
function openAdminOverview(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true){
    if(authError) authError.textContent = 'Diese Übersicht ist ausschließlich für den Administrator verfügbar.';
    return;
  }
  if(authBackdrop) authBackdrop.hidden = true;
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = false;
  refreshAdminOverview();
}
function closeAdminOverview(reopenAccount){
  if(adminOverviewBackdrop) adminOverviewBackdrop.hidden = true;
  setAdminOverviewStatus('', '');
  if(reopenAccount && onlineAuthToken && onlineAuthUser) openAuthDialog('login');
}
function openFairplayFromAdminOverview(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true){
    setAdminOverviewStatus('Die Fairplay-Prüfung ist ausschließlich für den Administrator verfügbar.', 'error');
    return;
  }
  if(!embeddedToolsAvailable()){
    setAdminOverviewStatus('Bitte zuerst den geöffneten Spielraum verlassen und zur Lobby zurückkehren.', 'error');
    return;
  }
  closeAdminOverview(false);
  openFairplayToolDebounced();
}
async function markAdminBackupNow(){
  if(!onlineAuthToken || !onlineAuthUser || onlineAuthUser.isAdmin !== true) return;
  if(!window.confirm('Hast du den manuellen SQL-Export der D1-Datenbank tatsächlich erstellt und sicher gespeichert?')) return;
  if(adminBackupMarkBtn) adminBackupMarkBtn.disabled = true;
  setAdminOverviewStatus('Backup-Zeitpunkt wird gespeichert…', '');
  try{
    const data = await authApi('/api/admin/backup-mark', {method:'POST', body:JSON.stringify({})});
    if(adminBackupText) adminBackupText.textContent = 'Letzter manuell vermerkter SQL-Export: ' + formatAdminDateTime(data.lastManualAt);
    setAdminOverviewStatus(data.message || 'Backup wurde vermerkt.', 'success');
    setTimeout(refreshAdminOverview, 250);
  } catch(err){
    setAdminOverviewStatus(err && err.message ? err.message : 'Backup-Zeitpunkt konnte nicht gespeichert werden.', 'error');
  } finally {
    if(adminBackupMarkBtn) adminBackupMarkBtn.disabled = false;
  }
}
if(adminOverviewOpenBtn) adminOverviewOpenBtn.addEventListener('click', openAdminOverview);
if(adminOverviewRefreshBtn) adminOverviewRefreshBtn.addEventListener('click', refreshAdminOverview);
if(adminBackupMarkBtn) adminBackupMarkBtn.addEventListener('click', markAdminBackupNow);
if(adminFairplayOpenBtn) adminFairplayOpenBtn.addEventListener('click', openFairplayFromAdminOverview);
if(adminOverviewCloseBtn) adminOverviewCloseBtn.addEventListener('click', () => closeAdminOverview(true));
if(adminOverviewBackdrop) adminOverviewBackdrop.addEventListener('click', ev => { if(ev.target === adminOverviewBackdrop) closeAdminOverview(true); });
