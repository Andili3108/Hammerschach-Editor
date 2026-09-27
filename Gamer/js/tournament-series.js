'use strict';
function tournamentField(id){return document.getElementById(id);}
function updateTournamentRecurrenceUi(){
  const repeat=Number(tournamentField('tournamentRepeatSelect')?.value || 0);
  const arena=normalizeTournamentMode(tournamentModeSelect?.value)==='arena' && TOURNAMENT_TYPE_CONFIG[normalizeTournamentType(tournamentEditingType)].live;
  for(const [id,show] of [['tournamentVisibleField',!repeat],['tournamentRegistrationField',!repeat&&!arena],['tournamentSeriesVisibleField',!!repeat],['tournamentSeriesRegistrationField',!!repeat&&!arena],['tournamentArenaEntryHint',arena]]){
    const field=tournamentField(id);if(field)field.hidden=!show;
  }
  if(tournamentScheduleInput)tournamentScheduleInput.required=!!repeat || TOURNAMENT_TYPE_CONFIG[normalizeTournamentType(tournamentEditingType)].live;
}
function fillTournamentTimingFields(item,published){
  const config=!published && item?.recurrence;
  tournamentField('tournamentRepeatSelect').value=String(config?.intervalWeeks || 0);
  tournamentField('tournamentVisibleInput').value=tournamentScheduleInputValue(item?.visibleAt);
  tournamentField('tournamentRegistrationInput').value=tournamentScheduleInputValue(item?.registrationOpensAt);
  tournamentField('tournamentSeriesVisibleInput').value=String(config?.visibilityHours ?? 72);
  tournamentField('tournamentSeriesRegistrationInput').value=String(config?.registrationHours ?? 24);
  updateTournamentRecurrenceUi();
}
function readTournamentTimingFields(arena,scheduledStartAt){
  const intervalWeeks=Number(tournamentField('tournamentRepeatSelect').value);
  if(intervalWeeks){
    if(!scheduledStartAt)throw new Error('Eine Turnierserie benötigt einen Starttermin.');
    const visibilityHours=Number(tournamentField('tournamentSeriesVisibleInput').value);
    const registrationHours=arena?0:Number(tournamentField('tournamentSeriesRegistrationInput').value);
    if(!Number.isInteger(visibilityHours)||visibilityHours<0||visibilityHours>=intervalWeeks*168)throw new Error('Der Anzeigevorlauf muss kürzer als das Wiederholungsintervall sein.');
    if(!Number.isInteger(registrationHours)||registrationHours<0||registrationHours>visibilityHours)throw new Error('Die Anmeldung darf nicht vor der Sichtbarkeit öffnen.');
    return {recurrence:{enabled:true,intervalWeeks,visibilityHours,registrationHours,timeZone:'Europe/Berlin'}};
  }
  const date=id=>{const raw=tournamentField(id).value;if(!raw)return null;const d=new Date(raw);if(Number.isNaN(d.getTime()))throw new Error('Bitte einen gültigen Zeitpunkt wählen.');return d.toISOString();};
  const visibleAt=date('tournamentVisibleInput');
  const registrationOpensAt=arena?null:date('tournamentRegistrationInput');
  if(scheduledStartAt && ((visibleAt && visibleAt>scheduledStartAt)||(registrationOpensAt && registrationOpensAt>scheduledStartAt)))throw new Error('Sichtbarkeit und Anmeldung dürfen nicht nach dem Start liegen.');
  if(visibleAt && registrationOpensAt && registrationOpensAt<visibleAt)throw new Error('Die Anmeldung darf nicht vor der Sichtbarkeit öffnen.');
  return {recurrence:null,visibleAt,registrationOpensAt};
}
function tournamentFromSeries(series){
  const t=series.template;
  return normalizeLocalTournament({id:'',status:'draft',name:t.name,description:t.description,players:t.max_players,hours:t.hours_per_move,rated:!!t.rated,variant:t.variant,theme:t.theme_json?JSON.parse(t.theme_json):null,tournamentType:t.tournament_type,timeKey:t.time_key,mode:t.mode,arenaDurationMinutes:t.arena_duration_minutes,scheduledStartAt:series.nextStartAt,recurrence:series.config},0);
}
function renderTournamentSeriesActions(item){
  const admin=hasTournamentAdminAccess();
  tournamentField('tournamentSeriesEditBtn').hidden=!(admin&&item.series);
  const pause=tournamentField('tournamentSeriesPauseBtn');
  pause.hidden=!(admin&&item.series);
  pause.textContent=item.series?.paused?'Serie fortsetzen':'Serie pausieren';
  tournamentField('tournamentCancelBtn').hidden=!(admin&&['draft','open','full'].includes(item.status));
}
tournamentField('tournamentRepeatSelect')?.addEventListener('change',updateTournamentRecurrenceUi);
tournamentField('tournamentSeriesEditBtn')?.addEventListener('click',()=>{const item=selectedTournament();if(item?.series)openTournamentCreateDialog(item.id,true);});
tournamentField('tournamentSeriesPauseBtn')?.addEventListener('click',async()=>{
  const item=selectedTournament();if(!item?.series||!hasTournamentAdminAccess())return;
  const action=item.series.paused?'resume':'pause';
  if(!window.confirm(action==='pause'?'Serie pausieren? Es entstehen keine weiteren Termine. Bereits angelegte Termine bleiben bestehen und können einzeln abgesagt werden.':'Serie fortsetzen? Vergangene Termine werden nicht nachgeholt.'))return;
  const button=tournamentField('tournamentSeriesPauseBtn');button.disabled=true;
  try{const data=await authApi('/api/tournament-series/'+encodeURIComponent(item.series.id)+'/'+action,{method:'POST',body:'{}'});await refreshSelectedTournament(data.message);}catch(error){if(statusEl)statusEl.textContent=error.message;}finally{button.disabled=false;}
});
tournamentField('tournamentCancelBtn')?.addEventListener('click',async()=>{
  const item=selectedTournament();if(!item||!hasTournamentAdminAccess())return;
  if(!window.confirm('Nur den Termin „'+item.name+'“ am '+formatTournamentLocalDateTime(item.scheduledStartAt)+' absagen? Eine zugehörige Serie bleibt bestehen.'))return;
  const button=tournamentField('tournamentCancelBtn');button.disabled=true;
  try{const data=await authApi('/api/tournaments/'+encodeURIComponent(item.id)+'/cancel',{method:'POST',body:'{}'});await refreshSelectedTournament(data.message);}catch(error){if(statusEl)statusEl.textContent=error.message;}finally{button.disabled=false;}
});
