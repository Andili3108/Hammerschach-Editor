import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {NEWS_SOURCES,parseFeed,parseSwiss,parseAustriaArticle,austriaLinks,selectNews,refreshGamerNews,handleSchacheckeApi} from '../src/schachecke.js';
const gamer=new URL('../../Gamer/',import.meta.url);
const context=vm.createContext({window:{},console,Intl,Date});
for(const file of ['chess-utils.js','chess960-core.js','board-setup-utils.js','game-setup.js','chess-engine.js','live-board-position.js','weekly-puzzles.js'])vm.runInContext(fs.readFileSync(new URL('js/'+file,gamer),'utf8'),context,{filename:file});
const weekly=context.window.HammerschachWeeklyPuzzles;
const puzzles=JSON.parse(fs.readFileSync(new URL('Trainer/puzzles.json',gamer),'utf8'));
test('Berlin week changes on Monday, including DST and New Year',()=>{
 for(const [date,key] of [['2026-10-11T21:59:59Z','2026-10-05'],['2026-10-11T22:00:00Z','2026-10-12'],['2026-10-25T22:59:59Z','2026-10-19'],['2026-10-25T23:00:00Z','2026-10-26'],['2027-01-01T12:00:00Z','2026-12-28']])assert.equal(weekly.week(new Date(date)),key);
});
test('24 deterministic, unique, legal tasks; all four rating bands and next week',()=>{
 const key='2026-10-05',chosen=weekly.select(puzzles,key),again=weekly.select([...puzzles].reverse(),key);
 assert.equal(chosen.length,24);assert.equal(new Set(chosen.map(p=>p.id)).size,24);assert.deepEqual(chosen.map(p=>p.id),again.map(p=>p.id));
 assert.notDeepEqual(chosen.map(p=>p.id),weekly.select(puzzles,'2026-10-12').map(p=>p.id));
 const bands=[[800,1000],[1001,1500],[1501,2000],[2001,2400]];
 for(const week of [key,'2026-10-12','2026-10-19','2026-10-26','2026-12-28'])for(const [i,p] of weekly.select(puzzles,week).entries()){
   assert.ok(p.rating>=bands[i%4][0]&&p.rating<=bands[i%4][1]);const start=weekly.prepare(p);assert.equal(start.game.turn,p.fen.split(' ')[1]==='w'?'b':'w');
 }
});
const source=NEWS_SOURCES[0],now=Date.parse('2026-10-10T18:00:00Z');
function rss(title='Test &amp; Schach',url='https://de.chessbase.com/post/test',date='Sat, 10 Oct 2026 12:00:00 GMT'){
 return `<rss><channel><item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
}
test('RSS / Atom: entities, dates, URLs and incomplete data',()=>{
 assert.equal(parseFeed(rss(),source,now)[0].title,'Test & Schach');
 assert.equal(parseFeed(rss('','https://de.chessbase.com/post/a'),source,now).length,0);
 assert.equal(parseFeed(rss('x','javascript:alert(1)'),source,now).length,0);
 assert.equal(parseFeed(rss('x',''),source,now).length,0);
 assert.equal(parseFeed(rss('x','https://evil.test/a'),source,now).length,0);
 assert.equal(parseFeed(rss('x',undefined,'2027-01-01'),source,now).length,0);
 assert.equal(parseFeed(rss('x',undefined,''),source,now).length,0);
 const atom='<feed><entry><title>Schach</title><link rel="alternate" href="https://de.chessbase.com/post/atom"/><published>2026-10-09T12:00:00Z</published></entry></feed>';
 assert.equal(parseFeed(atom,source,now).length,1);
});
test('Swiss and Austrian sources use actual article title and publication date',()=>{
 const swiss=NEWS_SOURCES[4],at=NEWS_SOURCES[3];
 const html='<a href="/de/news/test"><article><span>10.10.2026</span><span class="font-semibold">Test &amp; Schach</span></article></a>';
 const result=parseSwiss(html,swiss,now)[0];assert.equal(result.dateOnly,true);assert.equal(result.title,'Test & Schach');
 const links=austriaLinks('<h3><a href="/archiv-service/blog/test.html">Titel</a></h3>',at);assert.equal(links.length,1);
 assert.ok(parseAustriaArticle('<time datetime="2026-10-10T12:00:00+02:00" itemprop="datePublished">',links[0],at,now));
 assert.equal(parseAustriaArticle('<time>ohne Datum</time>',links[0],at,now),null);
});
test('ten news items: unique URLs/titles, source mix, descending time',()=>{
 const entries=Array.from({length:20},(_,i)=>({title:'Titel '+i,url:'https://de.chessbase.com/'+i,sourceId:i<14?'a':'b',publishedAt:new Date(now-i*1000).toISOString()}));
 const chosen=selectNews({a:entries,b:[entries[0]]});assert.equal(chosen.length,10);assert.equal(new Set(chosen.map(x=>x.url)).size,10);assert.ok(chosen.some(x=>x.sourceId==='b'));
 assert.ok(chosen.every((x,i)=>i===0||x.publishedAt<=chosen[i-1].publishedAt));
});
function environment(){
 const db=new DatabaseSync(':memory:');
 const env={DB:{prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async run(){return db.prepare(sql).run(...args);},async first(){return db.prepare(sql).get(...args)||null;}};return statement;}}};return env;
}
test('central D1 lease prevents parallel and repeated upstream refreshes; outage preserves cache',async()=>{
 const env=environment();let count=0;
 const fetcher=async url=>{count++;return new Response(url===source.url?rss():'<rss/>');};
 const result=await Promise.all([refreshGamerNews(env,now,fetcher),refreshGamerNews(env,now,fetcher)]);
 assert.equal(count,5);const first=result.find(x=>x.items?.length);assert.equal(first.items.length,1);
 await refreshGamerNews(env,now+60000,fetcher);assert.equal(count,5);
 const stale=await refreshGamerNews(env,now+6*3600000,async()=>{throw Error('offline');});assert.deepEqual(stale.items,first.items);assert.equal(stale.stale,true);assert.equal(stale.updatedAt,first.updatedAt);
});
test('server gate: unauthenticated, normal member, Andili and explicit release',async()=>{
 const deps={json:(x,init)=>new Response(JSON.stringify(x),init),bearerTokenFromRequest:()=>'',lookupAuthSession:async()=>null,isAdminUser:u=>u.isAdmin===true};
 const url=new URL('https://test/api/schachecke/access'),request=new Request(url);
 assert.equal((await (await handleSchacheckeApi(request,{},url,deps)).json()).allowed,true);
 deps.lookupAuthSession=async()=>({user:{username:'Mitglied'}});
 assert.equal((await (await handleSchacheckeApi(request,{},url,deps)).json()).allowed,false);
 const ticker=new URL('https://test/api/schachecke/ticker');assert.equal((await handleSchacheckeApi(new Request(ticker),{},ticker,deps)).status,403);
 deps.lookupAuthSession=async()=>({user:{username:'Andili',isAdmin:true}});assert.equal((await (await handleSchacheckeApi(request,{},url,deps)).json()).allowed,true);
 deps.lookupAuthSession=async()=>({user:{username:'Mitglied'}});assert.equal((await (await handleSchacheckeApi(request,{SCHACHECKE_MEMBERS_ENABLED:'1'},url,deps)).json()).allowed,true);
});
