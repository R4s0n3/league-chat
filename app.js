"use strict";

/* ========================================================================
   LEAGUE CHAT SIMULATOR v3 – short, personal, with pings
   Every character has their own personality. Messages are minimal.
   A lot happens through pings instead of text (just like real LoL).
   ===================================================================== */

const CHAMPIONS = [
  { name: "Yasuo",   emoji: "🌀" },
  { name: "Teemo",   emoji: "🍄" },
  { name: "Jinx",    emoji: "💥" },
  { name: "Garen",   emoji: "🛡️" },
  { name: "Lux",     emoji: "✨" },
  { name: "Zed",     emoji: "🗡️" },
  { name: "Lee Sin", emoji: "👟" },
  { name: "Thresh",  emoji: "⛓️" },
];

const TEAMMATES = [
  { name: "Nyx_Junge",       color: "#7ec8ff", champ: "Nami" },
  { name: "xX_IntMaster_Xx", color: "#d38bff", champ: "Viego" },
  { name: "JunglePatience",  color: "#9be06b", champ: "Lee Sin" },
  { name: "Tank_4Life",      color: "#ff9b9b", champ: "Leona" },
];

const ENEMIES = [
  { name: "DariusBurgus", champ: "Darius", color: "#ff8fa3" },
  { name: "PrivacyNanna", champ: "Kaisa", color: "#ff8fa3" },
  { name: "LZ_Support",   champ: "Lulu", color: "#ff8fa3" },
  { name: "Terbare",      champ: "Teemo", color: "#ff8fa3" },
  { name: "DueToZed",     champ: "Zed", color: "#ff8fa3" },
];

const LANES = ["Top", "Jgl", "Mid", "Bot", "Sup"];
const TEAM_LANES = LANES.filter((l) => l !== "Mid");

/* Ping types (custom, like the client) */
const PING_TYPES = [
  { icon: "⚠️", label: "danger!",       color: "#ff8a3a" },
  { icon: "❓", label: "enemy missing!", color: "#ff4d4e" },
  { icon: "🆘", label: "assist me!",     color: "#9bff6b" },
  { icon: "▶",  label: "on my way...",  color: "#6bcbff" },
  { icon: "✨", label: "vision needed",  color: "#ffe066", rare: true },
];

/* Minimal fallback, ONLY when the AI is offline. */
const FALLBACK = [
  "g.",
  "k.",
  "jg??",
  "unlucky",
  "no way",
  "you're actually trolling",
  "what was that",
  "are you serious right now",
  "mb.i guess??",
  "reporting",
  "absolutely classic",
  "it's actually impressive",
];

/* ============ STATE ============ */
const S = {
  playerName: "x014Silber",
  myCh: CHAMPIONS[0],
  channel: "team",
  killsB: 0, killsR: 0, deaths: 0,
  sec: 0, tox: 0.5, gameover: false,
  spicy: localStorage.getItem("lc.spicy") !== "0",
  ambient: null, timers: [], tick: null,
};

const AI = { online: false, model: "", history: [], fails: 0, queue: Promise.resolve(), lastBot: "" };

const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const withP = t => t.replace(/\{p\}/g, S.playerName);

/* ==================== MOBILE VIEWPORT ==================== */
/* Keep the app pinned to the live viewport so the chat input never
   disappears under the on-screen keyboard / browser toolbars. */
function fitViewport() {
  if (window.innerWidth >= 861) return;
  const vv = window.visualViewport;
  const h = (vv && vv.height) ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", h + "px");
  if (window.scrollTo) window.scrollTo(0, 0);
}
function wireViewport() {
  fitViewport();
  const vv = window.visualViewport;
  const target = vv || window;
  target.addEventListener("resize", fitViewport);
  if (vv) vv.addEventListener("scroll", fitViewport);
}

function tNow() {
  const m = String(Math.floor(S.sec / 60)).padStart(2, "0");
  const s = String(S.sec % 60).padStart(2, "0");
  return m + ":" + s;
}
function later(fn, ms) { const id = setTimeout(fn, ms); S.timers.push(id); return id; }
function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; clearTimeout(S.ambient); clearInterval(S.tick); }

/* ==================== LOG ==================== */
function logLine(text, cls = "", all = false) {
  const el = document.createElement("div");
  el.className = "msg" + (cls ? " " + cls : "");
  const chTag = all ? `<span class="ch">All</span>` : "";
  el.innerHTML = `<span class="t">${tNow()}</span>${chTag}${text}`;
  const log = $("log");
  log.appendChild(el);
  while (log.childNodes.length > 400) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function sys(text) {
  logLine(`<span class="body">${text}</span>`, "sys");
  historyNote(text.replace(/<[^>]*>/g, ""));
}

function post(author, color, text, cls = "", all = false, isSelf = false) {
  const who = author ? `<span class="who" style="color:${color}">${author}</span><span class="dots">:</span>` : "";
  logLine(`${who}<span class="body">${text}</span>`, cls + (isSelf ? " self" : ""), all);
  if (author) remember(author, text);
}

/* ---- chat memory: every line (pings, kills, chat) goes to the transcript ---- */
function remember(speaker, content) {
  const c = String(content || "").trim();
  if (c) AI.history.push(speaker + ": " + c.slice(0, 240));
}
function historyNote(text) {
  const c = String(text || "").trim();
  if (c) AI.history.push(">> " + c.slice(0, 160));
}

function randomBot(all = false) {
  const src = all ? (Math.random() < 0.5 ? TEAMMATES : ENEMIES) : TEAMMATES;
  if (AI.lastBot && src.length > 1) {
    const others = src.filter((b) => b.name !== AI.lastBot);
    if (others.length) return others[Math.floor(Math.random() * others.length)];
  }
  return src[Math.floor(Math.random() * src.length)];
}

/* ==================== PINGS ==================== */
function pingType() {
  const pool = PING_TYPES.filter((p) => !p.rare || Math.random() < 0.18);
  return pick(pool);
}

function doPing(who, type) {
  const t = type || pingType();
  const mark = document.createElement("div");
  mark.className = "msg ping";
  mark.innerHTML = `<span class="t">${tNow()}</span><span class="picon" style="color:${t.color}">${t.icon}</span><span class="body">${t.label}</span>`;
  $("log").appendChild(mark);
  $("log").scrollTop = $("log").scrollHeight;
  if (who) remember(who.name, t.icon + " " + t.label);

  // Minimap-Marker
  const mm = $("minimap");
  if (mm) {
    const dot = document.createElement("div");
    dot.className = "mpp";
    dot.style.left = (10 + Math.random() * 80) + "%";
    dot.style.top = (10 + Math.random() * 80) + "%";
    dot.style.background = t.color;
    mm.appendChild(dot);
    setTimeout(() => dot.remove(), 1500);
  }
}

/* ==================== TOXICITY METER (mood-driven gauge) ==================== */
/* A bidirectional gauge: left = chill, center = neutral, right = full flame.
   The bar moves based on how the chat actually feels. */
const TOX_LABELS = [
  [-5,    "full chill"],
  [-3.5,  "cool as a cucumber"],
  [-1.5,  "chill"],
  [-0.5,  "fine"],
  [0.5,   "spicy"],
  [1.5,   "tilted"],
  [3,     "smoldering"],
  [4,     "full report"],
  [4.8,   "*angry noises*"],
];
function toxLabel(v) {
  for (let i = TOX_LABELS.length - 1; i >= 0; i--) if (v >= TOX_LABELS[i][0]) return TOX_LABELS[i][1];
  return TOX_LABELS[0][1];
}
function setTox(v) {
  if (S.gameover) return;
  S.tox = Math.max(-5, Math.min(5, v));
  const half = 50;
  const fill = $("toxFill");
  if (S.tox < 0) {
    fill.classList.add("neg");
    fill.classList.remove("pos");
    fill.style.right = half + "%";
    fill.style.left = (half - (Math.abs(S.tox) / 5) * half) + "%";
  } else {
    fill.classList.add("pos");
    fill.classList.remove("neg");
    fill.style.left = half + "%";
    fill.style.right = (half - (S.tox / 5) * half) + "%";
  }
  $("toxMark").style.left = ((S.tox + 5) / 10) * 100 + "%";
  const lab = $("toxLabel");
  lab.textContent = toxLabel(S.tox);
  lab.style.color = S.tox < -0.5 ? "#6bdd8b" : S.tox > 0.5 ? "#ff7a7a" : "var(--dim)";
  $("toxBox").classList.toggle("danger", S.tox >= 3.5);
  if (S.tox >= 5) gameOver();
}

/* Rough mood score of an actual chat line: -2.5 de-escalates, +2.5 escalates. */
const HOT_WORDS = {
  "noob": 1.3, "n00b": 1.3, "bronze": 1.1, "ez": 0.8, "feed": 1.3, "feeding": 1.3,
  "inting": 1.4, "int": 0.7, "troll": 1.3, "grief": 1.2, "griefing": 1.2, "report": 1.2,
  "ff": 0.7, "ff15": 1, "surrender": 0.7, "afk": 0.8, "mom": 1, "mudda": 1.2, "mutter": 1,
  "mama": 0.8, "mother": 0.8, "trash": 1.2, "garbage": 1.2, "useless": 1.2, "worst": 1,
  "jng diff": 1.4, "jungle diff": 1.4, "top gap": 1.2, "mid gap": 1.2, "diffs": 0.6,
  "inter": 1.1, "terrible": 0.9, "dog": 0.9, "????": 0.9, "???": 0.7, "??": 0.4, "?": 0.2,
};
const COOL_WORDS = {
  "gg": 1.2, "ggwp": 1.5, "wp": 1.2, "gj": 1.2, "good job": 1.2, "well played": 1.2,
  "nice try": 0.9, "nice": 0.7, "good": 0.5, "ty": 1, "thx": 1, "danke": 1,
  "thanks": 1.2, "thank you": 1.2, "mb": 1, "my bad": 1, "sorry": 0.8, "np": 0.8,
  "no problem": 0.8, "pls": 0.6, "please": 0.6, "gl": 0.8, "glhf": 0.8, "gl hf": 0.9,
  "help": 0.5, "wp bro": 1.3,
};
function moodDelta(text) {
  const t = " " + String(text || "").toLowerCase().replace(/\s+/g, " ").trim() + " ";
  let d = 0;
  for (const w in HOT_WORDS) if (t.includes(w)) d += HOT_WORDS[w];
  for (const w in COOL_WORDS) if (t.includes(w)) d -= COOL_WORDS[w];
  return Math.max(-2.5, Math.min(2.5, d));
}

/* ==================== AI CORE ==================== */
function setAIStatus(text, on) {
  const el = $("aiStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("on", !!on);
}
function pingAI() {
  fetch("/api/health", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => {
      if (j.ok) { AI.online = true; AI.model = j.model || ""; setAIStatus("ai live: " + AI.model, true); }
      else { AI.online = false; setAIStatus("no key – offline short chats", false); }
    })
    .catch(() => { AI.online = false; setAIStatus("no server – offline", false); });
}

async function genLine(scene, from, intent) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player: S.playerName,
      scene, intent, from,
      maxWords: S.spicy ? 12 : 8,
      spicy: S.spicy,
      history: AI.history,
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  if (!j.reply) throw new Error("empty");
  return { text: j.reply, tox: typeof j.tox === "number" ? j.tox : null };
}

let typingTimer = null;
function typingOn() {
  const w = randomBot();
  const el = $("typing");
  el.classList.remove("hidden");
  el.innerHTML = `<span class="dots"></span> ${w.name} is typing …`;
}
function typingOff() {
  clearTimeout(typingTimer);
  $("typing").classList.add("hidden");
}

/* One "bot utterance": sometimes a ping, sometimes silence, otherwise 1 short line */
function speak(scene, opts = {}) {
  opts.scene = scene;
  return new Promise((res) => {
    if (S.gameover) return res();
    const who = opts.who || randomBot(!!opts.all);

    if (opts.ping && Math.random() < opts.ping) {
      doPing(who);
      return res();
    }
    if (opts.silent && Math.random() < opts.silent) return res();

    AI.queue = AI.queue.then(async () => {
      if (S.gameover) return res();
      AI.lastBot = who.name;
      if (!AI.online) {
        const fb = withP(pick(FALLBACK));
        post(who.name, who.color, fb, "flame", !!opts.all);
        setTox(S.tox + moodDelta(fb));
        return res();
      }
      try {
        typingOn();
        const line = await genLine(scene, who.name, opts.intent || "");
        typingOff();
        AI.fails = 0;
        post(who.name, who.color, line.text, "ai", !!opts.all);
        setTox(S.tox + (line.tox != null ? line.tox : moodDelta(line.text)));
      } catch (e) {
        typingOff();
        AI.fails++;
        if (AI.fails >= 6) { AI.online = false; setAIStatus("ai offline – short chats", false); }
        const fb = withP(pick(FALLBACK));
        post(who.name, who.color, fb, "room", !!opts.all);
        setTox(S.tox + moodDelta(fb));
      }
      res();
    });
  });
}

function userTalk(msg) {
  if (AI.history.length > 40) AI.history = AI.history.slice(-40);
  post(S.playerName, "#d8b45e", msg, "self", S.channel === "all", true);
  speak("react", { all: S.channel === "all", intent: classify(msg), ping: 0.18, silent: 0.05 })
    .then(() => {
      const i = classify(msg);
      if (Math.random() < 0.7) {
        speak(i ? "react" : "ambient", { all: S.channel === "all", intent: i, ping: 0.2, silent: 0.15 });
      }
      if (Math.random() < 0.25) {
        later(() => speak("allflame", { all: true, who: pick(ENEMIES), ping: 0.25, silent: 0.2 }), 3000 + Math.random() * 2000);
      }
    });
}

/* ==================== AMBIENT (rare & short) ==================== */
function scheduleAmbient() {
  clearTimeout(S.ambient);
  S.ambient = setTimeout(ambientLoop, 20000 + Math.random() * 20000);
}
function ambientLoop() {
  speak("ambient", { all: S.channel === "all", ping: 0.45, silent: 0.15 });
  if (Math.random() < 0.45) {
    later(() => speak("ambient", { all: S.channel === "all", ping: 0.3, silent: 0.15 }), 2500 + Math.random() * 2500);
  }
  scheduleAmbient();
}

/* ==================== EVENTS ==================== */
function scheduleEvent() { later(gameEvent, 25000 + Math.random() * 20000); }

function gameEvent() {
  if (Math.random() < 0.55) {
    S.deaths++;
    setTox(S.tox + 0.8);
    const killer = pick(ENEMIES);
    banner(`${killer.name} has slain you.`);
    sys(`<b>${S.playerName}</b> slain by <b>${killer.name}</b>.`);
    speak("death", { who: randomBot(), ping: 0.4, silent: 0.15 });
    if (Math.random() < 0.5) {
      speak("death", { all: Math.random() < 0.5, ping: 0.3, silent: 0.1 });
    }
    if (Math.random() < 0.35) speak("allflame", { all: true, who: pick(ENEMIES), ping: 0.3, silent: 0.2 });
  } else {
    S.killsB++;
    setTox(S.tox - 0.4);
    const e = pick(ENEMIES);
    banner(`You defeated ${e.name}`, "blue");
    post(S.playerName, "#d8b45e", `${e.name} down`, "", false, true);
    speak("kill", { who: randomBot(S.channel === "all"), ping: 0.4, silent: 0.1 });
    if (Math.random() < 0.45) {
      speak("kill", { all: Math.random() < 0.4, ping: 0.35, silent: 0.15 });
    }
  }
  updateScore();
  scheduleEvent();
}

function banner(text, kind) {
  const b = $("banner");
  b.className = "banner show" + (kind === "blue" ? " blue" : "");
  b.textContent = text;
  setTimeout(() => b.classList.remove("show"), 2200);
}
function updateScore() {
  $("killsBlue").textContent = S.killsB;
  $("killsRed").textContent = S.killsR;
}

/* ==================== INTENT (context for the AI) ==================== */
function classify(text) {
  const t = " " + text.toLowerCase() + " ";
  const checks = [
    ["greet", /\b(hi|hallo|hello|hey|yo|sup|servus|morning|huhu)\b/],
    ["gg", /\b(gg|ggwp|good game|wp)\b/],
    ["ez", /\bez\b/],
    ["noob", /\b(noob|n00b|bronze|bad|worse)\b/],
    ["jungle", /\b(jungle|jungler|jng|gank)\b/],
    ["mid", /\b(mid|top|bot|lane|roam)\b/],
    ["feed", /\b(feed|feeding|inten|inting|troll|grief)\b/],
    ["ff", /\b(ff|ff15|surrender|ff@)\b/],
    ["mom", /\b(mom|mama|mutter|mudda|mother)\b/],
    ["thanks", /\b(thx|ty|danke|thanks)\b/],
    ["help", /\b(help|hilfe|pls)\b/],
    ["report", /\b(report|mute|toxic)\b/],
    ["q", /\?\s*$/],
  ];
  for (const [name, re] of checks) if (re.test(t)) return name;
  return "";
}

/* ==================== SENDING ==================== */
function sendMessage() {
  const input = $("msgInput");
  const text = input.value.trim();
  if (!text) return;
  if (text === "/all") { setChannel("all"); input.value = ""; return; }
  if (text === "/team") { setChannel("team"); input.value = ""; return; }
  if (/^\/all\s/.test(text)) { S.channel = "all"; input.value = text.replace(/^\/all\s+/, ""); }
  else if (/^\/team\s/.test(text)) { S.channel = "team"; input.value = text.replace(/^\/team\s+/, ""); }
  const msg = input.value.trim();
  input.value = "";
  if (!msg) return;
  updateChannelUI();
  setTox(S.tox + moodDelta(msg));
  userTalk(msg);
}

/* ==================== CHANNEL ==================== */
function setChannel(c) { S.channel = c; updateChannelUI(); }
function updateChannelUI() {
  $("chLabel").textContent = S.channel === "all" ? "[All]" : "[Team]";
  $("tabAll").classList.toggle("active", S.channel === "all");
  $("tabTeam").classList.toggle("active", S.channel === "team");
  $("msgInput").placeholder = "say something / ping sounds on…";
}

/* ==================== LOBBY ==================== */
function setSpicy(v) {
  S.spicy = !!v;
  try { localStorage.setItem("lc.spicy", v ? "1" : "0"); } catch (e) {}
  const cas = $("styleCasual"), sp = $("styleSpicy");
  if (cas) cas.classList.toggle("on", !S.spicy);
  if (sp) sp.classList.toggle("on", S.spicy);
}
function fillChampSelect() {
  const sel = $("champSelect");
  sel.innerHTML = "";
  CHAMPIONS.forEach((c, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${c.emoji} ${c.name}`;
    sel.appendChild(o);
  });
  sel.value = CHAMPIONS.indexOf(S.myCh);
}
function shuffleTeam() {
  TEAMMATES.sort(() => Math.random() - 0.5);
  ENEMIES.sort(() => Math.random() - 0.5);
  renderRoster();
}
function renderRoster() {
  const blueEl = $("rosterBlue"), redEl = $("rosterRed");
  blueEl.innerHTML = ""; redEl.innerHTML = "";
  const mk = (w, lane, me) => {
    const div = document.createElement("div");
    div.className = "roster-item" + (me ? " rme" : "");
    div.innerHTML = `<div class="avatar"><span>${w.champ[0]}</span></div><span class="nm">${w.name}</span><span class="ch">${w.champ}</span><span class="role">${lane}</span>`;
    return div;
  };
  const userW = { name: S.playerName, champ: S.myCh.name };
  blueEl.appendChild(mk(userW, "MID", true));
  TEAMMATES.forEach((w, i) => blueEl.appendChild(mk(w, TEAM_LANES[i], false)));
  ENEMIES.forEach((w, i) => redEl.appendChild(mk(w, LANES[i], false)));
}

/* ==================== START / SIDEBAR ==================== */
function fillSidebar() {
  $("sbMeName").textContent = S.playerName;
  $("sbMeChamp").textContent = `${S.myCh.emoji} ${S.myCh.name}`;
  const blue = $("sbBlue"), red = $("sbRed");
  blue.innerHTML = ""; red.innerHTML = "";
  const mk = (w, lane) => `<div class="p"><span class="nm">${w.name}</span><span class="ch">${lane} · ${w.champ}</span></div>`;
  blue.innerHTML = mk({ name: S.playerName, champ: S.myCh.name }, "MID") + TEAMMATES.map((w, i) => mk(w, TEAM_LANES[i])).join("");
  red.innerHTML = ENEMIES.map((w, i) => mk(w, LANES[i])).join("");
}

function startClock() {
  clearInterval(S.tick);
  S.tick = setInterval(() => {
    S.sec++;
    $("clock").textContent = tNow();
    if (Math.abs(S.tox) > 0.05) setTox(S.tox + (0 - S.tox) * 0.03);
  }, 1000);
}

function startGame() {
  S.playerName = $("nameInput").value.trim() || "ImCasual";
  S.myCh = CHAMPIONS[parseInt($("champSelect").value, 10) || 0];
  S.sec = 0; S.killsB = 0; S.killsR = 0; S.deaths = 0; S.tox = 0; S.gameover = false;
  AI.history = [];
  $("screen-lobby").classList.remove("active");
  $("screen-ff").classList.remove("active");
  $("screen-game").classList.add("active");
  $("log").innerHTML = "";
  setTox(S.tox);
  startClock();
  fillSidebar();
  updateChannelUI();

  sys(`Welcome to the rift, <b>${S.playerName}</b>.`);
  later(() => {
    if (Math.random() < 0.4) doPing(randomBot());
    else speak("starter", { who: randomBot(), silent: 0.25, ping: 0.2 });
  }, 1800);

  scheduleAmbient();
  scheduleEvent();
  $("msgInput").focus();
}

function leaveGame() {
  clearTimers();
  $("screen-game").classList.remove("active");
  $("screen-ff").classList.remove("active");
  $("screen-lobby").classList.add("active");
  renderRoster();
  $("nameInput").focus();
}

/* The toxicity bar maxed out -> chat lost the match -> team FF. */
function gameOver() {
  if (S.gameover) return;
  S.gameover = true;
  clearTimers();
  $("ffClock").textContent = tNow();
  $("ffKills").textContent = S.killsB;
  $("ffDeaths").textContent = S.deaths;
  $("ffTox").textContent = Math.round(S.tox * 20);
  $("screen-game").classList.remove("active");
  $("screen-ff").classList.add("active");
}

/* ==================== BINDINGS ==================== */
document.addEventListener("DOMContentLoaded", () => {
  wireViewport();

  S.playerName = $("nameInput").value.trim() || "ImCasual";
  S.myCh = CHAMPIONS[parseInt($("champSelect").value, 10) || 0];
  fillChampSelect();
  renderRoster();
  pingAI();

  $("btnShuffle").addEventListener("click", shuffleTeam);
  $("btnStart").addEventListener("click", startGame);
  $("btnLeave").addEventListener("click", leaveGame);
  $("btnAgain").addEventListener("click", startGame);
  $("btnFfLobby").addEventListener("click", leaveGame);

  setSpicy(S.spicy);
  $("styleCasual").addEventListener("click", () => setSpicy(false));
  $("styleSpicy").addEventListener("click", () => setSpicy(true));

  $("msgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
    if (e.key === "Tab") { e.preventDefault(); setChannel(S.channel === "all" ? "team" : "all"); }
  });
  $("tabAll").addEventListener("click", () => setChannel("all"));
  $("tabTeam").addEventListener("click", () => setChannel("team"));

  $("btnReport").addEventListener("click", () => {
    speak("report", { who: randomBot(), silent: 0.35, ping: 0.15 });
  });
});