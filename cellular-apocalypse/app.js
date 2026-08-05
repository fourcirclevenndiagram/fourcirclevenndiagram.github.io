/* CELLULAR APOCALYPSE — mobile spectator client */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const TEAM_COLORS = ['#17202d', '#ff3b21', '#ffe638', '#42f06f', '#28a8ff'];
  const TEAM_NAMES = ['', 'EMBER', 'VOLT', 'BLOOM', 'TIDE'];
  const TEAM_KO = ['', '빨강', '노랑', '초록', '파랑'];
  const STORAGE_KEY = 'cellular-apocalypse-settings-v2';
  const DEFAULTS = {
    mapSize: 100,
    speed: 1,
    quality: 'auto',
    sound: true,
    vibration: true,
    autoCamera: true,
    performance: false,
    debug: 'faction',
    disasterFrequency: 'normal',
    duration: 300,
    recentSeed: '',
    wins: [0, 0, 0, 0, 0]
  };

  let settings = loadSettings();
  let worker;
  let renderer;
  let fx;
  let sound;
  let latestFrame = null;
  let currentSeed = '';
  let currentMatchSerial = 0;
  let paused = false;
  let loadingReady = false;
  let manualDisasters = 3;
  let disasterPending = false;
  let resultState = null;
  let resultTimer = 0;
  let resultStartedAt = 0;
  let toastTimer = 0;
  let broadcastTimer = 0;
  let frameCounter = 0;
  let fpsClock = performance.now();
  let measuredFps = 60;
  let adaptiveLevel = 1;
  let adaptiveClock = performance.now();

  const camera = {
    x: .5, y: .5, zoom: 1,
    targetX: .5, targetY: .5, targetZoom: 1,
    shake: 0, auto: settings.autoCamera,
    focusUntil: 0, manualUntil: 0, minStayUntil: 0,
    focusName: ''
  };

  const debugModes = { faction: 0, temperature: 1, moisture: 2, nutrient: 3, charge: 4, conductivity: 5, height: 6, pollution: 7, change: 8, strategy: 9 };

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const merged = { ...DEFAULTS, ...raw };
      if (![80, 100, 120].includes(+merged.mapSize)) merged.mapSize = 100;
      if (![1, 2, 4].includes(+merged.speed)) merged.speed = 1;
      if (!Array.isArray(merged.wins) || merged.wins.length < 5) merged.wins = [...DEFAULTS.wins];
      return merged;
    } catch (_) { return { ...DEFAULTS, wins: [...DEFAULTS.wins] }; }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* private mode */ }
  }

  function init() {
    bindSettings();
    bindControls();
    renderer = new BattlefieldRenderer($('glCanvas'));
    fx = new EffectRenderer($('fxCanvas'));
    sound = new SynthSound();
    setQuality(settings.quality, true);
    setSpeed(settings.speed, false);
    setAutoCamera(settings.autoCamera, false);
    setDebugMode(settings.debug);
    updateCareerStats();
    resizeAll();
    window.addEventListener('resize', resizeAll, { passive: true });
    window.visualViewport?.addEventListener('resize', resizeAll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('pointerdown', unlockSound, { once: true, passive: true });
    setupGestures();
    startWorker();
    requestAnimationFrame(renderLoop);
    registerServiceWorker();
  }

  function startWorker() {
    if (!('Worker' in window)) {
      fatalLoading('이 브라우저는 백그라운드 시뮬레이션을 지원하지 않습니다.');
      return;
    }
    try {
      worker = new Worker('./simulation-worker.js');
      worker.onmessage = handleWorkerMessage;
      worker.onerror = event => {
        console.error('Simulation worker error:', event.message);
        fatalLoading('시뮬레이션 엔진을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      };
      worker.postMessage({
        type: 'init', size: settings.mapSize, duration: settings.duration,
        disasterFrequency: settings.disasterFrequency,
        seed: settings.recentSeed || undefined
      });
      worker.postMessage({ type: 'speed', value: settings.speed });
      animateLoading();
    } catch (error) {
      console.error(error);
      fatalLoading('시뮬레이션을 시작할 수 없습니다.');
    }
  }

  function animateLoading() {
    const started = performance.now();
    const tick = () => {
      if (loadingReady) return;
      const progress = Math.min(88, 8 + (performance.now() - started) / 26);
      setLoading(progress, progress < 30 ? '절차적 지형 생성' : progress < 58 ? '환경 배열 배양' : '네 물질 코어 배치');
      requestAnimationFrame(tick);
    };
    tick();
  }

  function setLoading(percent, text) {
    $('loadingBar').style.width = `${percent}%`;
    $('loadingText').textContent = `${text} · ${Math.round(percent)}%`;
  }

  function finishLoading() {
    if (loadingReady) return;
    loadingReady = true;
    setLoading(100, renderer.mode === 'webgl2' ? 'WebGL2 생태계 활성화' : 'Canvas 호환 모드 활성화');
    setTimeout(() => {
      $('app').hidden = false;
      resizeAll();
      $('loading').classList.add('done');
      setTimeout(() => $('loading').hidden = true, 650);
    }, 320);
  }

  function fatalLoading(message) {
    $('loadingText').textContent = message;
    $('loadingBar').style.width = '100%';
    $('loadingBar').style.background = '#ff3b21';
  }

  function handleWorkerMessage({ data }) {
    if (!data || !data.type) return;
    if (data.type === 'ready') {
      currentSeed = data.seed;
      currentMatchSerial = data.matchSerial;
      settings.recentSeed = currentSeed;
      saveSettings();
      $('seedLabel').textContent = currentSeed;
      renderer.setMapSize(data.size);
      finishLoading();
    } else if (data.type === 'frame') {
      latestFrame = {
        ...data,
        stateData: new Uint8Array(data.stateData),
        envData: new Uint8Array(data.envData),
        detailData: new Uint8Array(data.detailData)
      };
      renderer.uploadFrame(latestFrame);
      updateHud(latestFrame);
      sound.updateMix(latestFrame.teams);
    } else if (data.type === 'event') {
      handleSimulationEvent(data.event);
    } else if (data.type === 'disasterResult') {
      disasterPending = false;
      if (data.ok) {
        manualDisasters = Math.max(0, manualDisasters - 1);
        updateDisasterCount();
        closeSheets();
      }
    } else if (data.type === 'gameover') {
      showResults(normalizeResult(data.result));
    } else if (data.type === 'balanceResult') {
      console.table({ EMBER: data.report.wins[0], VOLT: data.report.wins[1], BLOOM: data.report.wins[2], TIDE: data.report.wins[3] });
      console.info('CELLULAR balance test', data.report);
      showToast(`자동 밸런스 테스트 완료 · ${data.report.count}개 시드`);
    }
  }

  function normalizeResult(result) {
    return {
      ...result,
      timelapse: (result.timelapse || []).map(buffer => new Uint8Array(buffer))
    };
  }

  function updateHud(frame) {
    let leaderId = 0;
    let bestShare = -1;
    for (const t of frame.teams) {
      const pct = t.share * 100;
      $(`pct${t.id}`).textContent = `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
      $(`bar${t.id}`).style.width = `${Math.min(100, pct)}%`;
      $(`energy${t.id}`).textContent = Math.floor(t.energy);
      $(`cores${t.id}`).textContent = t.cores;
      const card = document.querySelector(`.team-card[data-team="${t.id}"]`);
      card.style.opacity = t.active ? '1' : '.34';
      if (t.share > bestShare) { bestShare = t.share; leaderId = t.id; }
    }
    document.querySelectorAll('.team-card').forEach(card => card.classList.toggle('leading', +card.dataset.team === leaderId));
    $('timeLabel').textContent = formatTime(frame.elapsed);
    $('phaseLabel').textContent = ['생태전', '외곽 붕괴', '자원 고갈', '중앙 폭주', '최후 가속'][frame.phase] || '생태전';
    $('phaseLabel').style.color = frame.phase ? '#ff796d' : '#ffbf42';
    $('tpsLabel').textContent = frame.tps || '--';
    $('cellsLabel').textContent = frame.active.toLocaleString();
  }

  function handleSimulationEvent(event) {
    setBroadcast(event.text);
    fx.addEvent(event, latestFrame?.size || settings.mapSize);
    sound.playEvent(event.kind, event.importance, event.team);
    if (settings.vibration && event.importance >= 2.2 && navigator.vibrate) {
      navigator.vibrate(event.kind === 'coreDestroyed' ? [35, 35, 75] : 28);
    }
    if (event.importance >= 2.55 && worker) worker.postMessage({ type: 'cinematic', scale: .28, duration: 1250 });
    camera.shake = Math.max(camera.shake, event.importance >= 2.8 ? .024 : event.importance >= 2 ? .012 : .004);
    if (camera.auto && performance.now() > camera.manualUntil && event.importance >= 1.35) directCamera(event);
  }

  function directCamera(event) {
    const now = performance.now();
    if (now < camera.minStayUntil && event.importance < 2.5) return;
    const mapSize = latestFrame?.size || settings.mapSize;
    camera.targetX = clamp(event.x / mapSize, .05, .95);
    camera.targetY = clamp(event.y / mapSize, .05, .95);
    camera.targetZoom = clamp(1.45 + event.importance * .48, 1.55, 3.25);
    camera.focusUntil = now + 2300 + event.importance * 420;
    camera.minStayUntil = now + 1500;
    camera.focusName = focusLabel(event.kind);
    $('focusName').textContent = camera.focusName;
    $('focusBadge').hidden = false;
  }

  function focusLabel(kind) {
    if (kind.includes('core')) return '코어 교전';
    if (kind === 'chainLightning') return '연쇄 번개';
    if (kind === 'flameStorm') return '화염 폭풍';
    if (kind === 'grandBloom') return '대개화';
    if (kind === 'flood') return '대범람';
    if (kind === 'steamBurst') return '수증기 폭발';
    if (kind.startsWith('disaster')) return '세계 재난';
    if (kind === 'leaderChange') return '선두 교체';
    return '격전 지역';
  }

  function setBroadcast(text) {
    const el = $('broadcastText');
    el.classList.add('changing');
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      el.textContent = text;
      el.classList.remove('changing');
    }, 155);
  }

  function bindControls() {
    $('pauseButton').addEventListener('click', togglePause);
    document.querySelectorAll('.speed-control button').forEach(button => button.addEventListener('click', () => setSpeed(+button.dataset.speed, true)));
    $('mapButton').addEventListener('click', showWholeMap);
    $('cameraButton').addEventListener('click', () => setAutoCamera(!camera.auto, true));
    $('disasterButton').addEventListener('click', () => openSheet('disasterSheet'));
    $('settingsButton').addEventListener('click', () => openSheet('settingsSheet'));
    $('backdrop').addEventListener('click', closeSheets);
    document.querySelectorAll('.close-sheet').forEach(button => button.addEventListener('click', closeSheets));
    $('seedButton').addEventListener('click', copySeed);
    $('newMatchButton').addEventListener('click', () => startNewMatch(false));
    $('sameSeedButton').addEventListener('click', () => startNewMatch(true));
    $('instantReplayButton').addEventListener('click', () => startNewMatch(false));
    $('seedReplayButton').addEventListener('click', () => startNewMatch(true));
    $('disasterGrid').addEventListener('click', event => {
      const button = event.target.closest('button[data-disaster]');
      if (!button || button.disabled || disasterPending) return;
      if (manualDisasters <= 0) { showToast('이번 경기의 재난 개입을 모두 사용했습니다.'); return; }
      disasterPending = true;
      worker?.postMessage({ type: 'disaster', disaster: button.dataset.disaster });
    });
    window.addEventListener('keydown', event => {
      if (event.key === ' ' && !event.repeat && $('resultOverlay').hidden) { event.preventDefault(); togglePause(); }
      if (event.key === 'Escape') closeSheets();
      if (event.key === '1' || event.key === '2' || event.key === '4') setSpeed(+event.key, true);
    });
  }

  function bindSettings() {
    $('mapSizeSetting').value = settings.mapSize;
    $('qualitySetting').value = settings.quality;
    $('durationSetting').value = settings.duration;
    $('disasterFrequencySetting').value = settings.disasterFrequency;
    $('autoCameraSetting').checked = settings.autoCamera;
    $('soundSetting').checked = settings.sound;
    $('vibrationSetting').checked = settings.vibration;
    $('performanceSetting').checked = settings.performance;
    $('debugSetting').value = settings.debug;
    $('performance').hidden = !settings.performance;

    $('mapSizeSetting').addEventListener('change', event => { settings.mapSize = +event.target.value; saveSettings(); });
    $('qualitySetting').addEventListener('change', event => { settings.quality = event.target.value; setQuality(settings.quality); saveSettings(); });
    $('durationSetting').addEventListener('change', event => { settings.duration = +event.target.value; saveSettings(); });
    $('disasterFrequencySetting').addEventListener('change', event => { settings.disasterFrequency = event.target.value; saveSettings(); });
    $('autoCameraSetting').addEventListener('change', event => { setAutoCamera(event.target.checked, true); });
    $('soundSetting').addEventListener('change', event => {
      settings.sound = event.target.checked; saveSettings();
      if (settings.sound) sound?.enable(); else sound?.disable();
    });
    $('vibrationSetting').addEventListener('change', event => { settings.vibration = event.target.checked; saveSettings(); });
    $('performanceSetting').addEventListener('change', event => { settings.performance = event.target.checked; $('performance').hidden = !settings.performance; saveSettings(); });
    $('debugSetting').addEventListener('change', event => { settings.debug = event.target.value; setDebugMode(settings.debug); saveSettings(); });
  }

  function togglePause() {
    paused = !paused;
    worker?.postMessage({ type: 'pause', value: paused });
    $('pauseBadge').hidden = !paused;
    $('pauseButton').classList.toggle('playing', paused);
    $('pauseButton').querySelector('small').textContent = paused ? '재생' : '정지';
    $('pauseButton').setAttribute('aria-label', paused ? '재생' : '일시정지');
    if (paused) sound?.setPaused(true); else sound?.setPaused(false);
  }

  function setSpeed(value, persist) {
    if (![1, 2, 4].includes(value)) value = 1;
    settings.speed = value;
    if (persist) saveSettings();
    document.querySelectorAll('.speed-control button').forEach(button => button.classList.toggle('active', +button.dataset.speed === value));
    $('speedLabel').textContent = `${value}×`;
    worker?.postMessage({ type: 'speed', value });
  }

  function setAutoCamera(value, persist) {
    camera.auto = !!value;
    settings.autoCamera = camera.auto;
    $('cameraButton').classList.toggle('active', camera.auto);
    $('cameraButton').querySelector('small').textContent = camera.auto ? '자동' : '수동';
    $('autoCameraSetting').checked = camera.auto;
    if (persist) saveSettings();
    if (camera.auto) {
      camera.manualUntil = 0;
      camera.focusUntil = performance.now() + 1000;
      showToast('자동 카메라 감독이 사건을 추적합니다.');
    } else showToast('수동 카메라로 전환했습니다.');
  }

  function setQuality(mode, initial = false) {
    adaptiveLevel = mode === 'low' ? 0 : mode === 'high' ? 2 : 1;
    renderer?.setQuality(adaptiveLevel);
    fx?.setQuality(adaptiveLevel);
    if (!initial) showToast(mode === 'auto' ? '기기 성능에 맞춰 품질을 자동 조절합니다.' : `그래픽 품질: ${$('qualitySetting').selectedOptions[0].textContent}`);
  }

  function setDebugMode(mode) {
    renderer?.setDebugMode(debugModes[mode] ?? 0);
    fx?.setShowStrategies(mode === 'strategy');
  }

  function showWholeMap() {
    camera.targetX = .5; camera.targetY = .5; camera.targetZoom = 1;
    camera.manualUntil = performance.now() + 6200;
    camera.focusUntil = 0;
    $('focusBadge').hidden = true;
  }

  function openSheet(id) {
    closeSheets();
    $(id).hidden = false;
    $('backdrop').hidden = false;
    if (id === 'disasterSheet') updateDisasterCount();
  }

  function closeSheets() {
    $('disasterSheet').hidden = true;
    $('settingsSheet').hidden = true;
    $('backdrop').hidden = true;
  }

  function updateDisasterCount() {
    $('disasterCount').textContent = manualDisasters;
    $('sheetDisasterCount').textContent = `${manualDisasters}회`;
    $('disasterGrid').querySelectorAll('button').forEach(button => button.disabled = manualDisasters <= 0);
  }

  async function copySeed(event) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(currentSeed);
      showToast(`시드 ${currentSeed} 복사 완료`);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = currentSeed; document.body.appendChild(area); area.select();
      document.execCommand('copy'); area.remove();
      showToast(`시드 ${currentSeed} 복사 완료`);
    }
  }

  function startNewMatch(sameSeed) {
    clearInterval(resultTimer);
    resultTimer = 0;
    resultState = null;
    $('resultOverlay').hidden = true;
    closeSheets();
    manualDisasters = 3;
    updateDisasterCount();
    paused = false;
    $('pauseBadge').hidden = true;
    $('pauseButton').classList.remove('playing');
    $('pauseButton').querySelector('small').textContent = '정지';
    camera.x = camera.targetX = .5;
    camera.y = camera.targetY = .5;
    camera.zoom = camera.targetZoom = 1;
    camera.focusUntil = 0;
    fx.clear();
    setBroadcast('새로운 생태계를 절차적으로 생성합니다.');
    const seed = sameSeed ? currentSeed : undefined;
    worker?.postMessage({ type: 'restart', size: settings.mapSize, duration: settings.duration, disasterFrequency: settings.disasterFrequency, seed });
    worker?.postMessage({ type: 'speed', value: settings.speed });
  }

  function showResults(result) {
    resultState = result;
    resultStartedAt = performance.now();
    settings.wins[result.winner] = (settings.wins[result.winner] || 0) + 1;
    saveSettings();
    updateCareerStats();
    const color = TEAM_COLORS[result.winner];
    $('winnerSigil').style.color = color;
    $('resultTitle').style.color = color;
    $('resultTitle').textContent = `${result.winnerName} 승리`;
    $('resultReason').textContent = result.reason;
    $('resultSeed').textContent = `SEED ${result.seed}`;
    $('resultDuration').textContent = formatTime(result.elapsed);
    const winnerTeam = result.teams.find(t => t.id === result.winner);
    const kills = Math.max(...result.teams.map(t => t.coreKills));
    $('resultStats').innerHTML = [
      ['최종 점유율', `${(winnerTeam.share * 100).toFixed(1)}%`],
      ['최고 점유율', `${(winnerTeam.peak * 100).toFixed(1)}%`],
      ['코어 파괴', `${kills}회`],
      ['최대 연쇄', result.maxChain ? `${result.maxChain}셀` : '—'],
      ['최대 역전폭', `${(result.maxSwing * 100).toFixed(1)}%`],
      ['발생 재난', `${result.disasterCount}회`]
    ].map(([label, value]) => `<div class="result-stat"><span>${label}</span><b>${value}</b></div>`).join('');
    $('resultOverlay').hidden = false;
    drawHistoryChart(result);
    updateResultCountdown();
    clearInterval(resultTimer);
    resultTimer = setInterval(updateResultCountdown, 100);
    sound.playVictory(result.winner);
  }

  function updateResultCountdown() {
    const elapsedMs = performance.now() - resultStartedAt;
    const remaining = Math.max(0, 11000 - elapsedMs);
    $('countdownNumber').textContent = Math.ceil(remaining / 1000);
    $('countdownBar').style.transform = `scaleX(${remaining / 11000})`;
    if (remaining <= 0) startNewMatch(false);
  }

  function drawHistoryChart(result) {
    const canvas = $('historyChart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    for (let y = 1; y < 4; y++) { ctx.beginPath(); ctx.moveTo(0, y * h / 4); ctx.lineTo(w, y * h / 4); ctx.stroke(); }
    const hist = result.history || [];
    if (hist.length < 2) return;
    const maxTime = hist[hist.length - 1].time || 1;
    for (let t = 1; t <= 4; t++) {
      ctx.beginPath();
      hist.forEach((point, index) => {
        const x = point.time / maxTime * w;
        const y = h - point.shares[t - 1] * h * 1.1 - 4;
        if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = TEAM_COLORS[t];
      ctx.shadowColor = TEAM_COLORS[t];
      ctx.shadowBlur = 5;
      ctx.lineWidth = t === result.winner ? 3 : 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function updateCareerStats() {
    for (let t = 1; t <= 4; t++) $(`wins${t}`).textContent = settings.wins[t] || 0;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function showToast(text) {
    const toast = $('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function unlockSound() {
    if (settings.sound) sound?.enable();
  }

  function handleVisibility() {
    worker?.postMessage({ type: 'visibility', hidden: document.hidden, paused });
    if (!document.hidden) {
      renderer?.requestRestore();
      sound?.setPaused(paused);
    } else sound?.setPaused(true);
  }

  function resizeAll() {
    renderer?.resize();
    fx?.resize();
    if (!$('app').hidden) document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
  }

  function setupGestures() {
    const frame = $('battleFrame');
    const pointers = new Map();
    let gesture = null;
    let lastTap = 0;

    frame.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      frame.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: performance.now() });
      if (pointers.size === 1) gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, cameraX: camera.targetX, cameraY: camera.targetY, moved: false };
      else if (pointers.size === 2) {
        const points = [...pointers.values()];
        gesture = { type: 'pinch', distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom: camera.targetZoom };
      }
      camera.manualUntil = performance.now() + 8000;
    });

    frame.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      const p = pointers.get(event.pointerId);
      p.x = event.clientX; p.y = event.clientY;
      const rect = frame.getBoundingClientRect();
      if (pointers.size === 1 && gesture?.type === 'pan') {
        const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
        if (Math.hypot(dx, dy) > 5) gesture.moved = true;
        camera.targetX = gesture.cameraX - dx / rect.width / camera.targetZoom;
        camera.targetY = gesture.cameraY - dy / rect.height / camera.targetZoom;
        clampCamera();
      } else if (pointers.size >= 2) {
        const points = [...pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (gesture?.type !== 'pinch') gesture = { type: 'pinch', distance, zoom: camera.targetZoom };
        camera.targetZoom = clamp(gesture.zoom * distance / Math.max(20, gesture.distance), 1, 4.5);
        clampCamera();
      }
    });

    const endPointer = event => {
      if (!pointers.has(event.pointerId)) return;
      const p = pointers.get(event.pointerId);
      const wasTap = pointers.size === 1 && gesture?.type === 'pan' && !gesture.moved && performance.now() - p.time < 350;
      pointers.delete(event.pointerId);
      if (wasTap) {
        const now = performance.now();
        if (now - lastTap < 300) {
          showWholeMap();
          lastTap = 0;
        } else {
          lastTap = now;
          focusTappedPoint(event.clientX, event.clientY);
        }
      }
      if (pointers.size === 1) {
        const one = [...pointers.values()][0];
        gesture = { type: 'pan', startX: one.x, startY: one.y, cameraX: camera.targetX, cameraY: camera.targetY, moved: true };
      } else if (!pointers.size) gesture = null;
    };
    frame.addEventListener('pointerup', endPointer);
    frame.addEventListener('pointercancel', endPointer);
    frame.addEventListener('wheel', event => {
      event.preventDefault();
      camera.targetZoom = clamp(camera.targetZoom * Math.exp(-event.deltaY * .0012), 1, 4.5);
      camera.manualUntil = performance.now() + 8000;
      clampCamera();
    }, { passive: false });
  }

  function focusTappedPoint(clientX, clientY) {
    const rect = $('battleFrame').getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;
    camera.targetX += (sx - .5) / camera.targetZoom;
    camera.targetY += (sy - .5) / camera.targetZoom;
    camera.targetZoom = Math.max(camera.targetZoom, 2.1);
    camera.focusUntil = performance.now() + 4200;
    camera.focusName = '선택 구역';
    $('focusName').textContent = '선택 구역';
    $('focusBadge').hidden = false;
    clampCamera();
  }

  function clampCamera() {
    const half = .5 / camera.targetZoom;
    camera.targetX = clamp(camera.targetX, half, 1 - half);
    camera.targetY = clamp(camera.targetY, half, 1 - half);
  }

  function updateCamera(now) {
    if (camera.auto && now > camera.manualUntil && now > camera.focusUntil) {
      camera.targetX = .5; camera.targetY = .5; camera.targetZoom = 1;
      $('focusBadge').hidden = true;
    } else if (now > camera.focusUntil && now > camera.manualUntil) $('focusBadge').hidden = true;
    clampCamera();
    const ease = 1 - Math.pow(.0007, 1 / 60);
    camera.x += (camera.targetX - camera.x) * ease;
    camera.y += (camera.targetY - camera.y) * ease;
    camera.zoom += (camera.targetZoom - camera.zoom) * ease;
    camera.shake *= .91;
  }

  function renderLoop(now) {
    updateCamera(now);
    const shakeX = (Math.random() - .5) * camera.shake;
    const shakeY = (Math.random() - .5) * camera.shake;
    const view = { x: camera.x + shakeX, y: camera.y + shakeY, zoom: camera.zoom };
    renderer?.draw(now, view);
    fx?.draw(now, view, latestFrame);
    if (resultState) drawTimelapse(now, resultState);
    measurePerformance(now);
    requestAnimationFrame(renderLoop);
  }

  function drawTimelapse(now, result) {
    const frames = result.timelapse;
    if (!frames?.length) return;
    const canvas = $('timelapseCanvas');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const frame = frames[Math.floor((now - resultStartedAt) / 115) % frames.length];
    const ctx = canvas.getContext('2d');
    const off = drawTimelapse.off || (drawTimelapse.off = document.createElement('canvas'));
    off.width = off.height = 48;
    const octx = off.getContext('2d');
    const image = octx.createImageData(48, 48);
    for (let i = 0, p = 0; i < frame.length; i++, p += 4) {
      const f = frame[i];
      const rgb = f === 1 ? [255, 43, 22] : f === 2 ? [255, 224, 39] : f === 3 ? [39, 235, 91] : f === 4 ? [26, 143, 255] : f === 5 ? [0, 0, 0] : [7, 12, 20];
      image.data[p] = rgb[0]; image.data[p + 1] = rgb[1]; image.data[p + 2] = rgb[2]; image.data[p + 3] = 255;
    }
    octx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const scale = Math.max(w / 48, h / 48);
    const dw = 48 * scale, dh = 48 * scale;
    ctx.drawImage(off, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function measurePerformance(now) {
    frameCounter++;
    if (now - fpsClock >= 1000) {
      measuredFps = Math.round(frameCounter * 1000 / (now - fpsClock));
      frameCounter = 0; fpsClock = now;
      $('fpsLabel').textContent = measuredFps;
      $('particlesLabel').textContent = fx?.particles.length || 0;
    }
    if (settings.quality === 'auto' && now - adaptiveClock > 4500) {
      adaptiveClock = now;
      const desired = measuredFps < 34 ? 0 : measuredFps > 53 ? 2 : 1;
      if (desired !== adaptiveLevel) {
        adaptiveLevel = desired;
        renderer?.setQuality(adaptiveLevel);
        fx?.setQuality(adaptiveLevel);
      }
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration skipped:', error.message)));
    }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  class BattlefieldRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.size = 100;
      this.quality = 1;
      this.debugMode = 0;
      this.frame = null;
      this.dirty = false;
      this.mode = 'canvas2d';
      this.gl = null;
      this.ctx = null;
      this.lost = false;
      this.init();
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.initWebGL(); this.dirty = true; });
    }

    init() {
      try { this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (_) { this.gl = null; }
      if (this.gl) { this.mode = 'webgl2'; this.initWebGL(); }
      else { this.mode = 'canvas2d'; this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true }); }
    }

    initWebGL() {
      const gl = this.gl;
      if (!gl) return;
      const vertex = `#version 300 es
        in vec2 aPosition;
        out vec2 vUv;
        void main(){ vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition,0.,1.); }`;
      const fragment = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        uniform sampler2D uState;
        uniform sampler2D uEnv;
        uniform sampler2D uDetail;
        uniform vec2 uCamera;
        uniform float uZoom;
        uniform float uTime;
        uniform vec2 uTexel;
        uniform int uDebug;

        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
        float teamOf(vec4 s){ if(s.r>.97) return 5.; return floor(s.r*255./48.+.5); }
        vec3 heatmap(float v){ return mix(vec3(.02,.12,.55), mix(vec3(.15,.9,.75),vec3(1.,.04,.01),smoothstep(.35,1.,v)), smoothstep(.1,.68,v)); }
        vec3 factionColor(vec2 uv){
          vec4 s=texture(uState,uv); vec4 e=texture(uEnv,uv); vec4 d=texture(uDetail,uv);
          float t=teamOf(s), m=s.g, mat=floor(s.b*255./30.+.5), change=s.a;
          if(t>4.5) return vec3(0.);
          vec3 neutral=vec3(.012,.022,.038)+e.r*vec3(.038,.047,.058)+d.r*vec3(.015,.024,.009);
          if(mat>2.5&&mat<3.5) neutral+=vec3(.005,.035,.075)*e.b;
          if(mat>.5&&mat<1.5) neutral+=vec3(.035,.038,.048);
          vec2 cell=uv/uTexel;
          float n=hash(floor(cell));
          vec3 c=neutral;
          if(t>.5&&t<1.5){
            float flame=.72+.28*sin(cell.y*.62-uTime*4.2+n*6.28);
            c=vec3(1.,.055,.008)*(m*(.56+e.g*.6)*flame)+vec3(.18,.008,0.)*e.g;
          }else if(t>1.5&&t<2.5){
            float arc=pow(max(0.,sin(cell.x*.93+cell.y*1.71+uTime*8.)),18.);
            c=vec3(1.,.72,.015)*m*(.65+d.g*.35)+vec3(1.,.94,.5)*(arc*e.a);
          }else if(t>2.5&&t<3.5){
            float veins=.78+.22*sin(length(fract(cell*.19)-.5)*24.-uTime*1.4+n*2.);
            c=vec3(.012,1.,.12)*m*(.56+d.r*.42)*veins+vec3(.0,.11,.035);
          }else if(t>3.5&&t<4.5){
            float wave=.75+.25*sin(cell.x*.48+cell.y*.34-uTime*2.7+e.r*9.);
            c=vec3(.008,.32,1.)*m*(.52+e.b*.53)*wave+vec3(.0,.045,.15);
          }
          c=mix(neutral,c,clamp(m*.9+.18,0.,1.));
          c+=c*change*.45;
          float hL=texture(uEnv,uv-vec2(uTexel.x,0)).r, hR=texture(uEnv,uv+vec2(uTexel.x,0)).r;
          float hU=texture(uEnv,uv-vec2(0,uTexel.y)).r, hD=texture(uEnv,uv+vec2(0,uTexel.y)).r;
          c*=.86+clamp((hL-hR+hU-hD)*.8+.12,0.,.3);
          return c;
        }
        vec3 debugColor(vec2 uv){
          vec4 s=texture(uState,uv), e=texture(uEnv,uv), d=texture(uDetail,uv);
          float v=0.;
          if(uDebug==1) v=e.g; else if(uDebug==2) v=e.b; else if(uDebug==3) v=d.r;
          else if(uDebug==4) v=e.a; else if(uDebug==5) v=d.g; else if(uDebug==6) v=e.r;
          else if(uDebug==7) v=d.b; else v=d.a;
          if(uDebug==2) return mix(vec3(.025,.02,.01),vec3(.0,.35,1.),v);
          if(uDebug==3) return mix(vec3(.055,.025,.0),vec3(.4,1.,.08),v);
          if(uDebug==4||uDebug==5) return mix(vec3(.02,.015,.04),vec3(1.,.9,.05),v);
          if(uDebug==6) return mix(vec3(.015,.035,.07),vec3(.82,.87,.92),v);
          if(uDebug==7) return mix(vec3(.015,.04,.025),vec3(.72,.03,.82),v);
          if(uDebug==8) return mix(vec3(.01,.015,.025),vec3(1.,.16,.04),v);
          return heatmap(v);
        }
        void main(){
          vec2 uv=(vUv-.5)/uZoom+uCamera;
          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){ outColor=vec4(.003,.005,.009,1.); return; }
          vec3 c;
          if(uDebug>0&&uDebug<9) c=debugColor(uv);
          else {
            c=factionColor(uv)*.56;
            c+=factionColor(uv+vec2(uTexel.x,0.))*.11;
            c+=factionColor(uv-vec2(uTexel.x,0.))*.11;
            c+=factionColor(uv+vec2(0.,uTexel.y))*.11;
            c+=factionColor(uv-vec2(0.,uTexel.y))*.11;
          }
          float vignette=1.-dot(vUv-.5,vUv-.5)*.55;
          float grain=(hash(gl_FragCoord.xy+uTime)-.5)*.025;
          outColor=vec4(pow(max(vec3(0.),c*vignette+grain),vec3(.88)),1.);
        }`;
      try {
        this.program = this.createProgram(vertex, fragment);
        this.locations = {
          position: gl.getAttribLocation(this.program, 'aPosition'),
          state: gl.getUniformLocation(this.program, 'uState'), env: gl.getUniformLocation(this.program, 'uEnv'), detail: gl.getUniformLocation(this.program, 'uDetail'),
          camera: gl.getUniformLocation(this.program, 'uCamera'), zoom: gl.getUniformLocation(this.program, 'uZoom'), time: gl.getUniformLocation(this.program, 'uTime'), texel: gl.getUniformLocation(this.program, 'uTexel'), debug: gl.getUniformLocation(this.program, 'uDebug')
        };
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.locations.position);
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);
        this.textures = [0, 1, 2].map(unit => this.createTexture(unit));
        gl.useProgram(this.program);
        gl.uniform1i(this.locations.state, 0); gl.uniform1i(this.locations.env, 1); gl.uniform1i(this.locations.detail, 2);
        this.dirty = true;
      } catch (error) {
        console.warn('WebGL2 unavailable, switching to Canvas 2D:', error.message);
        this.gl = null; this.mode = 'canvas2d'; this.ctx = this.canvas.getContext('2d', { alpha: false });
      }
    }

    createProgram(vsSource, fsSource) {
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compilation failed');
        return shader;
      };
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'shader link failed');
      return program;
    }

    createTexture(unit) {
      const gl = this.gl, texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }

    setMapSize(size) { this.size = size; this.dirty = true; }
    setDebugMode(mode) { this.debugMode = mode; }
    setQuality(level) { this.quality = level; this.resize(); }
    uploadFrame(frame) { this.frame = frame; this.size = frame.size; this.dirty = true; }
    requestRestore() { if (this.gl && !this.gl.isContextLost()) this.dirty = true; }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const scale = this.quality === 0 ? .72 : this.quality === 2 ? 1 : .88;
      const dpr = Math.min(2, window.devicePixelRatio || 1) * scale;
      const width = Math.max(2, Math.round(rect.width * dpr));
      const height = Math.max(2, Math.round(rect.height * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      if (this.gl) this.gl.viewport(0, 0, width, height);
    }

    draw(now, cameraView) {
      if (!this.frame) return;
      this.resize();
      if (this.mode === 'webgl2' && this.gl && !this.lost) this.drawWebGL(now, cameraView);
      else this.drawCanvas(cameraView);
    }

    drawWebGL(now, view) {
      const gl = this.gl;
      if (this.dirty) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        [this.frame.stateData, this.frame.envData, this.frame.detailData].forEach((data, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.textures[unit]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        });
        this.dirty = false;
      }
      gl.useProgram(this.program);
      gl.uniform2f(this.locations.camera, view.x, view.y);
      gl.uniform1f(this.locations.zoom, view.zoom);
      gl.uniform1f(this.locations.time, now * .001);
      gl.uniform2f(this.locations.texel, 1 / this.size, 1 / this.size);
      gl.uniform1i(this.locations.debug, this.debugMode);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawCanvas(view) {
      const ctx = this.ctx;
      if (!ctx) return;
      const off = this.offscreen || (this.offscreen = document.createElement('canvas'));
      if (off.width !== this.size) { off.width = off.height = this.size; }
      const octx = off.getContext('2d');
      const image = octx.createImageData(this.size, this.size);
      const state = this.frame.stateData, env = this.frame.envData, detail = this.frame.detailData;
      for (let i = 0, p = 0; i < this.size * this.size; i++, p += 4) {
        const raw = state[p], factionId = raw === 255 ? 5 : Math.round(raw / 48), mass = state[p + 1] / 255;
        let rgb;
        if (this.debugMode > 0 && this.debugMode < 9) {
          const v = this.debugMode === 1 ? env[p + 1] : this.debugMode === 2 ? env[p + 2] : this.debugMode === 3 ? detail[p] : this.debugMode === 4 ? env[p + 3] : this.debugMode === 5 ? detail[p + 1] : this.debugMode === 6 ? env[p] : this.debugMode === 7 ? detail[p + 2] : detail[p + 3];
          rgb = this.debugRgb(this.debugMode, v / 255);
        } else rgb = factionId === 1 ? [255 * mass, 45 * mass, 12] : factionId === 2 ? [255 * mass, 220 * mass, 20] : factionId === 3 ? [20, 240 * mass, 65 * mass] : factionId === 4 ? [15, 110 * mass, 255 * mass] : factionId === 5 ? [0,0,0] : [6 + env[p] * .04, 10 + env[p] * .05, 17 + env[p] * .06];
        image.data[p] = rgb[0]; image.data[p + 1] = rgb[1]; image.data[p + 2] = rgb[2]; image.data[p + 3] = 255;
      }
      octx.putImageData(image, 0, 0);
      const source = this.size / view.zoom;
      const sx = clamp(view.x * this.size - source / 2, 0, this.size - source);
      const sy = clamp(view.y * this.size - source / 2, 0, this.size - source);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#020307'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(off, sx, sy, source, source, 0, 0, this.canvas.width, this.canvas.height);
    }

    debugRgb(mode, v) {
      if (mode === 2) return [5, 60 * v, 255 * v];
      if (mode === 3) return [30 * (1-v), 255 * v, 20];
      if (mode === 4 || mode === 5) return [255 * v, 230 * v, 12];
      if (mode === 6) return [30 + 190 * v, 45 + 190 * v, 70 + 180 * v];
      if (mode === 7) return [170 * v, 10, 190 * v];
      if (mode === 8) return [255 * v, 50 * v, 15];
      return [255 * v, 60 * (1 - Math.abs(v - .5) * 2), 255 * (1 - v)];
    }
  }

  class EffectRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.effects = [];
      this.quality = 1;
      this.maxParticles = 360;
      this.showStrategies = false;
      this.lastTime = performance.now();
      this.lastAmbient = 0;
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(rect.width * dpr)), h = Math.max(2, Math.round(rect.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    }
    setQuality(level) { this.quality = level; this.maxParticles = level === 0 ? 140 : level === 2 ? 620 : 340; }
    setShowStrategies(value) { this.showStrategies = value; }
    clear() { this.particles.length = 0; this.effects.length = 0; }
    addEvent(event, size) {
      const color = TEAM_COLORS[event.team] || (event.kind.includes('steam') ? '#d6f5ff' : '#ff695e');
      const x = event.x / size, y = event.y / size;
      if (event.path?.length) this.effects.push({ type: 'path', path: event.path.map(p => [p[0] / size, p[1] / size]), color, life: 1, max: 1, width: event.kind === 'chainLightning' ? 2.3 : 3.2 });
      this.effects.push({ type: event.warning ? 'warning' : 'ring', x, y, radius: (event.radius || 5) / size, color, life: event.warning ? 1.7 : 1.15, max: event.warning ? 1.7 : 1.15 });
      const count = Math.min(this.maxParticles / 3, Math.floor((8 + event.importance * 13) * (.55 + this.quality * .45)));
      for (let i = 0; i < count; i++) this.spawnBurst(x, y, color, event.kind, size);
    }
    spawnBurst(x, y, color, kind, size) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (.007 + Math.random() * .025) * (100 / size);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .6 + Math.random() * 1.2, max: 1.8, size: 1 + Math.random() * 2.4, color, kind });
      if (this.particles.length > this.maxParticles) this.particles.splice(0, this.particles.length - this.maxParticles);
    }
    spawnAmbient(frame) {
      if (!frame || this.particles.length >= this.maxParticles) return;
      const attempts = 8;
      for (let k = 0; k < attempts; k++) {
        const i = Math.floor(Math.random() * frame.size * frame.size), p = i * 4;
        const raw = frame.stateData[p];
        if (!raw || raw === 255 || frame.stateData[p + 1] < 100) continue;
        const t = Math.round(raw / 48);
        const x = (i % frame.size + .5) / frame.size, y = (Math.floor(i / frame.size) + .5) / frame.size;
        const kind = t === 1 ? 'spark' : t === 2 ? 'arc' : t === 3 ? 'spore' : 'droplet';
        const particle = { x, y, vx: (Math.random() - .5) * .002, vy: t === 1 ? -.008 - Math.random()*.005 : t === 3 ? -.003 : (Math.random()-.5)*.002, life: .5 + Math.random()*.8, max: 1.3, size: t === 2 ? .7 : 1+Math.random()*1.3, color: TEAM_COLORS[t], kind };
        this.particles.push(particle);
        break;
      }
    }
    mapToScreen(x, y, view) { return [((x - view.x) * view.zoom + .5) * this.canvas.width, ((y - view.y) * view.zoom + .5) * this.canvas.height]; }
    draw(now, view, frame) {
      this.resize();
      const dt = Math.min(.05, (now - this.lastTime) / 1000 || .016); this.lastTime = now;
      const ctx = this.ctx; ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (frame) this.drawCores(ctx, view, frame);
      if (this.showStrategies && frame) this.drawStrategies(ctx, view, frame);
      if (now - this.lastAmbient > (this.quality === 0 ? 90 : this.quality === 2 ? 28 : 52)) { this.lastAmbient = now; this.spawnAmbient(frame); }
      this.drawEffects(ctx, view, dt, now);
      this.drawParticles(ctx, view, dt);
    }
    drawCores(ctx, view, frame) {
      for (const core of frame.cores || []) {
        const [x, y] = this.mapToScreen(core.x / frame.size, core.y / frame.size, view);
        if (x < -30 || y < -30 || x > this.canvas.width + 30 || y > this.canvas.height + 30) continue;
        const radius = Math.max(4, this.canvas.width / frame.size * view.zoom * 1.5);
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = TEAM_COLORS[core.team]; ctx.fillStyle = TEAM_COLORS[core.team]; ctx.shadowColor = TEAM_COLORS[core.team]; ctx.shadowBlur = 12;
        ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(0, 0, radius * .52, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .55; ctx.lineWidth = Math.max(1, radius * .12); ctx.beginPath(); ctx.arc(0, 0, radius, -.5 * Math.PI, (-.5 + core.hp / 50) * Math.PI); ctx.stroke();
        ctx.globalAlpha = .28; ctx.rotate(performance.now() * .0005); ctx.strokeRect(-radius*.78, -radius*.78, radius*1.56, radius*1.56); ctx.restore();
      }
    }
    drawStrategies(ctx, view, frame) {
      ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
      for (const s of frame.strategies || []) {
        const [x, y] = this.mapToScreen(s.targetX / frame.size, s.targetY / frame.size, view);
        ctx.strokeStyle = TEAM_COLORS[s.team]; ctx.globalAlpha = .72;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI*2); ctx.moveTo(x-12,y); ctx.lineTo(x+12,y); ctx.moveTo(x,y-12); ctx.lineTo(x,y+12); ctx.stroke();
      }
      ctx.restore();
    }
    drawEffects(ctx, view, dt, now) {
      const survivors = [];
      for (const effect of this.effects) {
        effect.life -= dt;
        if (effect.life <= 0) continue;
        survivors.push(effect);
        const alpha = clamp(effect.life / effect.max, 0, 1);
        ctx.save(); ctx.strokeStyle = effect.color; ctx.shadowColor = effect.color; ctx.shadowBlur = 12 * alpha; ctx.lineWidth = Math.max(1, effect.width || 2); ctx.globalAlpha = alpha;
        if (effect.type === 'path') {
          ctx.beginPath();
          effect.path.forEach((point, index) => {
            const [x,y] = this.mapToScreen(point[0], point[1], view);
            const jitter = effect.width < 3 ? (Math.random()-.5)*5*alpha : 0;
            if (!index) ctx.moveTo(x,y); else ctx.lineTo(x+jitter,y-jitter);
          });
          ctx.stroke();
          if (effect.width < 3) { ctx.globalAlpha = alpha*.55; ctx.lineWidth *= 3; ctx.stroke(); }
        } else {
          const [x,y] = this.mapToScreen(effect.x,effect.y,view);
          const scale = effect.type === 'warning' ? .65 + .12*Math.sin(now*.012) : 1 + (1-alpha)*1.7;
          const r = effect.radius * this.canvas.width * view.zoom * scale;
          if (effect.type === 'warning') ctx.setLineDash([8,6]);
          ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
        }
        ctx.restore();
      }
      this.effects = survivors;
    }
    drawParticles(ctx, view, dt) {
      const survivors = [];
      ctx.save(); ctx.globalCompositeOperation = this.quality === 0 ? 'source-over' : 'lighter';
      for (const p of this.particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        survivors.push(p); p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'spore') { p.vx += Math.sin(p.life*7)*.00005; p.vy -= .0001; }
        if (p.kind === 'droplet') p.vy += .002 * dt;
        const [x,y] = this.mapToScreen(p.x,p.y,view);
        if (x < -8 || y < -8 || x > this.canvas.width+8 || y > this.canvas.height+8) continue;
        const alpha = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = this.quality ? 7 : 0;
        if (p.kind === 'arc') { ctx.fillRect(x, y, p.size*3, Math.max(1,p.size*.4)); }
        else { ctx.beginPath(); ctx.arc(x,y,p.size*(.55+view.zoom*.2),0,Math.PI*2); ctx.fill(); }
      }
      ctx.restore(); this.particles = survivors;
    }
  }

  class SynthSound {
    constructor() { this.ctx = null; this.master = null; this.enabled = false; this.ambient = null; this.mix = [0,0,0,0,0]; }
    enable() {
      if (!settings.sound) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        if (!this.ctx) { this.ctx = new AudioCtx(); this.buildAmbient(); }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.enabled = true;
        if (this.master) this.master.gain.setTargetAtTime(.16, this.ctx.currentTime, .2);
      } catch (_) { /* Audio is optional. */ }
    }
    disable() { this.enabled = false; if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .1); }
    setPaused(value) { if (!this.master || !this.ctx || !this.enabled) return; this.master.gain.setTargetAtTime(value ? .015 : .16, this.ctx.currentTime, .3); }
    buildAmbient() {
      const ctx = this.ctx;
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0); let last = 0;
      for (let i=0;i<data.length;i++) { last = last*.965 + (Math.random()*2-1)*.035; data[i]=last; }
      const fire = ctx.createBufferSource(); fire.buffer=noiseBuffer; fire.loop=true;
      const fireFilter=ctx.createBiquadFilter(); fireFilter.type='lowpass'; fireFilter.frequency.value=650;
      const fireGain=ctx.createGain(); fireGain.gain.value=.001; fire.connect(fireFilter).connect(fireGain).connect(this.master); fire.start();
      const water=ctx.createBufferSource(); water.buffer=noiseBuffer; water.loop=true;
      const waterFilter=ctx.createBiquadFilter(); waterFilter.type='bandpass'; waterFilter.frequency.value=310; waterFilter.Q.value=.45;
      const waterGain=ctx.createGain(); waterGain.gain.value=.001; water.connect(waterFilter).connect(waterGain).connect(this.master); water.start();
      const volt=ctx.createOscillator(); volt.type='square'; volt.frequency.value=58; const voltGain=ctx.createGain(); voltGain.gain.value=.0001; volt.connect(voltGain).connect(this.master); volt.start();
      const bloom=ctx.createOscillator(); bloom.type='sine'; bloom.frequency.value=92; const bloomGain=ctx.createGain(); bloomGain.gain.value=.0001; bloom.connect(bloomGain).connect(this.master); bloom.start();
      this.ambient={fireGain,waterGain,voltGain,bloomGain,volt,bloom};
    }
    updateMix(teams) {
      if (!teams) return;
      for (const t of teams) this.mix[t.id]=t.share;
      if (!this.ambient || !this.ctx || !this.enabled) return;
      const now=this.ctx.currentTime;
      this.ambient.fireGain.gain.setTargetAtTime(.007+.045*this.mix[1],now,.8);
      this.ambient.voltGain.gain.setTargetAtTime(.0004+.012*this.mix[2],now,.8);
      this.ambient.bloomGain.gain.setTargetAtTime(.001+.018*this.mix[3],now,.8);
      this.ambient.waterGain.gain.setTargetAtTime(.005+.05*this.mix[4],now,.8);
    }
    playEvent(kind, importance=1, team=0) {
      if (!this.enabled || !this.ctx || importance < 1.25) return;
      const now=this.ctx.currentTime;
      if (kind==='chainLightning'||kind.includes('storm')) this.zap(now, importance);
      else if (kind.includes('core')||kind==='overload'||kind.includes('meteor')||kind==='steamBurst') this.boom(now, importance);
      else if (kind==='grandBloom') this.tone(now, 190, 520, .7, .05, 'sine');
      else if (kind==='flood'||kind.includes('rain')) this.noiseHit(now, .8, 620);
      else if (kind==='flameStorm') this.noiseHit(now, .7, 950);
      else if (team) this.tone(now, [0,110,470,220,155][team], [0,70,180,390,95][team], .32, .025, team===2?'square':'sine');
    }
    tone(now, from, to, duration, volume, type) {
      const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.type=type; o.frequency.setValueAtTime(from,now); o.frequency.exponentialRampToValueAtTime(Math.max(20,to),now+duration); g.gain.setValueAtTime(.0001,now); g.gain.exponentialRampToValueAtTime(volume,now+.025); g.gain.exponentialRampToValueAtTime(.0001,now+duration); o.connect(g).connect(this.master); o.start(now); o.stop(now+duration+.05);
    }
    zap(now, importance) { this.tone(now, 960, 75, .18+importance*.06, .028, 'square'); setTimeout(()=>this.enabled&&this.tone(this.ctx.currentTime,640,120,.13,.018,'sawtooth'),70); }
    boom(now, importance) { this.tone(now, 130, 28, .55, .05+importance*.008, 'sine'); this.noiseHit(now,.45,380); }
    noiseHit(now,duration,frequency) {
      const length=Math.floor(this.ctx.sampleRate*duration), buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2);
      const src=this.ctx.createBufferSource(), filter=this.ctx.createBiquadFilter(), gain=this.ctx.createGain(); src.buffer=buffer; filter.type='lowpass'; filter.frequency.value=frequency; gain.gain.value=.04; src.connect(filter).connect(gain).connect(this.master); src.start(now);
    }
    playVictory(team) { if (!this.enabled||!this.ctx) return; const base=[0,110,370,196,147][team]; [1,1.25,1.5,2].forEach((m,i)=>setTimeout(()=>this.enabled&&this.tone(this.ctx.currentTime,base*m,base*m*1.02,.38,.022,'sine'),i*160)); }
  }

  // Hidden developer hook: run the real worker headlessly across many seeds.
  window.CELLULAR_APOCALYPSE_TEST = (count = 24, seconds = 100) => worker?.postMessage({ type: 'run-balance-test', count, seconds });

  init();
})();
