import { deleteArticleReads } from '../src/article-reads.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { checkAccountTournamentDeletion } from '../src/account-deletion-tournaments.js';

// Echtes SQLite führt dieselben Abfragen aus wie D1. Kein Nachbau der
// SQL-Filter im Mock: falsche Joins oder Statusbedingungen müssen auffallen.
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, is_admin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT, mode TEXT, status TEXT,
      total_rounds INTEGER, max_players INTEGER, updated_at TEXT, full_notification_sent_at TEXT);
    CREATE TABLE tournament_participants (tournament_id TEXT, user_id TEXT, status TEXT,
      arena_active INTEGER DEFAULT 0, joined_at TEXT, updated_at TEXT);
    CREATE TABLE tournament_games (id TEXT, tournament_id TEXT, white_user_id TEXT,
      black_user_id TEXT, status TEXT, room_id TEXT);
    CREATE TABLE tournament_knockout_results (tournament_id TEXT, round_number INTEGER,
      winner_user_id TEXT, loser_user_id TEXT);
    CREATE TABLE tournament_views (tournament_id TEXT, user_id TEXT);
    INSERT INTO users VALUES ('member001', 'Spieler', 0), ('admin001', 'Admin', 1);
    INSERT INTO sessions VALUES ('session001', 'member001');
  `);
  const writes = [];
  const env = {DB:{
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return {results:db.prepare(sql).all(...args)}; },
        async run() {
          const result = db.prepare(sql).run(...args);
          writes.push(sql);
          return {meta:{changes:result.changes}};
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  }};
  const addTournament = ({id='t1', mode='swiss', status='running', participant='confirmed', active=0, rounds=3} = {}) => {
    db.prepare('INSERT INTO tournaments (id, name, mode, status, total_rounds, max_players) VALUES (?, ?, ?, ?, ?, 8)')
      .run(id, 'Testturnier ' + id, mode, status, rounds);
    db.prepare('INSERT INTO tournament_participants VALUES (?, ?, ?, ?, ?, NULL)')
      .run(id, 'member001', participant, active, '2026-09-01');
  };
  const addGame = (status, userId='member001') => db.prepare('INSERT INTO tournament_games VALUES (?, ?, ?, ?, ?, ?)')
    .run('g1', 't1', userId, 'opponent', status, 'room001');
  const decision = (round, lost=true) => db.prepare('INSERT INTO tournament_knockout_results VALUES (?, ?, ?, ?)')
    .run('t1', round, lost ? 'opponent' : 'member001', lost ? 'member001' : 'opponent');
  return {db, env, writes, addTournament, addGame, decision};
}

for (const mode of ['single_round_robin', 'double_round_robin', 'swiss', 'groups_knockout', 'knockout']) {
  test(`${mode}: Rundenpause oder Freilos ohne eigene offene Partie sperrt`, async t => {
    const f = fixture(t);
    f.addTournament({mode});
    const result = await checkAccountTournamentDeletion(f.env, 'member001');
    assert.equal(result.code, 'ACTIVE_TOURNAMENTS');
    assert.equal(result.status, 409);
    assert.equal(f.writes.length, 0);
  });
}

for (const status of ['draft', 'open', 'full', 'ended', 'cancelled']) {
  test(`Turnierstatus ${status} sperrt ohne offene Partie nicht`, async t => {
    const f = fixture(t);
    f.addTournament({status});
    assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, true);
  });
}

for (const participant of ['waiting', 'withdrawn', 'absent']) {
  test(`Laufendes Turnier: Teilnehmerstatus ${participant} sperrt nicht`, async t => {
    const f = fixture(t);
    f.addTournament({participant});
    assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, true);
  });
}

for (const status of ['creating', 'running']) {
  test(`Eigene Partie ${status} sperrt auch ohne Teilnehmerdatensatz`, async t => {
    const f = fixture(t);
    f.addGame(status);
    assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).code, 'ACTIVE_TOURNAMENT_GAMES');
  });
}

test('Beendete eigene und laufende fremde Partien sperren nicht', async t => {
  const f = fixture(t);
  f.addGame('ended');
  f.addGame('running', 'other001');
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, true);
});

for (const active of [1, 2]) {
  test(`Arena aktiv=${active}: Warten oder Paarung sperrt`, async t => {
    const f = fixture(t);
    f.addTournament({mode:'arena', active});
    const result = await checkAccountTournamentDeletion(f.env, 'member001');
    assert.equal(result.code, 'ACTIVE_TOURNAMENTS');
    assert.match(result.message, /pausiere/);
  });
}

test('Pausierte Arena ohne offene Partie erlaubt Löschung', async t => {
  const f = fixture(t);
  f.addTournament({mode:'arena', active:0});
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, true);
});

test('Pausierte Arena mit offener Partie bleibt gesperrt', async t => {
  const f = fixture(t);
  f.addTournament({mode:'arena', active:0});
  f.addGame('running');
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).code, 'ACTIVE_TOURNAMENT_GAMES');
});

for (const [round, lost, allowed, label] of [
  [1, true, true, 'Viertelfinalverlierer ausgeschieden'],
  [1, false, false, 'Viertelfinalsieger spielt weiter'],
  [2, true, false, 'Halbfinalverlierer spielt um Platz 3'],
  [2, false, false, 'Halbfinalsieger spielt Finale'],
  [3, true, true, 'Final-/Platzierungsspiel verloren und abgeschlossen'],
  [3, false, true, 'Final-/Platzierungsspiel gewonnen und abgeschlossen']
]) {
  test(`K.-o.: ${label}`, async t => {
    const f = fixture(t);
    f.addTournament({mode:'knockout', rounds:3});
    f.decision(round, lost);
    assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, allowed);
  });
}

test('Vierer-K.-o.: Verlierer der ersten Runde muss um Platz 3 spielen', async t => {
  const f = fixture(t);
  f.addTournament({mode:'knockout', rounds:2});
  f.decision(1);
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, false);
});

test('K.-o.-Ausnahme greift nicht bei weiterer offener Partie', async t => {
  const f = fixture(t);
  f.addTournament({mode:'knockout'});
  f.decision(1);
  f.addGame('creating');
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).code, 'ACTIVE_TOURNAMENT_GAMES');
});

test('Ungültige K.-o.-Rundenzahl gibt Löschung nicht frei', async t => {
  const f = fixture(t);
  f.addTournament({mode:'knockout', rounds:0});
  f.decision(1);
  assert.equal((await checkAccountTournamentDeletion(f.env, 'member001')).ok, false);
});

test('Arena-Ausnahme hebt die Sperre eines anderen Turniers nicht auf', async t => {
  const f = fixture(t);
  f.addTournament({mode:'arena'});
  f.addTournament({id:'t2'});
  const result = await checkAccountTournamentDeletion(f.env, 'member001');
  assert.equal(result.activeTournaments, 1);
  assert.match(result.message, /Testturnier t2/);
});

test('Datenbankfehler sperren statt eine Löschung freizugeben', async t => {
  const f = fixture(t);
  f.db.exec('DROP TABLE tournament_games');
  const result = await checkAccountTournamentDeletion(f.env, 'member001');
  assert.equal(result.code, 'TOURNAMENT_CHECK_FAILED');
  assert.equal(result.status, 503);
});

const workerSource = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export class /gm, 'class ')
  .replace(/^export default /m, 'const worker = ');
function workerContext() {
  const context = vm.createContext({checkAccountTournamentDeletion, deleteArticleReads, console, crypto:webcrypto,
    TextEncoder, TextDecoder, URL, Request, Response, Headers, setTimeout, clearTimeout});
  vm.runInContext(workerSource, context);
  // Das Fixture enthält die relevanten Turniertabellen bereits.
  vm.runInContext('ensureTournamentTables = async () => true;', context);
  return context;
}

for (const admin of [false, true]) {
  test(`${admin ? 'Admin' : 'Selbst'}löschung: Turniersperre greift vor jeder Datenänderung`, async t => {
    const f = fixture(t);
    f.addTournament();
    const context = workerContext();
    const result = admin
      ? await context.deleteUserAsAdmin(f.env, {id:'admin001', is_admin:1}, 'member001')
      : await context.deleteUserAccount(f.env, {id:'member001', username:'Spieler'});
    assert.equal(result.code, 'ACTIVE_TOURNAMENTS');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM users WHERE id='member001'").get().n, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
    assert.equal(f.writes.length, 0);
  });
}

test('Fehler beim Bereitstellen der Turniertabellen stoppt die Löschung', async t => {
  const f = fixture(t);
  const context = workerContext();
  vm.runInContext("ensureTournamentTables = async () => { throw new Error('DB unavailable'); };", context);
  const result = await context.deleteUserAccount(f.env, {id:'member001'});
  assert.equal(result.code, 'TOURNAMENT_CHECK_FAILED');
  assert.equal(f.writes.length, 0);
});

test('Bestehende Daily-Sperre bleibt nach erlaubter Turnierprüfung wirksam', async t => {
  const f = fixture(t);
  const context = workerContext();
  vm.runInContext('pendingAndActiveDailyGamesForUser = async () => ({activeGames:[{}]});', context);
  const result = await context.deleteUserAccount(f.env, {id:'member001'});
  assert.equal(result.code, 'ACTIVE_DAILY_GAMES');
  assert.equal(f.writes.length, 0);
});

test('Bestehende Live-Sperre bleibt nach erlaubter Turnierprüfung wirksam', async t => {
  const f = fixture(t);
  const context = workerContext();
  vm.runInContext(`
    pendingAndActiveDailyGamesForUser = async () => ({activeGames:[]});
    collectAccountRoomIds = async () => ['room001'];
    callAccountRoomAction = async () => ({ok:true, active:true});
  `, context);
  const result = await context.deleteUserAccount(f.env, {id:'member001'});
  assert.equal(result.code, 'ACTIVE_GAME_ROOMS');
  assert.equal(f.writes.length, 0);
});

test('Turnier-Spielräume werden auch ohne andere Indexeinträge gefunden', async t => {
  const f = fixture(t);
  f.addGame('ended');
  const context = workerContext();
  const ids = await context.collectAccountRoomIds(f.env, 'member001');
  assert.ok(ids.includes('room001'));
});

for (const mode of ['arena', 'knockout']) {
  test(`${mode}: erlaubte Löschung entfernt Account und Sitzung, erhält Turnierhistorie`, async t => {
    const f = fixture(t);
    f.addTournament({mode, active:0});
    if (mode === 'knockout') f.decision(1);
    const context = workerContext();
    const result = await context.deleteUserAccount(f.env, {id:'member001', username:'Spieler'});
    assert.equal(result.ok, true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM users WHERE id='member001'").get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    assert.equal(f.db.prepare('SELECT status FROM tournament_participants').get().status, 'confirmed');
    assert.equal(f.db.prepare('SELECT status FROM tournaments').get().status, 'running');
    if (mode === 'knockout') assert.equal(f.db.prepare('SELECT loser_user_id FROM tournament_knockout_results').get().loser_user_id, 'member001');
    assert.equal(f.db.prepare(`SELECT COALESCE(users.username, 'Gelöschter Benutzer') AS name
      FROM tournament_participants LEFT JOIN users ON users.id = tournament_participants.user_id`).get().name, 'Gelöschter Benutzer');
  });
}

test('Noch nicht gestartetes Turnier: Löschung zieht Anmeldung zurück und Warteliste rückt nach', async t => {
  const f = fixture(t);
  f.addTournament({status:'full'});
  f.db.exec(`
    UPDATE tournaments SET max_players = 1;
    INSERT INTO users VALUES ('waiting001', 'Nachrücker', 0);
    INSERT INTO tournament_participants VALUES ('t1', 'waiting001', 'waiting', 0, '2026-09-02', NULL);
  `);
  const result = await workerContext().deleteUserAccount(f.env, {id:'member001', username:'Spieler'});
  assert.equal(result.ok, true);
  assert.equal(f.db.prepare("SELECT status FROM tournament_participants WHERE user_id='member001'").get().status, 'withdrawn');
  assert.equal(f.db.prepare("SELECT status FROM tournament_participants WHERE user_id='waiting001'").get().status, 'confirmed');
});
