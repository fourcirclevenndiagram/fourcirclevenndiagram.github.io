/* CELLULAR APOCALYPSE — deterministic CPU simulation worker.
 * No rendering code lives here: every visible event is derived from these arrays.
 */
'use strict';

const DT = 0.1;
const TEAM = { NEUTRAL: 0, EMBER: 1, VOLT: 2, BLOOM: 3, TIDE: 4 };
const TEAM_NAMES = ['', 'EMBER', 'VOLT', 'BLOOM', 'TIDE'];
const STRATEGIES = ['확장', '자원 축적', '코어 방어', '적 코어 압박', '고립 지대 개척', '특수 능력 준비', '위험 지역 철수', '환경 회복', '선두 세력 견제'];
const DISASTER_TEXT = {
  rain: '집중호우가 전장을 적십니다. 물길과 전도망이 동시에 깨어납니다.',
  drought: '가뭄이 수분을 빼앗습니다. 마른 생물질에 불씨가 번집니다.',
  heatwave: '폭염이 지표를 달굽니다. 물이 증발하고 전하 생성이 빨라집니다.',
  freeze: '한파가 밀려옵니다. 저지대의 물이 얼어붙기 시작합니다.',
  storm: '낙뢰 폭풍이 전도성 지대를 무작위로 강타합니다.',
  nutrient: '지하 영양층이 폭발했습니다. 휴면 포자가 일제히 반응합니다.',
  meteor: '운석이 지표를 뒤집습니다. 충돌 지점의 모든 물질이 흔들립니다.',
  vein: '전도성 광맥이 노출되어 새로운 전력 통로가 열립니다.',
  sink: '지반 침하가 발생했습니다. 주변의 물이 새 저지대로 몰립니다.',
  wind: '강풍이 불씨와 포자를 전장 반대편까지 실어 나릅니다.'
};

let size = 100;
let cells = 10000;
let config = { duration: 300, disasterFrequency: 'normal' };
let seedText = 'CELL-0000';
let seedValue = 1;
let random = mulberry32(1);
let terrain;
let faction;
let nextFaction;
let materialState;
let nextMaterialState;
let age;
let collapsed;
let F;
let B;
let cores = [];
let team = null;
let strategies = null;
let elapsed = 0;
let tickNumber = 0;
let running = false;
let paused = false;
let baseSpeed = 1;
let cinematicScale = 1;
let cinematicUntil = 0;
let accumulator = 0;
let lastReal = performance.now();
let lastFrame = 0;
let tpsCounter = 0;
let tpsClock = performance.now();
let measuredTps = 0;
let leader = 0;
let leaderHold = 0;
let nextWorldEvent = 40;
let worldEvent = { type: '', time: 0, strength: 0 };
let apocalypsePhase = 0;
let gameOver = false;
let history = [];
let timelapse = [];
let nextHistoryAt = 0;
let lastHistoryShares = [0, 0, 0, 0, 0];
let nextStrategyAt = 4;
let recentEvents = new Map();
let disasterCount = 0;
let headless = false;
let matchSerial = 0;

function clamp(v, lo = 0, hi = 1) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function idx(x, y) { return y * size + x; }
function xy(i) { return [i % size, (i / size) | 0]; }
function hash32(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
function seedFromText(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomSeed() {
  const a = Date.now().toString(36).slice(-5).toUpperCase();
  const b = Math.floor(Math.random() * 0xFFFF).toString(36).padStart(3, '0').toUpperCase();
  return `CA-${a}-${b}`;
}
function randInt(n) { return Math.floor(random() * n); }
function sample(array, fallback = 0) { return array.length ? array[randInt(array.length)] : fallback; }

function latticeNoise(x, y, salt) {
  const h = hash32(seedValue ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt);
  return h / 4294967295;
}
function valueNoise(x, y, scale, salt) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smooth(sx - x0);
  const ty = smooth(sy - y0);
  const a = latticeNoise(x0, y0, salt);
  const b = latticeNoise(x0 + 1, y0, salt);
  const c = latticeNoise(x0, y0 + 1, salt);
  const d = latticeNoise(x0 + 1, y0 + 1, salt);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
function fbm(x, y, salt) {
  let total = 0;
  let amp = .56;
  let scale = size * .42;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    total += valueNoise(x, y, scale, salt + o * 911) * amp;
    norm += amp;
    amp *= .5;
    scale *= .5;
  }
  return total / norm;
}

function floatFields(n) {
  return {
    temperature: new Float32Array(n),
    moisture: new Float32Array(n),
    nutrient: new Float32Array(n),
    charge: new Float32Array(n),
    conductivity: new Float32Array(n),
    pollution: new Float32Array(n),
    mass: new Float32Array(n),
    change: new Float32Array(n)
  };
}

function resetStats() {
  team = Array.from({ length: 5 }, (_, t) => ({
    id: t,
    count: 0,
    share: 0,
    energy: t ? 10 : 0,
    cores: t ? 1 : 0,
    active: t > 0,
    extinctAt: 0,
    coreKills: 0,
    peak: 0,
    averageSum: 0,
    averageSamples: 0,
    maxChain: 0,
    longestCore: 0,
    abilityCooldown: 8 + t * 1.7,
    zeroTime: 0
  }));
  strategies = Array.from({ length: 5 }, (_, t) => ({ team: t, mode: 0, targetX: size / 2, targetY: size / 2, since: 0 }));
}

function initializeMatch(payload = {}) {
  size = [80, 100, 120].includes(+payload.size) ? +payload.size : 100;
  cells = size * size;
  config.duration = clamp(+payload.duration || 300, 60, 900);
  config.disasterFrequency = ['low', 'normal', 'high'].includes(payload.disasterFrequency) ? payload.disasterFrequency : 'normal';
  seedText = payload.seed || randomSeed();
  seedValue = seedFromText(seedText);
  random = mulberry32(seedValue);
  terrain = new Float32Array(cells);
  faction = new Uint8Array(cells);
  nextFaction = new Uint8Array(cells);
  materialState = new Uint8Array(cells);
  nextMaterialState = new Uint8Array(cells);
  age = new Uint16Array(cells);
  collapsed = new Uint8Array(cells);
  F = floatFields(cells);
  B = floatFields(cells);
  cores = [];
  elapsed = 0;
  tickNumber = 0;
  accumulator = 0;
  leader = 0;
  leaderHold = 0;
  apocalypsePhase = 0;
  worldEvent = { type: '', time: 0, strength: 0 };
  gameOver = false;
  history = [];
  timelapse = [];
  nextHistoryAt = 0;
  nextStrategyAt = 4 + random() * 2;
  recentEvents.clear();
  disasterCount = 0;
  matchSerial++;
  resetStats();
  generateWorld();
  placeInitialCores();
  updateMetrics(true);
  nextWorldEvent = worldEventDelay();
  lastReal = performance.now();
  running = true;
  paused = false;
  if (!headless) {
    postMessage({ type: 'ready', seed: seedText, size, matchSerial });
    emitEvent('awakening', '네 물질 코어가 서로 다른 생존법으로 깨어납니다.', size / 2, size / 2, 1);
    sendFrame(true);
  }
}

function generateWorld() {
  const lakeSalt = hash32(seedValue ^ 0xA511E9B3);
  const ridgeSalt = hash32(seedValue ^ 0x91E10DA5);
  const mineralSalt = hash32(seedValue ^ 0xD1B54A35);
  const soilSalt = hash32(seedValue ^ 0x94D049BB);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, y);
      const ridge = fbm(x, y, ridgeSalt);
      const basin = fbm(x + 37, y - 19, lakeSalt);
      const warp = Math.sin((x / size) * Math.PI * 3 + basin * 4) * .055;
      const h = clamp(ridge * .82 + warp + .07);
      const mineral = fbm(x - 31, y + 23, mineralSalt);
      const soil = fbm(x + 73, y + 59, soilSalt);
      const valleyWater = clamp((.48 - h) * 2.2 + (basin - .52) * .55);
      terrain[i] = h;
      F.temperature[i] = clamp(.53 - h * .2 + (fbm(x + 100, y, 7057) - .5) * .12);
      F.moisture[i] = clamp(.14 + valleyWater + (basin - .4) * .35);
      F.nutrient[i] = clamp(.12 + soil * .66 + F.moisture[i] * .13 - Math.max(0, h - .72) * .5);
      F.conductivity[i] = clamp(.06 + Math.pow(mineral, 2.1) * .88 + (h > .67 ? .12 : 0));
      F.pollution[i] = clamp((fbm(x - 120, y + 80, 4021) - .72) * 1.6);
      F.charge[i] = F.conductivity[i] * .025 * random();
      F.mass[i] = 0;
      F.change[i] = 0;
      if (h < .31 && F.moisture[i] > .58) materialState[i] = 3;
      else if (h > .78 && mineral > .61) materialState[i] = 1;
      else if (soil > .69 && F.moisture[i] > .32) materialState[i] = 2;
      else materialState[i] = 0;
    }
  }
}

function startSuitability(t, i) {
  if (t === TEAM.EMBER) return (1 - F.moisture[i]) * .42 + F.nutrient[i] * .28 + F.temperature[i] * .2 + terrain[i] * .1;
  if (t === TEAM.VOLT) return F.conductivity[i] * .58 + F.moisture[i] * .15 + terrain[i] * .12 + .15;
  if (t === TEAM.BLOOM) return F.nutrient[i] * .5 + F.moisture[i] * .38 + (1 - F.pollution[i]) * .12;
  return (1 - terrain[i]) * .5 + F.moisture[i] * .44 + .06;
}

function placeInitialCores() {
  const rotation = random() * Math.PI * 2;
  const anchors = [];
  for (let t = 1; t <= 4; t++) {
    const a = rotation + (t - 1) * Math.PI * .5;
    anchors[t] = [size * (.5 + Math.cos(a) * .34), size * (.5 + Math.sin(a) * .34)];
  }
  for (let t = 1; t <= 4; t++) {
    const [ax, ay] = anchors[t];
    let best = -Infinity;
    let bx = Math.round(ax), by = Math.round(ay);
    const radius = Math.max(8, Math.floor(size * .13));
    for (let sy = -radius; sy <= radius; sy++) {
      for (let sx = -radius; sx <= radius; sx++) {
        const x = clamp(Math.round(ax + sx), 5, size - 6);
        const y = clamp(Math.round(ay + sy), 5, size - 6);
        const i = idx(x, y);
        let separation = 1;
        for (const c of cores) separation = Math.min(separation, Math.hypot(c.x - x, c.y - y) / (size * .25));
        const score = startSuitability(t, i) + Math.min(1, separation) * .28 - Math.hypot(sx, sy) / radius * .12;
        if (score > best) { best = score; bx = x; by = y; }
      }
    }
    conditionStartArea(t, bx, by);
    createCore(t, bx, by, true);
  }
}

function conditionStartArea(t, cx, cy) {
  forCircle(cx, cy, 5, (i, x, y, d) => {
    const falloff = 1 - d / 5;
    faction[i] = t;
    F.mass[i] = clamp(.36 + falloff * .58 + random() * .08);
    age[i] = randInt(20);
    collapsed[i] = 0;
    if (t === TEAM.EMBER) {
      F.temperature[i] = Math.max(F.temperature[i], .66 + falloff * .18);
      F.moisture[i] *= .78;
      materialState[i] = falloff > .72 ? 5 : 0;
    } else if (t === TEAM.VOLT) {
      F.conductivity[i] = Math.max(F.conductivity[i], .52 + falloff * .35);
      F.charge[i] = .2 + falloff * .25;
      materialState[i] = 1;
    } else if (t === TEAM.BLOOM) {
      F.moisture[i] = Math.max(F.moisture[i], .46);
      F.nutrient[i] = Math.max(F.nutrient[i], .62 + falloff * .22);
      materialState[i] = 2;
    } else {
      terrain[i] = Math.min(terrain[i], .48 - falloff * .12);
      F.moisture[i] = Math.max(F.moisture[i], .68 + falloff * .26);
      F.temperature[i] *= .84;
      materialState[i] = 3;
    }
  });
}

function createCore(t, x, y, initial = false) {
  const core = { id: `${t}-${matchSerial}-${cores.length}-${tickNumber}`, team: t, x, y, hp: initial ? 100 : 72, age: 0, initial };
  cores.push(core);
  const i = idx(x, y);
  faction[i] = t;
  F.mass[i] = 1;
  if (!initial) {
    team[t].cores++;
    emitEvent('coreCreated', `${TEAM_NAMES[t]}가 자원 순환이 좋은 곳에 보조 코어를 생성했습니다.`, x, y, 2.2, { team: t, radius: 5 });
  }
  return core;
}

function forCircle(cx, cy, radius, fn) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(size - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(size - 1, Math.ceil(cy + radius));
  const rr = radius * radius;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rr) fn(idx(x, y), x, y, Math.sqrt(d2));
    }
  }
}

function worldEventDelay() {
  const multiplier = config.disasterFrequency === 'low' ? 1.28 : config.disasterFrequency === 'high' ? .72 : 1;
  return elapsed + (30 + random() * 20) * multiplier;
}

function updateTick() {
  if (!running || paused || gameOver) return;
  tickNumber++;
  elapsed += DT;
  updateWorldEvent();
  updateApocalypse();
  if (elapsed >= nextStrategyAt) evaluateStrategies();
  if (elapsed >= nextWorldEvent) {
    const options = ['rain', 'drought', 'heatwave', 'freeze', 'storm', 'nutrient', 'meteor', 'vein', 'sink', 'wind'];
    applyDisaster(sample(options), false);
    nextWorldEvent = worldEventDelay();
  }
  if (tickNumber % 10 === 0) tryAbilities();
  simulateCells();
  updateCores();
  updateMetrics(false);
  captureHistory();
  checkVictory();
}

function updateWorldEvent() {
  if (!worldEvent.time) return;
  worldEvent.time = Math.max(0, worldEvent.time - DT);
  if (!worldEvent.time) worldEvent = { type: '', time: 0, strength: 0 };
}

function globalModifiers() {
  const m = { temp: 0, moisture: 0, charge: 0, growth: 1, windX: 0, windY: 0 };
  if (worldEvent.type === 'rain') { m.moisture = .008; m.temp = -.0015; m.charge = .002; }
  if (worldEvent.type === 'drought') { m.moisture = -.007; m.temp = .0012; m.growth = .76; }
  if (worldEvent.type === 'heatwave') { m.temp = .006; m.moisture = -.003; }
  if (worldEvent.type === 'freeze') { m.temp = -.007; m.growth = .68; }
  if (worldEvent.type === 'storm') { m.charge = .008; m.moisture = .001; }
  if (worldEvent.type === 'wind') { m.windX = worldEvent.windX || 0; m.windY = worldEvent.windY || 0; }
  return m;
}

function simulateCells() {
  const mod = globalModifiers();
  const shares = [0, team[1].share, team[2].share, team[3].share, team[4].share];
  // Broad empires spend more energy maintaining distant cells. This systemic cost
  // begins near an even four-way split and prevents a fast opener from snowballing.
  const upkeep = shares.map(s => Math.max(0, s - .24) * .019 + apocalypsePhase * .0013);
  nextFaction.set(faction);
  nextMaterialState.set(materialState);

  for (let y = 0; y < size; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < size - 1 ? y + 1 : y;
    for (let x = 0; x < size; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < size - 1 ? x + 1 : x;
      const i = idx(x, y);
      const l = idx(xm, y), r = idx(xp, y), u = idx(x, ym), d = idx(x, yp);
      if (collapsed[i]) {
        nextFaction[i] = 0;
        B.mass[i] = 0;
        B.temperature[i] = .02;
        B.moisture[i] = 0;
        B.nutrient[i] = 0;
        B.charge[i] = 0;
        B.conductivity[i] = F.conductivity[i] * .98;
        B.pollution[i] = 1;
        B.change[i] = Math.max(F.change[i] * .85, .5);
        nextMaterialState[i] = 0;
        continue;
      }

      const avgT = (F.temperature[l] + F.temperature[r] + F.temperature[u] + F.temperature[d]) * .25;
      const avgM = (F.moisture[l] + F.moisture[r] + F.moisture[u] + F.moisture[d]) * .25;
      const avgC = (F.charge[l] + F.charge[r] + F.charge[u] + F.charge[d]) * .25;
      const avgP = (F.pollution[l] + F.pollution[r] + F.pollution[u] + F.pollution[d]) * .25;
      const slopeFlow = ((terrain[l] - terrain[i]) * F.moisture[l] + (terrain[r] - terrain[i]) * F.moisture[r] + (terrain[u] - terrain[i]) * F.moisture[u] + (terrain[d] - terrain[i]) * F.moisture[d]) * .018;
      let temperature = F.temperature[i] + (avgT - F.temperature[i]) * .075 + (.47 - F.temperature[i]) * .0007 + mod.temp;
      let moisture = F.moisture[i] + (avgM - F.moisture[i]) * .026 + slopeFlow + mod.moisture;
      let nutrient = F.nutrient[i] + (F.pollution[i] * .0004) - .00008;
      let conductivity = F.conductivity[i];
      let charge = F.charge[i] + (avgC - F.charge[i]) * (.018 + conductivity * .08) - .002 + mod.charge * conductivity;
      let pollution = F.pollution[i] + (avgP - F.pollution[i]) * .008 - .00035;
      let mass = F.mass[i];
      let state = materialState[i];
      const f = faction[i];

      if (f === TEAM.EMBER) {
        const fuel = nutrient * .62 + (state === 2 ? .34 : 0);
        temperature += .006 + mass * .0065;
        moisture -= .003 + temperature * .0015;
        nutrient -= .0018 * mass;
        pollution += .0022 * mass;
        mass += (fuel * .0065 + temperature * .0025 - moisture * .009 - .0056 - upkeep[f]) * mod.growth;
        if (temperature > .84 && mass > .58) state = 5;
        if (moisture > .78 && temperature < .56) mass -= .016;
        team[f].energy += Math.max(0, fuel + temperature - moisture) * .00042;
      } else if (f === TEAM.VOLT) {
        const network = conductivity * .7 + moisture * .24;
        charge += (.004 + network * .007 + temperature * .0015) * mass;
        conductivity += .00035 * mass;
        temperature += charge * .0018;
        mass += (network * .012 + charge * .0095 - .0045 - upkeep[f]) * mod.growth;
        if (conductivity < .18) mass -= .005;
        team[f].energy += Math.max(0, network + charge) * .0004;
      } else if (f === TEAM.BLOOM) {
        const food = nutrient * .56 + moisture * .4 - pollution * .28;
        mass += (food * .0104 + .0031 - temperature * .0018 - .0055 - upkeep[f] * .67) * mod.growth;
        nutrient -= mass * .00058;
        moisture -= mass * .00048;
        pollution -= mass * .0014;
        conductivity -= mass * (moisture < .35 ? .0009 : .00025);
        state = moisture > .66 ? 2 : state;
        if (temperature > .76) mass -= (temperature - .76) * .075;
        team[f].energy += Math.max(0, food) * .00044;
      } else if (f === TEAM.TIDE) {
        moisture += .0045 * mass + Math.max(0, .5 - terrain[i]) * .0015;
        temperature -= .003 * mass;
        const lowland = 1 - terrain[i];
        mass += (lowland * .0086 + moisture * .0063 - Math.max(0, terrain[i] - .65) * .014 - .005 - upkeep[f]) * mod.growth;
        if (temperature < .25 && moisture > .6) state = 4;
        else if (temperature > .73) { state = 6; mass -= .006; moisture -= .004; }
        else state = 3;
        team[f].energy += Math.max(0, moisture + lowland - temperature) * .00036;
      } else {
        mass = Math.max(0, mass - .008);
        if (state === 2) nutrient += .00024;
      }

      if (temperature > .92 && state === 2) { state = 7; nutrient += .002; pollution += .002; }
      if (state === 6) {
        moisture -= .0012;
        if (temperature < .57) { state = moisture > .58 ? 3 : 0; moisture += .008; }
      }
      if (state === 4 && temperature > .39) { state = 3; moisture += .004; }
      if (state === 7 && temperature < .5 && nutrient > .36 && moisture > .28) state = 2;

      B.temperature[i] = clamp(temperature);
      B.moisture[i] = clamp(moisture);
      B.nutrient[i] = clamp(nutrient);
      B.charge[i] = clamp(charge);
      B.conductivity[i] = clamp(conductivity);
      B.pollution[i] = clamp(pollution);
      B.mass[i] = clamp(mass);
      B.change[i] = F.change[i] * .84;
      nextMaterialState[i] = state;
    }
  }

  // Competition is evaluated from the unchanged source arrays, avoiding scan-direction bias.
  const orderFlip = tickNumber & 1;
  for (let yy = 0; yy < size; yy++) {
    const y = orderFlip ? size - 1 - yy : yy;
    for (let xx = 0; xx < size; xx++) {
      const x = orderFlip ? size - 1 - xx : xx;
      const i = idx(x, y);
      if (collapsed[i]) continue;
      const current = faction[i];
      const power = [0, 0, 0, 0, 0];
      let sameNeighbors = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= size) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox;
          if (nx < 0 || nx >= size) continue;
          const ni = idx(nx, ny);
          const attacker = faction[ni];
          if (!attacker || collapsed[ni]) continue;
          if (attacker === current) sameNeighbors++;
          let p = F.mass[ni] * (ox && oy ? .68 : 1);
          if (attacker === TEAM.EMBER) p *= .054 * (.42 + F.temperature[ni]) * (1.16 - F.moisture[i] * .82) * (.65 + F.nutrient[i] * .62);
          else if (attacker === TEAM.VOLT) p *= .081 * (.42 + F.conductivity[i] * .9 + F.moisture[i] * .46) * (.62 + F.charge[ni]);
          else if (attacker === TEAM.BLOOM) p *= .06 * (.52 + F.nutrient[i] * .8 + F.moisture[i] * .62) * (1.05 - F.pollution[i] * .33);
          else if (attacker === TEAM.TIDE) p *= .077 * (.5 + F.moisture[ni] * .79 + Math.max(0, terrain[ni] - terrain[i]) * 1.78);
          const strategy = strategies[attacker].mode;
          if (strategy === 0 || strategy === 3 || strategy === 8) p *= 1.13;
          if (strategy === 2 && current && current !== attacker) p *= .9;
          power[attacker] += p;
        }
      }

      let bestTeam = 0, best = 0, second = 0;
      for (let t = 1; t <= 4; t++) {
        let p = power[t];
        if (current && t !== current) p *= interactionMultiplier(t, current, i);
        if (p > best) { second = best; best = p; bestTeam = t; }
        else if (p > second) second = p;
      }

      if (current) {
        if (sameNeighbors === 0) B.mass[i] = Math.max(0, B.mass[i] - (current === TEAM.VOLT ? .018 : .008));
        else if (current === TEAM.BLOOM && sameNeighbors >= 4) B.mass[i] = clamp(B.mass[i] + .0048);
      }
      const defense = current ? .016 + F.mass[i] * defenseFactor(current, i) : .012 + (materialState[i] === 1 ? .016 : 0);
      const pressure = best - second * .23 - defense;
      if (bestTeam && bestTeam !== current && pressure > 0 && random() < clamp(pressure * 2.15, 0, .42)) {
        conquerCell(i, current, bestTeam, best, x, y);
      } else if (current && B.mass[i] < .035) {
        nextFaction[i] = 0;
        B.mass[i] = 0;
        B.change[i] = Math.max(B.change[i], .22);
      }
    }
  }

  // Periodic long-range behavior: spores ride humidity/wind, tide spills downhill.
  if (tickNumber % 17 === 0) longRangePropagation(mod);
  if (tickNumber % 31 === 0) detectInstability();

  const oldFaction = faction;
  faction = nextFaction;
  nextFaction = oldFaction;
  const oldMaterialState = materialState;
  materialState = nextMaterialState;
  nextMaterialState = oldMaterialState;
  for (const key of Object.keys(F)) {
    const temp = F[key]; F[key] = B[key]; B[key] = temp;
  }
  for (let i = 0; i < cells; i++) age[i] = faction[i] ? Math.min(65535, age[i] + 1) : 0;
}

function interactionMultiplier(attacker, defender, i) {
  if (attacker === TEAM.EMBER && defender === TEAM.BLOOM) return 1.34 * (1.1 - F.moisture[i] * .45);
  if (attacker === TEAM.EMBER && defender === TEAM.TIDE) return F.temperature[i] > .8 && F.moisture[i] < .46 ? 1.05 : .38;
  if (attacker === TEAM.VOLT && defender === TEAM.TIDE) return 1.25 + F.moisture[i] * .86;
  if (attacker === TEAM.VOLT && defender === TEAM.BLOOM) return F.moisture[i] > .5 ? 1.48 : .7;
  if (attacker === TEAM.BLOOM && defender === TEAM.VOLT) return F.moisture[i] < .39 ? 1.25 : .78;
  if (attacker === TEAM.TIDE && defender === TEAM.EMBER) return 1.64 + F.moisture[i] * .58 - F.temperature[i] * .38;
  if (attacker === TEAM.BLOOM && defender === TEAM.TIDE) return .82;
  if (attacker === TEAM.TIDE && defender === TEAM.BLOOM) return .74;
  return 1;
}

function defenseFactor(t, i) {
  if (t === TEAM.EMBER) return .052 + F.temperature[i] * .035 - F.moisture[i] * .025;
  if (t === TEAM.VOLT) return .05 + F.conductivity[i] * .035;
  if (t === TEAM.BLOOM) return .055 + F.nutrient[i] * .025 + F.moisture[i] * .018;
  return .052 + (materialState[i] === 4 ? .055 : F.moisture[i] * .02);
}

function conquerCell(i, oldTeam, newTeam, attack, x, y) {
  nextFaction[i] = newTeam;
  B.mass[i] = clamp(.18 + attack * 2.2);
  B.change[i] = 1;
  age[i] = 0;
  team[newTeam].energy += oldTeam ? .018 : .008;
  if (newTeam === TEAM.EMBER && oldTeam === TEAM.BLOOM) {
    B.temperature[i] = clamp(B.temperature[i] + .16);
    B.nutrient[i] = clamp(B.nutrient[i] + .1);
    nextMaterialState[i] = 7;
  } else if (newTeam === TEAM.TIDE && oldTeam === TEAM.EMBER) {
    B.temperature[i] = clamp(B.temperature[i] - .18);
    B.moisture[i] = clamp(B.moisture[i] + .12);
    nextMaterialState[i] = B.temperature[i] > .66 ? 6 : 3;
    if (F.temperature[i] > .78 && random() < .055) emitEvent('steamBurst', '파랑과 빨강의 충돌로 수증기 폭발이 발생했습니다.', x, y, 1.65, { radius: 4 });
  } else if (newTeam === TEAM.VOLT && (oldTeam === TEAM.TIDE || (oldTeam === TEAM.BLOOM && F.moisture[i] > .5))) {
    B.charge[i] = clamp(B.charge[i] + .24);
  } else if (newTeam === TEAM.BLOOM && materialState[i] === 7) {
    B.nutrient[i] = clamp(B.nutrient[i] + .05);
    nextMaterialState[i] = 2;
  }
}

function longRangePropagation(mod) {
  const attempts = Math.max(12, (cells / 600) | 0);
  for (let a = 0; a < attempts; a++) {
    const i = randInt(cells);
    const f = faction[i];
    if (!f || F.mass[i] < .58) continue;
    const [x, y] = xy(i);
    if (f === TEAM.BLOOM) {
      const distance = 3 + randInt(worldEvent.type === 'wind' ? 14 : 8);
      const angle = worldEvent.type === 'wind' ? Math.atan2(mod.windY, mod.windX) + (random() - .5) : random() * Math.PI * 2;
      const tx = clamp(Math.round(x + Math.cos(angle) * distance), 0, size - 1);
      const ty = clamp(Math.round(y + Math.sin(angle) * distance), 0, size - 1);
      const ti = idx(tx, ty);
      if (!collapsed[ti] && faction[ti] !== TEAM.EMBER && F.moisture[ti] + F.nutrient[ti] > .9 && random() < .42) {
        nextFaction[ti] = TEAM.BLOOM;
        B.mass[ti] = Math.max(B.mass[ti], .2);
        B.change[ti] = .8;
      }
    } else if (f === TEAM.TIDE) {
      let best = i;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const tx = x + ox, ty = y + oy;
        if (tx < 0 || tx >= size || ty < 0 || ty >= size) continue;
        const ti = idx(tx, ty);
        if (terrain[ti] + (faction[ti] === TEAM.TIDE ? .1 : 0) < terrain[best]) best = ti;
      }
      if (best !== i && !collapsed[best] && F.moisture[i] > .62) {
        nextFaction[best] = TEAM.TIDE;
        B.mass[best] = Math.max(B.mass[best], .2);
        B.moisture[best] = Math.max(B.moisture[best], F.moisture[i] * .82);
        B.change[best] = .7;
      }
    }
  }
}

function detectInstability() {
  for (let k = 0; k < Math.max(8, size / 8); k++) {
    const i = randInt(cells);
    if (faction[i] === TEAM.VOLT && F.charge[i] > .96 && F.mass[i] > .58 && random() < .12) {
      const [x, y] = xy(i);
      explode(x, y, 2.5, TEAM.VOLT, .16);
      emitEvent('overload', '노랑의 과전하 노드가 폭발해 자기 전력망까지 태웠습니다.', x, y, 1.45, { team: TEAM.VOLT, radius: 3 });
    }
  }
}

function evaluateStrategies() {
  nextStrategyAt = elapsed + 5 + random() * 5;
  let top = 1;
  for (let t = 2; t <= 4; t++) if (team[t].share > team[top].share) top = t;
  for (let t = 1; t <= 4; t++) {
    if (!team[t].active) continue;
    const livingCores = cores.filter(c => c.team === t);
    const weakest = livingCores.reduce((a, c) => !a || c.hp < a.hp ? c : a, null);
    let mode;
    if (weakest && weakest.hp < 42) mode = 2;
    else if (top !== t && team[top].share - team[t].share > .14) mode = 8;
    else if (team[t].energy > 27 && team[t].abilityCooldown < 5) mode = 5;
    else if (team[t].share > .38) mode = random() < .55 ? 7 : 6;
    else {
      const weighted = t === TEAM.EMBER ? [0, 0, 3, 5] : t === TEAM.VOLT ? [3, 4, 5, 1] : t === TEAM.BLOOM ? [1, 1, 7, 4] : [0, 4, 1, 5];
      mode = sample(weighted);
    }
    const target = chooseStrategyTarget(t, mode, top);
    const changed = strategies[t].mode !== mode;
    strategies[t] = { team: t, mode, targetX: target[0], targetY: target[1], since: elapsed };
    if (changed && random() < .2) emitEvent('strategy', `${TEAM_NAMES[t]}가 '${STRATEGIES[mode]}' 전략으로 전환했습니다.`, target[0], target[1], .7, { team: t });
  }
  detectLeaderChange(top);
}

function chooseStrategyTarget(t, mode, top) {
  if (mode === 2) {
    const own = cores.filter(c => c.team === t).sort((a, b) => a.hp - b.hp)[0];
    if (own) return [own.x, own.y];
  }
  if (mode === 3 || mode === 8) {
    const targetTeam = mode === 8 ? top : ((t + randInt(3)) % 4) + 1;
    const targets = cores.filter(c => c.team === targetTeam);
    if (targets.length) { const c = sample(targets); return [c.x, c.y]; }
  }
  let best = -Infinity, bestI = randInt(cells);
  for (let k = 0; k < 240; k++) {
    const i = randInt(cells);
    if (collapsed[i]) continue;
    let score = 0;
    if (t === TEAM.EMBER) score = F.nutrient[i] + F.temperature[i] - F.moisture[i];
    else if (t === TEAM.VOLT) score = F.conductivity[i] + F.moisture[i] * .35;
    else if (t === TEAM.BLOOM) score = F.nutrient[i] + F.moisture[i] - F.pollution[i] * .4;
    else score = 1 - terrain[i] + F.moisture[i];
    if (faction[i] === t) score -= mode === 1 ? 0 : .35;
    if (score > best) { best = score; bestI = i; }
  }
  return xy(bestI);
}

function detectLeaderChange(top) {
  if (!leader) { leader = top; return; }
  if (top !== leader && team[top].share > team[leader].share + .012) {
    const old = leader;
    leader = top;
    const c = cores.find(core => core.team === top);
    emitEvent('leaderChange', `현재 선두가 ${TEAM_NAMES[old]}에서 ${TEAM_NAMES[top]}로 바뀌었습니다.`, c ? c.x : size / 2, c ? c.y : size / 2, 1.6, { team: top });
  }
}

function tryAbilities() {
  for (let t = 1; t <= 4; t++) {
    team[t].abilityCooldown = Math.max(0, team[t].abilityCooldown - 1);
    if (!team[t].active || team[t].energy < 28 || team[t].abilityCooldown > 0) continue;
    if (strategies[t].mode !== 5 && random() > .44) continue;
    if (t === TEAM.EMBER) flameStorm();
    else if (t === TEAM.VOLT) chainLightning();
    else if (t === TEAM.BLOOM) grandBloom();
    else flood();
  }
}

function findHotspot(scoreFn, samples = 420) {
  let best = -Infinity, bestI = randInt(cells);
  for (let k = 0; k < samples; k++) {
    const i = randInt(cells);
    if (collapsed[i]) continue;
    const s = scoreFn(i);
    if (s > best) { best = s; bestI = i; }
  }
  return [bestI, best];
}

function flameStorm() {
  const [i, score] = findHotspot(i => (faction[i] === TEAM.BLOOM ? 1.2 : faction[i] && faction[i] !== TEAM.EMBER ? .45 : 0) + F.nutrient[i] + F.temperature[i] * .3 - F.moisture[i]);
  if (score < .55) return;
  const [x, y] = xy(i);
  team[TEAM.EMBER].energy -= 28;
  team[TEAM.EMBER].abilityCooldown = Math.max(14, 26 - apocalypsePhase * 4);
  forCircle(x, y, 6.5, (ci, cx, cy, d) => {
    const f = 1 - d / 6.5;
    F.temperature[ci] = clamp(F.temperature[ci] + .42 * f);
    F.moisture[ci] = clamp(F.moisture[ci] - .24 * f);
    if (faction[ci] === TEAM.BLOOM) { F.mass[ci] *= 1 - .52 * f; F.nutrient[ci] = clamp(F.nutrient[ci] + .12 * f); materialState[ci] = 7; }
    F.change[ci] = Math.max(F.change[ci], f);
  });
  emitEvent('flameStorm', '빨강의 화염 폭풍이 생물질 밀집 지역을 태웁니다.', x, y, 2.35, { team: TEAM.EMBER, radius: 7, warning: true });
}

function chainLightning() {
  const [start] = findHotspot(i => faction[i] === TEAM.VOLT ? F.charge[i] + F.conductivity[i] + F.moisture[i] * .5 : -1);
  let current = start;
  const visited = new Set([current]);
  const path = [];
  let chain = 0;
  for (let step = 0; step < 36; step++) {
    const [x, y] = xy(current);
    path.push([x, y]);
    F.charge[current] = clamp(F.charge[current] + .4 * (1 - step / 42));
    if (faction[current] && faction[current] !== TEAM.VOLT) {
      F.mass[current] *= .72 + step / 140;
      F.temperature[current] = clamp(F.temperature[current] + .12);
      chain++;
    }
    let next = -1, best = -Infinity;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const ni = idx(nx, ny);
      if (visited.has(ni) || collapsed[ni]) continue;
      const target = faction[ni] && faction[ni] !== TEAM.VOLT ? .6 : 0;
      const score = F.conductivity[ni] * .7 + F.moisture[ni] * .62 + target - Math.hypot(ox, oy) * .05 + random() * .08;
      if (score > best) { best = score; next = ni; }
    }
    if (next < 0 || best < .36 + step * .007) break;
    visited.add(next);
    current = next;
  }
  if (path.length < 5) return;
  team[TEAM.VOLT].energy -= 28;
  team[TEAM.VOLT].abilityCooldown = Math.max(15, 27 - apocalypsePhase * 4);
  team[TEAM.VOLT].maxChain = Math.max(team[TEAM.VOLT].maxChain, path.length);
  const origin = path[0];
  emitEvent('chainLightning', `노랑의 연쇄 번개가 ${path.length}개 전도 노드를 타고 튕겼습니다.`, origin[0], origin[1], 2.4, { team: TEAM.VOLT, path, chain });
}

function grandBloom() {
  const [i, score] = findHotspot(i => F.nutrient[i] * .9 + F.moisture[i] * .65 + (faction[i] === TEAM.BLOOM ? .25 : 0) - F.temperature[i] * .25);
  if (score < .7) return;
  const [x, y] = xy(i);
  let converted = 0;
  forCircle(x, y, 7, (ci, cx, cy, d) => {
    const f = 1 - d / 7;
    if (F.nutrient[ci] + F.moisture[ci] > .68 && faction[ci] !== TEAM.EMBER && random() < f * .7) {
      if (faction[ci] !== TEAM.BLOOM) converted++;
      faction[ci] = TEAM.BLOOM;
      F.mass[ci] = Math.max(F.mass[ci], .25 + f * .48);
      materialState[ci] = 2;
    }
    F.nutrient[ci] = clamp(F.nutrient[ci] - .22 * f);
    F.change[ci] = Math.max(F.change[ci], f);
  });
  team[TEAM.BLOOM].energy -= 28;
  team[TEAM.BLOOM].abilityCooldown = Math.max(16, 29 - apocalypsePhase * 4);
  emitEvent('grandBloom', `초록의 대개화가 ${converted}개 셀을 생체망으로 엮었습니다.`, x, y, 2.25, { team: TEAM.BLOOM, radius: 7, spores: 28 });
}

function flood() {
  const candidates = cores.filter(c => c.team === TEAM.TIDE);
  if (!candidates.length) return;
  const origin = sample(candidates);
  let frontier = [idx(origin.x, origin.y)];
  const visited = new Set(frontier);
  const path = [[origin.x, origin.y]];
  let flooded = 0;
  for (let step = 0; step < 48 && frontier.length; step++) {
    let best = -1, bestScore = Infinity;
    for (const current of frontier) {
      const [x, y] = xy(current);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (Math.abs(ox) + Math.abs(oy) !== 1) continue;
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const ni = idx(nx, ny);
        if (visited.has(ni) || collapsed[ni]) continue;
        const score = terrain[ni] - F.moisture[ni] * .22 + (faction[ni] === TEAM.TIDE ? -.12 : 0) + random() * .05;
        if (score < bestScore) { bestScore = score; best = ni; }
      }
    }
    if (best < 0) break;
    visited.add(best);
    frontier = [best];
    const [bx, by] = xy(best);
    path.push([bx, by]);
    F.moisture[best] = Math.max(F.moisture[best], .76);
    F.temperature[best] = clamp(F.temperature[best] - .1);
    if (faction[best] === TEAM.EMBER || !faction[best]) {
      faction[best] = TEAM.TIDE;
      F.mass[best] = Math.max(F.mass[best], .27);
      flooded++;
    }
    materialState[best] = F.temperature[best] < .27 ? 4 : 3;
    F.change[best] = 1;
  }
  team[TEAM.TIDE].energy -= 28;
  team[TEAM.TIDE].abilityCooldown = Math.max(15, 27 - apocalypsePhase * 4);
  emitEvent('flood', `파랑의 범람이 저지대를 따라 ${flooded}개 구역을 덮칩니다.`, origin.x, origin.y, 2.3, { team: TEAM.TIDE, path, radius: 5 });
}

function updateCores() {
  const survivors = [];
  for (const core of cores) {
    core.age += DT;
    team[core.team].longestCore = Math.max(team[core.team].longestCore, core.age);
    const i = idx(core.x, core.y);
    const owner = faction[i];
    if (owner !== core.team) core.hp -= (3.4 + F.mass[i] * 7.5) * DT;
    else {
      const resource = coreResource(core.team, i);
      core.hp = Math.min(100, core.hp + (.22 + resource * .38) * DT);
      team[core.team].energy += (.008 + resource * .008) * DT;
      F.mass[i] = Math.max(F.mass[i], .78);
      if (tickNumber % 12 === 0) pulseCore(core);
    }
    if (core.hp <= 0) {
      const attacker = owner || strongestNeighbor(core.x, core.y, core.team);
      if (attacker) team[attacker].coreKills++;
      team[core.team].cores = Math.max(0, team[core.team].cores - 1);
      emitEvent('coreDestroyed', `${TEAM_NAMES[core.team]} 코어가 붕괴했습니다${attacker ? ` — ${TEAM_NAMES[attacker]}가 에너지를 흡수합니다.` : '.'}`, core.x, core.y, 3, { team: core.team, attacker, radius: 8 });
      explode(core.x, core.y, 4.2, attacker, .35);
      if (attacker) team[attacker].energy += 14;
      continue;
    }
    survivors.push(core);
  }
  cores = survivors;

  if (tickNumber % 50 === 0) {
    for (let t = 1; t <= 4; t++) {
      const coreCount = cores.filter(c => c.team === t).length;
      if (team[t].active && team[t].energy > 86 + coreCount * 34 && coreCount < 3) {
        const spot = findCoreSite(t);
        if (spot) { team[t].energy -= 70 + coreCount * 18; createCore(t, spot[0], spot[1], false); }
      } else if (team[t].active && coreCount === 0 && team[t].count > size && team[t].energy > 48 && random() < .38) {
        const spot = findCoreSite(t);
        if (spot) { team[t].energy -= 44; createCore(t, spot[0], spot[1], false); }
      }
    }
  }
}

function coreResource(t, i) {
  if (t === TEAM.EMBER) return clamp(F.temperature[i] + F.nutrient[i] - F.moisture[i]);
  if (t === TEAM.VOLT) return clamp(F.charge[i] + F.conductivity[i]);
  if (t === TEAM.BLOOM) return clamp(F.nutrient[i] + F.moisture[i] - F.pollution[i]);
  return clamp(F.moisture[i] + (1 - terrain[i]) - F.temperature[i] * .3);
}

function pulseCore(core) {
  forCircle(core.x, core.y, 3.3, (i, x, y, d) => {
    if (faction[i] === core.team) F.mass[i] = clamp(F.mass[i] + .02 * (1 - d / 3.3));
    if (core.team === TEAM.EMBER) F.temperature[i] = clamp(F.temperature[i] + .012);
    else if (core.team === TEAM.VOLT) { F.charge[i] = clamp(F.charge[i] + .014); F.conductivity[i] = clamp(F.conductivity[i] + .002); }
    else if (core.team === TEAM.BLOOM) F.nutrient[i] = clamp(F.nutrient[i] + .006);
    else F.moisture[i] = clamp(F.moisture[i] + .009);
  });
}

function strongestNeighbor(x, y, except) {
  const power = [0, 0, 0, 0, 0];
  forCircle(x, y, 3, i => { if (faction[i] && faction[i] !== except) power[faction[i]] += F.mass[i]; });
  let best = 0;
  for (let t = 1; t <= 4; t++) if (power[t] > power[best]) best = t;
  return best;
}

function findCoreSite(t) {
  let best = -Infinity, result = null;
  for (let k = 0; k < 650; k++) {
    const i = randInt(cells);
    if (faction[i] !== t || F.mass[i] < .48 || collapsed[i]) continue;
    const [x, y] = xy(i);
    let minDistance = Infinity;
    for (const core of cores) minDistance = Math.min(minDistance, Math.hypot(core.x - x, core.y - y));
    if (minDistance < size * .14) continue;
    let allies = 0, enemies = 0;
    forCircle(x, y, 4, ci => { if (faction[ci] === t) allies++; else if (faction[ci]) enemies++; });
    const score = startSuitability(t, i) + allies * .02 - enemies * .06 + Math.min(1, minDistance / size) * .2;
    if (score > best) { best = score; result = [x, y]; }
  }
  return best > .7 ? result : null;
}

function explode(x, y, radius, owner, force) {
  forCircle(x, y, radius, (i, cx, cy, d) => {
    const f = 1 - d / radius;
    F.mass[i] *= 1 - force * f;
    F.temperature[i] = clamp(F.temperature[i] + force * .45 * f);
    F.moisture[i] = clamp(F.moisture[i] - force * .25 * f);
    F.pollution[i] = clamp(F.pollution[i] + force * .32 * f);
    F.nutrient[i] = clamp(F.nutrient[i] + force * .12 * f);
    terrain[i] = clamp(terrain[i] - force * .06 * f);
    F.change[i] = Math.max(F.change[i], f);
    if (F.mass[i] < .05) faction[i] = 0;
  });
}

function updateMetrics(initial) {
  const counts = [0, 0, 0, 0, 0];
  let valid = 0;
  for (let i = 0; i < cells; i++) {
    if (collapsed[i]) continue;
    valid++;
    if (faction[i]) counts[faction[i]]++;
  }
  for (let t = 1; t <= 4; t++) {
    team[t].count = counts[t];
    team[t].share = valid ? counts[t] / valid : 0;
    team[t].peak = Math.max(team[t].peak, team[t].share);
    if (!initial && tickNumber % 10 === 0) { team[t].averageSum += team[t].share; team[t].averageSamples++; }
    const hasCore = cores.some(c => c.team === t);
    if (!counts[t] && !hasCore) team[t].zeroTime += DT;
    else team[t].zeroTime = 0;
    if (team[t].active && team[t].zeroTime > 2.5) {
      team[t].active = false;
      team[t].extinctAt = elapsed;
      emitEvent('elimination', `${TEAM_NAMES[t]} 세력의 마지막 물질이 소멸했습니다.`, strategies[t].targetX, strategies[t].targetY, 2.8, { team: t });
    }
  }
}

function captureHistory() {
  if (elapsed < nextHistoryAt) return;
  nextHistoryAt = elapsed + 2;
  const shares = [team[1].share, team[2].share, team[3].share, team[4].share];
  for (let t = 1; t <= 4; t++) {
    const swing = Math.abs(shares[t - 1] - lastHistoryShares[t]);
    team[t].maxSwing = Math.max(team[t].maxSwing || 0, swing);
    lastHistoryShares[t] = shares[t - 1];
  }
  history.push({ time: elapsed, shares });
  if (history.length > 220) history.shift();
  timelapse.push(captureTerritoryFrame(48));
  if (timelapse.length > 100) timelapse.shift();
}

function captureTerritoryFrame(outSize) {
  const data = new Uint8Array(outSize * outSize);
  for (let y = 0; y < outSize; y++) for (let x = 0; x < outSize; x++) {
    const sx = Math.min(size - 1, Math.floor((x + .5) / outSize * size));
    const sy = Math.min(size - 1, Math.floor((y + .5) / outSize * size));
    data[y * outSize + x] = collapsed[idx(sx, sy)] ? 5 : faction[idx(sx, sy)];
  }
  return data;
}

function updateApocalypse() {
  const ratio = elapsed / config.duration;
  const phase = ratio >= .96 ? 4 : ratio >= .92 ? 3 : ratio >= .87 ? 2 : ratio >= .82 ? 1 : 0;
  if (phase > apocalypsePhase) {
    apocalypsePhase = phase;
    const messages = ['', '종말 1단계 — 맵 외곽이 서서히 붕괴합니다.', '종말 2단계 — 환경 자원 생성량이 감소합니다.', '종말 3단계 — 중앙부의 에너지가 폭주합니다.', '종말 4단계 — 모든 특수 능력의 주기가 짧아집니다.'];
    emitEvent('apocalypse', messages[phase], size / 2, size / 2, 2 + phase * .15, { radius: size * .3 });
  }
  if (apocalypsePhase) {
    const progress = clamp((ratio - .82) / .18);
    const collapseMargin = progress * size * .12;
    for (let k = 0; k < 2 + apocalypsePhase * 2; k++) {
      const edge = randInt(4);
      let x, y;
      if (edge === 0) { x = randInt(size); y = randInt(Math.max(1, Math.ceil(collapseMargin))); }
      else if (edge === 1) { x = size - 1 - randInt(Math.max(1, Math.ceil(collapseMargin))); y = randInt(size); }
      else if (edge === 2) { x = randInt(size); y = size - 1 - randInt(Math.max(1, Math.ceil(collapseMargin))); }
      else { x = randInt(Math.max(1, Math.ceil(collapseMargin))); y = randInt(size); }
      const i = idx(x, y);
      collapsed[i] = 1; faction[i] = 0; F.mass[i] = 0; F.change[i] = 1;
    }
    if (apocalypsePhase >= 3) {
      const cx = size / 2 + (random() - .5) * size * .18;
      const cy = size / 2 + (random() - .5) * size * .18;
      forCircle(cx, cy, 3, i => { F.charge[i] = clamp(F.charge[i] + .018); F.nutrient[i] = clamp(F.nutrient[i] + .008); F.temperature[i] = clamp(F.temperature[i] + .006); });
    }
  }
}

function checkVictory() {
  if (gameOver || elapsed < 12) return;
  let top = 1;
  for (let t = 2; t <= 4; t++) if (team[t].share > team[top].share) top = t;
  if (team[top].share >= .7) leaderHold += DT;
  else leaderHold = 0;
  const alive = [1, 2, 3, 4].filter(t => team[t].active);
  if (leaderHold >= 15) finishMatch(top, '전체 유효 영토의 70%를 15초간 유지');
  else if (alive.length <= 1) finishMatch(alive[0] || top, '나머지 세 세력 완전 소멸');
  else if (elapsed >= config.duration) {
    const scores = [0];
    for (let t = 1; t <= 4; t++) scores[t] = scoreTeam(t);
    let winner = 1;
    for (let t = 2; t <= 4; t++) if (scores[t] > scores[winner]) winner = t;
    finishMatch(winner, '제한 시간 종합 점수 우세', scores);
  }
}

function scoreTeam(t) {
  const s = team[t];
  const average = s.averageSamples ? s.averageSum / s.averageSamples : s.share;
  const coreCount = cores.filter(c => c.team === t).length;
  return s.share * 52 + average * 18 + s.peak * 10 + coreCount * 3.5 + Math.min(4, s.energy / 55) + s.coreKills * 4 + (s.active ? 4 : 0) + environmentStability(t) * 5;
}

function environmentStability(t) {
  let total = 0, n = 0;
  const stride = Math.max(1, Math.floor(cells / 600));
  for (let i = 0; i < cells; i += stride) if (faction[i] === t) {
    total += 1 - Math.abs(F.change[i] - .18) - F.pollution[i] * .25;
    n++;
  }
  return n ? clamp(total / n) : 0;
}

function finishMatch(winner, reason, scores = null) {
  gameOver = true;
  running = false;
  if (!scores) scores = [0, scoreTeam(1), scoreTeam(2), scoreTeam(3), scoreTeam(4)];
  const maxChain = Math.max(team[1].maxChain, team[2].maxChain, team[3].maxChain, team[4].maxChain);
  const maxSwing = Math.max(team[1].maxSwing || 0, team[2].maxSwing || 0, team[3].maxSwing || 0, team[4].maxSwing || 0);
  const longestCore = Math.max(...team.slice(1).map(t => t.longestCore));
  const finalFrame = captureTerritoryFrame(48);
  timelapse.push(finalFrame);
  const result = {
    winner, winnerName: TEAM_NAMES[winner], reason, seed: seedText, elapsed,
    disasterCount, maxChain, maxSwing, longestCore, history,
    teams: team.slice(1).map(t => ({ id: t.id, share: t.share, peak: t.peak, energy: t.energy, coreKills: t.coreKills, score: scores[t.id], active: t.active })),
    timelapse: timelapse.map(frame => frame.buffer)
  };
  if (!headless) {
    postMessage({ type: 'gameover', result }, result.timelapse);
  }
}

function applyDisaster(type, manual) {
  if (!DISASTER_TEXT[type] || gameOver) return false;
  const x = Math.floor(size * (.18 + random() * .64));
  const y = Math.floor(size * (.18 + random() * .64));
  disasterCount++;
  if (type === 'rain') worldEvent = { type, time: 14, strength: 1 };
  else if (type === 'drought') worldEvent = { type, time: 13, strength: 1 };
  else if (type === 'heatwave') worldEvent = { type, time: 12, strength: 1 };
  else if (type === 'freeze') worldEvent = { type, time: 12, strength: 1 };
  else if (type === 'storm') {
    worldEvent = { type, time: 12, strength: 1 };
    for (let k = 0; k < 18; k++) {
      const i = randInt(cells);
      if (F.conductivity[i] + F.moisture[i] > .8) { F.charge[i] = 1; F.temperature[i] = clamp(F.temperature[i] + .1); F.change[i] = 1; }
    }
  } else if (type === 'nutrient') {
    forCircle(x, y, 11, (i, cx, cy, d) => { const f = 1 - d / 11; F.nutrient[i] = clamp(F.nutrient[i] + .65 * f); F.change[i] = Math.max(F.change[i], f); });
    worldEvent = { type, time: 8, strength: 1 };
  } else if (type === 'meteor') {
    explode(x, y, 8, 0, .72);
    forCircle(x, y, 8, (i, cx, cy, d) => { terrain[i] = clamp(terrain[i] - .22 * (1 - d / 8)); F.conductivity[i] = clamp(F.conductivity[i] + .3 * (1 - d / 8)); });
    worldEvent = { type, time: 5, strength: 1 };
  } else if (type === 'vein') {
    const angle = random() * Math.PI * 2;
    for (let s = -size * .28; s < size * .28; s += .6) {
      const vx = Math.round(x + Math.cos(angle) * s + (random() - .5) * 2);
      const vy = Math.round(y + Math.sin(angle) * s + (random() - .5) * 2);
      if (vx >= 0 && vx < size && vy >= 0 && vy < size) { const i = idx(vx, vy); F.conductivity[i] = clamp(F.conductivity[i] + .72); terrain[i] = clamp(terrain[i] + .05); F.change[i] = 1; }
    }
    worldEvent = { type, time: 8, strength: 1 };
  } else if (type === 'sink') {
    forCircle(x, y, 10, (i, cx, cy, d) => { const f = 1 - d / 10; terrain[i] = clamp(terrain[i] - .3 * f); F.moisture[i] = clamp(F.moisture[i] + .22 * f); F.change[i] = Math.max(F.change[i], f); });
    worldEvent = { type, time: 8, strength: 1 };
  } else if (type === 'wind') {
    const a = random() * Math.PI * 2;
    worldEvent = { type, time: 14, strength: 1, windX: Math.cos(a), windY: Math.sin(a) };
  }
  emitEvent(`disaster-${type}`, `${manual ? '관찰자가 개입했습니다 — ' : ''}${DISASTER_TEXT[type]}`, x, y, manual ? 2.4 : 1.9, { radius: type === 'meteor' ? 9 : 13, disaster: type });
  return true;
}

function emitEvent(kind, text, x, y, importance = 1, extra = {}) {
  if (headless) return;
  const key = `${kind}:${text.slice(0, 18)}`;
  const previous = recentEvents.get(key) || -999;
  if (elapsed - previous < (importance >= 2 ? 1.5 : 4)) return;
  recentEvents.set(key, elapsed);
  if (recentEvents.size > 80) {
    for (const [k, time] of recentEvents) if (elapsed - time > 20) recentEvents.delete(k);
  }
  postMessage({ type: 'event', event: { kind, text, x, y, importance, time: elapsed, ...extra } });
}

function sendFrame(force = false) {
  if (headless || !F || (!running && !gameOver)) return;
  const now = performance.now();
  if (!force && now - lastFrame < 95) return;
  lastFrame = now;
  const stateData = new Uint8Array(cells * 4);
  const envData = new Uint8Array(cells * 4);
  const detailData = new Uint8Array(cells * 4);
  let active = 0;
  for (let i = 0, p = 0; i < cells; i++, p += 4) {
    stateData[p] = collapsed[i] ? 255 : faction[i] * 48;
    stateData[p + 1] = Math.round(F.mass[i] * 255);
    stateData[p + 2] = materialState[i] * 30;
    stateData[p + 3] = Math.round(F.change[i] * 255);
    envData[p] = Math.round(terrain[i] * 255);
    envData[p + 1] = Math.round(F.temperature[i] * 255);
    envData[p + 2] = Math.round(F.moisture[i] * 255);
    envData[p + 3] = Math.round(F.charge[i] * 255);
    detailData[p] = Math.round(F.nutrient[i] * 255);
    detailData[p + 1] = Math.round(F.conductivity[i] * 255);
    detailData[p + 2] = Math.round(F.pollution[i] * 255);
    detailData[p + 3] = Math.round(F.change[i] * 255);
    if (faction[i]) active++;
  }
  postMessage({
    type: 'frame', size, elapsed, phase: apocalypsePhase, speed: baseSpeed,
    stateData: stateData.buffer, envData: envData.buffer, detailData: detailData.buffer,
    teams: team.slice(1).map(t => ({ id: t.id, share: t.share, energy: t.energy, cores: cores.filter(c => c.team === t.id).length, active: t.active })),
    cores: cores.map(c => ({ team: c.team, x: c.x, y: c.y, hp: c.hp })),
    strategies: strategies.slice(1), active, tps: measuredTps
  }, [stateData.buffer, envData.buffer, detailData.buffer]);
}

function runLoop(now) {
  const realDelta = Math.min(.25, Math.max(0, (now - lastReal) / 1000));
  lastReal = now;
  if (cinematicUntil && now >= cinematicUntil) { cinematicScale = 1; cinematicUntil = 0; }
  if (running && !paused) {
    accumulator += realDelta * baseSpeed * cinematicScale;
    let steps = 0;
    while (accumulator >= DT && steps < 14) {
      updateTick();
      accumulator -= DT;
      steps++;
      tpsCounter++;
    }
    if (steps === 14) accumulator = Math.min(accumulator, DT * 2);
  }
  if (now - tpsClock >= 1000) {
    measuredTps = Math.round(tpsCounter * 1000 / (now - tpsClock));
    tpsCounter = 0;
    tpsClock = now;
  }
  sendFrame(false);
}

setInterval(() => runLoop(performance.now()), 16);

onmessage = event => {
  const msg = event.data || {};
  if (msg.type === 'init' || msg.type === 'restart') initializeMatch(msg);
  else if (msg.type === 'pause') paused = !!msg.value;
  else if (msg.type === 'speed') baseSpeed = [1, 2, 4].includes(+msg.value) ? +msg.value : 1;
  else if (msg.type === 'cinematic') {
    cinematicScale = clamp(+msg.scale || .25, .15, 1);
    cinematicUntil = performance.now() + clamp(+msg.duration || 1400, 300, 2500);
  } else if (msg.type === 'disaster') {
    const ok = applyDisaster(msg.disaster, true);
    postMessage({ type: 'disasterResult', ok, disaster: msg.disaster });
  } else if (msg.type === 'visibility') {
    paused = !!msg.hidden || !!msg.paused;
    accumulator = 0;
    lastReal = performance.now();
  } else if (msg.type === 'run-balance-test') {
    runBalanceTest(clamp(+msg.count || 24, 8, 60), clamp(+msg.seconds || 100, 30, 240));
  }
};

// Hidden developer test: runs the same cell update without graphics over many seeds.
function runBalanceTest(count, seconds) {
  const original = { size, duration: config.duration, disasterFrequency: config.disasterFrequency, seed: seedText };
  const wins = [0, 0, 0, 0, 0];
  const shareSums = [0, 0, 0, 0, 0];
  const peakSums = [0, 0, 0, 0, 0];
  const scoreSums = [0, 0, 0, 0, 0];
  const durations = [];
  const started = performance.now();
  headless = true;
  for (let n = 0; n < count; n++) {
    initializeMatch({ size: 80, duration: seconds, disasterFrequency: 'normal', seed: `AUTO-${seedValue.toString(16)}-${n}` });
    const ticks = Math.floor(seconds / DT);
    for (let t = 0; t < ticks && !gameOver; t++) updateTick();
    let winner = 1, best = scoreTeam(1); scoreSums[1] += best;
    for (let k = 2; k <= 4; k++) { const score = scoreTeam(k); scoreSums[k] += score; if (score > best) { best = score; winner = k; } }
    wins[winner]++;
    for (let k = 1; k <= 4; k++) { shareSums[k] += team[k].share; peakSums[k] += team[k].peak; }
    durations.push(elapsed);
  }
  const report = {
    count, seconds, wins: wins.slice(1),
    averageFinalShares: shareSums.slice(1).map(v => v / count),
    averagePeaks: peakSums.slice(1).map(v => v / count),
    averageScores: scoreSums.slice(1).map(v => v / count),
    averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    runtimeMs: performance.now() - started
  };
  headless = false;
  initializeMatch(original);
  postMessage({ type: 'balanceResult', report });
}

self.__runCellularBalanceTest = runBalanceTest;
