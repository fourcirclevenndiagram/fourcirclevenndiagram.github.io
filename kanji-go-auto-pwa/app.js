(function () {
  "use strict";

  var QUESTIONS = Array.isArray(window.KANJI_QUESTIONS) ? window.KANJI_QUESTIONS : [];
  if (QUESTIONS.length !== 500 || QUESTIONS[499].kanji !== "麢羊") {
    document.body.innerHTML = '<main style="padding:24px;color:white;background:#070915;min-height:100vh"><h1>데이터 오류</h1><p>500문제 데이터 파일을 불러오지 못했습니다.</p></main>';
    throw new Error("KANJI_QUESTIONS must contain IDs 1–500.");
  }

  var STORAGE_KEY = "kanjiGoAutoMuseumV2";
  var STAGES = [
    { key: "kanji", meta: "漢字", label: "漢字を考える", sr: "한자를 생각하는 단계" },
    { key: "reading", meta: "読み", label: "読みを確かめる", sr: "요미가나 확인 단계" },
    { key: "explanation", meta: "解説", label: "意味を覚える", sr: "일본어와 한국어 해설 단계" }
  ];
  var MODE_LABELS = {
    random: "전체 랜덤",
    sequential: "ID 순서",
    least: "덜 본 순",
    difficult: "어려움",
    favorites: "즐겨찾기"
  };
  var DEFAULT_SETTINGS = {
    mode: "random",
    durations: [5, 5, 5],
    kanjiSize: 100,
    explainSize: 100,
    quality: "auto",
    particleCount: 420,
    soundEnabled: true,
    musicEnabled: false,
    showJapanese: true,
    showKorean: true,
    furiganaMode: "all",
    screenShake: true,
    wakeLockEnabled: false,
    reducedMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  };

  function freshState() {
    return {
      version: 2,
      settings: Object.assign({}, DEFAULT_SETTINGS, { durations: DEFAULT_SETTINGS.durations.slice() }),
      exposure: {},
      lastSeen: {},
      favorites: [],
      difficult: [],
      lastQuestionId: 0,
      totalStudyMs: 0,
      completedCycles: 0,
      queue: null
    };
  }

  function safeParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function sanitizeState(raw) {
    var base = freshState();
    if (!raw || raw.version !== 2) return base;
    base.settings = Object.assign({}, base.settings, raw.settings || {});
    base.settings.durations = Array.isArray(raw.settings && raw.settings.durations)
      ? raw.settings.durations.slice(0, 3).map(function (n, i) {
          var max = i === 2 ? 20 : 15;
          n = Number(n);
          return Number.isFinite(n) ? Math.min(max, Math.max(2, n)) : 5;
        })
      : [5, 5, 5];
    base.exposure = raw.exposure && typeof raw.exposure === "object" ? raw.exposure : {};
    base.lastSeen = raw.lastSeen && typeof raw.lastSeen === "object" ? raw.lastSeen : {};
    base.favorites = uniqueValidIds(raw.favorites);
    base.difficult = uniqueValidIds(raw.difficult);
    base.lastQuestionId = validId(raw.lastQuestionId) ? Number(raw.lastQuestionId) : 0;
    base.totalStudyMs = Math.max(0, Number(raw.totalStudyMs) || 0);
    base.completedCycles = Math.max(0, Math.floor(Number(raw.completedCycles) || 0));
    if (raw.queue && raw.queue.mode === base.settings.mode && Array.isArray(raw.queue.ids)) {
      var ids = uniqueValidIds(raw.queue.ids);
      var cursor = Math.floor(Number(raw.queue.cursor));
      if (ids.length && cursor >= 0 && cursor < ids.length) {
        base.queue = { mode: raw.queue.mode, ids: ids, cursor: cursor };
      }
    }
    return base;
  }

  function validId(id) {
    id = Number(id);
    return Number.isInteger(id) && id >= 1 && id <= 500;
  }

  function uniqueValidIds(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(new Set(list.map(Number).filter(validId)));
  }

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function pad(n, size) { return String(n).padStart(size || 2, "0"); }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var state = sanitizeState(safeParse(localStorage.getItem(STORAGE_KEY)));
  var current = null;
  var stageIndex = 0;
  var stageElapsedMs = 0;
  var paused = false;
  var lastFrameTime = 0;
  var saveAccumulator = 0;
  var history = [];
  var historyIndex = -1;
  var dialogWasPaused = false;
  var resetArmed = false;
  var resetTimer = 0;
  var toastTimer = 0;
  var pointerStart = null;
  var wakeLock = null;

  var refs = {
    app: $("app"),
    studyStage: $("studyStage"),
    metaId: $("metaId"),
    metaPosition: $("metaPosition"),
    metaStage: $("metaStage"),
    metaMode: $("metaMode"),
    ringProgress: $("ringProgress"),
    stageSeconds: $("stageSeconds"),
    questionLabel: $("questionLabel"),
    kanji: $("kanji"),
    readingWrap: $("readingWrap"),
    reading: $("reading"),
    explanations: $("explanations"),
    jpPanel: $("jpPanel"),
    koPanel: $("koPanel"),
    jpExplanation: $("jpExplanation"),
    koExplanation: $("koExplanation"),
    pauseBadge: $("pauseBadge"),
    audioHint: $("audioHint"),
    totalTimeText: $("totalTimeText"),
    totalProgress: $("totalProgress"),
    stageProgressLabel: $("stageProgressLabel"),
    stageTimeText: $("stageTimeText"),
    stageProgress: $("stageProgress"),
    prevBtn: $("prevBtn"),
    pauseBtn: $("pauseBtn"),
    pauseIcon: $("pauseIcon"),
    pauseText: $("pauseText"),
    nextBtn: $("nextBtn"),
    favoriteBtn: $("favoriteBtn"),
    difficultBtn: $("difficultBtn"),
    settingsBtn: $("settingsBtn"),
    toast: $("toast"),
    srStage: $("srStage"),
    shockwave: $("shockwave"),
    dialog: $("settingsDialog"),
    closeSettings: $("closeSettings"),
    modeSelect: $("modeSelect"),
    kanjiDuration: $("kanjiDuration"),
    readingDuration: $("readingDuration"),
    explainDuration: $("explainDuration"),
    kanjiDurationValue: $("kanjiDurationValue"),
    readingDurationValue: $("readingDurationValue"),
    explainDurationValue: $("explainDurationValue"),
    furiganaMode: $("furiganaMode"),
    kanjiSize: $("kanjiSize"),
    kanjiSizeValue: $("kanjiSizeValue"),
    explainSize: $("explainSize"),
    explainSizeValue: $("explainSizeValue"),
    showJapanese: $("showJapanese"),
    showKorean: $("showKorean"),
    screenShake: $("screenShake"),
    reducedMotion: $("reducedMotion"),
    quality: $("quality"),
    particleCount: $("particleCount"),
    particleCountValue: $("particleCountValue"),
    soundEnabled: $("soundEnabled"),
    musicEnabled: $("musicEnabled"),
    wakeLockEnabled: $("wakeLockEnabled"),
    statStudyTime: $("statStudyTime"),
    statCycles: $("statCycles"),
    statFavorites: $("statFavorites"),
    statDifficult: $("statDifficult"),
    resetBtn: $("resetBtn"),
    fxCanvas: $("fxCanvas")
  };

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showToast("저장 공간이 부족해 학습 기록을 저장하지 못했습니다.");
    }
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      refs.toast.classList.remove("show");
    }, 1900);
  }

  function countFor(id) { return Number(state.exposure[id]) || 0; }
  function seenAt(id) { return Number(state.lastSeen[id]) || 0; }

  function sourceIdsForMode(mode) {
    var all = QUESTIONS.map(function (q) { return q.id; });
    if (mode === "favorites") return state.favorites.slice();
    if (mode === "difficult") return state.difficult.slice();
    return all;
  }

  function makeQueue(mode) {
    var ids = sourceIdsForMode(mode);
    if (!ids.length) return null;
    if (mode === "random" || mode === "favorites" || mode === "difficult") {
      ids = shuffle(ids);
    } else if (mode === "least") {
      ids = shuffle(ids).sort(function (a, b) {
        return countFor(a) - countFor(b) || seenAt(a) - seenAt(b);
      });
    } else {
      ids.sort(function (a, b) { return a - b; });
    }
    if (state.lastQuestionId && ids.length > 1 && ids[0] === state.lastQuestionId) {
      var swap = ids[0]; ids[0] = ids[1]; ids[1] = swap;
    }
    state.queue = { mode: mode, ids: ids, cursor: -1 };
    return state.queue;
  }

  function ensureQueue() {
    var q = state.queue;
    if (!q || q.mode !== state.settings.mode || !Array.isArray(q.ids) || !q.ids.length) {
      q = makeQueue(state.settings.mode);
    }
    return q;
  }

  function nextQueueId() {
    var q = ensureQueue();
    if (!q) return null;
    q.cursor += 1;
    if (q.cursor >= q.ids.length) {
      state.completedCycles += 1;
      q = makeQueue(state.settings.mode);
      if (!q) return null;
      q.cursor = 0;
      showToast("한 순환 완료 · 새로운 순서를 생성했습니다.");
    }
    return q.ids[q.cursor];
  }

  function currentQueuePosition() {
    var q = ensureQueue();
    if (!q) return { now: 0, total: 0 };
    return { now: clamp(q.cursor + 1, 1, q.ids.length), total: q.ids.length };
  }

  function recordExposure(id) {
    state.exposure[id] = countFor(id) + 1;
    state.lastSeen[id] = Date.now();
    state.lastQuestionId = id;
  }

  function setCurrentQuestion(id, options) {
    options = options || {};
    if (!validId(id)) return;
    current = QUESTIONS[id - 1];
    recordExposure(id);
    if (options.pushHistory !== false) {
      if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
      if (history[history.length - 1] !== id) history.push(id);
      if (history.length > 160) history.shift();
      historyIndex = history.length - 1;
    }
    stageIndex = 0;
    stageElapsedMs = 0;
    renderQuestion();
    setStage(0, { newQuestion: true });
    updateStats();
    saveState();
  }

  function advanceQuestion(manual) {
    audio.play("next");
    if (historyIndex < history.length - 1) {
      historyIndex += 1;
      setCurrentQuestion(history[historyIndex], { pushHistory: false });
      return;
    }
    var id = nextQueueId();
    if (id == null) {
      showToast("이 모드에 등록된 문제가 없습니다.");
      return;
    }
    setCurrentQuestion(id);
    if (manual) showToast("다음 문제");
  }

  function previousQuestion() {
    audio.play("button");
    if (historyIndex > 0) {
      historyIndex -= 1;
      setCurrentQuestion(history[historyIndex], { pushHistory: false });
      showToast("이전 문제");
      return;
    }
    var q = ensureQueue();
    if (q && q.cursor > 0) {
      q.cursor -= 1;
      setCurrentQuestion(q.ids[q.cursor]);
      showToast("이전 문제");
    } else {
      showToast("이전 기록이 없습니다.");
    }
  }

  function cleanReading(value) {
    return String(value)
      .replace(/\s*etc\.{0,2}/gi, "")
      .replace(/、/g, "・")
      .replace(/\s+/g, " ")
      .trim();
  }

  function katakanaToHiragana(value) {
    return Array.from(value).map(function (ch) {
      var code = ch.charCodeAt(0);
      return code >= 0x30A1 && code <= 0x30F6 ? String.fromCharCode(code - 0x60) : ch;
    }).join("");
  }

  function displayReading(value) {
    var result = katakanaToHiragana(cleanReading(value));
    if (state.settings.furiganaMode === "primary") result = result.split("・")[0];
    if (state.settings.furiganaMode === "spaced") result = result.replace(/・/g, "　／　");
    return result;
  }

  function renderQuestion() {
    var len = Array.from(current.kanji.replace(/[()（）]/g, "")).length;
    refs.kanji.className = "kanji";
    if (len >= 11) refs.kanji.classList.add("length-xlong");
    else if (len >= 7) refs.kanji.classList.add("length-long");
    else if (len >= 4) refs.kanji.classList.add("length-medium");
    refs.kanji.textContent = current.kanji;
    refs.reading.textContent = displayReading(current.reading);
    refs.jpExplanation.textContent = current.japaneseExplanation;
    refs.koExplanation.textContent = current.koreanExplanation;
    refs.metaId.textContent = pad(current.id, 3);
    updateQueueMeta();
    updateMarkers();
    applyExplanationFit();
  }

  function updateQueueMeta() {
    var p = currentQueuePosition();
    refs.metaPosition.textContent = p.total === 500
      ? pad(p.now, 3) + " / 500"
      : pad(p.now, 2) + " / " + p.total + " · 500";
    refs.metaMode.textContent = MODE_LABELS[state.settings.mode] || MODE_LABELS.random;
  }

  function applyExplanationFit() {
    var maxLen = Math.max(Array.from(current.japaneseExplanation).length, Array.from(current.koreanExplanation).length);
    var fit = maxLen > 130 ? .78 : maxLen > 108 ? .86 : maxLen > 88 ? .93 : 1;
    var scale = (state.settings.explainSize / 100) * fit;
    document.documentElement.style.setProperty("--explain-scale", scale.toFixed(3));
  }

  function randomClass(list) { return list[Math.floor(Math.random() * list.length)]; }

  function retrigger(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function triggerTransitionFx(kind) {
    refs.shockwave.classList.remove("play");
    void refs.shockwave.offsetWidth;
    refs.shockwave.classList.add("play");
    var colors = { kanji: "#ffd787", reading: "#65f5e9", explanation: "#a375ff" };
    particles.burst(colors[kind] || "#ffffff", state.settings.reducedMotion ? 10 : 34);
    background.triggerShock();
    if (state.settings.screenShake && !state.settings.reducedMotion) {
      refs.app.classList.remove("shake");
      void refs.app.offsetWidth;
      refs.app.classList.add("shake");
    }
  }

  function setStage(index, options) {
    options = options || {};
    stageIndex = index;
    var stage = STAGES[index];
    document.body.classList.remove("stage-kanji", "stage-reading", "stage-explanation");
    document.body.classList.add("stage-" + stage.key);
    refs.metaStage.textContent = stage.meta;
    refs.stageProgressLabel.textContent = stage.label;
    refs.questionLabel.textContent = index === 0 ? "READ THE KANJI" : index === 1 ? "READING REVEALED" : "BILINGUAL ARCHIVE";
    refs.readingWrap.className = "reading-wrap";
    refs.explanations.classList.remove("visible");
    refs.readingWrap.setAttribute("aria-hidden", index < 1 ? "true" : "false");
    refs.explanations.setAttribute("aria-hidden", index < 2 ? "true" : "false");
    refs.jpPanel.setAttribute("aria-hidden", index < 2 || !state.settings.showJapanese ? "true" : "false");
    refs.koPanel.setAttribute("aria-hidden", index < 2 || !state.settings.showKorean ? "true" : "false");

    if (index >= 1) {
      refs.readingWrap.classList.add("visible");
      var reveal = randomClass(["reveal-rise", "reveal-focus", "reveal-scan", "reveal-letters", "reveal-particles"]);
      refs.readingWrap.classList.add(reveal);
    }
    if (index >= 2) refs.explanations.classList.add("visible");

    if (options.newQuestion) {
      ["fx-gather", "fx-stroke", "fx-glitch", "fx-ink", "fx-burst"].forEach(function (c) {
        refs.kanji.classList.remove(c);
      });
      var kanjiFx = randomClass(["fx-gather", "fx-stroke", "fx-glitch", "fx-ink", "fx-burst"]);
      retrigger(refs.kanji, kanjiFx);
      audio.play("kanji");
    } else if (index === 1) {
      audio.play("reading");
    } else {
      audio.play("explanation");
    }
    triggerTransitionFx(stage.key);
    refs.srStage.textContent = "ID " + current.id + ", " + stage.sr + (index > 0 ? ", " + displayReading(current.reading) : "");
    updateProgress();
  }

  function stageDurationMs(index) {
    return state.settings.durations[index] * 1000;
  }

  function totalDurationMs() {
    return state.settings.durations.reduce(function (sum, n) { return sum + n; }, 0) * 1000;
  }

  function priorDurationMs(index) {
    var sum = 0;
    for (var i = 0; i < index; i++) sum += stageDurationMs(i);
    return sum;
  }

  function updateProgress() {
    var stageDuration = stageDurationMs(stageIndex);
    var totalDuration = totalDurationMs();
    var stageRatio = clamp(stageElapsedMs / stageDuration, 0, 1);
    var totalElapsed = priorDurationMs(stageIndex) + stageElapsedMs;
    var totalRatio = clamp(totalElapsed / totalDuration, 0, 1);
    refs.stageProgress.style.width = (stageRatio * 100).toFixed(3) + "%";
    refs.totalProgress.style.width = (totalRatio * 100).toFixed(3) + "%";
    refs.stageTimeText.textContent = (stageElapsedMs / 1000).toFixed(1).padStart(4, "0") + " / " + (stageDuration / 1000).toFixed(1).padStart(4, "0");
    refs.totalTimeText.textContent = (totalElapsed / 1000).toFixed(1).padStart(4, "0") + " / " + (totalDuration / 1000).toFixed(1);
    refs.stageSeconds.textContent = String(Math.max(0, Math.ceil((stageDuration - stageElapsedMs) / 1000)));
    refs.ringProgress.style.strokeDashoffset = String(333 * stageRatio);

    var a = state.settings.durations[0] / (totalDuration / 1000) * 100;
    var b = state.settings.durations[1] / (totalDuration / 1000) * 100;
    document.querySelector(".kanji-segment").style.width = a + "%";
    document.querySelector(".reading-segment").style.left = a + "%";
    document.querySelector(".reading-segment").style.width = b + "%";
    document.querySelector(".explain-segment").style.left = (a + b) + "%";
  }

  function advanceTimeline() {
    var safety = 0;
    while (stageElapsedMs >= stageDurationMs(stageIndex) && safety++ < 5) {
      stageElapsedMs -= stageDurationMs(stageIndex);
      if (stageIndex < 2) {
        setStage(stageIndex + 1);
      } else {
        var carry = stageElapsedMs;
        advanceQuestion(false);
        stageElapsedMs = carry;
      }
    }
  }

  function setPaused(value, announce) {
    paused = Boolean(value);
    refs.studyStage.classList.toggle("paused", paused);
    refs.pauseIcon.textContent = paused ? "▶" : "Ⅱ";
    refs.pauseText.textContent = paused ? "재생" : "정지";
    refs.pauseBtn.setAttribute("aria-label", paused ? "재생" : "일시정지");
    if (announce !== false) showToast(paused ? "일시정지" : "자동 재생");
    if (paused) audio.suspendAmbient();
    else audio.resumeAmbient();
  }

  function togglePause() {
    audio.play("button");
    setPaused(!paused);
  }

  function updateMarkers() {
    var favorite = state.favorites.indexOf(current.id) >= 0;
    var difficult = state.difficult.indexOf(current.id) >= 0;
    refs.favoriteBtn.classList.toggle("active", favorite);
    refs.difficultBtn.classList.toggle("active", difficult);
    refs.favoriteBtn.setAttribute("aria-pressed", favorite ? "true" : "false");
    refs.difficultBtn.setAttribute("aria-pressed", difficult ? "true" : "false");
    refs.favoriteBtn.querySelector("span").textContent = favorite ? "★" : "☆";
    refs.difficultBtn.querySelector("span").textContent = difficult ? "◆" : "◇";
  }

  function toggleList(type) {
    var list = state[type];
    var index = list.indexOf(current.id);
    var adding = index < 0;
    if (adding) list.push(current.id); else list.splice(index, 1);
    updateMarkers();
    updateStats();
    saveState();
    audio.play(type === "favorites" ? "favorite" : "difficult");
    showToast((type === "favorites" ? "즐겨찾기" : "어려운 문제") + (adding ? " 등록" : " 해제"));
  }

  function applySettings() {
    var s = state.settings;
    document.documentElement.style.setProperty("--kanji-scale", (s.kanjiSize / 100).toFixed(2));
    document.body.classList.toggle("hide-japanese", !s.showJapanese);
    document.body.classList.toggle("hide-korean", !s.showKorean);
    document.body.classList.toggle("reduced-motion", Boolean(s.reducedMotion));
    refs.jpPanel.setAttribute("aria-hidden", stageIndex < 2 || !s.showJapanese ? "true" : "false");
    refs.koPanel.setAttribute("aria-hidden", stageIndex < 2 || !s.showKorean ? "true" : "false");
    refs.modeSelect.value = s.mode;
    refs.kanjiDuration.value = s.durations[0];
    refs.readingDuration.value = s.durations[1];
    refs.explainDuration.value = s.durations[2];
    refs.kanjiDurationValue.textContent = s.durations[0] + "초";
    refs.readingDurationValue.textContent = s.durations[1] + "초";
    refs.explainDurationValue.textContent = s.durations[2] + "초";
    refs.furiganaMode.value = s.furiganaMode;
    refs.kanjiSize.value = s.kanjiSize;
    refs.kanjiSizeValue.textContent = s.kanjiSize + "%";
    refs.explainSize.value = s.explainSize;
    refs.explainSizeValue.textContent = s.explainSize + "%";
    refs.showJapanese.checked = s.showJapanese;
    refs.showKorean.checked = s.showKorean;
    refs.screenShake.checked = s.screenShake;
    refs.reducedMotion.checked = s.reducedMotion;
    refs.quality.value = s.quality;
    refs.particleCount.value = s.particleCount;
    refs.particleCountValue.textContent = String(s.particleCount);
    refs.soundEnabled.checked = s.soundEnabled;
    refs.musicEnabled.checked = s.musicEnabled;
    refs.wakeLockEnabled.checked = s.wakeLockEnabled;
    if (current) {
      refs.reading.textContent = displayReading(current.reading);
      applyExplanationFit();
      updateQueueMeta();
    }
    background.configure();
    if (s.musicEnabled) audio.resumeAmbient(); else audio.stopAmbient();
    if (!s.wakeLockEnabled) releaseWakeLock();
    updateProgress();
    updateStats();
  }

  function setMode(mode) {
    var ids = sourceIdsForMode(mode);
    if (!ids.length) {
      refs.modeSelect.value = state.settings.mode;
      showToast(mode === "favorites" ? "즐겨찾기 문제가 없습니다." : "어려운 문제가 없습니다.");
      return false;
    }
    state.settings.mode = mode;
    state.queue = null;
    var id = nextQueueId();
    setCurrentQuestion(id);
    showToast(MODE_LABELS[mode] + " 모드");
    return true;
  }

  function formatStudyTime(ms) {
    var minutes = Math.floor(ms / 60000);
    if (minutes < 60) return minutes + "분";
    var hours = Math.floor(minutes / 60);
    return hours + "시간 " + (minutes % 60) + "분";
  }

  function updateStats() {
    refs.statStudyTime.textContent = formatStudyTime(state.totalStudyMs);
    refs.statCycles.textContent = state.completedCycles + "회";
    refs.statFavorites.textContent = state.favorites.length + "개";
    refs.statDifficult.textContent = state.difficult.length + "개";
  }

  function bindSettings() {
    refs.modeSelect.addEventListener("change", function () {
      audio.play("button");
      setMode(this.value);
    });
    [
      [refs.kanjiDuration, 0, refs.kanjiDurationValue],
      [refs.readingDuration, 1, refs.readingDurationValue],
      [refs.explainDuration, 2, refs.explainDurationValue]
    ].forEach(function (entry) {
      entry[0].addEventListener("input", function () {
        state.settings.durations[entry[1]] = Number(this.value);
        entry[2].textContent = this.value + "초";
        updateProgress();
        saveState();
      });
    });
    refs.furiganaMode.addEventListener("change", function () {
      state.settings.furiganaMode = this.value;
      refs.reading.textContent = displayReading(current.reading);
      saveState();
    });
    refs.kanjiSize.addEventListener("input", function () {
      state.settings.kanjiSize = Number(this.value);
      applySettings();
      saveState();
    });
    refs.explainSize.addEventListener("input", function () {
      state.settings.explainSize = Number(this.value);
      applySettings();
      saveState();
    });
    [
      [refs.showJapanese, "showJapanese"],
      [refs.showKorean, "showKorean"],
      [refs.screenShake, "screenShake"],
      [refs.reducedMotion, "reducedMotion"],
      [refs.soundEnabled, "soundEnabled"],
      [refs.musicEnabled, "musicEnabled"],
      [refs.wakeLockEnabled, "wakeLockEnabled"]
    ].forEach(function (entry) {
      entry[0].addEventListener("change", function () {
        state.settings[entry[1]] = this.checked;
        if (entry[1] === "wakeLockEnabled" && this.checked) requestWakeLock();
        applySettings();
        saveState();
      });
    });
    refs.quality.addEventListener("change", function () {
      state.settings.quality = this.value;
      background.configure(true);
      saveState();
    });
    refs.particleCount.addEventListener("input", function () {
      state.settings.particleCount = Number(this.value);
      refs.particleCountValue.textContent = this.value;
      background.configure(true);
      saveState();
    });
  }

  function openSettings() {
    audio.play("button");
    dialogWasPaused = paused;
    if (!paused) setPaused(true, false);
    updateStats();
    if (typeof refs.dialog.showModal === "function") refs.dialog.showModal();
    else refs.dialog.setAttribute("open", "");
  }

  function closeSettings() {
    if (!dialogWasPaused) setPaused(false, false);
    saveState();
  }

  function requestWakeLock() {
    if (!state.settings.wakeLockEnabled || !("wakeLock" in navigator) || document.hidden) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      lock.addEventListener("release", function () { wakeLock = null; });
      showToast("화면 꺼짐 방지가 켜졌습니다.");
    }).catch(function () {
      showToast("이 브라우저에서는 화면 꺼짐 방지를 사용할 수 없습니다.");
      state.settings.wakeLockEnabled = false;
      refs.wakeLockEnabled.checked = false;
      saveState();
    });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  function bindControls() {
    refs.prevBtn.addEventListener("click", previousQuestion);
    refs.nextBtn.addEventListener("click", function () { advanceQuestion(true); });
    refs.pauseBtn.addEventListener("click", togglePause);
    refs.favoriteBtn.addEventListener("click", function () { toggleList("favorites"); });
    refs.difficultBtn.addEventListener("click", function () { toggleList("difficult"); });
    refs.settingsBtn.addEventListener("click", openSettings);
    refs.dialog.addEventListener("close", closeSettings);
    refs.closeSettings.addEventListener("click", function () {
      if (!dialogWasPaused) window.setTimeout(function () { setPaused(false, false); }, 0);
    });

    refs.studyStage.addEventListener("pointerdown", function (event) {
      pointerStart = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
      try { refs.studyStage.setPointerCapture(event.pointerId); } catch (_) {}
    });
    refs.studyStage.addEventListener("pointerup", function (event) {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      var duration = performance.now() - pointerStart.time;
      pointerStart = null;
      if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.25 && duration < 900) {
        if (dx < 0) advanceQuestion(true); else previousQuestion();
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && duration < 650) {
        togglePause();
      }
    });
    refs.studyStage.addEventListener("pointercancel", function () { pointerStart = null; });

    document.addEventListener("keydown", function (event) {
      var tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || refs.dialog.open) return;
      var key = event.key.toLowerCase();
      if (event.code === "Space") { event.preventDefault(); togglePause(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); previousQuestion(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); advanceQuestion(true); }
      else if (key === "f") { event.preventDefault(); toggleList("favorites"); }
      else if (key === "d") { event.preventDefault(); toggleList("difficult"); }
    });

    refs.resetBtn.addEventListener("click", function () {
      if (!resetArmed) {
        resetArmed = true;
        refs.resetBtn.classList.add("confirm");
        refs.resetBtn.textContent = "정말 초기화하려면 다시 누르세요";
        clearTimeout(resetTimer);
        resetTimer = window.setTimeout(function () {
          resetArmed = false;
          refs.resetBtn.classList.remove("confirm");
          refs.resetBtn.textContent = "학습 기록 초기화";
        }, 5000);
        return;
      }
      clearTimeout(resetTimer);
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    });
  }

  function ParticleOverlay(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.items = [];
    this.dpr = 1;
    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  ParticleOverlay.prototype.resize = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.canvas.width = Math.floor(innerWidth * this.dpr);
    this.canvas.height = Math.floor(innerHeight * this.dpr);
    this.canvas.style.width = innerWidth + "px";
    this.canvas.style.height = innerHeight + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  ParticleOverlay.prototype.burst = function (color, count) {
    var rect = refs.kanji.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 35 + Math.random() * 155;
      this.items.push({
        x: x + (Math.random() - .5) * Math.min(rect.width, 180),
        y: y + (Math.random() - .5) * Math.min(rect.height, 90),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: .45 + Math.random() * .7,
        max: 1.15,
        size: .8 + Math.random() * 2.4,
        color: color
      });
    }
    if (this.items.length > 260) this.items.splice(0, this.items.length - 260);
  };

  ParticleOverlay.prototype.render = function (dt) {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = this.items.length - 1; i >= 0; i--) {
      var p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= .985;
      p.vy = p.vy * .985 + 8 * dt;
      var alpha = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
    this.ambientNodes = [];
    this.noiseBuffer = null;
    this.initialized = false;
  }

  AudioEngine.prototype.init = function () {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(function () {});
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      refs.audioHint.textContent = "이 브라우저에서는 오디오를 사용할 수 없습니다";
      return;
    }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .24;
      this.master.connect(this.ctx.destination);
      this.ambient = this.ctx.createGain();
      this.ambient.gain.value = 0;
      this.ambient.connect(this.master);
      this.noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * .35), this.ctx.sampleRate);
      var data = this.noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.initialized = true;
      refs.audioHint.classList.add("hidden");
      if (state.settings.musicEnabled) this.startAmbient();
    } catch (_) {
      refs.audioHint.textContent = "오디오 초기화에 실패했습니다";
    }
  };

  AudioEngine.prototype.tone = function (frequency, start, duration, type, volume, endFrequency) {
    if (!this.ctx || !this.master) return;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    var t = this.ctx.currentTime + (start || 0);
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(frequency, t);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume || .08, t + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + .03);
    osc.onended = function () { osc.disconnect(); gain.disconnect(); };
  };

  AudioEngine.prototype.noise = function (start, duration, volume, highpass) {
    if (!this.ctx || !this.noiseBuffer) return;
    var src = this.ctx.createBufferSource();
    var filter = this.ctx.createBiquadFilter();
    var gain = this.ctx.createGain();
    var t = this.ctx.currentTime + (start || 0);
    src.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpass || 900;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume || .035, t + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + duration + .02);
    src.onended = function () { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  };

  AudioEngine.prototype.play = function (kind) {
    if (!state.settings.soundEnabled || !this.initialized || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(function () {});
    if (kind === "kanji") {
      this.tone(82, 0, .42, "sine", .07, 196);
      this.tone(392, .06, .36, "triangle", .04, 784);
      this.noise(0, .18, .025, 1300);
    } else if (kind === "reading") {
      this.tone(523.25, 0, .35, "sine", .055, 659.25);
      this.tone(1046.5, .06, .42, "sine", .025, 1318.5);
    } else if (kind === "explanation") {
      this.tone(220, 0, .48, "sine", .035, 330);
      this.tone(329.63, .05, .5, "triangle", .03, 493.88);
      this.tone(493.88, .1, .55, "sine", .02, 739.99);
    } else if (kind === "next") {
      this.noise(0, .14, .038, 700);
      this.tone(180, 0, .2, "triangle", .035, 270);
    } else if (kind === "favorite") {
      this.tone(659.25, 0, .18, "sine", .05);
      this.tone(830.61, .08, .2, "sine", .045);
      this.tone(1046.5, .16, .28, "sine", .04);
    } else if (kind === "difficult") {
      this.tone(330, 0, .22, "square", .026, 196);
      this.tone(155, .07, .3, "sine", .04, 110);
    } else {
      this.tone(720, 0, .055, "sine", .022, 620);
    }
  };

  AudioEngine.prototype.startAmbient = function () {
    if (!this.initialized || !this.ctx || this.ambientNodes.length || !state.settings.musicEnabled) return;
    var self = this;
    [55, 82.41, 110].forEach(function (freq, index) {
      var osc = self.ctx.createOscillator();
      var gain = self.ctx.createGain();
      var filter = self.ctx.createBiquadFilter();
      var lfo = self.ctx.createOscillator();
      var lfoGain = self.ctx.createGain();
      osc.type = index === 1 ? "triangle" : "sine";
      osc.frequency.value = freq;
      filter.type = "lowpass";
      filter.frequency.value = 380 + index * 160;
      gain.gain.value = [.055, .024, .012][index];
      lfo.frequency.value = .03 + index * .017;
      lfoGain.gain.value = gain.gain.value * .45;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      osc.connect(filter); filter.connect(gain); gain.connect(self.ambient);
      osc.start(); lfo.start();
      self.ambientNodes.push(osc, gain, filter, lfo, lfoGain);
    });
    this.ambient.gain.cancelScheduledValues(this.ctx.currentTime);
    this.ambient.gain.linearRampToValueAtTime(.32, this.ctx.currentTime + 1.8);
  };

  AudioEngine.prototype.stopAmbient = function () {
    if (!this.ctx || !this.ambient) return;
    var self = this;
    this.ambient.gain.cancelScheduledValues(this.ctx.currentTime);
    this.ambient.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + .35);
    var old = this.ambientNodes.slice();
    this.ambientNodes.length = 0;
    window.setTimeout(function () {
      old.forEach(function (node) {
        try { if (typeof node.stop === "function") node.stop(); } catch (_) {}
        try { node.disconnect(); } catch (_) {}
      });
    }, 420);
  };

  AudioEngine.prototype.resumeAmbient = function () {
    if (!this.initialized || paused || document.hidden) return;
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(function () {});
    if (state.settings.musicEnabled) this.startAmbient();
  };

  AudioEngine.prototype.suspendAmbient = function () {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(function () {});
  };

  function NeonBackground() {
    this.canvas = $("glCanvas");
    this.fallbackCanvas = $("fallbackCanvas");
    this.gl = null;
    this.ctx2d = null;
    this.mode = "none";
    this.program = null;
    this.particleProgram = null;
    this.quadBuffer = null;
    this.seedBuffer = null;
    this.seedCount = 0;
    this.shockStarted = -99;
    this.width = 0;
    this.height = 0;
    this.stars = [];
    this.resize = this.resize.bind(this);
    this.init();
    window.addEventListener("resize", this.resize, { passive: true });
  }

  NeonBackground.prototype.effectiveQuality = function () {
    if (state.settings.quality !== "auto") return state.settings.quality;
    var memory = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    return memory <= 3 || cores <= 4 ? "low" : cores >= 8 && memory >= 6 ? "high" : "medium";
  };

  NeonBackground.prototype.effectiveParticles = function () {
    var mul = { low: .38, medium: .7, high: 1 }[this.effectiveQuality()] || .7;
    if (state.settings.reducedMotion) mul *= .28;
    return Math.max(32, Math.floor(state.settings.particleCount * mul));
  };

  NeonBackground.prototype.compile = function (type, source) {
    var gl = this.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };

  NeonBackground.prototype.link = function (vertex, fragment) {
    var gl = this.gl;
    var program = gl.createProgram();
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  };

  NeonBackground.prototype.init = function () {
    try {
      this.gl = this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: this.effectiveQuality() === "high" ? "high-performance" : "low-power"
      });
      if (!this.gl) throw new Error("WebGL unavailable");
      this.mode = "webgl";
      this.setupWebGL();
      this.canvas.style.display = "block";
      this.fallbackCanvas.style.display = "none";
      var self = this;
      this.canvas.addEventListener("webglcontextlost", function (event) {
        event.preventDefault();
        self.enableFallback();
      }, false);
    } catch (_) {
      this.enableFallback();
    }
    this.resize();
  };

  NeonBackground.prototype.setupWebGL = function () {
    var vertex = [
      "attribute vec2 a_pos;",
      "void main(){ gl_Position=vec4(a_pos,0.0,1.0); }"
    ].join("\n");
    var fragment = [
      "precision mediump float;",
      "uniform vec2 u_resolution;",
      "uniform float u_time;",
      "uniform float u_shock;",
      "uniform float u_stage;",
      "float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }",
      "float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }",
      "void main(){",
      " vec2 uv=(gl_FragCoord.xy-.5*u_resolution.xy)/min(u_resolution.x,u_resolution.y);",
      " float t=u_time*.075;",
      " float r=length(uv); float a=atan(uv.y,uv.x);",
      " vec3 c=vec3(.018,.022,.07);",
      " float fog=noise(uv*2.2+vec2(t,-t*.63))*.55+noise(uv*5.1-vec2(t*.4,t*.2))*.24;",
      " vec3 v=vec3(.27,.10,.56); vec3 cy=vec3(.02,.54,.52); vec3 go=vec3(.62,.38,.08);",
      " vec3 accent=mix(v,cy,clamp(u_stage,.0,1.)); accent=mix(accent,go,clamp(u_stage-1.0,.0,1.));",
      " c+=accent*fog*.12*(1.15-r);",
      " float rings=sin(r*37.0-t*1.6+sin(a*6.0)*.25);",
      " c+=accent*smoothstep(.965,.998,rings)*.045*(1.0-smoothstep(.16,.9,r));",
      " vec2 gp=uv; gp.y+=.38; float persp=1.0/(abs(gp.y)+.28);",
      " float gx=abs(fract(gp.x*7.0*persp+.5)-.5);",
      " float gy=abs(fract(persp*1.7-t*.12)-.5);",
      " float grid=(1.0-smoothstep(.46,.5,max(gx,gy)))*smoothstep(.02,.85,-gp.y);",
      " c+=vec3(.05,.19,.24)*grid*.11;",
      " float stroke=abs(sin(uv.x*13.0+sin(uv.y*7.0+t)*2.0+a*2.0));",
      " c+=accent*smoothstep(.985,1.0,stroke)*.035;",
      " float wave=smoothstep(.045,.0,abs(r-u_shock*1.25))*step(u_shock,.999);",
      " c+=accent*wave*.42;",
      " c*=1.0-smoothstep(.66,1.15,r)*.76;",
      " gl_FragColor=vec4(pow(c,vec3(.86)),1.0);",
      "}"
    ].join("\n");
    var pVertex = [
      "precision mediump float;",
      "attribute float a_seed;",
      "uniform vec2 u_resolution;",
      "uniform float u_time;",
      "uniform float u_stage;",
      "float h(float x){ return fract(sin(x*91.73)*43758.5453); }",
      "void main(){",
      " float z=fract(h(a_seed*3.1)+u_time*(.018+h(a_seed)*.018));",
      " float ang=h(a_seed*7.3)*6.28318+u_time*(h(a_seed+4.0)-.5)*.05;",
      " float rad=(.05+h(a_seed+8.0)*.78)*(1.0-z*.72);",
      " vec2 pos=vec2(cos(ang),sin(ang))*rad;",
      " pos.x*=u_resolution.y/u_resolution.x;",
      " gl_Position=vec4(pos,0.0,1.0);",
      " gl_PointSize=(1.2+5.4*(1.0-z))*min(1.55,u_resolution.y/700.0);",
      "}"
    ].join("\n");
    var pFragment = [
      "precision mediump float;",
      "uniform float u_stage;",
      "void main(){",
      " vec2 p=gl_PointCoord-.5; float d=length(p);",
      " float a=smoothstep(.5,.05,d);",
      " vec3 v=vec3(.65,.38,1.0), c=vec3(.25,1.0,.91), g=vec3(1.0,.76,.34);",
      " vec3 col=mix(v,c,clamp(u_stage,.0,1.)); col=mix(col,g,clamp(u_stage-1.0,.0,1.));",
      " gl_FragColor=vec4(col,a*.72);",
      "}"
    ].join("\n");
    this.program = this.link(vertex, fragment);
    this.particleProgram = this.link(pVertex, pFragment);
    this.quadBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), this.gl.STATIC_DRAW);
    this.rebuildParticles();
  };

  NeonBackground.prototype.rebuildParticles = function () {
    if (this.mode !== "webgl" || !this.gl) return;
    var count = this.effectiveParticles();
    var seeds = new Float32Array(count);
    for (var i = 0; i < count; i++) seeds[i] = i + Math.random();
    if (!this.seedBuffer) this.seedBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.seedBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, seeds, this.gl.STATIC_DRAW);
    this.seedCount = count;
  };

  NeonBackground.prototype.enableFallback = function () {
    this.mode = "canvas";
    this.canvas.style.display = "none";
    this.fallbackCanvas.style.display = "block";
    this.ctx2d = this.fallbackCanvas.getContext("2d");
    this.stars = [];
    var count = this.effectiveParticles();
    for (var i = 0; i < count; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random() });
    }
  };

  NeonBackground.prototype.configure = function (rebuild) {
    if (rebuild && this.mode === "webgl") this.rebuildParticles();
    if (rebuild && this.mode === "canvas") this.enableFallback();
    this.resize();
  };

  NeonBackground.prototype.resize = function () {
    var q = this.effectiveQuality();
    var cap = q === "high" ? 1.6 : q === "medium" ? 1.3 : 1;
    if (state.settings.reducedMotion) cap = Math.min(cap, 1);
    var dpr = Math.min(window.devicePixelRatio || 1, cap);
    var w = Math.max(1, Math.floor(innerWidth * dpr));
    var h = Math.max(1, Math.floor(innerHeight * dpr));
    var canvas = this.mode === "webgl" ? this.canvas : this.fallbackCanvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    }
    this.width = w; this.height = h;
    if (this.gl && this.mode === "webgl") this.gl.viewport(0, 0, w, h);
  };

  NeonBackground.prototype.triggerShock = function () {
    this.shockStarted = performance.now() / 1000;
  };

  NeonBackground.prototype.stageUniform = function () {
    return stageIndex === 0 ? 2 : stageIndex === 1 ? 1 : 0;
  };

  NeonBackground.prototype.renderWebGL = function (seconds) {
    var gl = this.gl;
    var shockAge = seconds - this.shockStarted;
    var shock = shockAge >= 0 && shockAge < .9 ? shockAge / .9 : 1;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    var pos = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_resolution"), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_time"), state.settings.reducedMotion ? seconds * .12 : seconds);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_shock"), shock);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_stage"), this.stageUniform());
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.particleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    var seed = gl.getAttribLocation(this.particleProgram, "a_seed");
    gl.enableVertexAttribArray(seed);
    gl.vertexAttribPointer(seed, 1, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(this.particleProgram, "u_resolution"), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram, "u_time"), state.settings.reducedMotion ? seconds * .08 : seconds);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram, "u_stage"), this.stageUniform());
    gl.drawArrays(gl.POINTS, 0, this.seedCount);
    gl.disable(gl.BLEND);
  };

  NeonBackground.prototype.renderCanvas = function (seconds) {
    var ctx = this.ctx2d;
    if (!ctx) return;
    var dpr = this.width / innerWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var grad = ctx.createRadialGradient(innerWidth * .5, innerHeight * .43, 10, innerWidth * .5, innerHeight * .48, Math.max(innerWidth, innerHeight) * .8);
    grad.addColorStop(0, stageIndex === 1 ? "#102b38" : stageIndex === 2 ? "#231a46" : "#372413");
    grad.addColorStop(.45, "#0a0d24");
    grad.addColorStop(1, "#03040c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    var t = state.settings.reducedMotion ? seconds * .05 : seconds;
    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight * .45);
    ctx.strokeStyle = stageIndex === 1 ? "rgba(101,245,233,.10)" : stageIndex === 2 ? "rgba(163,117,255,.10)" : "rgba(255,215,135,.10)";
    for (var r = 70; r < Math.max(innerWidth, innerHeight) * .6; r += 48) {
      ctx.beginPath();
      ctx.arc(0, 0, r + Math.sin(t * .3 + r) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.z = (s.z + (state.settings.reducedMotion ? .00004 : .00022)) % 1;
      var scale = .35 + s.z * 1.4;
      var x = (s.x - .5) * innerWidth * scale + innerWidth / 2;
      var y = (s.y - .5) * innerHeight * scale + innerHeight / 2;
      ctx.globalAlpha = .2 + s.z * .65;
      ctx.fillStyle = i % 3 === 0 ? "#65f5e9" : i % 3 === 1 ? "#a375ff" : "#ffd787";
      ctx.fillRect(x, y, 1 + s.s * 1.6, 1 + s.s * 1.6);
    }
    ctx.globalAlpha = 1;
  };

  NeonBackground.prototype.render = function (seconds) {
    if (document.hidden) return;
    if (this.mode === "webgl" && this.gl) this.renderWebGL(seconds);
    else this.renderCanvas(seconds);
  };

  var particles = new ParticleOverlay(refs.fxCanvas);
  var audio = new AudioEngine();
  var background = new NeonBackground();

  function animationFrame(now) {
    if (!lastFrameTime) lastFrameTime = now;
    var deltaMs = clamp(now - lastFrameTime, 0, 80);
    lastFrameTime = now;
    if (!document.hidden) {
      if (!paused && !refs.dialog.open) {
        stageElapsedMs += deltaMs;
        state.totalStudyMs += deltaMs;
        saveAccumulator += deltaMs;
        advanceTimeline();
        if (saveAccumulator >= 10000) {
          saveAccumulator = 0;
          saveState();
        }
      }
      updateProgress();
      particles.render(deltaMs / 1000);
      background.render(now / 1000);
    }
    requestAnimationFrame(animationFrame);
  }

  function handleVisibility() {
    lastFrameTime = performance.now();
    if (document.hidden) {
      audio.suspendAmbient();
      releaseWakeLock();
      saveState();
    } else {
      if (!paused) audio.resumeAmbient();
      if (state.settings.wakeLockEnabled) requestWakeLock();
    }
  }

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", saveState);
  window.addEventListener("beforeunload", saveState);
  window.addEventListener("resize", function () {
    lastFrameTime = performance.now();
    particles.resize();
    background.resize();
  }, { passive: true });

  window.addEventListener("pointerdown", function activateAudio() {
    audio.init();
    if (state.settings.wakeLockEnabled) requestWakeLock();
    window.removeEventListener("pointerdown", activateAudio, true);
  }, true);

  bindSettings();
  bindControls();
  applySettings();

  if (state.queue && state.queue.ids[state.queue.cursor] && validId(state.queue.ids[state.queue.cursor])) {
    setCurrentQuestion(state.queue.ids[state.queue.cursor]);
  } else {
    var first = nextQueueId();
    setCurrentQuestion(first || 1);
  }
  updateStats();
  requestAnimationFrame(animationFrame);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () {
        showToast("오프라인 캐시를 등록하지 못했습니다.");
      });
    });
  }
})();
