
/**
 * Hammerschach Analyzer – Stockfish Worker r4
 * Filename: stockfish-16.1-single.js
 * Placement: /engine/ (same folder as your Analyzer HTML)
 *
 * What this worker does
 * ---------------------
 * - Loads Stockfish 16.1 JS glue from a reliable CDN.
 * - Forces the WASM file to be fetched from your GitHub Release URL (CORS).
 * - Provides a Blob() fallback if a direct CORS fetch fails on some browsers.
 * - Proxies messages between main thread <-> engine.
 * - Emits "Analyzer bereit" once the engine is ready to accept UCI commands.
 *
 * Tested targets: Firefox, Safari, Edge, Chrome (Mac & iPad).
 *
 * IMPORTANT: Keep the filename EXACTLY as: stockfish-16.1-single.js
 */

// === CONFIG ================================================================
const WASM_URL = "https://github.com/Andili3108/Hammerschach-Editor/releases/download/Stockfish/stockfish-16.1-single.wasm";

// Official JS glue for Stockfish 16.1 (WASM) – two mirrors for robustness.
// If one CDN is blocked, we try the other.
const STOCKFISH_JS_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.js",
  "https://unpkg.com/stockfish@16.1.0/src/stockfish.js"
];

// Some browsers need a nudge to treat this as a dedicated Worker scope.
const isWorker = typeof self !== "undefined" && typeof postMessage === "function";

// Gate to ensure we only announce readiness once.
let announcedReady = false;

// === CORS FETCH + BLOB FALLBACK ===========================================
/**
 * Attempt to fetch the WASM with CORS. If it fails (network/CORS/mime),
 * we retry and build a Blob URL as a fallback for stricter environments.
 */
async function resolveWasmUrlWithFallback(originalUrl) {
  try {
    // Primary attempt: a HEAD to check reachability without downloading full payload
    const head = await fetch(originalUrl, { method: "HEAD", mode: "cors" });
    if (head.ok) {
      return originalUrl; // Good to go
    }
    // If HEAD is blocked, we will still try GET below.
  } catch (_) {
    // Ignore, proceed with GET
  }

  try {
    const resp = await fetch(originalUrl, { mode: "cors" });
    if (!resp.ok) throw new Error("WASM GET failed: " + resp.status);
    // Clone to avoid re-reading body later – but we only need a blob for fallback.
    const blob = await resp.blob();
    // Some engines prefer a real URL; Blob fallback is for Safari/older FF edge cases.
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  } catch (err) {
    // Final fallback: return the original URL; the JS glue might still handle it.
    console.warn("[Worker r4] Fallback to original WASM URL due to error:", err);
    return originalUrl;
  }
}

// === ENGINE LOADER ========================================================
/**
 * We override Emscripten's location logic so the JS glue will fetch the WASM
 * from our release URL (or its Blob fallback). We install this before we import
 * the Stockfish JS glue.
 */
async function prepareModule() {
  const wasmResolved = await resolveWasmUrlWithFallback(WASM_URL);

  // Emscripten-compatible hooks
  self.Module = {
    locateFile: (path) => {
      // Force .wasm to our release/Blob URL; allow other files untouched.
      if (path && path.endsWith(".wasm")) return wasmResolved;
      return path;
    },
    // Some builds respect instantiateWasm; provide a streaming-first implementation.
    instantiateWasm: async (imports, successCallback) => {
      try {
        // Try streaming first (fastest) if the server serves proper MIME.
        if ("instantiateStreaming" in WebAssembly) {
          const resp = await fetch(wasmResolved);
          const result = await WebAssembly.instantiateStreaming(resp, imports);
          successCallback(result.instance);
          return result.instance.exports;
        }
      } catch (e) {
        // Fall back to ArrayBuffer path
      }

      const resp2 = await fetch(wasmResolved);
      const bytes = await resp2.arrayBuffer();
      const result2 = await WebAssembly.instantiate(bytes, imports);
      successCallback(result2.instance);
      return result2.instance.exports;
    },
    noInitialRun: false,
    onAbort: (reason) => {
      console.error("[Worker r4] Module aborted:", reason);
      try { postMessage({ type: "error", error: String(reason) }); } catch(_) {}
    },
  };
}

/**
 * Try to load the engine JS glue from our candidates in order.
 */
function importGlueOrThrow() {
  let lastErr = null;
  for (const url of STOCKFISH_JS_CANDIDATES) {
    try {
      importScripts(url);
      // If importScripts didn't throw, we are done.
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to import Stockfish JS glue from all candidates.");
}

// === PROXY SETUP ==========================================================
let engine = null;

// Proxy console output from engine (Emscripten prints) back to main thread
function hookPrints() {
  const send = (payload) => {
    try { postMessage({ type: "log", data: payload }); } catch (_) {}
  };
  self.print = send;
  self.printErr = (x) => {
    try { postMessage({ type: "error", data: String(x) }); } catch (_) {}
  };
}

// Some builds expose a global Stockfish() worker-like interface.
// We attach to it when available and proxy messages.
function attachEngineInterface() {
  // Prefer global function Stockfish (wasm-compiled) if present.
  if (typeof Stockfish === "function") {
    engine = Stockfish();
    // Engine -> Worker -> Main
    engine.onmessage = (e) => {
      const msg = (typeof e === "string") ? e : (e && e.data != null ? e.data : "");
      if (!announcedReady && /^(uciok|readyok)/.test(String(msg))) {
        announcedReady = true;
        try { postMessage("Analyzer bereit"); } catch (_) {}
      }
      // Always forward raw engine output
      try { postMessage({ type: "engine", data: msg }); } catch (_) {}
    };
    return;
  }

  // Some builds attach a self.onmessage handler internally and expect postMessage bridging.
  // In that case we leave `engine` as null and rely on global postMessage.
}

// Receive messages from main thread and forward to engine (if attached)
self.onmessage = (e) => {
  const data = (e && e.data != null) ? e.data : "";
  if (engine && typeof engine.postMessage === "function") {
    engine.postMessage(data);
  } else {
    // Fallback path: some builds hook into self.onmessage directly.
    // We just pass-through so the glue can see commands.
    if (typeof self.onmessage_engine_fallback === "function") {
      try { self.onmessage_engine_fallback(e); } catch (_) {}
    } else {
      // Best effort: try a global postMessage which many glue scripts alias to engine stdin.
      try { postMessage(data); } catch (_) {}
    }
  }
};

// === BOOTSTRAP ============================================================
(async () => {
  try {
    hookPrints();
    await prepareModule();
    importGlueOrThrow();       // brings in global Stockfish() if available
    attachEngineInterface();

    // Probe readiness: send "uci" then "isready" to trigger uciok/readyok
    const send = (cmd) => {
      if (engine && typeof engine.postMessage === "function") {
        engine.postMessage(cmd);
      } else {
        // Fallback – the glue may hook self.onmessage; simulate as if from main
        if (typeof self.onmessage === "function") {
          try { self.onmessage({ data: cmd }); } catch (_) {}
        }
      }
    };

    send("uci");
    send("isready");

    // If nothing arrives in 3s, still inform the main thread that worker is alive.
    setTimeout(() => {
      if (!announcedReady) {
        try { postMessage({ type: "status", data: "Worker aktiv – warte auf Engine (WASM)" }); } catch (_) {}
      }
    }, 3000);
  } catch (err) {
    console.error("[Worker r4] Fatal init error:", err);
    try { postMessage({ type: "fatal", error: String(err) }); } catch (_) {}
  }
})();
