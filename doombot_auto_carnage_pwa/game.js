(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const fmt = (number, places = 2) => String(Math.max(0, Math.floor(number))).padStart(places, '0');

  class RNG {
    constructor(seed) { this.seed = seed >>> 0 || 0x6d2b79f5; }
    next() {
      let t = this.seed += 0x6d2b79f5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
    pick(array) { return array[Math.floor(this.next() * array.length)]; }
    chance(probability) { return this.next() < probability; }
  }

  const WEAPONS = [
    { name: 'IRON-9',      glyph: '⌐', kind: 'hitscan', damage: 18, rate: .34, spread: .018, pellets: 1, range: 14, ammo: Infinity, max: Infinity, use: 0, color: '#ffe7a0', recoil: 1.0 },
    { name: 'TRENCH-12',   glyph: '═', kind: 'hitscan', damage: 11, rate: .78, spread: .115, pellets: 7, range: 8, ammo: 42, max: 64, use: 1, color: '#ffb14a', recoil: 2.5 },
    { name: 'RIPPER MG',   glyph: '≡', kind: 'hitscan', damage: 9,  rate: .095, spread: .035, pellets: 1, range: 13, ammo: 180, max: 260, use: 1, color: '#fff1ad', recoil: .65 },
    { name: 'VOLT LANCE',  glyph: '⋙', kind: 'plasma',  damage: 25, rate: .18, spread: .012, pellets: 1, range: 18, ammo: 110, max: 180, use: 2, color: '#55eaff', recoil: .7, speed: 11, splash: .65 },
    { name: 'HELLROCKET',  glyph: '▻', kind: 'rocket',  damage: 66, rate: .92, spread: .008, pellets: 1, range: 20, ammo: 18, max: 30, use: 1, color: '#ff652e', recoil: 2.9, speed: 8, splash: 2.5 },
    { name: 'RAIL SPIKE',  glyph: '⟿', kind: 'rail',    damage: 82, rate: 1.12, spread: 0, pellets: 1, range: 24, ammo: 16, max: 24, use: 1, color: '#c88cff', recoil: 3.1 },
    { name: 'SUNBREAKER',  glyph: '✹', kind: 'nova',    damage: 58, rate: 2.3, spread: 0, pellets: 1, range: 10, ammo: 5, max: 8, use: 1, color: '#dfff35', recoil: 4.0 }
  ];

  const ENEMY_TYPES = [
    { key: 'raider',  className: 'RIFLE FIEND', name: '황무지 사수', hp: 54, speed: 1.25, damage: 7, range: 8.5, rate: 1.15, radius: .25, score: 100, color: '#c84e34', projectile: null },
    { key: 'ember',   className: 'EMBER IMP',   name: '잿불 임프',   hp: 72, speed: 1.05, damage: 12, range: 7.5, rate: 1.55, radius: .27, score: 160, color: '#ff7938', projectile: 'ember' },
    { key: 'mauler',  className: 'MAULER',      name: '강철 사냥개', hp: 105, speed: 2.05, damage: 16, range: 1.05, rate: .92, radius: .34, score: 220, color: '#ef3f48', projectile: null },
    { key: 'watcher', className: 'VOID WATCHER',name: '공허의 눈',   hp: 138, speed: .82, damage: 15, range: 9.5, rate: 1.75, radius: .37, score: 330, color: '#8c67ff', projectile: 'void' },
    { key: 'warden',  className: 'SIEGE WARDEN',name: '공성 집행자', hp: 255, speed: .65, damage: 25, range: 11, rate: 2.15, radius: .43, score: 600, color: '#9ab65b', projectile: 'missile' }
  ];

  const UI = {
    glCanvas: $('#glCanvas'), miniMap: $('#miniMap'), boot: $('#boot'), bootStatus: $('#bootStatus'), bootButton: $('#bootButton'),
    missionLabel: $('#missionLabel'), objectiveText: $('#objectiveText'), threatBar: $('#threatBar'), enemyCount: $('#enemyCount'), fps: $('#fpsReadout'),
    mapState: $('#mapState'), seedLabel: $('#seedLabel'), combatLog: $('#combatLog'), targetCard: $('#targetCard'), targetClass: $('#targetClass'),
    targetDistance: $('#targetDistance'), targetName: $('#targetName'), targetHealth: $('#targetHealth'), healthValue: $('#healthValue'), healthBar: $('#healthBar'),
    armorValue: $('#armorValue'), armorBar: $('#armorBar'), weaponMode: $('#weaponMode'), weaponName: $('#weaponName'), ammoValue: $('#ammoValue'),
    weaponRack: $('#weaponRack'), killValue: $('#killValue'), waveValue: $('#waveValue'), breakValue: $('#breakValue'), pauseButton: $('#pauseButton'),
    modeButton: $('#modeButton'), overdriveButton: $('#overdriveButton'), speedButton: $('#speedButton'), soundButton: $('#soundButton'), moreButton: $('#moreButton'),
    toast: $('#toast'), overlay: $('#missionOverlay'), overlayKicker: $('#overlayKicker'), overlayTitle: $('#overlayTitle'), overlayKills: $('#overlayKills'),
    overlayTime: $('#overlayTime'), overlayAccuracy: $('#overlayAccuracy'), overlayNext: $('#overlayNext'), dialog: $('#settingsDialog'), effectsSelect: $('#effectsSelect'),
    mapZoom: $('#mapZoom'), fullscreenButton: $('#fullscreenButton'), newMissionButton: $('#newMissionButton'), installButton: $('#installButton')
  };

  class AudioCore {
    constructor() {
      this.context = null;
      this.master = null;
      this.noise = null;
      this.enabled = false;
    }
    async toggle(force) {
      this.enabled = force ?? !this.enabled;
      if (this.enabled && !this.context) this.init();
      if (this.context?.state === 'suspended' && this.enabled) await this.context.resume().catch(() => {});
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .18 : 0, this.context.currentTime, .02);
      return this.enabled;
    }
    init() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? .18 : 0;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * .7, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    }
    tone(freq, duration, type = 'square', gain = .18, slide = 1) {
      if (!this.enabled || !this.context) return;
      const t = this.context.currentTime;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + duration);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(amp).connect(this.master);
      osc.start(t); osc.stop(t + duration);
    }
    burst(duration = .1, gain = .2, cutoff = 900) {
      if (!this.enabled || !this.context || !this.noise) return;
      const t = this.context.currentTime;
      const src = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const amp = this.context.createGain();
      src.buffer = this.noise;
      filter.type = 'lowpass'; filter.frequency.value = cutoff;
      amp.gain.setValueAtTime(gain, t); amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
      src.connect(filter).connect(amp).connect(this.master);
      src.start(t); src.stop(t + duration);
    }
    shot(index) {
      const patterns = [
        () => { this.tone(160, .09, 'square', .12, .45); this.burst(.06, .08, 1400); },
        () => { this.burst(.22, .32, 700); this.tone(95, .18, 'sawtooth', .13, .38); },
        () => { this.tone(125, .045, 'square', .08, .62); this.burst(.035, .05, 1900); },
        () => { this.tone(440, .11, 'sawtooth', .08, 1.8); },
        () => { this.burst(.25, .3, 420); this.tone(75, .24, 'square', .18, .3); },
        () => { this.tone(920, .16, 'sawtooth', .15, .13); this.burst(.12, .12, 2600); },
        () => { this.tone(220, .45, 'sawtooth', .12, 3.4); this.burst(.38, .18, 1200); }
      ];
      patterns[index]?.();
    }
    impact(heavy = false) { this.tone(heavy ? 62 : 110, heavy ? .22 : .08, 'square', heavy ? .14 : .06, .5); if (heavy) this.burst(.2, .18, 500); }
    pickup() { this.tone(550, .07, 'square', .07, 1.7); }
    alert() { this.tone(180, .12, 'sawtooth', .08, .8); setTimeout(() => this.tone(240, .1, 'square', .06, 1), 90); }
  }

  class TacticalMap {
    constructor() {
      this.width = 29;
      this.height = 29;
      this.tiles = new Uint8Array(this.width * this.height);
      this.hp = new Float32Array(this.width * this.height);
      this.rooms = [];
      this.barrels = [];
      this.seed = 0;
      this.rng = new RNG(1);
    }
    index(x, y) { return y * this.width + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
    tile(x, y) {
      x = Math.floor(x); y = Math.floor(y);
      return this.inBounds(x, y) ? this.tiles[this.index(x, y)] : 1;
    }
    solid(x, y) { const tile = this.tile(x, y); return tile === 1 || tile === 2; }
    carveRoom(room) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) this.tiles[this.index(x, y)] = 0;
      }
    }
    carveH(x1, x2, y) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        this.tiles[this.index(x, y)] = 0;
        if (y + 1 < this.height - 1) this.tiles[this.index(x, y + 1)] = 0;
      }
    }
    carveV(y1, y2, x) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        this.tiles[this.index(x, y)] = 0;
        if (x + 1 < this.width - 1) this.tiles[this.index(x + 1, y)] = 0;
      }
    }
    connect(a, b) {
      if (this.rng.chance(.5)) { this.carveH(a.cx, b.cx, a.cy); this.carveV(a.cy, b.cy, b.cx); }
      else { this.carveV(a.cy, b.cy, a.cx); this.carveH(a.cx, b.cx, b.cy); }
    }
    generate(seed) {
      this.seed = seed >>> 0;
      this.rng = new RNG(this.seed);
      this.tiles.fill(1); this.hp.fill(0); this.rooms.length = 0; this.barrels.length = 0;
      const centers = [5, 14, 23];
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          const w = this.rng.int(5, 7), h = this.rng.int(5, 7);
          const x = clamp(Math.round(centers[gx] - w / 2) + this.rng.int(-1, 1), 1, this.width - w - 1);
          const y = clamp(Math.round(centers[gy] - h / 2) + this.rng.int(-1, 1), 1, this.height - h - 1);
          const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), id: gy * 3 + gx };
          this.rooms.push(room); this.carveRoom(room);
        }
      }
      for (let row = 0; row < 3; row++) {
        this.connect(this.rooms[row * 3], this.rooms[row * 3 + 1]);
        this.connect(this.rooms[row * 3 + 1], this.rooms[row * 3 + 2]);
      }
      for (let col = 0; col < 3; col++) {
        this.connect(this.rooms[col], this.rooms[col + 3]);
        this.connect(this.rooms[col + 3], this.rooms[col + 6]);
      }
      this.connect(this.rooms[0], this.rooms[4]);
      this.connect(this.rooms[4], this.rooms[8]);

      const safe = new Set();
      for (const room of this.rooms) {
        safe.add(this.index(room.cx, room.cy));
        safe.add(this.index(room.cx + 1, room.cy));
        safe.add(this.index(room.cx, room.cy + 1));
      }
      const barrierCandidates = [];
      for (let y = 2; y < this.height - 2; y++) {
        for (let x = 2; x < this.width - 2; x++) {
          if (this.tile(x, y) !== 0 || safe.has(this.index(x, y))) continue;
          const lr = this.tile(x - 1, y) === 1 && this.tile(x + 1, y) === 1;
          const ud = this.tile(x, y - 1) === 1 && this.tile(x, y + 1) === 1;
          const inRoom = this.rooms.some(r => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1);
          if (lr || ud || (!inRoom && this.rng.chance(.2))) barrierCandidates.push({ x, y });
        }
      }
      for (let i = barrierCandidates.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i); [barrierCandidates[i], barrierCandidates[j]] = [barrierCandidates[j], barrierCandidates[i]];
      }
      const barriers = barrierCandidates.slice(0, 11);
      for (const barrier of barriers) {
        const index = this.index(barrier.x, barrier.y);
        this.tiles[index] = 2; this.hp[index] = 52;
      }
      const entryRoom=this.rooms[0];
      const starterX=Math.min(entryRoom.x+entryRoom.w-2,entryRoom.cx+2),starterY=entryRoom.cy;
      if(this.tile(starterX,starterY)===0){const index=this.index(starterX,starterY);this.tiles[index]=2;this.hp[index]=52;}

      const floors = [];
      for (let y = 1; y < this.height - 1; y++) for (let x = 1; x < this.width - 1; x++) {
        if (this.tile(x, y) === 0 && Math.hypot(x - this.rooms[0].cx, y - this.rooms[0].cy) > 4) floors.push({ x: x + .5, y: y + .5 });
      }
      for (let i = 0; i < 13 && floors.length; i++) {
        const point = floors.splice(this.rng.int(0, floors.length - 1), 1)[0];
        this.barrels.push({ ...point, hp: 24, radius: .28, alive: true, kind: 'barrel', pulse: this.rng.next() * TAU });
      }
      return this.rooms[0];
    }
    damageBarrier(x, y, damage) {
      const index = this.index(x, y);
      if (this.tiles[index] !== 2) return false;
      this.hp[index] -= damage;
      if (this.hp[index] <= 0) { this.tiles[index] = 0; this.hp[index] = 0; return true; }
      return false;
    }
    randomFloor(rng, minDistanceFrom, occupied = []) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const room = rng.pick(this.rooms.slice(1));
        const point = { x: rng.int(room.x + 1, room.x + room.w - 2) + .5, y: rng.int(room.y + 1, room.y + room.h - 2) + .5 };
        if (minDistanceFrom && distance(point, minDistanceFrom) < 7) continue;
        if (occupied.some(item => distance(item, point) < .8)) continue;
        if (!this.solid(point.x, point.y)) return point;
      }
      return { x: this.rooms[8].cx + .5, y: this.rooms[8].cy + .5 };
    }
    path(startX, startY, goalX, goalY) {
      const sx = clamp(Math.floor(startX), 0, this.width - 1), sy = clamp(Math.floor(startY), 0, this.height - 1);
      const gx = clamp(Math.floor(goalX), 0, this.width - 1), gy = clamp(Math.floor(goalY), 0, this.height - 1);
      const start = this.index(sx, sy), goal = this.index(gx, gy);
      if (start === goal) return [{ x: gx + .5, y: gy + .5 }];
      const total = this.width * this.height;
      const costs = new Float32Array(total); costs.fill(Infinity); costs[start] = 0;
      const came = new Int16Array(total); came.fill(-1);
      const open = [start];
      const inOpen = new Uint8Array(total); inOpen[start] = 1;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      let guard = 0;
      while (open.length && guard++ < total * 3) {
        let bestAt = 0, bestScore = Infinity;
        for (let i = 0; i < open.length; i++) {
          const id = open[i], x = id % this.width, y = Math.floor(id / this.width);
          const score = costs[id] + Math.abs(x - gx) + Math.abs(y - gy);
          if (score < bestScore) { bestScore = score; bestAt = i; }
        }
        const current = open.splice(bestAt, 1)[0]; inOpen[current] = 0;
        if (current === goal) break;
        const cx = current % this.width, cy = Math.floor(current / this.width);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.inBounds(nx, ny)) continue;
          const tile = this.tiles[this.index(nx, ny)];
          if (tile === 1) continue;
          const next = this.index(nx, ny);
          const cost = costs[current] + (tile === 2 ? 5.5 : 1);
          if (cost >= costs[next]) continue;
          costs[next] = cost; came[next] = current;
          if (!inOpen[next]) { open.push(next); inOpen[next] = 1; }
        }
      }
      if (came[goal] < 0) return [];
      const result = [];
      let current = goal;
      while (current !== start && current >= 0) {
        result.push({ x: current % this.width + .5, y: Math.floor(current / this.width) + .5 });
        current = came[current];
      }
      result.reverse();
      return result;
    }
  }

  class RayRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' }) ||
        canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
      this.fallback = this.gl ? null : canvas.getContext('2d', { alpha: false });
      if (!this.gl && !this.fallback) throw new Error('그래픽 화면을 초기화할 수 없습니다.');
      this.scene = document.createElement('canvas');
      this.ctx = this.scene.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;
      this.depth = new Float32Array(320);
      this.width = 320; this.height = 180;
      this.effects = 'high';
      this.spriteCache = this.createSprites();
      if (this.gl) this.setupGL();
      this.resize();
      window.addEventListener('resize', () => this.resize(), { passive: true });
    }
    compile(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    setupGL() {
      const gl = this.gl;
      const vertex = this.compile(gl.VERTEX_SHADER, `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main(){ v_uv = a_pos * .5 + .5; gl_Position = vec4(a_pos, 0., 1.); }
      `);
      const fragment = this.compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying vec2 v_uv;
        uniform sampler2D u_scene;
        uniform float u_time;
        uniform float u_damage;
        uniform float u_fx;
        uniform vec2 u_res;
        void main(){
          vec2 uv = v_uv;
          float shake = u_damage * .0018;
          uv.x += sin(uv.y * 39. + u_time * 44.) * shake;
          float aberr = (.00035 + u_damage * .0014) * u_fx;
          float r = texture2D(u_scene, uv + vec2(aberr,0.)).r;
          float g = texture2D(u_scene, uv).g;
          float b = texture2D(u_scene, uv - vec2(aberr,0.)).b;
          vec3 color = vec3(r,g,b);
          float scan = sin((uv.y * u_res.y) * 3.14159) * .025 * u_fx;
          color -= scan;
          float vignette = 1. - dot(uv - .5, uv - .5) * (.78 + u_fx * .28);
          color *= vignette;
          color += vec3(.36,.015,.0) * u_damage * (1. - vignette * .65);
          float grain = fract(sin(dot(uv * u_res + u_time, vec2(12.9898,78.233))) * 43758.5453);
          color += (grain - .5) * .028 * u_fx;
          gl_FragColor = vec4(max(color,0.),1.);
        }
      `);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.uniformTime = gl.getUniformLocation(this.program, 'u_time');
      this.uniformDamage = gl.getUniformLocation(this.program, 'u_damage');
      this.uniformFx = gl.getUniformLocation(this.program, 'u_fx');
      this.uniformRes = gl.getUniformLocation(this.program, 'u_res');
    }
    resize() {
      const cssW = Math.max(1, innerWidth), cssH = Math.max(1, innerHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(cssW * dpr); this.canvas.height = Math.floor(cssH * dpr);
      const quality = this.effects === 'high' ? .78 : this.effects === 'medium' ? .62 : .48;
      this.width = clamp(Math.round(cssW * quality), 240, 520);
      this.height = clamp(Math.round(this.width * cssH / cssW), 150, 680);
      this.scene.width = this.width; this.scene.height = this.height;
      this.ctx.imageSmoothingEnabled = false;
      this.depth = new Float32Array(this.width);
      if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      else this.fallback.imageSmoothingEnabled = false;
    }
    setEffects(value) { this.effects = value; this.resize(); }
    createCanvas(width = 48, height = 72) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
      return { canvas, ctx };
    }
    createSprites() {
      const cache = {};
      for (const type of ENEMY_TYPES) {
        const { canvas, ctx } = this.createCanvas();
        const color = type.color;
        ctx.shadowBlur = 7; ctx.shadowColor = color;
        if (type.key === 'raider') {
          ctx.fillStyle = '#181b17'; ctx.fillRect(12,32,24,30); ctx.fillRect(9,39,8,20); ctx.fillRect(31,39,8,20);
          ctx.fillStyle = color; ctx.fillRect(15,18,18,17); ctx.fillRect(11,34,26,13);
          ctx.fillStyle = '#e0c59d'; ctx.fillRect(18,20,12,11);
          ctx.fillStyle = '#dfff35'; ctx.fillRect(18,25,4,3); ctx.fillRect(27,25,4,3);
          ctx.fillStyle = '#252a25'; ctx.fillRect(24,42,20,5); ctx.fillRect(36,46,8,3);
          ctx.fillStyle = '#0a0b0a'; ctx.fillRect(13,60,9,10); ctx.fillRect(27,60,9,10);
        } else if (type.key === 'ember') {
          ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(9,27); ctx.lineTo(15,8); ctx.lineTo(20,25); ctx.lineTo(28,25); ctx.lineTo(34,8); ctx.lineTo(39,30); ctx.lineTo(36,57); ctx.lineTo(31,68); ctx.lineTo(17,68); ctx.lineTo(12,57); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#4a1710'; ctx.fillRect(14,34,20,25); ctx.fillStyle = '#ffed72'; ctx.fillRect(16,28,5,4); ctx.fillRect(28,28,5,4);
          ctx.fillStyle = '#ffcf36'; ctx.beginPath(); ctx.arc(40,47,7,0,TAU); ctx.fill();
        } else if (type.key === 'mauler') {
          ctx.fillStyle = '#55151d'; ctx.fillRect(7,39,35,19); ctx.fillStyle = color; ctx.fillRect(12,29,27,22);
          ctx.fillStyle = '#241013'; ctx.beginPath(); ctx.moveTo(33,28); ctx.lineTo(45,36); ctx.lineTo(37,48); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffea67'; ctx.fillRect(35,35,4,3); ctx.fillStyle = '#171515'; ctx.fillRect(7,55,8,14); ctx.fillRect(18,55,8,14); ctx.fillRect(33,54,8,15);
          ctx.strokeStyle = '#eee0d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(39,42); ctx.lineTo(44,46); ctx.moveTo(37,43); ctx.lineTo(41,48); ctx.stroke();
        } else if (type.key === 'watcher') {
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(24,35,20,0,TAU); ctx.fill();
          ctx.fillStyle = '#311d4c'; ctx.beginPath(); ctx.arc(24,35,14,0,TAU); ctx.fill();
          ctx.fillStyle = '#ece2ff'; ctx.beginPath(); ctx.ellipse(24,35,11,8,0,0,TAU); ctx.fill();
          ctx.fillStyle = '#dfff35'; ctx.beginPath(); ctx.arc(24,35,5,0,TAU); ctx.fill();
          ctx.fillStyle = '#050407'; ctx.beginPath(); ctx.arc(24,35,2,0,TAU); ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = 4; for (let i=0;i<6;i++){ const a=i/6*TAU; ctx.beginPath(); ctx.moveTo(24+Math.cos(a)*16,35+Math.sin(a)*16); ctx.lineTo(24+Math.cos(a)*25,35+Math.sin(a)*26); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#38422f'; ctx.fillRect(7,25,34,38); ctx.fillStyle = color; ctx.fillRect(12,17,24,19); ctx.fillRect(3,29,12,22); ctx.fillRect(33,29,12,22);
          ctx.fillStyle = '#161b16'; ctx.fillRect(16,21,16,11); ctx.fillStyle = '#ff463e'; ctx.fillRect(17,25,5,3); ctx.fillRect(27,25,5,3);
          ctx.fillStyle = '#222a21'; ctx.fillRect(10,60,11,11); ctx.fillRect(27,60,11,11); ctx.fillStyle = '#ff7b32'; ctx.fillRect(0,34,8,12); ctx.fillRect(40,34,8,12);
        }
        ctx.shadowBlur = 0;
        cache[type.key] = canvas;
      }
      {
        const { canvas, ctx } = this.createCanvas(32, 56);
        ctx.fillStyle = '#3c3f35'; ctx.fillRect(6,14,20,38); ctx.fillStyle = '#ff722f'; ctx.fillRect(6,17,20,4); ctx.fillRect(6,37,20,4);
        ctx.fillStyle = '#777c67'; ctx.fillRect(9,9,14,6); ctx.fillStyle = '#191b18'; ctx.fillRect(9,23,14,9); ctx.fillRect(9,44,14,5);
        cache.barrel = canvas;
      }
      const pickupSpecs = [['health','#f5f5eb','+'],['armor','#5de8ff','◆'],['ammo','#dfff35','▤']];
      for (const [key,color,glyph] of pickupSpecs) {
        const { canvas, ctx } = this.createCanvas(32, 32);
        ctx.shadowBlur = 8; ctx.shadowColor = color; ctx.fillStyle = color; ctx.fillRect(5,7,22,18); ctx.shadowBlur = 0;
        ctx.fillStyle = '#101411'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph,16,16);
        cache[key] = canvas;
      }
      return cache;
    }
    shade(base, factor) {
      const hex = base.replace('#','');
      const n = parseInt(hex.length === 3 ? hex.split('').map(c=>c+c).join('') : hex,16);
      const r = clamp((n>>16)*factor,0,255)|0, g = clamp(((n>>8)&255)*factor,0,255)|0, b = clamp((n&255)*factor,0,255)|0;
      return `rgb(${r},${g},${b})`;
    }
    drawWorld(game) {
      const ctx = this.ctx, w = this.width, h = this.height, player = game.player, map = game.map;
      const bob = Math.sin(player.bob * 2) * Math.min(3, player.speedNow * 1.3) + player.recoil * .8;
      const horizon = Math.floor(h * .47 + bob);
      const ceiling = ctx.createLinearGradient(0,0,0,horizon);
      ceiling.addColorStop(0,'#050608'); ceiling.addColorStop(1,'#25241c'); ctx.fillStyle = ceiling; ctx.fillRect(0,0,w,horizon);
      const floor = ctx.createLinearGradient(0,horizon,0,h);
      floor.addColorStop(0,'#3b382d'); floor.addColorStop(.18,'#24231d'); floor.addColorStop(1,'#090b0a'); ctx.fillStyle = floor; ctx.fillRect(0,horizon,w,h-horizon);
      ctx.globalAlpha = .16; ctx.fillStyle = '#dfff62';
      for (let y = horizon + 8; y < h; y += Math.max(5, Math.floor((y-horizon)*.16))) ctx.fillRect(0,y,w,1);
      ctx.globalAlpha = 1;

      const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
      const planeScale = Math.tan((70 * Math.PI / 180) / 2);
      const planeX = -dirY * planeScale, planeY = dirX * planeScale;
      for (let x = 0; x < w; x++) {
        const cameraX = 2 * x / w - 1;
        const rayX = dirX + planeX * cameraX, rayY = dirY + planeY * cameraX;
        let mapX = Math.floor(player.x), mapY = Math.floor(player.y);
        const deltaX = Math.abs(1 / (rayX || .00001)), deltaY = Math.abs(1 / (rayY || .00001));
        let sideX, sideY, stepX, stepY;
        if (rayX < 0) { stepX = -1; sideX = (player.x - mapX) * deltaX; } else { stepX = 1; sideX = (mapX + 1 - player.x) * deltaX; }
        if (rayY < 0) { stepY = -1; sideY = (player.y - mapY) * deltaY; } else { stepY = 1; sideY = (mapY + 1 - player.y) * deltaY; }
        let side = 0, tile = 0, steps = 0;
        while (!tile && steps++ < 50) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
          else { sideY += deltaY; mapY += stepY; side = 1; }
          tile = map.tile(mapX, mapY);
        }
        let wallDist = side === 0 ? (mapX - player.x + (1 - stepX) / 2) / (rayX || .00001) : (mapY - player.y + (1 - stepY) / 2) / (rayY || .00001);
        wallDist = Math.max(.05, wallDist); this.depth[x] = wallDist;
        const lineHeight = Math.min(h * 4, h / wallDist);
        const drawStart = Math.floor(horizon - lineHeight * .5), drawEnd = Math.floor(horizon + lineHeight * .5);
        let wallX = side === 0 ? player.y + wallDist * rayY : player.x + wallDist * rayX; wallX -= Math.floor(wallX);
        const fog = clamp(1.1 - wallDist / 20, .16, 1) * (side ? .74 : 1);
        if (tile === 2) {
          const stripe = Math.floor(wallX * 8) % 2;
          ctx.fillStyle = this.shade(stripe ? '#9e3d22' : '#d66a2d', fog);
          ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
          if (Math.floor((drawStart + lineHeight * .22)) % 6 < 2 || Math.floor((drawStart + lineHeight * .72)) % 6 < 2) { ctx.fillStyle = this.shade('#f2aa40', fog); ctx.fillRect(x, drawStart + lineHeight*.23,1,Math.max(1,lineHeight*.035)); ctx.fillRect(x,drawStart+lineHeight*.72,1,Math.max(1,lineHeight*.035)); }
        } else {
          const panel = Math.floor(wallX * 6);
          const mortar = wallX < .025 || wallX > .975;
          const base = mortar ? '#171b18' : panel % 3 === 0 ? '#58604a' : '#454b3f';
          ctx.fillStyle = this.shade(base, fog); ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
          if (panel === 2 && wallDist < 10) { ctx.fillStyle = this.shade('#b9cf43', fog*.7); ctx.fillRect(x, drawStart + lineHeight*.46,1,Math.max(1,lineHeight*.055)); }
        }
        if (wallDist > 11) { ctx.fillStyle = `rgba(5,7,7,${clamp((wallDist-11)/12,0,.74)})`; ctx.fillRect(x,drawStart,1,drawEnd-drawStart); }
      }
      this.drawSprites(game, dirX, dirY, planeX, planeY, horizon);
      this.drawWeapon(game, horizon);
      if (player.damageFlash > 0) { ctx.fillStyle = `rgba(255,30,24,${player.damageFlash*.17})`; ctx.fillRect(0,0,w,h); }
      if (game.overdrive > 0) { ctx.strokeStyle = `rgba(215,255,50,${.12+Math.sin(game.elapsed*12)*.05})`; ctx.lineWidth = 3; ctx.strokeRect(3,3,w-6,h-6); }
    }
    drawSprites(game, dirX, dirY, planeX, planeY, horizon) {
      const objects = [];
      for (const barrel of game.map.barrels) if (barrel.alive) objects.push({ ...barrel, sprite: this.spriteCache.barrel, scale: .72, lift: 0 });
      for (const pickup of game.pickups) objects.push({ ...pickup, sprite: this.spriteCache[pickup.kind], scale: .42, lift: Math.sin(game.elapsed*3 + pickup.phase)*.08 });
      for (const enemy of game.enemies) if (enemy.alive) objects.push({ ...enemy, sprite: this.spriteCache[enemy.type.key], scale: enemy.type.key === 'warden' ? 1.18 : enemy.type.key === 'watcher' ? .92 : .96, lift: enemy.type.key === 'watcher' ? .3 + Math.sin(game.elapsed*2+enemy.phase)*.12 : 0 });
      for (const projectile of game.projectiles) objects.push({ ...projectile, sprite: null, scale: projectile.kind === 'missile' || projectile.kind === 'rocket' ? .22 : .13, lift: .08, glow: projectile.color });
      objects.sort((a,b) => ((b.x-game.player.x)**2+(b.y-game.player.y)**2)-((a.x-game.player.x)**2+(a.y-game.player.y)**2));
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      for (const object of objects) {
        const dx = object.x - game.player.x, dy = object.y - game.player.y;
        const tx = invDet * (dirY * dx - dirX * dy), ty = invDet * (-planeY * dx + planeX * dy);
        if (ty <= .12) continue;
        const screenX = Math.floor((this.width / 2) * (1 + tx / ty));
        const spriteH = Math.abs(Math.floor(this.height / ty * object.scale));
        const spriteW = object.sprite ? Math.floor(spriteH * object.sprite.width / object.sprite.height) : spriteH;
        const y0 = Math.floor(horizon - spriteH / 2 - spriteH * (object.lift || 0));
        const x0 = Math.floor(screenX - spriteW / 2);
        if (x0 > this.width || x0 + spriteW < 0) continue;
        if (!object.sprite) {
          const cx = clamp(screenX,0,this.width-1)|0;
          if (ty < this.depth[cx]) {
            const radius = Math.max(1, spriteH*.32); const gradient = this.ctx.createRadialGradient(screenX,y0+spriteH/2,0,screenX,y0+spriteH/2,radius);
            gradient.addColorStop(0,'#fff'); gradient.addColorStop(.25,object.glow); gradient.addColorStop(1,'rgba(0,0,0,0)'); this.ctx.fillStyle=gradient;
            this.ctx.fillRect(screenX-radius,y0+spriteH/2-radius,radius*2,radius*2);
          }
          continue;
        }
        for (let stripe = Math.max(0,x0); stripe < Math.min(this.width,x0+spriteW); stripe++) {
          if (ty >= this.depth[stripe]) continue;
          const sourceX = Math.floor((stripe-x0) / spriteW * object.sprite.width);
          this.ctx.globalAlpha = object.hurt > 0 ? .72 + Math.sin(game.elapsed*55)*.25 : 1;
          this.ctx.drawImage(object.sprite,sourceX,0,1,object.sprite.height,stripe,y0,1,spriteH);
        }
        this.ctx.globalAlpha = 1;
      }
      for (const particle of game.particles) {
        const dx = particle.x-game.player.x, dy=particle.y-game.player.y;
        const tx=invDet*(dirY*dx-dirX*dy), ty=invDet*(-planeY*dx+planeX*dy);
        if (ty<=.1) continue; const sx=(this.width/2)*(1+tx/ty)|0;
        if (sx<0||sx>=this.width||ty>=this.depth[sx]) continue;
        const size=clamp(particle.size/ty*this.height,1,8); const sy=horizon-(particle.z||0)*this.height/ty;
        this.ctx.globalAlpha=clamp(particle.life*2,0,1); this.ctx.fillStyle=particle.color; this.ctx.fillRect(sx-size/2,sy-size/2,size,size);
      }
      this.ctx.globalAlpha=1;
    }
    drawWeapon(game) {
      const ctx=this.ctx,w=this.width,h=this.height,p=game.player,weapon=WEAPONS[p.weapon];
      const swayX=Math.sin(p.bob)*4, swayY=Math.abs(Math.cos(p.bob))*2;
      const recoil=p.recoil*weapon.recoil*2.2;
      ctx.save(); ctx.translate(w/2+swayX,h+swayY+recoil); ctx.scale(clamp(w/380,.78,1.25),clamp(w/380,.78,1.25));
      ctx.fillStyle='#7b5139'; ctx.fillRect(-54,-22,21,29); ctx.fillRect(33,-22,21,29);
      ctx.fillStyle='#322d29'; ctx.fillRect(-50,-26,18,11); ctx.fillRect(32,-26,18,11);
      ctx.shadowBlur=weapon.kind==='plasma'||weapon.kind==='nova'?12:0; ctx.shadowColor=weapon.color;
      if(p.weapon===0){ ctx.fillStyle='#242824';ctx.fillRect(-14,-70,28,62);ctx.fillStyle='#687064';ctx.fillRect(-10,-78,20,16);ctx.fillStyle='#dfff35';ctx.fillRect(-4,-69,8,3); }
      else if(p.weapon===1){ ctx.fillStyle='#282b27';ctx.fillRect(-29,-75,58,53);ctx.fillStyle='#8b623a';ctx.fillRect(-36,-35,72,16);ctx.fillStyle='#101312';ctx.fillRect(-20,-91,15,64);ctx.fillRect(5,-91,15,64); }
      else if(p.weapon===2){ ctx.fillStyle='#232724';ctx.fillRect(-35,-65,70,44);ctx.fillStyle='#646b5d';ctx.fillRect(-28,-80,56,25);for(let i=-2;i<=2;i++){ctx.fillStyle=i%2?'#0c0e0d':'#4a5048';ctx.fillRect(i*8-3,-98,6,42);}ctx.fillStyle='#dfff35';ctx.fillRect(-5,-61,10,7); }
      else if(p.weapon===3){ ctx.fillStyle='#1c3135';ctx.beginPath();ctx.moveTo(-38,-24);ctx.lineTo(-27,-71);ctx.lineTo(-13,-86);ctx.lineTo(13,-86);ctx.lineTo(27,-71);ctx.lineTo(38,-24);ctx.closePath();ctx.fill();ctx.fillStyle='#55eaff';ctx.fillRect(-10,-79,20,46);ctx.fillStyle='#b4fbff';ctx.fillRect(-4,-91,8,22); }
      else if(p.weapon===4){ctx.fillStyle='#353a31';ctx.fillRect(-42,-53,84,35);ctx.fillStyle='#1b1f1b';ctx.beginPath();ctx.ellipse(0,-63,29,20,0,0,TAU);ctx.fill();ctx.fillStyle='#ff652e';ctx.fillRect(-5,-82,10,9);ctx.fillStyle='#69715d';ctx.fillRect(31,-49,18,25);}
      else if(p.weapon===5){ctx.fillStyle='#25242c';ctx.beginPath();ctx.moveTo(-47,-22);ctx.lineTo(-25,-62);ctx.lineTo(-12,-91);ctx.lineTo(12,-91);ctx.lineTo(25,-62);ctx.lineTo(47,-22);ctx.closePath();ctx.fill();ctx.fillStyle='#c88cff';ctx.fillRect(-6,-96,12,69);ctx.fillStyle='#eee3ff';ctx.fillRect(-2,-104,4,29);}
      else {ctx.fillStyle='#313726';ctx.beginPath();ctx.moveTo(-58,-18);ctx.lineTo(-40,-68);ctx.lineTo(-16,-85);ctx.lineTo(16,-85);ctx.lineTo(40,-68);ctx.lineTo(58,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#dfff35';ctx.beginPath();ctx.arc(0,-64,18,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,-64,7,0,TAU);ctx.fill();}
      ctx.shadowBlur=0;
      if(p.muzzle>0){const alpha=clamp(p.muzzle*8,0,1);ctx.globalAlpha=alpha;ctx.fillStyle=weapon.color;ctx.shadowBlur=20;ctx.shadowColor=weapon.color;ctx.beginPath();ctx.moveTo(0,-84-(p.weapon===5?18:0));for(let i=0;i<8;i++){const a=i/8*TAU,r=i%2?9:24;ctx.lineTo(Math.cos(a)*r,-96-(p.weapon===5?18:0)+Math.sin(a)*r);}ctx.closePath();ctx.fill();}
      ctx.restore(); ctx.globalAlpha=1; ctx.shadowBlur=0;
      const cross=Math.max(4,this.width*.012);ctx.strokeStyle=game.target&&game.canSee(game.player,game.target)?'#ff6b45':'rgba(220,255,80,.7)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(w/2-cross-5,h*.47);ctx.lineTo(w/2-5,h*.47);ctx.moveTo(w/2+5,h*.47);ctx.lineTo(w/2+cross+5,h*.47);ctx.moveTo(w/2,h*.47-cross-5);ctx.lineTo(w/2,h*.47-5);ctx.moveTo(w/2,h*.47+5);ctx.lineTo(w/2,h*.47+cross+5);ctx.stroke();
    }
    present(game) {
      this.drawWorld(game);
      if (!this.gl) {
        this.fallback.imageSmoothingEnabled = false;
        this.fallback.drawImage(this.scene, 0, 0, this.canvas.width, this.canvas.height);
        return;
      }
      const gl=this.gl; gl.bindTexture(gl.TEXTURE_2D,this.texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.scene);
      gl.useProgram(this.program); gl.uniform1f(this.uniformTime,game.elapsed); gl.uniform1f(this.uniformDamage,game.player.damageFlash);
      gl.uniform1f(this.uniformFx,this.effects==='high'?1:this.effects==='medium'?.55:.12); gl.uniform2f(this.uniformRes,this.width,this.height);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
  }

  class Simulation {
    constructor() {
      this.audio = new AudioCore();
      this.map = new TacticalMap();
      this.renderer = new RayRenderer(UI.glCanvas);
      this.miniCtx = UI.miniMap.getContext('2d');
      this.rng = new RNG(Date.now());
      this.enemies = []; this.projectiles = []; this.particles = []; this.pickups = []; this.tracers = [];
      this.mission = 1; this.wave = 1; this.elapsed = 0; this.missionTime = 0;
      this.paused = false; this.started = false; this.gameSpeed = 1; this.mode = 1; this.overdrive = 0;
      this.transition = null; this.target = null; this.toastTimer = 0; this.uiTimer = 0; this.pathPulse = 0;
      this.lastTime = performance.now(); this.frameCounter = 0; this.fpsClock = 0; this.fps = 0;
      this.metrics = { kills: 0, shots: 0, hits: 0, broken: 0, score: 0 };
      this.player = null; this.deferredInstall = null;
      this.buildWeaponRack(); this.bindUI(); this.newMission();
    }
    buildWeaponRack() {
      UI.weaponRack.innerHTML = '';
      WEAPONS.forEach((weapon, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'weapon-slot'; button.dataset.index = index;
        button.setAttribute('aria-label', `${index+1}번 ${weapon.name} 무기 잠금`);
        button.innerHTML = `<span class="num">0${index+1}</span><span class="glyph">${weapon.glyph}</span><span class="ammo">${weapon.ammo === Infinity ? '∞' : weapon.ammo}</span>`;
        button.addEventListener('click', () => this.lockWeapon(index)); UI.weaponRack.appendChild(button);
      });
    }
    bindUI() {
      UI.pauseButton.addEventListener('click', () => this.togglePause());
      UI.modeButton.addEventListener('click', () => this.cycleMode());
      UI.speedButton.addEventListener('click', () => this.cycleSpeed());
      UI.overdriveButton.addEventListener('click', () => this.triggerOverdrive());
      UI.soundButton.addEventListener('click', async () => { const enabled = await this.audio.toggle(); UI.soundButton.classList.toggle('engaged', enabled); UI.soundButton.querySelector('em').textContent = enabled ? 'SOUND ON' : 'SOUND'; this.toast(enabled ? '오디오 링크 활성화' : '오디오 링크 음소거'); });
      UI.moreButton.addEventListener('click', () => UI.dialog.showModal());
      UI.newMissionButton.addEventListener('click', () => { UI.dialog.close(); this.newMission(); });
      UI.fullscreenButton.addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (_) {} });
      UI.effectsSelect.addEventListener('change', () => { this.renderer.setEffects(UI.effectsSelect.value); localStorage.setItem('doombot.effects',UI.effectsSelect.value); });
      UI.mapZoom.addEventListener('input', () => localStorage.setItem('doombot.mapZoom',UI.mapZoom.value));
      UI.bootButton.addEventListener('click', () => this.dismissBoot(true));
      UI.installButton.addEventListener('click', async () => { if (!this.deferredInstall) return; this.deferredInstall.prompt(); await this.deferredInstall.userChoice; this.deferredInstall=null; UI.installButton.hidden=true; });
      window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.deferredInstall=event; UI.installButton.hidden=false; });
      window.addEventListener('keydown', event => {
        if (event.key.toLowerCase()==='p'||event.key===' ') { event.preventDefault(); this.togglePause(); }
        else if (event.key.toLowerCase()==='m') this.cycleMode();
        else if (event.key.toLowerCase()==='r') this.newMission();
        else if (event.key.toLowerCase()==='f') UI.fullscreenButton.click();
        else if (event.key>='1'&&event.key<='7') this.lockWeapon(Number(event.key)-1);
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && !this.paused) this.togglePause(true); });
      const effects = localStorage.getItem('doombot.effects') || 'high'; UI.effectsSelect.value=effects; this.renderer.setEffects(effects);
      UI.mapZoom.value = localStorage.getItem('doombot.mapZoom') || '1';
    }
    dismissBoot(withAudio = false) {
      UI.boot.classList.add('hidden');
      if (withAudio && !this.audio.enabled) { this.audio.toggle(true); UI.soundButton.classList.add('engaged'); UI.soundButton.querySelector('em').textContent='SOUND ON'; }
    }
    start() {
      this.started = true;
      setTimeout(() => { UI.bootButton.classList.add('ready'); UI.bootStatus.textContent='전술 코어 정상 · 자동 전투 준비 완료'; }, 550);
      setTimeout(() => this.dismissBoot(false), 1650);
      requestAnimationFrame(time => this.loop(time));
    }
    newMission() {
      this.mission++;
      if (this.mission === 2 && this.metrics.kills === 0) this.mission = 1;
      const seed = (Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0;
      this.rng = new RNG(seed); const spawn = this.map.generate(seed);
      for (let i=0;i<WEAPONS.length;i++) WEAPONS[i].ammo = [Infinity,42,180,110,18,16,5][i];
      this.player = {
        x: spawn.cx+.5, y: spawn.cy+.5, angle: .18, radius: .22, health: 100, armor: 75,
        weapon: 0, lockedWeapon: null, cooldown: 0, chooseTimer: 0, pathTimer: 0, path: [], pathIndex: 0,
        target: null, bob: 0, recoil: 0, muzzle: 0, damageFlash: 0, speedNow: 0, strafe: 1, strafeTimer: 0,
        alive: true
      };
      this.enemies.length=0; this.projectiles.length=0; this.particles.length=0; this.pickups.length=0; this.tracers.length=0;
      this.wave=1; this.missionTime=0; this.transition=null; this.target=null; this.overdrive=0;
      this.metrics={kills:0,shots:0,hits:0,broken:0,score:0};
      UI.overlay.classList.remove('visible'); UI.seedLabel.textContent=`SEED ${seed.toString(16).slice(-4).toUpperCase().padStart(4,'0')}`;
      this.spawnWave(1); this.log('전술 코어', '새 임무 개시', 'good'); this.toast('AUTONOMOUS HUNT PROTOCOL ONLINE');
      this.updateUI(true);
    }
    spawnWave(wave) {
      this.wave=wave; const roster=[];
      const counts = [
        [5,2,0,0,0], [4,3,2,0,0], [4,3,3,2,0], [4,4,3,2,1], [5,4,4,3,2]
      ][wave-1];
      counts.forEach((count,typeIndex)=>{for(let i=0;i<count;i++) roster.push(typeIndex);});
      for (const typeIndex of roster) this.spawnEnemy(typeIndex);
      this.log(`WAVE ${wave}`, `${roster.length}개 신호 포착`, 'danger'); this.audio.alert();
      UI.overlay.classList.remove('visible'); this.transition=null;
    }
    spawnEnemy(typeIndex) {
      const type=ENEMY_TYPES[typeIndex];
      const point=this.map.randomFloor(this.rng,this.player,[...this.enemies,...this.map.barrels.filter(b=>b.alive)]);
      this.enemies.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        x:point.x,y:point.y,type,hp:type.hp,maxHp:type.hp,radius:type.radius,alive:true,cooldown:this.rng.next()*type.rate,
        path:[],pathIndex:0,pathTimer:this.rng.next(),hurt:0,phase:this.rng.next()*TAU,stun:0,lastSeen:0
      });
    }
    togglePause(forcePause = false) {
      this.paused=forcePause||!this.paused; UI.pauseButton.classList.toggle('engaged',this.paused);
      UI.pauseButton.querySelector('span').textContent=this.paused?'▶':'Ⅱ'; UI.pauseButton.querySelector('em').textContent=this.paused?'RESUME':'PAUSE';
      UI.mapState.textContent=this.paused?'HOLD':'LIVE'; this.toast(this.paused?'시뮬레이션 일시정지':'자동 전투 재개');
    }
    cycleMode() {
      this.mode=(this.mode+1)%3; const labels=['AGGRESSIVE','BALANCED','SURVIVAL']; UI.modeButton.querySelector('em').textContent=labels[this.mode];
      this.log('전술 변경', labels[this.mode], this.mode===0?'danger':'good'); this.toast(`TACTIC · ${labels[this.mode]}`);
    }
    cycleSpeed() {
      const speeds=[1,1.5,2]; this.gameSpeed=speeds[(speeds.indexOf(this.gameSpeed)+1)%speeds.length]; UI.speedButton.querySelector('span').textContent=`×${this.gameSpeed}`;
      this.toast(`시뮬레이션 속도 ${this.gameSpeed}배`);
    }
    triggerOverdrive() {
      if (this.overdrive>0) { this.toast('오버드라이브 이미 작동 중'); return; }
      this.overdrive=7; UI.overdriveButton.classList.add('engaged');
      this.player.armor=clamp(this.player.armor+20,0,100); for(let i=1;i<WEAPONS.length;i++) if(WEAPONS[i].ammo!==Infinity) WEAPONS[i].ammo=Math.min(WEAPONS[i].max,WEAPONS[i].ammo+Math.ceil(WEAPONS[i].max*.12));
      this.log('OVERRIDE','오버드라이브 7초','good'); this.toast('OVERDRIVE · FIRE RATE 200%'); this.audio.tone(110,.6,'sawtooth',.12,4);
    }
    lockWeapon(index) {
      const weapon=WEAPONS[index];
      if (weapon.ammo!==Infinity&&weapon.ammo<weapon.use) { this.toast(`${weapon.name} 탄약 부족`); return; }
      this.player.lockedWeapon=this.player.lockedWeapon===index?null:index;
      if(this.player.lockedWeapon!==null){this.player.weapon=index;this.toast(`${weapon.name} 수동 잠금`);} else this.toast('자동 무기 선택 복귀');
      this.refreshWeaponRack();
    }
    toast(message) {
      UI.toast.textContent=message; UI.toast.classList.remove('show'); requestAnimationFrame(()=>UI.toast.classList.add('show'));
      clearTimeout(this.toastTimer); this.toastTimer=setTimeout(()=>UI.toast.classList.remove('show'),1500);
    }
    log(source,message,tone='') {
      const li=document.createElement('li'); if(tone) li.className=tone;
      const minutes=Math.floor(this.missionTime/60),seconds=Math.floor(this.missionTime%60);
      li.innerHTML=`<time>${fmt(minutes)}:${fmt(seconds)}</time><span><b>${source}</b> · ${message}</span>`;
      UI.combatLog.prepend(li); while(UI.combatLog.children.length>5) UI.combatLog.lastElementChild.remove();
    }
    canMove(x,y,radius=.2) {
      return !this.map.solid(x-radius,y-radius)&&!this.map.solid(x+radius,y-radius)&&!this.map.solid(x-radius,y+radius)&&!this.map.solid(x+radius,y+radius);
    }
    move(entity,dx,dy) {
      let moved=false;
      if(this.canMove(entity.x+dx,entity.y,entity.radius)){entity.x+=dx;moved=true;}
      if(this.canMove(entity.x,entity.y+dy,entity.radius)){entity.y+=dy;moved=true;}
      return moved;
    }
    canSee(a,b) {
      if(!a||!b) return false;
      const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy),steps=Math.ceil(dist/.09);
      for(let i=1;i<steps;i++){const t=i/steps;if(this.map.solid(a.x+dx*t,a.y+dy*t))return false;}
      return true;
    }
    closestVisibleEnemy(maxRange=99) {
      let best=null,bestScore=Infinity;
      for(const enemy of this.enemies){if(!enemy.alive)continue;const d=distance(this.player,enemy);if(d>maxRange||!this.canSee(this.player,enemy))continue;
        const threat=(enemy.type.key==='warden'?-.9:enemy.type.key==='mauler'?-.55:0);const score=d+threat;
        if(score<bestScore){bestScore=score;best=enemy;}}
      return best;
    }
    chooseTarget() {
      const visible=this.closestVisibleEnemy(15);
      if(visible){this.target=visible;return visible;}
      let best=null,bestLength=Infinity,bestPath=[];
      for(const enemy of this.enemies){if(!enemy.alive)continue;const approx=Math.abs(enemy.x-this.player.x)+Math.abs(enemy.y-this.player.y);if(approx>bestLength+5)continue;
        const path=this.map.path(this.player.x,this.player.y,enemy.x,enemy.y);if(path.length&&path.length<bestLength){best=enemy;bestLength=path.length;bestPath=path;}}
      if(best){this.player.path=bestPath;this.player.pathIndex=0;this.target=best;}
      return best;
    }
    chooseWeapon(target) {
      const player=this.player;if(player.lockedWeapon!==null){const locked=WEAPONS[player.lockedWeapon];if(locked.ammo===Infinity||locked.ammo>=locked.use){player.weapon=player.lockedWeapon;return;}player.lockedWeapon=null;}
      if(!target)return;
      const d=distance(player,target);const nearby=this.enemies.filter(e=>e.alive&&distance(e,target)<2.4).length;
      const usable=index=>WEAPONS[index].ammo===Infinity||WEAPONS[index].ammo>=WEAPONS[index].use;
      let choice=0;
      if(nearby>=4&&d<9&&usable(6)) choice=6;
      else if(nearby>=3&&d>3.5&&usable(4)) choice=4;
      else if((target.type.key==='warden'||target.type.key==='watcher')&&d>5&&usable(5)) choice=5;
      else if(d<3.4&&usable(1)) choice=1;
      else if(d>7&&usable(3)) choice=3;
      else if(usable(2)) choice=2;
      else if(usable(1)) choice=1;
      player.weapon=choice;
    }
    acquireBarrier() {
      const path=this.player.path; if(!path.length)return null;
      for(let i=this.player.pathIndex;i<Math.min(path.length,this.player.pathIndex+4);i++){
        const point=path[i],x=Math.floor(point.x),y=Math.floor(point.y);if(this.map.tile(x,y)===2)return {x:x+.5,y:y+.5,tileX:x,tileY:y,hp:this.map.hp[this.map.index(x,y)],maxHp:52,barrier:true,alive:true};
      }
      return null;
    }
    clearToBreakable(target) {
      const p=this.player,dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      for(let travel=.12;travel<Math.max(.12,d-.58);travel+=.09){const t=travel/d;if(this.map.solid(p.x+dx*t,p.y+dy*t))return false;}
      return true;
    }
    nearestBreakable(maxRange=4.8) {
      let best=null,bestDistance=maxRange;
      for(const barrel of this.map.barrels){if(!barrel.alive)continue;const d=distance(this.player,barrel);if(d<bestDistance&&this.clearToBreakable(barrel)){best=barrel;bestDistance=d;}}
      for(let y=1;y<this.map.height-1;y++)for(let x=1;x<this.map.width-1;x++){
        if(this.map.tile(x,y)!==2)continue;const candidate={x:x+.5,y:y+.5,tileX:x,tileY:y,hp:this.map.hp[this.map.index(x,y)],maxHp:52,barrier:true,alive:true};
        const d=distance(this.player,candidate);if(d<bestDistance&&this.clearToBreakable(candidate)){best=candidate;bestDistance=d;}
      }
      return best;
    }
    updatePlayer(dt) {
      const p=this.player;if(!p.alive)return;
      p.cooldown-=dt;p.chooseTimer-=dt;p.pathTimer-=dt;p.strafeTimer-=dt;p.recoil=Math.max(0,p.recoil-dt*5);p.muzzle=Math.max(0,p.muzzle-dt);p.damageFlash=Math.max(0,p.damageFlash-dt*2.4);
      if(p.chooseTimer<=0||!this.target||!this.target.alive){p.chooseTimer=.35;this.chooseTarget();}
      if(p.pathTimer<=0&&this.target?.alive&&!this.canSee(p,this.target)){p.path=this.map.path(p.x,p.y,this.target.x,this.target.y);p.pathIndex=0;p.pathTimer=.72;}
      if(p.strafeTimer<=0){p.strafe*=-1;p.strafeTimer=1.2+this.rng.next()*1.8;}
      if(p.chooseTimer>.25)this.chooseWeapon(this.target);

      const barrier=this.acquireBarrier();
      const visibleTarget=this.target?.alive&&this.canSee(p,this.target)?this.target:null;
      const nearbyBreakable=this.nearestBreakable(visibleTarget?2.75:5.2);
      const combatTarget=barrier&&distance(p,barrier)<5?barrier:nearbyBreakable||visibleTarget;
      let moveX=0,moveY=0, desiredAngle=p.angle;
      if(combatTarget){
        desiredAngle=Math.atan2(combatTarget.y-p.y,combatTarget.x-p.x);
        const d=distance(p,combatTarget), desired=[3.8,5.5,7.2][this.mode];
        const forward=d>desired+.8?1:d<desired-.9?-1:0;
        const speed=(this.overdrive>0?2.2:1.65)*(this.mode===0?1.12:this.mode===2?.93:1);
        moveX=Math.cos(desiredAngle)*forward*speed+Math.cos(desiredAngle+Math.PI/2)*p.strafe*speed*.36;
        moveY=Math.sin(desiredAngle)*forward*speed+Math.sin(desiredAngle+Math.PI/2)*p.strafe*speed*.36;
        if(Math.abs(angleDelta(p.angle,desiredAngle))<.16&&d<=WEAPONS[p.weapon].range&&p.cooldown<=0)this.fireWeapon(combatTarget);
      } else if(p.path.length&&p.pathIndex<p.path.length){
        let waypoint=p.path[p.pathIndex];if(distance(p,waypoint)<.28&&p.pathIndex<p.path.length-1)waypoint=p.path[++p.pathIndex];
        desiredAngle=Math.atan2(waypoint.y-p.y,waypoint.x-p.x);moveX=Math.cos(desiredAngle)*1.65;moveY=Math.sin(desiredAngle)*1.65;
      } else {
        desiredAngle+=dt*.35;moveX=Math.cos(desiredAngle)*.7;moveY=Math.sin(desiredAngle)*.7;
      }
      p.angle+=clamp(angleDelta(p.angle,desiredAngle),-dt*3.8,dt*3.8);
      const magnitude=Math.hypot(moveX,moveY);p.speedNow=lerp(p.speedNow,magnitude,.12);this.move(p,moveX*dt,moveY*dt);p.bob+=dt*(3.2+magnitude*2.3);
      for(let i=this.pickups.length-1;i>=0;i--)if(distance(p,this.pickups[i])<.55)this.collectPickup(i);
    }
    fireWeapon(target) {
      const p=this.player,w=WEAPONS[p.weapon];if(w.ammo!==Infinity&&w.ammo<w.use){p.lockedWeapon=null;p.chooseTimer=0;return;}
      if(w.ammo!==Infinity)w.ammo-=w.use;
      p.cooldown=w.rate*(this.overdrive>0?.5:1);p.muzzle=.12;p.recoil=1;this.metrics.shots++;this.audio.shot(p.weapon);
      const baseAngle=Math.atan2(target.y-p.y,target.x-p.x);
      if(w.kind==='hitscan'){
        let landed=false;
        for(let pellet=0;pellet<w.pellets;pellet++){
          const shotAngle=baseAngle+(this.rng.next()*2-1)*w.spread;
          const miss=Math.abs(angleDelta(shotAngle,baseAngle))*distance(p,target);
          const breakable=target.barrier||target.kind==='barrel';
          const hit=miss<(target.radius||.3)+(target.barrier ? .3 : 0)&&(breakable?this.clearToBreakable(target):this.canSee(p,target));
          if(hit){const falloff=w.pellets>1?clamp(1-distance(p,target)/14,.45,1):1;this.damageTarget(target,w.damage*falloff);landed=true;}
          this.tracers.push({x1:p.x,y1:p.y,x2:target.x+Math.cos(shotAngle)*miss,y2:target.y+Math.sin(shotAngle)*miss,color:w.color,life:.08});
        }
        if(landed)this.metrics.hits++;
      } else if(w.kind==='plasma'||w.kind==='rocket'){
        this.projectiles.push({owner:'player',kind:w.kind,x:p.x+Math.cos(baseAngle)*.35,y:p.y+Math.sin(baseAngle)*.35,vx:Math.cos(baseAngle)*w.speed,vy:Math.sin(baseAngle)*w.speed,damage:w.damage,splash:w.splash,radius:.1,life:3,color:w.color});
      } else if(w.kind==='rail'){
        let hits=0;
        for(const enemy of this.enemies){if(!enemy.alive||!this.canSee(p,enemy))continue;const dx=enemy.x-p.x,dy=enemy.y-p.y,along=dx*Math.cos(baseAngle)+dy*Math.sin(baseAngle);const side=Math.abs(-dx*Math.sin(baseAngle)+dy*Math.cos(baseAngle));if(along>0&&along<w.range&&side<enemy.radius+.13){this.damageEnemy(enemy,w.damage);hits++;}}
        for(let d=.4;d<w.range;d+=.35){const x=p.x+Math.cos(baseAngle)*d,y=p.y+Math.sin(baseAngle)*d;if(this.map.solid(x,y)){const tx=Math.floor(x),ty=Math.floor(y);if(this.map.tile(tx,ty)===2)this.damageBarrier(tx,ty,w.damage);break;}this.spawnParticle(x,y,.28,w.color,.18,.035);}
        if(hits){this.metrics.hits++;this.log('RAIL SPIKE',`${hits}개 표적 관통`,'good');}
      } else {
        const victims=this.enemies.filter(e=>e.alive&&distance(p,e)<w.range&&this.canSee(p,e));
        for(const enemy of victims){this.damageEnemy(enemy,w.damage*(1-distance(p,enemy)/w.range*.45));for(let i=0;i<5;i++)this.spawnParticle(lerp(p.x,enemy.x,i/5),lerp(p.y,enemy.y,i/5),.4,w.color,.35,.04);}
        for(let y=Math.floor(p.y-w.range);y<=Math.ceil(p.y+w.range);y++)for(let x=Math.floor(p.x-w.range);x<=Math.ceil(p.x+w.range);x++)if(this.map.tile(x,y)===2&&Math.hypot(x+.5-p.x,y+.5-p.y)<w.range)this.damageBarrier(x,y,w.damage);
        if(victims.length)this.metrics.hits++;
      }
    }
    damageTarget(target,amount){
      if(target.barrier)this.damageBarrier(target.tileX,target.tileY,amount);
      else if(target.kind==='barrel'){target.hp-=amount;if(target.hp<=0)this.explodeBarrel(target);}
      else this.damageEnemy(target,amount);
    }
    damageBarrier(x,y,amount){
      const destroyed=this.map.damageBarrier(x,y,amount);for(let i=0;i<3;i++)this.spawnParticle(x+.5+(this.rng.next()-.5)*.7,y+.5+(this.rng.next()-.5)*.7,.35,'#e87932',.35,.06);
      if(destroyed){this.metrics.broken++;this.audio.impact(true);this.log('BREACH',`장애물 파괴 #${this.metrics.broken}`,'good');this.player.pathTimer=0;}
    }
    damageEnemy(enemy,amount){
      if(!enemy.alive)return;enemy.hp-=amount;enemy.hurt=.12;for(let i=0;i<Math.min(7,Math.ceil(amount/14));i++)this.spawnParticle(enemy.x+(this.rng.next()-.5)*.35,enemy.y+(this.rng.next()-.5)*.35,.55,enemy.type.color,.35,.055);
      if(enemy.hp<=0)this.killEnemy(enemy);
    }
    killEnemy(enemy){
      if(!enemy.alive)return;enemy.alive=false;enemy.deathTimer=.45;this.metrics.kills++;this.metrics.score+=enemy.type.score;this.audio.impact(enemy.type.key==='warden');
      for(let i=0;i<16;i++)this.spawnParticle(enemy.x+(this.rng.next()-.5)*.5,enemy.y+(this.rng.next()-.5)*.5,.55,enemy.type.color,.6+this.rng.next()*.4,.08);
      if(this.rng.chance(.34)||enemy.type.key==='warden')this.spawnPickup(enemy.x,enemy.y);
      this.log('TARGET DOWN',enemy.type.name,'good');if(this.target===enemy){this.target=null;this.player.chooseTimer=0;}
    }
    spawnPickup(x,y){const needHealth=this.player.health<55,needArmor=this.player.armor<35;const kind=needHealth?'health':needArmor?'armor':'ammo';this.pickups.push({x,y,kind,phase:this.rng.next()*TAU,life:22});}
    collectPickup(index){
      const pickup=this.pickups[index];if(pickup.kind==='health')this.player.health=clamp(this.player.health+28,0,100);else if(pickup.kind==='armor')this.player.armor=clamp(this.player.armor+32,0,100);else{for(let i=1;i<WEAPONS.length;i++)WEAPONS[i].ammo=Math.min(WEAPONS[i].max,WEAPONS[i].ammo+Math.ceil(WEAPONS[i].max*.14));}
      this.pickups.splice(index,1);this.audio.pickup();this.log('SALVAGE',pickup.kind.toUpperCase(),'good');
    }
    spawnParticle(x,y,z,color,life,size){this.particles.push({x,y,z,color,life,size,vx:(this.rng.next()-.5)*.45,vy:(this.rng.next()-.5)*.45,vz:this.rng.next()*.8});if(this.particles.length>260)this.particles.shift();}

    updateEnemies(dt) {
      const player=this.player;
      for(const enemy of this.enemies){
        if(!enemy.alive){enemy.deathTimer-=dt;continue;}enemy.cooldown-=dt;enemy.pathTimer-=dt;enemy.hurt=Math.max(0,enemy.hurt-dt);enemy.stun=Math.max(0,enemy.stun-dt);
        const d=distance(enemy,player),sees=this.canSee(enemy,player);if(sees)enemy.lastSeen=2.2;else enemy.lastSeen-=dt;
        if(!player.alive||enemy.stun>0)continue;
        if(sees&&d<=enemy.type.range&&enemy.cooldown<=0)this.enemyAttack(enemy,d);
        let moveAngle=0,shouldMove=false;
        if(sees){
          const preferred=enemy.type.key==='mauler'?.7:enemy.type.range*.68;
          if(d>preferred){moveAngle=Math.atan2(player.y-enemy.y,player.x-enemy.x);shouldMove=true;}
          else if(d<preferred*.58&&enemy.type.key!=='mauler'){moveAngle=Math.atan2(enemy.y-player.y,enemy.x-player.x);shouldMove=true;}
          else if(enemy.type.key!=='mauler'){moveAngle=Math.atan2(player.y-enemy.y,player.x-enemy.x)+(enemy.phase%2?1:-1)*Math.PI/2;shouldMove=true;}
        } else {
          if(enemy.pathTimer<=0){enemy.path=this.map.path(enemy.x,enemy.y,player.x,player.y);enemy.pathIndex=0;enemy.pathTimer=1.1+this.rng.next()*.7;}
          if(enemy.path?.length&&enemy.pathIndex<enemy.path.length){let point=enemy.path[enemy.pathIndex];if(distance(enemy,point)<.3&&enemy.pathIndex<enemy.path.length-1)point=enemy.path[++enemy.pathIndex];moveAngle=Math.atan2(point.y-enemy.y,point.x-enemy.x);shouldMove=true;}
        }
        if(shouldMove){
          let speed=enemy.type.speed*(enemy.hurt>0?.65:1);
          const crowd=this.enemies.filter(other=>other!==enemy&&other.alive&&distance(other,enemy)<.62);
          let dx=Math.cos(moveAngle)*speed,dy=Math.sin(moveAngle)*speed;
          for(const other of crowd){dx+=(enemy.x-other.x)*.7;dy+=(enemy.y-other.y)*.7;}
          this.move(enemy,dx*dt,dy*dt);
        }
      }
      this.enemies=this.enemies.filter(enemy=>enemy.alive||enemy.deathTimer>0);
    }
    enemyAttack(enemy,d) {
      enemy.cooldown=enemy.type.rate*(.86+this.rng.next()*.32);
      const angle=Math.atan2(this.player.y-enemy.y,this.player.x-enemy.x);
      if(enemy.type.key==='mauler'){
        if(d<1.18)this.damagePlayer(enemy.type.damage);
      } else if(!enemy.type.projectile){
        const accuracy=clamp(.9-d*.045,.45,.9);if(this.rng.chance(accuracy))this.damagePlayer(enemy.type.damage);this.audio.tone(95,.06,'square',.035,.5);
      } else {
        const speed=enemy.type.projectile==='missile'?5.2:enemy.type.projectile==='void'?3.8:4.5;
        this.projectiles.push({owner:'enemy',kind:enemy.type.projectile,x:enemy.x+Math.cos(angle)*.4,y:enemy.y+Math.sin(angle)*.4,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage:enemy.type.damage,splash:enemy.type.projectile==='missile'?1.6:.25,radius:.12,life:4,color:enemy.type.projectile==='void'?'#a06cff':enemy.type.projectile==='missile'?'#ff4d2f':'#ff9c36'});
      }
    }
    damagePlayer(amount){
      const p=this.player;if(!p.alive)return;const absorbed=Math.min(p.armor,amount*.58);p.armor-=absorbed;p.health-=amount-absorbed;p.damageFlash=1;this.audio.impact(false);
      if(p.health<=0){p.health=0;p.alive=false;this.beginDefeat();}
    }
    beginDefeat(){
      if(this.transition)return;this.transition={kind:'defeat',timer:5};UI.overlayKicker.textContent='COMBAT UNIT LOST';UI.overlayTitle.textContent='전술 코어 재부팅';UI.overlay.classList.add('visible');this.fillOverlay();this.log('CRITICAL','전투 유닛 기능 정지','danger');
    }
    updateProjectiles(dt){
      for(const projectile of this.projectiles){
        projectile.life-=dt;const steps=Math.max(1,Math.ceil(Math.hypot(projectile.vx,projectile.vy)*dt/.16));let hit=false;
        for(let s=0;s<steps&&!hit;s++){
          projectile.x+=projectile.vx*dt/steps;projectile.y+=projectile.vy*dt/steps;
          const tile=this.map.tile(projectile.x,projectile.y);
          if(tile===1||tile===2){if(tile===2)this.damageBarrier(Math.floor(projectile.x),Math.floor(projectile.y),projectile.damage);hit=true;break;}
          if(projectile.owner==='player'){
            const enemy=this.enemies.find(e=>e.alive&&distance(e,projectile)<e.radius+projectile.radius);
            if(enemy){this.damageEnemy(enemy,projectile.damage);this.metrics.hits++;hit=true;}
          }else if(this.player.alive&&distance(this.player,projectile)<this.player.radius+projectile.radius){this.damagePlayer(projectile.damage);hit=true;}
          const barrel=this.map.barrels.find(b=>b.alive&&distance(b,projectile)<b.radius+projectile.radius);
          if(barrel){barrel.hp-=projectile.damage;if(barrel.hp<=0)this.explodeBarrel(barrel);hit=true;}
        }
        if(hit||projectile.life<=0){if(projectile.splash>0)this.explosion(projectile.x,projectile.y,projectile.splash,projectile.damage*.62,projectile.owner,projectile.color);projectile.dead=true;}
        else if(this.rng.chance(.65))this.spawnParticle(projectile.x,projectile.y,.35,projectile.color,.16,.025);
      }
      this.projectiles=this.projectiles.filter(projectile=>!projectile.dead);
    }
    explosion(x,y,radius,damage,owner,color='#ff6734'){
      for(let i=0;i<22;i++){const a=this.rng.next()*TAU,r=this.rng.next()*radius;this.spawnParticle(x+Math.cos(a)*r,y+Math.sin(a)*r,.25+this.rng.next()*.7,color,.45+this.rng.next()*.45,.06+this.rng.next()*.05);}
      if(owner==='player')for(const enemy of this.enemies){const d=distance(enemy,{x,y});if(enemy.alive&&d<radius)this.damageEnemy(enemy,damage*(1-d/radius));}
      else {const d=distance(this.player,{x,y});if(this.player.alive&&d<radius)this.damagePlayer(damage*(1-d/radius));}
      for(const barrel of this.map.barrels){const d=distance(barrel,{x,y});if(barrel.alive&&d<radius){barrel.hp-=damage*(1-d/radius);if(barrel.hp<=0)this.explodeBarrel(barrel);}}
      this.audio.impact(true);
    }
    explodeBarrel(barrel){if(!barrel.alive)return;barrel.alive=false;this.metrics.broken++;this.explosion(barrel.x,barrel.y,2.4,55,'player','#ff772f');this.log('CHAIN BLAST','폭발성 드럼 폭파','good');}
    updateEffects(dt){
      for(const particle of this.particles){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vz-=1.8*dt;if(particle.z<0){particle.z=0;particle.vz*=-.25;}}
      this.particles=this.particles.filter(p=>p.life>0);for(const pickup of this.pickups)pickup.life-=dt;this.pickups=this.pickups.filter(p=>p.life>0);
      for(const tracer of this.tracers)tracer.life-=dt;this.tracers=this.tracers.filter(t=>t.life>0);
    }
    updateTransition(dt){
      if(!this.transition){
        if(this.player.alive&&!this.enemies.some(e=>e.alive)){
          if(this.wave<5){this.transition={kind:'wave',timer:4,next:this.wave+1};UI.overlayKicker.textContent=`WAVE ${this.wave} CLEARED`;UI.overlayTitle.textContent='구역 위협 제거';}
          else {this.transition={kind:'mission',timer:7};UI.overlayKicker.textContent='MISSION COMPLETE';UI.overlayTitle.textContent='전 구역 정화 완료';}
          UI.overlay.classList.add('visible');this.fillOverlay();this.audio.tone(330,.5,'square',.08,1.9);
        }
        return;
      }
      this.transition.timer-=dt;UI.overlayNext.textContent=this.transition.kind==='wave'?`다음 웨이브 준비 중 · ${Math.max(1,Math.ceil(this.transition.timer))}`:this.transition.kind==='mission'?`다음 임무 자동 생성 · ${Math.max(1,Math.ceil(this.transition.timer))}`:`전투 유닛 재배치 · ${Math.max(1,Math.ceil(this.transition.timer))}`;
      if(this.transition.timer<=0){const kind=this.transition.kind,next=this.transition.next;if(kind==='wave')this.spawnWave(next);else this.newMission();}
    }
    fillOverlay(){const minutes=Math.floor(this.missionTime/60),seconds=Math.floor(this.missionTime%60);UI.overlayKills.textContent=this.metrics.kills;UI.overlayTime.textContent=`${fmt(minutes)}:${fmt(seconds)}`;UI.overlayAccuracy.textContent=`${Math.round(this.metrics.hits/Math.max(1,this.metrics.shots)*100)}%`;}
    update(dt){
      this.elapsed+=dt;this.missionTime+=dt;if(this.overdrive>0){this.overdrive-=dt;if(this.overdrive<=0){this.overdrive=0;UI.overdriveButton.classList.remove('engaged');this.log('OVERRIDE','오버드라이브 종료');}}
      this.updatePlayer(dt);this.updateEnemies(dt);this.updateProjectiles(dt);this.updateEffects(dt);this.updateTransition(dt);
      this.uiTimer-=dt;if(this.uiTimer<=0){this.uiTimer=.1;this.updateUI();}
    }
    refreshWeaponRack(){
      [...UI.weaponRack.children].forEach((slot,index)=>{slot.classList.toggle('active',index===this.player.weapon);slot.classList.toggle('locked',index===this.player.lockedWeapon);slot.querySelector('.ammo').textContent=WEAPONS[index].ammo===Infinity?'∞':Math.floor(WEAPONS[index].ammo);});
    }
    updateUI(force=false){
      const p=this.player,w=WEAPONS[p.weapon],alive=this.enemies.filter(e=>e.alive),threat=alive.reduce((sum,e)=>sum+e.hp/e.maxHp*(ENEMY_TYPES.indexOf(e.type)+1),0);
      UI.missionLabel.textContent=`MISSION ${fmt(this.mission)} · SECTOR ${fmt(this.wave)}`;UI.enemyCount.textContent=`${alive.length} HOSTILES`;UI.threatBar.style.width=`${clamp(threat/30*100,0,100)}%`;
      const barrier=this.acquireBarrier();
      if(barrier&&distance(p,barrier)<5)UI.objectiveText.textContent='장애물 돌파 중';else if(this.target?.alive&&this.canSee(p,this.target))UI.objectiveText.textContent=`${this.target.type.name} 교전`;else if(this.transition)UI.objectiveText.textContent='구역 재정비';else UI.objectiveText.textContent='표적 추적 · 자동 탐색';
      UI.healthValue.textContent=fmt(p.health,3);UI.healthBar.style.width=`${p.health}%`;UI.armorValue.textContent=fmt(p.armor,3);UI.armorBar.style.width=`${p.armor}%`;
      UI.weaponMode.textContent=p.lockedWeapon===null?'AUTO SELECT':'WEAPON LOCK';UI.weaponName.textContent=w.name;UI.ammoValue.textContent=w.ammo===Infinity?'∞':Math.floor(w.ammo);
      UI.killValue.textContent=fmt(this.metrics.kills,3);UI.waveValue.textContent=`${this.wave}/5`;UI.breakValue.textContent=fmt(this.metrics.broken,2);this.refreshWeaponRack();
      if(this.target?.alive){UI.targetCard.classList.add('visible');UI.targetClass.textContent=this.target.type.className;UI.targetName.textContent=this.target.type.name;UI.targetDistance.textContent=`${distance(p,this.target).toFixed(1)}m`;UI.targetHealth.style.width=`${clamp(this.target.hp/this.target.maxHp*100,0,100)}%`;}
      else UI.targetCard.classList.remove('visible');
      if(force)this.drawMiniMap();
    }
    drawMiniMap(){
      const ctx=this.miniCtx,W=UI.miniMap.width,H=UI.miniMap.height,zoom=Number(UI.mapZoom.value);
      ctx.clearRect(0,0,W,H);ctx.fillStyle='#050706';ctx.fillRect(0,0,W,H);
      const spans=[29,17,10],span=spans[zoom],half=span/2;
      let minX=zoom===0?0:clamp(this.player.x-half,0,this.map.width-span),minY=zoom===0?0:clamp(this.player.y-half,0,this.map.height-span);
      const scale=W/span;
      ctx.save();ctx.translate(-minX*scale,-minY*scale);
      for(let y=0;y<this.map.height;y++)for(let x=0;x<this.map.width;x++){const tile=this.map.tile(x,y);if(tile===1){ctx.fillStyle='#2d332e';ctx.fillRect(x*scale,y*scale,scale+.4,scale+.4);}else if(tile===2){ctx.fillStyle='#b34c28';ctx.fillRect(x*scale+scale*.15,y*scale+scale*.15,scale*.7,scale*.7);}else{ctx.fillStyle=(x+y)%2?'#0b100d':'#0d120f';ctx.fillRect(x*scale,y*scale,scale+.2,scale+.2);}}
      ctx.lineWidth=Math.max(1,scale*.12);ctx.strokeStyle='rgba(215,255,50,.55)';ctx.beginPath();ctx.moveTo(this.player.x*scale,this.player.y*scale);for(let i=this.player.pathIndex;i<this.player.path.length;i++)ctx.lineTo(this.player.path[i].x*scale,this.player.path[i].y*scale);ctx.stroke();
      for(const barrel of this.map.barrels)if(barrel.alive){ctx.fillStyle='#ff9d37';ctx.fillRect((barrel.x-.18)*scale,(barrel.y-.18)*scale,.36*scale,.36*scale);}
      for(const pickup of this.pickups){ctx.fillStyle=pickup.kind==='health'?'#f2f0e8':pickup.kind==='armor'?'#55eaff':'#dfff35';ctx.fillRect((pickup.x-.16)*scale,(pickup.y-.16)*scale,.32*scale,.32*scale);}
      for(const enemy of this.enemies)if(enemy.alive){ctx.fillStyle=enemy===this.target?'#fff':'#ff3d3f';ctx.beginPath();ctx.arc(enemy.x*scale,enemy.y*scale,Math.max(1.6,enemy.radius*scale),0,TAU);ctx.fill();}
      if(this.target?.alive){ctx.strokeStyle='rgba(255,55,55,.5)';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(this.player.x*scale,this.player.y*scale);ctx.lineTo(this.target.x*scale,this.target.y*scale);ctx.stroke();ctx.setLineDash([]);}
      const px=this.player.x*scale,py=this.player.y*scale,r=Math.max(4,scale*.48);ctx.fillStyle='#dfff35';ctx.shadowBlur=8;ctx.shadowColor='#dfff35';ctx.beginPath();ctx.moveTo(px+Math.cos(this.player.angle)*r*1.45,py+Math.sin(this.player.angle)*r*1.45);ctx.lineTo(px+Math.cos(this.player.angle+2.45)*r,py+Math.sin(this.player.angle+2.45)*r);ctx.lineTo(px+Math.cos(this.player.angle-2.45)*r,py+Math.sin(this.player.angle-2.45)*r);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(215,255,50,.24)';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(this.player.angle-.61)*scale*4,py+Math.sin(this.player.angle-.61)*scale*4);ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(this.player.angle+.61)*scale*4,py+Math.sin(this.player.angle+.61)*scale*4);ctx.stroke();ctx.restore();
      ctx.strokeStyle='rgba(215,255,50,.18)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,W-1,H-1);
    }
    loop(now){
      const rawDt=Math.min(.05,(now-this.lastTime)/1000||.016);this.lastTime=now;
      if(!this.paused)this.update(rawDt*this.gameSpeed);
      this.renderer.present(this);this.drawMiniMap();
      this.frameCounter++;this.fpsClock+=rawDt;if(this.fpsClock>=.6){this.fps=Math.round(this.frameCounter/this.fpsClock);this.frameCounter=0;this.fpsClock=0;UI.fps.textContent=`${this.fps} FPS`;}
      requestAnimationFrame(time=>this.loop(time));
    }
  }

  function showFatal(error){
    console.error(error);UI.bootStatus.textContent=`기동 실패 · ${error.message}`;UI.bootButton.textContent='새로고침';UI.bootButton.classList.add('ready');UI.bootButton.onclick=()=>location.reload();
  }

  try {
    const simulation=new Simulation();window.DOOMBOT=simulation;simulation.start();
    if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  } catch (error) { showFatal(error); }
})();
