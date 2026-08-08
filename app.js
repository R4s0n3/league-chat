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

/* ==================== RIFT MINIMAP SIM ==================== */
/* A tiny live RTS running under the chat: 10 champions (5v5) actually
   walk the lanes, the junglers clear camps and gank, and skirmishes
   break out — kills show up in the scoreboard, banners and death log.
   Blue = player side (bottom-left), Red = top-right (real minimap). */

const MM = {
  geo: {
    W: 200, H: 150,
    lanes: {
      top: [[0.14, 0.86], [0.22, 0.46], [0.34, 0.24], [0.52, 0.12], [0.72, 0.16], [0.88, 0.30]],
      mid: [[0.24, 0.92], [0.38, 0.70], [0.50, 0.50], [0.62, 0.30], [0.76, 0.08]],
      bot: [[0.12, 0.92], [0.30, 0.88], [0.52, 0.84], [0.74, 0.80], [0.90, 0.66]],
    },
    turret: { home: 0.16, enemy: 0.84 },
    campsB: [[0.06, 0.78], [0.16, 0.60], [0.06, 0.48], [0.16, 0.28], [0.30, 0.54]],
    campsR: [[0.94, 0.22], [0.84, 0.40], [0.94, 0.52], [0.84, 0.72], [0.70, 0.46]],
    baseB: { x: 0.10, y: 0.90 },
    baseR: { x: 0.90, y: 0.10 },
  },
  _poly: {}, pairs: [],
  units: null, elUnits: null,
  raf: 0, last: 0, running: false,
};

const MM_SPD = { top: 0.058, mid: 0.078, bot: 0.055, sup: 0.048, jgl: 0.088 };

function mmPoly(name) {
  if (MM._poly[name]) return MM._poly[name];
  const pts = MM.geo.lanes[name], cuts = [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) {
    tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cuts.push(tot);
  }
  const c = { cuts, total: tot };
  MM._poly[name] = c;
  return c;
}
function samplePt(laneName, t) {
  const pts = MM.geo.lanes[laneName];
  if (t <= 0) return { x: pts[0][0], y: pts[0][1] };
  if (t >= 1) return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
  const c = mmPoly(laneName);
  const d = t * c.total;
  let i = 0;
  while (i < c.cuts.length && c.cuts[i] < d) i++;
  const s = i ? c.cuts[i - 1] : 0;
  const seg = (c.cuts[i] || c.total) - s;
  const f = seg ? (d - s) / seg : 0;
  const a = pts[i], b = pts[i + 1] || pts[pts.length - 1];
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
}
function turretPt(laneName, team) {
  return samplePt(laneName, team === "blue" ? MM.geo.turret.home : MM.geo.turret.enemy);
}
function mmRand(a, b) { return a + Math.random() * (b - a); }

function createUnit(t) {
  const el = document.createElement("div");
  el.className = "mmu " + t.team + (t.me ? " me" : "") + (t.role === "jgl" ? " jgl" : "");
  MM.elUnits.appendChild(el);
  const lane = t.role === "jgl" ? null : (t.role === "bot" || t.role === "sup") ? "bot" : t.role;
  const u = {
    team: t.team, role: t.role, lane,
    w: t.w, me: !!t.me,
    x: (t.team === "blue" ? MM.geo.baseB : MM.geo.baseR).x,
    y: (t.team === "blue" ? MM.geo.baseB : MM.geo.baseR).y,
    hp: 1, dead: false,
    born: 1, bornT: 0, bornDur: mmRand(2.2, 3.6),
    pause: 0, cool: 0, count: 0,
    el,
  };
  if (lane) {
    u.lane = lane;
    u.p = t.team === "blue" ? MM.geo.turret.home : MM.geo.turret.enemy;
    u.spd = MM_SPD[u.role];
  } else {
    u.camps = t.team === "blue" ? MM.geo.campsB.slice() : MM.geo.campsR.slice();
    u.ci = 0;
    u.spd = MM_SPD.jgl;
  }
  return u;
}

function mmSpark(x, y, c, cls) {
  const e = document.createElement("div");
  e.className = "mm-spark" + (cls ? " " + cls : "");
  e.style.left = (x * 100) + "%";
  e.style.top = (y * 100) + "%";
  e.style.background = c;
  MM.elUnits.appendChild(e);
  setTimeout(() => e.remove(), 520);
}

function mmBasePos(u) {
  return u.team === "blue" ? MM.geo.baseB : MM.geo.baseR;
}

function stepUnitSim(u, dt) {
  if (u.born) {
    u.bornT += dt;
    const f = Math.min(1, u.bornT / u.bornDur);
    const e = f * f * (3 - 2 * f);
    const from = mmBasePos(u);
    const home = u.lane ? turretPt(u.lane, u.team) : { x: u.camps[0][0], y: u.camps[0][1] };
    u.x = from.x + (home.x - from.x) * e;
    u.y = from.y + (home.y - from.y) * e;
    if (f >= 1) u.born = 0;
    return;
  }
  if (u.dead) {
    u.rev -= dt;
    if (u.rev <= 0) mmRespawn(u);
    return;
  }
  if (u.cool > 0) u.cool -= dt;
  if (u.pause > 0) { u.pause -= dt; return; }

  if (u.lane) {
    const d = u.team === "blue" ? 1 : -1;
    u.p += d * u.spd * dt;
    const lo = 0.10, hi = 0.90;
    if (u.p >= hi) { u.p = hi; u.pause = mmRand(0.3, 2.2); }
    if (u.p <= lo) { u.p = lo; u.pause = mmRand(0.3, 2.4); }
    const pos = samplePt(u.lane, u.p);
    u.x = pos.x;
    u.y = pos.y + (u.role === "sup" ? 0.018 : u.role === "bot" ? -0.02 : 0);
  } else {
    /* jungler: farm camps, occasionally gank a pushing enemy laner */
    if (u.gank) {
      const t = u.gank;
      const dx = t.x - u.x, dy = t.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.012) { u.cool = Math.max(u.cool, 0.5); u.gank = null; }
      else { u.x += (dx / d) * u.spd * 1.25 * dt; u.y += (dy / d) * u.spd * 1.25 * dt; }
      return;
    }
    const c = u.camps[u.ci];
    const dx = c[0] - u.x, dy = c[1] - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.012) {
      u.pause = mmRand(1.2, 3.6);
      mmSpark(u.x, u.y, u.team === "blue" ? "#59d0a0" : "#e8a04a", "");
      u.ci = ++u.ci % u.camps.length;
      u.count++;
      if (u.count % 3 === 0 && Math.random() < 0.65) {
        const cand = MM.units.filter(o =>
          o.team !== u.team && !o.dead && o.lane && (o.team === "blue" ? o.p > 0.5 : o.p < 0.5));
        if (cand.length) {
          const g = pick(cand);
          u.gank = { x: g.x, y: g.y };
        }
      }
      return;
    }
    u.x += (dx / d) * u.spd * dt;
    u.y += (dy / d) * u.spd * dt;
  }
}

function mmRespawn(u) {
  u.dead = false;
  u.hp = 1;
  u.cool = 0;
  u.pause = 0;
  u.gank = null;
  if (u.lane) u.p = u.team === "blue" ? MM.geo.turret.home : MM.geo.turret.enemy;
  u.born = 1; u.bornT = 0; u.bornDur = mmRand(1.5, 2.5);
  u.el.classList.remove("dead");
}

function mmPlayerSlain(killer) {
  S.deaths++;
  setTox(S.tox + 0.7);
  banner(killer.name + " has slain you.");
  sys(`<b>${S.playerName}</b> slain by <b>${killer.name}</b>.`);
  speak("death", { who: randomBot(), ping: 0.5, silent: 0.2 });
}

function mmKill(winner, victim) {
  victim.dead = true;
  victim.rev = mmRand(4, 9);
  victim.hp = 0;
  victim.el.classList.add("dead");
  mmSpark(victim.x, victim.y, victim.team === "blue" ? "#ff6172" : "#3fd0ff", "kill");
  if (victim.team === "red") {
    S.killsB++;
    banner((winner.me ? S.playerName : winner.name) + " defeated " + victim.name, "blue");
    sys(`<b>${winner.me ? S.playerName : winner.name}</b> killed <b>${victim.name}</b> (${victim.w.champ}).`);
  } else {
    S.killsR++;
    if (victim.me) {
      mmPlayerSlain(winner);
    } else {
      banner(victim.name + " has been killed");
      sys(`<b>${victim.name}</b> was slain by <b>${winner.name}</b>.`);
    }
  }
  updateScore();
}

function resolvePair(p) {
  const A = p.A, B = p.B;
  A.el.classList.remove("fight");
  B.el.classList.remove("fight");
  A.cool = B.cool = mmRand(1, 2.5);
  if (Math.random() < 0.42) {
    const wA = A.hp / (A.hp + B.hp);
    const winner = Math.random() < wA ? A : B;
    const victim = winner === A ? B : A;
    mmKill(winner, victim);
  } else {
    mmSpark((A.x + B.x) / 2, (A.y + B.y) / 2, "#ffe066", "miss");
  }
}

function tickFightsSim(dt) {
  for (const p of MM.pairs.slice()) {
    p.t += dt;
    p.A.x += (Math.random() - 0.5) * 0.018;
    p.A.y += (Math.random() - 0.5) * 0.018;
    p.B.x += (Math.random() - 0.5) * 0.018;
    p.B.y += (Math.random() - 0.5) * 0.018;
    if (Math.random() < 0.3) {
      mmSpark(mmRand(p.A.x, p.B.x), mmRand(p.A.y, p.B.y),
        Math.random() < 0.5 ? "#ffd566" : "#9be06b", "hit");
    }
    const ix = MM.pairs.indexOf(p);
    if (p.t >= p.dur) { MM.pairs.splice(ix, 1); resolvePair(p); }
  }
  for (let i = 0; i < MM.units.length; i++) {
    const A = MM.units[i];
    if (A.dead || A.cool > 0 || A.born) continue;
    for (let j = i + 1; j < MM.units.length; j++) {
      const B = MM.units[j];
      if (B.dead || B.cool > 0 || B.born || B.team === A.team) continue;
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      const max = (A.lane && B.lane && A.lane === B.lane) ? 0.13 : 0.10;
      if (d > max) continue;
      MM.pairs.push({ A, B, t: 0, dur: mmRand(0.6, 1.3) });
      A.cool = B.cool = 0.3;
      A.el.classList.add("fight");
      B.el.classList.add("fight");
    }
  }
}

function frameMmSim(now) {
  if (!MM.running) return;
  const dt = Math.min(0.25, (now - MM.last) / 1000 || 0.016);
  MM.last = now;
  tickFightsSim(dt);
  for (const u of MM.units) stepUnitSim(u, dt);
  for (const u of MM.units) {
    u.el.style.left = (u.x * 100) + "%";
    u.el.style.top = (u.y * 100) + "%";
  }
  if (MM.running) MM.raf = requestAnimationFrame(frameMmSim);
}

function startSim() {
  stopSim();
  if (!MM.elUnits) MM.elUnits = $("mmUnits");
  MM.elUnits.innerHTML = "";
  MM.units = [];
  const blue = [{ w: { name: S.playerName, champ: S.myCh.emoji + " " + S.myCh.name }, role: "mid", me: true }];
  ["top", "jgl", "bot", "sup"].forEach((r, i) =>
    blue.push({ w: { name: TEAMMATES[i].name, champ: TEAMMATES[i].champ }, role: r }));
  const red = [
    { w: { name: ENEMIES[0].name, champ: ENEMIES[0].champ }, role: "top" },
    { w: { name: ENEMIES[1].name, champ: ENEMIES[1].champ }, role: "jgl" },
    { w: { name: ENEMIES[2].name, champ: ENEMIES[2].champ }, role: "mid" },
    { w: { name: ENEMIES[3].name, champ: ENEMIES[3].champ }, role: "bot" },
    { w: { name: ENEMIES[4].name, champ: ENEMIES[4].champ }, role: "sup" },
  ];
  blue.forEach((t) => MM.units.push(createUnit({ team: "blue", ...t })));
  red.forEach((t) => MM.units.push(createUnit({ team: "red", ...t })));
  MM.running = true; MM.last = 0; MM.pairs = [];
  const st = document.querySelector(".mm-live");
  if (st) st.classList.remove("off");
  MM.raf = requestAnimationFrame(frameMmSim);
}

function stopSim() {
  MM.running = false;
  cancelAnimationFrame(MM.raf);
  MM.pairs = [];
  const st = document.querySelector(".mm-live");
  if (st) st.classList.add("off");
}

function buildMinimap() {
  const svg = $("mmMap");
  if (!svg) return;
  const W = MM.geo.W, H = MM.geo.H;
  const px = (p) => (p.map((c) => [+(c[0] * W).toFixed(1), +(c[1] * H).toFixed(1)]));
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#0b1426"/>`);
  parts.push(`<ellipse cx="${W * 0.18}" cy="${H * 0.70}" rx="${W * 0.18}" ry="${H * 0.13}" fill="rgba(34,86,64,.22)"/>`);
  parts.push(`<ellipse cx="${W * 0.82}" cy="${H * 0.30}" rx="${W * 0.18}" ry="${H * 0.13}" fill="rgba(34,86,64,.22)"/>`);
  parts.push(`<path d="M 0 ${H * 0.4} Q ${W * 0.3} ${H * 0.62} ${W * 0.5} ${H * 0.5} T ${W} ${H * 0.62}" fill="none" stroke="rgba(90,140,170,.16)" stroke-width="3"/>`);

  for (const name in MM.geo.lanes) {
    const p = px(MM.geo.lanes[name]);
    const d = p.map((pt, i) => (i ? "L" : "M") + pt[0] + " " + pt[1]).join(" ");
    parts.push(`<path d="${d}" fill="none" stroke="rgba(150,170,110,.34)" stroke-width="2.2" stroke-linecap="round"/>`);
    parts.push(`<path d="${d}" fill="none" stroke="rgba(230,235,180,.12)" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="3 4"/>`);
  }
  const tower = (x, y, c) => parts.push(
    `<g transform="translate(${x} ${y})"><rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx=".6" transform="rotate(45)" fill="#0b1322" stroke="${c}" stroke-width="1.1"/></g>`);
  ["top", "mid", "bot"].forEach((l) => {
    const h = px([samplePt(l, MM.geo.turret.home)]);
    const e = px([samplePt(l, MM.geo.turret.enemy)]);
    tower(+(h[0][0].toFixed(1)), +(h[0][1].toFixed(1)), "#7fd0ff");
    tower(+(e[0][0].toFixed(1)), +(e[0][1].toFixed(1)), "#ff9aa6");
  });
  MM.geo.campsB.forEach((c) => parts.push(`<circle cx="${c[0] * W}" cy="${c[1] * H}" r="2" fill="rgba(0,0,0,.3)" stroke="rgba(89,208,160,.55)" stroke-width="1"/>`));
  MM.geo.campsR.forEach((c) => parts.push(`<circle cx="${c[0] * W}" cy="${c[1] * H}" r="2" fill="rgba(0,0,0,.3)" stroke="rgba(232,160,74,.55)" stroke-width="1"/>`));
  const base = (x, y, c) => {
    parts.push(`<g transform="translate(${x} ${y})">
      <rect x="-5" y="-5" width="10" height="10" rx="1" transform="rotate(45)" fill="#0b1322" stroke="${c}" stroke-width="1.5"/>
      <rect x="-2" y="-2" width="4" height="4" rx=".5" transform="rotate(45)" fill="${c}" opacity=".85"/></g>`);
  };
  base(MM.geo.baseB.x * W, MM.geo.baseB.y * H, "rgba(89,208,255,.9)");
  base(MM.geo.baseR.x * W, MM.geo.baseR.y * H, "rgba(255,120,140,.9)");
  svg.innerHTML = parts.join("");
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
  startSim();

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
  stopSim();
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
  stopSim();
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
  buildMinimap();
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