import { W, H, ARENA, COLORS, DOCTRINES, UNIT_SPECS, ENEMY_SPECS, clamp } from "./constants.js";
import { drawText, drawKText, drawHybridText } from "./bitmap-font.js";
import { drawUnitStatusScene, drawTacticalScene, drawDuelScene } from "./ui-scenes.js";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = document.createElement("canvas");
    this.scene.width = W;
    this.scene.height = H;
    this.ctx = this.scene.getContext("2d", { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.gl = canvas.getContext("webgl", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
    this.fallback = null;
    this.lastWidth = 0;
    this.lastHeight = 0;
    if (this.gl) this.initWebGL();
    else {
      this.fallback = canvas.getContext("2d", { alpha: false });
      if (this.fallback) this.fallback.imageSmoothingEnabled = false;
    }
  }

  initWebGL() {
    const gl = this.gl;
    const vertex = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const fragment = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_scene;
      uniform vec2 u_texel;
      uniform float u_time;
      uniform float u_flash;
      uniform float u_impact;
      uniform float u_reduce;

      float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

      void main() {
        vec2 uv = v_uv;
        float split = u_impact * 0.0032 * (1.0 - u_reduce);
        vec3 base;
        base.r = texture2D(u_scene, uv + vec2(split, 0.0)).r;
        base.g = texture2D(u_scene, uv).g;
        base.b = texture2D(u_scene, uv - vec2(split, 0.0)).b;

        vec3 bloom = vec3(0.0);
        bloom += texture2D(u_scene, uv + vec2(u_texel.x * 2.0, 0.0)).rgb;
        bloom += texture2D(u_scene, uv - vec2(u_texel.x * 2.0, 0.0)).rgb;
        bloom += texture2D(u_scene, uv + vec2(0.0, u_texel.y * 2.0)).rgb;
        bloom += texture2D(u_scene, uv - vec2(0.0, u_texel.y * 2.0)).rgb;
        bloom += texture2D(u_scene, uv + u_texel * 3.0).rgb;
        bloom += texture2D(u_scene, uv - u_texel * 3.0).rgb;
        bloom /= 6.0;
        bloom *= smoothstep(0.48, 0.94, lum(bloom)) * 0.28;

        float scan = 0.965 + 0.035 * sin(gl_FragCoord.y * 3.14159265);
        scan = mix(1.0, scan, 1.0 - u_reduce);
        vec2 center = uv - 0.5;
        float vignette = 1.0 - smoothstep(0.18, 0.72, dot(center, center)) * 0.34;
        float pulse = sin(u_time * 1.7) * 0.008;
        vec3 graded = (base + bloom) * scan * vignette;
        graded = vec3(graded.r * 1.035, graded.g * 1.01, graded.b * 1.075 + pulse);
        graded += vec3(1.0, 0.42, 0.48) * u_flash * 0.42;
        gl_FragColor = vec4(graded, 1.0);
      }
    `;
    const program = createProgram(gl, vertex, fragment);
    this.program = program;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]), gl.STATIC_DRAW);
    const stride = 4 * 4;
    const position = gl.getAttribLocation(program, "a_position");
    const uv = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, stride, 2 * 4);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.uniforms = {
      scene: gl.getUniformLocation(program, "u_scene"),
      texel: gl.getUniformLocation(program, "u_texel"),
      time: gl.getUniformLocation(program, "u_time"),
      flash: gl.getUniformLocation(program, "u_flash"),
      impact: gl.getUniformLocation(program, "u_impact"),
      reduce: gl.getUniformLocation(program, "u_reduce")
    };
    gl.uniform1i(this.uniforms.scene, 0);
    gl.uniform2f(this.uniforms.texel, 1 / W, 1 / H);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = this.canvas.width = width;
    this.lastHeight = this.canvas.height = height;
    if (this.gl) this.gl.viewport(0, 0, width, height);
    else if (this.fallback) this.fallback.imageSmoothingEnabled = false;
  }

  render(sim, meta = {}) {
    this.resize();
    this.drawScene(sim, meta);
    this.present(sim);
  }

  drawScene(sim, meta) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, W, H);
    this.drawBackdrop(ctx, sim);
    if (sim.phase === "play" && sim.duel) {
      drawDuelScene(ctx, sim, meta);
    } else if (sim.phase === "play" && sim.protocol) {
      drawTacticalScene(ctx, sim, meta);
    } else if (sim.phase === "play" && sim.unitBrief) {
      drawUnitStatusScene(ctx, sim, meta);
    } else {
      this.drawArena(ctx, sim);
      this.drawTopHud(ctx, sim, meta);
      this.drawBottomHud(ctx, sim, meta);
      if (sim.phase === "intro") this.drawIntro(ctx, sim);
      if (sim.phase === "result") this.drawResult(ctx, sim, meta);
    }
    if (sim.paused) this.drawPause(ctx);
  }

  drawBackdrop(ctx, sim) {
    ctx.fillStyle = "#0d101a";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#121624";
    for (let y = 0; y < H; y += 16) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = "#181d2b";
    for (let x = (sim.round * 7) % 29; x < W; x += 29) ctx.fillRect(x, 0, 1, H);
  }

  drawArena(ctx, sim) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
    ctx.clip();

    const shake = this.reducedMotion ? 0 : sim.screenShake;
    const sx = shake ? Math.round(Math.sin(sim.time * 71) * shake * .35) : 0;
    const sy = shake ? Math.round(Math.cos(sim.time * 83) * shake * .3) : 0;
    const centerX = (ARENA.left + ARENA.right) / 2;
    const centerY = (ARENA.top + ARENA.bottom) / 2;
    ctx.translate(centerX + sx, centerY + sy);
    ctx.scale(sim.camera.zoom, sim.camera.zoom);
    ctx.translate(-sim.camera.x, -sim.camera.y);

    this.drawFloor(ctx, sim);
    this.drawFieldDecor(ctx, sim);
    for (const obstacle of sim.obstacles) this.drawObstacle(ctx, obstacle, sim.round);
    this.drawRelayLinks(ctx, sim);
    for (const relay of sim.relays) this.drawRelay(ctx, relay, sim);
    this.drawCore(ctx, sim);

    const actors = [...sim.units, ...sim.enemies].sort((a, b) => a.y - b.y);
    for (const actor of actors) this.drawShadow(ctx, actor);
    for (const actor of actors) {
      if (actor.kind === "unit") this.drawUnit(ctx, actor, sim);
      else this.drawEnemy(ctx, actor, sim);
    }
    this.drawProjectiles(ctx, sim.projectiles);
    this.drawParticles(ctx, sim.particles);
    this.drawFloaters(ctx, sim.floaters);
    ctx.restore();

    this.drawArenaFrame(ctx);
  }

  drawFloor(ctx, sim) {
    ctx.fillStyle = COLORS.floorA;
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
    const tile = 9;
    for (let y = ARENA.top; y < ARENA.bottom; y += tile) {
      for (let x = ARENA.left; x < ARENA.right; x += tile) {
        const hash = ((x * 17 + y * 29 + sim.round * 13) ^ (x * y)) & 15;
        if (hash < 4) {
          ctx.fillStyle = hash < 2 ? COLORS.floorB : "#141a27";
          ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        }
        if (hash === 7) {
          ctx.fillStyle = "#303448";
          ctx.fillRect(x + 2, y + 4, 4, 1);
          ctx.fillRect(x + 5, y + 5, 1, 2);
        }
      }
    }
    ctx.fillStyle = COLORS.grid;
    ctx.globalAlpha = .55;
    for (let x = ARENA.left; x <= ARENA.right; x += tile) ctx.fillRect(x, ARENA.top, 1, ARENA.bottom - ARENA.top);
    for (let y = ARENA.top; y <= ARENA.bottom; y += tile) ctx.fillRect(ARENA.left, y, ARENA.right - ARENA.left, 1);
    ctx.globalAlpha = 1;

    const radial = ctx.createRadialGradient(108, 211, 8, 108, 211, 150);
    radial.addColorStop(0, "#35415c55");
    radial.addColorStop(.45, "#20283a22");
    radial.addColorStop(1, "#080a1200");
    ctx.fillStyle = radial;
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
  }

  drawFieldDecor(ctx, sim) {
    const runeColor = sim.doctrine === "seek" ? COLORS.green : sim.doctrine === "bastion" ? COLORS.amber : COLORS.red;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = .12;
    ctx.fillStyle = runeColor;
    const runes = [[23, 132], [193, 276], [113, 103], [103, 343], [61, 238], [160, 185]];
    runes.forEach(([x, y], index) => {
      const blink = ((Math.floor(sim.time * 3) + index) % 4) !== 0;
      if (!blink) return;
      ctx.fillRect(x - 4, y, 9, 1);
      ctx.fillRect(x, y - 4, 1, 9);
      ctx.fillRect(x - 2, y - 2, 5, 5);
    });
    for (const relay of sim.relays) {
      if (relay.owner !== 1) continue;
      const beam = ctx.createLinearGradient(relay.x, relay.y - 42, relay.x, relay.y + 12);
      beam.addColorStop(0, "#72df6d00");
      beam.addColorStop(.65, "#72df6d17");
      beam.addColorStop(1, "#72df6d44");
      ctx.fillStyle = beam;
      ctx.fillRect(relay.x - 8, relay.y - 42, 16, 52);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 34; i++) {
      const x = ARENA.left + ((i * 43 + Math.floor(sim.time * (3 + i % 5))) % (ARENA.right - ARENA.left));
      const y = ARENA.top + ((i * 71 + Math.floor(sim.time * (6 + i % 3))) % (ARENA.bottom - ARENA.top));
      ctx.fillStyle = i % 7 === 0 ? runeColor : "#52617d";
      ctx.globalAlpha = .12 + (i % 5) * .06;
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
    }
    ctx.restore();
  }

  drawObstacle(ctx, rect, round) {
    ctx.fillStyle = "#090b12aa";
    ctx.fillRect(rect.x + 3, rect.y + 4, rect.w, rect.h);
    ctx.fillStyle = rect.style === 1 ? "#343b4d" : rect.style === 2 ? "#3e3644" : "#414455";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = rect.style === 2 ? "#8f6970" : "#8c8790";
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, Math.min(3, rect.h - 2));
    ctx.fillStyle = "#252a3a";
    if (rect.w > rect.h) {
      for (let x = rect.x + 8 + (round % 4); x < rect.x + rect.w; x += 11) ctx.fillRect(x, rect.y + 1, 2, rect.h - 1);
    } else {
      for (let y = rect.y + 8 + (round % 4); y < rect.y + rect.h; y += 11) ctx.fillRect(rect.x + 1, y, rect.w - 1, 2);
    }
  }

  drawRelayLinks(ctx, sim) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const relay of sim.relays) {
      if (relay.owner !== 1) continue;
      ctx.strokeStyle = "#5ce8801c";
      ctx.lineWidth = 5;
      ctx.setLineDash([2, 5]);
      ctx.lineDashOffset = -sim.time * 8;
      ctx.beginPath();
      ctx.moveTo(relay.x, relay.y);
      ctx.lineTo(sim.core.x, sim.core.y);
      ctx.stroke();
      ctx.strokeStyle = "#7ff59a66";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRelay(ctx, relay, sim) {
    const color = relay.owner === 1 ? COLORS.green : relay.owner === -1 ? COLORS.red : COLORS.slate;
    const dark = relay.owner === 1 ? COLORS.greenDark : relay.owner === -1 ? COLORS.redDark : COLORS.frameDark;
    const pulse = Math.round((Math.sin(relay.pulse * 3) + 1) * .5);
    ctx.save();
    ctx.translate(Math.round(relay.x), Math.round(relay.y));
    ctx.fillStyle = "#080a12aa";
    pixelOctagon(ctx, 2, 3, 13, "fill");
    ctx.fillStyle = dark;
    pixelOctagon(ctx, 0, 0, 12 + pulse, "fill");
    ctx.fillStyle = color;
    pixelOctagon(ctx, 0, 0, 9, "fill");
    ctx.fillStyle = COLORS.ink;
    pixelOctagon(ctx, 0, 0, 6, "fill");
    ctx.fillStyle = color;
    ctx.fillRect(-2, -5, 4, 10);
    ctx.fillRect(-5, -2, 10, 4);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-1, -3, 2, 6);
    if (relay.flash > 0) {
      ctx.globalAlpha = relay.flash;
      ctx.fillStyle = COLORS.paper;
      pixelOctagon(ctx, 0, 0, 14, "fill");
    }
    ctx.restore();

    const barX = Math.round(relay.x - 12);
    const barY = Math.round(relay.y + 15);
    ctx.fillStyle = "#080a12";
    ctx.fillRect(barX, barY, 24, 3);
    if (relay.progress >= 0) {
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(barX + 1, barY + 1, Math.round(22 * relay.progress), 1);
    } else {
      const width = Math.round(22 * -relay.progress);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(barX + 23 - width, barY + 1, width, 1);
    }
  }

  drawCore(ctx, sim) {
    const x = Math.round(sim.core.x), y = Math.round(sim.core.y);
    const glow = sim.core.flash > 0 ? COLORS.paper : sim.coreCharge > 80 ? COLORS.green : COLORS.cyan;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = .08 + Math.sin(sim.time * 3) * .025;
    ctx.fillStyle = glow;
    pixelOctagon(ctx, x, y, 29, "fill");
    ctx.restore();

    ctx.fillStyle = "#090b12aa";
    ctx.fillRect(x - 17 + 3, y - 15 + 5, 34, 31);
    ctx.fillStyle = COLORS.frameDark;
    ctx.fillRect(x - 17, y - 15, 34, 29);
    ctx.fillStyle = "#68738d";
    ctx.fillRect(x - 14, y - 13, 28, 5);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x - 10, y - 10, 20, 18);
    ctx.fillStyle = "#20263a";
    ctx.fillRect(x - 7, y - 7, 14, 14);
    ctx.fillStyle = glow;
    ctx.fillRect(x - 3, y - 8, 6, 16);
    ctx.fillRect(x - 7, y - 3, 14, 6);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x - 1, y - 5, 2, 10);
    ctx.fillRect(x - 5, y - 1, 10, 2);
    ctx.fillStyle = COLORS.amberDark;
    ctx.fillRect(x - 12, y + 9, 24, 4);
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(x - 10, y + 9, Math.round(20 * sim.coreCharge / 100), 2);
  }

  drawShadow(ctx, actor) {
    ctx.fillStyle = "#05060b99";
    const width = actor.radius * (actor.role === "herald" ? 2.3 : 1.8);
    ctx.fillRect(Math.round(actor.x - width / 2 + 2), Math.round(actor.y + actor.radius + 1), Math.round(width), 3);
  }

  drawUnit(ctx, unit, sim) {
    const x = Math.round(unit.x), y = Math.round(unit.y);
    const step = Math.sin(unit.anim * 3) > 0 ? 1 : 0;
    const facing = unit.vx < -.5 ? -1 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    const outline = unit.flash > 0 ? COLORS.paper : "#0a0c14";
    ctx.fillStyle = outline;

    if (unit.role === "runner") {
      ctx.fillRect(-4, -7, 8, 11);
      ctx.fillStyle = UNIT_SPECS.runner.color;
      ctx.fillRect(-3, -6, 6, 5);
      ctx.fillRect(-2, -1, 5, 4);
      ctx.fillStyle = "#25344a";
      ctx.fillRect(-2, -4, 4, 3);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(1, -3, 1, 1);
      ctx.fillStyle = COLORS.greenDark;
      ctx.fillRect(-3, 4, 2, 3 + step);
      ctx.fillRect(1, 4, 2, 4 - step);
    } else if (unit.role === "sentinel") {
      ctx.fillRect(-5, -8, 10, 13);
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(-3, -6, 6, 5);
      ctx.fillStyle = "#4b536b";
      ctx.fillRect(-3, -4, 6, 7);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(1, -4, 2, 1);
      ctx.fillStyle = COLORS.amberDark;
      ctx.fillRect(-6, -2, 4, 7);
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(-6, -1, 2, 5);
      ctx.fillStyle = "#3d455c";
      ctx.fillRect(-3, 5, 3, 3 + step);
      ctx.fillRect(1, 5, 3, 4 - step);
    } else if (unit.role === "lancer") {
      ctx.fillRect(-4, -7, 9, 12);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(-3, -6, 6, 4);
      ctx.fillStyle = "#39445f";
      ctx.fillRect(-2, -2, 5, 6);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(1, -4, 1, 1);
      ctx.fillStyle = COLORS.cyanDark;
      ctx.fillRect(3, -2, 6, 3);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(7, -1, 3, 1);
      ctx.fillStyle = COLORS.cyanDark;
      ctx.fillRect(-2, 5, 2, 3 + step);
      ctx.fillRect(1, 5, 2, 4 - step);
    } else {
      ctx.fillRect(-4, -7, 8, 12);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(-3, -6, 6, 4);
      ctx.fillRect(-2, -1, 5, 5);
      ctx.fillStyle = "#4a5876";
      ctx.fillRect(-2, -4, 4, 2);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(-1, 0, 3, 1);
      ctx.fillRect(0, -1, 1, 3);
      ctx.fillStyle = COLORS.frame;
      ctx.fillRect(-2, 5, 2, 3 + step);
      ctx.fillRect(1, 5, 2, 4 - step);
    }

    if (unit.overdrive > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .7;
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-5, -9, 2, 2);
      ctx.fillRect(4, -6, 2, 2);
    }
    ctx.restore();
    this.drawHealth(ctx, unit, UNIT_SPECS[unit.role].color);
  }

  drawEnemy(ctx, enemy, sim) {
    const x = Math.round(enemy.x), y = Math.round(enemy.y);
    const color = ENEMY_SPECS[enemy.role].color;
    const step = Math.sin(enemy.anim * 3) > 0 ? 1 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = enemy.flash > 0 ? COLORS.paper : "#080a11";
    if (enemy.role === "herald") {
      ctx.fillRect(-11, -13, 22, 24);
      ctx.fillRect(-15, -10, 5, 5);
      ctx.fillRect(10, -10, 5, 5);
      ctx.fillStyle = color;
      ctx.fillRect(-9, -12, 18, 5);
      ctx.fillRect(-12, -9, 4, 4);
      ctx.fillRect(8, -9, 4, 4);
      ctx.fillRect(-8, -6, 16, 14);
      ctx.fillStyle = "#29273b";
      ctx.fillRect(-6, -5, 12, 10);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-4, -2, 3, 2);
      ctx.fillRect(2, -2, 3, 2);
      ctx.fillStyle = COLORS.redDark;
      ctx.fillRect(-8, 9, 6, 5 + step);
      ctx.fillRect(2, 9, 6, 6 - step);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(-1, 2, 2, 2);
    } else if (enemy.role === "brute") {
      ctx.fillRect(-7, -9, 14, 15);
      ctx.fillStyle = color;
      ctx.fillRect(-6, -8, 12, 5);
      ctx.fillRect(-7, -2, 14, 7);
      ctx.fillStyle = "#2c2738";
      ctx.fillRect(-4, -5, 8, 8);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(2, -4, 2, 2);
    } else if (enemy.role === "spitter") {
      ctx.fillRect(-5, -6, 10, 10);
      ctx.fillStyle = color;
      ctx.fillRect(-4, -5, 8, 7);
      ctx.fillRect(3, -2, 6, 3);
      ctx.fillStyle = "#33283a";
      ctx.fillRect(-2, -3, 4, 4);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(7, -1, 2, 1);
    } else if (enemy.role === "wisp") {
      ctx.fillRect(-4, -7, 8, 10);
      ctx.fillStyle = color;
      ctx.fillRect(-3, -6, 6, 6);
      ctx.fillRect(-2, 0, 4, 4 + step);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, -4, 2, 2);
    } else if (enemy.role === "rammer") {
      ctx.fillRect(-6, -6, 12, 11);
      ctx.fillRect(4, -4, 5, 5);
      ctx.fillStyle = color;
      ctx.fillRect(-5, -5, 10, 8);
      ctx.fillRect(4, -3, 4, 3);
      ctx.fillStyle = "#372b36";
      ctx.fillRect(-3, -3, 5, 4);
    } else if (enemy.role === "leech") {
      ctx.fillRect(-5, -5, 10, 9);
      ctx.fillStyle = color;
      ctx.fillRect(-4, -4, 8, 6);
      ctx.fillRect(-6, 2, 3, 3 + step);
      ctx.fillRect(3, 2, 3, 4 - step);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-1, -2, 2, 2);
    } else {
      ctx.fillRect(-4, -6, 8, 10);
      ctx.fillStyle = color;
      ctx.fillRect(-3, -5, 6, 6);
      ctx.fillRect(-4, 1, 3, 4 + step);
      ctx.fillRect(1, 1, 3, 5 - step);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(1, -3, 1, 1);
    }
    ctx.restore();
    this.drawHealth(ctx, enemy, enemy.role === "herald" ? COLORS.red : color);
  }

  drawHealth(ctx, entity, color) {
    if (entity.hp >= entity.maxHp * .98 && entity.role !== "herald") return;
    const width = entity.role === "herald" ? 24 : 10;
    const y = Math.round(entity.y - entity.radius - (entity.role === "herald" ? 18 : 7));
    const x = Math.round(entity.x - width / 2);
    ctx.fillStyle = "#07080e";
    ctx.fillRect(x, y, width, 2);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, Math.max(0, Math.round((width - 2) * entity.hp / entity.maxHp)), 1);
  }

  drawProjectiles(ctx, projectiles) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of projectiles) {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = .6;
      ctx.lineWidth = p.healing ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(p.px), Math.round(p.py));
      ctx.lineTo(Math.round(p.x), Math.round(p.y));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, p.healing ? 3 : 2, p.healing ? 3 : 2);
    }
    ctx.restore();
  }

  drawParticles(ctx, particles) {
    ctx.save();
    for (const particle of particles) {
      ctx.globalCompositeOperation = particle.glow ? "lighter" : "source-over";
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      const size = particle.size || 1;
      ctx.fillRect(Math.round(particle.x - size / 2), Math.round(particle.y - size / 2), size, size);
    }
    ctx.restore();
  }

  drawFloaters(ctx, floaters) {
    for (const floater of floaters) {
      ctx.globalAlpha = clamp(floater.life / Math.min(.35, floater.maxLife), 0, 1);
      drawHybridText(ctx, floater.text, Math.round(floater.x), Math.round(floater.y), {
        scale: 1, size: 7, color: floater.color, align: "center", shadow: "#080a12"
      });
    }
    ctx.globalAlpha = 1;
  }

  drawArenaFrame(ctx) {
    ctx.fillStyle = COLORS.frameDark;
    ctx.fillRect(0, ARENA.top - 3, W, 3);
    ctx.fillRect(0, ARENA.bottom, W, 3);
    ctx.fillStyle = COLORS.frame;
    ctx.fillRect(ARENA.left - 2, ARENA.top, 2, ARENA.bottom - ARENA.top);
    ctx.fillRect(ARENA.right, ARENA.top, 2, ARENA.bottom - ARENA.top);
    ctx.fillStyle = "#777f99";
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, 1);
  }

  drawTopHud(ctx, sim, meta) {
    ctx.fillStyle = "#121521";
    ctx.fillRect(0, 0, W, ARENA.top - 3);
    ctx.fillStyle = COLORS.frameDark;
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, 37, W, 2);

    drawKText(ctx, "성소", 7, 4, { color: COLORS.paper, size: 7 });
    drawText(ctx, String(Math.ceil(sim.coreHp)).padStart(3, "0"), 29, 5, { color: sim.coreHp < 35 ? COLORS.red : COLORS.paper, scale: 1 });
    const barX = 7, barY = 15, barW = 95, segments = 12;
    ctx.fillStyle = "#070910";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 8);
    for (let i = 0; i < segments; i++) {
      const filled = (i + 1) / segments <= sim.coreHp / 100 + .001;
      ctx.fillStyle = filled ? (sim.coreHp < 35 ? COLORS.red : "#ff6268") : "#2a2d3c";
      ctx.fillRect(barX + i * 8, barY, 6, 5);
      if (filled) {
        ctx.fillStyle = "#ff8a82";
        ctx.fillRect(barX + i * 8, barY, 6, 1);
      }
    }

    drawKText(ctx, "점수", 7, 26, { color: COLORS.amber, size: 7 });
    drawText(ctx, Math.round(sim.score).toString().padStart(6, "0"), 30, 27, { color: COLORS.amber, scale: 1 });
    drawKText(ctx, `제 ${sim.level}구역`, 91, 26, { color: COLORS.slate, size: 7 });

    drawKText(ctx, "시간", 210, 3, { color: COLORS.red, align: "right", size: 8 });
    drawText(ctx, String(Math.ceil(sim.timeLeft)).padStart(3, "0"), 210, 14, { color: COLORS.paper, align: "right", scale: 2, shadow: COLORS.redDark });
    drawKText(ctx, `${sim.speed === .5 ? "0.5" : sim.speed}배`, 160, 28, { color: COLORS.cyan, align: "center", size: 7 });
    drawKText(ctx, meta.muted ? "무음" : meta.soundReady ? "소리" : "터치", 209, 28, { color: meta.muted ? COLORS.red : meta.soundReady ? COLORS.green : COLORS.amber, align: "right", size: 7 });
  }

  drawBottomHud(ctx, sim, meta) {
    const top = ARENA.bottom + 3;
    ctx.fillStyle = "#11141f";
    ctx.fillRect(0, top, W, H - top);
    ctx.fillStyle = COLORS.frameDark;
    ctx.fillRect(0, top, W, 3);
    ctx.fillStyle = "#20263a";
    ctx.fillRect(5, top + 6, W - 10, 14);

    const aiColor = sim.doctrineOverride > 0 ? COLORS.amber : COLORS.cyan;
    drawKText(ctx, sim.doctrineOverride > 0 ? "관전자//" : "자동지휘//", 9, top + 9, { color: aiColor, size: 7 });
    drawKText(ctx, sim.doctrineReason, 64, top + 9, { color: COLORS.paper, size: 7 });
    drawKText(ctx, `자원 ${Math.floor(sim.scrap).toString().padStart(2, "0")}`, 208, top + 9, { color: COLORS.amber, align: "right", size: 7 });

    const cardY = top + 26;
    const ids = ["seek", "bastion", "reaper"];
    ids.forEach((id, index) => this.drawDoctrineCard(ctx, sim, id, 7 + index * 70, cardY, 62, 52));

    // 카드 아래에 텍스트를 겹쳐 놓지 않고, 작은 픽셀 인디케이터로 전투 밀도만 표시한다.
    // 세로형 작은 화면에서도 카드 라벨과 하단 안전 여백이 또렷하게 유지된다.
    const pressure = clamp(sim.enemies.length / 48, 0, 1);
    ctx.fillStyle = "#070910";
    ctx.fillRect(8, H - 4, W - 16, 2);
    ctx.fillStyle = sim.enemies.length > sim.units.length * 2 ? COLORS.red : COLORS.cyan;
    ctx.fillRect(8, H - 4, Math.round((W - 16) * pressure), 2);
  }

  drawDoctrineCard(ctx, sim, id, x, y, w, h) {
    const doctrine = DOCTRINES[id];
    const active = sim.doctrine === id;
    const pressed = active && sim.doctrineOverride > 0;
    ctx.fillStyle = "#070910";
    ctx.fillRect(x + 3, y + 4, w, h);
    ctx.fillStyle = active ? doctrine.color : COLORS.frame;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ecebe5";
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = "#171a27";
    ctx.fillRect(x + 7, y + 7, w - 14, h - 17);
    if (active) {
      ctx.globalAlpha = .16 + Math.sin(performance.now() * .008) * .05;
      ctx.fillStyle = doctrine.color;
      ctx.fillRect(x + 7, y + 7, w - 14, h - 17);
      ctx.globalAlpha = 1;
    }
    this.drawDoctrineIcon(ctx, doctrine.icon, x + w / 2, y + 21, active ? doctrine.color : COLORS.slate);
    drawKText(ctx, doctrine.label, x + w / 2, y + h - 12, { color: active ? doctrine.color : COLORS.frameDark, align: "center", size: 8 });
    if (pressed) {
      const fraction = clamp(sim.doctrineOverride / 11, 0, 1);
      ctx.fillStyle = doctrine.color;
      ctx.fillRect(x + 4, y + h - 4, Math.round((w - 8) * fraction), 2);
    }
  }

  drawDoctrineIcon(ctx, icon, x, y, color) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = color;
    if (icon === "up") {
      ctx.fillRect(x - 3, y - 7, 6, 15);
      ctx.fillRect(x - 7, y - 3, 14, 6);
      ctx.fillRect(x - 5, y - 5, 10, 4);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(x - 1, y - 4, 2, 9);
    } else if (icon === "block") {
      ctx.fillRect(x - 8, y - 7, 16, 15);
      ctx.fillStyle = COLORS.amberDark;
      ctx.fillRect(x - 5, y - 4, 10, 9);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(x - 4, y - 4, 8, 2);
    } else {
      ctx.fillRect(x - 8, y - 5, 16, 7);
      ctx.fillRect(x - 6, y + 2, 12, 4);
      ctx.fillRect(x - 3, y + 6, 6, 3);
      ctx.fillStyle = "#ff8a84";
      ctx.fillRect(x - 4, y - 4, 3, 3);
    }
  }

  drawProtocol(ctx, sim) {
    const p = sim.protocol;
    const y = ARENA.top + 7;
    ctx.fillStyle = "#0b0d16ee";
    ctx.fillRect(24, y, 168, 35);
    ctx.fillStyle = COLORS.frame;
    ctx.fillRect(24, y, 168, 2);
    ctx.fillRect(24, y + 33, 168, 2);
    const titleColor = p.result === "BREACH" ? COLORS.red : p.result ? COLORS.green : COLORS.paper;
    drawText(ctx, p.result || p.type, 108, y + 5, { color: titleColor, align: "center", scale: 1, shadow: "#000" });
    ctx.fillStyle = "#070910";
    ctx.fillRect(34, y + 17, 148, 9);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(35, y + 18, 146, 7);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(35, y + 18, Math.round(146 * p.needle), 7);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(34 + Math.round(148 * p.needle), y + 16, 2, 11);
    if (!p.result) drawText(ctx, `${Math.ceil(p.timer)}`, 187, y + 5, { color: COLORS.amber, align: "right", scale: 1 });
  }

  drawIntro(ctx, sim) {
    const alpha = sim.phaseTimer > 2.15
      ? clamp((2.65 - sim.phaseTimer) / .4, 0, 1)
      : sim.phaseTimer < .45 ? clamp(sim.phaseTimer / .45, 0, 1) : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#0a0c15e8";
    ctx.fillRect(22, 126, 172, 155);
    ctx.fillStyle = COLORS.frame;
    ctx.fillRect(20, 124, 176, 4);
    ctx.fillRect(20, 279, 176, 4);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(24, 128, 168, 2);
    drawKText(ctx, "소규모 전역", 108, 142, { color: COLORS.paper, align: "center", size: 15, shadow: COLORS.frameDark });
    drawKText(ctx, `제 ${sim.level}구역`, 108, 169, { color: COLORS.amber, align: "center", size: 8 });
    this.drawShrineEmblem(ctx, 108, 213, sim.time);
    drawKText(ctx, "자동 배치 개시", 108, 249, { color: COLORS.green, align: "center", size: 9 });
    drawKText(ctx, "조작 없이 자동 진행", 108, 263, { color: COLORS.slate, align: "center", size: 7 });
    ctx.globalAlpha = 1;
  }

  drawResult(ctx, sim, meta) {
    const result = sim.lastResult;
    if (!result) return;
    ctx.fillStyle = "#070910e8";
    ctx.fillRect(17, 111, 182, 188);
    ctx.fillStyle = result.win ? COLORS.green : COLORS.red;
    ctx.fillRect(17, 111, 182, 5);
    ctx.fillRect(17, 294, 182, 5);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(21, 118, 174, 2);
    drawKText(ctx, result.win ? "승천 성공" : "성소 함락", 108, 136, { color: result.win ? COLORS.green : COLORS.red, align: "center", size: 15, shadow: COLORS.frameDark });
    drawKText(ctx, result.reason, 108, 163, { color: COLORS.paper, align: "center", size: 8 });
    this.drawShrineEmblem(ctx, 108, 205, sim.time);
    drawKText(ctx, "점수", 72, 239, { color: COLORS.amber, align: "right", size: 7 });
    drawText(ctx, String(result.score).padStart(6, "0"), 79, 240, { color: COLORS.amber, scale: 1 });
    drawKText(ctx, "최고", 72, 252, { color: COLORS.slate, align: "right", size: 7 });
    drawText(ctx, String(meta.bestScore || 0).padStart(6, "0"), 79, 253, { color: COLORS.slate, scale: 1 });
    drawKText(ctx, `${Math.ceil(sim.phaseTimer)}초 뒤 다음 구역`, 108, 273, { color: COLORS.paper, align: "center", size: 7 });
  }

  drawShrineEmblem(ctx, x, y, time) {
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const angle = -Math.PI / 2 + i / steps * Math.PI * 2;
      const active = i / steps < ((time * .12) % 1);
      const px = Math.round(x + Math.cos(angle) * 28);
      const py = Math.round(y + Math.sin(angle) * 28);
      ctx.fillStyle = active ? COLORS.paper : COLORS.frameDark;
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x - 8, y - 12, 16, 22);
    ctx.fillRect(x - 13, y - 5, 26, 8);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x - 5, y - 9, 10, 16);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(x - 2, y - 5, 4, 8);
    ctx.fillRect(x - 5, y - 2, 10, 3);
  }

  drawPause(ctx) {
    ctx.fillStyle = "#070910d9";
    ctx.fillRect(0, ARENA.top, W, ARENA.bottom - ARENA.top);
    drawKText(ctx, "지휘 연결 일시정지", 108, 197, { color: COLORS.paper, align: "center", size: 14, shadow: COLORS.frameDark });
    drawKText(ctx, "화면으로 돌아오면 재개됩니다", 108, 222, { color: COLORS.slate, align: "center", size: 7 });
  }

  present(sim) {
    if (this.gl) {
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
      gl.uniform1f(this.uniforms.time, sim.time);
      gl.uniform1f(this.uniforms.flash, sim.screenFlash);
      gl.uniform1f(this.uniforms.impact, clamp(sim.screenShake / 8, 0, 1));
      gl.uniform1f(this.uniforms.reduce, this.reducedMotion ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (this.fallback) {
      this.fallback.fillStyle = COLORS.void;
      this.fallback.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.fallback.imageSmoothingEnabled = false;
      this.fallback.drawImage(this.scene, 0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

function pixelOctagon(ctx, x, y, radius, mode = "fill") {
  const cut = Math.max(2, Math.round(radius * .42));
  ctx.beginPath();
  ctx.moveTo(x - radius + cut, y - radius);
  ctx.lineTo(x + radius - cut, y - radius);
  ctx.lineTo(x + radius, y - radius + cut);
  ctx.lineTo(x + radius, y + radius - cut);
  ctx.lineTo(x + radius - cut, y + radius);
  ctx.lineTo(x - radius + cut, y + radius);
  ctx.lineTo(x - radius, y + radius - cut);
  ctx.lineTo(x - radius, y - radius + cut);
  ctx.closePath();
  mode === "stroke" ? ctx.stroke() : ctx.fill();
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${message}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}
