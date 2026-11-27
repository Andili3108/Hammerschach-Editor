import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {validPreferencePatch} from '../src/gamer-preferences.js';

test('screen-fit reads and writes are bound to the authenticated pilot accounts',async()=>{
  const users={
    pilot:{id:'one',username:'Andili',is_admin:1},
    son:{id:'four',username:'Fabili'},
    other:{id:'two',username:'Anderer',is_admin:1},
    label:{id:'three',username:'Andili'}
  };
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username_lc TEXT UNIQUE)');
  const insert=sqlite.prepare('INSERT INTO users VALUES (?,?)');
  insert.run('four','fabili');
  const DB={prepare(sql){
    const statement=sqlite.prepare(sql);
    return {run:()=>statement.run(),bind:(...args)=>({first:()=>statement.get(...args)})};
  }};
  const saved=new Map([['two',{screenFit:true,autoNight:true}]]);
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
  const context=vm.createContext({URL,Request,Response,Headers,console,users,validPreferencePatch,
    handleSchacheckeApi:()=>null, handleAccountRecoveryApi:()=>null,
    handleReaderArchivesApi:()=>null, handleLeagueStandingsApi:()=>null,
    getGamerPreferences:async(_,id)=>({...saved.get(id)}),
    saveGamerPreferences:async(_,id,patch)=>{saved.set(id,{...saved.get(id),...patch});return saved.get(id);}
  });
  vm.runInContext(source,context);
  vm.runInContext("lookupAuthSession=async(_,token)=>users[token]?{user:users[token]}:null; globalThis.entry=worker",context);
  const request=(token,patch)=>context.entry.fetch(new Request('https://test/api/account/preferences',{
    method:patch?'POST':'GET',headers:{authorization:'Bearer '+token},
    ...(patch?{body:JSON.stringify({preferences:patch})}:{})
  }),{DB});
  assert.equal((await request('guest')).status,401);
  for(const token of ['other','label']){
    const result=await (await request(token)).json();
    assert.equal(result.screenFitAccount,undefined);
    assert.equal(result.preferences.screenFit,undefined);
    assert.equal((await request(token,{screenFit:true})).status,403);
  }
  const initial=await (await request('pilot')).json();
  assert.equal(initial.screenFitAccount,'one');
  assert.equal(initial.preferences.screenFit,undefined);
  assert.equal((await request('pilot',{screenFit:'true'})).status,400);
  assert.equal((await (await request('son')).json()).preferences.screenFit,undefined);
  assert.equal((await request('son',{screenFit:true})).status,200);
  sqlite.exec("UPDATE users SET username_lc='neuername' WHERE id='four'");
  users.son.username='NeuerName';
  insert.run('five','fabili');
  users.reused={id:'five',username:'Fabili'};
  assert.equal((await request('reused',{screenFit:true})).status,403);
  assert.equal((await (await request('reused')).json()).screenFitAccount,undefined);
  for(const state of [true,false]){
    assert.equal((await request('pilot',{screenFit:state})).status,200);
    assert.equal((await (await request('pilot')).json()).preferences.screenFit,state);
  }
  const son=await (await request('son')).json();
  assert.equal(son.screenFitAccount,'four');
  assert.equal(son.preferences.screenFit,true);
  assert.equal((await request('son',{screenFit:false})).status,200);
  sqlite.close();
});
