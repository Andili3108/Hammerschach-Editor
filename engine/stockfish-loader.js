
// === Stockfish Loader (classic Worker, GitHub Pages safe) ===
// Purpose: circumvents MIME/module restrictions on GitHub Pages.
// Place this file in the same folder as stockfish-16.1-single.js
// and reference it from analyzer-v1a-r4.html as:
//   const WORKER_URL = "./stockfish-loader.js";

try {
  self.importScripts("./stockfish-16.1-single.js");
} catch (e) {
  console.error("[Stockfish Loader] importScripts failed:", e);
  self.postMessage({ type: "fatal", error: String(e) });
}
