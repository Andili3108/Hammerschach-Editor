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
  let enabled = false, known = false, saving = false, revision = 0, loading = false;
  let visitorChoseAppearance = false;
  function syncVisitorAppearance() {
    const visible = !panel.hidden && panel.getClientRects().length > 0;
    window.HammerschachAppearance.setTemporaryDark(visible && !visitorChoseAppearance);
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
