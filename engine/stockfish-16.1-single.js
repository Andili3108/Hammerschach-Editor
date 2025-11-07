
/* === HS_R4_WASM_BOOTSTRAP (GitHub-Edition) ===
   Erzwinge Laden der WASM aus dem GitHub-Release (CORS-fähig) und sende
   nach erfolgreicher UCI-Init ein "Analyzer bereit".
   Funktioniert in Firefox, Safari, Edge, Chrome – auch im iFrame.
*/
(function(){
  try{
    // 1) Fester WASM-Pfad (Release-Asset)
    var __HS_WASM_URL = "https://github.com/Andili3108/Hammerschach-Editor/releases/download/Stockfish/stockfish-16.1-single.wasm";

    // 2) Emscripten-Hooks
    self.Module = self.Module || {};
    // locateFile wird von Emscripten genutzt, um Nebenressourcen (z.B. .wasm) zu finden
    var __origLocateFile = Module.locateFile;
    Module.locateFile = function(path, prefix){
      try{
        if (path && /\.wasm(?:\?|$)/.test(path)) return __HS_WASM_URL;
      }catch(_){}
      return __origLocateFile ? __origLocateFile(path, prefix) : (prefix||"") + path;
    };

    // instantiateWasm erlaubt uns, das Laden vollständig zu kontrollieren
    var __readySignalled = false;
    Module.instantiateWasm = function(imports, successCallback){
      try{
        fetch(__HS_WASM_URL, { mode: "cors", credentials: "omit", cache: "no-store" })
          .then(function(res){
            if(!res.ok) throw new Error("HTTP " + res.status);
            return res.arrayBuffer();
          })
          .then(function(buf){
            return WebAssembly.instantiate(buf, imports);
          })
          .then(function(res){
            try { successCallback(res.instance, res.module); } catch(_){}
          })
          .catch(function(err){
            try { self.postMessage({ type:"fatal", error: "WASM-Load failed: " + (err && err.message ? err.message : String(err)) }); } catch(_){}
          });
      }catch(err){
        try { self.postMessage({ type:"fatal", error: "WASM-Bootstrap failed: " + (err && err.message ? err.message : String(err)) }); } catch(_){}
      }
      // Emscripten erwartet ein leeres Objekt
      return {};
    };

    // 3) Ready-Signal abgreifen: wenn die Engine "uciok"/"readyok" postet,
    //    einmalig zusätzlich "Analyzer bereit" senden.
    try{
      var __origPostMessage = self.postMessage.bind(self);
      self.postMessage = function(data){
        try{
          if(!__readySignalled && typeof data === "string"){
            var s = data;
            if (s.indexOf("uciok") !== -1 || s.indexOf("readyok") !== -1){
              __readySignalled = true;
              try{ __origPostMessage("Analyzer bereit"); }catch(_){}
            }
          }
        }catch(_){}
        return __origPostMessage(data);
      };
    }catch(_){}
  }catch(_){}
})();


/**
 * Hammerschach Analyzer – Stockfish Worker r4c
 * Filename: stockfish-16.1-single.js
 * Load this via a classic worker wrapper: stockfish-loader.js (importScripts).
 * Goal: avoid GitHub Releases CORS quirks by fetching BOTH JS + WASM from CDN.
 */

// CDN candidates (JS glue)
const STOCKFISH_JS_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.js",
  "https://unpkg.com/stockfish@16.1.0/src/stockfish.js"
];

// Corresponding WASM on CDN (Emscripten locateFile hook will use this)
const STOCKFISH_WASM_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.wasm",
  "https://unpkg.com/stockfish@16.1.0/src/stockfish.wasm"
];

let announcedReady = false;

function hookPrints(){
  const send = (type, data) => { try { postMessage({ type, data }); } catch(_){} };
  self.print = (x)=>send('log', x);
  self.printErr = (x)=>send('error', String(x));
}

function importGlueOrThrow() {
  let lastErr = null;
  for (const url of STOCKFISH_JS_CANDIDATES) {
    try {
      importScripts(url);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to import Stockfish JS glue from all candidates.");
}

function attachEngineInterface() {
  if (typeof Stockfish === "function") {
    const engine = Stockfish();
    engine.onmessage = (e) => {
      const msg = (typeof e === "string") ? e : (e && e.data != null ? e.data : "");
      if (!announcedReady && /^(uciok|readyok)/.test(String(msg))) {
        announcedReady = true;
        try { postMessage("Analyzer bereit"); } catch(_) {}
      }
      try { postMessage({ type: "engine", data: msg }); } catch(_) {}
    };
    // Bridge incoming messages from main->engine
    self.onmessage = (ev) => engine.postMessage(ev.data);
    return true;
  }
  return false;
}

(function(){
  try {
    hookPrints();

    // Install Emscripten Module with locateFile override BEFORE loading glue
    const wasmUrlPrimary   = STOCKFISH_WASM_CANDIDATES[0];
    const wasmUrlFallback  = STOCKFISH_WASM_CANDIDATES[1];

    self.Module = {
      locateFile: (path) => {
        // Force .wasm to CDN location
        if (path && path.endsWith(".wasm")) return wasmUrlPrimary;
        return path;
      },
      onAbort: (reason) => {
        try { postMessage({ type: "fatal", error: String(reason) }); } catch(_){}
      }
    };

    try {
      importGlueOrThrow();  // brings global Stockfish()
    } catch (e) {
      // Retry with fallback WASM URL in case primary domain blocks
      self.Module.locateFile = (path) => {
        if (path && path.endsWith(".wasm")) return wasmUrlFallback;
        return path;
      };
      importGlueOrThrow();
    }

    if (!attachEngineInterface()) {
      throw new Error("Stockfish() constructor not available after glue import.");
    }

    // Probe readiness
    try { self.postMessage("uci"); } catch(_){}
    try { self.postMessage("isready"); } catch(_){}
  } catch (err) {
    try { postMessage({ type: "fatal", error: String(err) }); } catch(_){}
  }
})();
