'use strict';
(() => {
  const panel = document.getElementById('christmasWelcome');
  const welcome = document.getElementById('visitorWelcome');
  const video = document.getElementById('christmasVideo');
  const consent = video.firstElementChild;
  const adminPanel = document.getElementById('seasonalAdmin');
  const backdrop = document.getElementById('adminOverviewBackdrop');
  const toggle = document.getElementById('christmasModeToggle');
  const status = document.getElementById('seasonalAdminStatus');
  // Reuse the existing fir artwork. Fit each branch only into measured free space.
  const headers = [...document.querySelectorAll('.shell > header')];
  const decorations = headers.map((header, headerIndex) => {
    const layer = document.createElement('div');
    layer.className = 'lobby-christmas-ornaments';
    layer.setAttribute('aria-hidden', 'true');
    for (const side of ['left', 'right']) {
      // Clone the complete visitor corner, including baubles and local gradients.
      // Unique IDs keep it independent of the hidden visitor panel in member view.
      const svg = panel.querySelector('.christmas-corner').cloneNode(true);
      const prefix = 'lobbyFir-' + headerIndex + '-' + side + '-';
      const ids = new Map([...svg.querySelectorAll('[id]')].map(el => [el.id, prefix + el.id]));
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        for (const attr of [...el.attributes]) {
          let value = attr.value;
          if (attr.name === 'id') value = ids.get(value);
          else for (const [id, replacement] of ids) {
            if (value === '#' + id) value = '#' + replacement;
            value = value.replaceAll('url(#' + id + ')', 'url(#' + replacement + ')');
          }
          el.setAttribute(attr.name, value);
        }
      }
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('class', 'lobby-christmas-branch');
      svg.dataset.side = side;
      svg.setAttribute('hidden', '');
      layer.append(svg);
    }
    header.append(layer);
    return {header, layer};
  });
  function fitHeaderBranches() {
    for (const {header, layer} of decorations) {
      const bounds = header.getBoundingClientRect();
      const occupied = [...header.querySelectorAll('a,button,img,.status,.online-panel,.mobile-nav-test-status,.mobile-nav-test-brand')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map(el => el.getBoundingClientRect());
      for (const branch of layer.children) {
        branch.setAttribute('hidden', '');
        if (!bounds.width || !document.documentElement.classList.contains('member-lobby-view')) continue;
        // Search inward from the corner, keeping clear of the logo, help and settings.
        for (const width of [150, 120, 90, 60]) {
          const height = width * 88 / 240;
          if (height + 8 > bounds.height) continue;
          let found = false;
          for (let inset = 8; inset <= Math.min(240, bounds.width / 3); inset += 8) {
            const left = branch.dataset.side === 'left' ? bounds.left + inset : bounds.right - inset - width;
            const top = bounds.top + 4;
            if (left < bounds.left + 4 || left + width > bounds.right - 4) continue;
            if (occupied.some(r => left < r.right + 4 && left + width > r.left - 4 && top < r.bottom + 4 && top + height > r.top - 4)) continue;
            branch.style.cssText = 'top:4px;left:' + (left - bounds.left) + 'px;width:' + width + 'px;height:' + height + 'px;' + (branch.dataset.side === 'right' ? 'transform:scaleX(-1)' : '');
            branch.removeAttribute('hidden');
            occupied.push({left, right:left + width, top, bottom:top + height});
            found = true;
            break;
          }
          if (found) break;
        }
      }
    }
  }
  let decorationFrame;
  function scheduleDecoration() {
    cancelAnimationFrame(decorationFrame);
    decorationFrame = requestAnimationFrame(fitHeaderBranches);
  }
  const headerResize = new ResizeObserver(scheduleDecoration);
  for (const {header} of decorations) {
    headerResize.observe(header);
    for (const child of header.querySelectorAll('button,a,.status')) headerResize.observe(child);
    new MutationObserver(records => {
      if (records.some(record => !record.target.closest?.('.lobby-christmas-ornaments'))) scheduleDecoration();
    }).observe(header, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','class']});
  }
  new MutationObserver(scheduleDecoration).observe(document.documentElement, {attributes:true, attributeFilter:['class']});
  window.addEventListener('resize', scheduleDecoration);
  document.fonts.ready.then(scheduleDecoration);
  let enabled = false, known = false, saving = false, revision = 0, loading = false;
  let visitorChoseAppearance = false;
  function syncVisitorAppearance() {
    const visible = !panel.hidden && panel.getClientRects().length > 0;
    window.HammerschachAppearance.setTemporarySoft(visible && !visitorChoseAppearance);
  }
  window.addEventListener('hammerschach:preferences-edit', ({detail}) => {
    if (detail.name === 'scheme' || detail.name === 'autoNight') {
      visitorChoseAppearance = true;
      syncVisitorAppearance();
    }
  });
  // Navigation can hide the lobby via an ancestor without hiding the card itself.
  new ResizeObserver(syncVisitorAppearance).observe(panel);
  function sync() {
    panel.hidden = !enabled || welcome.hidden;
    syncVisitorAppearance();
    if (panel.hidden && video.querySelector('iframe')) video.replaceChildren(consent);
    document.documentElement.classList.toggle('christmas-mode', enabled);
    adminPanel.hidden = !isCurrentUserAdmin();
    toggle.disabled = !known || saving;
    if (!saving) toggle.checked = enabled;
  }
  async function refresh() {
    sync();
    if (loading || saving || document.hidden) return;
    loading = true;
    const current = revision;
    try {
      const data = await authApi('/api/seasonal-design', {cache:'no-store'});
      if (current !== revision) return;
      if (typeof data.christmasEnabled !== 'boolean') throw new Error('Weihnachtsmodus noch nicht verfügbar. Bitte zuerst den aktualisierten Worker bereitstellen.');
      enabled = data.christmasEnabled; known = true;
      status.textContent = enabled ? 'Weihnachtsmodus ist eingeschaltet.' : 'Weihnachtsmodus ist ausgeschaltet.';
    } catch (error) {
      if (current === revision) status.textContent = error.message;
    } finally { loading = false; sync(); }
  }
  toggle.addEventListener('change', async () => {
    if (!isCurrentUserAdmin() || saving || !known) return sync();
    const requested = toggle.checked;
    saving = true; revision++; sync();
    status.textContent = 'Wird gespeichert …';
    try {
      const data = await authApi('/api/admin/seasonal-design', {method:'POST', body:JSON.stringify({christmasEnabled:requested})});
      if (typeof data.christmasEnabled !== 'boolean') throw new Error('Speichern konnte nicht bestätigt werden.');
      enabled = data.christmasEnabled;
      status.textContent = enabled ? 'Weihnachtsmodus für alle eingeschaltet.' : 'Weihnachtsmodus für alle ausgeschaltet.';
    } catch (error) { status.textContent = error.message; }
    finally { saving = false; sync(); }
  });
  document.getElementById('christmasVideoLoad').addEventListener('click', () => {
    if (panel.hidden) return;
    const frame = document.createElement('iframe');
    frame.title = "Boney M. – Mary's Boy Child (YouTube)";
    frame.src = 'https://www.youtube-nocookie.com/embed/cmm1gt_2SkQ';
    frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    video.replaceChildren(frame);
    frame.focus();
  });
  new MutationObserver(sync).observe(welcome, {attributes:true, attributeFilter:['hidden']});
  new MutationObserver(() => { sync(); if (!backdrop.hidden) refresh(); }).observe(backdrop, {attributes:true, attributeFilter:['hidden']});
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 30000);
  refresh();
})();
