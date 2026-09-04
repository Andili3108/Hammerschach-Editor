(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const meta = document.getElementById('themeColorMeta');
  const visitorGate = document.getElementById('visitorReportGate');
  const visitorReturn = document.getElementById('visitorReportReturnBtn');
  const body = document.getElementById('standingsBody');
  const search = document.getElementById('standingsSearch');
  const count = document.getElementById('standingsCount');
  const showAllButton = document.getElementById('standingsToggle');
  const parentOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
  let standingsRendered = false;
  let showAll = false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[character]));
  const displayName = (value) => String(value || '').replace(',', ', ');
  const decimal = (value) => String(value || '—').replace('.', ',');

  function refreshThemeControls() {
    const dark = root.classList.contains('dark-mode');
    if (toggle) {
      toggle.textContent = dark ? '☀️' : '🌙';
      toggle.setAttribute('aria-label', dark ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren');
      toggle.title = dark ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren';
    }
    if (meta) meta.setAttribute('content', dark ? '#15171a' : '#843f46');
  }

  function rowMarkup(row) {
    const [rank,name,twz,w,d,l,points,buchholz,sb] = row;
    const classes = [rank <= 3 ? `podium-row rank-${rank}` : '', name === 'Brieger,Sebastian' ? 'district-row' : ''].filter(Boolean).join(' ');
    const medal = rank === 1 ? '🥇 ' : (rank === 2 ? '🥈 ' : (rank === 3 ? '🥉 ' : ''));
    const district = name === 'Brieger,Sebastian' ? '<span class="district-badge">Bezirksmeister</span>' : '';
    return `<tr class="${classes}"><td class="rank-cell">${rank}</td><td class="name-cell">${medal}${escapeHtml(displayName(name))}${district}</td><td>${escapeHtml(twz || '—')}</td><td>${w}</td><td>${d}</td><td>${l}</td><td class="points-cell">${decimal(points)}</td><td>${decimal(buchholz)}</td><td>${decimal(sb)}</td></tr>`;
  }

  function renderStandings() {
    if (!body) return;
    const data = Array.isArray(window.UNNA_OPEN_2025_STANDINGS) ? window.UNNA_OPEN_2025_STANDINGS : [];
    const query = String(search && search.value || '').trim().toLocaleLowerCase('de');
    const filtered = query ? data.filter((row) => displayName(row[1]).toLocaleLowerCase('de').includes(query)) : data;
    const visible = query || showAll ? filtered : filtered.slice(0, 20);
    body.innerHTML = visible.length ? visible.map(rowMarkup).join('') : '<tr class="empty-standings"><td colspan="9">Kein Spieler mit diesem Namen gefunden.</td></tr>';
    if (count) count.textContent = query ? `${visible.length} Treffer` : `${visible.length} von ${data.length}`;
    if (showAllButton) {
      showAllButton.hidden = !!query;
      showAllButton.textContent = showAll ? 'Nur Top 20 anzeigen' : `Alle ${data.length} anzeigen`;
      showAllButton.setAttribute('aria-pressed', showAll ? 'true' : 'false');
    }
    standingsRendered = true;
  }

  if (toggle) toggle.addEventListener('click', () => {
    root.classList.toggle('dark-mode');
    try { localStorage.setItem('hammerschachGamerColorScheme', root.classList.contains('dark-mode') ? 'dark' : 'light'); } catch (_) { }
    refreshThemeControls();
  });
  if (search) search.addEventListener('input', renderStandings);
  if (showAllButton) showAllButton.addEventListener('click', () => { showAll = !showAll; renderStandings(); });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'hammerschach-tournament-report-context') {
      const loggedIn = !!event.data.loggedIn;
      root.classList.toggle('dark-mode', !!event.data.darkMode);
      root.classList.toggle('visitor-preview', !loggedIn);
      if (visitorGate) visitorGate.hidden = loggedIn;
      if (loggedIn && !standingsRendered) renderStandings();
      refreshThemeControls();
    }
  });

  if (visitorReturn) visitorReturn.addEventListener('click', () => {
    if (window.parent && window.parent !== window) window.parent.postMessage({type:'hammerschach-tournament-report-return'}, parentOrigin);
    else window.location.href = '../../index.html';
  });

  if (root.classList.contains('hammerschach-standalone')) renderStandings();
  refreshThemeControls();
})();
