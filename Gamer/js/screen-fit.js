'use strict';

// Layout zoom belongs to the outer Gamer. Embedded tools keep their own
// document coordinates, including their existing figure and animation layers.
window.HammerschachScreenFit = (() => {
  const root = document.documentElement;
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

  function update() {
    frame = 0;
    const width = root.clientWidth;
    let next = 1;
    if (enabled && width > 1100 && CSS.supports('zoom', 'calc(1 / 1.25)')) {
      const shell = document.querySelector('.shell');
      const designWidth = Math.max(1100, shell.offsetWidth);
      let designHeight = 770;
      // Reserve room for the whole board, player strips and the controls below.
      for (const selector of ['.board-column .board-tools', '#localGameRoom .local-game-footer',
        '.shell #liveBoardView .lb-pages', '.shell #liveBoardView .lb-single .lb-board-column']) {
        const controls = document.querySelector(selector);
        if (controls?.getClientRects().length) {
          designHeight = Math.max(designHeight, (controls.getBoundingClientRect().bottom + scrollY) / scale + 12);
        }
      }
      for (const iframe of document.querySelectorAll('.shell iframe[data-src]')) {
        if (!iframe.getClientRects().length) continue;
        const board = iframe.contentDocument?.getElementById('board');
        if (!board?.getClientRects().length) continue;
        const top = (iframe.getBoundingClientRect().top + scrollY) / scale;
        designHeight = Math.max(designHeight, top + board.getBoundingClientRect().bottom + iframe.contentWindow.scrollY + 58);
      }
      next = Math.max(1, Math.min(1.4, 1540 / designWidth,
        (width - 24) / designWidth, viewportHeight() / designHeight));
      next = Math.floor(next * 1000) / 1000;
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
    cancelAnimationFrame(frame);
    update();
  }
  window.addEventListener('hammerschach:screen-fit-preference', () => {
    setEnabled(window.HammerschachSettings?.screenFitActive() === true);
  });
  return {get enabled() { return enabled; }, get scale() { return scale; },
    get revision() { return revision; }};
})();
