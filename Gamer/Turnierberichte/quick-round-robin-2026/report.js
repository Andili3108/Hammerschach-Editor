(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const meta = document.getElementById('themeColorMeta');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[character]));
  const displayName = (value) => String(value ?? '').replace(/,(\S)/g, ', $1');

  function renderRoundResults() {
    const data = window.QRR2026_RESULTS || {};
    Object.entries(data).forEach(([group, rounds]) => {
      const groupElement = document.getElementById(`gruppe-${group.toLowerCase()}`);
      if (!groupElement) return;
      const section = document.createElement('section');
      section.className = 'round-results';
      section.setAttribute('aria-label', `Einzelergebnisse Gruppe ${group}`);
      section.innerHTML = `
        <div class="round-results-heading">
          <h3>Einzelergebnisse</h3>
          <span>${rounds.reduce((sum, round) => sum + round.games.length, 0)} Partien</span>
        </div>
        <div class="round-list">
          ${rounds.map((round) => `
            <details class="round-card">
              <summary><span>Runde ${round.round}</span><small>${round.games.length} Partien</small><span class="round-caret" aria-hidden="true">⌃</span></summary>
              <div class="round-table-scroll">
                <table class="round-table">
                  <thead><tr><th>Tisch</th><th>Weiß</th><th>Ergebnis</th><th>Schwarz</th></tr></thead>
                  <tbody>${round.games.map((game) => `
                    <tr><td>${game.board}</td><td>${escapeHtml(displayName(game.white))}</td><td class="game-score">${escapeHtml(game.result)}</td><td>${escapeHtml(displayName(game.black))}</td></tr>
                  `).join('')}</tbody>
                </table>
              </div>
            </details>
          `).join('')}
        </div>`;
      groupElement.append(section);
    });
  }

  function refreshThemeControls() {
    const dark = root.classList.contains('dark-mode');
    if (toggle) {
      toggle.textContent = dark ? '☀️' : '🌙';
      toggle.setAttribute('aria-label', dark ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren');
      toggle.title = dark ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren';
    }
    if (meta) meta.setAttribute('content', dark ? '#15171a' : '#843f46');
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      root.classList.toggle('dark-mode');
      try {
        localStorage.setItem('hammerschachGamerColorScheme', root.classList.contains('dark-mode') ? 'dark' : 'light');
      } catch (_) { }
      refreshThemeControls();
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'hammerschach-tournament-report-context') {
      root.classList.toggle('dark-mode', !!event.data.darkMode);
      refreshThemeControls();
    }
  });

  renderRoundResults();
  refreshThemeControls();
})();
