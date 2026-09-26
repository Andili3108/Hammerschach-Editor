import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {handleTrainingImpulsesApi,youtubeId} from '../src/training-impulses.js';

function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  const env={DB:{prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args);},async run(){return sql.prepare(query).run(...args);}};}}};
  const json=(data,init)=>new Response(JSON.stringify(data),init);
  const session=token=>['member','admin'].includes(token)?{user:{id:token,isAdmin:token==='admin'}}:null;
  const helpers={json,lookupAuthSession:async(env,token)=>session(token),bearerTokenFromRequest:r=>r.headers.get('authorization'),readJsonBody:async r=>{try{return await r.json();}catch(_){return null;}},requireAdminSession:async r=>{
    const s=session(r.headers.get('authorization'));
    return s?.user.isAdmin?{ok:true,session:s}:{ok:false,response:json({ok:false},{status:s?403:401})};
  }};
  const call=(path='/api/training-impulses',method='GET',token='',body)=>handleTrainingImpulsesApi(new Request('https://test.invalid'+path,{method,headers:{authorization:token},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,new URL('https://test.invalid'+path),helpers);
  const config=async()=> (await (await call('/api/admin/training-impulses','GET','admin')).json()).videos;
  const save=videos=>call('/api/admin/training-impulses','POST','admin',{videos});
  return {call,config,save,sql};
}
test('YouTube-Links: watch, Kurzlinks, mobile, Shorts, live und embed; fremde Hosts werden abgewiesen',()=>{
  const id='vyfMVzeKEEc';
  for(const url of [`https://www.youtube.com/watch?v=${id}&t=10`,`https://youtu.be/${id}?si=abc`,`https://m.youtube.com/watch?v=${id}`,`https://youtube.com/shorts/${id}`,`https://youtube.com/live/${id}`,`https://www.youtube-nocookie.com/embed/${id}`])assert.equal(youtubeId(url),id);
  for(const url of [`https://youtube.com.evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,'javascript:alert(1)','https://youtube.com/playlist?list=xxx','https://youtube.com/watch?v=bad','https://youtu.be/'+id+'/other','https://vimeo.com/'+id])assert.equal(youtubeId(url),'');
});
test('Startauswahl enthält 14 Titel und genau vier freie Videos; gesperrte IDs bleiben privat',async t=>{
  const x=fixture(t),response=await x.call();assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.equal(data.videos.length,14);assert.equal(data.videos.filter(v=>v.public).length,4);
  assert.equal(data.videos.filter(v=>v.videoId).length,4);
  assert(data.videos.filter(v=>v.locked).every(v=>!('url'in v)&&!('videoId'in v)));
});
test('Mitglieder erhalten alle Videos, abgelaufene Sitzungen nur die Besucherfreigaben',async t=>{
  const x=fixture(t);
  const member=await (await x.call(undefined,'GET','member')).json();assert.equal(member.videos.filter(v=>v.videoId).length,14);
  const expired=await (await x.call(undefined,'GET','expired')).json();assert.equal(expired.videos.filter(v=>v.locked).length,10);
});
test('Nur Admin darf Konfiguration lesen oder speichern',async t=>{
  const x=fixture(t);
  for(const method of ['GET','POST'])for(const token of ['','member','expired'])assert.equal((await x.call('/api/admin/training-impulses',method,token,method==='POST'?{videos:[]}:undefined)).status,token==='member'?403:401);
  assert.equal((await x.config()).length,20);
});
test('20 Plätze speichern, Titel und Videos austauschen, Besucherfreigaben ändern und zentral wieder laden',async t=>{
  const x=fixture(t),videos=await x.config();
  for(let i=0;i<20;i++)videos[i]={title:`Impuls ${i+1}`,url:'https://youtu.be/9CfAhy--SVc',public:i%2===0};
  assert.equal((await x.save(videos)).status,200);
  const restored=await x.config();assert.equal(restored.length,20);assert.equal(restored[19].title,'Impuls 20');assert.match(restored[0].url,/youtube.com\/watch/);
  const visitor=await (await x.call()).json();assert.equal(visitor.videos.length,20);assert.equal(visitor.videos.filter(v=>v.videoId).length,10);
  assert.equal(x.sql.prepare('SELECT updated_by FROM admin_settings').get().updated_by,'admin');
});
test('Entfernen und vollständig leere Konfiguration bleiben nach erneutem Laden erhalten',async t=>{
  const x=fixture(t),videos=await x.config();videos[0]={title:'',url:'',public:true};await x.save(videos);
  assert.equal((await (await x.call()).json()).videos.length,13);
  await x.save([]);assert.equal((await (await x.call()).json()).videos.length,0);assert.equal((await x.config()).filter(v=>v.title).length,0);
});
test('Ungültige, unvollständige oder zu große Änderungen überschreiben keine gültige Konfiguration',async t=>{
  const x=fixture(t),before=await x.config();
  for(const videos of [null,{},Array(21).fill({}),[{title:'Nur Titel'}],[{url:'https://youtu.be/vyfMVzeKEEc'}],[{title:'Fremd',url:'https://evil.test/video'}],[{title:'x'.repeat(161),url:'https://youtu.be/vyfMVzeKEEc'}]]){
    assert.equal((await x.save(videos)).status,400);assert.deepEqual(await x.config(),before);
  }
});
test('Unbekannte Routen und nicht unterstützte Methoden',async t=>{
  const x=fixture(t);assert.equal(await x.call('/other'),null);assert.equal((await x.call(undefined,'POST','admin',{videos:[]})).status,405);
});

function bridge(){
  const messages=[],calls=[],listeners={};
  const frame={contentWindow:{postMessage:m=>messages.push(m)},dataset:{src:'./Trainingsimpulse/'},style:{},addEventListener(){},removeAttribute(name){delete this[name];}};
  const elements={impulsesToolFrame:frame,impulsesToolView:{hidden:true},impulsesToolBtn:{addEventListener(){}}};
  const context=vm.createContext({document:{getElementById:id=>elements[id],documentElement:{classList:{toggle(){}}}},window:{addEventListener:(type,fn)=>listeners[type]=fn,scrollTo(){}},onlineAuthToken:'',onlineAuthUser:null,HammerschachPreferences:{get:()=> 'soft'},embeddedToolTargetOrigin:()=> 'https://test.invalid',hammerschachScheduleHeightReport(){},openAuthDialog(){},openEmbeddedToolFromCurrentContext(){},authApi:async(...args)=>{calls.push(args);return {videos:[]};}});
  vm.runInContext(readFileSync(new URL('../../Gamer/js/training-impulses.js',import.meta.url),'utf8'),context);
  context.setImpulsesView(true);
  const send=(action,extra={},origin='https://test.invalid',source=frame.contentWindow)=>listeners.message({source,origin,data:{type:'impulses-request',requestId:1,epoch:messages.filter(m=>m.type==='impulses-context').at(-1).epoch,action,...extra}});
  return {context,frame,messages,calls,send};
}
test('Frame-Brücke ignoriert fremde Absender und schützt Admin-Aktionen auch im Browser',async()=>{
  const x=bridge();
  await x.send('save');assert.equal(x.calls.length,0);assert.equal(x.messages.at(-1).ok,false);
  await x.send('catalog',{},'https://evil.invalid');await x.send('catalog',{},'https://test.invalid',{});assert.equal(x.calls.length,0);
  await x.send('catalog');assert.equal(x.calls.length,1);
});
test('Verspätete Antworten nach Abmeldung oder erneutem Öffnen erreichen keine neue Ansicht',async()=>{
  const x=bridge();let release;
  x.context.authApi=()=>new Promise(resolve=>release=resolve);
  x.context.onlineAuthToken='admin';x.context.onlineAuthUser={id:'admin',isAdmin:true};x.context.postImpulsesToolContext();
  const old=x.send('config');
  x.context.onlineAuthToken='';x.context.onlineAuthUser=null;x.context.postImpulsesToolContext();
  release({videos:[{title:'privat'}]});await old;assert(!x.messages.some(m=>m.type==='impulses-result'));
  const reopened=x.send('catalog');x.context.setImpulsesView(false);assert.equal(x.frame.src,undefined);x.context.setImpulsesView(true);
  release({videos:[{title:'alt'}]});await reopened;assert(!x.messages.some(m=>m.type==='impulses-result'));
});
