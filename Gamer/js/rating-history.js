'use strict';

// Shared by account, member profile and player preview. Fetch only on demand.
function createRatingHistoryButton(member, info, rating, className){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = (className || 'auth-rating-value') + ' rating-history-link';
  button.textContent = rating.display;
  button.title = info.label + ': Ratingverlauf ansehen';
  button.setAttribute('aria-label', info.label + ': ' + rating.display + ' – Ratingverlauf ansehen');
  button.addEventListener('click', () => {
    const user = typeof member === 'function' ? member() : member;
    if(user && user.id) RatingHistory.open(user, info);
  });
  return button;
}

const RatingHistory = (() => {
  let dialog, chart, message, detail, slider, older, retry, rangeButtons, heading, caption;
  let member, info, opener, controller, requestId = 0, points = [], nextOffset = null, snapshot = null;
  let range = 'all', selected = 0, geometry, resizeObserver, restoreParents = [], viewerId = '';
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if(cls) el.className = cls;
    if(text !== undefined) el.textContent = text;
    return el;
  };
  const date = (at, time) => new Date(at).toLocaleString('de-DE', time
    ? {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}
    : {day:'2-digit', month:'2-digit', year:'2-digit'});
  function ensureDialog(){
    if(dialog) return;
    dialog = node('div', 'identity-backdrop rating-history-backdrop');
    dialog.hidden = true;
    dialog.innerHTML = '<section class="identity-modal rating-history-modal" role="dialog" aria-modal="true" aria-labelledby="ratingHistoryTitle">' +
      '<div class="rating-history-head"><div><h3 id="ratingHistoryTitle"></h3><p id="ratingHistoryCaption"></p></div><button type="button" class="button-flat rating-history-close" aria-label="Ratingverlauf schließen">×</button></div>' +
      '<div class="rating-history-ranges" role="group" aria-label="Zeitraum"></div>' +
      '<p class="rating-history-status" role="status"></p><div class="rating-history-chart"></div>' +
      '<div class="rating-history-detail" aria-live="polite"></div>' +
      '<label class="rating-history-slider-label">Einzelne Wertung auswählen<input type="range" min="0" value="0" step="1" aria-label="Wertung im Verlauf auswählen"></label>' +
      '<div class="rating-history-actions"><button type="button" class="button-flat rating-history-older" hidden>Ältere Wertungen laden</button><button type="button" class="button-flat rating-history-retry" hidden>Erneut versuchen</button><button type="button" class="button-flat rating-history-done">Zurück</button></div></section>';
    document.body.appendChild(dialog);
    chart = dialog.querySelector('.rating-history-chart');
    heading = dialog.querySelector('h3'); caption = dialog.querySelector('#ratingHistoryCaption');
    message = dialog.querySelector('.rating-history-status'); detail = dialog.querySelector('.rating-history-detail');
    slider = dialog.querySelector('input'); older = dialog.querySelector('.rating-history-older');
    retry = dialog.querySelector('.rating-history-retry');
    rangeButtons = [['3m','3 Monate'],['1y','1 Jahr'],['3y','3 Jahre'],['all','Gesamt']].map(([key,label]) => {
      const button = node('button','button-flat',label); button.type = 'button'; button.dataset.range = key;
      button.addEventListener('click', () => { range = key; load(false); });
      dialog.querySelector('.rating-history-ranges').appendChild(button);
      return button;
    });
    dialog.querySelector('.rating-history-close').addEventListener('click', close);
    dialog.querySelector('.rating-history-done').addEventListener('click', close);
    dialog.addEventListener('click', event => { if(event.target === dialog) close(); });
    slider.addEventListener('input', () => select(Number(slider.value)));
    older.addEventListener('click', () => load(true));
    retry.addEventListener('click', () => load(points.length > 0 && nextOffset !== null));
    chart.addEventListener('pointermove', event => { if(event.pointerType === 'mouse') selectAt(event); });
    chart.addEventListener('click', selectAt);
    document.addEventListener('keydown', event => {
      if(dialog.hidden) return;
      if(event.key === 'Escape'){ event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if(event.key === 'Tab'){
        const controls = [...dialog.querySelectorAll('button, input')].filter(el => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
        else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
      }
    }, true);
    resizeObserver = new ResizeObserver(() => { if(!dialog.hidden && points.length) draw(); });
    resizeObserver.observe(chart);
    window.addEventListener('hammerschach:auth-change', () => {
      if(!dialog.hidden && (!onlineAuthToken || !onlineAuthUser || onlineAuthUser.id !== viewerId)) close();
    });
  }
  function close(){
    if(!dialog || dialog.hidden) return;
    requestId++;
    if(controller) controller.abort();
    dialog.hidden = true;
    restoreParents.forEach(([el, inert]) => { el.inert = inert; });
    restoreParents = [];
    points = []; chart.replaceChildren(); detail.textContent = '';
    if(opener && opener.isConnected && opener.getClientRects().length) opener.focus({preventScroll:true});
  }
  function open(user, type){
    if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
    ensureDialog();
    if(!dialog.hidden) close();
    opener = document.activeElement;
    // The hover preview vanishes; return focus to its original name link.
    if(opener && opener.closest('.member-hovercard')) opener = document.querySelector('[aria-describedby~="memberHovercard"]') || opener;
    MemberHovercard.hide();
    viewerId = onlineAuthUser.id;
    member = {id:user.id, username:user.username || 'Mitglied'}; info = type; range = 'all';
    heading.textContent = info.label + ' · Ratingverlauf';
    caption.textContent = member.username;
    restoreParents = [...document.body.children].filter(el => el !== dialog && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    restoreParents.forEach(([el]) => { el.inert = true; });
    dialog.hidden = false;
    load(false);
    dialog.querySelector('.rating-history-close').focus();
  }
  async function load(append){
    const id = ++requestId;
    if(controller) controller.abort();
    controller = new AbortController();
    const local = controller;
    const timeout = setTimeout(() => local.abort(), 20000);
    if(!append){ points = []; nextOffset = null; snapshot = null; chart.replaceChildren(); detail.textContent = ''; }
    geometry = null;
    slider.parentElement.hidden = !points.length;
    message.textContent = 'Wertungen werden geladen …';
    older.disabled = true; retry.hidden = true;
    rangeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === range)));
    try {
      const params = new URLSearchParams({type:info.key, range});
      if(append){ params.set('offset', String(nextOffset)); params.set('snapshot', String(snapshot)); }
      const data = await authApi('/api/members/' + encodeURIComponent(member.id) + '/rating-history?' + params, {signal:local.signal, cache:'no-store'});
      if(id !== requestId || dialog.hidden) return;
      if(!Array.isArray(data.points)) throw new Error('Ungültige Verlaufsdaten.');
      const loaded = data.points.filter(p => Number.isFinite(Date.parse(p.at)) && Number.isFinite(p.rating) && Number.isFinite(p.before));
      points = append ? loaded.concat(points) : loaded;
      nextOffset = data.nextOffset; snapshot = data.snapshot;
      older.hidden = nextOffset === null;
      slider.parentElement.hidden = points.length < 2;
      slider.max = String(Math.max(0, points.length - 1));
      selected = points.length - 1;
      caption.textContent = (data.member?.username || member.username) + ' · ' + info.label;
      message.textContent = points.length
        ? points.length + ' von ' + data.total + ' Wertungen' + (nextOffset !== null ? ' · Ältere Einträge können nachgeladen werden.' : ' · Nach jeder gewerteten Partie.')
        : range === 'all' ? 'Noch keine gewertete Partie. Sobald eine Partie gewertet wurde, erscheint hier der Verlauf.' : 'In diesem Zeitraum wurde keine Partie gewertet. Wähle einen längeren Zeitraum.';
      draw();
    } catch(error){
      if(id !== requestId || dialog.hidden) return;
      message.textContent = error.name === 'AbortError' ? 'Das Laden dauert zu lange. Bitte versuche es erneut.' : error.message || 'Der Verlauf konnte nicht geladen werden.';
      retry.hidden = false;
      if(points.length) draw();
    } finally {
      clearTimeout(timeout);
      if(id === requestId) older.disabled = false;
    }
  }
  function svgNode(tag, attributes, text){
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes || {}).forEach(([key,value]) => el.setAttribute(key, String(value)));
    if(text !== undefined) el.textContent = text;
    return el;
  }
  function draw(){
    chart.replaceChildren(); geometry = null;
    if(!points.length) return;
    const width = Math.max(280, chart.clientWidth), height = 300;
    const left = 48, right = width - 16, top = 20, bottom = 254;
    let min = Infinity, max = -Infinity;
    points.forEach(p => { min = Math.min(min,p.rating); max = Math.max(max,p.rating); });
    const step = Math.max(10, Math.ceil((max - min + 20) / 5 / 10) * 10);
    min = Math.floor((min - 10) / step) * step; max = Math.ceil((max + 10) / step) * step;
    const start = Date.parse(points[0].at), end = Date.parse(points[points.length - 1].at);
    const coords = points.map(p => ({x:end === start ? (left + right) / 2 : left + (Date.parse(p.at) - start) / (end - start) * (right - left), y:bottom - (p.rating - min) / (max - min) * (bottom - top)}));
    const svg = svgNode('svg', {viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-label':info.label + ': ' + points.length + ' Wertungen von ' + date(points[0].at) + ' bis ' + date(points[points.length - 1].at)});
    for(let v = min; v <= max; v += step){
      const y = bottom - (v - min) / (max - min) * (bottom - top);
      svg.append(svgNode('line',{x1:left,x2:right,y1:y,y2:y,class:'rating-chart-grid'}),svgNode('text',{x:left-9,y:y+4,'text-anchor':'end',class:'rating-chart-label'},v));
    }
    const path = coords.map((p,i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
    if(coords.length > 1){
      svg.appendChild(svgNode('path',{d:path + ` L${coords[coords.length-1].x},${bottom} L${coords[0].x},${bottom} Z`,class:'rating-chart-area'}));
      svg.appendChild(svgNode('path',{d:path,class:'rating-chart-line'}));
    }
    [0, ...(width > 550 && points.length > 2 ? [Math.floor((points.length - 1) / 2)] : []), ...(end !== start ? [points.length - 1] : [])].forEach((index, i, all) => {
      svg.appendChild(svgNode('text',{x:coords[index].x,y:281,'text-anchor':all.length === 1 ? 'middle' : i === 0 ? 'start' : i === all.length-1 ? 'end' : 'middle',class:'rating-chart-label'}, date(points[index].at)));
    });
    const marker = svgNode('circle',{r:5,class:'rating-chart-marker'});
    svg.appendChild(marker); chart.appendChild(svg);
    geometry = {coords, marker, svg, width};
    select(selected);
  }
  function select(index){
    if(!points.length || !geometry) return;
    selected = Math.max(0, Math.min(points.length-1, index));
    const p = points[selected], xy = geometry.coords[selected], delta = p.rating - p.before;
    const provisional = p.deviation > RATING_PROVISIONAL_DEVIATION;
    geometry.marker.setAttribute('cx', xy.x); geometry.marker.setAttribute('cy', xy.y);
    const text = date(p.at,true) + ' · ' + p.before + ' → ' + p.rating + (provisional ? '?' : '') + ' · ' + (delta > 0 ? '+' : '') + delta + ' Punkte';
    detail.textContent = text + (provisional ? ' · vorläufig' : '');
    slider.value = String(selected); slider.setAttribute('aria-valuetext', text);
  }
  function selectAt(event){
    if(!geometry) return;
    const box = geometry.svg.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * geometry.width;
    let nearest = 0;
    geometry.coords.forEach((p,i) => { if(Math.abs(p.x-x) < Math.abs(geometry.coords[nearest].x-x)) nearest = i; });
    select(nearest);
  }
  return {open, close};
})();
