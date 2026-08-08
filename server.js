"use strict";

/* ========================================================================
   LEAGUE CHAT SIMULATOR – Mini-Server
   - serves the static files (index.html, style.css, app.js)
   - POST /api/chat   -> relays to OpenRouter via the openai SDK
   - GET  /api/health -> status (key present, model)

   Start:  bun run server.js   (reads .env with dotenv)
   Port:   3009 (or PORT=...)
   ===================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

require("dotenv").config(); // loads .env from the project folder

const OpenAI = require("openai");

const ROOT = __dirname;
const PORT = process.env.PORT || 3009;
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3009",
    "X-Title": "League Chat Sim",
  },
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const ROSTER = ["Nyx_Junge", "xX_IntMaster_Xx", "JunglePatience", "Tank_4Life"];

/* One-line voice per named bot. Key = the "from" name the client sends.
   Each personality is a real archetype, always short and lowercase-English. */
const PERSONAS = {
  "Nyx_Junge": "You are Nyx_Junge, the team's Nami support main: passive-aggressive, always blaming, never misses a chance to say 'unlucky' after a death, speaks in short clipped one-liners.",
  "xX_IntMaster_Xx": "You are xX_IntMaster_Xx, a toxic Viego player who ints then blames everyone else. Your lines are short, sarcastic, full of '?', 'gg', 'jng diff', 'bronze' and pretends you carry.",
  "JunglePatience": "You are JunglePatience, the Lee Sin jungler: calm, few words, dry. You mostly say 'jg??', 'mb', 'camp', or give short practical calls. Never tilts dramatically.",
  "Tank_4Life": "You are Tank_4Life, the Leona tank main: dad-energy, patient, a bit old-school, short encouraging-but-snarky lines like 'just ward bro', 'sit still', 'that was a 50/50'. Roasts you mildly.",
  "DariusBurgus": "You are DariusBurgus, enemy top laner, cocky jack-of-all players: short 'top gap', 'ff15', 'win lane win game' lines in all chat.",
  "PrivacyNanna": "You are PrivacyNanna, enemy ADC Kaisa: quiet, snarky, spams '?' and 'cleaner lane' trash talk after a kill.",
  "LZ_Support": "You are LZ_Support, enemy Lulu support: hyper-polite passive-aggressive, 'sorry not sorry', 'so sorry you inted', faux-sweet.",
  "Terbar": "You are Terbar, enemy Teemo top: obnoxious, 'u mad?', 'mushrooms?', giggles, short prankster lines.",
  "DueToZed": "You are DueToZed, enemy Zed mid: tryhard edgelord, 'skill gap', 'report me? no', always quotes KD ratio.",
};

function personaFor(from) {
  return (from && PERSONAS[from]) || "You are an ordinary ranked player with a dry, mildly sarcastic voice.";
}

function buildSystem(player, from, maxWords) {
  const persona = personaFor(from);
  const cap = Math.max(1, Math.min(20, maxWords || 8));
  return {
    role: "system",
    content:
      persona + " You are an ordinary ranked League of Legends player right now, mildly annoyed at '" + player + "', the inting teammate, and the soloq circus. " +
      "RULES: " +
      "1) Reply with a MAXIMUM of " + cap + " words - usually far fewer. Often a single snarky sentence; sometimes just '?', 'gg', 'lol', 'nt', 'jg????', 'unlucky' or a dry joke. No essays. " +
      "2) VARY your voice every message; NEVER repeat a phrase or word-pair someone already wrote in this chat. " +
      "3) Always lowercase English, even if '" + player + "' writes in German or any other language - your line stays English. " +
      "4) Flame targets the game only: kills, deaths, cs, lane, champion, build, picks. Short mom-flames and one-liners about gameplay are ok. " +
      "LIMITS: no group slurs, no real threats or violence, nothing about '" + player + "'s real life or real family. " +
      "Reply ONLY with the message text, no quotes, no meta-notes. Others: " + ROSTER.concat(["DariusBurgus", "PrivacyNanna", "LZ_Support", "Terbar", "DueToZed"]).join(", ") + ".",
  };
}

/* Scene texts: each situation gets its own briefing */
function sceneFor(scene, player, intent) {
  const t = intentText(intent);
  const map = {
    starter: "SCENE: game just finished loading, nobody has typed yet. Open with one short, mildly spicy real-LoL line.",
    react: "SCENE: the player '" + player + "' just typed a message. React to it exactly, as one friend/blamer would - disagree, mock, shrug it off or joke. " + t,
    ambient: "SCENE: a couple minutes into a messy ranked game, chat is calm. Type one spontaneous aside about the game, your team or the builds - a stray thought, not an answer to anything.",
    death: "SCENE: '" + player + "' died in a visible dumb way (grey screen). Everyone saw. One short almost-amused reaction, not a lecture.",
    kill: "SCENE: '" + player + "' actually got a kill. One concise sarcastic/backhanded remark.",
    allflame: "SCENE: you are an ENEMY in all chat, you saw '" + player + "' die twice. One short shitpost.",
    report: "SCENE: someone is reporting '" + player + "'. You pile on with one dry closing line.",
  };
  return map[scene] || "SCENE: a chaotic ranked game where '" + player + "' is inting.";
}

function intentText(intent) {
  const m = {
    greet: "They say hello in the middle of your feeding streak (greeting).",
    gg: "They type gg early in the game (gg).",
    ez: "They said 'ez' while sitting on 0 kills (ez).",
    noob: "They called out 'noob' (noob).",
    jungle: "They complained about jungle / need a gank (jungle).",
    mid: "They complain about mid / lane / a roam (mid).",
    feed: "They talk about feeding/inting (feed).",
    ff: "They suggest FF / surrender way too early (ff).",
    mom: "They bring up a mom joke (mom).",
    thanks: "They thank you (thanks).",
    help: "They ask for help (help).",
    report: "They threaten to report someone (report).",
    q: "They just typed a question mark (?)",
  };
  return m[intent] || "a random chat message.";
}

/* ---------------- helpers ---------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100000) { req.destroy(); reject(new Error("payload too large")); }
    });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  });
}

/* ---------------- API /api/chat ---------------- */
async function generate(messages) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.chat.completions.create({
        model: MODEL,
        messages: messages,
        temperature: 0.95,
        max_tokens: 300, // replies are kept short by the prompt; cap as a hard limit
        frequency_penalty: 1.1,
        presence_penalty: 0.6,
      });
    } catch (e) {
      lastErr = e;
      const retryable = (e.status === 429) || (e.status === 408) || (e.status >= 500) || (e.status === undefined);
      if (!retryable) break;
      const wait = 700 * Math.pow(2, attempt);
      console.error("OpenRouter retry (" + attempt + ") after " + wait + "ms:", e.status, e.message);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error("failed");
}

async function handleChat(req, res) {
  if (!API_KEY) return json(res, 500, { error: "OPENROUTER_API_KEY missing – add it to .env" });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: "invalid body" });
  }

  const history = Array.isArray(body.history) ? body.history.slice(-24) : [];
  const player = typeof body.player === "string" && body.player ? body.player : "the inting teammate";
  const scene = typeof body.scene === "string" ? body.scene : "chat";
  const intent = typeof body.intent === "string" ? body.intent : "";
  const from = typeof body.from === "string" ? body.from : "";
  const maxWords = Number.isFinite(body.maxWords) ? body.maxWords : 8;

  const messages = [
    buildSystem(player, from, maxWords),
    { role: "user", content: "@@@" + sceneFor(scene, player, intent) },
  ].concat(
    history.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content).slice(0, 500),
    }))
  );

  try {
    const completion = await generate(messages);
    const m = completion.choices && completion.choices[0] && completion.choices[0].message;
    const reply = (m && m.content) || "";
    const note = " (finish: " + ((completion.choices && completion.choices[0] && completion.choices[0].finish_reason) || "?") + ")";
    if (!reply.trim()) return json(res, 502, { error: "empty reply" + note });
    let out = reply.trim();
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) out = out.slice(1, -1).trim();
    json(res, 200, { reply: out });
  } catch (err) {
    console.error("OpenRouter error:", err.message);
    json(res, 502, { error: String(err.message || err) });
  }
}

/* ---------------- CORS (so file:// and other origins work) ---------------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/* ---------------- router ---------------- */
const server = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, "http://localhost:" + PORT);
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && p === "/api/health") {
    return json(res, 200, { ok: !!API_KEY, model: MODEL, openrouter: "https://openrouter.ai/api/v1" });
  }
  if (req.method === "POST" && p === "/api/chat") {
    return handleChat(req, res);
  }
  if (req.method === "GET" && p === "/") return serveStatic(res, path.join(ROOT, "index.html"));

  if (req.method === "GET" && !p.includes("..")) {
    const filePath = path.join(ROOT, p.slice(1));
    if (filePath.startsWith(ROOT)) return serveStatic(res, filePath);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("League Chat Sim running at http://localhost:" + PORT);
  console.log(API_KEY ? "OpenRouter connected – model: " + MODEL : "WARNING: no OPENROUTER_API_KEY set.");
});