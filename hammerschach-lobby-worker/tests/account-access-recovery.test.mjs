import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export class /gm, 'class ').replace(/^export default /m, 'const worker = ');
const adminPath = '/api/admin/account-recovery';
const previewPath = '/api/auth/account-recovery/preview';
const confirmPath = '/api/auth/account-recovery/confirm';
const adminPassword = 'Admin-Testkennwort123!';
const newPassword = 'Mitglied-NeuesKennwort123!';

async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lc TEXT, email TEXT, email_lc TEXT UNIQUE,
    password_alg TEXT, password_hash TEXT, password_salt TEXT, password_iterations INTEGER, created_at TEXT,
    is_admin INTEGER DEFAULT 0, disabled INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE retained_games (id TEXT PRIMARY KEY, user_id TEXT, result TEXT);
    CREATE TABLE retained_ratings (user_id TEXT, rating INTEGER);
    CREATE TABLE retained_participants (user_id TEXT, status TEXT);
    INSERT INTO sessions VALUES ('s1','member001'), ('s2','admin001'), ('s3','other001');
    INSERT INTO retained_games VALUES ('g1','member001','1-0');
    INSERT INTO retained_ratings VALUES ('member001',1750);
    INSERT INTO retained_participants VALUES ('member001','confirmed');`);
  const env = {GAMER_PUBLIC_URL:'https://example.invalid/', MAIL_PROVIDER:'smtp', DB:{
    prepare(sql) {
      let args = [];
      return {bind(...values) {args=values;return this;},
        async first() {return db.prepare(sql).get(...args) || null;},
        async all() {return {results:db.prepare(sql).all(...args)};},
        execute() {return {meta:{changes:db.prepare(sql).run(...args).changes}};},
        async run() {return this.execute();}};
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}
      catch(error) {db.exec('ROLLBACK');throw error;}
    }
  }};
  const c = vm.createContext({crypto:webcrypto, TextEncoder, TextDecoder, URL, Request, Response, Headers,
    setTimeout, clearTimeout, btoa, atob, console:{error() {}, log() {}},
    handleReaderArchivesApi:async()=>null, handleLeagueStandingsApi:async()=>null});
  vm.runInContext(source,c);
  vm.runInContext(`
    globalThis.mails=[]; globalThis.failMail=false;
    sendSmtpInvitation = async (env,payload) => { mails.push(payload.preparedMail); return failMail ? {ok:false,code:'TEST_MAIL_FAILURE'} : {ok:true}; };
    lookupAuthSession = async (env,token) => token === 'admin'
      ? {user:{id:'admin001',isAdmin:true}} : token === 'member' ? {user:{id:'member001',isAdmin:false}} : null;
    waitForMinimumResponseTime = async () => {};
  `,c);
  const salt=c.randomBase64Url(16);
  const hash=await c.hashPassword(adminPassword,salt,100000);
  for (const [id,username,email,isAdmin] of [
    ['member001','Karl-Heinz','old@example.invalid',0],['admin001','Andili','admin@example.invalid',1],['other001','Andere','other@example.invalid',0]
  ]) db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL)').run(id,username,username.toLowerCase(),email,email,'pbkdf2-sha256',hash,salt,100000,'2026-09-01',isAdmin);
  await c.ensureAccountRecoveryTable(env);
  const user=()=>db.prepare("SELECT * FROM users WHERE id='member001'").get();
  const payload=()=>({userId:'member001',username:'Karl-Heinz',currentPassword:adminPassword,
    newEmail:'new@example.invalid',repeatEmail:'new@example.invalid',identityMethod:'personal',
    identityNote:'Persönlich im Verein gesprochen; Accountzuordnung geprüft.',identityConfirmed:true});
  const api=async (path,method='POST',body={},actor='admin') => {
    const headers={'content-type':'application/json','cf-connecting-ip':'192.0.2.1'};
    if(actor) headers.authorization='Bearer '+actor;
    const request=new Request('https://example.invalid'+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});
    const response=await c.handleAuthApi(request,env,new URL(request.url));
    return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  };
  const lastToken=()=>new URL(c.mails.at(-1).textPart.match(/https:\/\/\S+/)[0]).searchParams.get('recoverAccount');
  const issue=async overrides=>{
    const response=await api(adminPath,'POST',{...payload(),...overrides});
    assert.equal(response.status,200,JSON.stringify(response.body));
    return lastToken();
  };
  const confirm=token=>api(confirmPath,'POST',{token,newPassword},'');
  const snapshots=()=>JSON.stringify({games:db.prepare('SELECT * FROM retained_games').all(),ratings:db.prepare('SELECT * FROM retained_ratings').all(),participants:db.prepare('SELECT * FROM retained_participants').all()});
  return {db,env,c,user,payload,api,lastToken,issue,confirm,snapshots};
}

for(const method of ['GET','POST','DELETE']) {
  test(`${method}: Admin-Endpunkt verweigert anonyme und normale Mitglieder`,async t=>{
    const f=await fixture(t);
    for(const [actor,status] of [['',401],['member',403]]) assert.equal((await f.api(adminPath,method,f.payload(),actor)).status,status);
    assert.equal(f.c.mails.length,0);
  });
}
test('Gezielte Mitgliedersuche zeigt Account mit maskierter alter Adresse, ohne Kennwortdaten',async t=>{
  const f=await fixture(t);
  const result=await f.api(adminPath+'?username=Karl-Heinz','GET');
  assert.equal(result.status,200);assert.equal(result.body.user.id,'member001');
  assert.equal(result.body.user.maskedEmail,'ol…@example.invalid');
  assert.doesNotMatch(JSON.stringify(result.body),/password_hash|old@example/);
  assert.equal(result.cache,'no-store');
});
test('Admin-Account und unbekannte Accounts werden nicht wiederhergestellt',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api(adminPath+'?username=Andili','GET')).status,403);
  assert.equal((await f.api(adminPath,'POST',{...f.payload(),userId:'admin001',username:'Andili'})).status,403);
  assert.equal((await f.api(adminPath+'?username=Unbekannt','GET')).status,404);
});
test('Falsches Admin-Kennwort erzeugt keinen Auftrag und wird protokolliert',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api(adminPath,'POST',{...f.payload(),currentPassword:'falschesKennwort'})).body.code,'INVALID_PASSWORD');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_account_recoveries').get().n,0);
  assert.equal(f.db.prepare('SELECT detail_code FROM auth_security_events').get().detail_code,'INVALID_PASSWORD');
});
for(const override of [{identityConfirmed:false},{identityMethod:'unknown'},{identityNote:'kurz'},{identityNote:'a'.repeat(401)}]) {
  test('Identitätsprüfung ist verpflichtend: '+JSON.stringify(override).slice(0,50),async t=>{
    const f=await fixture(t);
    assert.equal((await f.api(adminPath,'POST',{...f.payload(),...override})).body.code,'IDENTITY_REQUIRED');
    assert.equal(f.c.mails.length,0);
  });
}
test('Abweichende, ungültige, alte und bereits vergebene Mailadressen werden abgelehnt',async t=>{
  const f=await fixture(t);
  for(const [newEmail,repeatEmail,code] of [['new@example.invalid','different@example.invalid','INVALID_EMAIL'],['invalid','invalid','INVALID_EMAIL'],['old@example.invalid','old@example.invalid','EMAIL_UNCHANGED'],['other@example.invalid','other@example.invalid','EMAIL_NOT_AVAILABLE']]) {
    assert.equal((await f.api(adminPath,'POST',{...f.payload(),newEmail,repeatEmail})).body.code,code);
  }
});
test('Anlegen ändert keine Zugangsdaten; prüfbarer Auftrag ohne gespeicherten Klartexttoken',async t=>{
  const f=await fixture(t);const before=f.user();const history=f.snapshots();
  const token=await f.issue();
  assert.deepEqual(f.user(),before);assert.equal(f.snapshots(),history);
  const row=f.db.prepare('SELECT * FROM admin_account_recoveries').get();
  assert.equal(row.admin_user_id,'admin001');assert.equal(row.identity_note,f.payload().identityNote);
  assert.equal(row.mail_status,'accepted');assert.notEqual(row.token_hash,token);
  assert.equal(row.token_hash,await f.c.sha256Hex(token));
  assert.ok(Date.parse(row.expires_at)-Date.parse(row.created_at)<=30*60*1000+1000);
  const lookup=await f.api(adminPath+'?username=Karl-Heinz','GET');
  assert.doesNotMatch(JSON.stringify(lookup.body),new RegExp(token));
  assert.equal(lookup.body.pending.id,row.id);
});
test('Linkvorschau bestätigt noch nichts; öffentlicher GET-Aufruf verändert nichts',async t=>{
  const f=await fixture(t);const token=await f.issue();
  for(let i=0;i<2;i++) {
    const result=await f.api(previewPath,'POST',{token},'');
    assert.equal(result.status,200);assert.equal(result.body.newEmail,'new@example.invalid');
    assert.equal(result.cache,'no-store');
  }
  assert.equal((await f.api(confirmPath,'GET',{},'')).status,405);
  assert.equal(f.user().email,'old@example.invalid');
  assert.equal(f.db.prepare('SELECT completed_at FROM admin_account_recoveries').get().completed_at,null);
});
test('Erfolgreiche Bestätigung erhält Account und Spielhistorie, beendet Sitzungen und alte Aktionslinks',async t=>{
  const f=await fixture(t);const history=f.snapshots();
  await f.c.createAccountActionToken(f.env,'member001','password_reset','old@example.invalid',1800000);
  await f.c.createAccountActionToken(f.env,'member001','email_change','pending@example.invalid',1800000);
  const token=await f.issue();const result=await f.confirm(token);
  assert.equal(result.status,200);assert.equal(f.user().id,'member001');assert.equal(f.user().email,'new@example.invalid');
  assert.equal(await f.c.verifyPassword(newPassword,f.user()),true);assert.equal(f.snapshots(),history);
  assert.equal(f.db.prepare("SELECT verified FROM user_email_status WHERE user_id='member001'").get().verified,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id='member001'").get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM account_action_tokens WHERE used_at IS NULL').get().n,0);
  assert.ok(f.db.prepare('SELECT completed_at FROM admin_account_recoveries').get().completed_at);
  assert.equal((await f.confirm(token)).body.code,'INVALID_RECOVERY_LINK');
});
test('Widerrufen verlangt Admin-Kennwort und macht den Link unbrauchbar',async t=>{
  const f=await fixture(t);const token=await f.issue();const row=f.db.prepare('SELECT id FROM admin_account_recoveries').get();
  const body={userId:'member001',requestId:row.id,currentPassword:'falsch'};
  assert.equal((await f.api(adminPath,'DELETE',body)).status,403);
  assert.equal((await f.api(adminPath,'DELETE',{...body,currentPassword:adminPassword})).status,200);
  assert.equal((await f.confirm(token)).body.code,'INVALID_RECOVERY_LINK');assert.equal(f.user().email,'old@example.invalid');
});
test('Neuer Auftrag widerruft den vorherigen Link',async t=>{
  const f=await fixture(t);const first=await f.issue();const second=await f.issue();
  assert.equal((await f.confirm(first)).body.code,'INVALID_RECOVERY_LINK');
  assert.equal((await f.confirm(second)).status,200);
});
test('Versandfehler lässt Account unverändert und gibt keinen wirksamen Link frei',async t=>{
  const f=await fixture(t);const before=f.user();f.c.failMail=true;
  assert.equal((await f.api(adminPath,'POST',f.payload())).status,503);
  assert.deepEqual(f.user(),before);assert.equal((await f.confirm(f.lastToken())).body.code,'INVALID_RECOVERY_LINK');
  assert.equal(f.db.prepare('SELECT mail_status FROM admin_account_recoveries').get().mail_status,'failed');
});
test('Abgelaufene Links und zwischenzeitlich geänderte Zugangsdaten sperren Wiederherstellung',async t=>{
  const f=await fixture(t);const token=await f.issue();
  f.db.exec("UPDATE admin_account_recoveries SET expires_at='2000-01-01T00:00:00.000Z'");
  assert.equal((await f.confirm(token)).body.code,'INVALID_RECOVERY_LINK');
  const fresh=await f.issue();f.db.exec("UPDATE users SET password_hash='changed' WHERE id='member001'");
  assert.equal((await f.confirm(fresh)).body.code,'INVALID_RECOVERY_LINK');
});
test('Nach Vorprüfung widerrufener Auftrag oder geänderter Account wird beim Speichern erneut geprüft',async t=>{
  const f=await fixture(t);const token=await f.issue();const recovery=await f.c.loadValidAccountRecovery(f.env,token);
  f.db.exec("UPDATE admin_account_recoveries SET cancelled_at='2026-09-18'");
  assert.equal(await f.c.completeAccountRecovery(f.env,recovery,'hash','salt'),false);
  f.db.exec("UPDATE admin_account_recoveries SET cancelled_at=NULL; UPDATE users SET password_hash='changed' WHERE id='member001'");
  assert.equal(await f.c.completeAccountRecovery(f.env,recovery,'hash','salt'),false);
  assert.equal(f.user().email,'old@example.invalid');
});
test('Inzwischen vergebene Zieladresse ändert weder Account noch Link',async t=>{
  const f=await fixture(t);const token=await f.issue();
  f.db.exec("UPDATE users SET email='new@example.invalid',email_lc='new@example.invalid' WHERE id='other001'");
  assert.equal((await f.confirm(token)).status,409);assert.equal(f.user().email,'old@example.invalid');
  assert.equal(f.db.prepare('SELECT completed_at FROM admin_account_recoveries').get().completed_at,null);
});
for(const [table,operation] of [['users','UPDATE'],['user_email_status','INSERT'],['sessions','DELETE'],['account_action_tokens','UPDATE'],['admin_account_recoveries','UPDATE']]) {
  test('Speicherfehler bei '+table+': vollständiger Rollback und erneuter Versuch möglich',async t=>{
    const f=await fixture(t);const token=await f.issue();const before=f.user();
    await f.c.createAccountActionToken(f.env,'member001','password_reset',before.email,1800000);
    f.db.exec(`CREATE TRIGGER fail_recovery BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'test failure'); END`);
    assert.equal((await f.confirm(token)).body.code,'RECOVERY_SAVE_FAILED');
    assert.deepEqual(f.user(),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,3);
    assert.ok(await f.c.loadValidAccountRecovery(f.env,token));
    f.db.exec('DROP TRIGGER fail_recovery');assert.equal((await f.confirm(token)).status,200);
  });
}
test('Doppelte gleichzeitige Bestätigung ändert den Account genau einmal',async t=>{
  const f=await fixture(t);const token=await f.issue();
  const results=await Promise.all([f.confirm(token),f.confirm(token)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('Kennwort zu kurz verbraucht den Link nicht',async t=>{
  const f=await fixture(t);const token=await f.issue();
  assert.equal((await f.api(confirmPath,'POST',{token,newPassword:'kurz'},'')).body.code,'WEAK_PASSWORD');
  assert.ok(await f.c.loadValidAccountRecovery(f.env,token));
});
test('Gesperrte oder gelöschte Mitglieder können nicht bestätigt werden',async t=>{
  const f=await fixture(t);const token=await f.issue();
  f.db.exec("UPDATE users SET disabled=1 WHERE id='member001'");
  assert.equal((await f.confirm(token)).body.code,'INVALID_RECOVERY_LINK');
  f.db.exec("DELETE FROM users WHERE id='member001'");
  assert.equal((await f.confirm(token)).body.code,'INVALID_RECOVERY_LINK');
});
test('Versandgrenze und Begrenzung falscher Admin-Kennwörter bleiben aktiv',async t=>{
  const f=await fixture(t);for(let i=0;i<3;i++) await f.issue();
  assert.equal((await f.api(adminPath,'POST',f.payload())).status,429);
  for(let i=0;i<5;i++) assert.equal((await f.api(adminPath,'POST',{...f.payload(),currentPassword:'falschesKennwort'})).status,403);
  assert.equal((await f.api(adminPath,'POST',f.payload())).status,429);
});
test('Öffentliche Vorschau und Bestätigung teilen die Grenze für ungültige Links',async t=>{
  const f=await fixture(t);
  for(let i=0;i<12;i++) assert.equal((await f.api(i%2?previewPath:confirmPath,'POST',{token:'invalid'},'')).status,400);
  assert.equal((await f.api(previewPath,'POST',{token:'invalid'},'')).status,429);
});
test('Prüfvermerke werden nach 90 Tagen entfernt',async t=>{
  const f=await fixture(t);await f.issue();
  f.db.exec("UPDATE admin_account_recoveries SET created_at='2000-01-01T00:00:00.000Z'");
  await f.c.ensureAccountRecoveryTable(f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_account_recoveries').get().n,0);
});
