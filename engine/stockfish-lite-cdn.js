
/**
 * Stockfish Lite (CDN) Worker — wasm via CDN, no local big files.
 * Tries unpkg & jsdelivr. Exposes a transparent UCI bridge.
 */
(function(){
  const CDNS = [
    "https://unpkg.com/stockfish@17.1.0/stockfish.js",
    "https://cdn.jsdelivr.net/npm/stockfish@17.1.0/stockfish.js"
  ];

  function tryLoad(i){
    if(i >= CDNS.length){
      postMessage({type:"fatal", error:"Failed to load Stockfish from CDN."});
      return;
    }
    try {
      importScripts(CDNS[i]);
      if (typeof STOCKFISH !== "function") throw new Error("STOCKFISH() not available");
      start(STOCKFISH());
    } catch(e){
      console.warn("CDN load failed:", CDNS[i], e);
      tryLoad(i+1);
    }
  }

  function start(engine){
    // Relay engine -> main
    engine.onmessage = function(line){
      try { postMessage(line); } catch(_){}
    };
    // Relay main -> engine
    self.onmessage = function(ev){
      try { engine.postMessage(ev.data); } catch(_){}
    };
    // Bootstrap
    try { engine.postMessage("uci"); } catch(_){}
    try { engine.postMessage("isready"); } catch(_){}
    // Reasonable defaults (1 thread; disable large hash by default for mobile)
    try { engine.postMessage("setoption name Threads value 1"); } catch(_){}
    try { engine.postMessage("setoption name Hash value 16"); } catch(_){}
    // If EvalFile is supported externally, CDN build already embeds a net or classical eval;
    // this will still reach >2300 Elo at depth/time used for training.
  }

  tryLoad(0);
})();
