import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {validPreferencePatch} from '../src/gamer-preferences.js';

test('screen-fit reads and writes persist independently for authenticated members',async()=>{
  const users={
    pilot:{id:'one',username:'Andili',is_admin:1},
    son:{id:'four',username:'Fabili'},
    other:{id:'two',username:'Anderer',is_admin:1},
    label:{id:'three',username:'Andili'}
  };
  const saved=new Map([['one',{screenFit:false}],['four',{screenFit:true}]]);
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
  }),{DB:{}});
  assert.equal((await request('guest')).status,401);
  assert.equal((await request('guest',{screenFit:false})).status,401);
  assert.equal((await (await request('pilot')).json()).preferences.screenFit,false);
  for(const token of ['other','label']){
    assert.equal((await (await request(token)).json()).preferences.screenFit,undefined);
    for(const state of [false,true]){
      assert.equal((await request(token,{screenFit:state})).status,200);
      assert.equal((await (await request(token)).json()).preferences.screenFit,state);
    }
  }
  assert.equal((await request('son',{screenFit:'false'})).status,400);
  assert.equal((await (await request('son')).json()).preferences.screenFit,true);
  assert.equal((await (await request('pilot')).json()).preferences.screenFit,false);
});
