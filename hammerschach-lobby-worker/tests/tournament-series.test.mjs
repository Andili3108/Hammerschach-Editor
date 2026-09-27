import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import * as series from '../src/tournament-series.js';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const context=vm.createContext({console,crypto:webcrypto,Date,Intl,URL,Request,Response,Headers,TextEncoder,TextDecoder,setTimeout,clearTimeout,...series});
 const stripped=source.replace(/^import .*;\n/gm,'').replace(/^export class /gm,'class ').replace('export default {','const worker = {');
 vm.runInContext(stripped,context);
 return {db,env,context};
}
async function init(t){const f=fixture(t);await f.context.ensureTournamentTables(f.env);return f;}
function insert(f,extra={}){
 const row={id:'arena1',name:'Sonntags-Arena',description:'Test',max_players:0,hours_per_move:24,rated:1,variant:'standard',tournament_type:'blitz',time_key:'3+2',time_label:'3+2',scheduled_start_at:'2026-10-18T17:00:00.000Z',arena_duration_minutes:90,round_pause_seconds:60,mode:'arena',status:'open',created_by_user_id:'admin',created_at:'2026-09-27T10:00:00.000Z',updated_at:'2026-09-27T10:00:00.000Z',...extra};
 const keys=Object.keys(row);f.db.prepare(`INSERT INTO tournaments (${keys}) VALUES (${keys.map(()=>'?')})`).run(...Object.values(row));return row;
}
test('Wöchentliche Berliner Uhrzeit bleibt bei beiden Zeitumstellungen 19 Uhr',()=>{
 const c=series.seriesConfig({intervalWeeks:1,visibilityHours:72,registrationHours:24});
 assert.equal(series.nextSeriesStart('2026-10-18T17:00:00.000Z',c),'2026-10-25T18:00:00.000Z');
 assert.equal(series.nextSeriesStart('2026-03-22T18:00:00.000Z',c),'2026-03-29T17:00:00.000Z');
});
test('Ungültige Freigaben werden abgewiesen; Arena hat kein Anmeldefenster',()=>{
 assert.throws(()=>series.seriesConfig({visibilityHours:168}));
 assert.throws(()=>series.seriesConfig({visibilityHours:12,registrationHours:24}));
 assert.throws(()=>series.tournamentTiming({visibleAt:'bad'},'2026-10-01',true));
 const timing=series.tournamentTiming({recurrence:{visibilityHours:72,registrationHours:24}},'2026-10-18T17:00:00Z',true);
 assert.equal(timing.registrationOpensAt,null);
 assert.equal(timing.visibleAt,'2026-10-15T17:00:00.000Z');
});
test('Sichtbarkeit und Anmeldung werden unabhängig serverseitig geprüft',()=>{
 const row={status:'open',visible_at:'2026-10-01T10:00:00Z',registration_opens_at:'2026-10-02T10:00:00Z'};
 assert.equal(series.tournamentVisible(row,Date.parse('2026-10-01T09:59:59Z')),false);
 assert.equal(series.tournamentVisible(row,Date.parse(row.visible_at)),true);
 assert.equal(series.tournamentRegistrationOpen(row,Date.parse(row.visible_at)),false);
 assert.equal(series.tournamentRegistrationOpen(row,Date.parse(row.registration_opens_at)),true);
});
test('Migration ist wiederholbar und Serien erzeugen genau einen unabhängigen Termin',async t=>{
 const f=await init(t);await series.ensureSeriesSchema(f.env);
 const config=series.seriesConfig({visibilityHours:72,registrationHours:0});
 const row=insert(f,{recurrence_json:JSON.stringify(config)});
 await series.activateTournamentSeries(f.env,row);await series.activateTournamentSeries(f.env,row);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournament_series').get().n,1);
 await series.materializeTournamentSeries(f.env,Date.parse('2026-10-22T17:59:59Z'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournaments').get().n,1);
 const now=Date.parse('2026-10-22T18:00:00Z');
 await series.materializeTournamentSeries(f.env,now);await series.materializeTournamentSeries(f.env,now);
 const generated=f.db.prepare("SELECT * FROM tournaments WHERE id <> 'arena1'").all();
 assert.equal(generated.length,1);assert.equal(generated[0].scheduled_start_at,'2026-10-25T18:00:00.000Z');
 assert.equal(generated[0].registration_opens_at,null);assert.equal(generated[0].status,'open');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournament_participants').get().n,0);
});
test('Pausierte Serie erzeugt nichts; Wiederaufnahme überspringt abgelaufene Arenen',async t=>{
 const f=await init(t);const row=insert(f,{recurrence_json:JSON.stringify(series.seriesConfig({visibilityHours:72,registrationHours:0}))});await series.activateTournamentSeries(f.env,row);
 f.db.exec('UPDATE tournament_series SET paused=1');await series.materializeTournamentSeries(f.env,Date.parse('2026-11-05T18:00:00Z'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournaments').get().n,1);
 f.db.exec('UPDATE tournament_series SET paused=0');await series.materializeTournamentSeries(f.env,Date.parse('2026-11-05T18:00:00Z'));
 assert.equal(f.db.prepare("SELECT scheduled_start_at FROM tournaments WHERE id <> 'arena1'").get().scheduled_start_at,'2026-11-08T18:00:00.000Z');
});
test('Null Stunden Vorlauf erzeugt den Termin beim Start, auch bei verspätetem Cron',async t=>{
 const f=await init(t);const row=insert(f,{recurrence_json:JSON.stringify(series.seriesConfig({visibilityHours:0,registrationHours:0}))});await series.activateTournamentSeries(f.env,row);
 await series.materializeTournamentSeries(f.env,Date.parse('2026-10-25T18:00:30Z'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournaments').get().n,2);
});
test('Arena startet ohne Teilnehmer; alte Vormerkungen/Check-ins werden nicht automatisch gepaart',async t=>{
 const f=await init(t);insert(f,{scheduled_start_at:new Date(Date.now()-1000).toISOString()});
 f.db.prepare("INSERT INTO tournament_participants (tournament_id,user_id,status,checked_in_at,arena_active,joined_at,updated_at) VALUES ('arena1','u1','confirmed','2026-09-27',1,'2026-09-27','2026-09-27')").run();
 const result=await f.context.autoStartScheduledTournament(f.env,'arena1');assert.equal(result.started,true);
 assert.equal(f.db.prepare('SELECT arena_active FROM tournament_participants').get().arena_active,0);
 const f2=await init(t);insert(f2,{scheduled_start_at:new Date(Date.now()-1000).toISOString()});
 assert.equal((await f2.context.autoStartScheduledTournament(f2.env,'arena1')).started,true);
});
async function apiFixture(t){
 const f=await init(t);
 f.db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); INSERT INTO users VALUES ('member','Mitglied'),('admin','Admin');");
 Object.assign(f.context,{handleReaderArchivesApi:async()=>null,handleLeagueStandingsApi:async()=>null});
 f.context.lookupAuthSession=async(_env,token)=>token?{user:{id:token,isAdmin:token==='admin'}}:null;
 f.context.requireAdminSession=async request=>request.headers.get('authorization')==='Bearer admin'?{ok:true,session:{user:{id:'admin',isAdmin:true}}}:{ok:false,response:new Response('{}',{status:403})};
 f.context.isAdminUser=user=>user?.isAdmin===true;
 f.context.setUserPresence=async()=>{};
 f.context.pairArenaPlayers=async()=>{};
 f.context.sendTournamentPublishedEmails=async()=>({sent:0,failed:0});
 f.context.scheduleTournamentAlarm=async()=>true;
 f.call=async(path,method='POST',body={},token='member')=>{const url=new URL('https://test.invalid'+path);return f.context.handleAuthApi(new Request(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),f.env,url);};
 return f;
}
test('Arena-API: ohne Vormerkung einsteigen, Pause/Wiedereinstieg und laufende Partie schützen',async t=>{
 const f=await apiFixture(t);insert(f,{status:'running',arena_ends_at:new Date(Date.now()+3600000).toISOString()});
 const route='/api/tournaments/arena1/arena/';
 assert.equal((await f.call(route+'join')).status,200);
 assert.equal(f.db.prepare('SELECT arena_active FROM tournament_participants').get().arena_active,1);
 assert.equal((await f.call(route+'pause')).status,200);
 assert.equal(f.db.prepare('SELECT arena_active FROM tournament_participants').get().arena_active,0);
 assert.equal((await f.call(route+'join')).status,200);
 f.db.exec('UPDATE tournament_participants SET arena_active=2');
 assert.equal((await f.call(route+'pause')).status,409);
 await f.call(route+'resume');await f.call(route+'join');
 assert.equal(f.db.prepare('SELECT arena_active FROM tournament_participants').get().arena_active,2);
 f.db.prepare('UPDATE tournaments SET arena_ends_at=?').run(new Date(Date.now()-1).toISOString());
 assert.equal((await f.call(route+'join')).status,409);
});
test('Arena-API: Vormerkung ist inaktiv, Check-in entfällt, verborgene Termine sind geschützt',async t=>{
 const f=await apiFixture(t);insert(f);
 assert.equal((await f.call('/api/tournaments/arena1/join','POST',{confirmed:true})).status,200);
 const participant=f.db.prepare('SELECT * FROM tournament_participants').get();assert.equal(participant.arena_active,0);assert.equal(participant.checked_in_at,null);
 assert.equal((await f.call('/api/tournaments/arena1/check-in','POST',{confirmed:true})).status,404);
 f.db.prepare('UPDATE tournaments SET visible_at=?').run(new Date(Date.now()+3600000).toISOString());
 assert.equal((await f.call('/api/tournaments/arena1/join','POST',{confirmed:true})).status,409);
 assert.equal((await f.call('/api/tournaments/arena1/viewed','POST',{})).status,404);
});
test('Nicht-Arena: vor Anmeldeöffnung sperren, danach weiterhin regulär anmelden',async t=>{
 const f=await apiFixture(t);insert(f,{mode:'swiss',tournament_type:'daily',max_players:8,scheduled_start_at:new Date(Date.now()+86400000).toISOString(),registration_opens_at:new Date(Date.now()+3600000).toISOString()});
 assert.equal((await f.call('/api/tournaments/arena1/join','POST',{confirmed:true})).status,409);
 f.db.exec('UPDATE tournaments SET registration_opens_at=NULL');
 assert.equal((await f.call('/api/tournaments/arena1/join','POST',{confirmed:true})).status,200);
 assert.equal(f.db.prepare('SELECT status FROM tournament_participants').get().status,'confirmed');
});
test('Serienbearbeitung benötigt Admin, Freigabe erzeugt Serie, Einzelabsage stoppt Serie nicht',async t=>{
 const f=await apiFixture(t);
 const body={name:'Test-Arena',tournamentType:'blitz',mode:'arena',timeKey:'3+2',scheduledStartAt:new Date(Date.now()+86400000*7).toISOString(),recurrence:{enabled:true,intervalWeeks:1,visibilityHours:72,registrationHours:0}};
 assert.equal((await f.call('/api/tournaments','POST',body)).status,403);
 const create=await f.call('/api/tournaments','POST',body,'admin');assert.equal(create.status,200);const id=(await create.json()).tournament.id;
 const publish=await f.call('/api/tournaments/'+id+'/publish','POST',{confirmed:true},'admin');assert.equal(publish.status,200);
 const published=(await publish.json()).tournament;assert(published.series);assert.equal(published.registrationOpen,false);
 assert.equal((await f.call('/api/tournament-series/'+published.series.id+'/pause')).status,403);
 assert.equal((await f.call('/api/tournament-series/'+published.series.id+'/pause','POST',{},'admin')).status,200);
 assert.equal(f.db.prepare('SELECT paused FROM tournament_series').get().paused,1);
 assert.equal((await f.call('/api/tournament-series/'+published.series.id+'/resume','POST',{},'admin')).status,200);
 assert.equal((await f.call('/api/tournaments/'+id+'/cancel','POST',{},'admin')).status,200);
 assert.equal(f.db.prepare('SELECT paused FROM tournament_series').get().paused,0);
 assert.equal(f.db.prepare('SELECT status FROM tournaments').get().status,'cancelled');
});
test('Mitgliederlisten und Veröffentlichungsmails beachten Sichtbarkeit; Mailauftrag wird nur einmal beansprucht',async t=>{
 const f=await apiFixture(t);let mails=0;f.context.sendTournamentPublishedEmails=async()=>{mails++;return {sent:1,failed:0};};
 insert(f,{visible_at:new Date(Date.now()+3600000).toISOString(),scheduled_start_at:new Date(Date.now()+86400000).toISOString()});
 assert.equal((await f.context.listTournaments(f.env,{id:'member'})).length,0);assert.equal(mails,0);
 assert.equal((await f.context.listTournaments(f.env,{id:'admin',isAdmin:true})).length,1);assert.equal(mails,0);
 f.db.prepare('UPDATE tournaments SET visible_at=?').run(new Date(Date.now()-1).toISOString());
 assert.equal((await f.context.listTournaments(f.env,{id:'member'})).length,1);
 await f.context.listTournaments(f.env,{id:'member'});assert.equal(mails,1);
});
test('Serienbearbeitung ändert nur die Vorlage und schützt vor veralteten Speicheranfragen',async t=>{
 const f=await apiFixture(t);const row=insert(f,{recurrence_json:JSON.stringify(series.seriesConfig({visibilityHours:72,registrationHours:0}))});await series.activateTournamentSeries(f.env,row);
 const state=await series.tournamentSeriesDto(f.env,'series_arena1');
 const body={seriesId:state.id,seriesUpdatedAt:state.updatedAt,name:'Neue Arena',tournamentType:'blitz',mode:'arena',scheduledStartAt:new Date(Date.now()+86400000*20).toISOString(),recurrence:state.config};
 assert.equal((await f.call('/api/tournaments','POST',body,'admin')).status,200);
 assert.equal(f.db.prepare('SELECT name FROM tournaments').get().name,'Sonntags-Arena');
 assert.equal(JSON.parse(f.db.prepare('SELECT template_json FROM tournament_series').get().template_json).name,'Neue Arena');
 assert.equal((await f.call('/api/tournaments','POST',{...body,seriesUpdatedAt:'stale'},'admin')).status,409);
});
test('Pause während einer laufenden Erzeugung verhindert den veralteten Schreibvorgang',async t=>{
 const f=await init(t);const row=insert(f,{recurrence_json:JSON.stringify(series.seriesConfig({visibilityHours:72,registrationHours:0}))});await series.activateTournamentSeries(f.env,row);
 const batch=f.env.DB.batch;f.env.DB.batch=async statements=>{f.db.exec('UPDATE tournament_series SET paused=1');return batch(statements);};
 await series.materializeTournamentSeries(f.env,Date.parse('2026-10-22T18:00:00Z'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tournaments').get().n,1);
 assert.equal(f.db.prepare('SELECT next_start_at FROM tournament_series').get().next_start_at,'2026-10-25T18:00:00.000Z');
});
test('Bloße Vormerkungen gewinnen keine Arena; Mailtexte verlangen keinen Arena-Check-in',async t=>{
 const f=await init(t);
 const standings=f.context.tournamentArenaStandings([{userId:'bookmark',status:'confirmed',username:'Vorgemerkt'},{userId:'played',status:'confirmed',username:'Spieler',arenaJoinedAt:'2026-09-27'}],[]);
 assert.equal(standings.length,1);assert.equal(standings[0].userId,'played');
 const row=insert(f);const mail=f.context.prepareTournamentPublishedEmail({GAMER_PUBLIC_URL:'https://example.test'},row,{username:'Test',email:'test@example.test'});
 assert(mail.textPart.includes('Keine Voranmeldung und kein Check-in'));assert(!mail.textPart.includes('Der Check-in öffnet'));
});
test('Aufeinanderfolgende Serientermine erhalten unterschiedliche Scheduler-Räume',async t=>{
 const f=await init(t);const row=insert(f,{id:'12345678-1234-1234-1234-123456789abc',recurrence_json:JSON.stringify(series.seriesConfig({visibilityHours:72,registrationHours:0}))});await series.activateTournamentSeries(f.env,row);
 await series.materializeTournamentSeries(f.env,Date.parse('2026-10-22T18:00:00Z'));
 await series.materializeTournamentSeries(f.env,Date.parse('2026-10-29T18:00:00Z'));
 const rows=f.db.prepare('SELECT id FROM tournaments').all();
 assert.equal(rows.length,3);assert.equal(new Set(rows.map(row=>f.context.tournamentSchedulerRoomId(row.id))).size,3);
});
