import { hsc08Logo } from './hsc08-logo.js';
export function hsc08Page() {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="css/gamer.css"><style>
html,body{margin:0;padding:0;display:block;min-height:0;background:transparent;color:inherit}*{box-sizing:border-box}main{max-width:1100px;margin:auto;padding:18px}h1{font-size:clamp(22px,4vw,32px)}.intro{display:flex;gap:20px;align-items:center}.intro img{width:110px;border-radius:16px}section{margin:18px 0;padding:18px;border:1px solid #a9884b66;border-radius:14px;background:var(--panel,#fff9ee)}label{display:block;margin:14px 0 6px}input,textarea,select{width:100%;font:inherit;padding:10px;min-height:44px}textarea{min-height:140px;resize:vertical}button{min-height:44px;cursor:pointer;margin:4px 4px 4px 0}button:disabled{cursor:not-allowed;opacity:.6}.actions{display:flex;flex-wrap:wrap;gap:8px}.notice{border-left:4px solid #b8860b;padding:12px;line-height:1.5}.description{white-space:pre-wrap;overflow-wrap:anywhere}li{overflow-wrap:anywhere;margin:8px 0}#message{padding:10px;white-space:pre-wrap}dialog{position:fixed;top:10px;bottom:auto;margin:0 auto;max-height:calc(100vh - 20px);overflow:auto;max-width:min(94vw,520px);border-radius:14px;padding:24px}dialog::backdrop{background:#0009}[hidden]{display:none!important}@media(max-width:480px){main{padding:10px}section{padding:12px}.intro img{width:78px}}
</style><body><main>
<div class="intro"><img src="${hsc08Logo}" alt="HSC08 – Schachabteilung"><div><div>HSC08 · Vereinsmeisterschaft</div><h1 id="heading">Vereinsmeisterschaft</h1><p>Privater Testbereich · Andili</p></div></div>
<div id="message" role="status" aria-live="polite"></div>
<div id="view"><section><h2>Ausschreibung</h2><div id="description" class="description"></div></section><section><h2>Runden und Paarungen</h2><p>Noch keine Runden. Die Turnierregeln sind noch nicht beschlossen.</p></section><section><h2>Teilnehmer</h2><ol id="participants"></ol><p id="emptyParticipants">Noch keine Teilnehmer.</p></section></div>
<form id="config" hidden><section><h2>Turnier konfigurieren</h2><label for="title">Titel</label><input id="title" maxlength="160" required><label for="mode">Modus</label><select id="mode" required><option value="">Bitte wählen</option><option value="round-robin">Rundenturnier</option><option value="swiss">Schweizer System</option></select><label for="descriptionInput">Ausschreibung / Beschreibung</label><textarea id="descriptionInput" maxlength="20000"></textarea><label for="names">Teilnehmer · ein Name pro Zeile, ohne Gamer-Konto</label><textarea id="names" placeholder="Vorname Nachname"></textarea><p class="notice">Entscheidungen offen: Paarungssystem, Feinwertungen, Freilose, kampflose Ergebnisse, Rückzüge und Rundenfreigabe. Auslosung und Ergebniseingabe sind bis zur Abstimmung gesperrt. Es wird keine vermeintliche Rangliste angezeigt.</p><div class="actions"><button type="submit">Entwurf speichern</button><button id="cancel" type="button">Zur Turnierseite</button></div></section></form>
<dialog id="deleteDialog"><form id="deleteForm"><h2>Turnier vollständig löschen</h2><p>Die gespeicherte Konfiguration, Ausschreibung und Teilnehmer werden unwiderruflich gelöscht. Die feste HSC08-Seite und ihre Navigation bleiben erhalten.</p><label for="password">Aktuelles Gamer-Passwort von Andili</label><input id="password" type="password" autocomplete="current-password" required maxlength="1024"><label for="confirmation">Zur Bestätigung TURNIER LÖSCHEN eingeben</label><input id="confirmation" required autocomplete="off"><p id="deleteError" role="alert"></p><button type="submit">Endgültig löschen</button><button id="deleteCancel" type="button">Abbrechen</button></form></dialog>
</main><script>(${client.toString()})();</script></body></html>`;
}
function client() {
  const $ = id => document.getElementById(id);
  let state = {revision:0,tournament:null}, busy = false;
  const api = (method, body) => parent.HammerschachHsc08.api('/championship', method, body);
  const message = text => { $('message').textContent = text; };
  function render() {
    const t = state.tournament;
    $('heading').textContent = t?.title || 'Vereinsmeisterschaft';
    $('description').textContent = t?.description || 'Diese Turnierseite ist noch leer.';
    $('participants').replaceChildren();
    for (const p of t?.participants || []) { const li=document.createElement('li');li.textContent=p.name;$('participants').append(li); }
    $('emptyParticipants').hidden = !!t?.participants.length;
  }
  window.hscMode = mode => {
    if (busy) return;
    const config = mode === 'config';
    if (!$('config').hidden && !config && !confirm('Konfiguration verlassen? Nicht gespeicherte Eingaben gehen verloren.')) return;
    $('view').hidden=config;$('config').hidden=!config;
    if (config) {const t=state.tournament;$('title').value=t?.title||'';$('mode').value=t?.mode||'';$('descriptionInput').value=t?.description||'';$('names').value=(t?.participants||[]).map(p=>p.name).join('\n');}
    $('heading').focus();
  };
  window.hscDelete = () => {if(busy)return;$('deleteError').textContent='';$('deleteForm').reset();$('deleteDialog').showModal();};
  $('cancel').onclick=()=>window.hscMode('view');
  $('deleteCancel').onclick=()=>{$('deleteForm').reset();$('deleteDialog').close();};
  $('deleteDialog').addEventListener('close',()=>$('deleteForm').reset());
  async function save(method,body) {
    busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {state=await api(method,{revision:state.revision,...body});render();return true;}
    catch(e){message(e.message);$('deleteError').textContent=e.message;return false;}
    finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  $('config').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const prior=[...(state.tournament?.participants||[])];
    const participants=$('names').value.split('\n').map(n=>n.trim()).filter(Boolean).map(name=>{const i=prior.findIndex(p=>p.name===name);return i<0?{id:crypto.randomUUID(),name}:prior.splice(i,1)[0];});
    if(await save('POST',{tournament:{title:$('title').value,mode:$('mode').value,description:$('descriptionInput').value,participants}})){
      $('config').hidden=true;$('view').hidden=false;message('Entwurf gespeichert. Die Turnierregeln sind weiterhin offen.');
    }
  };
  $('deleteForm').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const password=$('password').value;$('password').value='';
    if(await save('DELETE',{password,confirmation:$('confirmation').value})){$('deleteDialog').close();$('config').hidden=true;$('view').hidden=false;message('Turnier gelöscht. Die Seite ist wieder leer.');}
  };
  api('GET').then(data=>{state=data;render();}).catch(e=>message(e.message));
  new ResizeObserver(()=>parent.HammerschachHsc08.resize(document.querySelector('main').getBoundingClientRect().height + 24)).observe(document.querySelector('main'));
}
