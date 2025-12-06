// MoW 2 Draft Project V10

// ==========================
// Supabase init
// ==========================
const SUPABASE_URL = "https://utfudifzuytzbwnxqpcf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_duqpINIqRBZBtmifX5q94Q_bnc-uuxm";

let ADMIN_PASSWORD_DEFAULT = "kozakuapro";
const MASTER_PASSWORD = "kozakuaproloh";

let adminPassword = ADMIN_PASSWORD_DEFAULT;
let supabase = null;

function initSupabase() {
  if (supabase) return;
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase JS не загрузился. Онлайн-режим будет отключён.");
  }
}

// ==========================
// Maps and draft order
// ==========================
const MAPS = [
  "Airfield",
  "Bazerville",
  "Borovaya River",
  "Carpathians",
  "Champagne",
  "Coast",
  "Dead River",
  "Estate",
  "Farm Land",
  "Hunting Grounds",
  "Kursk Fields",
  "Nameless Height",
  "Polesie",
  "Port",
  "Saint Lo",
  "Suburb",
  "Valley of Death",
  "Village",
  "Volokalamsk Highway",
  "Witches Vale",
  "Winter March",
  "Chepel",
  "Crossroads",
  "Sandy Path",
  "Marl",
];

const DRAFT_ORDER = {
  cap1: [1, 4, 5, 7],
  cap2: [2, 3, 6, 8],
};

// ==========================
// AI strategies and roles
// ==========================
// Roles:
// infantry, tanks, artillery, mechanical,
// motorized_infantry, sapper, assault_infantry,
// at_artillery, aa_artillery, spg, heavy_tanks

let ROLE_WEIGHTS = {
  balanced: {
    infantry: 1.1,
    assault_infantry: 1.15,
    motorized_infantry: 1.1,
    sapper: 1.05,
    tanks: 1.1,
    heavy_tanks: 1.15,
    mechanical: 1.05,
    artillery: 1.05,
    at_artillery: 1.1,
    aa_artillery: 1.05,
    spg: 1.1,
  },
  infantry_focus: {
    infantry: 1.4,
    assault_infantry: 1.45,
    motorized_infantry: 1.3,
    sapper: 1.25,
    tanks: 1.0,
    heavy_tanks: 1.0,
    mechanical: 1.1,
    artillery: 1.0,
    at_artillery: 1.1,
    aa_artillery: 1.0,
    spg: 1.0,
  },
  motorized_focus: {
    infantry: 1.1,
    assault_infantry: 1.2,
    motorized_infantry: 1.5,
    sapper: 1.1,
    tanks: 1.25,
    heavy_tanks: 1.25,
    mechanical: 1.15,
    artillery: 1.0,
    at_artillery: 1.1,
    aa_artillery: 1.05,
    spg: 1.2,
  },
  tanks_focus: {
    infantry: 1.0,
    assault_infantry: 1.05,
    motorized_infantry: 1.15,
    sapper: 1.0,
    tanks: 1.4,
    heavy_tanks: 1.5,
    mechanical: 1.1,
    artillery: 1.1,
    at_artillery: 1.25,
    aa_artillery: 1.0,
    spg: 1.35,
  },
  artillery_focus: {
    infantry: 1.0,
    assault_infantry: 1.0,
    motorized_infantry: 1.0,
    sapper: 1.2,
    tanks: 1.0,
    heavy_tanks: 1.05,
    mechanical: 1.05,
    artillery: 1.4,
    at_artillery: 1.4,
    aa_artillery: 1.35,
    spg: 1.35,
  },
  // max_dpm и counter_enemy будут обрабатываться в calcPlayerValue отдельно
};

let currentAIStrategy = "balanced";

const STORAGE_KEYS = {
  players: "mow2_players_v10",
  aiStrategies: "mow2_ai_strategies_v10",
  adminPassword: "mow2_admin_password_v10",
  clientId: "mow2_client_id_v10",
};

// ==========================
// Global state
// ==========================
let players = [];

const offlineDraft = {
  map: MAPS[0],
  mode: "human_vs_ai", // human_vs_ai | ai_vs_ai | manual
  humanSide: "team1",
  strategy: "balanced",
  pool: [],
  available: [],
  team1: [],
  team2: [],
  currentPick: 1,
  maxPick: 8,
};

const online = {
  clientId: null,
  nickname: "",
  roomId: null,
  roomCode: null,
  myRole: "spectator",
  isCreator: false,
  matchStatus: "idle",
  selectedMode: "human_vs_human",
  roomStateChannel: null,
  participantsChannel: null,
  participants: [],
  draft: {
    map: MAPS[0],
    pool: [],
    available: [],
    team1: [],
    team2: [],
    currentPick: 1,
    maxPick: 8,
    mode: "human_vs_human",
    strategy: "balanced",
  },
};

// ==========================
// Helpers
// ==========================
function $(id) {
  return document.getElementById(id);
}

function safeRoles(p) {
  if (!p) return [];
  let r = p.roles;
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (typeof r === "string") {
    return r
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  return [];
}

function rolesToString(p) {
  const arr = safeRoles(p);
  return arr.join(", ");
}

function tierMultiplier(tier) {
  switch (tier) {
    case "S":
      return 10;
    case "A":
      return 2;
    case "B":
      return 1.4;
    case "C":
      return 1.1;
    case "D":
      return 1.0;
    case "F":
      return 0.7;
    default:
      return 1.0;
  }
}

// enemyRoleCounts: {roleName: count}
function calcCounterBonusForPlayer(p, enemyRoleCounts) {
  const roles = safeRoles(p);
  if (!roles.length || !enemyRoleCounts) return 0;

  // Простая таблица контрпиков
  const counters = {
    tanks: ["at_artillery", "spg", "heavy_tanks"],
    heavy_tanks: ["at_artillery", "spg"],
    infantry: ["assault_infantry", "motorized_infantry", "artillery"],
    assault_infantry: ["artillery", "spg"],
    artillery: ["motorized_infantry", "heavy_tanks"],
    spg: ["heavy_tanks", "tanks"],
    motorized_infantry: ["sapper", "at_artillery"],
    mechanical: ["sapper", "at_artillery"],
  };

  let bonus = 0;
  for (const [enemyRole, count] of Object.entries(enemyRoleCounts)) {
    const counterList = counters[enemyRole];
    if (!counterList || !count) continue;
    for (const myRole of roles) {
      if (counterList.includes(myRole)) {
        bonus += count * 0.15;
      }
    }
  }
  return bonus;
}

function calcPlayerValue(p, strategyName, context) {
  const mmr = p.mmr || 0;
  const dpm = p.dpm || 0;
  const tierMul = tierMultiplier(p.tier || "D");

  const strategy = strategyName || currentAIStrategy || "balanced";

  if (strategy === "max_dpm") {
    // Максимум DPM: большой вес урона, но MMR и tier тоже учитываются
    const base = dpm * 0.02 + mmr * 0.3;
    return base * tierMul;
  }

  if (strategy === "counter_enemy") {
    const base = mmr * 0.9 + dpm * 0.0015;
    let score = base * tierMul;
    const enemyRoleCounts = context && context.enemyRoleCounts;
    const bonus = calcCounterBonusForPlayer(p, enemyRoleCounts);
    score *= 1 + bonus;
    return score;
  }

  // Стратегии на основе ROLE_WEIGHTS
  const roleWeights = ROLE_WEIGHTS[strategy] || ROLE_WEIGHTS["balanced"];
  const base = mmr * 1.0 + dpm * 0.002;
  const baseScore = base * tierMul;

  const roles = safeRoles(p);
  let roleMul = 1.0;
  for (const r of roles) {
    const w = roleWeights[r] || 1.0;
    if (w > roleMul) roleMul = w;
  }
  return baseScore * roleMul;
}

function normalizePlayer(p) {
  if (!p) return p;
  p.name = p.name || "Unknown";
  p.tier = p.tier || "D";
  p.mmr = Number(p.mmr || 0);
  p.dpm = Number(p.dpm || 0);
  p.roles = safeRoles(p);
  return p;
}

function normalizePlayers(arr) {
  return (arr || []).map((p) => normalizePlayer(p));
}

// ==========================
// Local storage helpers
// ==========================
function loadAdminPassword() {
  const stored = localStorage.getItem(STORAGE_KEYS.adminPassword);
  if (stored) {
    adminPassword = stored;
  } else {
    adminPassword = ADMIN_PASSWORD_DEFAULT;
  }
}

function saveAdminPassword() {
  localStorage.setItem(STORAGE_KEYS.adminPassword, adminPassword);
}

async function loadPlayers() {
  const raw = localStorage.getItem(STORAGE_KEYS.players);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      players = normalizePlayers(data);
      return;
    } catch (e) {
      console.warn("Failed to parse local players", e);
    }
  }

  try {
    const res = await fetch("players.json");
    if (!res.ok) throw new Error("players.json not found");
    const data = await res.json();
    players = normalizePlayers(data);
  } catch (e) {
    console.error("Failed to load players.json", e);
    players = [];
  }
}

function savePlayersLocal() {
  localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(players));
}

function loadAIStrategiesLocal() {
  const raw = localStorage.getItem(STORAGE_KEYS.aiStrategies);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      ROLE_WEIGHTS = Object.assign({}, ROLE_WEIGHTS, obj);
    }
  } catch (e) {
    console.warn("Failed to parse AI strategies", e);
  }
}

function saveAIStrategiesLocal(obj) {
  localStorage.setItem(STORAGE_KEYS.aiStrategies, JSON.stringify(obj));
}

// ==========================
// Screens navigation
// ==========================
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

// ==========================
// Offline draft
// ==========================
function initOffline() {
  const mapSel = $("offline-map-select");
  mapSel.innerHTML = "";
  MAPS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mapSel.appendChild(opt);
  });
  mapSel.value = offlineDraft.map;
  mapSel.addEventListener("change", () => {
    offlineDraft.map = mapSel.value;
  });

  const modeSel = $("offline-mode-select");
  const humanSideRow = $("offline-human-side-row");
  const humanSideSel = $("offline-human-side");
  modeSel.value = offlineDraft.mode;
  humanSideSel.value = offlineDraft.humanSide;

  function updateOfflineModeUI() {
    offlineDraft.mode = modeSel.value;
    if (offlineDraft.mode === "human_vs_ai") {
      humanSideRow.classList.remove("hidden");
    } else {
      humanSideRow.classList.add("hidden");
    }
  }
  modeSel.addEventListener("change", () => {
    updateOfflineModeUI();
  });
  humanSideSel.addEventListener("change", () => {
    offlineDraft.humanSide = humanSideSel.value;
  });
  updateOfflineModeUI();

  const aiSel = $("offline-ai-strategy");
  aiSel.value = offlineDraft.strategy;
  aiSel.addEventListener("change", () => {
    offlineDraft.strategy = aiSel.value;
    currentAIStrategy = aiSel.value;
    renderOfflineDraft();
  });

  $("offline-pool-all").addEventListener("click", () => {
    offlineDraft.pool = players.map((p) => p.name);
    renderOfflinePool();
  });
  $("offline-pool-top20").addEventListener("click", () => {
    const sorted = [...players].sort((a, b) => (b.mmr || 0) - (a.mmr || 0));
    offlineDraft.pool = sorted.slice(0, 20).map((p) => p.name);
    renderOfflinePool();
  });
  $("offline-pool-clear").addEventListener("click", () => {
    offlineDraft.pool = [];
    renderOfflinePool();
  });

  $("offline-start-draft").addEventListener("click", startOfflineDraft);
  $("offline-export-btn").addEventListener("click", exportOfflineResult);

  renderOfflinePool();
  renderOfflinePickOrder();
  renderOfflineDraft();
}

function renderOfflinePool() {
  const cont = $("offline-pool-list");
  cont.innerHTML = "";
  const poolSet = new Set(offlineDraft.pool);

  players.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item" + (poolSet.has(p.name) ? " selected" : "");
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent =
      "MMR: " +
      Math.round(p.mmr || 0) +
      ", DPM: " +
      Math.round(p.dpm || 0) +
      ", Tier: " +
      (p.tier || "D");

    const tag = document.createElement("span");
    tag.className = "tag tag-tier-" + (p.tier || "D");
    tag.textContent = p.tier || "D";

    item.appendChild(nameSpan);
    item.appendChild(meta);
    item.appendChild(tag);

    item.addEventListener("click", () => {
      if (poolSet.has(p.name)) {
        offlineDraft.pool = offlineDraft.pool.filter((n) => n !== p.name);
      } else {
        offlineDraft.pool.push(p.name);
      }
      renderOfflinePool();
    });

    cont.appendChild(item);
  });
}

function renderOfflinePickOrder() {
  const cont = $("offline-pick-order");
  cont.innerHTML = "";
  for (let i = 1; i <= offlineDraft.maxPick; i++) {
    const chip = document.createElement("div");
    chip.className = "pick-chip";
    const side = DRAFT_ORDER.cap1.includes(i) ? "К1" : "К2";
    chip.textContent = i + " (" + side + ")";
    if (i === offlineDraft.currentPick) chip.classList.add("current");
    cont.appendChild(chip);
  }
}

function getOfflineEnemyRoleCounts(side) {
  const enemyTeam = side === "team1" ? offlineDraft.team2 : offlineDraft.team1;
  const counts = {};
  enemyTeam.forEach((name) => {
    const p = players.find((x) => x.name === name);
    if (!p) return;
    safeRoles(p).forEach((r) => {
      counts[r] = (counts[r] || 0) + 1;
    });
  });
  return counts;
}

function aiPickOfflineCurrentSide() {
  if (offlineDraft.currentPick > offlineDraft.maxPick) return;
  const side = DRAFT_ORDER.cap1.includes(offlineDraft.currentPick)
    ? "team1"
    : "team2";
  const availSet = new Set(offlineDraft.available);
  let availablePlayers = players.filter((p) => availSet.has(p.name));
  if (!availablePlayers.length) {
    offlineDraft.currentPick = offlineDraft.maxPick + 1;
    return;
  }

  const strategy = offlineDraft.strategy || "balanced";
  let context = null;
  if (strategy === "counter_enemy") {
    context = { enemyRoleCounts: getOfflineEnemyRoleCounts(side) };
  }

  availablePlayers.sort((a, b) => {
    return (
      calcPlayerValue(b, strategy, context) -
      calcPlayerValue(a, strategy, context)
    );
  });

  const topN = Math.min(3, availablePlayers.length);
  const idxRand = Math.floor(Math.random() * topN);
  const picked = availablePlayers[idxRand];

  const idx = offlineDraft.available.indexOf(picked.name);
  if (idx !== -1) offlineDraft.available.splice(idx, 1);

  if (side === "team1") {
    if (!offlineDraft.team1.includes(picked.name))
      offlineDraft.team1.push(picked.name);
  } else {
    if (!offlineDraft.team2.includes(picked.name))
      offlineDraft.team2.push(picked.name);
  }
  offlineDraft.currentPick += 1;
}

function startOfflineDraft() {
  const err = $("offline-error");
  err.textContent = "";

  if (offlineDraft.pool.length < 10) {
    err.textContent = "Нужно минимум 10 игроков в пуле (2×5).";
    return;
  }

  offlineDraft.available = offlineDraft.pool.slice();
  offlineDraft.team1 = [];
  offlineDraft.team2 = [];
  offlineDraft.currentPick = 1;
  offlineDraft.maxPick = 8;

  if (offlineDraft.mode === "ai_vs_ai") {
    while (offlineDraft.currentPick <= offlineDraft.maxPick) {
      aiPickOfflineCurrentSide();
    }
    renderOfflinePickOrder();
    renderOfflineDraft();
    return;
  }

  renderOfflinePickOrder();
  renderOfflineDraft();
}

function renderOfflineDraft() {
  const t1 = $("offline-team1");
  const t2 = $("offline-team2");
  const avail = $("offline-available");
  const sug = $("offline-suggestions");

  t1.innerHTML = "";
  t2.innerHTML = "";
  avail.innerHTML = "";
  sug.innerHTML = "";

  offlineDraft.team1.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    t1.appendChild(li);
  });
  offlineDraft.team2.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    t2.appendChild(li);
  });

  if (offlineDraft.currentPick > offlineDraft.maxPick) {
    const msg = document.createElement("div");
    msg.className = "hint";
    msg.textContent = "Драфт завершён. Команды сформированы.";
    avail.appendChild(msg);
    return;
  }

  const pickNum = offlineDraft.currentPick;
  const side = DRAFT_ORDER.cap1.includes(pickNum) ? "team1" : "team2";
  const sideLabel = side === "team1" ? "Команда 1" : "Команда 2";

  const mode = offlineDraft.mode;
  const isHumanManual = mode === "manual";
  const isHumanSide =
    mode === "human_vs_ai" && offlineDraft.humanSide === side;
  const humanCanPick = isHumanManual || isHumanSide;

  if (mode === "human_vs_ai" && !isHumanSide) {
    // сейчас ход ИИ — сразу делаем пик и перерисовываем
    aiPickOfflineCurrentSide();
    renderOfflinePickOrder();
    renderOfflineDraft();
    return;
  }

  const headline = document.createElement("div");
  headline.className = "hint";
  if (humanCanPick) {
    headline.textContent =
      sideLabel + " — твой ход. Выбери игрока из доступных.";
  } else {
    headline.textContent = sideLabel + " — ход ИИ.";
  }
  avail.appendChild(headline);

  const availSet = new Set(offlineDraft.available);
  const strategy = offlineDraft.strategy || "balanced";
  let context = null;
  if (strategy === "counter_enemy") {
    context = { enemyRoleCounts: getOfflineEnemyRoleCounts(side) };
  }

  const availablePlayers = players.filter((p) => availSet.has(p.name));
  availablePlayers.sort((a, b) => {
    return (
      calcPlayerValue(b, strategy, context) -
      calcPlayerValue(a, strategy, context)
    );
  });

  availablePlayers.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent =
      "MMR: " +
      Math.round(p.mmr || 0) +
      ", DPM: " +
      Math.round(p.dpm || 0) +
      ", Tier: " +
      (p.tier || "D") +
      ", Роли: " +
      rolesToString(p);

    item.appendChild(nameSpan);
    item.appendChild(meta);

    if (humanCanPick) {
      item.addEventListener("click", () => {
        pickOffline(side, p.name);
      });
    } else {
      item.style.opacity = 0.7;
      item.style.cursor = "default";
    }

    avail.appendChild(item);
  });

  if (humanCanPick && availablePlayers.length > 0) {
    const best = availablePlayers[0];
    const alt = availablePlayers.slice(1, 5);
    const lines = [];
    lines.push(
      "Рекомендуемый пик: " +
        best.name +
        " (MMR " +
        Math.round(best.mmr || 0) +
        ", DPM " +
        Math.round(best.dpm || 0) +
        ", Tier " +
        (best.tier || "D") +
        ", Роли: " +
        rolesToString(best) +
        ")"
    );
    if (alt.length > 0) {
      lines.push("Альтернативы:");
      alt.forEach((p) => {
        lines.push(
          " - " +
            p.name +
            " (MMR " +
            Math.round(p.mmr || 0) +
            ", DPM " +
            Math.round(p.dpm || 0) +
            ", Tier " +
            (p.tier || "D") +
            ", Роли: " +
            rolesToString(p) +
            ")"
        );
      });
    }
    sug.innerHTML =
      "<strong>Подсказка ИИ:</strong><br>" + lines.join("<br>");
  }
}

function pickOffline(side, name) {
  const idx = offlineDraft.available.indexOf(name);
  if (idx === -1) return;
  offlineDraft.available.splice(idx, 1);
  if (side === "team1") {
    if (!offlineDraft.team1.includes(name)) offlineDraft.team1.push(name);
  } else {
    if (!offlineDraft.team2.includes(name)) offlineDraft.team2.push(name);
  }
  offlineDraft.currentPick += 1;
  renderOfflinePickOrder();
  renderOfflineDraft();
}

function exportOfflineResult() {
  const ta = $("offline-export-output");
  let text = "";
  text += "Map: " + offlineDraft.map + "\n\n";
  text += "Команда 1:\n";
  offlineDraft.team1.forEach((n) => {
    text += " - " + n + "\n";
  });
  text += "\nКоманда 2:\n";
  offlineDraft.team2.forEach((n) => {
    text += " - " + n + "\n";
  });
  ta.value = text;
  ta.focus();
  ta.select();
}

// ==========================
// Players screen (local DB)
// ==========================
let selectedPlayerName = null;

function initPlayersScreen() {
  $("players-filter-name").addEventListener("input", renderPlayersList);
  $("players-filter-tier").addEventListener("change", renderPlayersList);
  $("players-export-local").addEventListener("click", exportPlayersLocal);
  $("players-import-local").addEventListener("change", importPlayersLocalChange);
  renderPlayersList();
}

function renderPlayersList() {
  const cont = $("players-list");
  if (!cont) return;
  cont.innerHTML = "";

  const nameF = $("players-filter-name").value.trim().toLowerCase();
  const tierF = $("players-filter-tier").value;

  players
    .slice()
    .sort((a, b) => (b.mmr || 0) - (a.mmr || 0))
    .forEach((p) => {
      if (nameF && !p.name.toLowerCase().includes(nameF)) return;
      if (tierF && p.tier !== tierF) return;

      const item = document.createElement("div");
      item.className =
        "scroll-item" + (selectedPlayerName === p.name ? " selected" : "");
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = p.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent =
        "MMR: " +
        Math.round(p.mmr || 0) +
        ", DPM: " +
        Math.round(p.dpm || 0) +
        ", Tier: " +
        (p.tier || "D") +
        ", Роли: " +
        rolesToString(p);

      item.appendChild(nameSpan);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        selectedPlayerName = p.name;
        renderPlayersList();
        renderPlayerEdit(p);
      });

      cont.appendChild(item);
    });

  if (!selectedPlayerName) {
    renderPlayerEdit(null);
  }
}

function renderPlayerEdit(p) {
  const panel = $("player-edit-panel");
  if (!panel) return;
  panel.innerHTML = "";
  if (!p) {
    panel.innerHTML =
      '<p class="hint">Выбери игрока слева, чтобы отредактировать его статистику.</p>';
    return;
  }

  const rolesStr = rolesToString(p);

  panel.innerHTML =
    '<div class="form-row">' +
    '<label>Имя</label>' +
    '<input type="text" id="edit-name" value="' +
    p.name.replace(/"/g, "&quot;") +
    '" />' +
    "</div>" +
    '<div class="form-row">' +
    '<label>Tier</label>' +
    '<select id="edit-tier">' +
    '<option value="S"' +
    (p.tier === "S" ? " selected" : "") +
    ">S</option>" +
    '<option value="A"' +
    (p.tier === "A" ? " selected" : "") +
    ">A</option>" +
    '<option value="B"' +
    (p.tier === "B" ? " selected" : "") +
    ">B</option>" +
    '<option value="C"' +
    (p.tier === "C" ? " selected" : "") +
    ">C</option>" +
    '<option value="D"' +
    (!p.tier || p.tier === "D" ? " selected" : "") +
    ">D</option>" +
    '<option value="F"' +
    (p.tier === "F" ? " selected" : "") +
    ">F</option>" +
    "</select>" +
    "</div>" +
    '<div class="form-row">' +
    "<label>MMR</label>" +
    '<input type="number" id="edit-mmr" value="' +
    Math.round(p.mmr || 0) +
    '" />' +
    "</div>" +
    '<div class="form-row">' +
    "<label>DPM (средний урон)</label>" +
    '<input type="number" id="edit-dpm" value="' +
    Math.round(p.dpm || 0) +
    '" />' +
    "</div>" +
    '<div class="form-row">' +
    '<label>Роли (через запятую: infantry, tanks, artillery, mechanical, motorized_infantry, sapper, assault_infantry, at_artillery, aa_artillery, spg, heavy_tanks)</label>' +
    '<input type="text" id="edit-roles" value="' +
    rolesStr.replace(/"/g, "&quot;") +
    '" />' +
    "</div>" +
    '<button id="edit-save">Сохранить</button>';

  $("edit-save").addEventListener("click", () => {
    const name = $("edit-name").value.trim();
    const tier = $("edit-tier").value;
    const mmr = Number($("edit-mmr").value) || 0;
    const dpm = Number($("edit-dpm").value) || 0;
    const rolesRaw = $("edit-roles").value.trim();
    const roles = rolesRaw
      ? rolesRaw
          .split(",")
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      : [];

    p.name = name || p.name;
    p.tier = tier;
    p.mmr = mmr;
    p.dpm = dpm;
    p.roles = roles;

    savePlayersLocal();
    players = normalizePlayers(players);
    renderPlayersList();
    const updated = players.find((x) => x.name === p.name) || p;
    renderPlayerEdit(updated);
  });
}

function exportPlayersLocal() {
  const blob = new Blob([JSON.stringify(players, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "players-local.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importPlayersLocalChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) {
        alert("JSON должен быть массивом игроков.");
        return;
      }
      players = normalizePlayers(data);
      savePlayersLocal();
      renderPlayersList();
      $("player-edit-panel").innerHTML =
        '<p class="hint">Импорт выполнен, локальная база обновлена.</p>';
    } catch (err) {
      alert("Ошибка парсинга JSON: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ==========================
// Admin panel
// ==========================
function initAdminScreen() {
  const loginBtn = $("admin-login-btn");
  const loginStatus = $("admin-login-status");
  const adminActions = $("admin-actions");
  const pwdInput = $("admin-password");

  loginBtn.addEventListener("click", () => {
    const input = pwdInput.value;
    if (input === adminPassword) {
      loginStatus.textContent = "Админ-режим активирован.";
      adminActions.classList.remove("hidden");
    } else {
      loginStatus.textContent = "Неверный пароль.";
      adminActions.classList.add("hidden");
    }
  });

  $("admin-load-global").addEventListener("click", adminLoadGlobal);
  $("admin-save-global").addEventListener("click", adminSaveGlobal);
  $("admin-strategies-load").addEventListener(
    "click",
    adminStrategiesLoadToText
  );
  $("admin-strategies-save").addEventListener(
    "click",
    adminStrategiesSaveFromText
  );
  $("admin-change-password-btn").addEventListener(
    "click",
    adminChangePassword
  );
}

async function adminLoadGlobal() {
  const status = $("admin-actions-status");
  if (!supabase) initSupabase();
  if (!supabase) {
    status.textContent = "Supabase недоступен.";
    return;
  }
  status.textContent = "Загрузка глобальной базы из Supabase...";
  try {
    const { data, error } = await supabase
      .from("players_global")
      .select("data");
    if (error) {
      console.error(error);
      status.textContent = "Ошибка: " + error.message;
      return;
    }
    if (!Array.isArray(data) || !data.length) {
      status.textContent =
        "В таблице players_global пока нет данных. Сохрани туда локальную базу.";
      return;
    }
    const list = data.map((row) => row.data);
    players = normalizePlayers(list);
    savePlayersLocal();
    renderPlayersList();
    status.textContent = "Глобальная база загружена в локальную.";
  } catch (e) {
    console.error(e);
    status.textContent = "Ошибка загрузки: " + e.message;
  }
}

async function adminSaveGlobal() {
  const status = $("admin-actions-status");
  if (!supabase) initSupabase();
  if (!supabase) {
    status.textContent = "Supabase недоступен.";
    return;
  }
  status.textContent = "Сохранение локальной базы в Supabase...";
  try {
    const rows = players.map((p) => ({
      name: p.name,
      data: p,
    }));
    const { error } = await supabase
      .from("players_global")
      .upsert(rows, { onConflict: "name" });
    if (error) {
      console.error(error);
      status.textContent = "Ошибка: " + error.message;
      return;
    }
    status.textContent = "Глобальная база обновлена.";
  } catch (e) {
    console.error(e);
    status.textContent = "Ошибка сохранения: " + e.message;
  }
}

function adminStrategiesLoadToText() {
  const ta = $("admin-strategies-json");
  const obj = ROLE_WEIGHTS;
  ta.value = JSON.stringify(obj, null, 2);
}

function adminStrategiesSaveFromText() {
  const ta = $("admin-strategies-json");
  try {
    const obj = JSON.parse(ta.value);
    if (!obj || typeof obj !== "object") {
      alert("Нужно передать JSON-объект со стратегиями.");
      return;
    }
    ROLE_WEIGHTS = Object.assign({}, ROLE_WEIGHTS, obj);
    saveAIStrategiesLocal(ROLE_WEIGHTS);
    alert("Стратегии обновлены и сохранены локально.");
  } catch (e) {
    alert("Ошибка JSON: " + e.message);
  }
}

function adminChangePassword() {
  const masterInput = $("admin-master-password").value;
  const newPwd = $("admin-new-password").value;
  const status = $("admin-change-password-status");

  if (masterInput !== MASTER_PASSWORD) {
    status.textContent = "Неверный мастер-пароль сайта.";
    return;
  }
  if (!newPwd || newPwd.length < 4) {
    status.textContent = "Новый пароль слишком короткий.";
    return;
  }
  adminPassword = newPwd;
  saveAdminPassword();
  status.textContent =
    "Админ-пароль изменён локально. Теперь вход по новому паролю.";
}

// ==========================
// Online: helper
// ==========================
function ensureNickname() {
  const input = $("online-nickname");
  if (!input) return null;
  const nick = input.value.trim();
  return nick || null;
}

function renderOnlineParticipants() {
  const cont = $("online-participants");
  if (!cont) return;
  cont.innerHTML = "";
  online.participants.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.nickname;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent =
      p.role +
      (p.client_id === online.clientId ? " (ты)" : "");
    item.appendChild(nameSpan);
    item.appendChild(meta);
    cont.appendChild(item);
  });
}

// creator panel
function renderCreatorPanel() {
  const panel = $("online-creator-panel");
  if (!panel) return;
  if (!online.isCreator) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");

  const parts = online.participants || [];
  const cap1 = parts.find((p) => p.role === "captain1");
  const cap2 = parts.find((p) => p.role === "captain2");

  let html = "";
  html +=
    '<p class="hint">Панель создателя комнаты: назначай капитанов, кикай лишних и передрафчивай матч.</p>';
  html += '<div class="form-row"><label>Капитан 1</label><select id="creator-cap1-select"></select></div>';
  html += '<div class="form-row"><label>Капитан 2</label><select id="creator-cap2-select"></select></div>';
  html += '<button id="creator-apply-roles">Применить роли</button>';
  html += '<div class="form-row"><label>Кикнуть пользователя из комнаты</label><select id="creator-kick-select"></select></div>';
  html += '<button id="creator-kick-btn">Кикнуть</button>';
  html += '<hr style="border-color:#333;margin:8px 0;" />';
  html += '<div class="form-row"><label>Новый пароль комнаты (можно оставить пустым)</label><input type="password" id="creator-new-password" /></div>';
  html += '<button id="creator-change-password">Обновить пароль комнаты</button>';
  html += '<hr style="border-color:#333;margin:8px 0;" />';
  html += '<button id="creator-reset-draft">Передрафтить (начать матч заново)</button>';

  panel.innerHTML = html;

  const selCap1 = $("creator-cap1-select");
  const selCap2 = $("creator-cap2-select");
  const selKick = $("creator-kick-select");

  parts.forEach((p) => {
    const opt1 = document.createElement("option");
    opt1.value = p.id;
    opt1.textContent = p.nickname + " (" + p.role + ")";
    selCap1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = p.id;
    opt2.textContent = p.nickname + " (" + p.role + ")";
    selCap2.appendChild(opt2);

    const optK = document.createElement("option");
    optK.value = p.id;
    optK.textContent = p.nickname + " (" + p.role + ")";
    selKick.appendChild(optK);
  });

  if (cap1) selCap1.value = String(cap1.id);
  if (cap2) selCap2.value = String(cap2.id);

  $("creator-apply-roles").addEventListener("click", applyCreatorRoles);
  $("creator-kick-btn").addEventListener("click", kickParticipant);
  $("creator-change-password").addEventListener(
    "click",
    changeRoomPasswordOnline
  );
  $("creator-reset-draft").addEventListener("click", startOnlineDraft);
}

async function applyCreatorRoles() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;
  const id1 = $("creator-cap1-select").value;
  const id2 = $("creator-cap2-select").value;

  const ids = online.participants.map((p) => p.id);
  if (!ids.length) return;
  try {
    await supabase
      .from("room_participants")
      .update({ role: "spectator" })
      .in("id", ids);
    if (id1) {
      await supabase
        .from("room_participants")
        .update({ role: "captain1" })
        .eq("id", id1);
    }
    if (id2 && id2 !== id1) {
      await supabase
        .from("room_participants")
        .update({ role: "captain2" })
        .eq("id", id2);
    }
    await loadOnlineParticipants();
  } catch (e) {
    console.error(e);
  }
}

async function kickParticipant() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;
  const id = $("creator-kick-select").value;
  if (!id) return;
  try {
    await supabase.from("room_participants").delete().eq("id", id);
    await loadOnlineParticipants();
  } catch (e) {
    console.error(e);
  }
}

async function changeRoomPasswordOnline() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;
  const newPwd = $("creator-new-password").value || null;
  try {
    await supabase
      .from("rooms")
      .update({ password: newPwd })
      .eq("id", online.roomId);
  } catch (e) {
    console.error(e);
  }
}

async function loadOnlineParticipants() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;
  try {
    const { data, error } = await supabase
      .from("room_participants")
      .select("*")
      .eq("room_id", online.roomId);
    if (error) {
      console.error(error);
      return;
    }
    online.participants = data || [];
    const me = online.participants.find(
      (p) => p.client_id === online.clientId
    );
    if (me) {
      online.myRole = me.role;
      const roleLabel =
        me.role === "captain1"
          ? "Капитан 1"
          : me.role === "captain2"
          ? "Капитан 2"
          : "Зритель";
      $("online-my-role").textContent = roleLabel;
    }
    renderOnlineParticipants();
    renderCreatorPanel();
  } catch (e) {
    console.error(e);
  }
}

// ==========================
// Online: rooms list
// ==========================
async function refreshRoomsList() {
  const cont = $("online-rooms-list");
  cont.innerHTML = "";
  if (!supabase) initSupabase();
  if (!supabase) {
    cont.textContent = "Supabase недоступен.";
    return;
  }
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, code, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      cont.textContent = "Ошибка загрузки списка комнат.";
      return;
    }
    if (!data || !data.length) {
      cont.textContent = "Активных комнат пока нет.";
      return;
    }
    data.forEach((room) => {
      const item = document.createElement("div");
      item.className = "scroll-item";
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = "Комната " + room.code;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent =
        "ID " +
        room.id +
        " • " +
        new Date(room.created_at).toLocaleString();
      item.appendChild(nameSpan);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        $("online-join-code").value = room.code;
      });
      cont.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    cont.textContent = "Ошибка списка комнат: " + e.message;
  }
}

// ==========================
// Online: create / join
// ==========================
function initOnlineScreen() {
  if (!supabase) initSupabase();

  const mapSel = $("online-map-select");
  mapSel.innerHTML = "";
  MAPS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mapSel.appendChild(opt);
  });
  mapSel.value = online.draft.map;
  mapSel.addEventListener("change", () => {
    online.draft.map = mapSel.value;
    if (online.roomId && (online.isCreator || online.myRole !== "spectator")) {
      syncOnlineState();
    }
  });

  const modeSel = $("online-mode-select");
  modeSel.value = online.selectedMode;
  modeSel.addEventListener("change", () => {
    online.selectedMode = modeSel.value;
  });

  const aiSel = $("online-ai-strategy");
  aiSel.value = currentAIStrategy;
  aiSel.addEventListener("change", () => {
    currentAIStrategy = aiSel.value;
    if (online.roomId && online.isCreator) {
      online.draft.strategy = currentAIStrategy;
      syncOnlineState();
    }
  });

  $("online-create-room").addEventListener("click", createOnlineRoom);
  $("online-join-room").addEventListener("click", joinOnlineRoom);
  $("online-start-draft").addEventListener("click", startOnlineDraft);
  $("online-refresh-rooms").addEventListener("click", refreshRoomsList);

  refreshRoomsList();
}

async function createOnlineRoom() {
  const out = $("online-create-result");
  const nick = ensureNickname();
  if (!nick) {
    out.textContent = "Сначала введи ник.";
    return;
  }
  if (!supabase) initSupabase();
  if (!supabase) {
    out.textContent = "Supabase недоступен.";
    return;
  }

  online.nickname = nick;
  const pwd = $("online-create-password").value || null;

  out.textContent = "Проверка лимита комнат...";
  try {
    const { count, error: countError } = await supabase
      .from("rooms")
      .select("*", { count: "exact", head: true });
    if (countError) {
      console.error(countError);
      out.textContent =
        "Ошибка проверки лимита: " + countError.message;
      return;
    }
    if ((count || 0) >= 50) {
      out.textContent =
        "Достигнут лимит 50 комнат. Удалите старые комнаты или подождите автоочистку.";
      return;
    }

    const code = Math.random().toString(36).substring(2, 7).toUpperCase();

    out.textContent = "Создание комнаты...";
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code: code,
        password: pwd,
        created_by: online.clientId,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      out.textContent = "Ошибка создания: " + error.message;
      return;
    }

    online.roomId = data.id;
    online.roomCode = data.code;
    online.isCreator = true;
    online.myRole = "captain1";
    online.matchStatus = "lobby";

    $("online-room-code").textContent = online.roomCode;
    $("online-my-role").textContent = "Капитан 1";
    $("online-match-status").textContent = "Лобби";
    $("online-room-section").classList.remove("hidden");

    online.draft = {
      map: MAPS[0],
      pool: players.map((p) => p.name),
      available: players.map((p) => p.name),
      team1: [],
      team2: [],
      currentPick: 1,
      maxPick: 8,
      mode: "human_vs_human",
      strategy: currentAIStrategy || "balanced",
    };
    $("online-map-select").value = online.draft.map;
    $("online-ai-strategy").value = online.draft.strategy;

    await supabase.from("room_state").upsert({
      room_id: online.roomId,
      state: online.draft,
    });

    await supabase.from("room_participants").upsert(
      {
        room_id: online.roomId,
        client_id: online.clientId,
        nickname: online.nickname,
        role: "captain1",
      },
      { onConflict: "room_id,client_id" }
    );

    setupOnlineSubscriptions();
    renderOnlineDraft();
    await loadOnlineParticipants();
    out.textContent = "Комната создана. Код: " + online.roomCode;
    refreshRoomsList();
  } catch (e) {
    console.error(e);
    out.textContent = "Ошибка создания комнаты: " + e.message;
  }
}

async function joinOnlineRoom() {
  const out = $("online-join-result");
  const nick = ensureNickname();
  if (!nick) {
    out.textContent = "Сначала введи ник.";
    return;
  }
  if (!supabase) initSupabase();
  if (!supabase) {
    out.textContent = "Supabase недоступен.";
    return;
  }

  online.nickname = nick;
  const code = $("online-join-code").value.trim().toUpperCase();
  const pwd = $("online-join-password").value;

  if (!code) {
    out.textContent = "Введи код комнаты.";
    return;
  }

  out.textContent = "Поиск комнаты...";
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();
    if (error) {
      console.error(error);
      out.textContent = "Комната не найдена.";
      return;
    }
    if (data.password && data.password !== pwd) {
      out.textContent = "Неверный пароль комнаты.";
      return;
    }

    online.roomId = data.id;
    online.roomCode = data.code;
    online.isCreator = data.created_by === online.clientId;
    online.myRole = "spectator";
    online.matchStatus = "lobby";

    $("online-room-code").textContent = online.roomCode;
    $("online-my-role").textContent = "Зритель";
    $("online-match-status").textContent = "Лобби";
    $("online-room-section").classList.remove("hidden");

    await supabase.from("room_participants").upsert(
      {
        room_id: online.roomId,
        client_id: online.clientId,
        nickname: online.nickname,
        role: "spectator",
      },
      { onConflict: "room_id,client_id" }
    );

    const { data: stData, error: stErr } = await supabase
      .from("room_state")
      .select("state")
      .eq("room_id", online.roomId)
      .single();
    if (stErr || !stData) {
      online.draft = {
        map: MAPS[0],
        pool: players.map((p) => p.name),
        available: players.map((p) => p.name),
        team1: [],
        team2: [],
        currentPick: 1,
        maxPick: 8,
        mode: "human_vs_human",
        strategy: currentAIStrategy || "balanced",
      };
      await supabase.from("room_state").upsert({
        room_id: online.roomId,
        state: online.draft,
      });
    } else {
      online.draft = stData.state;
    }

    $("online-map-select").value = online.draft.map;
    $("online-mode-select").value = online.draft.mode || "human_vs_human";
    $("online-ai-strategy").value =
      online.draft.strategy || currentAIStrategy || "balanced";

    setupOnlineSubscriptions();
    renderOnlineDraft();
    await loadOnlineParticipants();

    out.textContent = "Подключено к комнате.";
  } catch (e) {
    console.error(e);
    out.textContent = "Ошибка входа в комнату: " + e.message;
  }
}

function setupOnlineSubscriptions() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;

  if (online.roomStateChannel) supabase.removeChannel(online.roomStateChannel);
  if (online.participantsChannel)
    supabase.removeChannel(online.participantsChannel);

  online.roomStateChannel = supabase
    .channel("room_state_" + online.roomId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_state",
        filter: "room_id=eq." + online.roomId,
      },
      (payload) => {
        if (!payload.new) return;
        online.draft = payload.new.state;
        $("online-map-select").value = online.draft.map;
        $("online-mode-select").value = online.draft.mode || "human_vs_human";
        $("online-ai-strategy").value =
          online.draft.strategy || currentAIStrategy || "balanced";

        if (online.draft.currentPick > online.draft.maxPick) {
          online.matchStatus = "finished";
          $("online-match-status").textContent = "Драфт завершён";
        } else if (online.draft.currentPick === 1) {
          online.matchStatus = "лobby";
          $("online-match-status").textContent = "Лобби";
        } else {
          online.matchStatus = "drafting";
          $("online-match-status").textContent = "Драфт идёт";
        }
        renderOnlineDraft();
      }
    )
    .subscribe();

  online.participantsChannel = supabase
    .channel("room_participants_" + online.roomId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_participants",
        filter: "room_id=eq." + online.roomId,
      },
      () => {
        loadOnlineParticipants();
      }
    )
    .subscribe();
}

// ==========================
// Online draft core
// ==========================
async function syncOnlineState() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;
  await supabase
    .from("room_state")
    .update({ state: online.draft })
    .eq("room_id", online.roomId);
}

function renderOnlineDraft() {
  const t1 = $("online-team1");
  const t2 = $("online-team2");
  const avail = $("online-available");
  const sug = $("online-suggestions");
  const pickRow = $("online-pick-order");
  const block = $("online-draft-block");

  if (!t1 || !t2 || !avail || !sug || !pickRow || !block) return;

  t1.innerHTML = "";
  t2.innerHTML = "";
  avail.innerHTML = "";
  sug.innerHTML = "";
  pickRow.innerHTML = "";

  online.draft.team1.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    t1.appendChild(li);
  });
  online.draft.team2.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    t2.appendChild(li);
  });

  for (let i = 1; i <= online.draft.maxPick; i++) {
    const chip = document.createElement("div");
    chip.className = "pick-chip";
    const side = DRAFT_ORDER.cap1.includes(i) ? "К1" : "К2";
    chip.textContent = i + " (" + side + ")";
    if (i === online.draft.currentPick) chip.classList.add("current");
    pickRow.appendChild(chip);
  }

  block.classList.remove("hidden");

  const mode = online.draft.mode || "human_vs_human";

  if (
    online.roomId &&
    online.isCreator &&
    online.draft.currentPick <= online.draft.maxPick
  ) {
    const pickNum = online.draft.currentPick;
    const sideRole = DRAFT_ORDER.cap1.includes(pickNum)
      ? "captain1"
      : "captain2";
    if (mode === "human_vs_ai" && sideRole === "captain2") {
      aiPickOnlineCurrentSide();
      return;
    }
    if (mode === "ai_vs_ai") {
      aiPickOnlineCurrentSide();
      return;
    }
  }

  if (online.draft.currentPick > online.draft.maxPick) {
    const msg = document.createElement("div");
    msg.className = "hint";
    msg.textContent = "Драфт завершён. Команды сформированы.";
    avail.appendChild(msg);
    return;
  }

  const pickNum = online.draft.currentPick;
  const side = DRAFT_ORDER.cap1.includes(pickNum) ? "team1" : "team2";
  const sideLabel = side === "team1" ? "Команда 1" : "Команда 2";
  const sideRole = side === "team1" ? "captain1" : "captain2";

  const isMyTurn =
    (online.draft.mode === "human_vs_human" &&
      online.myRole === sideRole) ||
    (online.draft.mode === "human_vs_ai" &&
      online.myRole === "captain1" &&
      sideRole === "captain1");

  const headline = document.createElement("div");
  headline.className = "hint";
  headline.textContent =
    sideLabel + (isMyTurn ? " — твой ход." : " — ход противника.");
  avail.appendChild(headline);

  const availSet = new Set(online.draft.available);
  const strategy = online.draft.strategy || currentAIStrategy || "balanced";
  let context = null;
  if (strategy === "counter_enemy") {
    const enemyTeam = side === "team1" ? online.draft.team2 : online.draft.team1;
    const counts = {};
    enemyTeam.forEach((name) => {
      const p = players.find((x) => x.name === name);
      if (!p) return;
      safeRoles(p).forEach((r) => {
        counts[r] = (counts[r] || 0) + 1;
      });
    });
    context = { enemyRoleCounts: counts };
  }

  const availablePlayers = players.filter((p) => availSet.has(p.name));
  availablePlayers.sort((a, b) => {
    return (
      calcPlayerValue(b, strategy, context) -
      calcPlayerValue(a, strategy, context)
    );
  });

  availablePlayers.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent =
      "MMR: " +
      Math.round(p.mmr || 0) +
      ", DPM: " +
      Math.round(p.dpm || 0) +
      ", Tier: " +
      (p.tier || "D") +
      ", Роли: " +
      rolesToString(p);
    item.appendChild(nameSpan);
    item.appendChild(meta);

    if (isMyTurn) {
      item.addEventListener("click", () => {
        pickOnline(side, p.name);
      });
    } else {
      item.style.opacity = 0.7;
      item.style.cursor = "default";
    }

    avail.appendChild(item);
  });

  if (isMyTurn && availablePlayers.length > 0) {
    const best = availablePlayers[0];
    const alt = availablePlayers.slice(1, 5);
    const lines = [];
    lines.push(
      "Рекомендуемый пик: " +
        best.name +
        " (MMR " +
        Math.round(best.mmr || 0) +
        ", DPM " +
        Math.round(best.dpm || 0) +
        ", Tier " +
        (best.tier || "D") +
        ", Роли: " +
        rolesToString(best) +
        ")"
    );
    if (alt.length > 0) {
      lines.push("Альтернативы:");
      alt.forEach((p) => {
        lines.push(
          " - " +
            p.name +
            " (MMR " +
            Math.round(p.mmr || 0) +
            ", DPM " +
            Math.round(p.dpm || 0) +
            ", Tier " +
            (p.tier || "D") +
            ", Роли: " +
            rolesToString(p) +
            ")"
        );
      });
    }
    sug.innerHTML =
      "<strong>Подсказка ИИ (видишь только ты):</strong><br>" +
      lines.join("<br>");
  }
}

async function startOnlineDraft() {
  const err = $("online-error");
  err.textContent = "";
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) {
    err.textContent = "Нет подключения к комнате.";
    return;
  }
  if (!online.isCreator) {
    err.textContent =
      "Только создатель комнаты может запускать/передрафчивать матч.";
    return;
  }

  const modeSel = $("online-mode-select");
  const mode = modeSel.value || "human_vs_human";

  online.draft.mode = mode;
  online.selectedMode = mode;
  online.draft.map = $("online-map-select").value;
  online.draft.pool = players.map((p) => p.name);
  online.draft.available = online.draft.pool.slice();
  online.draft.team1 = [];
  online.draft.team2 = [];
  online.draft.currentPick = 1;
  online.draft.maxPick = 8;
  online.draft.strategy =
    $("online-ai-strategy").value || currentAIStrategy || "balanced";

  online.matchStatus = "drafting";
  $("online-match-status").textContent = "Драфт идёт";

  await syncOnlineState();
  renderOnlineDraft();
}

async function pickOnline(side, name) {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;

  const pickNum = online.draft.currentPick;
  const sideRole = DRAFT_ORDER.cap1.includes(pickNum)
    ? "captain1"
    : "captain2";

  const mode = online.draft.mode || "human_vs_human";
  let allowed = false;
  if (mode === "human_vs_human") {
    allowed = online.myRole === sideRole;
  } else if (mode === "human_vs_ai") {
    allowed = online.myRole === "captain1" && sideRole === "captain1";
  }

  if (!allowed) return;

  const idx = online.draft.available.indexOf(name);
  if (idx === -1) return;
  online.draft.available.splice(idx, 1);
  if (side === "team1") {
    if (!online.draft.team1.includes(name)) online.draft.team1.push(name);
  } else {
    if (!online.draft.team2.includes(name)) online.draft.team2.push(name);
  }
  online.draft.currentPick += 1;
  if (online.draft.currentPick > online.draft.maxPick) {
    online.matchStatus = "finished";
  } else {
    online.matchStatus = "drafting";
  }
  await syncOnlineState();
}

async function aiPickOnlineCurrentSide() {
  if (!supabase) initSupabase();
  if (!supabase || !online.roomId) return;

  const pickNum = online.draft.currentPick;
  if (pickNum > online.draft.maxPick) return;
  const side = DRAFT_ORDER.cap1.includes(pickNum) ? "team1" : "team2";
  const strategy = online.draft.strategy || currentAIStrategy || "balanced";

  const availSet = new Set(online.draft.available);
  let availablePlayers = players.filter((p) => availSet.has(p.name));
  if (!availablePlayers.length) {
    online.draft.currentPick = online.draft.maxPick + 1;
    online.matchStatus = "finished";
    await syncOnlineState();
    return;
  }

  let context = null;
  if (strategy === "counter_enemy") {
    const enemyTeam = side === "team1" ? online.draft.team2 : online.draft.team1;
    const counts = {};
    enemyTeam.forEach((name) => {
      const p = players.find((x) => x.name === name);
      if (!p) return;
      safeRoles(p).forEach((r) => {
        counts[r] = (counts[r] || 0) + 1;
      });
    });
    context = { enemyRoleCounts: counts };
  }

  availablePlayers.sort((a, b) => {
    return (
      calcPlayerValue(b, strategy, context) -
      calcPlayerValue(a, strategy, context)
    );
  });

  const topN = Math.min(3, availablePlayers.length);
  const idxRand = Math.floor(Math.random() * topN);
  const picked = availablePlayers[idxRand];

  const idx = online.draft.available.indexOf(picked.name);
  if (idx !== -1) online.draft.available.splice(idx, 1);
  if (side === "team1") {
    if (!online.draft.team1.includes(picked.name))
      online.draft.team1.push(picked.name);
  } else {
    if (!online.draft.team2.includes(picked.name))
      online.draft.team2.push(picked.name);
  }
  online.draft.currentPick += 1;
  if (online.draft.currentPick > online.draft.maxPick) {
    online.matchStatus = "finished";
  } else {
    online.matchStatus = "drafting";
  }
  await syncOnlineState();
}

// ==========================
// Init all
// ==========================
window.addEventListener("load", async () => {
  // generic hidden class
  // (CSS already has .hidden display:none, но на всякий случай)
  document.body.classList.remove("no-js");

  // client id
  let cid = localStorage.getItem(STORAGE_KEYS.clientId);
  if (!cid && window.crypto && crypto.randomUUID) {
    cid = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.clientId, cid);
  } else if (!cid) {
    cid = String(Date.now()) + "_" + Math.floor(Math.random() * 100000);
    localStorage.setItem(STORAGE_KEYS.clientId, cid);
  }
  online.clientId = cid;

  loadAdminPassword();
  loadAIStrategiesLocal();
  await loadPlayers();

  // menu navigation
  document.querySelectorAll(".menu-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      if (target === "offline") showScreen("screen-offline");
      else if (target === "online") showScreen("screen-online");
      else if (target === "players") showScreen("screen-players");
      else if (target === "admin") showScreen("screen-admin");
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen("screen-menu"));
  });

  initOffline();
  initPlayersScreen();
  initAdminScreen();
  initOnlineScreen();

  showScreen("screen-menu");
});
