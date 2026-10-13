import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
function fixture(){
  const c=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,setTimeout,clearTimeout,console});vm.runInContext(source,c);
  vm.runInContext(`let saved=null;readAdminSetting=async()=>saved?{value:saved}:null;writeAdminSetting=async(env,key,value)=>{saved=value;return '2026-10-12';};`,c);return c;
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('TV slots persist independent switches and retain favorites when disabled',async()=>{
  const c=fixture(),event={id:'us_open',title:'US Championship',category:'tournament'};
  await c.saveTvConfig({}, {slots:[{slotId:'tv1',liveBoardsEnabled:true,liveBoardEvents:[event],liveBoardStart:'first'},{slotId:'tv2',liveBoardsEnabled:false,liveBoardEvents:[event]},{slotId:'tv3',liveBoardsEnabled:true}]},{id:'admin'});
  let config=await c.loadTvConfig({});assert.deepEqual(plain(config.slots.map(s=>s.liveBoardsEnabled)),[true,false,true]);
  assert.deepEqual(plain(c.tvDto(config.slots[0],{}).liveBoardEvents),[event]);assert.equal(c.tvDto(config.slots[0],{}).liveBoardStart,'first');
  config.slots[0].liveBoardsEnabled=false;await c.saveTvConfig({},config,{id:'admin'});config=await c.loadTvConfig({});
  assert.equal(config.slots[0].liveBoardsEnabled,false);assert.deepEqual(plain(config.slots[0].liveBoardEvents),[event]);
  assert.equal(config.slots[2].liveBoardsEnabled,true);
});
test('older configuration defaults off; malformed associations cannot become API paths',()=>{
  const c=fixture();assert.equal(c.normalizeTvConfig({}).liveBoardsEnabled,false);
  const normalized=c.normalizeTvConfig({liveBoardsEnabled:'true',liveBoardStart:'invalid',liveBoardEvents:[{id:'../../admin',title:'bad'},null,{id:'valid',title:'Good',category:'club'},{id:'valid',title:'Duplicate'}]});
  assert.equal(normalized.liveBoardsEnabled,false);assert.equal(normalized.liveBoardStart,'selection');assert.deepEqual(plain(normalized.liveBoardEvents),[{id:'valid',title:'Good',category:'club'}]);
});
