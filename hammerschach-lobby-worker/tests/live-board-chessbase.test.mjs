import test from 'node:test';
import assert from 'node:assert/strict';
import {chessbaseEvents,chessbasePage,resolveChessbase} from '../src/live-board-chessbase.js';
import {handleLiveBoardApi} from '../src/live-board.js';
import {orderedEvents} from '../src/live-board-classification.js';
const slug='test-open-2026';
const home='<h2><a href="/en/Watch?id='+slug+'">Test Open 2026, USA</a></h2>';
const feed='https://liveserver.chessbase.com:6009/pgn/'+slug+'/2/0/.pgn';
const page='<div class="cbreplay" data-url="'+feed+'"></div><a href="/en/Replay?id='+slug+'&amp;rnd=1">1</a><a href="/en/Replay?id='+slug+'&amp;rnd=2">2</a>';
const pgn=Array.from({length:6},(_,i)=>`[Event "Test Open"]\n[Site "New York"]\n[Date "2026.10.12"]\n[EventDate "2026.10.09"]\n[EventCountry "USA"]\n[Round "2"]\n[White "Alice ${i}"]\n[Black "Bob ${i}"]\n[Result "*"]\n\n1. e4 e5 *\n`).join('\n');
const fresh=async(key,ttl,fn)=>({value:await fn(),stale:false});
test('bounded catalog extraction, source-specific Bundesliga, no fabricated date',()=>{
 const e=chessbaseEvents(home+home+'<h2><a href="/en/Watch?id=bl-2026">BL 2026-27, Germany</a></h2>');
 assert.equal(e.length,2);assert.equal(e[0].id,'cb-'+slug);assert.equal(e[0].eventStartsAt,undefined);assert.equal(e[1].clubScope,'bundesliga');
 assert.throws(()=>chessbaseEvents('<h2><a href="https://evil.example/en/Watch?id=abc">Fake</a></h2>'));
 assert.throws(()=>chessbaseEvents('<h2><a href="/en/Watch?id=../abc">Fake</a></h2>'));
});
test('only explicitly embedded, allowlisted PGN and verified round links accepted',()=>{
 assert.deepEqual(chessbasePage(page,slug),{url:feed,round:2,rounds:[1,2]});
 for(const replacement of ['https://evil.example:6009','http://liveserver.chessbase.com:6009','https://user@liveserver.chessbase.com:6009','https://liveserver.chessbase.com:6010'])assert.throws(()=>chessbasePage(page.replace('https://liveserver.chessbase.com:6009',replacement),slug));
 assert.throws(()=>chessbasePage(page,'different-event'));
 assert.throws(()=>chessbasePage('<script>'+page+'</script>',slug));
});
test('only listed events resolve; disabled discovery does no upstream work',async()=>{
 assert.equal((await resolveChessbase('cb-'+slug+'_r2',{},fresh,async()=>home)).source.round,2);
 assert.equal(await resolveChessbase('cb-missing',{},fresh,async()=>home),null);
 assert.equal(await resolveChessbase('cb-'+slug,{LIVE_BOARD_CHESSBASE_DISCOVERY:'0'},fresh,()=>assert.fail()),null);
});
test('ChessBase API catalog, four boards, pagination, single board and players use cached public feeds',async()=>{
 const calls=[];
 const helpers={json:(d,o)=>Response.json(d,o),lookupAuthSession:async(e,t)=>t==='member'?{user:{username:'Member'}}:null,bearerTokenFromRequest:r=>r.headers.get('authorization')};
 const deps={cache:null,fetcher:async(address,options)=>{
  calls.push(address);assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,undefined);
  if(address==='https://live.chessbase.com/en/')return new Response(home);
  if(address.includes('/en/Watch?')||address.includes('/en/Replay?'))return new Response(page);
  if(address===feed)return new Response(pgn);
  if(address.endsWith('/api/broadcast/top'))return Response.json({active:[],upcoming:[],past:{currentPageResults:[]}});
  throw Error('Unexpected '+address);
 }};
 const env={LIVE_BOARD_PAGE_DISCOVERY:'0'};
 const call=async(path,token='member')=>{const u=new URL('https://test/api/live-board/'+path);return handleLiveBoardApi(new Request(u,{headers:{authorization:token}}),env,u,helpers,deps);};
 assert.equal((await call('events','')).status,200);
 const catalog=await(await call('events')).json();assert.equal(catalog.events.length,1);assert.equal(catalog.chessbaseUnavailable,false);
 const id=catalog.events[0].id;
 const boards=await(await call('events/'+id+'/boards')).json();assert.equal(boards.games.length,4);assert.equal(boards.total,6);assert.equal(boards.event.source,undefined);assert.equal(boards.event.sourceType,'chessbase');assert.equal(boards.event.id,'cb-'+slug+'_r2');assert.ok(boards.event.rounds.some(r=>r.id===boards.event.id));assert.equal(boards.event.eventDate,'2026.10.09');assert.equal(boards.event.country,'USA');assert.equal(boards.pollAfterMs,30000);
 const second=await(await call('events/'+id+'/boards?page=2')).json();assert.equal(second.games.length,2);
 const single=await(await call('events/'+id+'_r2/boards?board=1&interval=5000')).json();assert.equal(single.games.length,1);assert.equal(single.pollAfterMs,5000);
 const players=await(await call('players?events='+id+'&q=Alice')).json();assert.equal(players.results[0].matches.length,6);
 assert.equal(calls.filter(u=>u===feed).length,1,'shared PGN cache');
 assert.equal((await call('events/cb-missing/boards')).status,404);
});
test('cross-provider dedup needs matching full title and tournament date; sections survive',()=>{
 const make=(title,type,date)=>({title,category:'tournament',automatic:true,eventStartsAt:date,source:{type,url:'https://example/'+type+title}});
 const date=Date.UTC(2026,9,9);
 assert.equal(orderedEvents([make('US Open','lichess',date),make('US Open','pgn',date)]).length,1);
 assert.equal(orderedEvents([make('US Open','lichess',date),make('US Women Open','pgn',date)]).length,2);
 assert.equal(orderedEvents([make('US Open','lichess',date),make('US Open','pgn',null)]).length,2);
});
