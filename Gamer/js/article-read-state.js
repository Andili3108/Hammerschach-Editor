'use strict';
// Grow-only Lesestand: gleichzeitiges Lesen auf mehreren Geräten verliert keine Markierung.
(function(root){
  const PREFIX='hammerschachArticleReadsV1:';
  const valid=key=>typeof key==='string'&&/^(news|report):[a-z0-9][a-z0-9-]{0,79}$/.test(key);
  const clean=values=>Array.isArray(values)?[...new Set(values.filter(valid))].slice(0,1000):[];
  function create({storage,identity,request,onChange=()=>{}}){
    const memory=new Map();
    let current=null, sequence=0, activeJob=null;
    function scope(who){return who&&who.id&&who.token?'user:'+who.id:'visitor';}
    function readDisk(key){try{const value=JSON.parse(storage.getItem(PREFIX+key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}}
    function writeDisk(key,state){try{const value=JSON.stringify(state);if(storage.getItem(PREFIX+key)!==value)storage.setItem(PREFIX+key,value);}catch(_){}}
    function load(key){
      const disk=readDisk(key), old=memory.get(key)||{read:[],pending:[]};
      const state={read:clean([...old.read,...clean(disk.read)]),pending:clean([...old.pending,...clean(disk.pending)])};
      memory.set(key,state);return state;
    }
    function persist(){
      const disk=readDisk(current.key);
      current.state.read=clean([...current.state.read,...clean(disk.read)]);
      // pending wird vor dem Schreiben aus dem aktuellen Tab-Zustand genommen;
      // fremde neue Markierungen sind bereits über read erhalten und werden mitgesendet.
      if(current.key!=='visitor')current.state.pending=clean([...current.state.pending,...clean(disk.pending)]);
      memory.set(current.key,current.state);
      writeDisk(current.key,current.state);
      onChange(current.state.read);
    }
    function refreshIdentity(){
      const who=identity()||{}, key=scope(who);
      if(!current||current.key!==key||current.token!==(who.token||'')){
        sequence++;activeJob=null;
        current={key,token:who.token||'',state:load(key)};
        onChange(current.state.read);
      }
      return current;
    }
    function mark(key){
      refreshIdentity();if(!valid(key)||current.state.read.includes(key))return;
      current.state.read.push(key);
      if(current.key!=='visitor')current.state.pending.push(key);
      persist();void sync();
    }
    function sync(){
      refreshIdentity();if(current.key==='visitor')return Promise.resolve();
      if(activeJob)return activeJob;
      const version=sequence, token=current.token;
      const live=()=>sequence===version;
      const run=async()=>{
        try{
          const data=await request('GET',[],token);
          if(!live())return;
          current.state=load(current.key);
          const confirmed=new Set(clean(data.read));
          current.state.read=clean([...current.state.read,...confirmed]);
          // Ein lokaler Read, der serverseitig fehlt, ist nach Offline-Lesen nachzutragen.
          current.state.pending=current.state.read.filter(key=>!confirmed.has(key));
          while(live()&&current.state.pending.length){
            const sent=current.state.pending.slice(0,50);
            const result=await request('POST',sent,token);
            if(!live())return;
            const saved=new Set(clean(result.read));
            if(sent.some(key=>!saved.has(key)))throw new Error('Incomplete acknowledgement');
            current.state=load(current.key);
            current.state.read=clean([...current.state.read,...saved]);
            current.state.pending=current.state.read.filter(key=>!saved.has(key));
          }
          if(live()){
            memory.set(current.key,current.state);
            writeDisk(current.key,current.state);
            onChange(current.state.read);
          }
        }catch(_){if(live())onChange(current.state.read);}
      };
      const job=run();activeJob=job;
      job.finally(()=>{if(activeJob===job)activeJob=null;});
      return job;
    }
    function storageChanged(key){
      refreshIdentity();if(key!==null&&key!==PREFIX+current.key)return;
      current.state=load(current.key);onChange(current.state.read);
      void sync();
    }
    refreshIdentity();
    return {mark,sync,refreshIdentity,storageChanged,read:()=>refreshIdentity().state.read.slice()};
  }
  root.HammerschachArticleReadStore={create,PREFIX,valid};
})(typeof window==='undefined'?globalThis:window);
