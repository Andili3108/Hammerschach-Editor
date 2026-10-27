import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {dailyLowTimeSnapshot, processDailyLowTimeReminders, sendDailyLowTimeReminder, prepareDailyLowTimeEmail, DAILY_LOW_TIME_MS} from '../src/daily-low-time.js';

const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
function database(){
  const db=new DatabaseSync(':memory:');
  const env={DB:{prepare(sql){
    let args=[];
    const statement={bind(...values){args=values;return statement;},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async first(){return db.prepare(sql).get(...args)||null;}};
    return statement;
  }}};
  const ctx=vm.createContext({Date,console});
  vm.runInContext(source.slice(source.indexOf('const DEFAULT_EMAIL_NOTIFICATIONS'),source.indexOf('let userOnboardingTableReady')),ctx);
  vm.runInContext(source.slice(source.indexOf('async function ensureEmailNotificationLogTable'),source.indexOf('async function claimEmailNotification')),ctx);
  vm.runInContext(source.slice(source.indexOf('async function completeEmailNotification'),source.indexOf('function formatNotificationDateTime')),ctx);
  return {db,env,ctx};
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const formatDate=s=>s;
function state(now,remaining=DAILY_LOW_TIME_MS,variant='classic',turn='w'){
 return new Map(Object.entries({game:{started:true,ended:false,gameSetup:{variant}},timeControl:{mode:'daily',daysPerMove:1},clock:{running:true,turn,lastTs:now-1000,wMs:remaining+1000,bMs:remaining+1000},moves:[{},{}]}));
}

test('8-Stunden-Grenze gilt für Classic und Freestyle, beide Farben; abgelaufene und nicht laufende Partien ausgeschlossen',()=>{
 const now=Date.now();
 for(const variant of ['classic','freestyle960'])for(const turn of ['w','b']){
  assert.equal(dailyLowTimeSnapshot(state(now,DAILY_LOW_TIME_MS+1,variant,turn),now),null);
  assert.equal(dailyLowTimeSnapshot(state(now,DAILY_LOW_TIME_MS,variant,turn),now).turn,turn);
  assert.ok(dailyLowTimeSnapshot(state(now,1,variant,turn),now));
  assert.equal(dailyLowTimeSnapshot(state(now,0,variant,turn),now),null);
 }
 for(const [key,value] of [['timeControl',{mode:'live'}],['game',{started:false}],['game',{started:true,ended:true}],['cancelled',{cancelled:true}],['clock',{running:false}]]){
  const s=state(now);s.set(key,value);assert.equal(dailyLowTimeSnapshot(s,now),null);
 }
});

test('Migration aktiviert bestehende Accounts; Abwahl und alte Clients bleiben erhalten; neue Accounts haben gewünschte Defaults',async()=>{
 const {db,env,ctx}=database();
 db.exec(`CREATE TABLE user_email_preferences (user_id TEXT PRIMARY KEY,daily_turn_enabled INTEGER DEFAULT 1,daily_result_enabled INTEGER DEFAULT 1,member_news_enabled INTEGER DEFAULT 0,tournament_enabled INTEGER DEFAULT 1,updated_at TEXT);
 INSERT INTO user_email_preferences VALUES ('old',0,0,0,0,'2026-01-01');`);
 await ctx.ensureUserEmailPreferencesTable(env);
 const old=await ctx.getUserEmailPreferences(env,'old');
 assert.equal(old.dailyLowTimeEnabled,true);assert.equal(old.dailyTurnEnabled,false);assert.equal(old.tournamentEnabled,false);
 await ctx.setUserEmailPreferences(env,'old',{dailyLowTimeEnabled:false});
 vm.runInContext('userEmailPreferencesTableReady = false',ctx);
 await ctx.ensureUserEmailPreferencesTable(env);
 await ctx.setUserEmailPreferences(env,'old',{dailyTurnEnabled:true,dailyLowTimeEnabled:undefined});
 assert.equal((await ctx.getUserEmailPreferences(env,'old')).dailyLowTimeEnabled,false);
 const fresh=await ctx.getUserEmailPreferences(env,'new');
 for(const key of ['dailyLowTimeEnabled','dailyTurnEnabled','dailyResultEnabled','tournamentEnabled'])assert.equal(fresh[key],true);
 assert.equal(fresh.memberNewsEnabled,false);
 await ctx.setUserEmailPreferences(env,'new',{});
 assert.equal(db.prepare('SELECT daily_low_time_enabled FROM user_email_preferences WHERE user_id=?').get('new').daily_low_time_enabled,1);
});

async function sendingFixture(){
 const f=database();await f.ctx.ensureEmailNotificationLogTable(f.env);
 let count=0,available=true,enabled=true,current=true;
 const payload={roomId:'room_123',recipientUserId:'user1',ply:10,deadlineAt:new Date(Date.now()+DAILY_LOW_TIME_MS).toISOString(),opponentName:'Opponent <img>',inviteUrl:'https://example.org/?room=room_123'};
 const deps={escape,formatDate,ensureLog:env=>f.ctx.ensureEmailNotificationLogTable(env),complete:(...args)=>f.ctx.completeEmailNotification(...args),
  loadRecipient:async()=>enabled?{ok:true,email:'test@example.org',user:{username:'Member'}}:{ok:false,reason:'disabled'},
  isCurrent:async()=>current,
  send:async()=>{count++;return available?{ok:true,messageId:'test'}:{ok:false,code:'UNAVAILABLE'};}};
 return {...f,payload,deps,count:()=>count,setAvailable:v=>available=v,setEnabled:v=>enabled=v,setCurrent:v=>current=v};
}
test('Parallele Auslösung sendet einmal; nächster eigener Zug darf erneut erinnern',async()=>{
 const f=await sendingFixture();
 await Promise.all(Array.from({length:8},()=>sendDailyLowTimeReminder(f.env,f.payload,f.deps)));
 assert.equal(f.count(),1);
 await sendDailyLowTimeReminder(f.env,{...f.payload,ply:12},f.deps);assert.equal(f.count(),2);
});
test('Abwahl, unbestätigte Adresse und inzwischen erfolgter Zug verhindern Versand',async()=>{
 const f=await sendingFixture();f.setEnabled(false);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),0);
 await sendDailyLowTimeReminder(f.env,f.payload,{...f.deps,loadRecipient:async()=>({ok:false,reason:'email_not_verified'})});assert.equal(f.count(),0);
 f.setEnabled(true);f.setCurrent(false);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),0);
 let reads=0;
 await sendDailyLowTimeReminder(f.env,f.payload,{...f.deps,isCurrent:async()=>++reads===1});assert.equal(f.count(),0);
});
test('Versandfehler wartet vor Wiederholung; gesendete Mail bleibt gesperrt',async()=>{
 const f=await sendingFixture();f.setAvailable(false);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),1);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),1);
 f.db.prepare('UPDATE email_notification_log SET updated_at=?').run(new Date(Date.now()-301000).toISOString());f.setAvailable(true);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),2);
 await sendDailyLowTimeReminder(f.env,f.payload,f.deps);assert.equal(f.count(),2);
});
test('Mail enthält Frist, Partielink, Abwahlhinweis und maskierte Namen',()=>{
 const mail=prepareDailyLowTimeEmail({recipientEmail:'test@example.org',recipientName:'<script>',opponentName:'<img>',deadlineAt:'DATE',inviteUrl:'https://example.org/?room=abc'}, {escape,formatDate});
 assert.ok(mail.textPart.includes('DATE'));assert.ok(mail.textPart.includes('https://example.org/?room=abc'));assert.ok(mail.textPart.includes('Accountverwaltung'));
 assert.ok(!mail.htmlPart.includes('<img>'));assert.ok(!mail.htmlPart.includes('<script>'));assert.equal(mail.mailType,'daily_low_time');
});

test('Cron wählt fälligen Spieler, respektiert Abwahl und Verifizierung, überspringt fertige Warnungen und verarbeitet weitere Pakete',async()=>{
 const {db,env,ctx}=database();await ctx.ensureUserEmailPreferencesTable(env);await ctx.ensureEmailNotificationLogTable(env);
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT);CREATE TABLE user_email_status(user_id TEXT,email TEXT,verified INTEGER);
 CREATE TABLE daily_games(room_id TEXT PRIMARY KEY,white_user_id TEXT,black_user_id TEXT,turn TEXT,started INTEGER,ended INTEGER,deadline_at TEXT);`);
 const now=Date.now(),iso=ms=>new Date(ms).toISOString();
 db.exec("INSERT INTO users VALUES ('white','white@example.org'),('black','black@example.org');");
 const add=(id,deadline,ended=0,started=1,turn='w')=>db.prepare('INSERT INTO daily_games VALUES (?,?,?,?,?,?,?)').run(id,'white','black',turn,started,ended,iso(deadline));
 add('due',now+DAILY_LOW_TIME_MS);add('too_early',now+DAILY_LOW_TIME_MS+1);add('expired',now);add('ended',now+1000,1);add('not_started',now+1000,0,0);add('black_due',now+1000,0,1,'b');
 const seen=[];const stub=id=>({fetch:async()=>{seen.push(id);return new Response('{}');}});
 await ctx.setUserEmailPreferences(env,'white',{dailyLowTimeEnabled:false});
 await processDailyLowTimeReminders(env,stub,now);assert.deepEqual(seen,['black_due']);seen.length=0;
 db.exec("INSERT INTO user_email_status VALUES ('black','black@example.org',0)");
 await processDailyLowTimeReminders(env,stub,now);assert.deepEqual(seen,[]);
 await ctx.setUserEmailPreferences(env,'white',{dailyLowTimeEnabled:true});
 await processDailyLowTimeReminders(env,stub,now);assert.deepEqual(seen,['due']);seen.length=0;
 const sent=(id)=>db.prepare("INSERT INTO email_notification_log(notification_key,notification_type,user_id,room_id,status,created_at,updated_at) VALUES (?,'daily_low_time','white',?,'sent',?,?)").run(id,id,iso(now),iso(now));
 sent('due');await processDailyLowTimeReminders(env,stub,now);assert.deepEqual(seen,[]);
 for(let i=0;i<65;i++)add('bulk_'+String(i).padStart(3,'0'),now+2000);
 await processDailyLowTimeReminders(env,stub,now);assert.equal(seen.length,50);seen.forEach(sent);seen.length=0;
 await processDailyLowTimeReminders(env,stub,now);assert.equal(seen.length,15);
 // Eine frühere Warnung darf eine neue Zugfrist nicht blockieren.
 db.prepare('UPDATE email_notification_log SET created_at=?,updated_at=? WHERE room_id=?').run(iso(now-86400000),iso(now-86400000),'due');seen.length=0;
 await processDailyLowTimeReminders(env,stub,now);assert.ok(seen.includes('due'));
});

test('Spielraum verwendet den Spieler am Zug und repariert veralteten Index ohne Mail',async()=>{
 const now=Date.now();let stored=state(now,DAILY_LOW_TIME_MS-1000,'freestyle960','b');let sent=null,repairs=0;
 const ctx=vm.createContext({Date,dailyLowTimeSnapshot,sendDailyLowTimeReminder:async(env,payload,deps)=>{sent=payload;assert.equal(await deps.isCurrent(),true);return {ok:true};},
 gamerInvitationUrl:(env,id)=>'https://example.org/?room='+id,loadEmailNotificationRecipient(){},ensureEmailNotificationLogTable(){},completeEmailNotification(){},sendPreparedTransactionalEmail(){},escapeEmailHtml:escape,formatNotificationDateTime:formatDate});
 const methods=source.slice(source.indexOf('  async dailyLowTimeState()'),source.indexOf('  async sendDailyTurnNotification('));
 const Room=vm.runInContext('class TestRoom {'+methods+'};TestRoom',ctx);const room=new Room();room.env={};
 room.state={storage:{get:async()=>stored}};
 room.dailyEmailRoomContext=async()=>({roomId:'room_123',whiteUserId:'white',blackUserId:'black',whiteName:'White',blackName:'Black'});
 room.syncDailyGameIndex=async()=>{repairs++;};
 await room.sendDailyLowTimeNotification();assert.equal(sent.recipientUserId,'black');assert.equal(sent.opponentName,'White');
 sent=null;stored.set('game',{started:true,ended:true});await room.sendDailyLowTimeNotification();assert.equal(sent,null);assert.equal(repairs,1);
});

test('Accountoberfläche lädt und speichert das neue Häkchen unabhängig von anderen Optionen',async()=>{
 const client=readFileSync(new URL('../../Gamer/js/auth-account.js',import.meta.url),'utf8');let saved=null;
 const input=()=>({checked:false,disabled:false});
 const ctx=vm.createContext({onlineAuthToken:'token',onlineAuthUser:{emailNotifications:{dailyLowTimeEnabled:true,memberNewsEnabled:false}},authEmailNotifications:{},dailyLowTimeEmailCheckbox:input(),dailyTurnEmailCheckbox:input(),dailyResultEmailCheckbox:input(),memberNewsEmailCheckbox:input(),tournamentEmailCheckbox:input(),emailNotificationsSaveBtn:{},emailNotificationsStatus:{classList:{toggle(){}}},
 authApi:async(url,options)=>{saved=JSON.parse(options.body);return {user:{emailNotifications:saved}};},saveAuthState(){}});
 vm.runInContext(client.slice(client.indexOf('function normalizeClientEmailNotifications'),client.indexOf('function hasOnlineTargetInAddress')),ctx);
 ctx.renderEmailNotificationSettings();assert.equal(ctx.dailyLowTimeEmailCheckbox.checked,true);assert.equal(ctx.memberNewsEmailCheckbox.checked,false);
 ctx.dailyLowTimeEmailCheckbox.checked=false;await ctx.saveEmailNotificationSettings();assert.equal(saved.dailyLowTimeEnabled,false);assert.equal(saved.dailyTurnEnabled,true);
});
