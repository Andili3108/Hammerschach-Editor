import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../Gamer/js/'+name,import.meta.url),'utf8');
const ids=['stroebeck-gemeinschaft','vertrauen-online-schach','online-fide-wertung'];
function fixture(){
  const disk=new Map(),buttons=new Map(),frameEvents=new Map();
  function element(){return {hidden:false,textContent:'',attrs:{},children:[],getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;},querySelector(){return this.children[0]||null;},appendChild(el){this.children.push(el);}};}
  const button=id=>{if(!buttons.has(id))buttons.set(id,element());return buttons.get(id);};
  const leaves=ids.map(id=>Object.assign(element(),{dataset:{schachNewsId:id}}));
  const mobile=[element(),element()];
  const article={readyState:'complete',URL:'https://gamer.example/SchachNews/'+ids[0],body:{dataset:{newsId:ids[0]}},querySelector:()=>({})};
  const frame={contentDocument:article,addEventListener:(name,fn)=>frameEvents.set(name,fn)};
  const doc={hidden:false,getElementById:button,createElement:element,addEventListener(){},querySelectorAll(selector){return selector==='[data-schach-news-id]'?leaves:mobile;}};
  const context=vm.createContext({document:doc,location:{href:'https://gamer.example/'},URL,localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},setInterval(){},addEventListener(){},onlineAuthUser:null,onlineAuthToken:'',tournamentReportToolActive:true,tournamentReportToolView:{hidden:false},tournamentReportToolFrame:frame,schachCurrentCategory:'news',schachNewsCurrentId:ids[0],tournamentReportCurrentId:'example',TOURNAMENT_REPORTS:{example:{src:'./Turnierberichte/example/?embedded=1',notify:false}},SCHACH_NEWS:Object.fromEntries(ids.map(id=>[id,{src:'./SchachNews/'+id+'.html'}]))});
  context.window=context;
  context.currentSchachArticle=()=>context.schachCurrentCategory==='news'?context.SCHACH_NEWS[context.schachNewsCurrentId]:context.TOURNAMENT_REPORTS.example;
  vm.runInContext(read('article-read-state.js'),context);vm.runInContext(read('article-read-ui.js'),context);
  return {disk,context,article,doc,button,leaves,mobile,load:()=>frameEvents.get('load')(),select(id,url='https://gamer.example/SchachNews/'+id){context.schachNewsCurrentId=id;article.URL=url;article.body.dataset={newsId:id};},count:()=>{const b=button('schachNewsCategoryBtn').children[0];return b.hidden?0:Number(b.textContent);}};
}
test('Cloudflare-Weiterleitung ohne .html zählt 3 → 2 → 1 → 0 auf allen Menüebenen',()=>{
  const f=fixture();assert.equal(f.count(),3);
  ids.forEach((id,i)=>{
    f.select(id);f.load();const left=2-i;assert.equal(f.count(),left);
    for(const name of ['clubChessMenuBtn','tournamentReportToolBtn'])assert.equal(f.button(name).children[0].hidden?0:Number(f.button(name).children[0].textContent),left);
    for(const b of f.mobile)assert.equal(b.children[0].hidden?0:Number(b.children[0].textContent),left);
    assert.equal(f.leaves[i].children[0].hidden,true);f.load();assert.equal(f.count(),left);
  });
});
test('Lokale .html-Adressen werden weiterhin erkannt',()=>{
  const f=fixture();f.select(ids[0],'https://gamer.example/SchachNews/'+ids[0]+'.html?embedded=1');f.load();assert.equal(f.count(),2);
});
test('Turnierbericht mit index.html passt zur Verzeichnisadresse',()=>{
  const f=fixture();f.context.schachCurrentCategory='reports';f.context.TOURNAMENT_REPORTS.example.notify=true;
  f.article.URL='https://gamer.example/Turnierberichte/example/index.html';f.article.body.dataset={articleReadKey:'report:example'};f.load();
  assert.equal(f.button('tournamentReportsCategoryBtn').children[0].hidden,true);
  assert.equal(f.button('clubChessMenuBtn').children[0].textContent,'3');
  assert.deepEqual(JSON.parse([...f.disk.values()][0]).read,['report:example']);
});
test('Verdeckte oder noch ladende Berichte werden nicht als gelesen markiert',()=>{
  for(const modify of [f=>f.doc.hidden=true,f=>f.context.tournamentReportToolActive=false,f=>f.context.tournamentReportToolView.hidden=true,f=>f.article.readyState='loading']){
    const f=fixture();f.select(ids[0],'https://gamer.example/SchachNews/'+ids[0]+'.html');modify(f);f.load();assert.equal(f.count(),3);
  }
});
test('Altes Dokument, Fehlerseiten und falsche Artikelkennung bleiben ungelesen',()=>{
  for(const modify of [f=>f.article.URL='https://gamer.example/SchachNews/'+ids[1],f=>f.article.querySelector=()=>null,f=>f.article.body.dataset={},f=>f.article.body.dataset={newsId:ids[1]},f=>f.article.URL='https://foreign.example/SchachNews/'+ids[0]]){
    const f=fixture();f.select(ids[0],'https://gamer.example/SchachNews/'+ids[0]+'.html');modify(f);f.load();assert.equal(f.count(),3);
  }
});
