'use strict';
window.NoticeAttachment = {
  async key(name) {
    const bytes = new TextEncoder().encode(name);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash.slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
  },
  link(anchor, name, published) {
    // A draft can point to an uploaded file before it appears on the public board.
    anchor.href = 'a/#!' + encodeURIComponent(name);
    if (published) this.key(name).then(key => { anchor.href = 'a/#' + key; });
  }
};
