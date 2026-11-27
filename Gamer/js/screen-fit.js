'use strict';

// Layout zoom belongs to the outer Gamer. Embedded tools keep their own
// document coordinates, including their existing figure and animation layers.
window.HammerschachScreenFit = (() => {
  const root = document.documentElement;
  const baseWidth = 1100;
  const growthStartsAt = 1400;
  const fullHdWidth = 1920;
  const maxWidth = 1540;
  let enabled = false;
  let scale = 1;
  let revision = 0;
  let frame = 0;
  const observer = new ResizeObserver(schedule);
  const views = new MutationObserver(schedule);

  let visibleHostHeight = 0;
  let hostObserver;
  function observeHostViewport() {
    if (parent === window) return;
    try {
      void parent.innerHeight;
      parent.addEventListener('resize', schedule);
      return;
    } catch (_) { /* A different origin exposes only the visible intersection. */ }
    if (!window.IntersectionObserver) return;
    let previousTop;
    hostObserver = new IntersectionObserver(([entry]) => {
      const visible = entry.intersectionRect;
      if (!enabled || !entry.isIntersecting || visible.height <= 0) return;
      // Near the end of an auto-height frame the visible slice gets smaller
      // merely by scrolling past it. Do not shrink the page underneath the reader.
      const movingPastEnd = previousTop !== undefined && visible.top > previousTop + 1
        && visible.bottom >= entry.boundingClientRect.bottom - 1;
      previousTop = visible.top;
      if (movingPastEnd) return;
      const height = Math.floor(visible.height);
      if (height !== visibleHostHeight) {
        visibleHostHeight = height;
        schedule();
      }
    }, {threshold:Array.from({length:201}, (_, i) => i / 200)});
    hostObserver.observe(root);
  }

  function viewportHeight() {
    if (window === window.parent) return window.innerHeight;
    // An auto-height iframe measures its content, not the browser window.
    try { return Math.min(innerHeight, parent.innerHeight); }
    catch (_) { return visibleHostHeight; }
  }

  // A user can scroll to the board. Measure only the span of the visible
  // playing area and its controls, in the layout pixels of its own document.
  function playAreaHeight(doc, selectors, zoom) {
    let top = Infinity, bottom = -Infinity;
    for (const el of doc.querySelectorAll(selectors)) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
    }
    return bottom > top ? (bottom - top) / zoom + 12 : 0;
  }

  function update() {
    frame = 0;
    const width = root.clientWidth;
    let next = 1;
    if (enabled && width > growthStartsAt && CSS.supports('zoom', 'calc(1 / 1.25)')) {
      const shell = document.querySelector('.shell');
      const designWidth = Math.max(baseWidth, shell.offsetWidth);
      let designHeight = 770;
      for (const area of [
        '.top-layout .board-wrapper, .top-layout #boardPlayerTop, .top-layout .board-tools',
        '#localGameRoom .local-game-table',
        '.shell #liveBoardView .lb-grid, .shell #liveBoardView .lb-pages, .shell #liveBoardView .lb-single .lb-board-column'
      ]) {
        designHeight = Math.max(designHeight, playAreaHeight(document, area, scale));
      }
      for (const iframe of document.querySelectorAll('.shell iframe[data-src]')) {
        if (!iframe.getClientRects().length) continue;
        const doc = iframe.contentDocument;
        if (!doc?.querySelector('#board, #chessBoard')?.getClientRects().length) continue;
        designHeight = Math.max(designHeight, playAreaHeight(doc,
          '#board, #chessBoard, .board-tools, .board-column .controls, .board-toolbar, #mateMoveBtn, .board-column .clock-card', 1));
      }
      // At 1400 px the centered Gamer has 150 px on each side. From there,
      // both content and margins grow, reaching 1540 + 2 × 190 at Full HD.
      const progress = Math.min(1, (width - growthStartsAt) / (fullHdWidth - growthStartsAt));
      const contentWidth = baseWidth + progress * (maxWidth - baseWidth);
      const heightLimit = Math.floor(1000 * viewportHeight() / designHeight) / 1000;
      next = Math.max(1, Math.min(contentWidth / designWidth, heightLimit));
    }
    if (next === scale) return;
    scale = next;
    revision++;
    if (scale > 1) root.style.setProperty('--gamer-screen-scale', String(scale));
    else root.style.removeProperty('--gamer-screen-scale');
    root.classList.toggle('gamer-screen-fit', scale > 1);
    window.dispatchEvent(new Event('hammerschach:screen-scale'));
    if (typeof hammerschachScheduleHeightReport === 'function') hammerschachScheduleHeightReport(true);
  }

  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(update);
  }

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    revision++;
    if (enabled) {
      observeHostViewport();
      for (const el of document.querySelectorAll('.shell, .header, .board-column, .board-tools')) observer.observe(el);
      views.observe(root, {attributes:true, attributeFilter:['class']});
      window.addEventListener('resize', schedule);
      document.addEventListener('load', schedule, true);
      window.addEventListener('hammerschach:board-size-change', schedule);
    } else {
      hostObserver?.disconnect();
      visibleHostHeight = 0;
      if (parent !== window) {
        try { parent.removeEventListener('resize', schedule); } catch (_) {}
      }
      observer.disconnect();
      views.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('load', schedule, true);
      window.removeEventListener('hammerschach:board-size-change', schedule);
    }
    window.dispatchEvent(new Event('hammerschach:screen-fit-mode'));
    cancelAnimationFrame(frame);
    update();
  }
  window.addEventListener('hammerschach:screen-fit-preference', () => {
    setEnabled(window.HammerschachSettings?.screenFitActive() === true);
  });
  return {get enabled() { return enabled; }, get scale() { return scale; },
    get revision() { return revision; }};
})();
