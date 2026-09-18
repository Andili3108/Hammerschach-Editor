import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export class /gm, 'class ')
  .replace(/^export default /m, 'const worker = ');

async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lc TEXT, email TEXT, email_lc TEXT,
      password_alg TEXT, password_hash TEXT, password_salt TEXT, password_iterations INTEGER,
      disabled INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT);
    INSERT INTO users (id, username, username_lc, email, email_lc, password_hash)
      VALUES ('u1', 'Karl-Heinz', 'karl-heinz', 'test@example.invalid', 'test@example.invalid', 'old-hash'),
             ('u2', 'Andere', 'andere', 'other@example.invalid', 'other@example.invalid', 'other-hash');
    INSERT INTO sessions VALUES ('s1', 'u1'), ('s2', 'u2');
  `);
  const env = {GAMER_PUBLIC_URL:'https://example.invalid/', MAIL_PROVIDER:'smtp', DB:{
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return {results:db.prepare(sql).all(...args)}; },
        execute() { return {meta:{changes:db.prepare(sql).run(...args).changes}}; },
        async run() { return this.execute(); }
      };
    },
    // D1-Batches sind atomare SQL-Transaktionen; echte SQLite-Transaktionen
    // bilden auch Fehler in der zweiten/dritten Anweisung und Rollbacks ab.
    // https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  }};
  const context = vm.createContext({crypto:webcrypto, TextEncoder, TextDecoder,
    URL, Request, Response, Headers, setTimeout, clearTimeout, btoa, atob,
    console:{error() {}, log() {}},
    handleReaderArchivesApi:async () => null, handleLeagueStandingsApi:async () => null});
  vm.runInContext(source, context);
  vm.runInContext(`
    globalThis.mails = [];
    globalThis.mailResult = {ok:true};
    sendSmtpInvitation = async (env, payload) => {
      mails.push(payload.preparedMail);
      if (globalThis.mailThrows) throw new Error('Simulated transport interruption');
      return mailResult;
    };
    waitForMinimumResponseTime = async () => {};
  `, context);
  await context.ensureAccountSecurityTables(env);
  const request = new Request('https://example.invalid/', {headers:{'cf-connecting-ip':'192.0.2.1'}});
  const user = () => db.prepare("SELECT * FROM users WHERE id='u1'").get();
  const issue = async (purpose='password_reset', uid='u1') => context.createAccountActionToken(
    env, uid, purpose, uid === 'u1' ? user().email : 'other@example.invalid', 30 * 60 * 1000);
  const valid = token => context.loadValidAccountActionToken(env, token, 'password_reset');
  const send = () => context.sendPasswordResetEmail(env, user(), request);
  const api = async (path, body) => {
    const req = new Request('https://example.invalid' + path, {method:'POST',
      headers:{'content-type':'application/json', 'cf-connecting-ip':'192.0.2.1'}, body:JSON.stringify(body)});
    const response = await context.handleAuthApi(req, env, new URL(req.url));
    return {status:response.status, body:await response.json()};
  };
  return {db, env, context, request, user, issue, valid, send, api};
}

test('Benutzername mit Bindestrich genügt für die Rücksetzmail', async t => {
  const f = await fixture(t);
  const result = await f.api('/api/auth/password-reset/request', {identifier:'Karl-Heinz'});
  assert.equal(result.status, 200);
  assert.equal(f.context.mails.length, 1);
  assert.equal(f.context.mails[0].recipientEmail, 'test@example.invalid');
  assert.equal(f.db.prepare("SELECT outcome FROM auth_security_events WHERE event_type='password_reset_request'").get().outcome, 'accepted');
});

test('Fehlgeschlagener Neuversand erhält bisherigen Link und dessen Ablaufzeit', async t => {
  const f = await fixture(t);
  const first = await f.issue();
  f.context.mailResult = {ok:false, code:'SMTP_TEST_FAILURE', message:'Testfehler'};
  assert.equal((await f.send()).ok, false);
  const row = await f.valid(first.token);
  assert.ok(row);
  assert.equal(row.expires_at, first.expiresAt);
  assert.equal(f.db.prepare('SELECT status FROM mail_delivery_log').get().status, 'failed');
});

test('Erfolgreicher Neuversand entwertet verspätet eintreffende ältere Mail nicht', async t => {
  const f = await fixture(t);
  const first = await f.issue();
  assert.equal((await f.send()).ok, true);
  assert.ok(await f.valid(first.token));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM account_action_tokens WHERE purpose='password_reset' AND used_at IS NULL").get().n, 2);
});

test('Drei Versandfehler verbrauchen kein Accountkontingent; danach ist Versand möglich', async t => {
  const f = await fixture(t);
  f.context.mailResult = {ok:false, code:'SMTP_TEST_FAILURE'};
  for (let i=0; i<3; i++) assert.equal((await f.send()).ok, false);
  f.context.mailResult = {ok:true};
  assert.equal((await f.send()).ok, true);
  assert.equal(f.context.mails.length, 4);
});

test('Transport-Ausnahme gibt Accountkontingent frei und erhält ältere Links', async t => {
  const f = await fixture(t);
  const first = await f.issue();
  f.context.mailThrows = true;
  await assert.rejects(f.send(), /transport interruption/);
  assert.ok(await f.valid(first.token));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auth_mail_request_log WHERE subject_hash LIKE 'failed:%'").get().n, 1);
});

test('IP-Grenze bleibt auch nach fehlgeschlagenen Sendungen bestehen', async t => {
  const f = await fixture(t);
  f.context.mailResult = {ok:false, code:'SMTP_TEST_FAILURE'};
  for (let i=0; i<8; i++) await f.send();
  assert.equal((await f.send()).reason, 'rate_limited');
  assert.equal(f.context.mails.length, 8);
});

test('Drei angenommene Sendungen begrenzen weitere Sendungen pro Account', async t => {
  const f = await fixture(t);
  for (let i=0; i<3; i++) assert.equal((await f.send()).ok, true);
  assert.equal((await f.send()).reason, 'rate_limited');
  assert.equal(f.context.mails.length, 3);
});

test('Gleichzeitige Versandreservierungen überschreiten Accountgrenze nicht', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({length:10}, () => f.context.claimAuthMailRequest(f.env, f.request, 'password_reset', 'u1')));
  assert.equal(results.filter(Boolean).length, 3);
});

test('Ältere Mailbestätigungen werden weiterhin durch neue ersetzt', async t => {
  const f = await fixture(t);
  const first = await f.issue('verify_registration');
  await f.issue('verify_registration');
  assert.equal(await f.context.loadValidAccountActionToken(f.env, first.token, 'verify_registration'), null);
});

test('Öffentliche Antwort verrät weder Account noch Versandstatus', async t => {
  const f = await fixture(t);
  const success = await f.api('/api/auth/password-reset/request', {identifier:'Karl-Heinz'});
  const missing = await f.api('/api/auth/password-reset/request', {identifier:'NichtVorhanden'});
  f.context.mailResult = {ok:false, code:'SMTP_TEST_FAILURE'};
  const failed = await f.api('/api/auth/password-reset/request', {identifier:'Karl-Heinz'});
  await f.context.setCurrentEmailVerified(f.env, 'u1', f.user().email, false);
  const unverified = await f.api('/api/auth/password-reset/request', {identifier:'Karl-Heinz'});
  vm.runInContext('checkAuthRateLimit = async () => ({allowed:false, context:{}});', f.context);
  const limited = await f.api('/api/auth/password-reset/request', {identifier:'Karl-Heinz'});
  for (const result of [missing, failed, unverified, limited]) assert.deepEqual(result, success);
  assert.match(success.body.message, /bestätigt keinen Versand/);
  assert.doesNotMatch(success.body.message, /test@example/);
});

test('Unbestätigter Account erhält keine Rücksetzmail', async t => {
  const f = await fixture(t);
  await f.context.setCurrentEmailVerified(f.env, 'u1', f.user().email, false);
  assert.equal((await f.send()).reason, 'email_not_verified');
  assert.equal(f.context.mails.length, 0);
});

test('Erfolgreiche Rücksetzung ändert Kennwort, beendet Sitzungen und verbraucht alle eigenen Resetlinks', async t => {
  const f = await fixture(t);
  const first = await f.issue();
  const second = await f.issue();
  const other = await f.issue('password_reset', 'u2');
  const verification = await f.issue('verify_registration');
  const result = await f.api('/api/auth/password-reset/confirm', {token:first.token, newPassword:'NeuesKennwort123!'});
  assert.equal(result.status, 200);
  assert.equal(await f.context.verifyPassword('NeuesKennwort123!', f.user()), true);
  assert.equal(await f.context.verifyPassword('FalschesKennwort', f.user()), false);
  assert.equal(await f.valid(first.token), null);
  assert.equal(await f.valid(second.token), null);
  assert.ok(await f.valid(other.token));
  assert.ok(await f.context.loadValidAccountActionToken(f.env, verification.token, 'verify_registration'));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id='u1'").get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id='u2'").get().n, 1);
});

for (const [table, operation] of [['users','UPDATE'], ['sessions','DELETE'], ['account_action_tokens','UPDATE']]) {
  test(`Speicherfehler bei ${table}: vollständiger Rollback, derselbe Link bleibt nutzbar`, async t => {
    const f = await fixture(t);
    const action = await f.issue();
    const second = await f.issue();
    f.db.exec(`CREATE TRIGGER fail_reset BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
    const failed = await f.api('/api/auth/password-reset/confirm', {token:action.token, newPassword:'NeuesKennwort123!'});
    assert.equal(failed.status, 503);
    assert.equal(failed.body.code, 'PASSWORD_RESET_SAVE_FAILED');
    assert.equal(f.user().password_hash, 'old-hash');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 2);
    assert.ok(await f.valid(action.token));
    assert.ok(await f.valid(second.token));
    f.db.exec('DROP TRIGGER fail_reset');
    const retry = await f.api('/api/auth/password-reset/confirm', {token:action.token, newPassword:'NeuesKennwort123!'});
    assert.equal(retry.status, 200);
  });
}

for (const sameToken of [true, false]) {
  test(`Parallele Rücksetzungen mit ${sameToken ? 'demselben Link' : 'verschiedenen Links'}: genau eine Änderung`, async t => {
    const f = await fixture(t);
    const first = await f.issue();
    const second = sameToken ? first : await f.issue();
    const results = await Promise.all([
      f.api('/api/auth/password-reset/confirm', {token:first.token, newPassword:'KennwortEins123!'}),
      f.api('/api/auth/password-reset/confirm', {token:second.token, newPassword:'KennwortZwei123!'})
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200,409]);
    const winner = results[0].status === 200 ? 'KennwortEins123!' : 'KennwortZwei123!';
    assert.equal(await f.context.verifyPassword(winner, f.user()), true);
  });
}

test('Abgelaufener oder wiederverwendeter Link ändert das Kennwort nicht', async t => {
  const f = await fixture(t);
  const old = await f.issue();
  f.db.exec("UPDATE account_action_tokens SET expires_at='2000-01-01T00:00:00.000Z'");
  assert.equal((await f.api('/api/auth/password-reset/confirm', {token:old.token, newPassword:'Kennwort123!'})).status, 400);
  assert.equal(f.user().password_hash, 'old-hash');
  const fresh = await f.issue();
  assert.equal((await f.api('/api/auth/password-reset/confirm', {token:fresh.token, newPassword:'Kennwort123!'})).status, 200);
  const hash = f.user().password_hash;
  assert.equal((await f.api('/api/auth/password-reset/confirm', {token:fresh.token, newPassword:'AnderesKennwort123!'})).status, 400);
  assert.equal(f.user().password_hash, hash);
});

test('Zu kurzes Kennwort verbraucht den Link nicht', async t => {
  const f = await fixture(t);
  const action = await f.issue();
  assert.equal((await f.api('/api/auth/password-reset/confirm', {token:action.token, newPassword:'kurz'})).body.code, 'WEAK_PASSWORD');
  assert.ok(await f.valid(action.token));
});

test('Link für frühere Mailadresse wird abgelehnt, auch nach bereits erfolgter Tokenprüfung', async t => {
  const f = await fixture(t);
  const action = await f.issue();
  const row = await f.valid(action.token);
  f.db.exec("UPDATE users SET email='changed@example.invalid', email_lc='changed@example.invalid' WHERE id='u1'");
  assert.equal(await f.valid(action.token), null);
  assert.equal(await f.context.applyPasswordReset(f.env, row, 'new-hash', 'new-salt'), false);
  assert.equal(f.user().password_hash, 'old-hash');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 2);
});

test('Zwischen Tokenprüfung und Speichern abgelaufener Link wird erneut geprüft', async t => {
  const f = await fixture(t);
  const action = await f.issue();
  const row = await f.valid(action.token);
  f.db.exec("UPDATE account_action_tokens SET expires_at='2000-01-01T00:00:00.000Z'");
  assert.equal(await f.context.applyPasswordReset(f.env, row, 'new-hash', 'new-salt'), false);
  assert.equal(f.user().password_hash, 'old-hash');
});
