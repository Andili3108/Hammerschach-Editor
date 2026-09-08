/* Fit two complete move pairs to the actual list width, not a device breakpoint. */
(() => {
  'use strict';
  const selector = '#moveList, .variation-moves, .mv-table';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const observed = new Map();
  const measurements = new Map();
  let frame = 0;

  function textWidth(text, size, family) {
    const key = size + '|' + family + '|' + text;
    if (measurements.has(key)) return measurements.get(key);
    // Reserve the selected move's bold width for every move, so navigation
    // cannot change the column count. Include italic theme moves as well.
    context.font = '900 ' + size + 'px ' + family;
    const normal = context.measureText(text).width;
    context.font = 'italic 900 ' + size + 'px ' + family;
    const width = Math.ceil(Math.max(normal, context.measureText(text).width));
    if (measurements.size > 4000) measurements.clear();
    measurements.set(key, width);
    return width;
  }

  function fit(list) {
    if (!list.getClientRects().length || !list.clientWidth) return;
    const style = getComputedStyle(list);
    if (style.display !== 'grid') return;
    const cells = [...list.querySelectorAll(':scope > .move-cell:not(.move-result), :scope > .move-number, :scope > .variation-move-cell, :scope > .mv-row > .mv-num, :scope > .mv-row > .mv-cell')];
    if (!cells.length) return;
    // clientWidth excludes a visible scrollbar; padding is not usable by tracks.
    const available = list.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    const content = cells.map(cell => cell.textContent.trim());
    const key = available + '|' + gap + '|' + style.fontFamily + '|' + content.join('|');
    if (observed.get(list) === key) return;
    observed.set(list, key);

    function layout(columns, size) {
      const widths = Array(columns).fill(0);
      content.forEach((text, index) => {
        const column = index % columns;
        // Each cell has 3px padding on both sides, plus 2px rounding/outline room.
        widths[column] = Math.max(widths[column], textWidth(text, size, style.fontFamily) + 8);
      });
      for (let column = 0; column < columns; column += 3) {
        widths[column] = Math.max(widths[column], textWidth('10.', size, style.fontFamily) + 8);
      }
      // A slightly wider second number column separates the two move pairs.
      if (columns === 6) widths[3] += 4;
      return { columns, size, widths, required: widths.reduce((a, b) => a + b, 0) + gap * (columns - 1) };
    }

    let chosen;
    for (const size of [15, 14]) {
      const candidate = layout(6, size);
      if (candidate.required <= available) { chosen = candidate; break; }
    }
    if (!chosen) {
      chosen = layout(3, 15);
      if (chosen.required > available) chosen = layout(3, 14);
    }
    const tracks = chosen.widths.map((width, column) => column % 3 === 0
      ? width + 'px'
      : 'minmax(' + (chosen.required <= available ? width : 0) + 'px, 1fr)').join(' ');
    list.style.setProperty('--notation-columns', tracks);
    list.style.setProperty('--notation-font-size', chosen.size + 'px');
  }

  function update() {
    frame = 0;
    for (const list of observed.keys()) {
      if (!list.isConnected) { resizeObserver.unobserve(list); observed.delete(list); }
    }
    document.querySelectorAll(selector).forEach(list => {
      if (!observed.has(list)) { observed.set(list, null); resizeObserver.observe(list); }
      fit(list);
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  const resizeObserver = new ResizeObserver(schedule);
  // Renderers may replace a table or its text. Observe content only: changing
  // our own CSS variables must not cause another mutation/measurement loop.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule, { passive: true });
  if (document.fonts) document.fonts.ready.then(() => { measurements.clear(); observed.forEach((_, list) => observed.set(list, null)); schedule(); });
  schedule();
})();
