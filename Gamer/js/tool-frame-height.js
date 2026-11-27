'use strict';

// Player and Analyzer both send height messages to the surrounding Gamer.
// In automatic mode the assigned frame height must never become input to its
// next measurement (document.scrollHeight includes the viewport itself).
function installToolFrameHeight(shell, sendHeight) {
  let automatic = false;
  let lastHeight = 0;
  function report() {
    if (!automatic) {
      sendHeight(Math.ceil(document.documentElement.scrollHeight));
      return;
    }
    if (!shell.offsetHeight) return;
    const endMargin = parseFloat(getComputedStyle(shell).marginBottom) || 0;
    const height = Math.ceil(shell.offsetTop + shell.offsetHeight + endMargin);
    if (height === lastHeight) return;
    lastHeight = height;
    sendHeight(height);
  }
  const observer = window.ResizeObserver ? new ResizeObserver(report) : null;
  observer?.observe(document.body);
  window.addEventListener('message', event => {
    if (parent === window || event.source !== parent || event.origin !== location.origin ||
        event.data?.type !== 'hammerschach-board-size-state') return;
    const next = event.data.automatic === true;
    if (next === automatic) return;
    automatic = next;
    lastHeight = 0;
    observer?.disconnect();
    observer?.observe(automatic ? shell : document.body);
    report();
  });
  window.addEventListener('load', report);
  return report;
}
