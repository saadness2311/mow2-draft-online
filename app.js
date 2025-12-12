// MoW2 Draft Project - V15.0 core logic (Offline Only)
// Требует: index.html, style.css
// Внешние данные (опционально, если localStorage пуст):
// - players.json
// - ai_strategies_local.json
// - ai_coeffs_local.json
// - ai_settings.json
//
// Важно:
// - НЕТ карты, НЕТ Supabase, НЕТ онлайн режима.
// - Всё настраивается через UI и сохраняется в localStorage.
// - Подсказки: 1 лучший + 2 альтернативы (по умолчанию).

(function () {
  "use strict";

  // ------------------------------------------------------
  // --- Константы, версии, списки
  // ------------------------------------------------------

  const APP_VERSION = "V15.0";

  const LOCAL_STORAGE_KEYS = {
    LANGUAGE: "mow2_v15_language",
    PLAYERS: "mow2_v15_players",
    STRATEGIES: "mow2_v15_strategies",
    COEFFS: "mow2_v15_coeffs",
    AI_SETTINGS: "mow2_v15_ai_settings",
    UI_SETTINGS: "mow2_v15_ui_settings",
    OFFLINE_DRAFT: "mow2_v15_offline_draft"
  };

  const TIERS = ["S", "A", "B", "C", "D", "F"];
  const TIER_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };

  const ROLE_IDS = [
    "infantry",
    "motorized_infantry",
    "assault_infantry",
    "mechanical",
    "tanks",
    "heavy_tanks",
    "artillery",
    "at_artillery",
    "aa_artillery",
    "spg",
    "sapper"
  ];

  // Default RU labels for roles. EN labels come from i18n.
  const ROLE_LABELS_RU = {
    infantry: "Пехота",
    motorized_infantry: "Мотопехота",
    assault_infantry: "Штурмовая пехота",
    mechanical: "Механка",
    tanks: "Танки",
    heavy_tanks: "Тяжёлые танки",
    artillery: "Артиллерия",
    at_artillery: "ПТО",
    aa_artillery: "ПВО",
    spg: "САУ",
    sapper: "Сапёры"
  };

  // Draft order is fixed: 8 picks (captains are not picks; teams end up 5 total with captain)
  const DRAFT_ORDER = [
    { pick: 1, team: "team1" },
    { pick: 2, team: "team2" },
    { pick: 3, team: "team2" },
    { pick: 4, team: "team1" },
    { pick: 5, team: "team1" },
    { pick: 6, team: "team2" },
    { pick: 7, team: "team1" },
    { pick: 8, team: "team2" }
  ];

  // ------------------------------------------------------
  // --- Вспомогательные функции
  // ------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text != null ? String(text) : "";
  }

  function safeParseJSON(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (err) {
      console.error("JSON parse error:", err);
      return fallback;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function downloadJSON(obj, filename) {
    const jsonStr = JSON.stringify(obj, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("FileReader error"));
      reader.readAsText(file);
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  function isTier(t) {
    return TIERS.indexOf(t) !== -1;
  }

  function tierRank(tier) {
    return TIER_RANK[tier] != null ? TIER_RANK[tier] : 999;
  }

  function comparePlayersPower(a, b) {
    // Higher tier first, then higher MMR.
    const ta = tierRank(a.tier);
    const tb = tierRank(b.tier);
    if (ta !== tb) return ta - tb;
    return (b.mmr || 0) - (a.mmr || 0);
  }

  function uniqueArray(arr) {
    const seen = {};
    const out = [];
    (arr || []).forEach((x) => {
      const k = String(x);
      if (!seen[k]) {
        seen[k] = true;
        out.push(x);
      }
    });
    return out;
  }

  // ------------------------------------------------------
  // --- i18nModule: RU/EN
  // ------------------------------------------------------

  const i18nModule = (function () {
    const dict = {
      ru: {
        "header.language": "Язык",
        "common.backToMenu": "Назад в меню",
        "common.save": "Сохранить",
        "common.delete": "Удалить",
        "common.exportJson": "Экспорт JSON",
        "common.importJson": "Импорт JSON",
        "common.name": "Имя",
        "common.tier": "Tier",
        "common.mmr": "MMR",
        "common.dpm": "DPM",
        "common.roles": "Роли",
        "common.inPool": "В пуле",
        "common.role": "Роль",
        "common.weight": "Вес",
        "common.yes": "Да",
        "common.no": "Нет",

        "menu.title": "Главное меню",
        "menu.welcomeTitle": "MoW2 Draft Project — V15.0",
        "menu.welcomeSubtitle": "Оффлайн режим. Все настройки меняются через интерфейс и сохраняются локально.",
        "menu.imageHint": "Здесь можно загрузить рофляную картинку в разделе «Внешний вид».",
        "menu.offlineDraft": "Оффлайн драфт",
        "menu.offlineDraftDesc": "Human vs AI / AI vs AI / Manual",
        "menu.players": "Игроки и статистика",
        "menu.playersDesc": "Редактор базы игроков",
        "menu.strategies": "Стратегии",
        "menu.strategiesDesc": "Планы состава и веса ролей",
        "menu.coeffs": "Базовые коэффициенты",
        "menu.coeffsDesc": "Tier-множители и шанс альтернативного пика",
        "menu.aiSettings": "AI-настройки",
        "menu.aiSettingsDesc": "Вся математика и планирование",
        "menu.importExport": "Импорт / Экспорт",
        "menu.importExportDesc": "Отдельно и Bundle",
        "menu.appearance": "Внешний вид",
        "menu.appearanceDesc": "Фон, лого, картинка меню",

        "offline.title": "Оффлайн драфт",
        "offline.matchSettings": "Настройки матча",
        "offline.modeLabel": "Режим",
        "offline.humanSideLabel": "Сторона человека",
        "offline.team1": "Команда 1",
        "offline.team2": "Команда 2",
        "offline.strategyTeam1Label": "Стратегия Team1",
        "offline.strategyTeam2Label": "Стратегия Team2",
        "offline.resetDraft": "Сбросить драфт",
        "offline.resetAll": "Сбросить всё (пул+капитаны)",
        "offline.showPlanning": "Показывать дальний план",
        "offline.captainsTitle": "Капитаны",
        "offline.captain1Search": "Поиск капитана 1",
        "offline.captain1Select": "Капитан команды 1",
        "offline.captain2Search": "Поиск капитана 2",
        "offline.captain2Select": "Капитан команды 2",
        "offline.captainsNote": "Капитаны учитываются в составе и в логике стратегий, но не выбираются как обычные пики.",
        "offline.poolTitle": "Пул игроков",
        "offline.poolAll": "Все игроки в пул",
        "offline.poolTop20": "Топ-20 по MMR",
        "offline.poolClear": "Очистить пул",
        "offline.poolNote": "В пул попадают только кандидаты на пики (капитаны не управляются пулом).",
        "offline.draftStateTitle": "Текущее состояние драфта",
        "offline.team1Title": "Команда 1",
        "offline.team2Title": "Команда 2",
        "offline.captain": "Капитан:",
        "offline.pickOrder": "Порядок пиков",
        "offline.availablePlayers": "Доступные игроки",
        "offline.hintsTitle": "Подсказки и планирование",
        "offline.hintsTeam1": "Подсказки Team1",
        "offline.hintsTeam2": "Подсказки Team2",
        "offline.exportTitle": "Экспорт результата",
        "offline.finishDraft": "Завершить драфт",
        "offline.copyExport": "Скопировать в буфер",

        "players.title": "Игроки и статистика",
        "players.listTitle": "Список игроков",
        "players.filterName": "Фильтр по имени",
        "players.filterTier": "Фильтр по Tier",
        "players.allTiers": "Все",
        "players.addNew": "Добавить нового игрока",
        "players.editTitle": "Редактирование игрока",
        "players.rolesTitle": "Роли игрока",

        "strategies.title": "Стратегии",
        "strategies.selectTitle": "Выбор стратегии",
        "strategies.current": "Текущая стратегия",
        "strategies.add": "Добавить стратегию",
        "strategies.delete": "Удалить стратегию",
        "strategies.nameRu": "Название (RU)",
        "strategies.nameEn": "Название (EN)",
        "strategies.descRu": "Описание (RU)",
        "strategies.descEn": "Описание (EN)",
        "strategies.compositionTargets": "Цели состава (минимумы на команду из 5)",
        "strategies.targetInfantry": "Пехота",
        "strategies.targetTanks": "Танки",
        "strategies.targetMechanical": "Механка",
        "strategies.targetSupport": "Поддержка",
        "strategies.roleWeightsTitle": "Веса ролей",
        "strategies.jsonTitle": "JSON (для быстрой правки)",
        "strategies.applyJson": "Обновить из JSON",

        "coeffs.title": "Базовые коэффициенты",
        "coeffs.tierMultipliers": "Tier множители",
        "coeffs.altPickChance": "Вероятность альтернативного пика",
        "coeffs.tierBias": "TierBias (общий множитель)",

        "aiSettings.title": "AI-настройки",
        "aiSettings.formulaTitle": "Формулы и веса",
        "aiSettings.wMmr": "Вес MMR",
        "aiSettings.wDpm": "Вес DPM",
        "aiSettings.wRole": "Вес ролей",
        "aiSettings.wComp": "Вес состава",
        "aiSettings.wUniversal": "Вес универсальности",
        "aiSettings.wCounter": "Вес контров",
        "aiSettings.penaltiesMult": "Множитель штрафов",
        "aiSettings.noiseAmp": "Шум (амплитуда)",
        "aiSettings.tierDominance": "Доминирование Tier",
        "aiSettings.tierDomEnabled": "Включено",
        "aiSettings.tierDownPenalty": "Штраф за выбор ниже Tier, если есть выше",
        "aiSettings.mmrSettings": "MMR настройки",
        "aiSettings.mmrMin": "MMR min",
        "aiSettings.mmrMax": "MMR max",
        "aiSettings.mmrGapThreshold": "Порог разницы MMR",
        "aiSettings.mmrGapBonus": "Бонус за каждые +100 MMR",
        "aiSettings.universalBlock": "Универсальность",
        "aiSettings.universalMinRoles": "Универсал: минимум ролей",
        "aiSettings.universalBonus": "Бонус универсалу",
        "aiSettings.dontSpendUniversal": "Не тратить универсала на поддержку",
        "aiSettings.universalSupportPenalty": "Штраф универсалу за «support-слот»",
        "aiSettings.planningTitle": "Планирование, soft-caps, подсказки",
        "aiSettings.planning": "Планирование",
        "aiSettings.planningEnabled": "Включено",
        "aiSettings.candidateTopK": "CandidateTopK",
        "aiSettings.enemyModel": "Модель врага",
        "aiSettings.enemyPowerFirst": "Power-first",
        "aiSettings.enemySameStrategy": "Same as selected",
        "aiSettings.softCapsTitle": "Soft-caps",
        "aiSettings.supportOnlyMax": "Support-only maxPreferred",
        "aiSettings.supportOnlyPenalty2": "Штраф за 2-го support-only",
        "aiSettings.supportOnlyPenalty3": "Штраф за 3+ support-only",
        "aiSettings.supportTotalMax": "Support total maxPreferred",
        "aiSettings.supportTotalPenalty": "Штраф за каждый лишний support",
        "aiSettings.hintsTitle": "Подсказки",
        "aiSettings.altsCount": "Количество альтернатив",
        "aiSettings.showOpponentHints": "Показывать подсказки противника в Human vs AI",
        "aiSettings.jsonTitle": "JSON (полный объект)",
        "aiSettings.applyJson": "Обновить из JSON",

        "importExport.title": "Импорт / Экспорт",
        "importExport.exportTitle": "Экспорт",
        "importExport.exportPlayers": "Экспорт игроков",
        "importExport.exportStrategies": "Экспорт стратегий",
        "importExport.exportCoeffs": "Экспорт коэффициентов",
        "importExport.exportAiSettings": "Экспорт AI-настроек",
        "importExport.bundleTitle": "Bundle",
        "importExport.exportBundle": "Экспорт Bundle",
        "importExport.importBundle": "Импорт Bundle",
        "importExport.importTitle": "Импорт (по отдельности)",
        "importExport.importPlayers": "Импорт игроков",
        "importExport.importStrategies": "Импорт стратегий",
        "importExport.importCoeffs": "Импорт коэффициентов",
        "importExport.importAiSettings": "Импорт AI-настроек",
        "importExport.note": "Все импорты записываются в localStorage и сразу применяются ко всем экранам.",

        "appearance.title": "Внешний вид",
        "appearance.background": "Фон",
        "appearance.uploadBackground": "Загрузить фон (png/jpg/webp)",
        "appearance.resetBackground": "Сбросить фон",
        "appearance.logo": "Лого",
        "appearance.uploadLogo": "Загрузить лого",
        "appearance.resetLogo": "Сбросить лого",
        "appearance.menuImage": "Картинка меню",
        "appearance.uploadMenuImage": "Загрузить картинку",
        "appearance.resetMenuImage": "Сбросить картинку",
        "appearance.accentColor": "Акцентный цвет",
        "appearance.preview": "Превью",
        "appearance.previewHeader": "Шапка",
        "appearance.previewCards": "Карточки",
        "appearance.note": "Фон/лого/картинка меню сохраняются в localStorage и попадают в Bundle."
      },
      en: {
        "header.language": "Language",
        "common.backToMenu": "Back to menu",
        "common.save": "Save",
        "common.delete": "Delete",
        "common.exportJson": "Export JSON",
        "common.importJson": "Import JSON",
        "common.name": "Name",
        "common.tier": "Tier",
        "common.mmr": "MMR",
        "common.dpm": "DPM",
        "common.roles": "Roles",
        "common.inPool": "In pool",
        "common.role": "Role",
        "common.weight": "Weight",
        "common.yes": "Yes",
        "common.no": "No",

        "menu.title": "Main Menu",
        "menu.welcomeTitle": "MoW2 Draft Project — V15.0",
        "menu.welcomeSubtitle": "Offline mode. All settings are editable via UI and stored locally.",
        "menu.imageHint": "You can upload a funny image in the “Appearance” section.",
        "menu.offlineDraft": "Offline Draft",
        "menu.offlineDraftDesc": "Human vs AI / AI vs AI / Manual",
        "menu.players": "Players & Stats",
        "menu.playersDesc": "Local players database editor",
        "menu.strategies": "Strategies",
        "menu.strategiesDesc": "Composition plans and role weights",
        "menu.coeffs": "Base Coefficients",
        "menu.coeffsDesc": "Tier multipliers and alternative pick chance",
        "menu.aiSettings": "AI Settings",
        "menu.aiSettingsDesc": "All math and planning controls",
        "menu.importExport": "Import / Export",
        "menu.importExportDesc": "Separate files and Bundle",
        "menu.appearance": "Appearance",
        "menu.appearanceDesc": "Background, logo, menu image",

        "offline.title": "Offline Draft",
        "offline.matchSettings": "Match Settings",
        "offline.modeLabel": "Mode",
        "offline.humanSideLabel": "Human side",
        "offline.team1": "Team 1",
        "offline.team2": "Team 2",
        "offline.strategyTeam1Label": "Strategy Team1",
        "offline.strategyTeam2Label": "Strategy Team2",
        "offline.resetDraft": "Reset draft",
        "offline.resetAll": "Reset all (pool + captains)",
        "offline.showPlanning": "Show long plan",
        "offline.captainsTitle": "Captains",
        "offline.captain1Search": "Captain 1 search",
        "offline.captain1Select": "Captain Team 1",
        "offline.captain2Search": "Captain 2 search",
        "offline.captain2Select": "Captain Team 2",
        "offline.captainsNote": "Captains are part of the roster and are considered by the AI, but are not drafted as picks.",
        "offline.poolTitle": "Player Pool",
        "offline.poolAll": "All players into pool",
        "offline.poolTop20": "Top-20 by MMR",
        "offline.poolClear": "Clear pool",
        "offline.poolNote": "Only in-pool players are draft candidates (captains are not controlled by the pool).",
        "offline.draftStateTitle": "Draft State",
        "offline.team1Title": "Team 1",
        "offline.team2Title": "Team 2",
        "offline.captain": "Captain:",
        "offline.pickOrder": "Pick Order",
        "offline.availablePlayers": "Available Players",
        "offline.hintsTitle": "Hints & Planning",
        "offline.hintsTeam1": "Hints Team1",
        "offline.hintsTeam2": "Hints Team2",
        "offline.exportTitle": "Export Result",
        "offline.finishDraft": "Finish draft",
        "offline.copyExport": "Copy to clipboard",

        "players.title": "Players & Stats",
        "players.listTitle": "Players List",
        "players.filterName": "Name filter",
        "players.filterTier": "Tier filter",
        "players.allTiers": "All",
        "players.addNew": "Add new player",
        "players.editTitle": "Edit Player",
        "players.rolesTitle": "Player roles",

        "strategies.title": "Strategies",
        "strategies.selectTitle": "Select Strategy",
        "strategies.current": "Current strategy",
        "strategies.add": "Add strategy",
        "strategies.delete": "Delete strategy",
        "strategies.nameRu": "Name (RU)",
        "strategies.nameEn": "Name (EN)",
        "strategies.descRu": "Description (RU)",
        "strategies.descEn": "Description (EN)",
        "strategies.compositionTargets": "Composition targets (minimums for a team of 5)",
        "strategies.targetInfantry": "Infantry",
        "strategies.targetTanks": "Tanks",
        "strategies.targetMechanical": "Mechanized",
        "strategies.targetSupport": "Support",
        "strategies.roleWeightsTitle": "Role Weights",
        "strategies.jsonTitle": "JSON (quick edit)",
        "strategies.applyJson": "Apply JSON",

        "coeffs.title": "Base Coefficients",
        "coeffs.tierMultipliers": "Tier multipliers",
        "coeffs.altPickChance": "Alternative pick chance",
        "coeffs.tierBias": "TierBias (global multiplier)",

        "aiSettings.title": "AI Settings",
        "aiSettings.formulaTitle": "Formula & weights",
        "aiSettings.wMmr": "MMR weight",
        "aiSettings.wDpm": "DPM weight",
        "aiSettings.wRole": "Role preference weight",
        "aiSettings.wComp": "Composition weight",
        "aiSettings.wUniversal": "Universality weight",
        "aiSettings.wCounter": "Counters weight",
        "aiSettings.penaltiesMult": "Penalties multiplier",
        "aiSettings.noiseAmp": "Noise amplitude",
        "aiSettings.tierDominance": "Tier dominance",
        "aiSettings.tierDomEnabled": "Enabled",
        "aiSettings.tierDownPenalty": "Penalty for lower Tier if higher exists",
        "aiSettings.mmrSettings": "MMR settings",
        "aiSettings.mmrMin": "MMR min",
        "aiSettings.mmrMax": "MMR max",
        "aiSettings.mmrGapThreshold": "MMR gap threshold",
        "aiSettings.mmrGapBonus": "Bonus per +100 MMR",
        "aiSettings.universalBlock": "Universality",
        "aiSettings.universalMinRoles": "Universal: min roles",
        "aiSettings.universalBonus": "Universal bonus",
        "aiSettings.dontSpendUniversal": "Do not spend universal on support",
        "aiSettings.universalSupportPenalty": "Universal penalty for support slot",
        "aiSettings.planningTitle": "Planning, soft-caps, hints",
        "aiSettings.planning": "Planning",
        "aiSettings.planningEnabled": "Enabled",
        "aiSettings.candidateTopK": "CandidateTopK",
        "aiSettings.enemyModel": "Enemy model",
        "aiSettings.enemyPowerFirst": "Power-first",
        "aiSettings.enemySameStrategy": "Same as selected",
        "aiSettings.softCapsTitle": "Soft-caps",
        "aiSettings.supportOnlyMax": "Support-only maxPreferred",
        "aiSettings.supportOnlyPenalty2": "Penalty for 2nd support-only",
        "aiSettings.supportOnlyPenalty3": "Penalty for 3+ support-only",
        "aiSettings.supportTotalMax": "Support total maxPreferred",
        "aiSettings.supportTotalPenalty": "Penalty per extra support",
        "aiSettings.hintsTitle": "Hints",
        "aiSettings.altsCount": "Alternatives count",
        "aiSettings.showOpponentHints": "Show opponent hints in Human vs AI",
        "aiSettings.jsonTitle": "JSON (full object)",
        "aiSettings.applyJson": "Apply JSON",

        "importExport.title": "Import / Export",
        "importExport.exportTitle": "Export",
        "importExport.exportPlayers": "Export players",
        "importExport.exportStrategies": "Export strategies",
        "importExport.exportCoeffs": "Export coefficients",
        "importExport.exportAiSettings": "Export AI settings",
        "importExport.bundleTitle": "Bundle",
        "importExport.exportBundle": "Export Bundle",
        "importExport.importBundle": "Import Bundle",
        "importExport.importTitle": "Import (separate files)",
        "importExport.importPlayers": "Import players",
        "importExport.importStrategies": "Import strategies",
        "importExport.importCoeffs": "Import coefficients",
        "importExport.importAiSettings": "Import AI settings",
        "importExport.note": "All imports are stored in localStorage and applied immediately.",

        "appearance.title": "Appearance",
        "appearance.background": "Background",
        "appearance.uploadBackground": "Upload background (png/jpg/webp)",
        "appearance.resetBackground": "Reset background",
        "appearance.logo": "Logo",
        "appearance.uploadLogo": "Upload logo",
        "appearance.resetLogo": "Reset logo",
        "appearance.menuImage": "Menu image",
        "appearance.uploadMenuImage": "Upload image",
        "appearance.resetMenuImage": "Reset image",
        "appearance.accentColor": "Accent color",
        "appearance.preview": "Preview",
        "appearance.previewHeader": "Header",
        "appearance.previewCards": "Cards",
        "appearance.note": "Background/logo/menu image are stored in localStorage and included in the Bundle."
      }
    };

    const roleLabelsEn = {
      infantry: "Infantry",
      motorized_infantry: "Motorized Infantry",
      assault_infantry: "Assault Infantry",
      mechanical: "Mechanized",
      tanks: "Tanks",
      heavy_tanks: "Heavy Tanks",
      artillery: "Artillery",
      at_artillery: "AT (Anti-tank)",
      aa_artillery: "AA (Anti-air)",
      spg: "SPG",
      sapper: "Sappers"
    };

    const reasonTexts = {
      ru: {
        TIER_HIGHER: "выше по Tier",
        MMR_GAP: "выше по MMR (разница {gap})",
        CLOSES_TARGET: "закрывает цель состава: {cat} ({now}/{target})",
        PROGRESS: "улучшает состав: {cat} ({now}/{target})",
        UNIVERSAL: "универсал: ролей {count}",
        SUPPORT_SPECIALIST: "профильная поддержка (лучше на support-слот)",
        AVOID_SUPPORT_OVERLOAD: "избегаем перекоса в поддержку",
        SOFTCAP_SUPPORT_ONLY: "слишком много игроков только под поддержку",
        COUNTER: "контрит: {detail}",
        POWER_FIRST: "сильный игрок (Tier/MMR)"
      },
      en: {
        TIER_HIGHER: "higher Tier",
        MMR_GAP: "higher MMR (gap {gap})",
        CLOSES_TARGET: "meets composition target: {cat} ({now}/{target})",
        PROGRESS: "improves composition: {cat} ({now}/{target})",
        UNIVERSAL: "universal: roles {count}",
        SUPPORT_SPECIALIST: "support specialist (better for support slot)",
        AVOID_SUPPORT_OVERLOAD: "avoids support overload",
        SOFTCAP_SUPPORT_ONLY: "too many support-only specialists",
        COUNTER: "counters: {detail}",
        POWER_FIRST: "strong player (Tier/MMR)"
      }
    };

    let currentLang = "ru";

    function t(key, params) {
      const map = dict[currentLang] || dict.ru;
      let s = map[key] != null ? map[key] : (dict.ru[key] != null ? dict.ru[key] : key);
      if (params && typeof params === "object") {
        Object.keys(params).forEach((k) => {
          s = s.replaceAll("{" + k + "}", String(params[k]));
        });
      }
      return s;
    }

    function roleLabel(roleId) {
      if (currentLang === "en") {
        return roleLabelsEn[roleId] || roleId;
      }
      return ROLE_LABELS_RU[roleId] || roleId;
    }

    function categoryLabel(cat) {
      // cat: infantry, tanks, mechanical, support
      if (currentLang === "en") {
        if (cat === "infantry") return "Infantry";
        if (cat === "tanks") return "Tanks";
        if (cat === "mechanical") return "Mechanized";
        if (cat === "support") return "Support";
        return cat;
      }
      if (cat === "infantry") return "Пехота";
      if (cat === "tanks") return "Танки";
      if (cat === "mechanical") return "Механка";
      if (cat === "support") return "Поддержка";
      return cat;
    }

    function setLanguage(lang) {
      currentLang = lang === "en" ? "en" : "ru";
      localStorage.setItem(LOCAL_STORAGE_KEYS.LANGUAGE, currentLang);
      applyStaticTranslations();
      document.documentElement.lang = currentLang;
    }

    function getLanguage() {
      return currentLang;
    }

    function loadLanguage() {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEYS.LANGUAGE);
      if (saved === "en" || saved === "ru") {
        currentLang = saved;
      }
      document.documentElement.lang = currentLang;
    }

    function applyStaticTranslations() {
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;
        el.textContent = t(key);
      });
    }

    function reasonToText(reason) {
      if (!reason || typeof reason !== "object") return "";
      const code = String(reason.code || "");
      const params = reason.params || {};
      const map = reasonTexts[currentLang] || reasonTexts.ru;
      let template = map[code] || code;
      Object.keys(params).forEach((k) => {
        template = template.replaceAll("{" + k + "}", String(params[k]));
      });
      return template;
    }

    return {
      t,
      roleLabel,
      categoryLabel,
      setLanguage,
      getLanguage,
      loadLanguage,
      applyStaticTranslations,
      reasonToText
    };
  })();

  // ------------------------------------------------------
  // --- dataModule: загрузка, localStorage, дефолты, валидация
  // ------------------------------------------------------

  const dataModule = (function () {
    const state = {
      players: [],
      strategies: null,
      coeffs: null,
      aiSettings: null,
      uiSettings: null
    };

    const defaultCoeffs = {
      tier: { S: 10.0, A: 2.0, B: 1.4, C: 1.1, D: 1.0, F: 0.7 },
      altPickChance: 0.2,
      tierBias: 1.0
    };

    const defaultUiSettings = {
      accentColor: "#7a1f1f",
      backgroundDataUrl: null,
      logoDataUrl: null,
      menuImageDataUrl: null
    };

    function validatePlayer(p) {
      if (!p || typeof p !== "object") return false;
      if (typeof p.name !== "string" || !p.name.trim()) return false;
      if (!isTier(p.tier)) return false;
      if (typeof p.mmr !== "number" || !isFinite(p.mmr)) return false;
      if (typeof p.dpm !== "number" || !isFinite(p.dpm)) return false;
      if (!Array.isArray(p.roles)) return false;
      const roles = p.roles.map((r) => String(r));
      p.roles = uniqueArray(roles.filter((r) => ROLE_IDS.indexOf(r) !== -1));
      if (!p.roles.length) p.roles = ["infantry"];
      p.name = p.name.trim();
      return true;
    }

    function validatePlayers(arr) {
      if (!Array.isArray(arr)) return [];
      const out = [];
      const seen = {};
      arr.forEach((p) => {
        const copy = deepClone(p);
        if (validatePlayer(copy)) {
          if (!seen[copy.name]) {
            seen[copy.name] = true;
            out.push(copy);
          }
        }
      });
      return out;
    }

    function validateCoeffs(obj) {
      const out = deepClone(defaultCoeffs);
      if (!obj || typeof obj !== "object") return out;

      if (obj.tier && typeof obj.tier === "object") {
        TIERS.forEach((t) => {
          if (typeof obj.tier[t] === "number" && isFinite(obj.tier[t])) {
            out.tier[t] = obj.tier[t];
          }
        });
      }
      if (typeof obj.altPickChance === "number" && isFinite(obj.altPickChance)) {
        out.altPickChance = clamp(obj.altPickChance, 0, 1);
      }
      if (typeof obj.tierBias === "number" && isFinite(obj.tierBias)) {
        out.tierBias = Math.max(0, obj.tierBias);
      }
      return out;
    }

    function validateStrategies(obj) {
      // Expected V15 structure:
      // { version:"15.0", strategies: { key: {display:{ru,en}, description:{ru,en}, roleWeights:{roleId:number}, compositionTargets:{...}, specialTargets:{...}, overrides:{...}} } }
      if (!obj || typeof obj !== "object") return null;
      if (!obj.strategies || typeof obj.strategies !== "object") return null;

      const out = {
        version: obj.version || "15.0",
        strategies: {}
      };

      Object.keys(obj.strategies).forEach((key) => {
        const s = obj.strategies[key];
        if (!s || typeof s !== "object") return;

        const display = s.display && typeof s.display === "object" ? s.display : {};
        const description = s.description && typeof s.description === "object" ? s.description : {};

        const roleWeights = {};
        ROLE_IDS.forEach((r) => {
          let v = 1.0;
          if (s.roleWeights && typeof s.roleWeights[r] === "number") {
            v = s.roleWeights[r];
          }
          roleWeights[r] = Number(v) || 0;
        });

        const compositionTargets = {
          infantry: 0,
          tanks: 0,
          mechanical: 0,
          support: 0
        };
        if (s.compositionTargets && typeof s.compositionTargets === "object") {
          Object.keys(compositionTargets).forEach((cat) => {
            if (typeof s.compositionTargets[cat] === "number" && isFinite(s.compositionTargets[cat])) {
              compositionTargets[cat] = clamp(Math.round(s.compositionTargets[cat]), 0, 5);
            }
          });
        }

        const specialTargets = {};
        if (s.specialTargets && typeof s.specialTargets === "object") {
          Object.keys(s.specialTargets).forEach((k2) => {
            if (ROLE_IDS.indexOf(k2) !== -1) {
              const v2 = s.specialTargets[k2];
              if (typeof v2 === "number" && isFinite(v2)) {
                specialTargets[k2] = clamp(Math.round(v2), 0, 5);
              }
            }
          });
        }

        const overrides = s.overrides && typeof s.overrides === "object" ? deepClone(s.overrides) : {};

        out.strategies[key] = {
          display: {
            ru: typeof display.ru === "string" ? display.ru : key,
            en: typeof display.en === "string" ? display.en : key
          },
          description: {
            ru: typeof description.ru === "string" ? description.ru : "",
            en: typeof description.en === "string" ? description.en : ""
          },
          roleWeights: roleWeights,
          compositionTargets: compositionTargets,
          specialTargets: specialTargets,
          overrides: overrides
        };
      });

      if (!Object.keys(out.strategies).length) return null;
      return out;
    }

    function validateAiSettings(obj) {
      // We keep it permissive but enforce required blocks.
      if (!obj || typeof obj !== "object") return null;
      if (!obj.formula || typeof obj.formula !== "object") return null;
      if (!obj.roleGroups || typeof obj.roleGroups !== "object") return null;
      if (!obj.formula.weights || typeof obj.formula.weights !== "object") return null;

      // Shallow clone; detailed edits happen in UI (we still normalize critical pieces).
      const out = deepClone(obj);

      // Ensure roleGroups contain arrays and only known roles
      Object.keys(out.roleGroups).forEach((cat) => {
        if (!Array.isArray(out.roleGroups[cat])) out.roleGroups[cat] = [];
        out.roleGroups[cat] = uniqueArray(out.roleGroups[cat].map(String)).filter((r) => ROLE_IDS.indexOf(r) !== -1);
      });

      // Ensure supportSubtypeWeights exist for support roles
      if (!out.supportSubtypeWeights || typeof out.supportSubtypeWeights !== "object") {
        out.supportSubtypeWeights = {};
      }
      ["artillery", "spg", "at_artillery", "aa_artillery"].forEach((r) => {
        if (typeof out.supportSubtypeWeights[r] !== "number") {
          out.supportSubtypeWeights[r] = 1.0;
        }
      });

      return out;
    }

    function loadFromLocalStorage() {
      const pStr = localStorage.getItem(LOCAL_STORAGE_KEYS.PLAYERS);
      if (pStr) {
        state.players = validatePlayers(safeParseJSON(pStr, []));
      }

      const sStr = localStorage.getItem(LOCAL_STORAGE_KEYS.STRATEGIES);
      if (sStr) {
        const parsed = safeParseJSON(sStr, null);
        const validated = validateStrategies(parsed);
        if (validated) state.strategies = validated;
      }

      const cStr = localStorage.getItem(LOCAL_STORAGE_KEYS.COEFFS);
      if (cStr) {
        state.coeffs = validateCoeffs(safeParseJSON(cStr, null));
      }

      const aStr = localStorage.getItem(LOCAL_STORAGE_KEYS.AI_SETTINGS);
      if (aStr) {
        const validated = validateAiSettings(safeParseJSON(aStr, null));
        if (validated) state.aiSettings = validated;
      }

      const uiStr = localStorage.getItem(LOCAL_STORAGE_KEYS.UI_SETTINGS);
      if (uiStr) {
        const parsed = safeParseJSON(uiStr, null);
        if (parsed && typeof parsed === "object") {
          state.uiSettings = Object.assign({}, defaultUiSettings, parsed);
        }
      }
    }

    function savePlayers() {
      localStorage.setItem(LOCAL_STORAGE_KEYS.PLAYERS, JSON.stringify(state.players));
    }

    function saveStrategies() {
      if (!state.strategies) return;
      localStorage.setItem(LOCAL_STORAGE_KEYS.STRATEGIES, JSON.stringify(state.strategies));
    }

    function saveCoeffs() {
      if (!state.coeffs) return;
      localStorage.setItem(LOCAL_STORAGE_KEYS.COEFFS, JSON.stringify(state.coeffs));
    }

    function saveAiSettings() {
      if (!state.aiSettings) return;
      localStorage.setItem(LOCAL_STORAGE_KEYS.AI_SETTINGS, JSON.stringify(state.aiSettings));
    }

    function saveUiSettings() {
      if (!state.uiSettings) return;
      localStorage.setItem(LOCAL_STORAGE_KEYS.UI_SETTINGS, JSON.stringify(state.uiSettings));
    }

    function setPlayers(arr) {
      state.players = validatePlayers(arr);
      savePlayers();
    }

    function setCoeffs(obj) {
      state.coeffs = validateCoeffs(obj);
      saveCoeffs();
    }

    function setStrategies(obj) {
      const validated = validateStrategies(obj);
      if (!validated) {
        throw new Error("Invalid strategies format");
      }
      state.strategies = validated;
      saveStrategies();
    }

    function setAiSettings(obj) {
      const validated = validateAiSettings(obj);
      if (!validated) {
        throw new Error("Invalid ai_settings format");
      }
      state.aiSettings = validated;
      saveAiSettings();
    }

    function setUiSettings(obj) {
      state.uiSettings = Object.assign({}, defaultUiSettings, obj || {});
      saveUiSettings();
    }

    function getPlayers() {
      return state.players || [];
    }

    function getPlayerByName(name) {
      const arr = getPlayers();
      return arr.find((p) => p.name === name) || null;
    }

    function getCoeffs() {
      return state.coeffs || deepClone(defaultCoeffs);
    }

    function getStrategies() {
      return state.strategies;
    }

    function getAiSettings() {
      return state.aiSettings;
    }

    function getUiSettings() {
      return state.uiSettings || deepClone(defaultUiSettings);
    }

    function fetchIfMissing() {
      const promises = [];

      if (!state.players || !state.players.length) {
        promises.push(fetch("players.json", { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => {
            const validated = validatePlayers(data);
            state.players = validated;
            savePlayers();
          })
          .catch(() => {
            state.players = [];
            savePlayers();
          }));
      }

      if (!state.strategies) {
        promises.push(fetch("ai_strategies_local.json", { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const validated = validateStrategies(data);
            if (validated) {
              state.strategies = validated;
              saveStrategies();
            }
          })
          .catch(() => {}));
      }

      if (!state.coeffs) {
        promises.push(fetch("ai_coeffs_local.json", { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            state.coeffs = validateCoeffs(data);
            saveCoeffs();
          })
          .catch(() => {
            state.coeffs = deepClone(defaultCoeffs);
            saveCoeffs();
          }));
      }

      if (!state.aiSettings) {
        promises.push(fetch("ai_settings.json", { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const validated = validateAiSettings(data);
            if (validated) {
              state.aiSettings = validated;
              saveAiSettings();
            }
          })
          .catch(() => {}));
      }

      if (!state.uiSettings) {
        state.uiSettings = deepClone(defaultUiSettings);
        saveUiSettings();
      }

      return Promise.all(promises);
    }

    function exportPlayersFile() {
      downloadJSON(getPlayers(), "players.json");
    }

    function exportStrategiesFile() {
      downloadJSON(getStrategies(), "ai_strategies_local.json");
    }

    function exportCoeffsFile() {
      downloadJSON(getCoeffs(), "ai_coeffs_local.json");
    }

    function exportAiSettingsFile() {
      downloadJSON(getAiSettings(), "ai_settings.json");
    }

    function exportBundle() {
      const bundle = {
        version: APP_VERSION,
        createdAt: new Date().toISOString(),
        language: i18nModule.getLanguage(),
        players: getPlayers(),
        strategies: getStrategies(),
        coeffs: getCoeffs(),
        aiSettings: getAiSettings(),
        uiSettings: getUiSettings()
      };
      downloadJSON(bundle, "mow2_draft_bundle_v15.json");
    }

    function importPlayersText(text) {
      const parsed = safeParseJSON(text, null);
      const validated = validatePlayers(parsed);
      setPlayers(validated);
      return true;
    }

    function importStrategiesText(text) {
      const parsed = safeParseJSON(text, null);
      setStrategies(parsed);
      return true;
    }

    function importCoeffsText(text) {
      const parsed = safeParseJSON(text, null);
      setCoeffs(parsed);
      return true;
    }

    function importAiSettingsText(text) {
      const parsed = safeParseJSON(text, null);
      setAiSettings(parsed);
      return true;
    }

    function importBundleText(text) {
      const parsed = safeParseJSON(text, null);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid bundle JSON");

      if (parsed.language === "ru" || parsed.language === "en") {
        i18nModule.setLanguage(parsed.language);
        const langSel = $("lang-select");
        if (langSel) langSel.value = parsed.language;
      }

      if (parsed.players) setPlayers(parsed.players);
      if (parsed.strategies) setStrategies(parsed.strategies);
      if (parsed.coeffs) setCoeffs(parsed.coeffs);
      if (parsed.aiSettings) setAiSettings(parsed.aiSettings);
      if (parsed.uiSettings) setUiSettings(parsed.uiSettings);

      return true;
    }

    function init() {
      loadFromLocalStorage();
      return fetchIfMissing().then(() => true);
    }

    return {
      init,
      ROLE_IDS: ROLE_IDS,
      getPlayers,
      getPlayerByName,
      setPlayers,
      getCoeffs,
      setCoeffs,
      getStrategies,
      setStrategies,
      getAiSettings,
      setAiSettings,
      getUiSettings,
      setUiSettings,
      savePlayers,
      saveStrategies,
      saveCoeffs,
      saveAiSettings,
      saveUiSettings,
      exportPlayersFile,
      exportStrategiesFile,
      exportCoeffsFile,
      exportAiSettingsFile,
      exportBundle,
      importPlayersText,
      importStrategiesText,
      importCoeffsText,
      importAiSettingsText,
      importBundleText
    };
  })();

  // ------------------------------------------------------
  // --- themeModule: фон/лого/картинка меню/акцент
  // ------------------------------------------------------

  const themeModule = (function () {
    function applyTheme() {
      const ui = dataModule.getUiSettings();
      const accent = ui.accentColor || "#7a1f1f";
      document.documentElement.style.setProperty("--accent-color", accent);
      document.documentElement.style.setProperty("--accent-glow", "rgba(122, 31, 31, 0.35)");

      if (ui.backgroundDataUrl) {
        document.body.style.backgroundImage = "url('" + ui.backgroundDataUrl + "')";
      } else {
        document.body.style.backgroundImage = "none";
      }

      const logo = $("app-logo");
      if (logo) {
        if (ui.logoDataUrl) {
          logo.src = ui.logoDataUrl;
          logo.style.opacity = "1";
        } else {
          logo.removeAttribute("src");
          logo.style.opacity = "0.35";
        }
      }

      const menuImg = $("menu-fun-image");
      if (menuImg) {
        if (ui.menuImageDataUrl) {
          menuImg.src = ui.menuImageDataUrl;
          menuImg.style.opacity = "1";
        } else {
          menuImg.removeAttribute("src");
          menuImg.style.opacity = "0.35";
        }
      }

      const accentPicker = $("appearance-accent-color");
      if (accentPicker) {
        accentPicker.value = accent;
      }
    }

    function resetBackground() {
      const ui = dataModule.getUiSettings();
      ui.backgroundDataUrl = null;
      dataModule.setUiSettings(ui);
      applyTheme();
    }

    function resetLogo() {
      const ui = dataModule.getUiSettings();
      ui.logoDataUrl = null;
      dataModule.setUiSettings(ui);
      applyTheme();
    }

    function resetMenuImage() {
      const ui = dataModule.getUiSettings();
      ui.menuImageDataUrl = null;
      dataModule.setUiSettings(ui);
      applyTheme();
    }

    function initAppearanceUI() {
      const bgFile = $("appearance-bg-file");
      const logoFile = $("appearance-logo-file");
      const menuFile = $("appearance-menuimg-file");
      const accentColor = $("appearance-accent-color");

      const resetBgBtn = $("appearance-reset-bg-btn");
      const resetLogoBtn = $("appearance-reset-logo-btn");
      const resetMenuBtn = $("appearance-reset-menuimg-btn");
      const saveBtn = $("appearance-save-btn");
      const status = $("appearance-status");

      if (bgFile) {
        bgFile.addEventListener("change", function () {
          const file = bgFile.files && bgFile.files[0];
          if (!file) return;
          readFileAsDataURL(file).then((dataUrl) => {
            const ui = dataModule.getUiSettings();
            ui.backgroundDataUrl = dataUrl;
            dataModule.setUiSettings(ui);
            applyTheme();
            setText(status, i18nModule.t("common.save") + ": OK");
          });
        });
      }

      if (logoFile) {
        logoFile.addEventListener("change", function () {
          const file = logoFile.files && logoFile.files[0];
          if (!file) return;
          readFileAsDataURL(file).then((dataUrl) => {
            const ui = dataModule.getUiSettings();
            ui.logoDataUrl = dataUrl;
            dataModule.setUiSettings(ui);
            applyTheme();
            setText(status, i18nModule.t("common.save") + ": OK");
          });
        });
      }

      if (menuFile) {
        menuFile.addEventListener("change", function () {
          const file = menuFile.files && menuFile.files[0];
          if (!file) return;
          readFileAsDataURL(file).then((dataUrl) => {
            const ui = dataModule.getUiSettings();
            ui.menuImageDataUrl = dataUrl;
            dataModule.setUiSettings(ui);
            applyTheme();
            setText(status, i18nModule.t("common.save") + ": OK");
          });
        });
      }

      if (resetBgBtn) resetBgBtn.addEventListener("click", function () { resetBackground(); setText(status, "OK"); });
      if (resetLogoBtn) resetLogoBtn.addEventListener("click", function () { resetLogo(); setText(status, "OK"); });
      if (resetMenuBtn) resetMenuBtn.addEventListener("click", function () { resetMenuImage(); setText(status, "OK"); });

      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          const ui = dataModule.getUiSettings();
          if (accentColor) {
            ui.accentColor = accentColor.value || ui.accentColor;
          }
          dataModule.setUiSettings(ui);
          applyTheme();
          setText(status, i18nModule.t("common.save") + ": OK");
        });
      }

      applyTheme();
    }

    return {
      applyTheme,
      initAppearanceUI,
      resetBackground,
      resetLogo,
      resetMenuImage
    };
  })();

  // ------------------------------------------------------
  // --- aiModule: оценка, подсказки, планирование
  // ------------------------------------------------------

  const aiModule = (function () {
    function getRoleGroups() {
      const s = dataModule.getAiSettings();
      return (s && s.roleGroups) ? s.roleGroups : {
        infantry: ["infantry", "motorized_infantry", "assault_infantry", "sapper"],
        tanks: ["tanks", "heavy_tanks"],
        mechanical: ["mechanical"],
        support: ["artillery", "spg", "at_artillery", "aa_artillery"]
      };
    }

    function getSupportSubtypeWeights() {
      const s = dataModule.getAiSettings();
      const w = (s && s.supportSubtypeWeights) ? s.supportSubtypeWeights : {};
      return {
        artillery: typeof w.artillery === "number" ? w.artillery : 1.0,
        spg: typeof w.spg === "number" ? w.spg : 1.0,
        at_artillery: typeof w.at_artillery === "number" ? w.at_artillery : 1.0,
        aa_artillery: typeof w.aa_artillery === "number" ? w.aa_artillery : 1.0
      };
    }

    function normalizeMMR(mmr, settings) {
      const norm = settings.formula.normalization;
      const mode = norm.mmrMode || "minmax";
      if (mode === "div") {
        const div = Number(norm.mmrDiv) || 100.0;
        return (Number(mmr) || 0) / div;
      }
      // minmax
      const min = Number(norm.mmrMin) || 1000;
      const max = Number(norm.mmrMax) || 2500;
      if (max <= min) return 0;
      return clamp(((Number(mmr) || 0) - min) / (max - min), 0, 1);
    }

    function normalizeDPM(dpm, settings) {
      const norm = settings.formula.normalization;
      const mode = norm.dpmMode || "div";
      if (mode === "minmax") {
        // If you later want it, add dpmMin/dpmMax here (kept in JSON for future patching).
        const min = Number(norm.dpmMin) || 0;
        const max = Number(norm.dpmMax) || 50000;
        if (max <= min) return 0;
        return clamp(((Number(dpm) || 0) - min) / (max - min), 0, 1);
      }
      const div = Number(norm.dpmDiv) || 5000.0;
      return (Number(dpm) || 0) / div;
    }

    function playerHasAnyRole(player, rolesArr) {
      if (!player || !Array.isArray(player.roles)) return false;
      for (let i = 0; i < rolesArr.length; i++) {
        if (player.roles.indexOf(rolesArr[i]) !== -1) return true;
      }
      return false;
    }

    function getPlayerCategories(player) {
      const groups = getRoleGroups();
      const out = {
        infantry: playerHasAnyRole(player, groups.infantry || []),
        tanks: playerHasAnyRole(player, groups.tanks || []),
        mechanical: playerHasAnyRole(player, groups.mechanical || []),
        support: playerHasAnyRole(player, groups.support || [])
      };
      return out;
    }

    function isSupportOnlySpecialist(player) {
      const groups = getRoleGroups();
      const support = groups.support || [];
      const roles = Array.isArray(player.roles) ? player.roles : [];
      if (!roles.length) return false;

      // support-only means: all roles are in support group
      for (let i = 0; i < roles.length; i++) {
        if (support.indexOf(roles[i]) === -1) return false;
      }
      return true;
    }

    function countSupportOnly(players) {
      let c = 0;
      (players || []).forEach((p) => {
        if (isSupportOnlySpecialist(p)) c++;
      });
      return c;
    }

    function countSupportTotal(players) {
      const groups = getRoleGroups();
      const support = groups.support || [];
      let c = 0;
      (players || []).forEach((p) => {
        if (playerHasAnyRole(p, support)) c++;
      });
      return c;
    }

    function countRoleInTeam(players, roleId) {
      let c = 0;
      (players || []).forEach((p) => {
        if (Array.isArray(p.roles) && p.roles.indexOf(roleId) !== -1) c++;
      });
      return c;
    }

    function countCategoryInTeam(players, category) {
      let c = 0;
      (players || []).forEach((p) => {
        const cats = getPlayerCategories(p);
        if (cats[category]) c++;
      });
      return c;
    }

    function computeTierFactor(player, coeffs) {
      const tierMult = coeffs && coeffs.tier && typeof coeffs.tier[player.tier] === "number"
        ? coeffs.tier[player.tier]
        : 1.0;
      const bias = coeffs && typeof coeffs.tierBias === "number" ? coeffs.tierBias : 1.0;
      return tierMult * bias;
    }

    function getBestTierRankAmong(available) {
      let best = 999;
      (available || []).forEach((p) => {
        const tr = tierRank(p.tier);
        if (tr < best) best = tr;
      });
      return best;
    }

    function getStrategyByKey(key) {
      const pack = dataModule.getStrategies();
      if (!pack || !pack.strategies) return null;
      return pack.strategies[key] || null;
    }

    function getStrategyKeyList() {
      const pack = dataModule.getStrategies();
      if (!pack || !pack.strategies) return [];
      return Object.keys(pack.strategies);
    }

    function calcRolePreferenceScore(player, strategy) {
      const roles = Array.isArray(player.roles) ? player.roles : [];
      if (!strategy || !strategy.roleWeights) return 0;

      let sum = 0;
      roles.forEach((r) => {
        const w = typeof strategy.roleWeights[r] === "number" ? strategy.roleWeights[r] : 0;
        sum += w;
      });
      return sum;
    }

    function calcCompositionScore(player, ownTeamPlayers, strategy, aiSettings) {
      if (!strategy || !strategy.compositionTargets) return 0;
      const targets = strategy.compositionTargets;
      const groups = getRoleGroups();

      const cats = getPlayerCategories(player);
      const weights = aiSettings.formula.composition || {};
      const catWeights = weights.categoryWeights || {};
      const progressBonus = Number(weights.progressBonusPerMissing) || 0;
      const alreadyFactor = Number(weights.alreadySatisfiedFactor) || 0;
      const oversupplyPenalty = Number(weights.oversupplyPenaltyPerExtra) || 0;

      let score = 0;
      ["infantry", "tanks", "mechanical", "support"].forEach((cat) => {
        const target = Number(targets[cat] || 0);
        if (target <= 0) return;

        const now = countCategoryInTeam(ownTeamPlayers, cat);
        const contributes = !!cats[cat];

        if (!contributes) return;

        const weight = typeof catWeights[cat] === "number" ? catWeights[cat] : 1.0;

        if (now < target) {
          const missing = target - now;
          score += weight * progressBonus * missing;
        } else {
          // already satisfied: still may be useful, but reduced
          score += weight * alreadyFactor;
          // oversupply penalty: if you already have more than target
          const extra = now - target + 1;
          score -= weight * oversupplyPenalty * extra;
        }
      });

      // support subtype nuance (AT more valuable by default)
      if (cats.support) {
        const subW = getSupportSubtypeWeights();
        const roles = Array.isArray(player.roles) ? player.roles : [];
        let bestSub = 0;
        roles.forEach((r) => {
          if (subW[r] != null) {
            bestSub = Math.max(bestSub, Number(subW[r]) || 0);
          }
        });
        score *= clamp(0.6 + bestSub * 0.4, 0.4, 1.6);
      }

      // specialTargets: e.g., need heavy_tanks: 2
      if (strategy.specialTargets && typeof strategy.specialTargets === "object") {
        Object.keys(strategy.specialTargets).forEach((roleId) => {
          const target = Number(strategy.specialTargets[roleId] || 0);
          if (target <= 0) return;
          const now = countRoleInTeam(ownTeamPlayers, roleId);
          if (now < target) {
            if (Array.isArray(player.roles) && player.roles.indexOf(roleId) !== -1) {
              // reward strongly if it helps achieve a special target
              score += 1.25 * (target - now);
            }
          }
        });
      }

      // universal support discount (do not treat universal as full support by default)
      const uni = aiSettings.formula.universal || {};
      const minRolesForUni = Number(uni.minRolesToBeUniversal) || 4;
      const isUni = (Array.isArray(player.roles) ? player.roles.length : 0) >= minRolesForUni;
      const comp = aiSettings.formula.composition || {};
      const universalSupportDiscountFactor = typeof comp.universalSupportDiscountFactor === "number"
        ? comp.universalSupportDiscountFactor
        : 0.35;

      if (isUni && cats.support) {
        score *= clamp(1.0 - universalSupportDiscountFactor, 0.1, 1.0);
      }

      return score;
    }

    function calcUniversalScore(player, aiSettings) {
      const uni = aiSettings.formula.universal || {};
      const rolesCount = Array.isArray(player.roles) ? player.roles.length : 0;

      const minUni = Number(uni.minRolesToBeUniversal) || 4;
      const uniBonus = Number(uni.universalBonus) || 0;
      const minAvoidNarrow = Number(uni.minRolesToAvoidNarrow) || 2;
      const narrowPenalty = Number(uni.narrowSpecialistPenalty) || 0;

      let s = 0;
      if (rolesCount >= minUni) {
        s += uniBonus;
      } else if (rolesCount < minAvoidNarrow) {
        s -= narrowPenalty;
      }
      return s;
    }

    function calcCounterScore(player, enemyTeamPlayers, aiSettings) {
      const counterCfg = aiSettings.formula.counter || {};
      if (!counterCfg.enabled) return 0;

      const table = aiSettings.counterTable || {};
      const roles = Array.isArray(player.roles) ? player.roles : [];
      let sum = 0;

      roles.forEach((myRole) => {
        const map = table[myRole];
        if (!map || typeof map !== "object") return;

        enemyTeamPlayers.forEach((ep) => {
          const eroles = Array.isArray(ep.roles) ? ep.roles : [];
          eroles.forEach((er) => {
            if (typeof map[er] === "number") {
              sum += Number(map[er]) || 0;
            }
          });
        });
      });

      const mult = Number(counterCfg.globalWeightMultiplier) || 1.0;
      return sum * mult;
    }

    function calcPenalties(player, ownTeamPlayers, availablePlayers, strategy, aiSettings) {
      const soft = aiSettings.formula.softCaps || {};
      const penaltiesMult = Number(aiSettings.formula.weights.penaltiesMultiplier) || 1.0;

      let penalty = 0;

      // Support-only soft cap
      if (soft.supportOnly && soft.supportOnly.enabled) {
        const maxPref = Number(soft.supportOnly.maxPreferred) || 0;
        const pen2 = Number(soft.supportOnly.penaltySecond) || 0;
        const pen3 = Number(soft.supportOnly.penaltyThirdPlus) || 0;

        const currentCount = countSupportOnly(ownTeamPlayers);
        const willBeSupportOnly = isSupportOnlySpecialist(player);

        if (willBeSupportOnly) {
          if (currentCount >= maxPref) {
            if (currentCount === maxPref) penalty += pen2;
            if (currentCount > maxPref) penalty += pen3;
          }
        }
      }

      // Support total soft cap
      if (soft.supportTotal && soft.supportTotal.enabled) {
        const maxPref = Number(soft.supportTotal.maxPreferred) || 0;
        const penPer = Number(soft.supportTotal.penaltyPerExtra) || 0;

        const groups = getRoleGroups();
        const supportRoles = groups.support || [];

        const currentSupport = countSupportTotal(ownTeamPlayers);
        const willBeSupport = playerHasAnyRole(player, supportRoles);

        if (willBeSupport) {
          const next = currentSupport + 1;
          if (next > maxPref) {
            penalty += penPer * (next - maxPref);
          }
        }
      }

      // "Don't spend universal on support" preference
      const uni = aiSettings.formula.universal || {};
      const dontSpend = !!uni.dontSpendUniversalOnSupport;
      const universalOnSupportPenalty = Number(uni.universalOnSupportPenalty) || 0;

      if (dontSpend) {
        const rolesCount = Array.isArray(player.roles) ? player.roles.length : 0;
        const minUni = Number(uni.minRolesToBeUniversal) || 4;
        const isUni = rolesCount >= minUni;
        const cats = getPlayerCategories(player);
        if (isUni && cats.support) {
          // We only penalize if there exist support-specialists among available (so we can save universal)
          const groups = getRoleGroups();
          const support = groups.support || [];
          const anySupportOnlyAvailable = (availablePlayers || []).some((p) => isSupportOnlySpecialist(p));
          if (anySupportOnlyAvailable) {
            penalty += universalOnSupportPenalty;
          }
        }
      }

      return penalty * penaltiesMult;
    }

    function calcMmrGapBonus(player, availablePlayers, aiSettings) {
      const cfg = aiSettings.formula.mmrGap || {};
      const thr = Number(cfg.threshold) || 100;
      const per100 = Number(cfg.bonusPer100) || 0;

      // For gap logic we compare with the best MMR in the SAME Tier among available (excluding player)
      const sameTier = (availablePlayers || []).filter((p) => p.tier === player.tier && p.name !== player.name);
      if (!sameTier.length) return 0;

      let bestOther = 0;
      sameTier.forEach((p) => {
        bestOther = Math.max(bestOther, Number(p.mmr) || 0);
      });

      const gap = (Number(player.mmr) || 0) - bestOther;
      if (gap <= thr) return 0;

      // Each +100 over threshold gives bonusPer100
      const hundredSteps = Math.floor(gap / 100);
      return hundredSteps * per100;
    }

    function calcTierDominancePenalty(player, availablePlayers, aiSettings) {
      const td = aiSettings.formula.tierDominance || {};
      if (!td.enabled) return 0;

      const bestRank = getBestTierRankAmong(availablePlayers);
      const myRank = tierRank(player.tier);

      if (myRank <= bestRank) return 0;

      const p = Number(td.downPenaltyWhenHigherExists) || 0;
      // Penalty grows by tier steps difference
      const steps = myRank - bestRank;
      return p * steps;
    }

    function calcPlayerValue(player, context) {
      // context: { ownTeamPlayers, enemyTeamPlayers, availablePlayers, strategyKey, mode }
      const coeffs = dataModule.getCoeffs();
      const aiSettings = dataModule.getAiSettings();
      const strategy = getStrategyByKey(context.strategyKey) || getStrategyByKey("balanced");

      const w = aiSettings.formula.weights || {};

      const mmrScore = normalizeMMR(player.mmr, aiSettings);
      const dpmScore = normalizeDPM(player.dpm, aiSettings);

      const powerScore = (Number(w.mmr) || 0) * mmrScore + (Number(w.dpm) || 0) * dpmScore;

      const rolePrefRaw = calcRolePreferenceScore(player, strategy);
      const rolePrefScore = (Number(w.rolePref) || 0) * rolePrefRaw;

      const compRaw = calcCompositionScore(player, context.ownTeamPlayers || [], strategy, aiSettings);
      const compScore = (Number(w.composition) || 0) * compRaw;

      const uniRaw = calcUniversalScore(player, aiSettings);
      const uniMult = (strategy && strategy.overrides && typeof strategy.overrides.universalWeightMultiplier === "number")
        ? strategy.overrides.universalWeightMultiplier
        : 1.0;
      const uniScore = (Number(w.universal) || 0) * uniRaw * uniMult;

      const counterRaw = calcCounterScore(player, context.enemyTeamPlayers || [], aiSettings);
      const counterMult = (strategy && strategy.overrides && typeof strategy.overrides.counterWeightMultiplier === "number")
        ? strategy.overrides.counterWeightMultiplier
        : 1.0;
      const counterScore = (Number(w.counter) || 0) * counterRaw * counterMult;

      const mmrGapBonus = calcMmrGapBonus(player, context.availablePlayers || [], aiSettings);
      const tierDomPenalty = calcTierDominancePenalty(player, context.availablePlayers || [], aiSettings);
      const penalties = calcPenalties(player, context.ownTeamPlayers || [], context.availablePlayers || [], strategy, aiSettings);

      const tierFactor = computeTierFactor(player, coeffs);

      const base = powerScore + rolePrefScore + compScore + uniScore + counterScore + mmrGapBonus - tierDomPenalty - penalties;

      const noiseAmp = Number(w.noiseAmplitude) || 0;
      const noise = noiseAmp > 0 ? (Math.random() - 0.5) * 2 * noiseAmp : 0;

      const value = base * tierFactor + noise;

      return {
        value: value,
        breakdown: {
          tierFactor: tierFactor,
          mmrScore: mmrScore,
          dpmScore: dpmScore,
          powerScore: powerScore,
          rolePrefRaw: rolePrefRaw,
          rolePrefScore: rolePrefScore,
          compRaw: compRaw,
          compScore: compScore,
          uniRaw: uniRaw,
          uniScore: uniScore,
          counterRaw: counterRaw,
          counterScore: counterScore,
          mmrGapBonus: mmrGapBonus,
          tierDomPenalty: tierDomPenalty,
          penalties: penalties
        }
      };
    }

    function scoreAvailablePlayers(availablePlayers, context) {
      const out = [];
      (availablePlayers || []).forEach((p) => {
        const r = calcPlayerValue(p, context);
        out.push({
          player: p,
          value: r.value,
          breakdown: r.breakdown
        });
      });
      out.sort((a, b) => b.value - a.value);
      return out;
    }

    function pickWithAltChance(scored, coeffs, aiSettings) {
      if (!scored.length) return null;

      const chance = typeof coeffs.altPickChance === "number" ? coeffs.altPickChance : 0.2;
      const hints = aiSettings.formula.hints || {};
      const topN = Math.max(2, Math.min(6, 3)); // fixed 3 for now; can be expanded in next patch
      const top = scored.slice(0, Math.min(scored.length, topN));

      if (top.length < 2) return top[0];

      const roll = Math.random();
      if (roll >= clamp(chance, 0, 1)) {
        return top[0];
      }

      // Choose one of alternatives 1..top-1 uniformly
      const idx = 1 + Math.floor(Math.random() * (top.length - 1));
      return top[idx];
    }

    function buildReasonsForCandidate(item, context, strategyKey) {
      const aiSettings = dataModule.getAiSettings();
      const coeffs = dataModule.getCoeffs();
      const reasons = [];

      // Always include a base reason for power-first
      reasons.push({ code: "POWER_FIRST", params: {} });

      // Tier dominance / higher tier among available
      const bestRank = getBestTierRankAmong(context.availablePlayers || []);
      const myRank = tierRank(item.player.tier);
      if (myRank === bestRank) {
        reasons.push({ code: "TIER_HIGHER", params: {} });
      }

      // MMR gap
      const cfg = aiSettings.formula.mmrGap || {};
      const thr = Number(cfg.explainThreshold) || 100;
      const sameTier = (context.availablePlayers || []).filter((p) => p.tier === item.player.tier && p.name !== item.player.name);
      if (sameTier.length) {
        let bestOther = 0;
        sameTier.forEach((p) => { bestOther = Math.max(bestOther, Number(p.mmr) || 0); });
        const gap = (Number(item.player.mmr) || 0) - bestOther;
        if (gap >= thr) {
          reasons.push({ code: "MMR_GAP", params: { gap: gap } });
        }
      }

      // Composition: highlight if candidate closes a missing target
      const strategy = getStrategyByKey(strategyKey) || getStrategyByKey("balanced");
      if (strategy && strategy.compositionTargets) {
        const targets = strategy.compositionTargets;
        ["infantry", "tanks", "mechanical", "support"].forEach((cat) => {
          const target = Number(targets[cat] || 0);
          if (target <= 0) return;

          const now = countCategoryInTeam(context.ownTeamPlayers || [], cat);
          const contributes = getPlayerCategories(item.player)[cat];

          if (contributes && now < target) {
            reasons.push({
              code: "CLOSES_TARGET",
              params: { cat: i18nModule.categoryLabel(cat), now: now, target: target }
            });
          }
        });
      }

      // Universal
      const uni = aiSettings.formula.universal || {};
      const minUni = Number(uni.minRolesToBeUniversal) || 4;
      const rc = Array.isArray(item.player.roles) ? item.player.roles.length : 0;
      if (rc >= minUni) {
        reasons.push({ code: "UNIVERSAL", params: { count: rc } });
      }

      // Support specialist (if primarily support-only)
      if (isSupportOnlySpecialist(item.player)) {
        reasons.push({ code: "SUPPORT_SPECIALIST", params: {} });
      }

      // Softcap warning (only if penalties are significant)
      if ((Number(item.breakdown.penalties) || 0) > 0.9) {
        if (isSupportOnlySpecialist(item.player)) {
          reasons.push({ code: "SOFTCAP_SUPPORT_ONLY", params: {} });
        } else {
          reasons.push({ code: "AVOID_SUPPORT_OVERLOAD", params: {} });
        }
      }

      // Counter (rare)
      const counterCfg = aiSettings.formula.counter || {};
      const explainThr = Number(counterCfg.explainThreshold) || 999;
      if ((Number(item.breakdown.counterRaw) || 0) >= explainThr) {
        reasons.push({ code: "COUNTER", params: { detail: "role-match" } });
      }

      return reasons.slice(0, 4); // keep concise in UI
    }

    function getRecommendations(availablePlayers, context) {
      const coeffs = dataModule.getCoeffs();
      const aiSettings = dataModule.getAiSettings();

      const scored = scoreAvailablePlayers(availablePlayers, context);
      if (!scored.length) {
        return { best: null, alternatives: [] };
      }

      const hintsCfg = aiSettings.formula.hints || {};
      const altsCount = typeof hintsCfg.alternativesCount === "number" ? hintsCfg.alternativesCount : 2;

      const best = scored[0];
      const alternatives = scored.slice(1, 1 + Math.max(0, altsCount));

      return {
        best: {
          player: best.player,
          value: best.value,
          breakdown: best.breakdown,
          reasons: buildReasonsForCandidate(best, context, context.strategyKey)
        },
        alternatives: alternatives.map((it) => ({
          player: it.player,
          value: it.value,
          breakdown: it.breakdown,
          reasons: buildReasonsForCandidate(it, context, context.strategyKey)
        }))
      };
    }

    function pickPlayerAi(availablePlayers, context) {
      const coeffs = dataModule.getCoeffs();
      const aiSettings = dataModule.getAiSettings();
      const scored = scoreAvailablePlayers(availablePlayers, context);
      const chosen = pickWithAltChance(scored, coeffs, aiSettings);
      return chosen ? chosen.player : null;
    }

    function pickEnemyPowerFirst(availablePlayers) {
      const arr = (availablePlayers || []).slice();
      arr.sort((a, b) => comparePlayersPower(a, b));
      return arr.length ? arr[0] : null;
    }

    function simulatePlan(draftState, mode, teamKeyForView) {
      // Returns a plan object:
      // { steps: [{pickIndex, pickNumber, team, playerName}], projectedTeam1, projectedTeam2 }
      const aiSettings = dataModule.getAiSettings();
      const planCfg = aiSettings.formula.planning || {};
      if (!planCfg.enabled) {
        return { steps: [], projectedTeam1: [], projectedTeam2: [] };
      }

      const topK = Number(planCfg.candidateTopK) || 14;
      const enemyModel = planCfg.enemyModel || "power_first";

      const ds = deepClone(draftState);

      const allPlayers = dataModule.getPlayers().slice();
      const pickedNames = {};
      (ds.team1.players || []).forEach((p) => { pickedNames[p.name] = true; });
      (ds.team2.players || []).forEach((p) => { pickedNames[p.name] = true; });

      const available = allPlayers.filter((p) => !pickedNames[p.name]);

      const steps = [];

      for (let idx = ds.currentPickIndex; idx < DRAFT_ORDER.length; idx++) {
        const meta = DRAFT_ORDER[idx];
        const team = meta.team;
        const strategyKey = team === "team1" ? ds.strategyTeam1 : ds.strategyTeam2;

        const ownTeamPlayers = team === "team1" ? ds.team1.players : ds.team2.players;
        const enemyTeamPlayers = team === "team1" ? ds.team2.players : ds.team1.players;

        // Candidate set restriction for performance: topK by power first, then AI scoring
        const powerSorted = available.slice().sort((a, b) => comparePlayersPower(a, b));
        const candidateSlice = powerSorted.slice(0, Math.min(powerSorted.length, Math.max(4, topK)));

        let pick = null;
        if (enemyModel === "power_first") {
          // Even for own team in planning, we use the real strategy; for enemy, power-first.
          // For the team we are planning for, keep strategy; for opponent in simulation, use power-first.
          if (teamKeyForView && team !== teamKeyForView) {
            pick = pickEnemyPowerFirst(candidateSlice) || pickEnemyPowerFirst(available);
          } else {
            pick = pickPlayerAi(candidateSlice, {
              ownTeamPlayers: ownTeamPlayers,
              enemyTeamPlayers: enemyTeamPlayers,
              availablePlayers: available,
              strategyKey: strategyKey
            }) || pickEnemyPowerFirst(available);
          }
        } else {
          // same_strategy: use strategy for both teams
          pick = pickPlayerAi(candidateSlice, {
            ownTeamPlayers: ownTeamPlayers,
            enemyTeamPlayers: enemyTeamPlayers,
            availablePlayers: available,
            strategyKey: strategyKey
          }) || pickEnemyPowerFirst(available);
        }

        if (!pick) break;

        // Apply simulated pick
        if (team === "team1") ds.team1.players.push(pick);
        else ds.team2.players.push(pick);

        pickedNames[pick.name] = true;
        const remIndex = available.findIndex((p) => p.name === pick.name);
        if (remIndex >= 0) available.splice(remIndex, 1);

        steps.push({
          pickIndex: idx,
          pickNumber: meta.pick,
          team: team,
          playerName: pick.name
        });
      }

      return {
        steps: steps,
        projectedTeam1: ds.team1.players,
        projectedTeam2: ds.team2.players
      };
    }

    function getStrategyKeyListSafe() {
      const list = getStrategyKeyList();
      if (!list.length) return ["balanced"];
      return list;
    }

    return {
      getStrategyKeyListSafe,
      getStrategyByKey,
      calcPlayerValue,
      getRecommendations,
      pickPlayerAi,
      simulatePlan,
      isSupportOnlySpecialist,
      getPlayerCategories,
      countCategoryInTeam,
      countSupportOnly,
      countSupportTotal
    };
  })();

  // ------------------------------------------------------
  // --- offlineDraftModule: режимы, капитаны, пул, пики
  // ------------------------------------------------------

  const offlineDraftModule = (function () {
    const settings = {
      mode: "human_vs_ai",
      humanSide: "team1",
      strategyTeam1: "balanced",
      strategyTeam2: "balanced",
      showPlanning: true
    };

    const state = {
      status: "idle", // idle | draft | finished
      currentPickIndex: 0,
      team1: { captain: null, players: [] },
      team2: { captain: null, players: [] },
      picks: [],
      pool: { inPool: {} }
    };

    function saveDraftLocal() {
      const obj = { settings: settings, state: state };
      localStorage.setItem(LOCAL_STORAGE_KEYS.OFFLINE_DRAFT, JSON.stringify(obj));
    }

    function loadDraftLocal() {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_DRAFT);
      if (!raw) return;
      const obj = safeParseJSON(raw, null);
      if (!obj || typeof obj !== "object") return;

      if (obj.settings && typeof obj.settings === "object") {
        settings.mode = obj.settings.mode || settings.mode;
        settings.humanSide = obj.settings.humanSide || settings.humanSide;
        settings.strategyTeam1 = obj.settings.strategyTeam1 || settings.strategyTeam1;
        settings.strategyTeam2 = obj.settings.strategyTeam2 || settings.strategyTeam2;
        settings.showPlanning = obj.settings.showPlanning != null ? !!obj.settings.showPlanning : settings.showPlanning;
      }

      if (obj.state && typeof obj.state === "object") {
        // we load only safe fields; captains and pool are kept
        state.status = obj.state.status || "idle";
        state.currentPickIndex = typeof obj.state.currentPickIndex === "number" ? obj.state.currentPickIndex : 0;
        state.team1 = obj.state.team1 || state.team1;
        state.team2 = obj.state.team2 || state.team2;
        state.picks = Array.isArray(obj.state.picks) ? obj.state.picks : [];
        state.pool = obj.state.pool || state.pool;
      }
    }

    function resetAll() {
      state.status = "idle";
      state.currentPickIndex = 0;
      state.team1.captain = null;
      state.team2.captain = null;
      state.team1.players = [];
      state.team2.players = [];
      state.picks = [];
      state.pool = { inPool: {} };
      saveDraftLocal();
      renderAll();
    }

    function resetDraftOnly() {
      state.status = "idle";
      state.currentPickIndex = 0;
      state.picks = [];
      // Keep captains and pool
      rebuildCaptainPlayers();
      saveDraftLocal();
      renderAll();
    }

    function rebuildCaptainPlayers() {
      state.team1.players = [];
      state.team2.players = [];

      const cap1 = state.team1.captain;
      const cap2 = state.team2.captain;
      if (cap1) {
        const p = dataModule.getPlayerByName(cap1);
        if (p) state.team1.players.push(p);
      }
      if (cap2) {
        const p = dataModule.getPlayerByName(cap2);
        if (p) state.team2.players.push(p);
      }
    }

    function ensurePoolMap() {
      if (!state.pool || !state.pool.inPool) {
        state.pool = { inPool: {} };
      }
    }

    function handleModeChange() {
      const modeSel = $("offline-mode-select");
      if (!modeSel) return;
      settings.mode = modeSel.value || "human_vs_ai";

      // Human side row
      const sideRow = $("offline-human-side-row");
      if (sideRow) {
        sideRow.style.display = settings.mode === "human_vs_ai" ? "" : "none";
      }

      // Strategy labels (mode-dependent semantics)
      updateStrategyLabelsForMode();

      // Mode hint
      const hintEl = $("offline-mode-hint");
      if (hintEl) {
        if (settings.mode === "human_vs_ai") {
          setText(hintEl, "Human vs AI: человек пикает за свою сторону, ИИ пикает за вторую.");
        } else if (settings.mode === "ai_vs_ai") {
          setText(hintEl, "AI vs AI: клики отключены, обе стороны пикает ИИ.");
        } else {
          setText(hintEl, "Manual: человек пикает за обе стороны по очереди, подсказки активны для обеих команд.");
        }
      }

      resetDraftOnly();
    }

    function updateStrategyLabelsForMode() {
      const l1 = $("offline-strategy-team1-label");
      const l2 = $("offline-strategy-team2-label");

      if (!l1 || !l2) return;

      if (settings.mode === "manual") {
        l1.textContent = i18nModule.getLanguage() === "en" ? "Hint strategy Team1" : "Стратегия подсказок Team1";
        l2.textContent = i18nModule.getLanguage() === "en" ? "Hint strategy Team2" : "Стратегия подсказок Team2";
      } else if (settings.mode === "human_vs_ai") {
        // Human side uses hints; AI side uses draft strategy.
        const human = settings.humanSide;
        if (human === "team1") {
          l1.textContent = i18nModule.getLanguage() === "en" ? "Hint strategy (Human Team1)" : "Стратегия подсказок (человек Team1)";
          l2.textContent = i18nModule.getLanguage() === "en" ? "AI draft strategy (AI Team2)" : "Стратегия ИИ драфта (ИИ Team2)";
        } else {
          l1.textContent = i18nModule.getLanguage() === "en" ? "AI draft strategy (AI Team1)" : "Стратегия ИИ драфта (ИИ Team1)";
          l2.textContent = i18nModule.getLanguage() === "en" ? "Hint strategy (Human Team2)" : "Стратегия подсказок (человек Team2)";
        }
      } else {
        l1.textContent = i18nModule.getLanguage() === "en" ? "AI draft strategy Team1" : "Стратегия ИИ драфта Team1";
        l2.textContent = i18nModule.getLanguage() === "en" ? "AI draft strategy Team2" : "Стратегия ИИ драфта Team2";
      }
    }

    function initSettingsUI() {
      const modeSel = $("offline-mode-select");
      const sideSel = $("offline-human-side-select");
      const s1 = $("offline-strategy-team1-select");
      const s2 = $("offline-strategy-team2-select");
      const resetDraftBtn = $("offline-reset-draft-btn");
      const resetAllBtn = $("offline-reset-all-btn");
      const showPlanCb = $("offline-show-planning-checkbox");

      if (modeSel) {
        modeSel.value = settings.mode;
        modeSel.addEventListener("change", handleModeChange);
      }

      if (sideSel) {
        sideSel.value = settings.humanSide;
        sideSel.addEventListener("change", function () {
          settings.humanSide = sideSel.value || "team1";
          updateStrategyLabelsForMode();
          resetDraftOnly();
        });
      }

      // fill strategy selects
      const keys = aiModule.getStrategyKeyListSafe();
      function fillStrategySelect(sel) {
        if (!sel) return;
        sel.innerHTML = "";
        keys.forEach((k) => {
          const opt = document.createElement("option");
          opt.value = k;
          opt.textContent = k;
          sel.appendChild(opt);
        });
      }
      fillStrategySelect(s1);
      fillStrategySelect(s2);

      if (s1) {
        s1.value = settings.strategyTeam1;
        s1.addEventListener("change", function () {
          settings.strategyTeam1 = s1.value;
          resetDraftOnly();
        });
      }
      if (s2) {
        s2.value = settings.strategyTeam2;
        s2.addEventListener("change", function () {
          settings.strategyTeam2 = s2.value;
          resetDraftOnly();
        });
      }

      if (resetDraftBtn) resetDraftBtn.addEventListener("click", resetDraftOnly);
      if (resetAllBtn) resetAllBtn.addEventListener("click", resetAll);

      if (showPlanCb) {
        showPlanCb.checked = !!settings.showPlanning;
        showPlanCb.addEventListener("change", function () {
          settings.showPlanning = !!showPlanCb.checked;
          renderHintsAndPlanning();
          saveDraftLocal();
        });
      }

      // side row visibility
      const sideRow = $("offline-human-side-row");
      if (sideRow) {
        sideRow.style.display = settings.mode === "human_vs_ai" ? "" : "none";
      }

      updateStrategyLabelsForMode();
      handleModeChange();
    }

    function renderCaptainsSelectors() {
      const players = dataModule.getPlayers().slice().sort((a, b) => a.name.localeCompare(b.name));

      const search1 = $("offline-captain1-search");
      const search2 = $("offline-captain2-search");
      const sel1 = $("offline-captain1-select");
      const sel2 = $("offline-captain2-select");

      function filterBy(searchStr) {
        const s = String(searchStr || "").toLowerCase().trim();
        if (!s) return players;
        return players.filter((p) => String(p.name).toLowerCase().indexOf(s) !== -1);
      }

      function fillSelect(sel, list, current) {
        if (!sel) return;
        const prev = current || sel.value;
        sel.innerHTML = "";
        list.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.name;
          opt.textContent = p.name + " (" + p.tier + ", MMR " + p.mmr + ")";
          sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
      }

      fillSelect(sel1, players, state.team1.captain);
      fillSelect(sel2, players, state.team2.captain);

      if (search1) {
        search1.value = "";
        search1.addEventListener("input", function () {
          fillSelect(sel1, filterBy(search1.value), state.team1.captain);
        });
      }
      if (search2) {
        search2.value = "";
        search2.addEventListener("input", function () {
          fillSelect(sel2, filterBy(search2.value), state.team2.captain);
        });
      }

      if (sel1) {
        sel1.addEventListener("change", function () {
          handleCaptainChange("team1");
        });
      }
      if (sel2) {
        sel2.addEventListener("change", function () {
          handleCaptainChange("team2");
        });
      }
    }

    function handleCaptainChange(teamKey) {
      const sel1 = $("offline-captain1-select");
      const sel2 = $("offline-captain2-select");
      const errorEl = $("offline-captains-error");
      if (!sel1 || !sel2) return;

      const cap1 = sel1.value || null;
      const cap2 = sel2.value || null;

      if (cap1 && cap2 && cap1 === cap2) {
        setText(errorEl, i18nModule.getLanguage() === "en"
          ? "The same player cannot be captain of both teams."
          : "Один и тот же игрок не может быть капитаном обеих команд."
        );
        // rollback
        if (teamKey === "team1") sel1.value = state.team1.captain || "";
        else sel2.value = state.team2.captain || "";
        return;
      } else {
        setText(errorEl, "");
      }

      state.team1.captain = cap1;
      state.team2.captain = cap2;

      // Captains should not be in pool
      ensurePoolMap();
      if (cap1) delete state.pool.inPool[cap1];
      if (cap2) delete state.pool.inPool[cap2];

      rebuildCaptainPlayers();
      resetDraftOnly();

      renderPoolTable();
      renderDraftState();
      renderAvailableList();
      renderHintsAndPlanning();

      saveDraftLocal();
    }

    function initPoolControls() {
      const allBtn = $("offline-pool-all-btn");
      const top20Btn = $("offline-pool-top20-btn");
      const clearBtn = $("offline-pool-clear-btn");

      ensurePoolMap();

      if (allBtn) {
        allBtn.addEventListener("click", function () {
          const inPool = state.pool.inPool;
          dataModule.getPlayers().forEach((p) => {
            if (p.name !== state.team1.captain && p.name !== state.team2.captain) {
              inPool[p.name] = true;
            }
          });
          renderPoolTable();
          renderAvailableList();
          renderHintsAndPlanning();
          saveDraftLocal();
        });
      }

      if (top20Btn) {
        top20Btn.addEventListener("click", function () {
          const inPool = state.pool.inPool;
          Object.keys(inPool).forEach((k) => delete inPool[k]);

          const sorted = dataModule.getPlayers().slice().sort((a, b) => (b.mmr || 0) - (a.mmr || 0));
          const filtered = sorted.filter((p) => p.name !== state.team1.captain && p.name !== state.team2.captain);
          const top20 = filtered.slice(0, 20);
          top20.forEach((p) => { inPool[p.name] = true; });

          renderPoolTable();
          renderAvailableList();
          renderHintsAndPlanning();
          saveDraftLocal();
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          const inPool = state.pool.inPool;
          Object.keys(inPool).forEach((k) => delete inPool[k]);
          renderPoolTable();
          renderAvailableList();
          renderHintsAndPlanning();
          saveDraftLocal();
        });
      }
    }

    function renderPoolTable() {
      ensurePoolMap();
      const tbody = $("offline-pool-table")?.querySelector("tbody");
      if (!tbody) return;

      const players = dataModule.getPlayers().slice().sort((a, b) => (b.mmr || 0) - (a.mmr || 0));
      const inPool = state.pool.inPool;

      tbody.innerHTML = "";
      players.forEach((p) => {
        const tr = document.createElement("tr");

        const tdCheck = document.createElement("td");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!inPool[p.name];

        const isCaptain = (p.name === state.team1.captain || p.name === state.team2.captain);
        if (isCaptain) cb.disabled = true;

        cb.addEventListener("change", function () {
          if (isCaptain) {
            cb.checked = false;
            return;
          }
          if (cb.checked) inPool[p.name] = true;
          else delete inPool[p.name];

          renderAvailableList();
          renderHintsAndPlanning();
          saveDraftLocal();
        });

        tdCheck.appendChild(cb);
        tr.appendChild(tdCheck);

        const tdName = document.createElement("td");
        tdName.textContent = p.name;
        tr.appendChild(tdName);

        const tdTier = document.createElement("td");
        tdTier.textContent = p.tier;
        tr.appendChild(tdTier);

        const tdMmr = document.createElement("td");
        tdMmr.textContent = String(p.mmr);
        tr.appendChild(tdMmr);

        const tdDpm = document.createElement("td");
        tdDpm.textContent = String(p.dpm);
        tr.appendChild(tdDpm);

        const tdRoles = document.createElement("td");
        tdRoles.textContent = (p.roles || []).map((r) => i18nModule.roleLabel(r)).join(", ");
        tr.appendChild(tdRoles);

        tbody.appendChild(tr);
      });
    }

    function getPickedNameSet() {
      const set = {};
      (state.team1.players || []).forEach((p) => { set[p.name] = true; });
      (state.team2.players || []).forEach((p) => { set[p.name] = true; });
      return set;
    }

    function getAvailablePlayers() {
      ensurePoolMap();
      const inPool = state.pool.inPool || {};
      const picked = getPickedNameSet();

      const all = dataModule.getPlayers();
      return all.filter((p) => {
        if (!inPool[p.name]) return false;
        if (picked[p.name]) return false;
        if (p.name === state.team1.captain || p.name === state.team2.captain) return false;
        return true;
      });
    }

    function ensureDraftStarted() {
      if (!state.team1.captain || !state.team2.captain) return false;

      if (state.status === "idle") {
        state.status = "draft";
        state.currentPickIndex = 0;
        state.picks = [];

        rebuildCaptainPlayers();
      }
      return true;
    }

    function getCurrentPickMeta() {
      if (state.currentPickIndex < 0 || state.currentPickIndex >= DRAFT_ORDER.length) return null;
      return DRAFT_ORDER[state.currentPickIndex];
    }

    function applyPick(teamKey, player) {
      if (!player) return;

      if (teamKey === "team1") state.team1.players.push(player);
      else state.team2.players.push(player);

      state.picks.push({ team: teamKey, playerName: player.name });
      state.currentPickIndex += 1;

      if (state.currentPickIndex >= DRAFT_ORDER.length) {
        state.status = "finished";
      } else {
        state.status = "draft";
      }

      saveDraftLocal();
    }

    function canHumanClickNow() {
      if (settings.mode === "ai_vs_ai") return false;

      const meta = getCurrentPickMeta();
      if (!meta) return false;

      if (settings.mode === "manual") return true;

      // human_vs_ai: human can click only for its side
      if (settings.mode === "human_vs_ai") {
        return meta.team === settings.humanSide;
      }
      return false;
    }

    function runAiIfNeeded() {
      if (!ensureDraftStarted()) return;

      if (state.status !== "draft") {
        renderAll();
        return;
      }

      const mode = settings.mode;
      const meta = getCurrentPickMeta();
      if (!meta) return;

      const available = getAvailablePlayers();
      if (!available.length) {
        // no candidates -> skip
        state.currentPickIndex += 1;
        if (state.currentPickIndex >= DRAFT_ORDER.length) state.status = "finished";
        saveDraftLocal();
        renderAll();
        return;
      }

      if (mode === "ai_vs_ai") {
        // Both sides AI, loop through
        const teamKey = meta.team;
        const strat = teamKey === "team1" ? settings.strategyTeam1 : settings.strategyTeam2;
        const own = teamKey === "team1" ? state.team1.players : state.team2.players;
        const enemy = teamKey === "team1" ? state.team2.players : state.team1.players;

        const picked = aiModule.pickPlayerAi(available, {
          ownTeamPlayers: own,
          enemyTeamPlayers: enemy,
          availablePlayers: available,
          strategyKey: strat
        });

        if (picked) applyPick(teamKey, picked);

        renderAll();

        if (state.status === "draft") {
          setTimeout(runAiIfNeeded, 80);
        }
        return;
      }

      if (mode === "human_vs_ai") {
        const isHumanTurn = meta.team === settings.humanSide;
        if (isHumanTurn) {
          renderAll();
          return;
        }

        const teamKey = meta.team;
        const strat = teamKey === "team1" ? settings.strategyTeam1 : settings.strategyTeam2;
        const own = teamKey === "team1" ? state.team1.players : state.team2.players;
        const enemy = teamKey === "team1" ? state.team2.players : state.team1.players;

        const picked = aiModule.pickPlayerAi(available, {
          ownTeamPlayers: own,
          enemyTeamPlayers: enemy,
          availablePlayers: available,
          strategyKey: strat
        });

        if (picked) applyPick(teamKey, picked);
        renderAll();
      }
    }

    function handleAvailableClick(playerName) {
      if (!ensureDraftStarted()) return;
      if (state.status !== "draft") return;

      const player = dataModule.getPlayerByName(playerName);
      if (!player) return;

      const meta = getCurrentPickMeta();
      if (!meta) return;

      // Manual or human turn in Human vs AI
      if (!canHumanClickNow()) return;

      applyPick(meta.team, player);
      renderAll();

      if (settings.mode === "human_vs_ai") {
        setTimeout(runAiIfNeeded, 50);
      }
    }

    function renderDraftState() {
      const statusEl = $("offline-draft-status");
      const cap1El = $("offline-team1-captain-name");
      const cap2El = $("offline-team2-captain-name");
      const list1 = $("offline-team1-list");
      const list2 = $("offline-team2-list");
      const orderEl = $("offline-draft-order");

      setText(cap1El, state.team1.captain || "—");
      setText(cap2El, state.team2.captain || "—");

      if (list1) {
        list1.innerHTML = "";
        if (state.team1.captain) {
          const li = document.createElement("li");
          li.className = "captain-slot";
          li.textContent = (i18nModule.getLanguage() === "en" ? "Captain: " : "Капитан: ") + state.team1.captain;
          list1.appendChild(li);
        }
        (state.team1.players || []).forEach((p) => {
          if (p.name === state.team1.captain) return;
          const li = document.createElement("li");
          li.appendChild(document.createTextNode(p.name));
          const right = document.createElement("span");
          right.textContent = p.tier + " • MMR " + p.mmr + " • DPM " + p.dpm;
          li.appendChild(right);
          list1.appendChild(li);
        });
      }

      if (list2) {
        list2.innerHTML = "";
        if (state.team2.captain) {
          const li = document.createElement("li");
          li.className = "captain-slot";
          li.textContent = (i18nModule.getLanguage() === "en" ? "Captain: " : "Капитан: ") + state.team2.captain;
          list2.appendChild(li);
        }
        (state.team2.players || []).forEach((p) => {
          if (p.name === state.team2.captain) return;
          const li = document.createElement("li");
          li.appendChild(document.createTextNode(p.name));
          const right = document.createElement("span");
          right.textContent = p.tier + " • MMR " + p.mmr + " • DPM " + p.dpm;
          li.appendChild(right);
          list2.appendChild(li);
        });
      }

      if (orderEl) {
        orderEl.innerHTML = "";
        DRAFT_ORDER.forEach((step, idx) => {
          const li = document.createElement("li");
          const teamLabel = step.team === "team1" ? (i18nModule.getLanguage() === "en" ? "Team 1" : "Команда 1") : (i18nModule.getLanguage() === "en" ? "Team 2" : "Команда 2");
          li.textContent = "Pick " + step.pick + ": " + teamLabel;
          if (idx === state.currentPickIndex && state.status === "draft") {
            li.classList.add("current");
          }
          orderEl.appendChild(li);
        });
      }

      if (statusEl) {
        if (!state.team1.captain || !state.team2.captain) {
          setText(statusEl, i18nModule.getLanguage() === "en"
            ? "Select captains for both teams, build the pool, then start drafting (click an available player)."
            : "Выберите капитанов для обеих команд, наберите пул, затем начните драфт (клик по доступному игроку)."
          );
        } else if (state.status === "idle") {
          setText(statusEl, i18nModule.getLanguage() === "en"
            ? "Draft not started. Clicking an available player will make the first pick."
            : "Драфт ещё не начат. Клик по доступному игроку выполнит первый пик."
          );
        } else if (state.status === "draft") {
          const meta = getCurrentPickMeta();
          if (meta) {
            const teamLabel = meta.team === "team1" ? (i18nModule.getLanguage() === "en" ? "Team 1" : "Команда 1") : (i18nModule.getLanguage() === "en" ? "Team 2" : "Команда 2");
            setText(statusEl, (i18nModule.getLanguage() === "en"
              ? "Current turn: "
              : "Текущий ход: ") + teamLabel + ". Pick #" + meta.pick + " / " + DRAFT_ORDER.length + "."
            );
          } else {
            setText(statusEl, i18nModule.getLanguage() === "en" ? "Draft in progress." : "Драфт в процессе.");
          }
        } else {
          setText(statusEl, i18nModule.getLanguage() === "en" ? "Draft finished. You can export the result below." : "Драфт завершён. Можно экспортировать результат ниже.");
        }
      }
    }

    function renderAvailableList() {
      const list = $("offline-available-list");
      const note = $("offline-available-note");
      if (!list) return;

      const available = getAvailablePlayers();
      list.innerHTML = "";

      if (!available.length) {
        list.textContent = i18nModule.getLanguage() === "en"
          ? "No available players (check pool/captains/draft state)."
          : "Нет доступных игроков (проверьте пул/капитанов/состояние драфта).";
        return;
      }

      const meta = getCurrentPickMeta();
      const mode = settings.mode;

      const allowClick = canHumanClickNow();

      // Sorting:
      // - Manual: by MMR desc (as per spec)
      // - Otherwise: by AI value for the CURRENT team turn (if draft started)
      let sorted = available.slice();

      if (mode === "manual" || !meta || state.status !== "draft") {
        sorted.sort((a, b) => (b.mmr || 0) - (a.mmr || 0));
      } else {
        const teamKey = meta.team;
        const strat = teamKey === "team1" ? settings.strategyTeam1 : settings.strategyTeam2;
        const own = teamKey === "team1" ? state.team1.players : state.team2.players;
        const enemy = teamKey === "team1" ? state.team2.players : state.team1.players;

        const scored = sorted.map((p) => {
          const r = aiModule.calcPlayerValue(p, {
            ownTeamPlayers: own,
            enemyTeamPlayers: enemy,
            availablePlayers: available,
            strategyKey: strat
          });
          return { player: p, value: r.value };
        });
        scored.sort((a, b) => b.value - a.value);
        sorted = scored.map((x) => x.player);
      }

      if (note) {
        if (mode === "manual") {
          setText(note, i18nModule.getLanguage() === "en" ? "Sorted by MMR (Manual mode)." : "Сортировка по MMR (Manual).");
        } else {
          setText(note, i18nModule.getLanguage() === "en" ? "Sorted by AI value for the current turn." : "Сортировка по value ИИ для текущего хода.");
        }
      }

      sorted.forEach((p) => {
        const row = document.createElement("div");
        row.className = "players-list-item";

        if (!allowClick && mode !== "manual") {
          row.classList.add("disabled");
        }

        const main = document.createElement("div");
        main.className = "players-list-item-main";

        const name = document.createElement("span");
        name.className = "players-list-item-name";
        name.textContent = p.name;

        const metaLine = document.createElement("span");
        metaLine.className = "players-list-item-meta";
        metaLine.textContent =
          p.tier + " • MMR " + p.mmr + " • DPM " + p.dpm + " • " + (p.roles || []).map((r) => i18nModule.roleLabel(r)).join(", ");

        main.appendChild(name);
        main.appendChild(metaLine);

        const score = document.createElement("span");
        score.className = "players-list-item-score";

        if (mode === "manual" || !meta || state.status !== "draft") {
          score.textContent = "MMR " + p.mmr;
        } else {
          const teamKey = meta.team;
          const strat = teamKey === "team1" ? settings.strategyTeam1 : settings.strategyTeam2;
          const own = teamKey === "team1" ? state.team1.players : state.team2.players;
          const enemy = teamKey === "team1" ? state.team2.players : state.team1.players;
          const r = aiModule.calcPlayerValue(p, {
            ownTeamPlayers: own,
            enemyTeamPlayers: enemy,
            availablePlayers: available,
            strategyKey: strat
          });
          score.textContent = "AI " + r.value.toFixed(2);
        }

        row.appendChild(main);
        row.appendChild(score);

        if (allowClick) {
          row.addEventListener("click", function () {
            handleAvailableClick(p.name);
          });
        }

        list.appendChild(row);
      });
    }

    function renderHintsAndPlanning() {
      const showOpp = dataModule.getAiSettings().formula.hints?.showOpponentHintsInHumanVsAI;
      const mode = settings.mode;

      const hint1Best = $("offline-hint-team1-best");
      const hint1Alts = $("offline-hint-team1-alts");
      const hint2Best = $("offline-hint-team2-best");
      const hint2Alts = $("offline-hint-team2-alts");

      const plan1 = $("offline-plan-team1");
      const plan2 = $("offline-plan-team2");

      const hintsNote = $("offline-hints-note");

      if (hint1Best) hint1Best.innerHTML = "";
      if (hint1Alts) hint1Alts.innerHTML = "";
      if (hint2Best) hint2Best.innerHTML = "";
      if (hint2Alts) hint2Alts.innerHTML = "";
      if (plan1) plan1.innerHTML = "";
      if (plan2) plan2.innerHTML = "";

      if (!ensureDraftStarted()) {
        if (hintsNote) {
          setText(hintsNote, i18nModule.getLanguage() === "en"
            ? "Hints will appear after selecting captains and enabling a player pool."
            : "Подсказки появятся после выбора капитанов и набора пула."
          );
        }
        return;
      }

      const available = getAvailablePlayers();
      if (!available.length) {
        if (hintsNote) setText(hintsNote, "");
        return;
      }

      const showPlanning = !!settings.showPlanning;
      const aiSettings = dataModule.getAiSettings();
      const hintsCfg = aiSettings.formula.hints || {};

      // Team1 context
      const ctx1 = {
        ownTeamPlayers: state.team1.players,
        enemyTeamPlayers: state.team2.players,
        availablePlayers: available,
        strategyKey: settings.strategyTeam1
      };

      // Team2 context
      const ctx2 = {
        ownTeamPlayers: state.team2.players,
        enemyTeamPlayers: state.team1.players,
        availablePlayers: available,
        strategyKey: settings.strategyTeam2
      };

      // Human vs AI: optionally hide opponent hints
      const showTeam1 = (mode !== "human_vs_ai") || (settings.humanSide === "team1") || !!showOpp;
      const showTeam2 = (mode !== "human_vs_ai") || (settings.humanSide === "team2") || !!showOpp;

      // Recommendations
      if (showTeam1) {
        const rec1 = aiModule.getRecommendations(available, ctx1);
        renderHintPanel(hint1Best, hint1Alts, rec1, "team1");
      } else {
        if (hint1Best) hint1Best.textContent = i18nModule.getLanguage() === "en" ? "Hidden (Human vs AI)" : "Скрыто (Human vs AI)";
      }

      if (showTeam2) {
        const rec2 = aiModule.getRecommendations(available, ctx2);
        renderHintPanel(hint2Best, hint2Alts, rec2, "team2");
      } else {
        if (hint2Best) hint2Best.textContent = i18nModule.getLanguage() === "en" ? "Hidden (Human vs AI)" : "Скрыто (Human vs AI)";
      }

      // Planning (long plan) for each team
      if (showPlanning) {
        if (plan1 && showTeam1) {
          const planObj = aiModule.simulatePlan(buildDraftStateSnapshot(), settings.mode, "team1");
          renderPlanBlock(plan1, planObj, "team1");
        }
        if (plan2 && showTeam2) {
          const planObj = aiModule.simulatePlan(buildDraftStateSnapshot(), settings.mode, "team2");
          renderPlanBlock(plan2, planObj, "team2");
        }
      }

      if (hintsNote) {
        if (mode === "manual") {
          setText(hintsNote, i18nModule.getLanguage() === "en"
            ? "Manual mode: you pick for both teams. Hints are shown for both sides."
            : "Manual: вы пикаете за обе команды. Подсказки отображаются для обеих сторон."
          );
        } else if (mode === "human_vs_ai") {
          setText(hintsNote, i18nModule.getLanguage() === "en"
            ? "Human vs AI: hints are optimized for the selected strategies. Tier/MMR dominate by default."
            : "Human vs AI: подсказки строятся по выбранным стратегиям. Tier/MMR доминируют по умолчанию."
          );
        } else {
          setText(hintsNote, i18nModule.getLanguage() === "en"
            ? "AI vs AI: AI plays both sides. Hints reflect current evaluation and planning."
            : "AI vs AI: ИИ играет за обе стороны. Подсказки отражают оценку и планирование."
          );
        }
      }
    }

    function renderHintPanel(bestEl, altsEl, rec, teamKey) {
      if (!bestEl || !altsEl) return;
      bestEl.innerHTML = "";
      altsEl.innerHTML = "";

      if (!rec || !rec.best) {
        bestEl.textContent = i18nModule.getLanguage() === "en" ? "No recommendations." : "Нет рекомендаций.";
        return;
      }

      const best = rec.best;
      const bLine = document.createElement("div");
      const reasons = (best.reasons || []).map((r) => i18nModule.reasonToText(r)).join("; ");
      bLine.textContent = (i18nModule.getLanguage() === "en" ? "Best: " : "Лучший: ")
        + best.player.name + " [" + best.player.tier + "] "
        + "(MMR " + best.player.mmr + ") "
        + "— " + reasons
        + " | AI " + best.value.toFixed(2);
      bestEl.appendChild(bLine);

      if (rec.alternatives && rec.alternatives.length) {
        rec.alternatives.forEach((alt, idx) => {
          const row = document.createElement("div");
          row.className = "ai-hint-alt-item";
          const reasons2 = (alt.reasons || []).map((r) => i18nModule.reasonToText(r)).join("; ");
          row.textContent = (i18nModule.getLanguage() === "en" ? "Alt " : "Альт ") + (idx + 1) + ": "
            + alt.player.name + " [" + alt.player.tier + "] "
            + "(MMR " + alt.player.mmr + ") "
            + "— " + reasons2
            + " | AI " + alt.value.toFixed(2);
          altsEl.appendChild(row);
        });
      }
    }

    function renderPlanBlock(container, planObj, teamKey) {
      if (!container) return;
      container.innerHTML = "";

      const title = document.createElement("div");
      title.className = "plan-title";
      title.textContent = i18nModule.getLanguage() === "en" ? "Plan & composition progress" : "План и прогресс состава";
      container.appendChild(title);

      // Composition progress
      const stratKey = teamKey === "team1" ? settings.strategyTeam1 : settings.strategyTeam2;
      const strat = aiModule.getStrategyByKey(stratKey);

      const teamPlayers = teamKey === "team1" ? state.team1.players : state.team2.players;

      if (strat && strat.compositionTargets) {
        ["infantry", "tanks", "mechanical", "support"].forEach((cat) => {
          const target = Number(strat.compositionTargets[cat] || 0);
          if (target <= 0) return;
          const now = aiModule.countCategoryInTeam(teamPlayers, cat);
          const line = document.createElement("div");
          line.className = "plan-line";
          line.textContent = i18nModule.categoryLabel(cat) + ": " + now + " / " + target;
          container.appendChild(line);
        });
      }

      const planListTitle = document.createElement("div");
      planListTitle.className = "plan-title";
      planListTitle.textContent = i18nModule.getLanguage() === "en" ? "Projected picks (remaining)" : "Прогноз пиков (оставшиеся)";
      container.appendChild(planListTitle);

      const ul = document.createElement("ol");
      ul.className = "plan-list";

      (planObj.steps || []).forEach((s) => {
        const li = document.createElement("li");
        const teamLabel = s.team === "team1"
          ? (i18nModule.getLanguage() === "en" ? "Team 1" : "Команда 1")
          : (i18nModule.getLanguage() === "en" ? "Team 2" : "Команда 2");
        li.textContent = "Pick " + s.pickNumber + " (" + teamLabel + "): " + s.playerName;
        ul.appendChild(li);
      });

      container.appendChild(ul);
    }

    function buildDraftStateSnapshot() {
      return {
        currentPickIndex: state.currentPickIndex,
        team1: { players: state.team1.players.slice(), captain: state.team1.captain },
        team2: { players: state.team2.players.slice(), captain: state.team2.captain },
        strategyTeam1: settings.strategyTeam1,
        strategyTeam2: settings.strategyTeam2
      };
    }

    function generateExportText() {
      const textarea = $("offline-export-text");
      if (!textarea) return;

      const lines = [];
      lines.push("Mode: " + settings.mode);
      lines.push("");

      lines.push("Team 1 (captain: " + (state.team1.captain || "—") + "):");
      (state.team1.players || []).forEach((p) => {
        const roles = (p.roles || []).join(", ");
        lines.push("- " + p.name + " [" + p.tier + "] (MMR " + p.mmr + ", DPM " + p.dpm + ", roles: " + roles + ")");
      });
      lines.push("");

      lines.push("Team 2 (captain: " + (state.team2.captain || "—") + "):");
      (state.team2.players || []).forEach((p) => {
        const roles = (p.roles || []).join(", ");
        lines.push("- " + p.name + " [" + p.tier + "] (MMR " + p.mmr + ", DPM " + p.dpm + ", roles: " + roles + ")");
      });
      lines.push("");

      lines.push("Strategy Team1: " + (settings.strategyTeam1 || "none"));
      lines.push("Strategy Team2: " + (settings.strategyTeam2 || "none"));

      textarea.value = lines.join("\n");
    }

    function initExportControls() {
      const finishBtn = $("offline-finish-btn");
      const copyBtn = $("offline-copy-export-btn");
      const statusEl = $("offline-export-status");
      const textarea = $("offline-export-text");

      if (finishBtn) {
        finishBtn.addEventListener("click", function () {
          state.status = "finished";
          generateExportText();
          renderDraftState();
          renderAvailableList();
          renderHintsAndPlanning();
          saveDraftLocal();
          setText(statusEl, i18nModule.getLanguage() === "en" ? "Draft finished. Export generated." : "Драфт завершён. Экспорт сформирован.");
        });
      }

      if (copyBtn && textarea) {
        copyBtn.addEventListener("click", function () {
          const txt = textarea.value || "";
          if (!txt) return;

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt)
              .then(() => setText(statusEl, i18nModule.getLanguage() === "en" ? "Copied." : "Скопировано."))
              .catch(() => setText(statusEl, i18nModule.getLanguage() === "en" ? "Copy failed; copy manually." : "Не удалось скопировать; скопируйте вручную."));
          } else {
            textarea.select();
            try {
              document.execCommand("copy");
              setText(statusEl, i18nModule.getLanguage() === "en" ? "Copied." : "Скопировано.");
            } catch (err) {
              setText(statusEl, i18nModule.getLanguage() === "en" ? "Copy not supported; copy manually." : "Копирование не поддерживается; скопируйте вручную.");
            }
          }
        });
      }
    }

    function renderAll() {
      renderDraftState();
      renderPoolTable();
      renderAvailableList();
      renderHintsAndPlanning();
    }

    function init() {
      loadDraftLocal();

      const keys = aiModule.getStrategyKeyListSafe();
      if (keys.indexOf(settings.strategyTeam1) === -1) settings.strategyTeam1 = keys[0];
      if (keys.indexOf(settings.strategyTeam2) === -1) settings.strategyTeam2 = keys[0];

      initSettingsUI();
      renderCaptainsSelectors();
      initPoolControls();
      initExportControls();

      renderAll();

      if (settings.mode === "ai_vs_ai") {
        // Start AI loop automatically if possible
        setTimeout(runAiIfNeeded, 100);
      }
    }

    function onStrategiesUpdated() {
      // refill selects
      const s1 = $("offline-strategy-team1-select");
      const s2 = $("offline-strategy-team2-select");
      const keys = aiModule.getStrategyKeyListSafe();

      function refill(sel, current) {
        if (!sel) return;
        sel.innerHTML = "";
        keys.forEach((k) => {
          const opt = document.createElement("option");
          opt.value = k;
          opt.textContent = k;
          sel.appendChild(opt);
        });
        if (keys.indexOf(current) !== -1) sel.value = current;
        else sel.value = keys[0];
      }

      refill(s1, settings.strategyTeam1);
      refill(s2, settings.strategyTeam2);

      settings.strategyTeam1 = s1 ? s1.value : settings.strategyTeam1;
      settings.strategyTeam2 = s2 ? s2.value : settings.strategyTeam2;

      resetDraftOnly();
    }

    return {
      init,
      renderAll,
      onStrategiesUpdated,
      onLanguageChanged: function () {
        updateStrategyLabelsForMode();
        renderAll();
      }
    };
  })();

  // ------------------------------------------------------
  // --- playersModule: CRUD игроков
  // ------------------------------------------------------

  const playersModule = (function () {
    let selectedName = null;

    function initRolesGrid() {
      const grid = $("player-edit-roles");
      if (!grid) return;

      grid.innerHTML = "";
      ROLE_IDS.forEach((r) => {
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = r;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + i18nModule.roleLabel(r)));
        grid.appendChild(label);
      });
    }

    function renderList() {
      const tbody = $("players-table")?.querySelector("tbody");
      if (!tbody) return;

      const filterName = ($("players-filter-name")?.value || "").toLowerCase().trim();
      const filterTier = $("players-filter-tier")?.value || "";

      const arr = dataModule.getPlayers().slice();
      let filtered = arr;

      if (filterName) {
        filtered = filtered.filter((p) => String(p.name).toLowerCase().indexOf(filterName) !== -1);
      }
      if (filterTier) {
        filtered = filtered.filter((p) => p.tier === filterTier);
      }

      // Sort by MMR desc
      filtered.sort((a, b) => (b.mmr || 0) - (a.mmr || 0));

      tbody.innerHTML = "";
      filtered.forEach((p) => {
        const tr = document.createElement("tr");
        tr.addEventListener("click", function () {
          selectPlayer(p.name);
        });

        const tdName = document.createElement("td");
        tdName.textContent = p.name;
        const tdTier = document.createElement("td");
        tdTier.textContent = p.tier;
        const tdMmr = document.createElement("td");
        tdMmr.textContent = String(p.mmr);
        const tdDpm = document.createElement("td");
        tdDpm.textContent = String(p.dpm);
        const tdRoles = document.createElement("td");
        tdRoles.textContent = (p.roles || []).map((r) => i18nModule.roleLabel(r)).join(", ");

        tr.appendChild(tdName);
        tr.appendChild(tdTier);
        tr.appendChild(tdMmr);
        tr.appendChild(tdDpm);
        tr.appendChild(tdRoles);

        tbody.appendChild(tr);
      });
    }

    function fillForm(p) {
      $("player-edit-name").value = p ? p.name : "";
      $("player-edit-tier").value = p ? p.tier : "C";
      $("player-edit-mmr").value = p ? p.mmr : 1200;
      $("player-edit-dpm").value = p ? p.dpm : 15000;

      const grid = $("player-edit-roles");
      if (!grid) return;
      const cbs = grid.querySelectorAll("input[type=checkbox]");
      cbs.forEach((cb) => {
        cb.checked = p && Array.isArray(p.roles) ? (p.roles.indexOf(cb.value) !== -1) : false;
      });
    }

    function selectPlayer(name) {
      const p = dataModule.getPlayerByName(name);
      if (!p) return;
      selectedName = p.name;
      fillForm(p);
      setText($("players-edit-status"), "");
    }

    function gatherForm() {
      const name = $("player-edit-name").value.trim();
      const tier = $("player-edit-tier").value;
      const mmr = Number($("player-edit-mmr").value) || 0;
      const dpm = Number($("player-edit-dpm").value) || 0;

      const roles = [];
      const grid = $("player-edit-roles");
      const cbs = grid ? grid.querySelectorAll("input[type=checkbox]") : [];
      cbs.forEach((cb) => {
        if (cb.checked) roles.push(cb.value);
      });

      return {
        name: name,
        tier: tier,
        mmr: mmr,
        dpm: dpm,
        roles: roles
      };
    }

    function savePlayer() {
      const status = $("players-edit-status");
      const p = gatherForm();
      if (!p.name) {
        setText(status, i18nModule.getLanguage() === "en" ? "Name is required." : "Имя обязательно.");
        return;
      }
      if (!isTier(p.tier)) {
        setText(status, i18nModule.getLanguage() === "en" ? "Invalid tier." : "Неверный Tier.");
        return;
      }

      const arr = dataModule.getPlayers().slice();
      const existingIndex = arr.findIndex((x) => x.name === p.name);

      // If name changed from selectedName
      if (selectedName && selectedName !== p.name) {
        const conflict = arr.some((x) => x.name === p.name);
        if (conflict) {
          setText(status, i18nModule.getLanguage() === "en" ? "Name already exists." : "Имя уже существует.");
          return;
        }
        const oldIndex = arr.findIndex((x) => x.name === selectedName);
        if (oldIndex >= 0) {
          arr.splice(oldIndex, 1);
        }
      }

      if (existingIndex >= 0) {
        arr[existingIndex] = p;
      } else {
        arr.push(p);
      }

      dataModule.setPlayers(arr);
      selectedName = p.name;

      renderList();
      offlineDraftModule.renderAll();

      setText(status, i18nModule.getLanguage() === "en" ? "Saved." : "Сохранено.");
    }

    function deletePlayer() {
      const status = $("players-edit-status");
      const name = $("player-edit-name").value.trim();
      if (!name) return;

      const ok = confirm(i18nModule.getLanguage() === "en" ? "Delete player?" : "Удалить игрока?");
      if (!ok) return;

      const arr = dataModule.getPlayers().slice().filter((p) => p.name !== name);
      dataModule.setPlayers(arr);
      selectedName = null;
      fillForm(null);

      renderList();
      offlineDraftModule.renderAll();

      setText(status, i18nModule.getLanguage() === "en" ? "Deleted." : "Удалено.");
    }

    function addNewPlayer() {
      selectedName = null;
      fillForm(null);
      setText($("players-edit-status"), i18nModule.getLanguage() === "en" ? "Create a new player and press Save." : "Создайте нового игрока и нажмите Сохранить.");
      $("player-edit-name").focus();
    }

    function initImportExport() {
      const exportBtn = $("players-export-btn");
      const importBtn = $("players-import-btn");
      const fileInput = $("players-import-file");
      const status = $("players-status");

      if (exportBtn) {
        exportBtn.addEventListener("click", function () {
          dataModule.exportPlayersFile();
          setText(status, i18nModule.getLanguage() === "en" ? "Export started." : "Экспорт начат.");
        });
      }

      if (importBtn && fileInput) {
        importBtn.addEventListener("click", function () {
          fileInput.click();
        });
        fileInput.addEventListener("change", function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          readFileAsText(file)
            .then((text) => {
              dataModule.importPlayersText(text);
              renderList();
              offlineDraftModule.renderAll();
              setText(status, i18nModule.getLanguage() === "en" ? "Imported." : "Импортировано.");
            })
            .catch((err) => {
              setText(status, (i18nModule.getLanguage() === "en" ? "Import error: " : "Ошибка импорта: ") + err.message);
            });
        });
      }
    }

    function bindFilters() {
      const fn = $("players-filter-name");
      const ft = $("players-filter-tier");
      if (fn) fn.addEventListener("input", renderList);
      if (ft) ft.addEventListener("change", renderList);
    }

    function initButtons() {
      const addBtn = $("players-add-new-btn");
      const saveBtn = $("players-save-btn");
      const delBtn = $("players-delete-btn");

      if (addBtn) addBtn.addEventListener("click", addNewPlayer);
      if (saveBtn) saveBtn.addEventListener("click", savePlayer);
      if (delBtn) delBtn.addEventListener("click", deletePlayer);
    }

    function onLanguageChanged() {
      initRolesGrid();
      renderList();
    }

    function init() {
      initRolesGrid();
      bindFilters();
      initButtons();
      initImportExport();

      renderList();
      fillForm(null);
    }

    return { init, onLanguageChanged };
  })();

  // ------------------------------------------------------
  // --- strategiesModule: CRUD стратегий + веса + цели состава
  // ------------------------------------------------------

  const strategiesModule = (function () {
    let selectedKey = null;

    function getPack() {
      return dataModule.getStrategies();
    }

    function savePack(pack) {
      dataModule.setStrategies(pack);
    }

    function rebuildSelect() {
      const sel = $("strategies-select");
      if (!sel) return;

      const pack = getPack();
      sel.innerHTML = "";

      if (!pack || !pack.strategies) return;

      Object.keys(pack.strategies).forEach((k) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        sel.appendChild(opt);
      });

      if (selectedKey && pack.strategies[selectedKey]) {
        sel.value = selectedKey;
      } else {
        selectedKey = sel.value || null;
      }
    }

    function renderWeightsTable(strategy) {
      const tbody = $("strategies-weights-table")?.querySelector("tbody");
      if (!tbody) return;

      tbody.innerHTML = "";
      ROLE_IDS.forEach((r) => {
        const tr = document.createElement("tr");

        const tdRole = document.createElement("td");
        tdRole.textContent = i18nModule.roleLabel(r);
        tr.appendChild(tdRole);

        const tdVal = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "0.05";
        inp.value = strategy && strategy.roleWeights && typeof strategy.roleWeights[r] === "number"
          ? strategy.roleWeights[r]
          : 1.0;
        inp.dataset.role = r;
        inp.className = "input";
        tdVal.appendChild(inp);
        tr.appendChild(tdVal);

        tbody.appendChild(tr);
      });
    }

    function fillForm() {
      const pack = getPack();
      if (!pack || !pack.strategies) return;

      const s = pack.strategies[selectedKey];
      if (!s) return;

      $("strategies-name-ru").value = (s.display && s.display.ru) ? s.display.ru : selectedKey;
      $("strategies-name-en").value = (s.display && s.display.en) ? s.display.en : selectedKey;
      $("strategies-desc-ru").value = (s.description && s.description.ru) ? s.description.ru : "";
      $("strategies-desc-en").value = (s.description && s.description.en) ? s.description.en : "";

      $("strategies-target-infantry").value = s.compositionTargets ? (s.compositionTargets.infantry || 0) : 0;
      $("strategies-target-tanks").value = s.compositionTargets ? (s.compositionTargets.tanks || 0) : 0;
      $("strategies-target-mechanical").value = s.compositionTargets ? (s.compositionTargets.mechanical || 0) : 0;
      $("strategies-target-support").value = s.compositionTargets ? (s.compositionTargets.support || 0) : 0;

      renderWeightsTable(s);
      rebuildJson();
    }

    function gatherWeightsFromTable() {
      const table = $("strategies-weights-table");
      if (!table) return {};
      const inputs = table.querySelectorAll("input[data-role]");
      const roleWeights = {};
      inputs.forEach((inp) => {
        const r = inp.dataset.role;
        roleWeights[r] = Number(inp.value) || 0;
      });
      return roleWeights;
    }

    function saveCurrentStrategy() {
      const pack = getPack();
      if (!pack || !pack.strategies || !selectedKey) return;

      const s = pack.strategies[selectedKey];
      if (!s) return;

      s.display = s.display || { ru: selectedKey, en: selectedKey };
      s.description = s.description || { ru: "", en: "" };
      s.compositionTargets = s.compositionTargets || { infantry: 0, tanks: 0, mechanical: 0, support: 0 };

      s.display.ru = $("strategies-name-ru").value.trim() || selectedKey;
      s.display.en = $("strategies-name-en").value.trim() || selectedKey;
      s.description.ru = $("strategies-desc-ru").value || "";
      s.description.en = $("strategies-desc-en").value || "";

      s.compositionTargets.infantry = clamp(Number($("strategies-target-infantry").value) || 0, 0, 5);
      s.compositionTargets.tanks = clamp(Number($("strategies-target-tanks").value) || 0, 0, 5);
      s.compositionTargets.mechanical = clamp(Number($("strategies-target-mechanical").value) || 0, 0, 5);
      s.compositionTargets.support = clamp(Number($("strategies-target-support").value) || 0, 0, 5);

      s.roleWeights = gatherWeightsFromTable();

      savePack(pack);
      setText($("strategies-status"), i18nModule.getLanguage() === "en" ? "Saved." : "Сохранено.");

      rebuildJson();
      offlineDraftModule.onStrategiesUpdated();
    }

    function addStrategy() {
      const key = prompt(i18nModule.getLanguage() === "en" ? "New strategy key (latin, underscore):" : "Ключ новой стратегии (латиница, underscore):");
      if (!key) return;

      const clean = key.trim();
      if (!clean) return;

      const pack = getPack();
      if (!pack || !pack.strategies) return;

      if (pack.strategies[clean]) {
        alert(i18nModule.getLanguage() === "en" ? "Strategy already exists." : "Стратегия уже существует.");
        return;
      }

      const roleWeights = {};
      ROLE_IDS.forEach((r) => roleWeights[r] = 1.0);

      pack.strategies[clean] = {
        display: { ru: clean, en: clean },
        description: { ru: "", en: "" },
        roleWeights: roleWeights,
        compositionTargets: { infantry: 0, tanks: 0, mechanical: 0, support: 0 },
        specialTargets: {},
        overrides: { counterWeightMultiplier: 1.0, universalWeightMultiplier: 1.0 }
      };

      savePack(pack);
      selectedKey = clean;

      rebuildSelect();
      fillForm();
      offlineDraftModule.onStrategiesUpdated();
    }

    function deleteStrategy() {
      const pack = getPack();
      if (!pack || !pack.strategies || !selectedKey) return;

      const ok = confirm(i18nModule.getLanguage() === "en" ? "Delete strategy?" : "Удалить стратегию?");
      if (!ok) return;

      delete pack.strategies[selectedKey];
      savePack(pack);

      selectedKey = null;
      rebuildSelect();
      fillForm();
      offlineDraftModule.onStrategiesUpdated();
    }

    function rebuildJson() {
      const area = $("strategies-json");
      if (!area) return;
      const pack = getPack();
      area.value = JSON.stringify(pack, null, 2);
    }

    function applyJson() {
      const area = $("strategies-json");
      if (!area) return;
      try {
        const obj = JSON.parse(area.value);
        dataModule.setStrategies(obj);
        setText($("strategies-status"), i18nModule.getLanguage() === "en" ? "Applied JSON." : "JSON применён.");

        selectedKey = null;
        rebuildSelect();
        fillForm();
        offlineDraftModule.onStrategiesUpdated();
      } catch (err) {
        alert("JSON error: " + err.message);
      }
    }

    function initImportExport() {
      const exportBtn = $("strategies-export-btn");
      const importBtn = $("strategies-import-btn");
      const fileInput = $("strategies-import-file");

      if (exportBtn) {
        exportBtn.addEventListener("click", function () {
          dataModule.exportStrategiesFile();
        });
      }

      if (importBtn && fileInput) {
        importBtn.addEventListener("click", function () {
          fileInput.click();
        });
        fileInput.addEventListener("change", function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          readFileAsText(file).then((text) => {
            dataModule.importStrategiesText(text);
            selectedKey = null;
            rebuildSelect();
            fillForm();
            offlineDraftModule.onStrategiesUpdated();
            setText($("strategies-status"), i18nModule.getLanguage() === "en" ? "Imported." : "Импортировано.");
          }).catch((err) => {
            alert(err.message);
          });
        });
      }
    }

    function init() {
      rebuildSelect();

      const sel = $("strategies-select");
      if (sel) {
        sel.addEventListener("change", function () {
          selectedKey = sel.value || null;
          fillForm();
        });
      }

      const saveBtn = $("strategies-save-btn");
      const addBtn = $("strategies-add-btn");
      const delBtn = $("strategies-delete-btn");
      const applyBtn = $("strategies-apply-json-btn");

      if (saveBtn) saveBtn.addEventListener("click", saveCurrentStrategy);
      if (addBtn) addBtn.addEventListener("click", addStrategy);
      if (delBtn) delBtn.addEventListener("click", deleteStrategy);
      if (applyBtn) applyBtn.addEventListener("click", applyJson);

      initImportExport();
      fillForm();
    }

    function onLanguageChanged() {
      rebuildSelect();
      fillForm();
    }

    return { init, onLanguageChanged };
  })();

  // ------------------------------------------------------
  // --- coeffsModule: tier multipliers + altPickChance + tierBias
  // ------------------------------------------------------

  const coeffsModule = (function () {
    function fill() {
      const c = dataModule.getCoeffs();
      $("coeffs-tier-S").value = c.tier.S;
      $("coeffs-tier-A").value = c.tier.A;
      $("coeffs-tier-B").value = c.tier.B;
      $("coeffs-tier-C").value = c.tier.C;
      $("coeffs-tier-D").value = c.tier.D;
      $("coeffs-tier-F").value = c.tier.F;
      $("coeffs-altpick").value = c.altPickChance;
      $("coeffs-tierbias").value = c.tierBias;
    }

    function save() {
      const obj = {
        tier: {
          S: Number($("coeffs-tier-S").value),
          A: Number($("coeffs-tier-A").value),
          B: Number($("coeffs-tier-B").value),
          C: Number($("coeffs-tier-C").value),
          D: Number($("coeffs-tier-D").value),
          F: Number($("coeffs-tier-F").value)
        },
        altPickChance: Number($("coeffs-altpick").value),
        tierBias: Number($("coeffs-tierbias").value)
      };
      dataModule.setCoeffs(obj);
      setText($("coeffs-status"), i18nModule.getLanguage() === "en" ? "Saved." : "Сохранено.");
      offlineDraftModule.renderAll();
    }

    function initImportExport() {
      const exportBtn = $("coeffs-export-btn");
      const importBtn = $("coeffs-import-btn");
      const fileInput = $("coeffs-import-file");

      if (exportBtn) exportBtn.addEventListener("click", function () { dataModule.exportCoeffsFile(); });

      if (importBtn && fileInput) {
        importBtn.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          readFileAsText(file).then((text) => {
            dataModule.importCoeffsText(text);
            fill();
            offlineDraftModule.renderAll();
            setText($("coeffs-status"), i18nModule.getLanguage() === "en" ? "Imported." : "Импортировано.");
          }).catch((err) => alert(err.message));
        });
      }
    }

    function init() {
      fill();
      initImportExport();
      const saveBtn = $("coeffs-save-btn");
      if (saveBtn) saveBtn.addEventListener("click", save);
    }

    function onLanguageChanged() {
      fill();
    }

    return { init, onLanguageChanged };
  })();

  // ------------------------------------------------------
  // --- aiSettingsModule: формулы, soft-caps, планирование, JSON
  // ------------------------------------------------------

  const aiSettingsModule = (function () {
    function fill() {
      const s = dataModule.getAiSettings();
      if (!s) return;

      // weights
      $("ai-w-mmr").value = s.formula.weights.mmr;
      $("ai-w-dpm").value = s.formula.weights.dpm;
      $("ai-w-role").value = s.formula.weights.rolePref;
      $("ai-w-comp").value = s.formula.weights.composition;
      $("ai-w-universal").value = s.formula.weights.universal;
      $("ai-w-counter").value = s.formula.weights.counter;

      $("ai-penalties-mult").value = s.formula.weights.penaltiesMultiplier;
      $("ai-noise-amp").value = s.formula.weights.noiseAmplitude;

      // tier dominance
      $("ai-tier-dom-enabled").checked = !!s.formula.tierDominance.enabled;
      $("ai-tier-down-penalty").value = s.formula.tierDominance.downPenaltyWhenHigherExists;

      // mmr
      $("ai-mmr-min").value = s.formula.normalization.mmrMin;
      $("ai-mmr-max").value = s.formula.normalization.mmrMax;
      $("ai-mmr-gap-threshold").value = s.formula.mmrGap.threshold;
      $("ai-mmr-gap-bonus").value = s.formula.mmrGap.bonusPer100;

      // universal
      $("ai-universal-min-roles").value = s.formula.universal.minRolesToBeUniversal;
      $("ai-universal-bonus").value = s.formula.universal.universalBonus;
      $("ai-dont-spend-universal-support").checked = !!s.formula.universal.dontSpendUniversalOnSupport;
      $("ai-universal-support-penalty").value = s.formula.universal.universalOnSupportPenalty;

      // planning
      $("ai-plan-enabled").value = s.formula.planning.enabled ? "true" : "false";
      $("ai-plan-topk").value = s.formula.planning.candidateTopK;
      $("ai-enemy-model").value = s.formula.planning.enemyModel || "power_first";

      // softcaps
      $("ai-soft-supportonly-max").value = s.formula.softCaps.supportOnly.maxPreferred;
      $("ai-soft-supportonly-pen2").value = s.formula.softCaps.supportOnly.penaltySecond;
      $("ai-soft-supportonly-pen3").value = s.formula.softCaps.supportOnly.penaltyThirdPlus;

      $("ai-soft-supporttotal-max").value = s.formula.softCaps.supportTotal.maxPreferred;
      $("ai-soft-supporttotal-pen").value = s.formula.softCaps.supportTotal.penaltyPerExtra;

      // hints
      $("ai-hints-alts").value = s.formula.hints.alternativesCount;
      $("ai-hints-show-opponent-hva").checked = !!s.formula.hints.showOpponentHintsInHumanVsAI;

      rebuildJson();
    }

    function save() {
      const s = deepClone(dataModule.getAiSettings());

      s.formula.weights.mmr = Number($("ai-w-mmr").value) || 0;
      s.formula.weights.dpm = Number($("ai-w-dpm").value) || 0;
      s.formula.weights.rolePref = Number($("ai-w-role").value) || 0;
      s.formula.weights.composition = Number($("ai-w-comp").value) || 0;
      s.formula.weights.universal = Number($("ai-w-universal").value) || 0;
      s.formula.weights.counter = Number($("ai-w-counter").value) || 0;

      s.formula.weights.penaltiesMultiplier = Number($("ai-penalties-mult").value) || 0;
      s.formula.weights.noiseAmplitude = Number($("ai-noise-amp").value) || 0;

      s.formula.tierDominance.enabled = !!$("ai-tier-dom-enabled").checked;
      s.formula.tierDominance.downPenaltyWhenHigherExists = Number($("ai-tier-down-penalty").value) || 0;

      s.formula.normalization.mmrMin = Number($("ai-mmr-min").value) || 0;
      s.formula.normalization.mmrMax = Number($("ai-mmr-max").value) || 0;

      s.formula.mmrGap.threshold = Number($("ai-mmr-gap-threshold").value) || 0;
      s.formula.mmrGap.bonusPer100 = Number($("ai-mmr-gap-bonus").value) || 0;

      s.formula.universal.minRolesToBeUniversal = Number($("ai-universal-min-roles").value) || 0;
      s.formula.universal.universalBonus = Number($("ai-universal-bonus").value) || 0;
      s.formula.universal.dontSpendUniversalOnSupport = !!$("ai-dont-spend-universal-support").checked;
      s.formula.universal.universalOnSupportPenalty = Number($("ai-universal-support-penalty").value) || 0;

      s.formula.planning.enabled = ($("ai-plan-enabled").value === "true");
      s.formula.planning.candidateTopK = Number($("ai-plan-topk").value) || 10;
      s.formula.planning.enemyModel = $("ai-enemy-model").value || "power_first";

      s.formula.softCaps.supportOnly.maxPreferred = Number($("ai-soft-supportonly-max").value) || 0;
      s.formula.softCaps.supportOnly.penaltySecond = Number($("ai-soft-supportonly-pen2").value) || 0;
      s.formula.softCaps.supportOnly.penaltyThirdPlus = Number($("ai-soft-supportonly-pen3").value) || 0;

      s.formula.softCaps.supportTotal.maxPreferred = Number($("ai-soft-supporttotal-max").value) || 0;
      s.formula.softCaps.supportTotal.penaltyPerExtra = Number($("ai-soft-supporttotal-pen").value) || 0;

      s.formula.hints.alternativesCount = clamp(Number($("ai-hints-alts").value) || 0, 0, 5);
      s.formula.hints.showOpponentHintsInHumanVsAI = !!$("ai-hints-show-opponent-hva").checked;

      dataModule.setAiSettings(s);
      rebuildJson();

      setText($("ai-settings-status"), i18nModule.getLanguage() === "en" ? "Saved." : "Сохранено.");
      offlineDraftModule.renderAll();
    }

    function rebuildJson() {
      const area = $("ai-settings-json");
      if (!area) return;
      area.value = JSON.stringify(dataModule.getAiSettings(), null, 2);
    }

    function applyJson() {
      const area = $("ai-settings-json");
      if (!area) return;
      try {
        const obj = JSON.parse(area.value);
        dataModule.setAiSettings(obj);
        fill();
        setText($("ai-settings-status"), i18nModule.getLanguage() === "en" ? "Applied JSON." : "JSON применён.");
        offlineDraftModule.renderAll();
      } catch (err) {
        alert("JSON error: " + err.message);
      }
    }

    function initImportExport() {
      const exportBtn = $("ai-settings-export-btn");
      const importBtn = $("ai-settings-import-btn");
      const fileInput = $("ai-settings-import-file");

      if (exportBtn) exportBtn.addEventListener("click", function () { dataModule.exportAiSettingsFile(); });

      if (importBtn && fileInput) {
        importBtn.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          readFileAsText(file).then((text) => {
            dataModule.importAiSettingsText(text);
            fill();
            offlineDraftModule.renderAll();
            setText($("ai-settings-status"), i18nModule.getLanguage() === "en" ? "Imported." : "Импортировано.");
          }).catch((err) => alert(err.message));
        });
      }
    }

    function init() {
      fill();
      initImportExport();

      const saveBtn = $("ai-settings-save-btn");
      const applyBtn = $("ai-settings-apply-json-btn");

      if (saveBtn) saveBtn.addEventListener("click", save);
      if (applyBtn) applyBtn.addEventListener("click", applyJson);
    }

    function onLanguageChanged() {
      fill();
    }

    return { init, onLanguageChanged };
  })();

  // ------------------------------------------------------
  // --- importExportModule: отдельные импорты + bundle
  // ------------------------------------------------------

  const importExportModule = (function () {
    function init() {
      const status = $("import-export-status");

      // Export buttons
      const exportPlayersBtn = $("export-players-btn");
      const exportStratsBtn = $("export-strategies-btn");
      const exportCoeffsBtn = $("export-coeffs-btn");
      const exportAiBtn = $("export-ai-settings-btn");
      const exportBundleBtn = $("export-bundle-btn");

      if (exportPlayersBtn) exportPlayersBtn.addEventListener("click", function () { dataModule.exportPlayersFile(); setText(status, "OK"); });
      if (exportStratsBtn) exportStratsBtn.addEventListener("click", function () { dataModule.exportStrategiesFile(); setText(status, "OK"); });
      if (exportCoeffsBtn) exportCoeffsBtn.addEventListener("click", function () { dataModule.exportCoeffsFile(); setText(status, "OK"); });
      if (exportAiBtn) exportAiBtn.addEventListener("click", function () { dataModule.exportAiSettingsFile(); setText(status, "OK"); });
      if (exportBundleBtn) exportBundleBtn.addEventListener("click", function () { dataModule.exportBundle(); setText(status, "OK"); });

      // Import separate files
      bindImportButton("import-players-btn", "import-players-file", function (text) { dataModule.importPlayersText(text); playersModule.onLanguageChanged(); offlineDraftModule.renderAll(); });
      bindImportButton("import-strategies-btn", "import-strategies-file", function (text) { dataModule.importStrategiesText(text); strategiesModule.onLanguageChanged(); offlineDraftModule.onStrategiesUpdated(); });
      bindImportButton("import-coeffs-btn", "import-coeffs-file", function (text) { dataModule.importCoeffsText(text); coeffsModule.onLanguageChanged(); offlineDraftModule.renderAll(); });
      bindImportButton("import-ai-settings-btn", "import-ai-settings-file", function (text) { dataModule.importAiSettingsText(text); aiSettingsModule.onLanguageChanged(); offlineDraftModule.renderAll(); });

      // Bundle import
      const importBundleBtn = $("import-bundle-btn");
      const importBundleFile = $("import-bundle-file");
      if (importBundleBtn && importBundleFile) {
        importBundleBtn.addEventListener("click", function () { importBundleFile.click(); });
        importBundleFile.addEventListener("change", function () {
          const file = importBundleFile.files && importBundleFile.files[0];
          if (!file) return;
          readFileAsText(file).then((text) => {
            dataModule.importBundleText(text);
            themeModule.applyTheme();
            i18nModule.applyStaticTranslations();
            offlineDraftModule.onLanguageChanged();
            playersModule.onLanguageChanged();
            strategiesModule.onLanguageChanged();
            coeffsModule.onLanguageChanged();
            aiSettingsModule.onLanguageChanged();
            setText(status, i18nModule.getLanguage() === "en" ? "Bundle imported." : "Bundle импортирован.");
          }).catch((err) => {
            setText(status, "Error: " + err.message);
          });
        });
      }
    }

    function bindImportButton(btnId, fileId, handler) {
      const btn = $(btnId);
      const fileInput = $(fileId);
      const status = $("import-export-status");

      if (!btn || !fileInput) return;

      btn.addEventListener("click", function () {
        fileInput.click();
      });

      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        readFileAsText(file).then((text) => {
          handler(text);
          themeModule.applyTheme();
          setText(status, i18nModule.getLanguage() === "en" ? "Imported." : "Импортировано.");
        }).catch((err) => {
          setText(status, "Error: " + err.message);
        });
      });
    }

    return { init };
  })();

  // ------------------------------------------------------
  // --- uiModule: навигация между экранами
  // ------------------------------------------------------

  const uiModule = (function () {
    function showScreen(id) {
      document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
      const el = $(id);
      if (el) el.classList.add("active");
    }

    function initMenuCards() {
      document.querySelectorAll(".menu-card").forEach((card) => {
        card.addEventListener("click", function () {
          const target = card.dataset.screenTarget;
          if (target) showScreen(target);
        });
      });

      const backIds = [
        "btn-back-menu-1",
        "btn-back-menu-2",
        "btn-back-menu-3",
        "btn-back-menu-4",
        "btn-back-menu-5",
        "btn-back-menu-6",
        "btn-back-menu-7"
      ];
      backIds.forEach((id) => {
        const btn = $(id);
        if (btn) btn.addEventListener("click", function () { showScreen("screen-menu"); });
      });
    }

    function initLanguageSwitch() {
      const sel = $("lang-select");
      if (!sel) return;

      sel.value = i18nModule.getLanguage();

      sel.addEventListener("change", function () {
        const lang = sel.value === "en" ? "en" : "ru";
        i18nModule.setLanguage(lang);
        i18nModule.applyStaticTranslations();

        // Re-render modules that contain dynamic text (role labels, etc.)
        offlineDraftModule.onLanguageChanged();
        playersModule.onLanguageChanged();
        strategiesModule.onLanguageChanged();
        coeffsModule.onLanguageChanged();
        aiSettingsModule.onLanguageChanged();
      });
    }

    function init() {
      initMenuCards();
      initLanguageSwitch();
    }

    return { init, showScreen };
  })();

  // ------------------------------------------------------
  // --- ИНИЦИАЛИЗАЦИЯ
  // ------------------------------------------------------

  window.addEventListener("DOMContentLoaded", function () {
    i18nModule.loadLanguage();

    dataModule.init().then(() => {
      // Apply language + theme early
      const sel = $("lang-select");
      if (sel) sel.value = i18nModule.getLanguage();

      i18nModule.applyStaticTranslations();
      themeModule.applyTheme();

      uiModule.init();

      themeModule.initAppearanceUI();

      playersModule.init();
      strategiesModule.init();
      coeffsModule.init();
      aiSettingsModule.init();
      importExportModule.init();

      offlineDraftModule.init();
    }).catch((err) => {
      console.error("INIT ERROR:", err);
      alert("INIT ERROR: " + err.message);
    });
  });

})(); 
