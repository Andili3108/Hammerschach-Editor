import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../Gamer/js/live-board.js',import.meta.url),'utf8');
function harness(total=29){
 const calls=[],paint=[];
 const job={query:'Aronian',events:Array.from({length:total},(_,i)=>({id:'event-'+i})),results:[],offset:0,running:false};
 const state={playerSearch:job,generation:0,controller:null,event:null};
 const c=vm.createContext({state,onlineAuthToken:'member',AbortController,URLSearchParams,setTimeout,clearTimeout,
  visible:()=>true,pauseClock:()=>{},setBusy:()=>{},status:{textContent:''},
  closeEmbeddedTools:()=>{},renderPlayerResults:()=>paint.push({offset:state.playerSearch.offset,running:state.playerSearch.running}),
  authApi:async(path,options)=>{calls.push({path,options});const ids=new URLSearchParams(path.split('?')[1]).get('events').split(',');return {results:ids.map(id=>({id,matches:id==='event-25'?[{white:'Levon Aronian'}]:[]}))};}
 });
 vm.runInContext(source.slice(source.indexOf('  function stop(){'),source.indexOf('  function schedule(')),c);
 vm.runInContext(source.slice(source.indexOf('  async function searchPlayers(){'),source.indexOf('  function applyFilters(')),c);
 vm.runInContext(source.slice(source.indexOf('  function togglePlayerSearch(){'),source.indexOf("  button('search-more').addEventListener('click',togglePlayerSearch);")),c);
 return {c,state,job,calls,paint};
}
test('one start searches all 29 events serially in batches of at most three, showing late hits',async()=>{
 const {c,job,calls,paint}=harness();let active=0,maxActive=0;
 const api=c.authApi;c.authApi=async(...args)=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();const r=await api(...args);active--;return r;};
 await c.searchPlayers();
 assert.equal(job.offset,29);assert.equal(job.running,false);assert.equal(calls.length,10);assert.equal(maxActive,1);
 assert.ok(job.results.some(r=>r.matches.length));assert.ok(paint.some(p=>p.offset===15&&p.running));
 assert.ok(calls.every(call=>new URLSearchParams(call.path.split('?')[1]).get('events').split(',').length<=3));
});
test('stop aborts active request; late reply cannot add results; resume continues at same offset',async()=>{
 const {c,job,calls}=harness(17),api=c.authApi;let reply,signal;
 c.authApi=async(...args)=>{if(job.offset===3)return new Promise(resolve=>{reply=()=>resolve({results:[{id:'obsolete'}]});signal=args[1].signal;});return api(...args);};
 const pending=c.searchPlayers();while(!reply)await Promise.resolve();
 c.togglePlayerSearch();assert.equal(signal.aborted,true);assert.equal(job.running,false);assert.equal(job.interrupted,true);assert.equal(job.offset,3);
 reply();await pending;assert.equal(job.results.length,3);
 c.authApi=api;await c.searchPlayers();assert.equal(job.offset,17);assert.equal(job.interrupted,false);
 assert.equal(job.results.length,17);assert.equal(calls.length,6);
});
test('replacement search rejects results from previous generation',async()=>{
 const {c,state,job}=harness(5);let reply;
 const api=c.authApi;c.authApi=()=>new Promise(resolve=>{reply=resolve;});
 const old=c.searchPlayers();c.stop();
 state.playerSearch={query:'Other',events:[{id:'new'}],offset:0,results:[],running:false};c.authApi=api;
 await c.searchPlayers();reply({results:[{id:'old'}]});await old;
 assert.equal(job.results.length,0);assert.equal(state.playerSearch.offset,1);assert.equal(state.playerSearch.results[0].id,'new');
});
test('network error pauses without retry loop; explicit continuation resumes remaining batch',async()=>{
 const {c,job,calls}=harness(8),api=c.authApi;let attempts=0;
 c.authApi=async(...args)=>{attempts++;if(attempts===2)throw Error('Test network error');return api(...args);};
 await c.searchPlayers();assert.equal(job.offset,3);assert.equal(job.running,false);assert.equal(job.interrupted,true);assert.equal(attempts,2);
 c.authApi=api;await c.searchPlayers();assert.equal(job.offset,8);assert.equal(calls.length,3);
});
test('empty selection performs no request',async()=>{const {c,calls,job}=harness(0);await c.searchPlayers();assert.equal(calls.length,0);assert.equal(job.running,false);});
