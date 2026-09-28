import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('../../Gamer/js/'+n,import.meta.url),'utf8');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
function fixture(){
  const events={},timers=[];let now=1000000;
  const c=vm.createContext({Date:{now:()=>now},document:{hidden:false,visibilityState:'visible',addEventListener:(n,f)=>(events[n]??=[]).push(f)},addEventListener:(n,f)=>(events[n]??=[]).push(f),setInterval:(f,ms)=>{timers.push({f,ms});return timers.length;},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearInterval(){},clearTimeout(){},onlineAuthToken:'token',onlineAuthUser:{id:'1'}});
  c.window=c;
  return {c,timers,events,advance:ms=>now+=ms,hidden:v=>{c.document.hidden=v;c.document.visibilityState=v?'hidden':'visible';}};
}
function overview(){
 const f=fixture(),calls=[];
 Object.assign(f.c,{tournamentBackdrop:{hidden:true},tournamentSelectedId:'',dailyGamesBackdrop:{hidden:true}});
 for(const name of ['loadTournaments','refreshOpenOffersBadge','loadInfoCenter','loadDailyGames'])f.c[name]=async()=>calls.push(name);
 vm.runInContext(section(read('app-event-bindings.js'),'let backgroundOverviewLastAt','tournamentListTabButtons.forEach'),f.c);
 return {...f,calls};
}
test('Closed overview waits ten minutes; hidden tabs make no overview requests',async()=>{
 const f=overview();f.advance(120000);await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,0);
 f.advance(480000);f.hidden(true);await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,0);
 f.hidden(false);await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,4);
});
test('Resume events coalesce; open daily dialog owns its refresh; tournament details retain two minutes',async()=>{
 const f=overview();f.advance(60000);await Promise.all([f.c.refreshBackgroundOverview(true),f.c.refreshBackgroundOverview(true)]);assert.equal(f.calls.length,4);
 f.c.dailyGamesBackdrop.hidden=false;f.c.tournamentBackdrop.hidden=false;f.advance(120000);await f.c.refreshBackgroundOverview(false);
 assert.equal(f.calls.length,7);assert.equal(f.calls.filter(n=>n==='loadDailyGames').length,1);
 f.c.onlineAuthToken='';f.advance(600000);await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,7);
});
test('Slow overview does not overlap and recovers from a rejected request',async()=>{
 const f=overview();let finish;f.c.loadInfoCenter=()=>new Promise(r=>finish=r);f.advance(600000);
 const job=f.c.refreshBackgroundOverview(false);f.advance(600000);await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,3);finish();await job;
 f.c.loadInfoCenter=async()=>{throw Error('offline');};await f.c.refreshBackgroundOverview(false);assert.equal(f.calls.length,6);
});
function tournament(){
 const f=fixture();let calls=0;
 Object.assign(f.c,{liveTournamentPollTimer:null,liveTournamentPollGeneration:0,liveTournamentPollBusy:false,activeLiveTournamentStatus:null,tournamentItems:[],pollLiveTournamentStatus:async()=>calls++});
 vm.runInContext(section(read('live-tournaments.js'),'function liveTournamentNeedsFastPolling','window.setInterval(updateLiveTournamentCountdown'),f.c);
 return {...f,calls:()=>calls};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('Idle tournaments poll once per minute; active tournaments retain 2.5 seconds',async()=>{
 const f=tournament();f.c.startLiveTournamentPolling();await flush();assert.equal(f.calls(),1);assert.equal(f.timers.at(-1).ms,60000);
 f.c.activeLiveTournamentStatus={tournamentId:'t'};f.c.startLiveTournamentPolling();await flush();assert.equal(f.timers.at(-1).ms,2500);
});
test('Known registered tournament retains 15 seconds even before first live status',async()=>{
 const f=tournament();f.c.tournamentItems=[{live:true,status:'open',userState:'confirmed'}];f.c.startLiveTournamentPolling();await flush();assert.equal(f.timers.at(-1).ms,15000);
});
test('Hidden idle tabs pause tournament HTTP; hidden participants keep safety polling; resume is immediate',async()=>{
 const f=tournament();f.hidden(true);f.c.startLiveTournamentPolling();await flush();assert.equal(f.calls(),0);
 f.c.tournamentItems=[{live:true,status:'full',checkedIn:true}];f.c.startLiveTournamentPolling();await flush();assert.equal(f.calls(),1);assert.equal(f.timers.at(-1).ms,60000);
 f.hidden(false);f.events.visibilitychange[0]();await flush();assert.equal(f.calls(),2);
});
test('Cancelled tournament timer cannot restart polling',async()=>{
 const f=tournament();f.c.startLiveTournamentPolling();await flush();const pending=f.timers.at(-1).f;f.c.stopLiveTournamentPolling();await pending();assert.equal(f.calls(),1);
});
test('Presence keeps one-minute heartbeat and coalesces focus plus visibility',async()=>{
 const f=fixture();let calls=0;Object.assign(f.c,{authApi:async()=>calls++,requestOnlineState(){}});
 vm.runInContext(section(read('online-session.js'),'const PRESENCE_HEARTBEAT_MS','function cleanDisplayName'),f.c);
 f.c.startPresenceHeartbeat();await flush();assert.equal(f.timers[0].ms,60000);assert.equal(calls,1);
 f.events.focus[0]();f.events.visibilitychange[0]();await flush();assert.equal(calls,1);
 f.advance(60000);f.timers[0].f();f.events.focus[0]();await flush();assert.equal(calls,2);
});
test('Open-offer badge and daily overview share one in-flight request and retry after failure',async()=>{
 const f=fixture();let calls=0,finish;
 f.c.authApi=()=>{calls++;return new Promise((r,j)=>finish={r,j});};
 vm.runInContext(section(read('open-offers.js'),'let openOffersRequestPromise','function availableOpenOffersCount'),f.c);
 const a=f.c.requestOpenOffers(),b=f.c.requestOpenOffers();assert.equal(a,b);assert.equal(calls,1);finish.j(Error('offline'));await assert.rejects(a);
 const next=f.c.requestOpenOffers();finish.r({ok:true,offers:[]});await next;assert.equal(calls,2);
 assert.match(read('daily-games.js'),/requests.push\(requestOpenOffers\(\)\)/);
});
test('PN badge: 30 seconds closed, 15 seconds open, hidden pause, no overlapping requests',async()=>{
 const f=fixture();let calls=0,finish;
 Object.assign(f.c,{privateMessagesPollTimer:null,privateMessagesBadgeLastAt:0,privateMessagesBadgeBusy:false,privateMessagesBackdrop:{hidden:true},privateMessagesLoggedIn:()=>true,setPrivateMessagesBadge(){},authApi:()=>{calls++;return new Promise(r=>finish=r);}});
 vm.runInContext(section(read('direct-messages.js'),'function stopPrivateMessagesPolling','function updatePrivateMessagesAuthState'),f.c);
 f.c.startPrivateMessagesPolling();const tick=f.timers[0].f;tick();tick();assert.equal(calls,1);finish({unreadCount:0});await flush();
 f.advance(15000);tick();assert.equal(calls,1);f.advance(15000);tick();assert.equal(calls,2);finish({unreadCount:0});await flush();
 f.c.privateMessagesBackdrop.hidden=false;f.advance(15000);tick();assert.equal(calls,3);finish({unreadCount:0});await flush();f.hidden(true);f.advance(30000);tick();assert.equal(calls,3);
});
test('Worker CORS preflight allows existing headers and caches only permission for ten minutes',async()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const handler=section(source,"    if (request.method === 'OPTIONS') {","    if (url.pathname.startsWith('/api/'))");
 const response=vm.runInNewContext('(function(request){'+handler+'})',{Response})({method:'OPTIONS'});
 assert.equal(response.status,204);assert.equal(response.headers.get('access-control-max-age'),'600');assert.equal(response.headers.get('access-control-allow-headers'),'content-type, authorization');assert.equal(response.headers.get('cache-control'),null);
});
