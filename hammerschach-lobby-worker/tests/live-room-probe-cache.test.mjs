import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as cache from '../src/live-room-probe-cache.js';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export class /gm, 'class ')
  .replace(/^export default /m, 'const worker = ');
const HOUR = 3600000, DAY = 24 * HOUR;
const start = Date.parse('2026-09-28T18:00:00Z');
const old = '2026-09-13T20:47:05.038Z';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE completed_games (room_id TEXT);
    CREATE TABLE daily_games (room_id TEXT);
    CREATE TABLE invitation_email_log (room_id TEXT, sender_user_id TEXT, recipient_user_id TEXT, sent_at TEXT);`);
  let now = start, fail = '';
  const wrapDb = () => ({
    prepare(sql) {
      let values = [];
      const check = () => {
        if (sql.includes('live_room_probe_cache') &&
            (fail === 'all' || (fail === 'write' && sql.startsWith('INSERT')))) throw Error('D1 unavailable');
      };
      return {
        bind(...args) { values = args; return this; },
        async run() { check(); return {meta:db.prepare(sql).run(...values)}; },
        async all() { check(); return {results:db.prepare(sql).all(...values)}; },
        async first() { check(); return db.prepare(sql).get(...values); }
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  });
  const replies = new Map(), calls = [];
  const env = {DB:wrapDb(), GAME_ROOM:{
    idFromName:room => room,
    get:room => ({async fetch(request) {
      calls.push({room, user:request.headers.get('x-hammerschach-user-id'), path:new URL(request.url).pathname});
      const reply = replies.get(room);
      if (typeof reply === 'function') return reply(request);
      const [body, status = 200] = reply || [{ok:false, code:'NOT_A_PLAYER'}, 403];
      return new Response(JSON.stringify(body), {status});
    }})
  }};
  class Clock extends Date { static now() { return now; } }
  const c = vm.createContext({...cache, Date:Clock, Request, Response, Headers, URL, console});
  vm.runInContext(source + '\nglobalThis.TestGameRoom=GameRoom; globalThis.TestWorker=worker;', c);
  for (const name of ['ensureCompletedGamesTable', 'ensureDailyGamesTable', 'ensureInvitationEmailLogTable']) c[name] = async () => true;
  const add = async (room, user='member1', seen=old) => {
    await c.ensureAccountGameRoomIndex(env);
    db.prepare('INSERT OR REPLACE INTO account_game_rooms VALUES (?, ?, ?, ?, ?)').run(user, room, 'w', seen, seen);
  };
  return {db, c, env, calls, replies, add,
    list:(user='member1') => c.listMyRunningLiveGames(env, {id:user}),
    advance:ms => {now += ms;}, fail:value => {fail=value;},
    restart:() => {env.DB=wrapDb();}
  };
}

test('67 alte Nicht-Spieler-Verweise: 60 Minutenabfragen verursachen nur den ersten Raumscan', async t => {
  const f=fixture(t);
  for (let i=0;i<67;i++) await f.add('room'+i);
  for (let i=0;i<60;i++) { assert.equal((await f.list()).length,0); f.advance(60000); }
  assert.equal(f.calls.length,67);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM account_game_rooms').get().n,67);
  await f.list(); assert.equal(f.calls.length,134, 'nach einer Stunde erneut prüfen');
});

test('laufende Partien und gültige Live-Einladungen bleiben bei jedem Aufruf frisch', async t => {
  const f=fixture(t);
  for (const room of ['active','invited','cancelled','nonlive']) await f.add(room);
  f.replies.set('active',[{ok:true,mode:'live',started:true,ended:false,roomId:'active',movesCount:4}]);
  f.replies.set('invited',[{ok:true,mode:'live',started:false,ended:false,pendingInvitation:true,roomId:'invited'}]);
  f.replies.set('cancelled',[{ok:true,started:false,ended:true,cancelled:true}]);
  f.replies.set('nonlive',[{ok:true,started:false,ended:false,mode:'daily'}]);
  assert.equal((await f.list()).length,2);
  f.replies.set('active',[{ok:true,mode:'live',started:true,ended:false,roomId:'active',movesCount:5}]);
  const next=await f.list();
  assert.equal(next.find(x=>x.roomId==='active').movesCount,5);
  assert.equal(f.calls.length,6);
});

test('bestätigte abgeschlossene Räume werden nach 24 Stunden erneut geprüft', async t => {
  const f=fixture(t); await f.add('ended');
  f.replies.set('ended',[{ok:true,ended:true,mode:'live'}]);
  await f.list(); f.advance(DAY-1); await f.list(); assert.equal(f.calls.length,1);
  f.advance(1); await f.list(); assert.equal(f.calls.length,2);
});

test('neuer Beitritt umgeht einen alten negativen Eintrag sofort', async t => {
  const f=fixture(t); await f.add('rejoined'); await f.list();
  await f.c.indexAccountGameRoom(f.env,'member1','rejoined','w');
  f.replies.set('rejoined',[{ok:true,mode:'live',started:true,ended:false}]);
  assert.equal((await f.list()).length,1); assert.equal(f.calls.length,2);
});

test('neue Mail-Einladung ist auch bei einem alten Indexverweis sofort sichtbar', async t => {
  const f=fixture(t); await f.add('invitation'); await f.list();
  f.db.prepare('INSERT INTO invitation_email_log VALUES (?, ?, ?, ?)')
    .run('invitation','other','member1',new Date(start).toISOString());
  f.replies.set('invitation',[{ok:true,mode:'live',started:false,ended:false,pendingInvitation:true}]);
  assert.equal((await f.list()).length,1);
});

test('verspätetes negatives Ergebnis kann einen parallelen neuen Beitritt nicht verstecken', async t => {
  const f=fixture(t); await f.add('race');
  let finish, started;
  const waiting=new Promise(r=>{started=r;});
  f.replies.set('race',()=>new Promise(r=>{finish=r;started();}));
  const scan=f.list(); await waiting;
  await f.c.indexAccountGameRoom(f.env,'member1','race','w');
  finish(new Response(JSON.stringify({ok:false,code:'NOT_A_PLAYER'}),{status:403}));
  await scan;
  f.replies.set('race',[{ok:true,mode:'live',started:true,ended:false}]);
  assert.equal((await f.list()).length,1);
});

test('frische oder unklare Räume sowie technische Fehler werden nicht negativ zwischengespeichert', async t => {
  const f=fixture(t);
  const responses = [
    ['fresh',{ok:false,code:'NOT_A_PLAYER'},403,new Date(start).toISOString()],
    ['server',{ok:false,code:'INTERNAL_ERROR'},500],
    ['denied',{ok:false,code:'OTHER'},403],
    ['unclear',{ok:true}],
    ['openoffer',{ok:true,mode:'live',started:false,ended:false}],
    ['bad-date',{ok:false,code:'NOT_A_PLAYER'},403,'not-a-date']
  ];
  for (const [room,body,status=200,date=old] of responses) {await f.add(room,'member1',date);f.replies.set(room,[body,status]);}
  await f.add('network'); f.replies.set('network',()=>{throw Error('network');});
  await f.add('bad-json'); f.replies.set('bad-json',()=>new Response('not JSON'));
  await f.list(); await f.list(); assert.equal(f.calls.length,16);
});

test('negative Ergebnisse sind kontogebunden und überstehen einen Worker-Neustart', async t => {
  const f=fixture(t); await f.add('shared'); await f.add('shared','member2');
  await f.list(); f.restart(); await f.list(); assert.equal(f.calls.length,1);
  f.replies.set('shared',[{ok:true,mode:'live',started:true,ended:false}]);
  assert.equal((await f.list('member2')).length,1);
});

for (const failure of ['all','write']) test(`Cache-Ausfall (${failure}) unterdrückt keine weitere Prüfung`, async t => {
  const f=fixture(t); await f.add('retry'); f.fail(failure);
  await f.list(); await f.list(); assert.equal(f.calls.length,2);
  f.fail(''); await f.list(); await f.list(); assert.equal(f.calls.length,3);
});

test('bewusstes Öffnen eines alten Raumlinks umgeht den Suchcache vollständig', async t => {
  const f=fixture(t); await f.add('old-link'); await f.list();
  f.replies.set('old-link',()=>new Response('room reached'));
  const response=await f.c.TestWorker.fetch(new Request('https://gamer.invalid/ws?room=old-link',
    {headers:{Upgrade:'websocket'}}),f.env);
  assert.equal(await response.text(),'room reached');
  assert.equal(f.calls.at(-1).path,'/ws');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM account_game_rooms').get().n,1);
});

test('Partievorschau liest den alten Raum unabhängig vom negativen Suchcache', async t => {
  const f=fixture(t); await f.add('preview'); await f.list();
  const room=Object.create(f.c.TestGameRoom.prototype);
  const data=new Map([['game',{started:true,ended:true}],['moves',[]]]);
  room.state={storage:{get:async keys=>new Map(keys.map(key=>[key,data.get(key)]))}};
  room.getSecurePlayers=async()=>({white:{userId:'member1'}});
  f.c.cleanGameSetup=()=>({}); f.c.buildServerHistoryState=()=>({game:{board:['board']}});
  const result=await room.accountGamePreview('member1');
  assert.equal(result.ok,true); assert.equal(result.ended,true);
});
