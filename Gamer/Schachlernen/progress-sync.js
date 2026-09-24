'use strict';
(function(root){
  function diff(before,after){
    const patch={};
    for(const id of new Set([...before.completed,...after.completed])){
      const value=after.completed.includes(id);
      if(value!==before.completed.includes(id))patch['done:'+id]=value;
    }
    for(const id of new Set([...Object.keys(before.current),...Object.keys(after.current)])){
      if(before.current[id]!==after.current[id])patch['current:'+id]=after.current[id]||null;
    }
    if(before.lastCourse!==after.lastCourse)patch.lastCourse=after.lastCourse;
    return patch;
  }
  function apply(state,patch,clean){
    const next=clean(state),done=new Set(next.completed);
    for(const [key,value] of Object.entries(patch)){
      if(key.startsWith('done:')){if(value===true)done.add(key.slice(5));else done.delete(key.slice(5));}
      else if(key.startsWith('current:')){if(value)next.current[key.slice(8)]=value;else delete next.current[key.slice(8)];}
      else if(key==='lastCourse')next.lastCourse=value;
    }
    next.completed=[...done];return clean(next);
  }
  function create({clean,request,storage,onState,onStatus}){
    let session=null;
    function read(s){if(!s.durable)return s.pending;try{return JSON.parse(storage.getItem(s.key)||'{}');}catch(_){return s.pending;}}
    function queue(s){return read(s)||{};}
    function persist(s,pending){s.pending=pending;try{storage.setItem(s.key,JSON.stringify(pending));s.durable=true;}catch(_){s.durable=false;}}
    function values(pending){return Object.fromEntries(Object.entries(pending).map(([k,e])=>[k,e.value]));}
    function record(before,after,explicit={}){
      const s=session;if(!s)return;
      const pending=queue(s);
      for(const [key,value] of Object.entries({...diff(before,after),...explicit}))pending[key]={value,id:Math.random().toString(36).slice(2)+Date.now()};
      persist(s,pending);onStatus('pending');flush();
    }
    async function flush(){
      const s=session;if(!s||s.busy)return;
      s.busy=true;onStatus('syncing');
      try{
        let remote=await request('GET',null,s.identity);
        if(session!==s)return;
        // Import the old browser state only when this account has no cloud state yet.
        if(remote.revision===0&&!s.imported){
          const imported=diff(clean(null),s.initial),pending=queue(s);
          for(const [key,value] of Object.entries(imported))if(!pending[key])pending[key]={value,id:'import:'+key};
          persist(s,pending);s.imported=true;
        }
        for(let attempt=0;attempt<4;attempt++){
          const batch=queue(s);
          if(!Object.keys(batch).length){onState(clean(remote.state));onStatus('synced');return;}
          const merged=apply(remote.state,values(batch),clean);
          const result=await request('POST',{revision:remote.revision,state:merged},s.identity);
          if(session!==s)return;
          if(result.conflict){remote=result;continue;}
          const latest=queue(s);
          for(const [key,entry] of Object.entries(batch))if(latest[key]&&latest[key].id===entry.id)delete latest[key];
          persist(s,latest);remote=result;
          onState(apply(remote.state,values(latest),clean));
          if(!Object.keys(latest).length){onStatus('synced');return;}
        }
        onStatus('pending');
      }catch(_){if(session===s)onStatus('offline');}
      finally{if(session===s)s.busy=false;}
    }
    function start(identity,initial){
      session=identity?{identity,initial:clean(initial),key:'hammerschachSchoolPendingV1:'+identity,pending:{},durable:true,busy:false,imported:false}:null;
      if(session)flush();else onStatus('local');
    }
    return {start,record,flush};
  }
  const api={create,diff,apply};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HammerschachProgressSync=api;
})(typeof window==='undefined'?globalThis:window);
