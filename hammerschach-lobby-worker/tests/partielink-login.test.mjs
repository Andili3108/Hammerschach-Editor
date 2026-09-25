import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const read = name => readFileSync(new URL('../../Gamer/js/' + name, import.meta.url), 'utf8');
const startup = read('app-startup.js');
const auth = read('auth-account.js');
const session = read('online-session.js');
const connection = read('online-connection.js');
function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Produktionsabschnitt fehlt: ${start}`);
  return source.slice(from, to);
}
// Ausführung der tatsächlichen Funktionen und des Dialogabschnitts im
// WebSocket-Handler. DOM, Netzantworten und Timer werden kontrolliert ersetzt.
const entryDialogs = section(connection,
  "    if(shouldAutoOpenRematch) setTimeout(openReadyRematchRoom, 180);",
  "  });\n  onlineSocket.addEventListener('close'");
const loginFunctions = section(auth, 'function openAuthDialog(mode)', 'function normalizeClientRating')
  + section(auth, 'function applyLoggedInUserToOnlineRoom()', 'async function refreshAuthSession')
  + section(auth, 'async function submitAuthDialog()', 'async function logoutAuth');
const guestFunctions = section(session, 'let playerNameDialogResolve = null;', 'if(editPlayerNameBtn)');

function fixture({query='?room=Partie123', loggedIn=false, confirmed=false, deferredAuth=false}={}) {
  const calls = [], timers = [];
  let finishAuth;
  const element = () => ({hidden:true, value:'', textContent:'', style:{}, focus(){}, select(){}});
  const c = vm.createContext({
    URL, Promise, window:{location:{href:'https://example.invalid/' + query}},
    document:{querySelectorAll:()=>[]}, history:{replaceState(){}}, sessionStorage:{removeItem(){}},
    initialAuthRefreshPromise: deferredAuth ? new Promise(resolve => {finishAuth=resolve;}) : Promise.resolve(),
    onlineAuthUser:loggedIn ? {id:'member1', username:'Karl-Heinz'} : null,
    onlineAuthToken:loggedIn ? 'valid-session' : '', onlineRoomId:null, onlineRoleCode:'local',
    onlineConnected:false, onlineSpectatorOnly:false, onlinePublicWatchId:'',
    onlinePreferredRoleForNextConnect:'', onlineDisplayName:'Gast', onlineLastMessage:'',
    authMode:'login', shouldAutoOpenRematch:false, ONLINE_LAST_ROOM_STORAGE_KEY:'last-room',
    setTimeout:fn=>{timers.push(fn);},
    cleanRoomId:value=>String(value || ''), cleanPublicWatchId:value=>String(value || ''),
    cleanListedRematchOfferId:value=>String(value || ''), cleanDisplayName:value=>String(value || '').trim(),
    defaultGuestName:()=> 'Gast', displayNameForOnline:name=>name,
    hasConfirmedDisplayName:()=>confirmed,
    playerNameBackdrop:element(), playerNameInput:element(), playerNameError:element(),
    authBackdrop:element(), authError:element(), authSubmitBtn:element(), statusEl:element(),
    loginIdentifierInput:{value:'Karl-Heinz',focus(){}}, loginPasswordInput:{value:'test-password',focus(){}},
    saveDisplayName(name){c.onlineDisplayName=name;confirmed=true;},
    saveAuthState(token,user){c.onlineAuthToken=token;c.onlineAuthUser=user;},
    async authApi(path){assert.equal(path,'/api/login');return {sessionToken:'valid-session',user:{id:'member1',username:'Karl-Heinz'}};},
    connectOnlineRoom(room,options){c.onlineRoomId=room;calls.push({type:'connect',room,options:JSON.parse(JSON.stringify(options))});},
    closeOnlineSocket(){calls.push({type:'close-socket'});},
    openDailyGamesDialog(){calls.push({type:'daily-games'});},
    maybeOpenDailyInvitationFromAddress(){calls.push({type:'daily-invite'});},
    maybeOpenRematchInvitationFromAddress(){calls.push({type:'rematch'});},
    openFirstStepsDialog(){calls.push({type:'first-steps'});}
  });
  for(const name of ['updateVariantUi','renderBoard','refreshSiteStats','updateInviteUrlInAddressBar',
    'updateOnlineUi','updatePlayerNameButton','updateAuthUi','clearAuthVerificationNotice']) c[name]=()=>{};
  vm.runInContext(guestFunctions + loginFunctions, c);
  const flush = async () => {await new Promise(setImmediate);while(timers.length)timers.shift()();await new Promise(setImmediate);};
  const start = async () => {vm.runInContext(startup,c);await flush();};
  const hello = async ({role='spectator',seatCode='',seatDenied=false}={}) => {
    c.onlineRoleCode=role;c.onlineConnected=true;
    c.msg={type:'hello',role,seatCode,seatDenied};
    vm.runInContext(entryDialogs,c);await flush();
  };
  return {c,calls,start,hello,flush,finishAuth:()=>finishAuth(),connections:()=>calls.filter(x=>x.type==='connect')};
}

for(const confirmed of [false,true]) test(`Daily-Link ohne Login (Gastname bestätigt: ${confirmed}) führt zum Login und zurück zur Partie`,async()=>{
  const f=fixture({confirmed});await f.start();
  assert.equal(f.connections().length,1);
  assert.equal(f.connections()[0].room,'Partie123');
  assert.equal(f.c.playerNameBackdrop.hidden,true);
  await f.hello({seatCode:'DAILY_ACCOUNT_REQUIRED',seatDenied:true});
  assert.equal(f.c.authBackdrop.hidden,false);
  assert.equal(f.c.playerNameBackdrop.hidden,true);
  await f.c.submitAuthDialog();
  assert.equal(f.c.authBackdrop.hidden,true);
  assert.equal(f.c.onlineAuthUser.username,'Karl-Heinz');
  assert.deepEqual(f.connections().map(x=>x.room),['Partie123','Partie123']);
  assert.equal(f.connections()[1].options.reconnect,true);
});

test('Abgebrochener Login behält den Raum für eine spätere Anmeldung',async()=>{
  const f=fixture();await f.start();await f.hello({seatCode:'DAILY_ACCOUNT_REQUIRED',seatDenied:true});
  f.c.closeAuthDialog();assert.equal(f.c.onlineRoomId,'Partie123');
  f.c.openAuthDialog('login');await f.c.submitAuthDialog();
  assert.equal(f.connections().at(-1).room,'Partie123');assert.equal(f.connections().length,2);
});

test('Fehlgeschlagener Login bleibt wiederholbar, ohne den Partielink zu verlieren',async()=>{
  const f=fixture();await f.start();await f.hello({seatCode:'DAILY_ACCOUNT_REQUIRED',seatDenied:true});
  const login=f.c.authApi;f.c.authApi=async()=>{throw new Error('Kennwort falsch');};
  await f.c.submitAuthDialog();assert.equal(f.c.authError.textContent,'Kennwort falsch');
  assert.equal(f.c.authBackdrop.hidden,false);assert.equal(f.connections().length,1);
  f.c.authApi=login;await f.c.submitAuthDialog();assert.equal(f.connections().at(-1).room,'Partie123');
  assert.equal(f.connections().length,2);
});

test('Erkannter Account öffnet seine Partie ohne Gastdialog oder Login',async()=>{
  const f=fixture({loggedIn:true});await f.start();await f.hello({role:'w'});
  assert.equal(f.connections().length,1);assert.equal(f.c.authBackdrop.hidden,true);
  assert.equal(f.c.playerNameBackdrop.hidden,true);
});

test('Raumverbindung wartet weiterhin auf die Prüfung der gespeicherten Anmeldung',async()=>{
  const f=fixture({deferredAuth:true});await f.start();assert.equal(f.connections().length,0);
  f.c.onlineAuthUser={id:'member1',username:'Karl-Heinz'};f.finishAuth();await f.flush();
  assert.equal(f.connections().length,1);assert.equal(f.c.playerNameBackdrop.hidden,true);
});

test('Live-Gast kann erst nach erfolgreicher Platzvergabe einen Namen wählen oder abbrechen',async()=>{
  const f=fixture();await f.start();assert.equal(f.c.playerNameBackdrop.hidden,true);
  await f.hello({role:'b'});assert.equal(f.c.playerNameBackdrop.hidden,false);
  assert.equal(f.c.authBackdrop.hidden,true);
  f.c.closePlayerNameDialog(false);assert.equal(f.c.onlineRoomId,'Partie123');
  assert.equal(f.c.onlineConnected,true);assert.equal(f.connections().length,1);
  await f.hello({role:'b'});f.c.playerNameInput.value='Schachfreund';f.c.submitPlayerNameFromDialog(true);
  assert.equal(f.c.onlineDisplayName,'Schachfreund');assert.equal(f.c.playerNameBackdrop.hidden,true);
  await f.hello({role:'b'});assert.equal(f.c.playerNameBackdrop.hidden,true);
});

test('Reservierte Live-Einladung bietet Login statt Gastname',async()=>{
  const f=fixture();await f.start();await f.hello({seatCode:'LIVE_INVITATION_ACCOUNT_REQUIRED',seatDenied:true});
  assert.equal(f.c.authBackdrop.hidden,false);assert.equal(f.c.playerNameBackdrop.hidden,true);
});

test('Besetzte Live-Partie bietet beim Gerätewechsel Login und verbindet danach denselben Raum',async()=>{
  const f=fixture();await f.start();await f.hello();
  assert.equal(f.c.authBackdrop.hidden,false);
  assert.equal(f.c.playerNameBackdrop.hidden,true);
  assert.match(f.c.statusEl.textContent,/Spieler-Account/);
  f.c.closeAuthDialog();
  assert.equal(f.c.onlineRoomId,'Partie123');
  f.c.openAuthDialog('login');await f.c.submitAuthDialog();
  assert.deepEqual(f.connections().map(x=>x.room),['Partie123','Partie123']);
  await f.hello({role:'w'});
  assert.equal(f.c.authBackdrop.hidden,true);
  assert.equal(f.c.playerNameBackdrop.hidden,true);
});

test('Ein angemeldeter fremder Account erhält keine erneute Login-Aufforderung',async()=>{
  const f=fixture({loggedIn:true});await f.start();await f.hello();
  assert.equal(f.c.authBackdrop.hidden,true);
});

for(const change of ['login','room','watch']) test(`Verzögerter Login-Dialog entfällt nach Wechsel: ${change}`,async()=>{
  const f=fixture();await f.start();
  f.c.onlineRoleCode='spectator';
  f.c.msg={type:'hello',role:'spectator',seatCode:''};
  vm.runInContext(entryDialogs,f.c);
  if(change==='login')f.c.onlineAuthUser={id:'member1',username:'Karl-Heinz'};
  if(change==='room')f.c.onlineRoomId='AnderePartie';
  if(change==='watch')f.c.onlineSpectatorOnly=true;
  await f.flush();assert.equal(f.c.authBackdrop.hidden,true);
});

test('Öffentlicher Zuschauerlink bleibt ohne Gast- und Logindialog',async()=>{
  const f=fixture({query:'?watch=Public123'});await f.start();await f.hello();
  assert.equal(f.connections()[0].options.spectatorOnly,true);
  assert.equal(f.connections()[0].room,'Public123');
  assert.equal(f.c.playerNameBackdrop.hidden,true);assert.equal(f.c.authBackdrop.hidden,true);
});

for(const [query,type] of [['',''],['?dailyInvite=Partie123','daily-invite'],['?rematch=Offer123','rematch']]) {
  test(`Startadresse ${query || 'ohne Parameter'} behält ihren bisherigen Ablauf`,async()=>{
    const f=fixture({query});await f.start();assert.equal(f.connections().length,0);
    assert.equal(f.c.playerNameBackdrop.hidden,true);assert.equal(f.c.authBackdrop.hidden,true);
    if(type)assert.equal(f.calls.at(-1).type,type);
  });
}

const serverSource=readFileSync(new URL('../src/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
function liveRoom(){
  const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,URL,Request,Response,Headers,
    setTimeout,clearTimeout,btoa,atob,console});
  vm.runInContext(serverSource+'\nglobalThis.TestGameRoom = GameRoom;',context);
  const data=new Map([
    ['players',{white:{playerId:'old-device',userId:'member1',seatTokenHash:'old-hash'},
      black:{playerId:'opponent-device',userId:'member2',seatTokenHash:'opponent-hash'}}],
    ['game',{started:true,ended:false}], ['timeControl',{mode:'live',baseMinutes:60}],
    ['moves',[{ply:1,san:'e4'}]], ['clock',{turn:'b',wMs:3590000,bMs:3600000,running:true,lastTs:12345}]
  ]);
  const socket=(role)=>({info:{role,seatClaimed:true},sent:[],closed:false,
    deserializeAttachment(){return this.info;},serializeAttachment(info){this.info=info;},
    send(text){this.sent.push(JSON.parse(text));},close(){this.closed=true;}});
  const old=socket('w'),opponent=socket('b'),next=socket('spectator');
  const room=new context.TestGameRoom({storage:{
    async get(key){return structuredClone(data.get(key));},
    async put(key,value){data.set(key,structuredClone(value));}
  },getWebSockets:()=>[old,opponent,next]},{});
  return {room,data,old,opponent,next};
}

test('Server: gleicher Account übernimmt Live-Platz ohne altes Gerätetoken; Stellung und Uhr bleiben erhalten',async()=>{
  const f=liveRoom();
  const before=JSON.stringify([f.data.get('game'),f.data.get('moves'),f.data.get('clock')]);
  const result=await f.room.assignRole('new-device','','',{id:'member1'});
  assert.equal(result.role,'w');assert.equal(result.reclaimed,true);assert.ok(result.seatToken);
  assert.equal(f.data.get('players').white.userId,'member1');
  assert.equal(f.data.get('players').white.playerId,'new-device');
  f.room.replaceExistingSeatConnection(result.role,f.next);
  assert.equal(f.old.closed,true);assert.equal(f.old.info.role,'revoked');
  assert.equal(f.old.sent[0].type,'seat_replaced');
  assert.equal(f.opponent.closed,false);assert.equal(f.next.closed,false);
  assert.equal(JSON.stringify([f.data.get('game'),f.data.get('moves'),f.data.get('clock')]),before);
});

for(const user of [null,{id:'stranger'}]) test(`Server: ${user ? 'fremder Account' : 'Gast'} übernimmt keinen besetzten Live-Platz`,async()=>{
  const f=liveRoom();const before=JSON.stringify(f.data.get('players'));
  const result=await f.room.assignRole('new-device','','',user);
  assert.equal(result.role,'spectator');
  assert.equal(JSON.stringify(f.data.get('players')),before);
});
