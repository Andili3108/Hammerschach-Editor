(() => {
  'use strict';
  const toggle = document.getElementById('themeToggle');
  const meta = document.getElementById('themeColorMeta');
  const body = document.getElementById('standingsBody');
  const search = document.getElementById('standingsSearch');
  const count = document.getElementById('standingsCount');
  const toolbar = document.getElementById('standingsToolbar');
  const data = window.BBMM_2026_RESULTS?.standings;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const decimal = value => escapeHtml(String(value).replace('.', ','));

  function refreshThemeControls() {
    const scheme = window.HammerschachAppearance.current();
    toggle.textContent = {light:'◐',soft:'🌙',dark:'☀️'}[scheme];
    const label = {light:'Sanfte',soft:'Dunkle',dark:'Helle'}[scheme] + ' Darstellung aktivieren';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    meta.setAttribute('content', scheme === 'dark' ? '#15171a' : '#843f46');
  }

  function renderStandings() {
    const query = search.value.trim().toLocaleLowerCase('de');
    const filtered = data.filter(row => row.team.toLocaleLowerCase('de').includes(query));
    body.innerHTML = filtered.length ? filtered.map(row => {
      const classes = row.rank <= 3 ? `podium-row rank-${row.rank}` : '';
      return `<tr class="${classes}"><td class="rank-cell">${row.rank}</td><th scope="row" class="name-cell">${escapeHtml(row.team)}</th><td class="points-cell">${row.matchPoints}</td><td>${decimal(row.boardPoints)}</td><td>${decimal(row.sonnebornBerger)}</td></tr>`;
    }).join('') : '<tr class="empty-standings"><td colspan="5">Keine Mannschaft gefunden.</td></tr>';
    count.textContent = query ? `${filtered.length} Treffer` : `${data.length} von ${data.length}`;
  }

  // Der gesamte Bericht bleibt auch ohne Anmeldung und ohne JavaScript lesbar.
  if (Array.isArray(data) && data.length && body && search && toolbar) {
    toolbar.hidden = false;
    search.addEventListener('input', renderStandings);
  }
  toggle.addEventListener('click', () => window.HammerschachAppearance.cycle());
  window.addEventListener('hammerschach:appearance', refreshThemeControls);
  refreshThemeControls();
})();
