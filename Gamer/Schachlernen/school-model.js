'use strict';
(function(root){
  function create(catalog){
    const courses=new Map(catalog.map(course=>[course.id,course]));
    const lessons=new Map(catalog.flatMap(course=>course.lessons.map(lesson=>[lesson.id,lesson])));
    const basic=courses.get('grundkurs');
    const publicIds=new Set(catalog.flatMap(course=>course.lessons.filter(lesson=>lesson.preview).map(lesson=>lesson.id)));
    const empty=()=>({version:2,completed:[],current:{},lastCourse:'grundkurs'});
    function clean(raw){
      const state=empty();
      if(!raw||typeof raw!=='object')return state;
      state.completed=Array.isArray(raw.completed)?[...new Set(raw.completed.filter(id=>typeof id==='string'&&lessons.has(id)))]:[];
      for(const course of catalog){
        const id=raw.current&&typeof raw.current==='object'?raw.current[course.id]:null;
        if(course.lessons.some(lesson=>lesson.id===id))state.current[course.id]=id;
      }
      if(courses.has(raw.lastCourse))state.lastCourse=raw.lastCourse;
      return state;
    }
    function migrate(legacy,visitor){
      const state=empty();
      if(!visitor&&legacy&&typeof legacy==='object'){
        const indices=Array.isArray(legacy.completed)?legacy.completed:[];
        state.completed=indices.filter(index=>Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<basic.lessons.length).map(index=>basic.lessons[Number(index)].id);
        const index=Number(legacy.current);
        if(Number.isInteger(index)&&basic.lessons[index])state.current.grundkurs=basic.lessons[index].id;
      }
      if(visitor){
        const saved=clean(visitor);
        state.completed.push(...saved.completed.filter(id=>publicIds.has(id)));
        Object.assign(state.current,saved.current);
        state.lastCourse=saved.lastCourse;
      }
      return clean(state);
    }
    function allowed(lesson,member){return !!lesson&&(member===true||publicIds.has(lesson.id));}
    function toggle(state,id,member){
      const next=clean(state);
      if(!allowed(lessons.get(id),member))return next;
      next.completed=next.completed.includes(id)?next.completed.filter(value=>value!==id):[...next.completed,id];
      return next;
    }
    function reset(state,courseId){
      const next=clean(state),course=courses.get(courseId);
      if(!course)return next;
      const ids=new Set(course.lessons.map(lesson=>lesson.id));
      next.completed=next.completed.filter(id=>!ids.has(id));
      next.current[courseId]=course.lessons[0].id;
      return next;
    }
    function route(hash){
      const legacy=String(hash).match(/^#lektion-(\d+)$/);
      if(legacy){const lesson=basic.lessons[Number(legacy[1])-1];return lesson?{courseId:'grundkurs',lessonId:lesson.id}:null;}
      const match=String(hash).match(/^#kurs\/([a-z]+)(?:\/([A-Za-z0-9_-]+))?$/);
      if(!match||!courses.has(match[1]))return null;
      const course=courses.get(match[1]);
      return {courseId:course.id,lessonId:course.lessons.some(lesson=>lesson.id===match[2])?match[2]:null};
    }
    return {clean,migrate,allowed,toggle,reset,route,publicIds};
  }
  const api={create};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HammerschachSchoolModel=api;
})(typeof window==='object'?window:globalThis);
