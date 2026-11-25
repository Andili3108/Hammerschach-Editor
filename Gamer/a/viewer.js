'use strict';
(async () => {
  const preview = document.getElementById('preview');
  const hash = location.hash.slice(1);
  window.addEventListener('hashchange', () => location.reload());
  const types = new Map(Object.entries({
    pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
    webp:'image/webp', txt:'text/plain', pgn:'application/x-chess-pgn'
  }));
  async function resolveName() {
    if (hash.startsWith('!')) return decodeURIComponent(hash.slice(1));
    if (!/^[0-9a-f]{16}$/.test(hash)) throw Error('Dieser Anhanglink ist ungültig.');
    const saved = history.state?.attachment;
    if (saved && await NoticeAttachment.key(saved) === hash) return saved;
    const response = await fetch('https://hammerschach-hammerschach-lobby-worker.webmaster-5bb.workers.dev/api/notice-board', {cache:'no-store'});
    if (!response.ok) throw Error('Das Schwarze Brett ist derzeit nicht erreichbar.');
    const {items} = await response.json();
    const names = [...new Set(items.flatMap(item => item.files))];
    const keys = await Promise.all(names.map(name => NoticeAttachment.key(name)));
    const name = names[keys.indexOf(hash)];
    if (!name) throw Error('Dieser Anhang gehört zu keiner aktuellen öffentlichen Meldung.');
    return name;
  }
  try {
    const name = await resolveName();
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,149}$/u.test(name) || name.includes('..')) throw Error('Ungültiger Dateiname.');
    const type = types.get(name.split('.').pop().toLowerCase());
    if (!type) throw Error('Dieses Dateiformat wird derzeit nicht unterstützt.');
    history.replaceState({attachment:name}, '', '#' + await NoticeAttachment.key(name));
    document.title = name;
    document.getElementById('name').textContent = name;
    const url = '../SchwarzesBrett/anhaenge/' + encodeURIComponent(name);
    const download = document.getElementById('download');
    download.href = url;
    download.download = name;
    download.hidden = false;
    if (type.startsWith('image/')) {
      const image = new Image();
      image.alt = name;
      image.src = url;
      await image.decode();
      preview.replaceChildren(image);
    } else if (type === 'application/pdf') {
      const pdf = document.createElement('object');
      pdf.type = type;
      pdf.data = url;
      pdf.setAttribute('aria-label', name);
      pdf.textContent = 'Für diese Datei ist hier keine Vorschau verfügbar. Du kannst sie herunterladen.';
      preview.replaceChildren(pdf);
    } else {
      const response = await fetch(url);
      if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Die Textvorschau ist derzeit nicht verfügbar.');
      const text = document.createElement('pre');
      text.textContent = await response.text();
      preview.replaceChildren(text);
    }
  } catch (error) {
    preview.textContent = error.message;
  }
})();
