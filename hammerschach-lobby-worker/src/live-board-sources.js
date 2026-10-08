import {normalizeEvent,CLUB_SCOPES} from './live-board-classification.js';
// Source adapters return the same passive spectator format. No member data goes upstream.
const MAX_GAMES = 1000;
const MAX_PLIES = 1600;
const resultMap = {WHITEWIN:'1-0',WHITEFORFAIT:'1-0',BLACKWIN:'0-1',BLACKFORFAIT:'0-1',DRAW:'1/2-1/2'};
export const gameResult = value => resultMap[value] || (['1-0','0-1','1/2-1/2'].includes(value) ? value : '*');
const text = (v, max=160) => String(v ?? '').slice(0,max);

// Only deployment-configured HTTPS hosts; callers can never supply a fetch URL.
export function safeSourceUrl(value, allowedHosts) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || u.hash || !allowedHosts.includes(u.hostname)) throw new Error('Nicht freigegebene Quellenadresse.');
  if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(u.hostname) || /^\d+(\.\d+){3}$/.test(u.hostname)) throw new Error('Ungültiger Quellenhost.');
  return u.href;
}

export function sourceEvents(env) {
  const events = JSON.parse(env.LIVE_BOARD_EVENTS || '[]');
  const hosts = String(env.LIVE_BOARD_PGN_HOSTS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if (!Array.isArray(events) || events.length > 40) throw new Error('Ungültiger Veranstaltungskatalog.');
  const ids = new Set();
  return events.filter(e=>e.enabled !== false).map(e=>{
    if (!/^[a-z0-9_-]{1,64}$/.test(e.id) || ids.has(e.id) || !['club','tournament'].includes(e.category) || !e.title) throw new Error('Ungültige Veranstaltung.');
    ids.add(e.id);
    const s = e.source || {};
    let source;
    if (s.type === 'pgn') source = {type:s.type,url:safeSourceUrl(s.url,hosts)};
    else if (s.type === 'lichess' && /^[A-Za-z0-9]{8}$/.test(s.roundId)) source = {type:s.type,url:`https://lichess.org/api/broadcast/round/${s.roundId}.pgn`};
    else if (s.type === 'dgt' && /^[a-f0-9-]{32,36}$/i.test(s.tournamentId) && Number.isInteger(s.round) && s.round > 0 && s.round <= 100) source = {type:s.type,tournamentId:s.tournamentId.toLowerCase(),round:s.round};
    else if (s.type === 'demo' && env.LIVE_BOARD_DEMO === '1') source = {type:'demo'};
    else throw new Error('Unbekannte oder unvollständige Live-Quelle.');
    if(e.clubScope!==undefined&&!CLUB_SCOPES.includes(e.clubScope)&&e.clubScope!=='own')throw new Error('Ungültige Verbandsebene.');
    return normalizeEvent({id:e.id,clubScope:e.clubScope,title:text(e.title),category:e.category,round:text(e.round || s.round || ''),finished:e.finished === true,source});
  });
}

// PGN headers are recognized only outside comments/variations. A partial write is
// rejected instead of silently replacing a good cached round by a truncated one.
export function parseLivePgn(input) {
  const src = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g,'\n');
  const games=[];
  let tags={}, body='', inMoves=false, braces=0, variations=0, semicolon=false;
  const flush=()=>{
    if (!Object.keys(tags).length) { if(body.trim()) throw new Error('PGN ohne Kopfzeilen.'); return; }
    if (braces || variations) throw new Error('Unvollständiges PGN.');
    const parsed = parseMovetext(body, tags.FEN);
    if (!tags.White || !tags.Black || !parsed.termination) throw new Error('Unvollständige PGN-Partie.');
    const result = gameResult(parsed.termination);
    if (tags.Result && tags.Result !== parsed.termination) throw new Error('Widersprüchliches PGN-Ergebnis.');
    games.push({id:String(games.length+1),board:games.length+1,label:text(tags.Board || games.length+1,20),white:text(tags.White),black:text(tags.Black),round:text(tags.Round,40),result,finished:result!=='*',fen:text(tags.FEN,120),headers:Object.fromEntries(['Event','Site','Date','Round','WhiteElo','BlackElo','WhiteTitle','BlackTitle','WhiteTeam','BlackTeam','ECO','Opening','TimeControl'].filter(k=>tags[k]).map(k=>[k,text(tags[k])])),variant:text(tags.Variant || 'Standard',40),moves:parsed.moves,clocks:parsed.clocks});
    if(games.length>MAX_GAMES) throw new Error('Zu viele Partien.');
    tags={};body='';inMoves=false;
  };
  for (const line of src.split('\n')) {
    const header = !braces && !variations && line.match(/^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/);
    if(header){
      if(inMoves) flush();
      tags[header[1]]=header[2].replace(/\\(["\\])/g,'$1');
    } else {
      if(line.trim()) inMoves=true;
      body+=line+'\n';
      semicolon=false;
      for(const c of line){
        if(semicolon)continue;
        if(c===';'&&!braces){semicolon=true;continue;}
        if(c==='{')braces++;
        else if(c==='}')braces--;
        else if(!braces&&c==='(')variations++;
        else if(!braces&&c===')')variations--;
        if(braces<0||variations<0)throw new Error('Ungültiges PGN.');
      }
    }
  }
  flush();
  if(!games.length)throw new Error('Quelle enthält keine Partien.');
  return games;
}
function parseMovetext(body, fen) {
  let clean='',depth=0,comment='',inComment=false,semicolon=false;
  const clocks={white:null,black:null};
  let moves=[],termination='';
  const blackStarts=fen && /\sb\s/.test(fen);
  const push=()=>{
    const tokens=clean.replace(/\$\d+/g,' ').replace(/\d+\.(?:\.\.)?/g,' ').trim().split(/\s+/).filter(Boolean);
    clean='';
    for(const token of tokens){
      if(['*','1-0','0-1','1/2-1/2'].includes(token)){termination=token;continue;}
      if(token==='e.p.'||/^\.+$/.test(token))continue;
      if(termination)throw new Error('Züge nach Partieende.');
      if(!/^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|[O0]-[O0](?:-[O0])?)[+#?!]*$/.test(token))throw new Error('Ungültige Zugnotation.');
      moves.push(token);
      if(moves.length>MAX_PLIES)throw new Error('Zu viele Züge.');
    }
  };
  for(const c of body){
    if(semicolon){if(c==='\n')semicolon=false;continue;}
    if(inComment){
      if(c==='}'){
        inComment=false;
        if(!depth){const m=comment.match(/\[%clk\s+(\d{1,3}:\d{2}:\d{2}(?:\.\d+)?)\]/);if(m&&moves.length)clocks[((moves.length+(blackStarts?1:0))%2)?'white':'black']=m[1];}
      }else comment+=c;
      continue;
    }
    if(c===';'){if(!depth)push();semicolon=true;continue;}
    if(c==='{'){if(!depth)push();comment='';inComment=true;continue;}
    if(c==='('){if(!depth)push();depth++;continue;}
    if(c===')'){depth--;continue;}
    if(!depth)clean+=c;
  }
  push();return {moves,clocks,termination};
}

export function demoGames() {
  return Array.from({length:10},(_,i)=>({id:String(i+1),board:i+1,label:String(i+1),white:`Demo Weiß ${i+1}`,black:`Demo Schwarz ${i+1}`,round:'Testrunde',result:i>7?'1/2-1/2':'*',finished:i>7,fen:'',variant:'Standard',moves:['e4','e5','Nf3','Nc6','Bb5','a6'].slice(0,2+i%5),clocks:{white:'1:28:00',black:'1:27:30'}}));
}
const playerName=p=> typeof p==='string'?text(p):text(p?.name || [p?.fname,p?.lname].filter(Boolean).join(' ') || 'Unbekannt');
export function dgtPairings(data) {
  if(!Array.isArray(data.pairings)||data.pairings.length>MAX_GAMES)throw new Error('Ungültige DGT-Paarungen.');
  const ids=new Set();
  return data.pairings.map((p,i)=>{
    const board=Number.isInteger(p.index)?p.index+1:i+1;
    if(board<1||board>MAX_GAMES||ids.has(board))throw new Error('Ungültige DGT-Brettnummer.');
    ids.add(board);
    const result=gameResult(p.result);
    return {id:String(board),board,label:String(board),white:playerName(p.white),black:playerName(p.black),result,finished:result!=='*'};
  });
}
export function dgtGame(data,pairing) {
  if(!Array.isArray(data.moves)||data.moves.length>MAX_PLIES)throw new Error('Ungültige DGT-Partie.');
  // Native DGT ESAN: SAN followed by optional clock seconds and elapsed time.
  const moves=data.moves.map(v=>{
    if(typeof v!=='string'||!/^\S+(?: (-?\d+)?(?:[+~]\d+)?)?$/.test(v))throw new Error('Unbekanntes DGT-Zugformat.');
    return v.split(' ')[0];
  });
  const clock=n=>Number.isFinite(n)&&n>=0?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(Math.floor(n)%60).padStart(2,'0')}`:null;
  const result=gameResult(data.result || pairing.result);
  return {...pairing,result,finished:result!=='*',fen:'',variant:data.chess960!=null&&data.chess960!==518?'Chess960':'Standard',moves,clocks:{white:clock(data.clock?.white),black:clock(data.clock?.black)}};
}
