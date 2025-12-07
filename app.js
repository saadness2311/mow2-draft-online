
// MoW 2 Draft Project - V11 core logic

// --- Константы и глобальные переменные ---

const MAPS = [
  "Airfield","Bazerville","Borovaya River","Carpathians","Champagne","Coast","Dead River",
  "Estate","Farm Land","Hunting Grounds","Kursk Fields","Nameless Height","Polesie","Port",
  "Saint Lo","Suburb","Valley of Death","Village","Volokalamsk Highway","Witches Vale",
  "Winter March","Chepel","Crossroads","Sandy Path","Marl"
];

// Порядок пиков – жёстко по ТЗ
const DRAFT_ORDER = [
  { pick: 1, captain: "cap1", team: "team1" },
  { pick: 2, captain: "cap2", team: "team2" },
  { pick: 3, captain: "cap2", team: "team2" },
  { pick: 4, captain: "cap1", team: "team1" },
  { pick: 5, captain: "cap1", team: "team1" },
  { pick: 6, captain: "cap2", team: "team2" },
  { pick: 7, captain: "cap1", team: "team1" },
  { pick: 8, captain: "cap2", team: "team2" },
];

// Tier множители (конфиг)
const TIER_MULTIPLIERS = {
  "S": 10,
  "A": 2,
  "B": 1.4,
  "C": 1.1,
  "D": 1,
  "F": 0.7
};

// Базовые веса ролей по стратегиям (текущий активный набор)
let ROLE_WEIGHTS = {
  balanced: {
    infantry: 2.0,
    motorized_infantry: 1.8,
    assault_infantry: 1.8,
    mechanical: 1.5,
    tanks: 1.6,
    heavy_tanks: 1.7,
    artillery: 0.6,
    at_artillery: 1.4,
    aa_artillery: 1.2,
    spg: 1.4,
    sapper: 1.2
  },
  max_dpm: {
    infantry: 1,
    motorized_infantry: 1,
    assault_infantry: 1,
    mechanical: 1,
    tanks: 1,
    heavy_tanks: 1,
    artillery: 1,
    at_artillery: 1,
    aa_artillery: 1,
    spg: 1,
    sapper: 1
  },
  infantry_focus: {
    infantry: 2.5,
    motorized_infantry: 1.8,
    assault_infantry: 2.2,
    mechanical: 1.2,
    tanks: 1.2,
    heavy_tanks: 1.3,
    artillery: 0.5,
    at_artillery: 1.1,
    aa_artillery: 1.0,
    spg: 0.8,
    sapper: 1.4
  },
  motorized_focus: {
    infantry: 1.3,
    motorized_infantry: 2.4,
    assault_infantry: 1.8,
    mechanical: 1.8,
    tanks: 1.6,
    heavy_tanks: 1.5,
    artillery: 0.6,
    at_artillery: 1.2,
    aa_artillery: 1.0,
    spg: 1.2,
    sapper: 1.1
  },
  tanks_focus: {
    infantry: 1.0,
    motorized_infantry: 1.2,
    assault_infantry: 1.1,
    mechanical: 1.6,
    tanks: 2.6,
    heavy_tanks: 2.8,
    artillery: 0.5,
    at_artillery: 1.8,
    aa_artillery: 0.9,
    spg: 1.9,
    sapper: 1.0
  },
  artillery_focus: {
    infantry: 1.0,
    motorized_infantry: 1.0,
    assault_infantry: 1.0,
    mechanical: 1.1,
    tanks: 1.2,
    heavy_tanks: 1.1,
    artillery: 2.5,
    at_artillery: 2.1,
    aa_artillery: 2.0,
    spg: 2.2,
    sapper: 1.3
  },
  infantry_mech_mix: {
    infantry: 2.3,
    motorized_infantry: 2.0,
    assault_infantry: 2.0,
    mechanical: 1.9,
    tanks: 1.5,
    heavy_tanks: 1.4,
    artillery: 0.6,
    at_artillery: 1.3,
    aa_artillery: 1.0,
    spg: 1.1,
    sapper: 1.4
  },
  heavy_at_focus: {
    infantry: 1.0,
    motorized_infantry: 1.1,
    assault_infantry: 1.2,
    mechanical: 1.2,
    tanks: 1.7,
    heavy_tanks: 2.8,
    artillery: 1.0,
    at_artillery: 2.5,
    aa_artillery: 1.1,
    spg: 2.4,
    sapper: 1.3
  },
  aa_defense: {
    infantry: 1.2,
    motorized_infantry: 1.3,
    assault_infantry: 1.1,
    mechanical: 1.4,
    tanks: 1.2,
    heavy_tanks: 1.1,
    artillery: 1.0,
    at_artillery: 1.3,
    aa_artillery: 2.6,
    spg: 1.1,
    sapper: 1.9
  },
  counter_enemy: {
    infantry: 1.4,
    motorized_infantry: 1.4,
    assault_infantry: 1.3,
    mechanical: 1.4,
    tanks: 1.4,
    heavy_tanks: 1.5,
    artillery: 1.3,
    at_artillery: 1.6,
    aa_artillery: 1.6,
    spg: 1.6,
    sapper: 1.4
  }
};

// Локальные/глобальные наборы стратегий и выбор источника
let roleWeightsLocal = null;
let roleWeightsGlobal = null;
let activeStrategySource = "global"; // global | local

// Глобальные массивы игроков
let playersLocal = [];
let playersGlobal = [];
let activeDataset = "local";
let players = []; // текущий рабочий массив

// Оффлайн драфт состояние
const offlineDraft = {
  map: MAPS[0],
  mode: "human_vs_ai",
  humanSide: "team1",
  strategy1: "balanced",
  strategy2: "balanced",
  captain1: null,
  captain2: null,
  pool: [],
  available: [],
  team1: [],
  team2: [],
  currentPickIndex: 0,
  finished: false
};

// Онлайн состояние (упрощённо)
const onlineState = {
  supabase: null,
  room: null,
  myParticipantId: null,
  myRole: "viewer",
  isCreator: false,
  draft: null,
  adminPassword: "kozakuapro",
  isAdmin: false
};

const MASTER_PASSWORD = "kozakuaproloh";
const ROOMS_LIMIT = 50;

// --- Утилиты ---

function $(id) {
  return document.getElementById(id);
}

function safeRoles(p) {
  if (!p) return [];
  const r = p.roles;
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (typeof r === "string") {
    return r.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (typeof r === "object") {
    return Object.keys(r).filter(k => !!r[k]);
  }
  return [];
}

function tierMultiplier(tier) {
  return TIER_MULTIPLIERS[tier] || TIER_MULTIPLIERS["D"];
}

function round(v) {
  return Math.round(v || 0);
}

// Нормализация игрока под единый формат
function normalizePlayer(raw) {
  const p = { ...raw };

  p.name = p.name || "Unknown";
  p.tier = p.tier || "D";

  // Статы: сначала ищем в stats, потом на верхнем уровне
  let mmr = 0;
  let dpm = 0;
  if (p.stats && typeof p.stats === "object") {
    if (p.stats.mmr != null) mmr = Number(p.stats.mmr);
    if (p.stats.dpm != null) dpm = Number(p.stats.dpm);
  }
  if (!mmr && p.mmr != null) mmr = Number(p.mmr);
  if (!dpm && p.dpm != null) dpm = Number(p.dpm);

  p.mmr = mmr || 0;
  p.dpm = dpm || 0;

  p.roles = safeRoles(p);
  if (!Array.isArray(p.roles)) p.roles = [];

  return p;
}

function normalizePlayers(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizePlayer);
}

// --- Загрузка / сохранение локальной базы игроков ---

function loadPlayersLocal() {
  try {
    const cached = localStorage.getItem("mow2_players_local_v11");
    if (cached) {
      playersLocal = normalizePlayers(JSON.parse(cached));
      players = playersLocal;
      populateOfflineCaptains();
      populateOnlineCaptains();
      renderOfflinePool();
      return;
    }
  } catch (e) {
    console.warn("Failed to load local players cache", e);
  }
  fetch("players.json")
    .then(r => r.json())
    .then(data => {
      playersLocal = normalizePlayers(data);
      players = playersLocal;
      populateOfflineCaptains();
      populateOnlineCaptains();
      renderOfflinePool();
    })
    .catch(err => {
      console.error("Failed to load players.json", err);
      playersLocal = [];
      players = playersLocal;
      populateOfflineCaptains();
      populateOnlineCaptains();
      renderOfflinePool();
    });
}

function savePlayersLocal() {
  try {
    localStorage.setItem("mow2_players_local_v11", JSON.stringify(playersLocal));
  } catch (e) {
    console.warn("Failed to save local players", e);
  }
}

// --- Загрузка / сохранение стратегий ---
function loadStrategiesLocal() {
  try {
    const cached = localStorage.getItem("mow2_ai_strategies_v11");
    if (cached) {
      roleWeightsLocal = JSON.parse(cached);
    }
  } catch (e) {
    console.warn("Failed to load local strategies", e);
  }
  if (!roleWeightsLocal) {
    roleWeightsLocal = JSON.parse(JSON.stringify(ROLE_WEIGHTS));
  }
}

function saveStrategiesLocal() {
  try {
    localStorage.setItem("mow2_ai_strategies_v11", JSON.stringify(roleWeightsLocal));
  } catch (e) {
    console.warn("Failed to save strategies", e);
  }
}

// --- Supabase ---

function initSupabase() {
  if (onlineState.supabase) return onlineState.supabase;
  const url = "https://utfudifzuytzbwnxqpcf.supabase.co";
  const key = "sb_publishable_duqpINIqRBZBtmifX5q94Q_bnc-uuxm";
  onlineState.supabase = window.supabase.createClient(url, key);
  return onlineState.supabase;
}

// Пытаемся подгрузить глобальный админ-пароль из Supabase
async function loadAdminPasswordGlobal() {
  try {
    const supabase = initSupabase();
    const { data, error } = await supabase
      .from("admin_config")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();
    if (!error && data && data.value) {
      onlineState.adminPassword = String(data.value);
    }
  } catch (e) {
    console.warn("Failed to load admin password from Supabase", e);
  }
}

async function loadStrategiesGlobal() {
  try {
    const supabase = initSupabase();
    const { data, error } = await supabase
      .from("admin_config")
      .select("value")
      .eq("key", "ai_strategies")
      .maybeSingle();
    if (!error && data && data.value) {
      roleWeightsGlobal = JSON.parse(data.value);
    }
  } catch (e) {
    console.warn("Failed to load global strategies", e);
  }
  if (!roleWeightsGlobal) {
    roleWeightsGlobal = JSON.parse(JSON.stringify(ROLE_WEIGHTS));
  }
  applyStrategySource();
}

function applyStrategySource() {
  const stored = localStorage.getItem("mow2_strategy_source");
  if (stored === "local" || stored === "global") {
    activeStrategySource = stored;
  }
  if (activeStrategySource === "local" && roleWeightsLocal) {
    ROLE_WEIGHTS = roleWeightsLocal;
  } else if (roleWeightsGlobal) {
    ROLE_WEIGHTS = roleWeightsGlobal;
  }
}

// --- Меню и переходы между экранами ---

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById("screen-" + id);
  if (el) el.classList.add("active");
  if (id === "players") renderPlayersList();
}

function initMenu() {
  document.querySelectorAll(".menu-card").forEach(card => {
    card.addEventListener("click", () => {
      const target = card.getAttribute("data-target");
      if (!target) return;
      if (target === "offline") showScreen("offline");
      if (target === "online") showScreen("online");
      if (target === "players") showScreen("players");
      if (target === "admin") showScreen("admin");
    });
  });
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showScreen("menu"));
  });
}

// Краткая сводка по игрокам в главном меню
function renderMenuSummary() {
  const box = $("menu-players-summary");
  if (!box) return;
  const src = players || [];
  if (!src.length) {
    box.innerHTML = "<div class='hint'>База игроков ещё не загружена.</div>";
    return;
  }
  const total = src.length;
  const tierCounts = { S:0,A:0,B:0,C:0,D:0,F:0 };
  src.forEach(p => {
    const t = p.tier || "D";
    if (tierCounts[t] == null) tierCounts[t] = 0;
    tierCounts[t]++;
  });
  box.innerHTML = `
    <h3>Сводка по базе игроков</h3>
    <div class="hint small">
      Всего игроков: <strong>${total}</strong>. 
      S: ${tierCounts.S || 0}, A: ${tierCounts.A || 0}, B: ${tierCounts.B || 0}, 
      C: ${tierCounts.C || 0}, D: ${tierCounts.D || 0}, F: ${tierCounts.F || 0}.
    </div>
  `;
}

// --- Оффлайн-драфт ---

function initOffline() {
  const mapSel = $("offline-map-select");
  MAPS.forEach(m => {
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
  modeSel.value = offlineDraft.mode;
  modeSel.addEventListener("change", () => {
    offlineDraft.mode = modeSel.value;
    updateOfflineModeUI();
  });

  $("offline-human-side").value = offlineDraft.humanSide;
  $("offline-human-side").addEventListener("change", () => {
    offlineDraft.humanSide = $("offline-human-side").value;
  });

  $("offline-ai-strategy-1").value = offlineDraft.strategy1;
  $("offline-ai-strategy-2").value = offlineDraft.strategy2;
  $("offline-ai-strategy-1").addEventListener("change", () => {
    offlineDraft.strategy1 = $("offline-ai-strategy-1").value;
  });
  $("offline-ai-strategy-2").addEventListener("change", () => {
    offlineDraft.strategy2 = $("offline-ai-strategy-2").value;
  });

  $("offline-pool-all").addEventListener("click", () => {
    const cap1 = offlineDraft.captain1;
    const cap2 = offlineDraft.captain2;
    offlineDraft.pool = players
      .map(p => p.name)
      .filter(n => n !== cap1 && n !== cap2);
    renderOfflinePool();
  });
  $("offline-pool-top20").addEventListener("click", () => {
    const cap1 = offlineDraft.captain1;
    const cap2 = offlineDraft.captain2;
    const sorted = [...players].sort((a,b) => (b.mmr||0)-(a.mmr||0));
    offlineDraft.pool = sorted
      .map(p => p.name)
      .filter(n => n !== cap1 && n !== cap2)
      .slice(0,20);
    renderOfflinePool();
  });
  $("offline-pool-clear").addEventListener("click", () => {
    offlineDraft.pool = [];
    renderOfflinePool();
  });

  $("offline-start-draft").addEventListener("click", startOfflineDraft);
  $("offline-export-btn").addEventListener("click", exportOfflineResult);

  updateOfflineModeUI();
  populateOfflineCaptains();
  renderOfflinePool();
}

function populateOfflineCaptains() {
  const sel1 = $("offline-captain1");
  const sel2 = $("offline-captain2");
  if (!sel1 || !sel2) return;

  const current1 = offlineDraft.captain1;
  const current2 = offlineDraft.captain2;

  sel1.innerHTML = '<option value="">— не выбран —</option>';
  sel2.innerHTML = '<option value="">— не выбран —</option>';

  players.forEach(p => {
    const o1 = document.createElement("option");
    o1.value = p.name;
    o1.textContent = p.name;
    sel1.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = p.name;
    o2.textContent = p.name;
    sel2.appendChild(o2);
  });

  if (current1) sel1.value = current1;
  if (current2) sel2.value = current2;

  sel1.onchange = () => {
    offlineDraft.captain1 = sel1.value || null;
    if (offlineDraft.captain2 === offlineDraft.captain1) {
      offlineDraft.captain2 = null;
      sel2.value = "";
    }
  };
  sel2.onchange = () => {
    offlineDraft.captain2 = sel2.value || null;
    if (offlineDraft.captain1 === offlineDraft.captain2) {
      offlineDraft.captain1 = null;
      sel1.value = "";
    }
  };
}

function ensureOnlineDraftState() {
  if (!onlineState.draft) {
    onlineState.draft = {
      map: MAPS[0],
      mode: "human_vs_human",
      aiStrategy: "balanced",
      captain1: null,
      captain2: null,
      pool: [],
      available: [],
      team1: [],
      team2: [],
      currentPickIndex: 0,
      finished: false
    };
  }
  return onlineState.draft;
}

function populateOnlineCaptains() {
  const sel1 = $("online-captain1");
  const sel2 = $("online-captain2");
  if (!sel1 || !sel2) return;
  const draft = ensureOnlineDraftState();

  sel1.disabled = !onlineState.isCreator;
  sel2.disabled = !onlineState.isCreator;

  const current1 = draft.captain1;
  const current2 = draft.captain2;

  sel1.innerHTML = '<option value="">— не выбран —</option>';
  sel2.innerHTML = '<option value="">— не выбран —</option>';

  players.forEach(p => {
    const o1 = document.createElement("option");
    o1.value = p.name;
    o1.textContent = p.name;
    sel1.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = p.name;
    o2.textContent = p.name;
    sel2.appendChild(o2);
  });

  if (current1) sel1.value = current1;
  if (current2) sel2.value = current2;

  sel1.onchange = () => {
    draft.captain1 = sel1.value || null;
    if (draft.captain2 === draft.captain1) {
      draft.captain2 = null;
      sel2.value = "";
    }
    renderOnlinePool();
  };
  sel2.onchange = () => {
    draft.captain2 = sel2.value || null;
    if (draft.captain1 === draft.captain2) {
      draft.captain1 = null;
      sel1.value = "";
    }
    renderOnlinePool();
  };
}

function syncOnlineControlsAccess() {
  const isCreator = onlineState.isCreator;
  ["online-map-select","online-mode-select","online-ai-strategy","online-pool-all","online-pool-top20","online-pool-clear","online-start-draft"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !isCreator;
  });
  populateOnlineCaptains();
}

function updateOfflineModeUI() {
  const mode = offlineDraft.mode;
  const humanRow = $("offline-human-side-row");
  if (mode === "human_vs_ai") {
    humanRow.classList.remove("hidden");
  } else {
    humanRow.classList.add("hidden");
  }
}

function renderOfflinePool() {
  const box = $("offline-pool-list");
  box.innerHTML = "";
  const poolSet = new Set(offlineDraft.pool);
  players.forEach(p => {
    const row = document.createElement("div");
    row.className = "player-row" + (poolSet.has(p.name) ? " selected" : "");
    row.addEventListener("click", () => {
      // капитаны не могут быть в пуле
      if (p.name === offlineDraft.captain1 || p.name === offlineDraft.captain2) return;
      if (poolSet.has(p.name)) {
        offlineDraft.pool = offlineDraft.pool.filter(n => n !== p.name);
      } else {
        offlineDraft.pool.push(p.name);
      }
      renderOfflinePool();
    });
    const tierClass = "player-tier-" + (p.tier || "D");
    row.innerHTML = `
      <div>
        <span class="player-name ${tierClass}">${p.name}</span>
        <span class="player-info">[${p.tier || "D"}] MMR: ${round(p.mmr)}, DPM: ${round(p.dpm)}</span>
      </div>
    `;
    box.appendChild(row);
  });

}

function startOfflineDraft() {
  const errBox = $("offline-error");
  errBox.textContent = "";

  // Капитаны обязательны и не могут совпадать
  if (!offlineDraft.captain1 || !offlineDraft.captain2) {
    errBox.textContent = "Нужно выбрать капитанов для Команды 1 и Команды 2 перед стартом драфта.";
    return;
  }
  if (offlineDraft.captain1 === offlineDraft.captain2) {
    errBox.textContent = "Капитаны двух команд не могут быть одним и тем же игроком.";
    return;
  }

  // В пуле должны быть хотя бы 8 игроков (по 4 на докомплектование к капитанам)
  if (!offlineDraft.pool || offlineDraft.pool.length < 8) {
    errBox.textContent = "Нужно выбрать минимум 8 игроков в пул (по 4 на каждую команду).";
    return;
  }

  offlineDraft.available = offlineDraft.pool.slice();
  offlineDraft.team1 = [offlineDraft.captain1];
  offlineDraft.team2 = [offlineDraft.captain2];
  offlineDraft.currentPickIndex = 0;
  offlineDraft.finished = false;

  renderOfflineDraft();
}

function getOfflineStrategyForSide(side) {
  if (side === "team1") return offlineDraft.strategy1 || "balanced";
  return offlineDraft.strategy2 || "balanced";
}

function renderOfflineDraft() {
  const team1El = $("offline-team1");
  const team2El = $("offline-team2");
  const availEl = $("offline-available");
  const picksEl = $("offline-pick-order");
  const suggEl = $("offline-suggestions");

  team1El.innerHTML = "";
  offlineDraft.team1.forEach(name => {
    const li = document.createElement("li");
    const p = players.find(pp => pp.name === name);
    li.textContent = p ? `${p.name} [${p.tier}]` : name;
    team1El.appendChild(li);
  });

  team2El.innerHTML = "";
  offlineDraft.team2.forEach(name => {
    const li = document.createElement("li");
    const p = players.find(pp => pp.name === name);
    li.textContent = p ? `${p.name} [${p.tier}]` : name;
    team2El.appendChild(li);
  });

  picksEl.innerHTML = "";
  DRAFT_ORDER.forEach((step, idx) => {
    const chip = document.createElement("div");
    chip.className = "pick-chip";
    if (idx === offlineDraft.currentPickIndex) chip.classList.add("current");
    if (step.team === "team1") chip.classList.add("team1");
    if (step.team === "team2") chip.classList.add("team2");
    chip.textContent = `Пик ${step.pick}: Капитан ${step.captain === "cap1" ? "1" : "2"}`;
    picksEl.appendChild(chip);
  });

  availEl.innerHTML = "";
  const availablePlayers = offlineDraft.available
    .map(name => players.find(p => p.name === name))
    .filter(Boolean)
    .sort((a,b) => (b.mmr||0)-(a.mmr||0));

  let suggestionsHtml = "";
  const step = DRAFT_ORDER[offlineDraft.currentPickIndex];
  if (!step) {
    offlineDraft.finished = true;
    suggestionsHtml = "<div class='hint'>Драфт завершён. Используй экспорт снизу, чтобы скопировать состав.</div>";
  } else {
    const side = step.team;
    const isHumanTurn = offlineDraft.mode === "manual"
      || (offlineDraft.mode === "human_vs_ai" && offlineDraft.humanSide === side);
    const strategy = getOfflineStrategyForSide(side);
    const context = {
      team1: offlineDraft.team1,
      team2: offlineDraft.team2,
      side,
      enemySide: side === "team1" ? "team2" : "team1",
      mode: offlineDraft.mode,
      strategy
    };

    const scored = availablePlayers.map(p => ({
      player: p,
      value: calcPlayerValue(p, context)
    })).sort((a,b) => b.value - a.value);

    const hints = buildAiHints(scored, context);
    if (hints && hints.length) {
      suggestionsHtml = "<div><strong>Подсказка ИИ:</strong><br/>";
      hints.forEach((h,i) => {
        suggestionsHtml += `${i===0?"• Лучший пик:":"• Альтернатива:"} ${h.name} [${h.tier}] — MMR: ${h.mmr}, DPM: ${h.dpm} (${h.reason})<br/>`;
      });
      suggestionsHtml += `</div><div class="hint small">Стратегия стороны: <strong>${strategy}</strong>. ИИ учитывает роли команды и угрозы противника.</div>`;
    }

    if (!offlineDraft.finished) {
      if (!isHumanTurn && (offlineDraft.mode === "human_vs_ai" || offlineDraft.mode === "ai_vs_ai")) {
        aiPickOfflineCurrentSide(context, scored);
      }
    }
  }
  suggEl.innerHTML = suggestionsHtml;

  const currentStep = DRAFT_ORDER[offlineDraft.currentPickIndex];
  availablePlayers.forEach(p => {
    const row = document.createElement("div");
    row.className = "player-row";
    const tierClass = "player-tier-" + (p.tier || "D");
    row.innerHTML = `
      <div>
        <span class="player-name ${tierClass}">${p.name}</span>
        <span class="player-info">[${p.tier||"D"}] MMR: ${round(p.mmr)}, DPM: ${round(p.dpm)}</span>
      </div>
    `;
    if (currentStep) {
      const side = currentStep.team;
      const isHumanTurn = offlineDraft.mode === "manual"
        || (offlineDraft.mode === "human_vs_ai" && offlineDraft.humanSide === side);
      if (isHumanTurn) {
        row.addEventListener("click", () => {
          humanPickOffline(p.name);
        });
      } else {
        row.style.opacity = "0.6";
      }
    }
    availEl.appendChild(row);
  });
}

function humanPickOffline(name) {
  if (offlineDraft.finished) return;
  const step = DRAFT_ORDER[offlineDraft.currentPickIndex];
  if (!step) return;
  const side = step.team;
  const isHumanTurn = offlineDraft.mode === "manual"
    || (offlineDraft.mode === "human_vs_ai" && offlineDraft.humanSide === side);
  if (!isHumanTurn) return;

  if (!offlineDraft.available.includes(name)) return;
  if (side === "team1") {
    offlineDraft.team1.push(name);
  } else {
    offlineDraft.team2.push(name);
  }
  offlineDraft.available = offlineDraft.available.filter(n => n !== name);
  offlineDraft.currentPickIndex++;
  if (offlineDraft.currentPickIndex >= DRAFT_ORDER.length) {
    offlineDraft.finished = true;
  }
  renderOfflineDraft();
}

function aiPickOfflineCurrentSide(context, scoredList) {
  if (offlineDraft.finished) return;
  const step = DRAFT_ORDER[offlineDraft.currentPickIndex];
  if (!step) return;
  const side = step.team;
  const isHumanTurn = offlineDraft.mode === "manual"
    || (offlineDraft.mode === "human_vs_ai" && offlineDraft.humanSide === side);
  if (isHumanTurn) return;

  const valid = scoredList.filter(s => offlineDraft.available.includes(s.player.name));
  if (!valid.length) return;
  const top = valid.slice(0, Math.min(3, valid.length));
  const choice = top[Math.floor(Math.random()*top.length)];
  const name = choice.player.name;
  if (side === "team1") offlineDraft.team1.push(name);
  else offlineDraft.team2.push(name);
  offlineDraft.available = offlineDraft.available.filter(n => n !== name);
  offlineDraft.currentPickIndex++;
  if (offlineDraft.currentPickIndex >= DRAFT_ORDER.length) {
    offlineDraft.finished = true;
  }
  renderOfflineDraft();
}

function exportOfflineResult() {
  const map = offlineDraft.map;
  const t1 = offlineDraft.team1;
  const t2 = offlineDraft.team2;
  let text = `Map: ${map}\n\nКоманда 1:\n`;
  t1.forEach(n => { text += ` - ${n}\n`; });
  text += `\nКоманда 2:\n`;
  t2.forEach(n => { text += ` - ${n}\n`; });
  $("offline-export-output").value = text;
}

// --- Оценка игрока ИИ ---

function calcPlayerValue(p, ctx) {
  const mmrScore = (p.mmr || 0) / 100;
  const dpmScore = (p.dpm || 0) / 5000;
  const tierMult = tierMultiplier(p.tier || "D");
  const roles = p.roles || [];

  const enemySide = ctx.enemySide;
  const enemyTeamNames = enemySide === "team1" ? ctx.team1 : ctx.team2;
  const enemyRolesCounter = countRolesByNames(enemyTeamNames);
  const totalEnemy = enemyTeamNames.length;

  let roleWeightScore = 0;
  const strategy = ctx.strategy || "balanced";

  if (strategy === "max_dpm") {
    roleWeightScore = 1.0;
  } else if (strategy === "counter_enemy") {
    const counterMap = {
      tanks: ["at_artillery", "spg", "heavy_tanks"],
      heavy_tanks: ["at_artillery", "spg"],
      infantry: ["assault_infantry", "motorized_infantry", "sapper"],
      motorized_infantry: ["at_artillery", "aa_artillery"],
      assault_infantry: ["aa_artillery", "spg"],
      artillery: ["motorized_infantry", "assault_infantry", "sapper"],
      spg: ["at_artillery","heavy_tanks"],
      aa_artillery: ["air_support"], // на будущее
      sapper: ["infantry","assault_infantry"]
    };
    let bonus = 0;
    roles.forEach(r => {
      for (const [enemyRole, counters] of Object.entries(counterMap)) {
        if (counters.includes(r) && enemyRolesCounter[enemyRole]) {
          const density = enemyRolesCounter[enemyRole] / Math.max(1,totalEnemy);
          bonus += 1.0 + density * 2.0;
        }
      }
    });
    roleWeightScore = 1.0 + bonus;
  } else {
    const weights = ROLE_WEIGHTS[strategy] || ROLE_WEIGHTS["balanced"];
    roles.forEach(r => {
      const w = weights[r] || 0.8;
      roleWeightScore += w;
    });
    if (!roleWeightScore) roleWeightScore = 1.0;
  }

  const scores = [];
  scores.push(mmrScore * 2.0);
  scores.push(dpmScore * 1.5);
  scores.push(roleWeightScore * 1.2);

  const base = scores.reduce((a,b)=>a+b, 0);
  const total = base * tierMult;

  let smallRandom = (Math.random() - 0.5) * 0.3;
  return total + smallRandom;
}

function buildAiHints(scored, ctx) {
  const shortlist = scored.slice(0, 6);
  if (!shortlist.length) return null;
  const needRoles = ctx.side === "team1" ? countRolesByNames(ctx.team1) : countRolesByNames(ctx.team2);
  const enemyRoles = ctx.side === "team1" ? countRolesByNames(ctx.team2) : countRolesByNames(ctx.team1);
  const needText = (p) => {
    const roles = p.roles || [];
    const hasCoverage = roles.find(r => enemyRoles[r]);
    const lack = roles.find(r => !needRoles[r]);
    if (ctx.strategy === "counter_enemy" && hasCoverage) return "контрит вражеские роли";
    if (lack) return "закрывает пустую роль";
    if (roles.includes("heavy_tanks") || roles.includes("tanks")) return "усилит броню";
    if (roles.includes("artillery") || roles.includes("spg")) return "даст артподдержку";
    if (roles.includes("aa_artillery")) return "усилит ПВО";
    return "высокий потенциал";
  };
  const picks = shortlist.slice(0,3).map(s => ({
    name: s.player.name,
    tier: s.player.tier,
    mmr: round(s.player.mmr),
    dpm: round(s.player.dpm),
    reason: needText(s.player)
  }));
  return picks;
}

function countRolesByNames(names) {
  const counter = {};
  names.forEach(n => {
    const p = players.find(pp => pp.name === n);
    if (!p) return;
    (p.roles || []).forEach(r => {
      counter[r] = (counter[r] || 0) + 1;
    });
  });
  return counter;
}

// --- Игроки и статистика экран ---

function initPlayersScreen() {
  const srcSel = $("players-source");
  const nameFilter = $("players-filter-name");
  const tierFilter = $("players-filter-tier");
  const exportBtn = $("players-export-local");
  const importInput = $("players-import-local");

  srcSel.value = activeDataset;
  srcSel.addEventListener("change", () => {
    const val = srcSel.value;
    if (val === "global") {
      if (!playersGlobal.length) {
        alert("Глобальная база ещё не загружена. Сначала админ должен загрузить её из Supabase.");
        srcSel.value = "local";
        activeDataset = "local";
        players = playersLocal;
      } else {
        activeDataset = "global";
        players = playersGlobal;
      }
    } else {
      activeDataset = "local";
      players = playersLocal;
    }
    populateOfflineCaptains();
    populateOnlineCaptains();
    renderPlayersList();
    renderMenuSummary();
  });

  const strategySourceSel = $("players-strategy-source");
  if (strategySourceSel) {
    strategySourceSel.value = activeStrategySource;
    strategySourceSel.addEventListener("change", () => {
      activeStrategySource = strategySourceSel.value;
      localStorage.setItem("mow2_strategy_source", activeStrategySource);
      applyStrategySource();
    });
  }

  nameFilter.addEventListener("input", renderPlayersList);
  tierFilter.addEventListener("change", renderPlayersList);

  exportBtn.addEventListener("click", () => {
    const dataStr = JSON.stringify(playersLocal, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mow2_players_local.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        playersLocal = normalizePlayers(data);
        if (activeDataset === "local") players = playersLocal;
        savePlayersLocal();
        renderPlayersList();
        renderMenuSummary();
      } catch (err) {
        alert("Ошибка при разборе JSON локальной базы.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  });

  const stratEditor = $("strategies-editor");
  const stratLoadBtn = $("strategies-load-current");
  const stratSaveLocal = $("strategies-save-local");
  const stratImport = $("strategies-import-file");
  const stratExport = $("strategies-export-file");
  if (stratEditor && stratLoadBtn && stratSaveLocal && stratImport && stratExport) {
    stratLoadBtn.addEventListener("click", () => {
      stratEditor.value = JSON.stringify(ROLE_WEIGHTS, null, 2);
    });
    stratSaveLocal.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(stratEditor.value || "{}");
        roleWeightsLocal = parsed;
        saveStrategiesLocal();
        activeStrategySource = "local";
        localStorage.setItem("mow2_strategy_source", activeStrategySource);
        applyStrategySource();
        alert("Стратегии сохранены локально и активированы.");
      } catch (e) {
        alert("Не удалось сохранить: проверь JSON.");
      }
    });
    stratImport.addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        stratEditor.value = reader.result;
      };
      reader.readAsText(file);
    });
    stratExport.addEventListener("click", () => {
      const dataStr = stratEditor.value || JSON.stringify(ROLE_WEIGHTS, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mow2_strategies.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  renderPlayersList();
}

function renderPlayersList() {
  const listEl = $("players-list");
  const panel = $("player-edit-panel");
  listEl.innerHTML = "";
  panel.innerHTML = "<div class='hint'>Выбери игрока, чтобы посмотреть или отредактировать его статистику.</div>";

  const nameFilterVal = ($("players-filter-name").value || "").toLowerCase();
  const tierFilterVal = $("players-filter-tier").value || "";

  const src = players || [];
  const filtered = src.filter(p => {
    if (nameFilterVal && !p.name.toLowerCase().includes(nameFilterVal)) return false;
    if (tierFilterVal && (p.tier || "D") !== tierFilterVal) return false;
    return true;
  }).sort((a,b) => (b.mmr||0)-(a.mmr||0));

  filtered.forEach(p => {
    const row = document.createElement("div");
    const tierClass = "player-tier-" + (p.tier || "D");
    row.className = "player-row";
    row.innerHTML = `
      <div>
        <span class="player-name ${tierClass}">${p.name}</span>
        <span class="player-info">[${p.tier||"D"}] MMR: ${round(p.mmr)}, DPM: ${round(p.dpm)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      renderPlayerEdit(p);
      document.querySelectorAll("#players-list .player-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
    listEl.appendChild(row);
  });
}

function renderPlayerEdit(p) {
  const panel = $("player-edit-panel");
  const isGlobal = activeDataset === "global";
  const isAdmin = onlineState.isAdmin;

  if (isGlobal && !isAdmin) {
    panel.innerHTML = `
      <h3>${p.name}</h3>
      <div class="hint">Глобальная база доступна только для просмотра. Для редактирования нужен админ-пароль.</div>
      <p>Tier: <strong>${p.tier||"D"}</strong></p>
      <p>MMR: <strong>${round(p.mmr)}</strong></p>
      <p>DPM: <strong>${round(p.dpm)}</strong></p>
      <p>Роли: <strong>${(p.roles||[]).join(", ") || "—"}</strong></p>
    `;
    return;
  }

  panel.innerHTML = `
    <h3>Редактирование игрока</h3>
    <div class="form-row">
      <label>Имя</label>
      <input type="text" id="edit-name" value="${p.name}" />
    </div>
    <div class="form-row">
      <label>Tier</label>
      <select id="edit-tier">
        <option value="S">S</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
        <option value="F">F</option>
      </select>
    </div>
    <div class="form-row">
      <label>MMR</label>
      <input type="text" id="edit-mmr" value="${round(p.mmr)}" />
    </div>
    <div class="form-row">
      <label>DPM (средний урон)</label>
      <input type="text" id="edit-dpm" value="${round(p.dpm)}" />
    </div>
    <div class="form-row">
      <label>Роли (через запятую)</label>
      <input type="text" id="edit-roles" value="${(p.roles||[]).join(", ")}" />
      <div class="hint small">
        Доступные роли: infantry, motorized_infantry, assault_infantry, sapper, tanks, heavy_tanks, 
        mechanical, artillery, at_artillery, aa_artillery, spg.
      </div>
    </div>
    <button id="edit-save">Сохранить изменения</button>
  `;
  $("edit-tier").value = p.tier || "D";

  $("edit-save").addEventListener("click", () => {
    p.name = $("edit-name").value.trim() || p.name;
    p.tier = $("edit-tier").value || "D";
    const mmrVal = parseFloat($("edit-mmr").value.replace(",", "."));
    const dpmVal = parseFloat($("edit-dpm").value.replace(",", "."));
    if (!isNaN(mmrVal)) p.mmr = mmrVal;
    if (!isNaN(dpmVal)) p.dpm = dpmVal;
    const rolesStr = $("edit-roles").value || "";
    p.roles = rolesStr.split(",").map(s=>s.trim()).filter(Boolean);

    if (activeDataset === "local") {
      // обновляем playersLocal (по ссылке это те же объекты)
      savePlayersLocal();
    }
    renderPlayersList();
    renderMenuSummary();
    renderPlayerEdit(p);
  });
}

// --- Онлайн комнаты (упрощённо, без полной синхронизации) ---

function initOnlineScreen() {
  $("online-create-room").addEventListener("click", createOnlineRoom);
  $("online-join-room").addEventListener("click", joinOnlineRoom);
  $("online-refresh-rooms").addEventListener("click", refreshOnlineRooms);
  $("online-delete-room").addEventListener("click", deleteOnlineRoom);

  const mapSel = $("online-map-select");
  MAPS.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mapSel.appendChild(opt);
  });

  const draft = ensureOnlineDraftState();
  mapSel.value = draft.map;
  mapSel.addEventListener("change", () => {
    draft.map = mapSel.value;
  });

  $("online-start-draft").addEventListener("click", startOnlineDraft);

  $("online-pool-all").addEventListener("click", () => {
    const d = ensureOnlineDraftState();
    if (!onlineState.isCreator) return;
    const { captain1, captain2 } = d;
    onlineState.draft.pool = players
      .map(p=>p.name)
      .filter(n => n !== captain1 && n !== captain2);
    renderOnlinePool();
  });
  $("online-pool-top20").addEventListener("click", () => {
    const d = ensureOnlineDraftState();
    if (!onlineState.isCreator) return;
    const sorted = [...players].sort((a,b)=> (b.mmr||0)-(a.mmr||0));
    const { captain1, captain2 } = d;
    onlineState.draft.pool = sorted
      .slice(0,20)
      .map(p=>p.name)
      .filter(n => n !== captain1 && n !== captain2);
    renderOnlinePool();
  });
  $("online-pool-clear").addEventListener("click", () => {
    ensureOnlineDraftState();
    if (!onlineState.isCreator) return;
    onlineState.draft.pool = [];
    renderOnlinePool();
  });

  populateOnlineCaptains();
  syncOnlineControlsAccess();
}

async function createOnlineRoom() {
  const supabase = initSupabase();
  const nickname = ($("online-nickname").value || "").trim();
  if (!nickname) {
    $("online-create-result").textContent = "Нужно ввести ник перед созданием комнаты.";
    return;
  }
  const roomPassword = $("online-create-password").value || "";

  // Проверка лимита комнат
  try {
    const twoWeeksAgo = new Date(Date.now() - 14*24*60*60*1000).toISOString();
    const { data: rooms, error } = await supabase
      .from("rooms")
      .select("id, created_at")
      .gte("created_at", twoWeeksAgo);
    if (!error && rooms && rooms.length >= ROOMS_LIMIT) {
      $("online-create-result").textContent = "Достигнут лимит комнат (50). Удалите старые комнаты через Supabase.";
      return;
    }
  } catch (e) {
    console.warn("Room limit check failed", e);
  }

  const code = generateRoomCode();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code,
      password: roomPassword || null
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    $("online-create-result").textContent = "Ошибка создания комнаты.";
    return;
  }

  const roomId = data.id;
  onlineState.room = data;
  onlineState.isCreator = true;
  onlineState.myRole = "captain1";
  syncOnlineControlsAccess();

  const { data: participant, error: pErr } = await supabase
    .from("room_participants")
    .insert({
      room_id: roomId,
      nickname,
      role: "captain1"
    })
    .select()
    .single();
  if (!pErr && participant) {
    onlineState.myParticipantId = participant.id;
  }

  const draft = ensureOnlineDraftState();
  const cap1 = draft.captain1;
  const cap2 = draft.captain2;
  onlineState.draft = {
    map: draft.map || MAPS[0],
    mode: draft.mode || "human_vs_human",
    aiStrategy: draft.aiStrategy || "balanced",
    captain1: cap1,
    captain2: cap2,
    pool: players
      .map(p=>p.name)
      .filter(n => n !== cap1 && n !== cap2),
    available: [],
    team1: cap1 ? [cap1] : [],
    team2: cap2 ? [cap2] : [],
    currentPickIndex: 0,
    finished: false
  };

  $("online-room-code").textContent = code;
  $("online-my-role").textContent = "Капитан 1";
  $("online-match-status").textContent = "Ожидание старта";
  $("online-create-result").textContent = "Комната создана.";
  $("online-room-section").classList.remove("hidden");
  $("online-map-select").value = onlineState.draft.map;
  $("online-mode-select").value = onlineState.draft.mode;
  $("online-ai-strategy").value = onlineState.draft.aiStrategy;
  renderOnlineParticipants();
  renderOnlinePool();
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<5;i++) {
    s += chars[Math.floor(Math.random()*chars.length)];
  }
  return s;
}

async function joinOnlineRoom() {
  const supabase = initSupabase();
  const nickname = ($("online-nickname").value || "").trim();
  if (!nickname) {
    $("online-join-result").textContent = "Нужно ввести ник перед входом в комнату.";
    return;
  }
  const code = ($("online-join-code").value || "").trim().toUpperCase();
  const password = $("online-join-password").value || "";

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error || !room) {
    $("online-join-result").textContent = "Комната не найдена.";
    return;
  }
  if (room.password && room.password !== password) {
    $("online-join-result").textContent = "Неверный пароль комнаты.";
    return;
  }

  onlineState.room = room;
  onlineState.isCreator = false;
  onlineState.myRole = "viewer";
  onlineState.draft = {
    map: MAPS[0],
    mode: "human_vs_human",
    aiStrategy: "balanced",
    captain1: null,
    captain2: null,
    pool: [],
    available: [],
    team1: [],
    team2: [],
    currentPickIndex: 0,
    finished: false
  };
  syncOnlineControlsAccess();

  const { data: participant, error: pErr } = await supabase
    .from("room_participants")
    .insert({
      room_id: room.id,
      nickname,
      role: "viewer"
    })
    .select()
    .single();
  if (!pErr && participant) {
    onlineState.myParticipantId = participant.id;
  }

  $("online-room-code").textContent = room.code;
  $("online-my-role").textContent = "Зритель";
  $("online-match-status").textContent = "Ожидание создателя";
  $("online-join-result").textContent = "Вход выполнен.";
  $("online-room-section").classList.remove("hidden");
  $("online-map-select").value = onlineState.draft.map;
  $("online-mode-select").value = onlineState.draft.mode;
  $("online-ai-strategy").value = onlineState.draft.aiStrategy;
  renderOnlineParticipants();
  renderOnlinePool();
}

async function refreshOnlineRooms() {
  const supabase = initSupabase();
  const listEl = $("online-rooms-list");
  listEl.innerHTML = "<div class='hint'>Загрузка...</div>";
  const twoWeeksAgo = new Date(Date.now() - 14*24*60*60*1000).toISOString();
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, code, created_at")
    .gte("created_at", twoWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(ROOMS_LIMIT);
  if (error) {
    console.error(error);
    listEl.innerHTML = "<div class='hint'>Ошибка загрузки списка комнат.</div>";
    return;
  }
  listEl.innerHTML = "";
  rooms.forEach(r => {
    const row = document.createElement("div");
    row.className = "player-row";
    const dt = new Date(r.created_at);
    row.innerHTML = `
      <div>
        <span class="player-name">Комната ${r.code}</span>
        <span class="player-info">создана ${dt.toLocaleString()}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      $("online-join-code").value = r.code;
    });
    listEl.appendChild(row);
  });
}

async function deleteOnlineRoom() {
  if (!onlineState.isCreator || !onlineState.room) return;
  if (!confirm("Удалить комнату и всех участников?")) return;
  const supabase = initSupabase();
  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", onlineState.room.id);
  if (error) {
    alert("Не удалось удалить комнату");
    return;
  }
  onlineState.room = null;
  onlineState.isCreator = false;
  onlineState.draft = null;
  $("online-room-section").classList.add("hidden");
  $("online-create-result").textContent = "Комната удалена.";
  refreshOnlineRooms();
}

function renderOnlinePool() {
  const box = $("online-pool-list");
  const draft = ensureOnlineDraftState();
  box.innerHTML = "";
  const poolSet = new Set(draft.pool || []);
  const cap1 = draft.captain1;
  const cap2 = draft.captain2;
  players.forEach(p => {
    const isCaptain = p.name === cap1 || p.name === cap2;
    const row = document.createElement("div");
    row.className = "player-row" + (poolSet.has(p.name) ? " selected" : "") + (isCaptain ? " disabled" : "");
    const tierClass = "player-tier-" + (p.tier || "D");
    row.innerHTML = `
      <div>
        <span class="player-name ${tierClass}">${p.name}</span>
        <span class="player-info">[${p.tier||"D"}] MMR: ${round(p.mmr)}, DPM: ${round(p.dpm)}${isCaptain ? " — капитан" : ""}</span>
      </div>
    `;
    if (onlineState.isCreator && !isCaptain) {
      row.addEventListener("click", () => {
        if (poolSet.has(p.name)) {
          draft.pool = draft.pool.filter(n => n !== p.name);
        } else {
          draft.pool.push(p.name);
        }
        renderOnlinePool();
      });
    }
    box.appendChild(row);
  });
}

async function renderOnlineParticipants() {
  const supabase = initSupabase();
  if (!onlineState.room) return;
  const { data: parts, error } = await supabase
    .from("room_participants")
    .select("*")
    .eq("room_id", onlineState.room.id)
    .order("created_at", { ascending: true });
  const listEl = $("online-participants");
  const creatorPanel = $("online-creator-panel");
  listEl.innerHTML = "";
  if (error || !parts) {
    listEl.innerHTML = "<div class='hint'>Ошибка загрузки участников.</div>";
    creatorPanel.classList.add("hidden");
    return;
  }
  parts.forEach(p => {
    const row = document.createElement("div");
    row.className = "participant-row";
    row.innerHTML = `
      <span>${p.nickname}</span>
      <span class="participant-role">${p.role}</span>
    `;
    listEl.appendChild(row);
  });

  if (onlineState.isCreator) {
    creatorPanel.classList.remove("hidden");
    creatorPanel.innerHTML = `
      <div><strong>Панель создателя комнаты</strong></div>
      <div class="hint small">
        Здесь позже можно будет назначать капитанов, кикать участников и т.д. (упрощено для V11).
      </div>
    `;
  } else {
    creatorPanel.classList.add("hidden");
  }
}

function startOnlineDraft() {
  const errBox = $("online-error");
  errBox.textContent = "";
  if (!onlineState.isCreator || !onlineState.room) {
    errBox.textContent = "Только создатель комнаты может запускать драфт.";
    return;
  }
  const d = ensureOnlineDraftState();
  d.map = $("online-map-select").value;
  d.mode = $("online-mode-select").value;
  d.aiStrategy = $("online-ai-strategy").value;
  const cap1 = d.captain1;
  const cap2 = d.captain2;
  if (!cap1 || !cap2) {
    errBox.textContent = "Нужно выбрать двух разных капитанов перед стартом драфта.";
    return;
  }
  if (cap1 === cap2) {
    errBox.textContent = "Капитаны не могут совпадать.";
    return;
  }
  if (!d.pool || d.pool.length < 10) {
    errBox.textContent = "Нужно минимум 10 игроков в пуле для матча.";
    return;
  }
  d.available = d.pool.filter(n => n !== cap1 && n !== cap2);
  d.team1 = [cap1];
  d.team2 = [cap2];
  d.currentPickIndex = 0;
  d.finished = false;

  $("online-match-status").textContent = "Драфт идёт";
  renderOnlineDraft();
}

function renderOnlineDraft() {
  const d = onlineState.draft;
  if (!d) return;
  const team1El = $("online-team1");
  const team2El = $("online-team2");
  const availEl = $("online-available");
  const picksEl = $("online-pick-order");
  const suggEl = $("online-suggestions");

  team1El.innerHTML = "";
  d.team1.forEach(name => {
    const p = players.find(pp => pp.name === name);
    const li = document.createElement("li");
    li.textContent = p ? `${p.name} [${p.tier}]` : name;
    team1El.appendChild(li);
  });
  team2El.innerHTML = "";
  d.team2.forEach(name => {
    const p = players.find(pp => pp.name === name);
    const li = document.createElement("li");
    li.textContent = p ? `${p.name} [${p.tier}]` : name;
    team2El.appendChild(li);
  });

  picksEl.innerHTML = "";
  DRAFT_ORDER.forEach((step, idx) => {
    const chip = document.createElement("div");
    chip.className = "pick-chip";
    if (idx === d.currentPickIndex) chip.classList.add("current");
    if (step.team === "team1") chip.classList.add("team1");
    if (step.team === "team2") chip.classList.add("team2");
    chip.textContent = `Пик ${step.pick}: Капитан ${step.captain === "cap1" ? "1" : "2"}`;
    picksEl.appendChild(chip);
  });

  const step = DRAFT_ORDER[d.currentPickIndex];
  if (!step) {
    d.finished = true;
    suggEl.innerHTML = "<div class='hint'>Драфт завершён.</div>";
    return;
  }

  const side = step.team;
  const isMyTurn = (d.mode === "human_vs_human" && (
    (side === "team1" && onlineState.myRole === "captain1") ||
    (side === "team2" && onlineState.myRole === "captain2")
  )) || (d.mode === "human_vs_ai" && onlineState.myRole === "captain1" && side === "team1");

  const availablePlayers = d.available
    .map(name => players.find(p=>p.name===name))
    .filter(Boolean)
    .sort((a,b)=> (b.mmr||0)-(a.mmr||0));

  const context = {
    team1: d.team1,
    team2: d.team2,
    side,
    enemySide: side === "team1" ? "team2" : "team1",
    mode: d.mode,
    strategy: d.aiStrategy
  };
  const scored = availablePlayers.map(p => ({
    player: p,
    value: calcPlayerValue(p, context)
  })).sort((a,b)=> b.value - a.value);
  const hints = buildAiHints(scored, context);
  let suggestionsHtml = "";
  if (hints && hints.length) {
    suggestionsHtml = "<div><strong>Подсказка ИИ:</strong><br/>";
    hints.forEach((h,i) => {
      suggestionsHtml += `${i===0?"• Лучший пик:":"• Альтернатива:"} ${h.name} [${h.tier}] — MMR: ${h.mmr}, DPM: ${h.dpm} (${h.reason})<br/>`;
    });
    suggestionsHtml += `</div><div class="hint small">Стратегия ИИ: <strong>${d.aiStrategy}</strong>. Учитываем роли союзников и угрозы противника.</div>`;
  }
  suggEl.innerHTML = suggestionsHtml;

  availEl.innerHTML = "";
  availablePlayers.forEach(p => {
    const row = document.createElement("div");
    const tierClass = "player-tier-" + (p.tier || "D");
    row.className = "player-row";
    row.innerHTML = `
      <div>
        <span class="player-name ${tierClass}">${p.name}</span>
        <span class="player-info">[${p.tier||"D"}] MMR: ${round(p.mmr)}, DPM: ${round(p.dpm)}</span>
      </div>
    `;
    if (isMyTurn) {
      row.addEventListener("click", () => {
        humanPickOnline(p.name);
      });
    } else {
      row.style.opacity = "0.6";
    }
    availEl.appendChild(row);
  });

  if (!isMyTurn && (d.mode === "human_vs_ai" || d.mode === "ai_vs_ai")) {
    aiPickOnlineCurrentSide(context, scored);
  }
}

function humanPickOnline(name) {
  const d = onlineState.draft;
  if (!d || d.finished) return;
  const step = DRAFT_ORDER[d.currentPickIndex];
  if (!step) return;
  const side = step.team;
  const isMyTurn = (d.mode === "human_vs_human" && (
    (side === "team1" && onlineState.myRole === "captain1") ||
    (side === "team2" && onlineState.myRole === "captain2")
  )) || (d.mode === "human_vs_ai" && onlineState.myRole === "captain1" && side === "team1");
  if (!isMyTurn) return;
  if (!d.available.includes(name)) return;
  if (side === "team1") d.team1.push(name);
  else d.team2.push(name);
  d.available = d.available.filter(n=>n!==name);
  d.currentPickIndex++;
  if (d.currentPickIndex >= DRAFT_ORDER.length) d.finished = true;
  renderOnlineDraft();
}

function aiPickOnlineCurrentSide(ctx, scoredList) {
  const d = onlineState.draft;
  if (!d || d.finished) return;
  const step = DRAFT_ORDER[d.currentPickIndex];
  if (!step) return;
  const side = step.team;
  const isMyTurn = (d.mode === "human_vs_human" && (
    (side === "team1" && onlineState.myRole === "captain1") ||
    (side === "team2" && onlineState.myRole === "captain2")
  )) || (d.mode === "human_vs_ai" && onlineState.myRole === "captain1" && side === "team1");
  if (isMyTurn) return;

  const valid = scoredList.filter(s => d.available.includes(s.player.name));
  if (!valid.length) return;
  const top = valid.slice(0, Math.min(3, valid.length));
  const choice = top[Math.floor(Math.random()*top.length)];
  const name = choice.player.name;
  if (side === "team1") d.team1.push(name);
  else d.team2.push(name);
  d.available = d.available.filter(n=>n!==name);
  d.currentPickIndex++;
  if (d.currentPickIndex >= DRAFT_ORDER.length) d.finished = true;
  renderOnlineDraft();
}

// --- Админ-панель ---

function initAdminScreen() {
  $("admin-login-btn").addEventListener("click", () => {
    const pwd = $("admin-password").value || "";
    const status = $("admin-login-status");
    if (pwd === onlineState.adminPassword) {
      onlineState.isAdmin = true;
      status.textContent = "Админ-режим активирован.";
      $("admin-actions").classList.remove("hidden");
    } else {
      onlineState.isAdmin = false;
      status.textContent = "Неверный админ-пароль.";
      $("admin-actions").classList.add("hidden");
    }
  });

  $("admin-load-global").addEventListener("click", adminLoadGlobal);
  $("admin-save-global").addEventListener("click", adminSaveGlobal);
  $("admin-strategies-load").addEventListener("click", adminStrategiesLoad);
  $("admin-strategies-save").addEventListener("click", adminStrategiesSave);
  $("admin-change-password-btn").addEventListener("click", adminChangePassword);
}

async function adminLoadGlobal() {
  const status = $("admin-actions-status");
  status.textContent = "Загрузка глобальной базы...";
  const supabase = initSupabase();
  try {
    const { data, error } = await supabase
      .from("players_global")
      .select("*");
    if (error) throw error;
    playersGlobal = normalizePlayers(data || []);
    status.textContent = `Глобальная база загружена: ${playersGlobal.length} игроков. Переключись на неё в разделе «Игроки и статистика».`;
    if (activeDataset === "global") {
      players = playersGlobal;
      renderPlayersList();
      renderMenuSummary();
      populateOfflineCaptains();
      populateOnlineCaptains();
    }
  } catch (e) {
    console.error(e);
    status.textContent = "Ошибка загрузки глобальной базы.";
  }
}

async function adminSaveGlobal() {
  const status = $("admin-actions-status");
  const supabase = initSupabase();
  const source = (playersGlobal && playersGlobal.length) ? playersGlobal : playersLocal;
  if (!source || !source.length) {
    status.textContent = "Нет данных для сохранения в глобальную базу.";
    return;
  }
  status.textContent = "Сохранение глобальной базы...";
  try {
    const rows = source.map(p => ({
      name: p.name,
      tier: p.tier,
      mmr: p.mmr,
      dpm: p.dpm,
      roles: p.roles
    }));
    await supabase.from("players_global").delete().neq("name", "");
    const { error } = await supabase.from("players_global").insert(rows);
    if (error) throw error;
    status.textContent = "Глобальная база обновлена в Supabase.";
  } catch (e) {
    console.error(e);
    status.textContent = "Ошибка сохранения глобальной базы.";
  }
}

function adminStrategiesLoad() {
  const ta = $("admin-strategies-json");
  ta.value = JSON.stringify(ROLE_WEIGHTS, null, 2);
  $("admin-actions-status").textContent = "Текущий набор стратегий загружен в редактор.";
}

async function adminStrategiesSave() {
  const ta = $("admin-strategies-json");
  try {
    const obj = JSON.parse(ta.value);
    ROLE_WEIGHTS = obj;
    roleWeightsLocal = obj;
    saveStrategiesLocal();
    applyStrategySource();
    const status = $("admin-actions-status");
    status.textContent = "Стратегии сохранены локально. Пытаемся отправить в Supabase...";
    try {
      const supabase = initSupabase();
      const { error } = await supabase
        .from("admin_config")
        .upsert({ key: "ai_strategies", value: JSON.stringify(obj) });
      if (error) throw error;
      roleWeightsGlobal = obj;
      status.textContent = "Стратегии сохранены локально и в Supabase.";
    } catch (e) {
      console.warn("Failed to save strategies globally", e);
      status.textContent = "Локально сохранено. Ошибка сохранения в Supabase.";
    }
  } catch (e) {
    alert("Ошибка в JSON стратегий.");
  }
}

async function adminChangePassword() {
  const status = $("admin-change-password-status");
  const master = $("admin-master-password").value || "";
  const newPwd = $("admin-new-password").value || "";
  if (master !== MASTER_PASSWORD) {
    status.textContent = "Неверный мастер-пароль сайта.";
    return;
  }
  if (!newPwd || newPwd.length < 4) {
    status.textContent = "Новый админ-пароль должен быть не короче 4 символов.";
    return;
  }
  try {
    const supabase = initSupabase();
    const { error } = await supabase
      .from("admin_config")
      .upsert({ key: "admin_password", value: newPwd }, { onConflict: "key" });
    if (error) throw error;
    onlineState.adminPassword = newPwd;
    status.textContent = "Админ-пароль обновлён глобально через Supabase.";
  } catch (e) {
    console.error(e);
    status.textContent = "Ошибка обновления админ-пароля.";
  }
}

// --- Инициализация ---

window.addEventListener("load", () => {
  loadPlayersLocal();
  loadStrategiesLocal();
  initMenu();
  initOffline();
  initPlayersScreen();
  initOnlineScreen();
  initAdminScreen();

  applyStrategySource();
  loadStrategiesGlobal();

  // Подгружаем глобальный админ-пароль из Supabase (если таблица настроена)
  loadAdminPasswordGlobal();

  showScreen("menu");
});
