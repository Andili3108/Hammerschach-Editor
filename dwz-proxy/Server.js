import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/hsc08", async (req, res) => {
  try {
    const url = "https://www.schachbund.de/verein/61522.html";
    const r = await fetch(url, {
      headers: { "User-Agent": "Andili-DWZ-Proxy" }
    });

    const html = await r.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).send("Proxy-Fehler: " + err.toString());
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("DWZ-Proxy läuft");
});

