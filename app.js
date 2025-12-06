/* ==========================
   Supabase init (через window.supabase)
   ========================== */

const SUPABASE_URL = "https://utfudifzuytzbwnxqpcf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_duqpINIqRBZBtmifX5q94Q_bnc-uuxm";
const ADMIN_PASSWORD = "kozakuapro";

let supabase = null;

function initSupabase() {
  if (supabase) return;
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_K
EY);
  } else {
    console.error("Supabase JS не загрузился. Онлайн-режим будет отключён.");
  }
}

/* ==========================
   Карты и порядок пиков
   ========================== */

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

// Фиксированный порядок пиков 5x5
const DRAFT_ORDER = {
  cap1: [1, 4, 5, 7], // Команда 1
  cap2: [2, 3, 6, 8], // Команда 2
};

/* ==========================
   Роли и стратегии ИИ
   ========================== */

// Поддерживаемые роли:
// infantry, tanks, artillery, mechanical,
// motorized_infantry, sapper, assault_infantry,
// at_artillery, aa_artillery, spg, heavy_tanks

const ROLE_WEIGHTS = {
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
};

let currentAIStrategy = "balanced";

let players = []; // локальная база игроков
let isAdmin = false;

/* ==========================
   Оффлайн-драфт состояние
   ========================== */

const offlineDraft = {
  map: MAPS[0],
  pool: [], // имена
  available: [],
  team1: [],
  team2: [],
  currentPick: 1,
  maxPick: 8,
};

/* ==========================
   Онлайн состояние
   ========================== */

const online = {
  clientId: null,
  nickname: "",
  roomId: null,
  roomCode: null,
  myRole: "spectator", // 'captain1' | 'captain2' | 'spectator'
  isCreator: false,
  matchStatus: "idle", // 'idle' | 'lobby' | 'drafting' | 'finished'
  roomStateChannel: null,
  participantsChannel: null,
  participants: [],
  selectedMode: "human_vs_human",
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

/* ==========================
   Утилиты
   ========================== */

function $(id) {
  return document.getElementById(id);
}

function tierMultiplier(tier) {
  switch (tier) {
    case "S": return 10;
    case "A": return 2;
    case "B": return 1.4;
    case "C": return 1.1;
    case "D": return 1.0;
    case "F": return 0.7;
    default: return 1.0;
  }
}

function calcPlayerValue(p, strategyName) {
  const mmr = p.mmr || 0;
  const dpm = p.dpm || 0;
  const mul = tierMultiplier(p.tier || "D");
  const base = mmr * 1.0 + dpm * 0.002;
  const baseScore = base * mul;

  const strategyKey = strategyName || currentAIStrategy || "balanced";
  const roleWeights = ROLE_WEIGHTS[strategyKey] || ROLE_WEIGHTS["balanced"];

  let roleMul = 1.0;
  if (p.roles && p.roles.length > 0) {
    for (const r of p.roles) {
      const w = roleWeights[r] || 1.0;
      if (w > roleMul) roleMul = w;
    }
  }

  return baseScore * roleMul;
}

function rolesToString(p) {
  if (!p.roles || p.roles.length === 0) return "";
  return p.roles.join(", ");
}

/* ==========================
   Загрузка / сохранение игроков
   ========================== */

const STORAGE_KEYS = {
  players: "mow2_v8_players",
};

async function loadPlayers() {
  const raw = localStorage.getItem(STORAGE_KEYS.players);
  if (raw) {
    try {
      players = JSON.parse(raw);
      return;
    } catch (e) {
      console.warn("Failed to parse local players", e);
    }
  }

  try {
    const res = await fetch("players.json");
    if (!res.ok) throw new Error("players.json not found");
    const data = await res.json();
    players = data;
  } catch (e) {
    console.error("Failed to load players.json", e);
    players = [];
  }
}

function savePlayersLocal() {
  localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(players));
}

/* ==========================
   Навигация по экранам
   ========================== */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

/* ==========================
   Оффлайн-драфт
   ========================== */

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

  const aiSel = $("offline-ai-strategy");
  if (aiSel) {
    aiSel.value = currentAIStrategy;
    aiSel.addEventListener("change", () => {
      currentAIStrategy = aiSel.value;
    });
  }

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
    meta.textContent = `MMR: ${Math.round(p.mmr || 0)}, DPM: ${Math.round(p.dpm || 0)}, Tier: ${p.tier || "D"}`;
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
    chip.textContent = `${i} (${side})`;
    if (i === offlineDraft.currentPick) chip.classList.add("current");
    cont.appendChild(chip);
  }
}

function startOfflineDraft() {
  const err = $("offline-error");
  err.textContent = "";

  if (offlineDraft.pool.length < 10) {
    err.textContent = "Нужно минимум 10 игроков в пуле (2×5).";
    return;
  }

  offlineDraft.available = [...offlineDraft.pool];
  offlineDraft.team1 = [];
  offlineDraft.team2 = [];
  offlineDraft.currentPick = 1;
  offlineDraft.maxPick = 8;

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

  const side = DRAFT_ORDER.cap1.includes(offlineDraft.currentPick) ? "team1" : "team2";
  const sideLabel = side === "team1" ? "Команда 1" : "Команда 2";

  const headline = document.createElement("div");
  headline.className = "hint";
  headline.textContent = sideLabel + " — ход.";
  avail.appendChild(headline);

  const availSet = new Set(offlineDraft.available);
  const strategy = currentAIStrategy || "balanced";
  const availablePlayers = players.filter((p) => availSet.has(p.name));
  availablePlayers.sort((a, b) => calcPlayerValue(b, strategy) - calcPlayerValue(a, strategy));

  availablePlayers.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `MMR: ${Math.round(p.mmr || 0)}, DPM: ${Math.round(
      p.dpm || 0
    )}, Tier: ${p.tier || "D"}, Роли: ${rolesToString(p)}`;
    item.appendChild(nameSpan);
    item.appendChild(meta);
    item.addEventListener("click", () => pickOffline(side, p.name));
    avail.appendChild(item);
  });

  if (availablePlayers.length > 0) {
    const best = availablePlayers[0];
    const alt = availablePlayers.slice(1, 5);
    const lines = [];
    lines.push(
      `Рекомендуемый пик: ${best.name} (MMR ${Math.round(best.mmr || 0)}, DPM ${Math.round(
        best.dpm || 0
      )}, Tier ${best.tier || "D"}, Роли: ${rolesToString(best)})`
    );
    if (alt.length) {
      lines.push("Альтернативы:");
      alt.forEach((p) => {
        lines.push(
          ` - ${p.name} (MMR ${Math.round(p.mmr || 0)}, DPM ${Math.round(
            p.dpm || 0
          )}, Tier ${p.tier || "D"}, Роли: ${rolesToString(p)})`
        );
      });
    }
    sug.innerHTML = `<strong>Подсказка ИИ:</strong><br>${lines.join("<br>")}`;
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
  offlineDraft.team1.forEach((n) => (text += " - " + n + "\n"));
  text += "\nКоманда 2:\n";
  offlineDraft.team2.forEach((n) => (text += " - " + n + "\n"));
  ta.value = text;
  ta.focus();
  ta.select();
}

/* ==========================
   Экран игроков (локальная база)
   ========================== */

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
      item.className = "scroll-item" + (selectedPlayerName === p.name ? " selected" : "");
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = p.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `MMR: ${Math.round(p.mmr || 0)}, DPM: ${Math.round(
        p.dpm || 0
      )}, Tier: ${p.tier || "D"}, Роли: ${rolesToString(p)}`;

      item.appendChild(nameSpan);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        selectedPlayerName = p.name;
        renderPlayersList();
        renderPlayerEdit(p);
      });

      cont.appendChild(item);
    });
}

function renderPlayerEdit(p) {
  const panel = $("player-edit-panel");
  panel.innerHTML = "";
  if (!p) {
    panel.innerHTML = `<p class="hint">Выбери игрока слева.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="form-row">
      <label>Имя</label>
      <input type="text" id="edit-name" value="${p.name}" />
    </div>
    <div class="form-row">
      <label>Tier</label>
      <select id="edit-tier">
        <option value="S"${p.tier === "S" ? " selected" : ""}>S</option>
        <option value="A"${p.tier === "A" ? " selected" : ""}>A</option>
        <option value="B"${p.tier === "B" ? " selected" : ""}>B</option>
        <option value="C"${p.tier === "C" ? " selected" : ""}>C</option>
        <option value="D"${!p.tier || p.tier === "D" ? " selected" : ""}>D</option>
        <option value="F"${p.tier === "F" ? " selected" : ""}>F</option>
      </select>
    </div>
    <div class="form-row">
      <label>MMR</label>
      <input type="number" id="edit-mmr" value="${Math.round(p.mmr || 0)}" />
    </div>
    <div class="form-row">
      <label>DPM (средний урон)</label>
      <input type="number" id="edit-dpm" value="${Math.round(p.dpm || 0)}" />
    </div>
    <div class="form-row">
      <label>Роли (через запятую: infantry, tanks, artillery, mechanical, motorized_infantry, sapper, assault_infantry, at_artillery, aa_artillery, spg, heavy_tanks)</label>
      <input type="text" id="edit-roles" value="${(p.roles || []).join(", ")}" />
    </div>
    <button id="edit-save">Сохранить</button>
  `;

  $("edit-save").addEventListener("click", () => {
    const name = $("edit-name").value.trim();
    const tier = $("edit-tier").value;
    const mmr = Number($("edit-mmr").value) || 0;
    const dpm = Number($("edit-dpm").value) || 0;
    const rolesRaw = $("edit-roles").value.trim();
    const roles = rolesRaw
      ? rolesRaw.split(",").map((r) => r.trim()).filter(Boolean)
      : [];

    p.name = name;
    p.tier = tier;
    p.mmr = mmr;
    p.dpm = dpm;
    p.roles = roles;

    savePlayersLocal();
    renderPlayersList();
    renderPlayerEdit(p);
  });
}

function exportPlayersLocal() {
  const blob = new Blob([JSON.stringify(players, null, 2)], { type: "application/json" });
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
      if (Array.isArray(data)) {
        players = data;
        savePlayersLocal();
        renderPlayersList();
        $("player-edit-panel").innerHTML = `<p class="hint">Импорт выполнен.</p>`;
      } else {
        alert("JSON должен быть массивом игроков.");
      }
    } catch (err) {
      alert("Ошибка парсинга JSON: " + err.message);
    }
  };
  reader.readAsText(file);
}

/* ==========================
   Админ-панель (глобальная база через Supabase)
   ========================== */

function initAdminScreen() {
  $("admin-login-btn").addEventListener("click", () => {
    const input = $("admin-password").value;
    const status = $("admin-login-status");
    if (input === ADMIN_PASSWORD) {
      isAdmin = true;
      status.textContent = "Админ-режим активирован.";
      $("admin-actions").classList.remove("hidden");
      initSupabase();
    } else {
      isAdmin = false;
      status.textContent = "Неверный пароль.";
      $("admin-actions").classList.add("hidden");
    }
  });

  $("admin-load-global").addEventListener("click", async () => {
    if (!isAdmin) {
      $("admin-actions-status").textContent = "Сначала введи админ-пароль.";
      return;
    }
    initSupabase();
    if (!supabase) {
      $("admin-actions-status").textContent = "Supabase недоступен.";
      return;
    }
    $("admin-actions-status").textContent = "Загрузка из Supabase...";
    const { data, error } = await supabase.from("players_global").select("data");
    if (error) {
      console.error(error);
      $("admin-actions-status").textContent = "Ошибка: " + error.message;
      return;
    }
    if (Array.isArray(data)) {
      players = data.map((row) => row.data);
      savePlayersLocal();
      renderPlayersList();
      $("admin-actions-status").textContent = "Глобальная база загружена в локальную.";
    } else {
      $("admin-actions-status").textContent = "Данных в players_global нет.";
    }
  });

  $("admin-save-global").addEventListener("click", async () => {
    if (!isAdmin) {
      $("admin-actions-status").textContent = "Сначала введи админ-пароль.";
      return;
    }
    initSupabase();
    if (!supabase) {
      $("admin-actions-status").textContent = "Supabase недоступен.";
      return;
    }
    $("admin-actions-status").textContent = "Сохранение в Supabase...";
    const rows = players.map((p) => ({ name: p.name, data: p }));
    const { error } = await supabase.from("players_global").upsert(rows, { onConflict: "name" });
    if (error) {
      console.error(error);
      $("admin-actions-status").textContent = "Ошибка: " + error.message;
      return;
    }
    $("admin-actions-status").textContent = "Глобальная база обновлена.";
  });
}

/* ==========================
   Онлайн-драфт: комнаты и Realtime
   ========================== */

function initOnlineScreen() {
  initSupabase();
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
    if (online.roomId && (online.isCreator || online.myRole === "captain1" || online.myRole === "captain2")) {
      syncOnlineState();
    }
  });

  const modeSel = $("online-mode-select");
  if (modeSel) {
    modeSel.value = online.selectedMode;
    modeSel.addEventListener("change", () => {
      online.selectedMode = modeSel.value;
    });
  }

  const aiSel = $("online-ai-strategy");
  if (aiSel) {
    aiSel.value = currentAIStrategy;
    aiSel.addEventListener("change", () => {
      currentAIStrategy = aiSel.value;
      if (online.roomId && online.isCreator) {
        online.draft.strategy = currentAIStrategy;
        syncOnlineState();
      }
    });
  }

  $("online-create-room").addEventListener("click", createOnlineRoom);
  $("online-join-room").addEventListener("click", joinOnlineRoom);
  $("online-start-draft").addEventListener("click", startOnlineDraft);
}

function ensureNickname() {
  const nickInput = $("online-nickname");
  const nick = nickInput.value.trim();
  return nick || null;
}

async function createOnlineRoom() {
  initSupabase();
  const out = $("online-create-result");
  if (!supabase) {
    out.textContent = "Supabase не доступен, онлайн режим отключён.";
    return;
  }
  const nick = ensureNickname();
  if (!nick) {
    out.textContent = "Сначала введи ник.";
    return;
  }
  const pwd = $("online-create-password").value;

  online.nickname = nick;

  out.textContent = "Проверка лимита комнат...";
  const { count, error: countError } = await supabase
    .from("rooms")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error(countError);
    out.textContent = "Ошибка проверки лимита комнат: " + countError.message;
    return;
  }

  if ((count || 0) >= 50) {
    out.textContent = "Достигнут лимит 50 комнат. Удалите старые комнаты или подождите автоочистку.";
    return;
  }

  const code = Math.random().toString(36).substring(2, 7).toUpperCase();

  out.textContent = "Создание комнаты...";
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code,
      password: pwd || null,
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
  const aiSel = $("online-ai-strategy");
  if (aiSel) aiSel.value = online.draft.strategy;

  await supabase.from("room_state").upsert({
    room_id: online.roomId,
    state: online.draft,
  });

  await supabase.from("room_participants").upsert({
    room_id: online.roomId,
    client_id: online.clientId,
    nickname: online.nickname,
    role: "captain1",
  }, { onConflict: "room_id,client_id" });

  setupOnlineSubscriptions();
  renderOnlineDraft();
  renderOnlineParticipants();
  out.textContent = "Комната создана. Код: " + online.roomCode;
}

async function joinOnlineRoom() {
  initSupabase();
  const out = $("online-join-result");
  if (!supabase) {
    out.textContent = "Supabase не доступен, онлайн режим отключён.";
    return;
  }
  const nick = ensureNickname();
  if (!nick) {
    out.textContent = "Сначала введи ник.";
    return;
  }
  const code = $("online-join-code").value.trim().toUpperCase();
  const pwd = $("online-join-password").value;

  if (!code) {
    out.textContent = "Введи код комнаты.";
    return;
  }

  online.nickname = nick;

  out.textContent = "Поиск комнаты...";
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
    out.textContent = "Неверный пароль.";
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

  await supabase.from("room_participants").upsert({
    room_id: online.roomId,
    client_id: online.clientId,
    nickname: online.nickname,
    role: "spectator",
  }, { onConflict: "room_id,client_id" });

  const { data: stData, error: stErr } = await supabase
    .from("room_state")
    .select("state")
    .eq("room_id", online.roomId)
    .single();

  if (stErr) {
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
  const modeSel = $("online-mode-select");
  if (modeSel && online.draft.mode) {
    modeSel.value = online.draft.mode;
    online.selectedMode = online.draft.mode;
  }
  const aiSel = $("online-ai-strategy");
  if (aiSel && online.draft.strategy) {
    aiSel.value = online.draft.strategy;
    currentAIStrategy = online.draft.strategy;
  }

  renderOnlineDraft();
  setupOnlineSubscriptions();
  renderOnlineParticipants();
  out.textContent = "Подключено к комнате.";
}

function setupOnlineSubscriptions() {
  if (!online.roomId || !supabase) return;

  if (online.roomStateChannel) supabase.removeChannel(online.roomStateChannel);
  if (online.participantsChannel) supabase.removeChannel(online.participantsChannel);

  online.roomStateChannel = supabase
    .channel("room_state_" + online.roomId)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "room_state", filter: "room_id=eq." + online.roomId },
      (payload) => {
        online.draft = payload.new.state;
        $("online-map-select").value = online.draft.map;
        const modeSel = $("online-mode-select");
        if (modeSel && online.draft.mode) {
          modeSel.value = online.draft.mode;
          online.selectedMode = online.draft.mode;
        }
        const aiSel = $("online-ai-strategy");
        if (aiSel && online.draft.strategy) {
          aiSel.value = online.draft.strategy;
          currentAIStrategy = online.draft.strategy;
        }
        online.matchStatus =
          online.draft.currentPick > online.draft.maxPick
            ? "finished"
            : online.draft.currentPick === 1
            ? "lobby"
            : "drafting";
        $("online-match-status").textContent =
          online.matchStatus === "finished"
            ? "Драфт завершён"
            : online.matchStatus === "lobby"
            ? "Лобби"
            : "Драфт идёт";
        renderOnlineDraft();
      }
    )
    .subscribe();

  online.participantsChannel = supabase
    .channel("room_participants_" + online.roomId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_participants", filter: "room_id=eq." + online.roomId },
      () => {
        loadOnlineParticipants();
      }
    )
    .subscribe();

  loadOnlineParticipants();
}

async function loadOnlineParticipants() {
  if (!online.roomId || !supabase) return;
  const { data, error } = await supabase
    .from("room_participants")
    .select("*")
    .eq("room_id", online.roomId);

  if (error) {
    console.error(error);
    return;
  }

  online.participants = data || [];
  const me = online.participants.find((p) => p.client_id === online.clientId);
  if (me) {
    online.myRole = me.role;
    $("online-my-role").textContent =
      me.role === "captain1"
        ? "Капитан 1"
        : me.role === "captain2"
        ? "Капитан 2"
        : "Зритель";
  }
  renderOnlineParticipants();
  renderCreatorPanel();
}

function renderOnlineParticipants() {
  const cont = $("online-participants");
  cont.innerHTML = "";
  online.participants.forEach((p) => {
    const div = document.createElement("div");
    div.className = "scroll-item";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.nickname;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent =
      p.client_id === online.clientId ? `${p.role} (ты)` : p.role;
    div.appendChild(name);
    div.appendChild(meta);
    cont.appendChild(div);
  });
}

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

  panel.innerHTML = `
    <p class="hint">
      Панель создателя комнаты: назначай капитанов, кикай лишних и передрафчивай матч.
    </p>
    <div class="form-row">
      <label>Капитан 1</label>
      <select id="creator-cap1-select"></select>
    </div>
    <div class="form-row">
      <label>Капитан 2</label>
      <select id="creator-cap2-select"></select>
    </div>
    <button id="creator-apply-roles">Применить роли</button>
    <div class="form-row">
      <label>Кикнуть пользователя из комнаты</label>
      <select id="creator-kick-select"></select>
    </div>
    <button id="creator-kick-btn">Кикнуть</button>
    <hr style="border-color:#333;margin:8px 0;" />
    <div class="form-row">
      <label>Новый пароль комнаты (можно оставить пустым)</label>
      <input type="password" id="creator-new-password" />
    </div>
    <button id="creator-change-password">Обновить пароль комнаты</button>
    <hr style="border-color:#333;margin:8px 0;" />
    <button id="creator-reset-draft">Передрафтить (начать матч заново)</button>
  `;

  const selCap1 = $("creator-cap1-select");
  const selCap2 = $("creator-cap2-select");
  const selKick = $("creator-kick-select");

  parts.forEach((p) => {
    const opt1 = document.createElement("option");
    opt1.value = p.id;
    opt1.textContent = `${p.nickname} (${p.role})`;
    selCap1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = p.id;
    opt2.textContent = `${p.nickname} (${p.role})`;
    selCap2.appendChild(opt2);

    const optK = document.createElement("option");
    optK.value = p.id;
    optK.textContent = `${p.nickname} (${p.role})`;
    selKick.appendChild(optK);
  });

  if (cap1) selCap1.value = cap1.id;
  if (cap2) selCap2.value = cap2.id;

  $("creator-apply-roles").addEventListener("click", applyCreatorRoles);
  $("creator-change-password").addEventListener("click", changeRoomPassword);
  $("creator-reset-draft").addEventListener("click", () => {
    startOnlineDraft();
  });
  $("creator-kick-btn").addEventListener("click", kickParticipant);
}

async function applyCreatorRoles() {
  initSupabase();
  if (!supabase || !online.roomId) return;
  const id1 = $("creator-cap1-select").value;
  const id2 = $("creator-cap2-select").value;
  const ids = online.participants.map((p) => p.id);
  if (!ids.length) return;

  try {
    await supabase.from("room_participants").update({ role: "spectator" }).in("id", ids);
    if (id1) {
      await supabase.from("room_participants").update({ role: "captain1" }).eq("id", id1);
    }
    if (id2 && id2 !== id1) {
      await supabase.from("room_participants").update({ role: "captain2" }).eq("id", id2);
    }
    loadOnlineParticipants();
  } catch (e) {
    console.error(e);
  }
}

async function kickParticipant() {
  initSupabase();
  if (!supabase) return;
  const id = $("creator-kick-select").value;
  if (!id) return;
  try {
    await supabase.from("room_participants").delete().eq("id", id);
    loadOnlineParticipants();
  } catch (e) {
    console.error(e);
  }
}

async function changeRoomPassword() {
  initSupabase();
  if (!supabase || !online.roomId) return;
  const newPwd = $("creator-new-password").value || null;
  try {
    await supabase.from("rooms").update({ password: newPwd }).eq("id", online.roomId);
  } catch (e) {
    console.error(e);
  }
}

async function syncOnlineState() {
  initSupabase();
  if (!supabase || !online.roomId) return;
  await supabase.from("room_state").update({ state: online.draft }).eq("room_id", online.roomId);
}

/* ==========================
   Онлайн: отрисовка и ход ИИ
   ========================== */

function renderOnlineDraft() {
  const t1 = $("online-team1");
  const t2 = $("online-team2");
  const avail = $("online-available");
  const sug = $("online-suggestions");
  const block = $("online-draft-block");

  t1.innerHTML = "";
  t2.innerHTML = "";
  avail.innerHTML = "";
  sug.innerHTML = "";

  const mode = online.draft.mode || "human_vs_human";
  const strategy = online.draft.strategy || currentAIStrategy || "balanced";

  $("online-match-status").textContent =
    online.draft.currentPick > online.draft.maxPick
      ? "Драфт завершён"
      : online.draft.currentPick === 1
      ? "Лобби / начало"
      : "Драфт идёт";

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

  const cont = $("online-pick-order");
  cont.innerHTML = "";
  for (let i = 1; i <= online.draft.maxPick; i++) {
    const chip = document.createElement("div");
    chip.className = "pick-chip";
    const side = DRAFT_ORDER.cap1.includes(i) ? "К1" : "К2";
    chip.textContent = `${i} (${side})`;
    if (i === online.draft.currentPick) chip.classList.add("current");
    cont.appendChild(chip);
  }

  block.classList.remove("hidden");

  if (
    online.roomId &&
    online.isCreator &&
    online.draft.currentPick <= online.draft.maxPick
  ) {
    const pickNum = online.draft.currentPick;
    const side = DRAFT_ORDER.cap1.includes(pickNum) ? "team1" : "team2";
    const sideRole = side === "team1" ? "captain1" : "captain2";

    if (mode === "human_vs_ai" && sideRole === "captain2") {
      aiPickCurrentSide();
      return;
    }

    if (mode === "ai_vs_ai") {
      aiPickCurrentSide();
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
  const isMyTurn = online.myRole === sideRole;

  const headline = document.createElement("div");
  headline.className = "hint";
  headline.textContent =
    sideLabel +
    (isMyTurn ? " — твой ход, выбирай игрока." : " — ход противника.");
  avail.appendChild(headline);

  const availSet = new Set(online.draft.available);
  const availablePlayers = players.filter((p) => availSet.has(p.name));
  availablePlayers.sort((a, b) => calcPlayerValue(b, strategy) - calcPlayerValue(a, strategy));

  availablePlayers.forEach((p) => {
    const item = document.createElement("div");
    item.className = "scroll-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `MMR: ${Math.round(p.mmr || 0)}, DPM: ${Math.round(
      p.dpm || 0
    )}, Tier: ${p.tier || "D"}, Роли: ${rolesToString(p)}`;
    item.appendChild(nameSpan);
    item.appendChild(meta);

    if (isMyTurn && mode === "human_vs_human") {
      item.addEventListener("click", () => {
        pickOnline(side, p.name);
      });
    }
    if (isMyTurn && mode === "human_vs_ai" && sideRole === "captain1") {
      item.addEventListener("click", () => {
        pickOnline(side, p.name);
      });
    }

    avail.appendChild(item);
  });

  if (
    availablePlayers.length > 0 &&
    isMyTurn &&
    (mode === "human_vs_human" ||
      (mode === "human_vs_ai" && sideRole === "captain1"))
  ) {
    const best = availablePlayers[0];
    const alt = availablePlayers.slice(1, 5);
    const lines = [];
    lines.push(
      `Рекомендуемый пик: ${best.name} (MMR ${Math.round(
        best.mmr || 0
      )}, DPM ${Math.round(best.dpm || 0)}, Tier ${best.tier || "D"}, Роли: ${rolesToString(
        best
      )})`
    );
    if (alt.length > 0) {
      lines.push("Альтернативы:");
      alt.forEach((p) => {
        lines.push(
          ` - ${p.name} (MMR ${Math.round(p.mmr || 0)}, DPM ${Math.round(
            p.dpm || 0
          )}, Tier ${p.tier || "D"}, Роли: ${rolesToString(p)})`
        );
      });
    }
    sug.innerHTML = `<strong>Подсказка ИИ (видишь только ты):</strong><br>${lines.join(
      "<br>"
    )}`;
  } else {
    sug.textContent = "";
  }
}

async function startOnlineDraft() {
  const err = $("online-error");
  err.textContent = "";
  initSupabase();
  if (!supabase) {
    err.textContent = "Supabase не доступен, онлайн режим отключён.";
    return;
  }
  if (!online.roomId) {
    err.textContent = "Сначала создай или зайди в комнату.";
    return;
  }
  if (!online.isCreator) {
    err.textContent = "Только создатель комнаты может запускать/передрафтить матч.";
    return;
  }

  const modeSel = $("online-mode-select");
  const mode = modeSel ? modeSel.value : "human_vs_human";
  online.draft.mode = mode;
  online.selectedMode = mode;

  online.draft.map = $("online-map-select").value;
  online.draft.pool = players.map((p) => p.name);
  online.draft.available = [...online.draft.pool];
  online.draft.team1 = [];
  online.draft.team2 = [];
  online.draft.currentPick = 1;
  online.draft.maxPick = 8;
  online.draft.strategy = currentAIStrategy || "balanced";

  const aiSel = $("online-ai-strategy");
  if (aiSel) aiSel.value = online.draft.strategy;

  online.matchStatus = "drafting";
  $("online-match-status").textContent = "Драфт идёт";
  await syncOnlineState();
  renderOnlineDraft();
}

async function pickOnline(side, name) {
  initSupabase();
  if (!supabase || !online.roomId) return;
  const pickNum = online.draft.currentPick;
  const sideRole = DRAFT_ORDER.cap1.includes(pickNum) ? "captain1" : "captain2";
  if (online.myRole !== sideRole) return;

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

async function aiPickCurrentSide() {
  initSupabase();
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
  availablePlayers.sort((a, b) => calcPlayerValue(b, strategy) - calcPlayerValue(a, strategy));

  const topN = Math.min(3, availablePlayers.length);
  const idxRand = Math.floor(Math.random() * topN);
  const picked = availablePlayers[idxRand];

  const idx = online.draft.available.indexOf(picked.name);
  if (idx !== -1) {
    online.draft.available.splice(idx, 1);
  }
  if (side === "team1") {
    if (!online.draft.team1.includes(picked.name)) online.draft.team1.push(picked.name);
  } else {
    if (!online.draft.team2.includes(picked.name)) online.draft.team2.push(picked.name);
  }

  online.draft.currentPick += 1;
  if (online.draft.currentPick > online.draft.maxPick) {
    online.matchStatus = "finished";
  } else {
    online.matchStatus = "drafting";
  }
  await syncOnlineState();
}

/* ==========================
   Инициализация всего
   ========================== */

window.addEventListener("load", async () => {
  // clientId для онлайн режима
  let cid = localStorage.getItem("mow2_v8_client_id");
  if (!cid) {
    cid = crypto.randomUUID();
    localStorage.setItem("mow2_v8_client_id", cid);
  }
  online.clientId = cid;

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

  await loadPlayers();
  initOffline();
  initPlayersScreen();
  initAdminScreen();
  initOnlineScreen();

  showScreen("screen-menu");
});
