'use strict';

/*
  Einbettungsmodus:
  Dieselbe HTML-Datei funktioniert sowohl als eigenständige Seite als auch
  innerhalb eines iFrames. Weitere iFrame-spezifische Funktionen dürfen
  ausschließlich von HAMMERSCHACH_IS_EMBEDDED abhängig gemacht werden.
*/
const HAMMERSCHACH_IS_EMBEDDED = window.self !== window.top;
document.documentElement.classList.toggle('hammerschach-embedded', HAMMERSCHACH_IS_EMBEDDED);
document.documentElement.classList.toggle('hammerschach-standalone', !HAMMERSCHACH_IS_EMBEDDED);
document.documentElement.dataset.displayMode = HAMMERSCHACH_IS_EMBEDDED ? 'embedded' : 'standalone';

/*
  Automatische iFrame-Höhe:
  Nur im eingebetteten Modus meldet der Gamer seine tatsächliche Inhaltshöhe
  an eine übergeordnete Andili-Seite. Beim direkten Aufruf bleibt diese Logik
  vollständig inaktiv.
*/
const HAMMERSCHACH_RESIZE_MESSAGE_TYPE = 'hammerschach-resize';
const HAMMERSCHACH_RESIZE_REQUEST_TYPE = 'hammerschach-resize-request';
let hammerschachResizeFrame = 0;
let hammerschachLastReportedHeight = 0;

function hammerschachIsAllowedParentOrigin(origin){
  try{
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (hostname === 'andili.de' || hostname.endsWith('.andili.de'));
  } catch(_){
    return false;
  }
}
function hammerschachParentOrigins(){
  const origins = new Set(['https://www.andili.de', 'https://andili.de']);
  try{
    const referrerOrigin = new URL(document.referrer).origin;
    if(hammerschachIsAllowedParentOrigin(referrerOrigin)) origins.add(referrerOrigin);
  } catch(_){ }
  return Array.from(origins);
}
function hammerschachMeasureContentHeight(){
  const app = document.querySelector('.app');
  const shell = document.querySelector('.shell');
  const appHeight = app ? Math.max(app.scrollHeight, Math.ceil(app.getBoundingClientRect().height)) : 0;
  const shellHeight = shell ? Math.max(shell.scrollHeight, Math.ceil(shell.getBoundingClientRect().height)) : 0;
  return Math.max(1, Math.ceil(Math.max(appHeight, shellHeight) + 2));
}
function hammerschachReportHeight(force){
  if(!HAMMERSCHACH_IS_EMBEDDED) return;
  const height = hammerschachMeasureContentHeight();
  if(!force && Math.abs(height - hammerschachLastReportedHeight) < 2) return;
  hammerschachLastReportedHeight = height;
  const message = {
    type: HAMMERSCHACH_RESIZE_MESSAGE_TYPE,
    height,
    displayMode: 'embedded'
  };
  hammerschachParentOrigins().forEach(origin => {
    try{ window.parent.postMessage(message, origin); } catch(_){ }
  });
}
function hammerschachScheduleHeightReport(force){
  if(!HAMMERSCHACH_IS_EMBEDDED) return;
  if(hammerschachResizeFrame) cancelAnimationFrame(hammerschachResizeFrame);
  hammerschachResizeFrame = requestAnimationFrame(() => {
    hammerschachResizeFrame = 0;
    hammerschachReportHeight(!!force);
  });
}
function hammerschachInitIframeHeightReporting(){
  if(!HAMMERSCHACH_IS_EMBEDDED) return;
  const app = document.querySelector('.app');
  const shell = document.querySelector('.shell');

  if('ResizeObserver' in window){
    const observer = new ResizeObserver(() => hammerschachScheduleHeightReport(false));
    if(app) observer.observe(app);
    if(shell) observer.observe(shell);
  } else if('MutationObserver' in window && app){
    const observer = new MutationObserver(() => hammerschachScheduleHeightReport(false));
    observer.observe(app, {subtree:true, childList:true, attributes:true});
  }

  window.addEventListener('resize', () => hammerschachScheduleHeightReport(false), {passive:true});
  window.addEventListener('load', () => hammerschachScheduleHeightReport(true), {once:true});
  window.addEventListener('message', event => {
    if(event.source !== window.parent || !hammerschachIsAllowedParentOrigin(event.origin)) return;
    if(event.data && event.data.type === HAMMERSCHACH_RESIZE_REQUEST_TYPE){
      hammerschachScheduleHeightReport(true);
    }
  });

  hammerschachScheduleHeightReport(true);
  setTimeout(() => hammerschachScheduleHeightReport(true), 120);
  setTimeout(() => hammerschachScheduleHeightReport(true), 700);
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(() => hammerschachScheduleHeightReport(true)).catch(() => {});
  }
}
hammerschachInitIframeHeightReporting();
