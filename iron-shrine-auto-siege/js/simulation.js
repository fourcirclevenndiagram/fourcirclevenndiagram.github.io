import {
  ARENA, DOCTRINES, UNIT_SPECS, ENEMY_SPECS, ROLE_NAMES,
  COLORS, clamp, lerp, distance, dist2
} from "./constants.js";
import { PRNG } from "./prng.js";

let NEXT_ID = 1;

export class Simulation {
  constructor(seed, hooks = {}) {
    this.baseSeed = seed >>> 0;
    this.hooks = hooks;
    this.round = 0;
    this.level = 1;
    this.wins = 0;
    this.losses = 0;
    this.speed = 1;
    this.paused = false;
    this.screenFlash = 0;
    this.screenShake = 0;
    this.camera = { x: 108, y: 210, zoom: 1, targetX: 108, targetY: 210, targetZoom: 1 };
    this.resetRound(false);
  }

  resetRound(wonPrevious = false) {
    if (this.round > 0) {
      if (wonPrevious) this.level++;
      else this.level = Math.max(1, this.level - (this.level > 3 ? 1 : 0));
    }
    this.round++;
    this.rng = new PRNG((this.baseSeed + this.round * 0x9e3779b9 + this.level * 971) >>> 0);
    this.phase = "intro";
    this.phaseTimer = 2.65;
    this.lastResult = null;
    this.time = 0;
    this.maxTime = 88;
    this.timeLeft = this.maxTime;
    this.score = 0;
    this.scrap = 34;
    this.coreCharge = 0;
    this.coreHp = 100;
    this.coreMaxHp = 100;
    this.waveIndex = 0;
    this.nextWave = 3.2;
    this.recruitTimer = 2.4;
    this.nextProtocol = 15.5;
    this.protocol = null;
    this.nextUnitBrief = 6.5;
    this.unitBrief = null;
    this.duel = null;
    this.presentationVisits = { status: 0, tactical: 0, duel: 0 };
    this.bossSpawned = false;
    this.doctrine = "seek";
    this.doctrineReason = "중계기 탐색";
    this.doctrineOverride = 0;
    this.doctrineThink = 3;
    this.units = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.trails = [];
    this.obstacles = [];
    this.relays = [
      this.makeRelay(0, 42, 91),
      this.makeRelay(1, 174, 112),
      this.makeRelay(2, 43, 314),
      this.makeRelay(3, 173, 330)
    ];
    this.core = { id: NEXT_ID++, kind: "core", x: 108, y: 211, radius: 13, flash: 0 };
    this.generateObstacles();

    this.spawnUnit("runner", 99, 218);
    this.spawnUnit("runner", 117, 218);
    this.spawnUnit("sentinel", 94, 207);
    this.spawnUnit("sentinel", 122, 207);
    this.spawnUnit("lancer", 102, 198);
    this.spawnUnit("lancer", 114, 198);
    this.spawnUnit("medic", 108, 224);

    this.camera.x = this.camera.targetX = 108;
    this.camera.y = this.camera.targetY = 211;
    this.camera.zoom = this.camera.targetZoom = 1;
    this.screenFlash = .25;
    this.screenShake = 1.5;
    this.message("자동 지휘 연결", COLORS.cyan, 108, 182, 1.8);
  }

  makeRelay(id, x, y) {
    return { id, kind: "relay", x, y, radius: 11, owner: 0, progress: 0, pulse: this.rng?.float(0, 6) || 0, flash: 0, incomeTick: 0 };
  }

  generateObstacles() {
    const fixed = [
      { x: 72, y: 73, w: 42, h: 8, style: 0 },
      { x: 128, y: 151, w: 34, h: 8, style: 1 },
      { x: 55, y: 174, w: 29, h: 8, style: 0 },
      { x: 77, y: 270, w: 48, h: 8, style: 1 },
      { x: 132, y: 293, w: 25, h: 8, style: 0 },
      { x: 24, y: 226, w: 9, h: 31, style: 1 },
      { x: 184, y: 198, w: 9, h: 33, style: 0 }
    ];
    this.obstacles.push(...fixed);
    let attempts = 0;
    while (this.obstacles.length < 13 && attempts++ < 100) {
      const vertical = this.rng.chance(.42);
      const obstacle = {
        x: this.rng.int(22, 182), y: this.rng.int(63, 347),
        w: vertical ? 8 : this.rng.int(16, 30),
        h: vertical ? this.rng.int(16, 29) : 8,
        style: this.rng.int(0, 2)
      };
      const center = { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 };
      const protectedPoints = [this.core, ...this.relays, { x: 108, y: 122 }, { x: 108, y: 312 }];
      if (protectedPoints.some(point => Math.hypot(point.x - center.x, point.y - center.y) < 29)) continue;
      if (this.obstacles.some(other => rectDistance(obstacle, other) < 12)) continue;
      this.obstacles.push(obstacle);
    }
  }

  setPaused(value) { this.paused = Boolean(value); }

  setSpeed(value) {
    this.speed = value;
    this.emit("tap");
  }

  setDoctrine(id, manual = true) {
    if (!DOCTRINES[id]) return;
    const changed = this.doctrine !== id;
    this.doctrine = id;
    this.doctrineReason = manual ? "관전자 임시 명령" : this.doctrineReason;
    if (manual) this.doctrineOverride = 11;
    if (changed || manual) {
      this.screenFlash = Math.max(this.screenFlash, .14);
      this.burst(108, 390, DOCTRINES[id].color, 20, 25, 2, false);
      this.message(DOCTRINES[id].label, DOCTRINES[id].color, 108, 363, 1.1);
      this.emit("protocol", { doctrine: id, manual });
    }
  }

  cycleSpeed() {
    this.setSpeed(this.speed === 1 ? 2 : this.speed === 2 ? .5 : 1);
  }

  update(dt) {
    if (this.paused) return;
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.9);
    this.screenShake = Math.max(0, this.screenShake - dt * 10);
    this.core.flash = Math.max(0, this.core.flash - dt * 4);
    for (const relay of this.relays) {
      relay.pulse += dt;
      relay.flash = Math.max(0, relay.flash - dt * 3);
    }
    this.updateParticles(dt);
    this.updateFloaters(dt);
    this.updateCamera(dt);

    if (this.phase === "intro") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = "play";
        this.emit("protocol", { intro: true });
      }
      return;
    }

    if (this.phase === "result") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.resetRound(Boolean(this.lastResult?.win));
      return;
    }

    if (this.duel) {
      this.updateDuel(dt);
      return;
    }

    this.time += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.scrap = Math.min(99, this.scrap + this.ownedRelays * dt * .11);
    this.doctrineOverride = Math.max(0, this.doctrineOverride - dt);
    this.doctrineThink -= dt;
    if (this.doctrineThink <= 0 && this.doctrineOverride <= 0) {
      this.chooseDoctrine();
      this.doctrineThink = this.rng.float(4.2, 6.4);
    }

    this.nextWave -= dt;
    if (this.nextWave <= 0) this.spawnWave();
    if (this.unitBrief) {
      this.unitBrief.timer -= dt;
      if (this.unitBrief.timer <= 0) this.unitBrief = null;
    } else {
      this.nextUnitBrief -= dt;
      if (this.nextUnitBrief <= 0 && !this.protocol) this.startUnitBrief();
    }

    this.nextProtocol -= dt;
    if (this.nextProtocol <= 0 && !this.protocol && !this.unitBrief) this.startProtocolClash();
    if (this.protocol) this.updateProtocol(dt);

    this.updateRelays(dt);
    this.updateUnits(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.removeDead();
    this.autoRecruit(dt);

    if (!this.bossSpawned && (this.coreCharge >= 55 || this.timeLeft <= 38)) this.spawnBoss();

    if (this.coreCharge >= 100) this.finish(true, "성소 승천 완료");
    else if (this.coreHp <= 0) this.finish(false, "성소 노심 붕괴");
    else if (this.timeLeft <= 0) this.finish(this.coreCharge >= 72, this.coreCharge >= 72 ? "불완전 승천 성공" : "지휘 연결 시간 초과");
  }

  get ownedRelays() { return this.relays.filter(relay => relay.owner === 1).length; }
  get corruptedRelays() { return this.relays.filter(relay => relay.owner === -1).length; }
  get boss() { return this.enemies.find(enemy => enemy.role === "herald" && !enemy.dead); }

  chooseDoctrine() {
    const nearby = this.enemies.filter(enemy => dist2(enemy, this.core) < 62 ** 2).length;
    const badlyHurt = this.units.filter(unit => unit.hp / unit.maxHp < .45).length;
    let next = this.doctrine;
    if (this.coreHp < 52 || nearby >= 5 || badlyHurt >= 3) {
      next = "bastion";
      this.doctrineReason = this.coreHp < 52 ? "성소 위험 감지" : "방어선 밀집";
    } else if (this.ownedRelays < 3) {
      next = "seek";
      this.doctrineReason = "중계기 탐색";
    } else if (this.enemies.length > this.units.length * 1.4 || this.boss) {
      next = "reaper";
      this.doctrineReason = this.boss ? "공허의 사도 지정" : "적 전력 과다";
    } else {
      next = this.rng.chance(.58) ? "reaper" : "bastion";
      this.doctrineReason = next === "reaper" ? "위협 전력 소거" : "충전선 수호";
    }
    this.setDoctrine(next, false);
  }

  startUnitBrief() {
    if (!this.units.length || this.duel || this.protocol) return;
    const roles = ["sentinel", "lancer", "runner", "medic"];
    const desiredRole = roles[this.presentationVisits.status % roles.length];
    const unit = this.units.find(candidate => candidate.role === desiredRole)
      || this.units.reduce((best, candidate) => candidate.maxHp > best.maxHp ? candidate : best, this.units[0]);
    this.unitBrief = {
      timer: 3.9,
      duration: 3.9,
      unit,
      roleName: ROLE_NAMES[unit.role],
      serial: `A-${String(unit.id % 100).padStart(2, "0")}`,
      attack: Math.round(UNIT_SPECS[unit.role].damage * this.damageMultiplier(unit) * 10),
      mobility: Math.round(UNIT_SPECS[unit.role].speed * 4.2),
      survival: Math.round(unit.hp / unit.maxHp * 100)
    };
    this.presentationVisits.status++;
    this.nextUnitBrief = this.rng.float(24, 29);
    this.emit("protocol", { status: true });
  }

  startDuel(boss) {
    if (this.duel || !boss) return;
    if (!this.units.length) this.spawnUnit("sentinel", this.core.x, this.core.y + 14);
    const champion = this.units.reduce((best, unit) => {
      const rating = unit.hp + UNIT_SPECS[unit.role].damage * 5;
      const bestRating = best.hp + UNIT_SPECS[best.role].damage * 5;
      return rating > bestRating ? unit : best;
    }, this.units[0]);
    this.duel = {
      phase: "intro",
      timer: 2.15,
      duration: 2.15,
      totalTime: 0,
      champion,
      boss,
      heroHp: 100,
      enemyHp: 100,
      heroScore: 0,
      enemyScore: 0,
      nextStrike: .52,
      ring: 0,
      result: null,
      sparks: []
    };
    this.presentationVisits.duel++;
  }

  updateDuel(dt) {
    const duel = this.duel;
    if (!duel) return;
    duel.totalTime += dt;
    duel.ring = (duel.ring + dt * .24) % 1;
    for (const spark of duel.sparks) {
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= Math.pow(.12, dt);
      spark.vy *= Math.pow(.12, dt);
    }
    duel.sparks = duel.sparks.filter(spark => spark.life > 0).slice(-90);

    if (duel.phase === "intro") {
      duel.timer -= dt;
      if (duel.timer <= 0) {
        duel.phase = "active";
        duel.timer = duel.duration = 7.2;
        duel.nextStrike = .25;
        this.emit("protocol", { duel: true });
      }
      return;
    }

    if (duel.phase === "result") {
      duel.timer -= dt;
      if (duel.timer <= 0) {
        this.duel = null;
        this.screenFlash = .32;
        this.screenShake = 3;
      }
      return;
    }

    duel.timer -= dt;
    duel.nextStrike -= dt;
    if (duel.nextStrike <= 0) {
      const doctrineEdge = this.doctrine === "reaper" ? .12 : this.doctrine === "bastion" ? .06 : .08;
      const healthEdge = (duel.champion.hp / duel.champion.maxHp - .5) * .16;
      const heroLands = this.rng.next() < clamp(.5 + doctrineEdge + healthEdge, .34, .74);
      const critical = this.rng.chance(.16);
      const damage = this.rng.float(7.5, 13.5) * (critical ? 1.65 : 1);
      if (heroLands) {
        duel.enemyHp = Math.max(0, duel.enemyHp - damage);
        duel.heroScore += critical ? 250 : 100;
        this.addDuelSparks(132, 245, critical ? COLORS.paper : COLORS.cyan, critical ? 25 : 13);
      } else {
        const mitigated = damage * (this.doctrine === "bastion" ? .68 : 1);
        duel.heroHp = Math.max(0, duel.heroHp - mitigated);
        duel.enemyScore += critical ? 250 : 100;
        this.addDuelSparks(84, 245, critical ? COLORS.paper : COLORS.red, critical ? 25 : 13);
      }
      duel.nextStrike = this.rng.float(.42, .78);
      this.screenFlash = Math.max(this.screenFlash, critical ? .32 : .08);
      this.screenShake = Math.max(this.screenShake, critical ? 5 : 2);
      this.emit(critical ? "hurt" : "hit", { duel: true, heroLands });
    }

    if (duel.heroHp <= 0 || duel.enemyHp <= 0 || duel.timer <= 0) this.resolveDuel();
  }

  addDuelSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.float(0, Math.PI * 2);
      const speed = this.rng.float(18, 62);
      this.duel.sparks.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: this.rng.float(.22, .7), maxLife: .7, color, size: this.rng.int(1, 3)
      });
    }
  }

  resolveDuel() {
    const duel = this.duel;
    if (!duel || duel.phase === "result") return;
    const won = duel.enemyHp <= 0 || (duel.heroHp > 0 && duel.heroHp >= duel.enemyHp);
    duel.phase = "result";
    duel.timer = duel.duration = 1.85;
    duel.result = won ? "수호대 승리" : "공허의 사도 승리";
    if (won) {
      this.damage(duel.boss, duel.boss.maxHp * .38, false);
      this.coreCharge = Math.min(100, this.coreCharge + 7);
      this.score += 600;
      this.emit("capture", { duel: true });
    } else {
      duel.champion.hp = Math.max(1, duel.champion.hp - duel.champion.maxHp * .28);
      this.coreHp = Math.max(1, this.coreHp - 9);
      this.emit("hurt", { duel: true });
    }
  }

  updateRelays(dt) {
    for (const relay of this.relays) {
      const runners = this.units.filter(unit => !unit.dead && unit.role === "runner" && dist2(unit, relay) < 15 ** 2).length;
      const guardians = this.units.filter(unit => !unit.dead && unit.role !== "runner" && dist2(unit, relay) < 13 ** 2).length;
      const corruptors = this.enemies.filter(enemy => !enemy.dead && (enemy.role === "leech" || enemy.role === "herald") && dist2(enemy, relay) < 16 ** 2).length;
      const beforeOwner = relay.owner;
      if (runners || corruptors) {
        const friendlyRate = runners * (this.doctrine === "seek" ? .34 : .23) + guardians * .035;
        const hostileRate = corruptors * (this.doctrine === "bastion" ? .16 : .27);
        relay.progress = clamp(relay.progress + (friendlyRate - hostileRate) * dt, -1, 1);
      } else if (relay.owner === 1) {
        relay.progress = Math.min(1, relay.progress + dt * .025);
      } else if (relay.owner === -1) {
        relay.progress = Math.max(-1, relay.progress - dt * .015);
      }

      if (relay.progress >= .995) relay.owner = 1;
      else if (relay.progress <= -.995) relay.owner = -1;
      else if (relay.owner === 1 && relay.progress < .16) relay.owner = 0;
      else if (relay.owner === -1 && relay.progress > -.16) relay.owner = 0;

      if (relay.owner !== beforeOwner) {
        relay.flash = 1;
        if (relay.owner === 1) {
          this.score += 180;
          this.scrap = Math.min(99, this.scrap + 8);
          this.burst(relay.x, relay.y, COLORS.green, 34, 38, 2, true);
          this.message("중계기 연결", COLORS.green, relay.x, relay.y - 15, 1.4);
          this.emit("capture", { relay: relay.id, owner: 1 });
        } else if (relay.owner === -1) {
          this.burst(relay.x, relay.y, COLORS.red, 26, 30, 2, true);
          this.message("중계기 함락", COLORS.red, relay.x, relay.y - 15, 1.3);
          this.emit("hurt", { relay: relay.id });
        }
      }

      if (relay.owner === 1) {
        const chargeRate = this.doctrine === "seek" ? .77 : this.doctrine === "bastion" ? .61 : .66;
        this.coreCharge = Math.min(100, this.coreCharge + chargeRate * dt);
        relay.incomeTick += dt;
        if (relay.incomeTick >= 1.25) {
          relay.incomeTick = 0;
          this.score += 3;
          this.spark(relay.x, relay.y, COLORS.green, 3);
        }
      }
    }
  }

  updateUnits(dt) {
    for (const unit of this.units) {
      if (unit.dead) continue;
      unit.cooldown -= dt;
      unit.ability -= dt;
      unit.flash = Math.max(0, unit.flash - dt * 6);
      unit.anim += dt * (2 + unit.speed * .15);

      if (unit.role === "medic") this.updateMedic(unit, dt);
      else if (unit.role === "runner") this.updateRunner(unit, dt);
      else this.updateFighter(unit, dt);

      if (this.doctrine === "reaper" && unit.ability <= 0 && unit.role !== "runner") {
        unit.ability = this.rng.float(6.5, 9);
        unit.overdrive = .8;
        this.burst(unit.x, unit.y, COLORS.red, 8, 18, 1, true);
      }
      unit.overdrive = Math.max(0, unit.overdrive - dt);
    }
  }

  updateRunner(unit, dt) {
    let destination;
    if (this.doctrine === "bastion" && this.enemies.some(enemy => dist2(enemy, this.core) < 60 ** 2)) {
      destination = orbitPoint(this.core, unit.id, 24, this.time * .15);
    } else {
      const candidates = this.relays.filter(relay => relay.owner !== 1 || relay.progress < .92);
      destination = nearest(unit, candidates) || orbitPoint(this.core, unit.id, 31, this.time * .12);
    }
    const threat = nearest(unit, this.enemies.filter(enemy => dist2(enemy, unit) < 38 ** 2));
    if (threat && distance(unit, threat) <= UNIT_SPECS.runner.range && unit.cooldown <= 0) {
      this.melee(unit, threat, UNIT_SPECS.runner.damage * this.damageMultiplier(unit), COLORS.green);
      unit.cooldown = UNIT_SPECS.runner.rate;
    } else {
      this.moveToward(unit, destination, UNIT_SPECS.runner.speed * this.speedMultiplier(unit), dt);
    }
  }

  updateFighter(unit, dt) {
    let target;
    if (this.doctrine === "bastion") {
      target = nearest(this.core, this.enemies.filter(enemy => dist2(enemy, this.core) < 78 ** 2));
    }
    if (!target && this.doctrine === "seek") {
      const runner = nearest(unit, this.units.filter(other => other.role === "runner" && other.id !== unit.id));
      if (runner) target = nearest(runner, this.enemies.filter(enemy => dist2(enemy, runner) < 60 ** 2));
    }
    target ||= this.boss || nearest(unit, this.enemies);
    if (!target) {
      this.moveToward(unit, orbitPoint(this.core, unit.id, unit.role === "sentinel" ? 27 : 42, this.time * .09), unit.speed, dt);
      return;
    }

    const spec = UNIT_SPECS[unit.role];
    const range = spec.range;
    const d = distance(unit, target);
    if (d <= range && unit.cooldown <= 0) {
      if (unit.role === "lancer") {
        this.shoot(unit, target, spec.damage * this.damageMultiplier(unit), COLORS.cyan, 70);
      } else {
        this.melee(unit, target, spec.damage * this.damageMultiplier(unit), COLORS.amber);
      }
      unit.cooldown = spec.rate * (unit.overdrive > 0 ? .55 : 1);
    } else {
      const preferred = unit.role === "lancer" ? Math.max(20, range * .62) : 0;
      if (d > preferred) this.moveToward(unit, target, spec.speed * this.speedMultiplier(unit), dt);
      else this.strafe(unit, target, spec.speed * .42, dt);
    }
  }

  updateMedic(unit, dt) {
    const injured = nearest(unit, this.units.filter(other => other.id !== unit.id && !other.dead && other.hp < other.maxHp * .86));
    if (injured && distance(unit, injured) <= 39 && unit.cooldown <= 0) {
      const healing = 7 + this.level * .35;
      injured.hp = Math.min(injured.maxHp, injured.hp + healing);
      injured.flash = .45;
      this.projectiles.push(this.makeProjectile(unit, injured, 0, COLORS.paper, 56, true));
      this.message(`+${Math.round(healing)}`, COLORS.green, injured.x, injured.y - 8, .8);
      unit.cooldown = .92;
      this.emit("shot");
    } else if (injured) {
      this.moveToward(unit, injured, UNIT_SPECS.medic.speed, dt);
    } else {
      const nearbyEnemy = nearest(unit, this.enemies.filter(enemy => dist2(enemy, unit) < 45 ** 2));
      if (nearbyEnemy && unit.cooldown <= 0) {
        this.shoot(unit, nearbyEnemy, UNIT_SPECS.medic.damage, COLORS.paper, 62);
        unit.cooldown = UNIT_SPECS.medic.rate;
      } else {
        this.moveToward(unit, orbitPoint(this.core, unit.id, 20, this.time * .11), UNIT_SPECS.medic.speed, dt);
      }
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.cooldown -= dt;
      enemy.flash = Math.max(0, enemy.flash - dt * 5);
      enemy.anim += dt * (1.7 + enemy.speed * .15);
      const spec = ENEMY_SPECS[enemy.role];
      let target;
      if (enemy.role === "leech") {
        target = nearest(enemy, this.relays.filter(relay => relay.owner === 1)) || nearest(enemy, this.units) || this.core;
      } else if (enemy.role === "wisp") {
        target = nearest(enemy, this.units) || this.core;
      } else if (enemy.role === "herald") {
        target = this.core;
      } else {
        const nearbyUnit = nearest(enemy, this.units.filter(unit => dist2(unit, enemy) < 43 ** 2));
        target = nearbyUnit || this.core;
      }

      const targetIsRelay = target?.kind === "relay";
      const d = distance(enemy, target);
      if (targetIsRelay && d < 14) {
        enemy.vx *= .82;
        enemy.vy *= .82;
        if (enemy.cooldown <= 0) {
          target.progress = Math.max(-1, target.progress - .12);
          enemy.cooldown = 1.05;
          this.spark(target.x, target.y, COLORS.red, 6);
        }
      } else if (d <= spec.range && enemy.cooldown <= 0) {
        if (enemy.role === "spitter") {
          this.shoot(enemy, target, spec.damage, COLORS.red, 46, true);
        } else if (target.kind === "core") {
          this.hurtCore(spec.damage * (enemy.role === "herald" ? 1.1 : 1));
          enemy.cooldown = spec.rate;
          enemy.vx -= (this.core.x - enemy.x) * .35;
          enemy.vy -= (this.core.y - enemy.y) * .35;
        } else {
          this.melee(enemy, target, spec.damage, COLORS.red, true);
        }
        enemy.cooldown = spec.rate;
      } else {
        this.moveToward(enemy, target, spec.speed, dt, true);
      }

      if (enemy.role === "rammer" && d > 25 && enemy.cooldown < -.8) {
        enemy.vx += ((target.x - enemy.x) / Math.max(1, d)) * 18;
        enemy.vy += ((target.y - enemy.y) / Math.max(1, d)) * 18;
        enemy.cooldown = .5;
      }
    }
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      if (projectile.life <= 0 || !projectile.target || projectile.target.dead) {
        projectile.dead = true;
        continue;
      }
      const dx = projectile.target.x - projectile.x;
      const dy = projectile.target.y - projectile.y;
      const d = Math.hypot(dx, dy) || 1;
      const homing = projectile.healing ? 13 : 5;
      projectile.vx = lerp(projectile.vx, dx / d * projectile.speed, clamp(dt * homing, 0, 1));
      projectile.vy = lerp(projectile.vy, dy / d * projectile.speed, clamp(dt * homing, 0, 1));
      projectile.px = projectile.x;
      projectile.py = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (d < projectile.speed * dt + projectile.target.radius + 2) {
        projectile.dead = true;
        if (!projectile.healing) {
          if (projectile.target.kind === "core") this.hurtCore(projectile.damage);
          else this.damage(projectile.target, projectile.damage, projectile.hostile);
          this.spark(projectile.x, projectile.y, projectile.color, 7);
        } else {
          this.spark(projectile.x, projectile.y, COLORS.green, 5);
        }
      }
    }
  }

  moveToward(entity, target, speed, dt, hostile = false) {
    if (!target) return;
    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const d = Math.hypot(dx, dy) || 1;
    let desiredX = dx / d * speed;
    let desiredY = dy / d * speed;

    const probeX = entity.x + desiredX * dt * 2.4;
    const probeY = entity.y + desiredY * dt * 2.4;
    if (this.collidesObstacle(probeX, probeY, entity.radius)) {
      const side = ((entity.id + Math.floor(this.time)) & 1) ? 1 : -1;
      const sx = -dy / d * speed * side;
      const sy = dx / d * speed * side;
      if (!this.collidesObstacle(entity.x + sx * dt * 2.8, entity.y + sy * dt * 2.8, entity.radius)) {
        desiredX = sx; desiredY = sy;
      } else {
        desiredX = -sx; desiredY = -sy;
      }
    }

    const accel = hostile ? 4.2 : 5.4;
    entity.vx = lerp(entity.vx, desiredX, clamp(dt * accel, 0, 1));
    entity.vy = lerp(entity.vy, desiredY, clamp(dt * accel, 0, 1));
    this.integrate(entity, dt);
  }

  strafe(entity, target, speed, dt) {
    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const d = Math.hypot(dx, dy) || 1;
    const sign = (entity.id & 1) ? 1 : -1;
    entity.vx = lerp(entity.vx, -dy / d * speed * sign, clamp(dt * 4, 0, 1));
    entity.vy = lerp(entity.vy, dx / d * speed * sign, clamp(dt * 4, 0, 1));
    this.integrate(entity, dt);
  }

  integrate(entity, dt) {
    entity.px = entity.x;
    entity.py = entity.y;
    const nextX = clamp(entity.x + entity.vx * dt, ARENA.left + entity.radius, ARENA.right - entity.radius);
    const nextY = clamp(entity.y + entity.vy * dt, ARENA.top + entity.radius, ARENA.bottom - entity.radius);
    if (!this.collidesObstacle(nextX, entity.y, entity.radius)) entity.x = nextX;
    else entity.vx *= -.2;
    if (!this.collidesObstacle(entity.x, nextY, entity.radius)) entity.y = nextY;
    else entity.vy *= -.2;
  }

  collidesObstacle(x, y, radius) {
    return this.obstacles.some(rect => x + radius > rect.x && x - radius < rect.x + rect.w && y + radius > rect.y && y - radius < rect.y + rect.h);
  }

  melee(attacker, target, amount, color, hostile = false) {
    this.damage(target, amount, hostile);
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    target.vx += dx / d * 5;
    target.vy += dy / d * 5;
    this.slash(target.x, target.y, color, Math.atan2(dy, dx));
    attacker.flash = .3;
    this.emit("hit", { hostile });
  }

  shoot(attacker, target, amount, color, speed, hostile = false) {
    this.projectiles.push(this.makeProjectile(attacker, target, amount, color, speed, false, hostile));
    attacker.flash = .25;
    this.emit("shot", { hostile });
  }

  makeProjectile(attacker, target, damage, color, speed, healing = false, hostile = false) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      id: NEXT_ID++, kind: "projectile", x: attacker.x, y: attacker.y, px: attacker.x, py: attacker.y,
      vx: dx / d * speed, vy: dy / d * speed, speed, target, damage, color,
      hostile, healing, life: 2.2, dead: false, radius: 1
    };
  }

  damage(target, amount, hostile = false) {
    if (!target || target.dead) return;
    let finalAmount = amount;
    if (target.kind === "unit" && this.doctrine === "bastion") finalAmount *= .74;
    target.hp -= finalAmount;
    target.flash = 1;
    this.screenShake = Math.max(this.screenShake, Math.min(5, finalAmount * .12));
    if (target.hp <= 0) {
      target.dead = true;
      this.burst(target.x, target.y, target.kind === "enemy" ? COLORS.red : COLORS.cyan, target.role === "herald" ? 75 : 18, target.role === "herald" ? 55 : 27, target.role === "herald" ? 3 : 2, true);
      if (target.kind === "enemy") {
        const spec = ENEMY_SPECS[target.role];
        this.score += spec.score;
        this.scrap = Math.min(99, this.scrap + (target.role === "herald" ? 28 : 1.5 + spec.score * .025));
        if (this.doctrine === "reaper") {
          const healer = nearest(target, this.units.filter(unit => !unit.dead && dist2(unit, target) < 42 ** 2));
          if (healer) healer.hp = Math.min(healer.maxHp, healer.hp + 2.2);
        }
        if (target.role === "herald") {
          this.coreCharge = Math.min(100, this.coreCharge + 14);
          this.message("공허의 사도 소멸", COLORS.paper, target.x, target.y - 18, 2);
          this.emit("capture", { boss: true });
        }
      }
    }
  }

  hurtCore(amount) {
    const reduction = this.doctrine === "bastion" ? .62 : 1;
    const actual = amount * reduction;
    this.coreHp = Math.max(0, this.coreHp - actual);
    this.core.flash = 1;
    this.screenFlash = Math.max(this.screenFlash, .35);
    this.screenShake = Math.max(this.screenShake, 4.2);
    this.burst(this.core.x, this.core.y, COLORS.red, 10, 25, 2, true);
    this.message(`-${Math.ceil(actual)}`, COLORS.red, this.core.x, this.core.y - 16, .9);
    this.emit("hurt", { core: true });
  }

  spawnUnit(role, x = this.core.x, y = this.core.y + 15) {
    const spec = UNIT_SPECS[role];
    const scale = 1 + (this.level - 1) * .035;
    const unit = {
      id: NEXT_ID++, kind: "unit", role, x, y, px: x, py: y, vx: 0, vy: 0,
      radius: role === "sentinel" ? 5 : 4, hp: spec.hp * scale, maxHp: spec.hp * scale,
      speed: spec.speed, damage: spec.damage, cooldown: this.rng.float(0, .5), ability: this.rng.float(2, 5),
      flash: 0, anim: this.rng.float(0, 6), overdrive: 0, dead: false
    };
    this.units.push(unit);
    this.burst(x, y, spec.color, 10, 15, 1, true);
    return unit;
  }

  spawnEnemy(role, x, y) {
    const spec = ENEMY_SPECS[role];
    const difficulty = 1 + (this.level - 1) * .1 + this.waveIndex * .012;
    const enemy = {
      id: NEXT_ID++, kind: "enemy", role, x, y, px: x, py: y, vx: 0, vy: 0,
      radius: role === "herald" ? 11 : role === "brute" ? 7 : 4,
      hp: spec.hp * difficulty, maxHp: spec.hp * difficulty,
      speed: spec.speed, cooldown: this.rng.float(.1, .9), flash: 0,
      anim: this.rng.float(0, 7), dead: false
    };
    this.enemies.push(enemy);
    this.burst(x, y, spec.color, role === "herald" ? 50 : 12, role === "herald" ? 45 : 17, role === "herald" ? 3 : 1, true);
    return enemy;
  }

  spawnWave() {
    this.waveIndex++;
    const count = clamp(2 + Math.floor(this.level * .45) + Math.floor(this.time / 18), 2, 8);
    const edge = this.rng.int(0, 3);
    for (let i = 0; i < count && this.enemies.length < 48; i++) {
      const role = this.pickEnemyRole();
      const spawn = this.edgeSpawn(edge, i, count);
      this.spawnEnemy(role, spawn.x, spawn.y);
    }
    this.nextWave = Math.max(3.3, 6.2 - this.level * .15 - this.time * .012) + this.rng.float(-.5, .8);
    this.message(`제 ${String(this.waveIndex).padStart(2, "0")} 공세`, COLORS.red, 108, 55, .9);
  }

  pickEnemyRole() {
    const roll = this.rng.next();
    if (this.time > 54 && roll < .11) return "brute";
    if (this.time > 31 && roll < .26) return "rammer";
    if (this.time > 20 && roll < .43) return "leech";
    if (roll < .62) return "spitter";
    if (roll < .78) return "wisp";
    return "gnawer";
  }

  edgeSpawn(edge, index, count) {
    const spread = (index - (count - 1) / 2) * 9 + this.rng.float(-3, 3);
    if (edge === 0) return { x: clamp(108 + spread, 14, 202), y: ARENA.top + 4 };
    if (edge === 1) return { x: ARENA.right - 4, y: clamp(211 + spread * 1.4, 50, 372) };
    if (edge === 2) return { x: clamp(108 + spread, 14, 202), y: ARENA.bottom - 4 };
    return { x: ARENA.left + 4, y: clamp(211 + spread * 1.4, 50, 372) };
  }

  spawnBoss() {
    this.bossSpawned = true;
    const spawn = this.edgeSpawn(this.rng.int(0, 3), 0, 1);
    const boss = this.spawnEnemy("herald", spawn.x, spawn.y);
    boss.hp *= 1 + this.level * .05;
    boss.maxHp = boss.hp;
    this.message("공허의 사도 출현", COLORS.red, 108, 77, 2.1);
    this.screenFlash = .8;
    this.screenShake = 8;
    this.emit("boss");
    this.startDuel(boss);
  }

  autoRecruit(dt) {
    this.recruitTimer = (this.recruitTimer ?? 2.4) - dt;
    if (this.recruitTimer > 0) return;
    this.recruitTimer = 2.7;
    const cap = Math.min(13, 7 + Math.ceil(this.level * .65));
    if (this.units.length >= cap) return;
    const counts = role => this.units.filter(unit => unit.role === role).length;
    let role;
    if (counts("runner") < 2) role = "runner";
    else if (counts("medic") < Math.max(1, Math.floor(cap / 7))) role = "medic";
    else if (this.doctrine === "bastion" && counts("sentinel") < 4) role = "sentinel";
    else role = counts("lancer") <= counts("sentinel") ? "lancer" : "sentinel";
    const cost = UNIT_SPECS[role].cost;
    if (this.scrap >= cost) {
      this.scrap -= cost;
      this.spawnUnit(role, this.core.x + this.rng.float(-8, 8), this.core.y + this.rng.float(-8, 8));
      this.message(`${ROLE_NAMES[role]} 증원`, UNIT_SPECS[role].color, this.core.x, this.core.y + 18, .8);
    }
  }

  startProtocolClash() {
    const friendlyPower = this.units.reduce((sum, unit) => sum + unit.hp / unit.maxHp, 0) + this.ownedRelays * 1.7 + this.coreHp / 30;
    const enemyPower = this.enemies.reduce((sum, enemy) => sum + Math.min(4, enemy.hp / 38), 0) + this.level * 1.2;
    this.protocol = {
      type: this.rng.pick(["전술 충돌", "신호 쟁탈", "성소 도박"]),
      duration: 4.2, timer: 4.2, friendlyPower, enemyPower, result: null, resultTimer: 0,
      needle: .5
    };
    this.nextProtocol = this.rng.float(18, 23);
    this.presentationVisits.tactical++;
    this.emit("protocol", { clash: true });
  }

  updateProtocol(dt) {
    const p = this.protocol;
    if (!p) return;
    if (p.result) {
      p.resultTimer -= dt;
      if (p.resultTimer <= 0) this.protocol = null;
      return;
    }
    p.timer -= dt;
    const doctrineBonus = this.doctrine === "seek" ? this.ownedRelays * .9
      : this.doctrine === "bastion" ? this.coreHp / 36
      : this.enemies.length * .22;
    const friendly = p.friendlyPower + doctrineBonus + Math.sin(this.time * 5) * .35;
    const enemy = p.enemyPower + Math.cos(this.time * 4.3) * .35;
    p.needle = clamp(.5 + (friendly - enemy) / Math.max(12, friendly + enemy), .06, .94);
    if (p.timer <= 0) {
      const success = friendly * this.rng.float(.93, 1.09) >= enemy;
      p.result = success ? (friendly > enemy * 1.35 ? "완벽 제압" : "연결 성공") : "방벽 파손";
      p.resultTimer = 1.6;
      if (success) {
        this.coreCharge = Math.min(100, this.coreCharge + (p.result === "완벽 제압" ? 8 : 5));
        this.coreHp = Math.min(100, this.coreHp + 7);
        this.score += p.result === "완벽 제압" ? 350 : 220;
        this.burst(this.core.x, this.core.y, COLORS.green, 30, 38, 2, true);
        this.emit("capture", { protocol: true });
      } else {
        this.hurtCore(9);
        const spawn = this.edgeSpawn(this.rng.int(0, 3), 0, 1);
        this.spawnEnemy(this.time > 45 ? "brute" : "rammer", spawn.x, spawn.y);
      }
    }
  }

  finish(win, reason) {
    if (this.phase !== "play") return;
    this.phase = "result";
    this.phaseTimer = 5.4;
    this.lastResult = { win, reason, score: Math.round(this.score), level: this.level, round: this.round };
    if (win) {
      this.wins++;
      this.burst(this.core.x, this.core.y, COLORS.paper, 120, 75, 3, true);
      this.screenFlash = 1;
      this.emit("win", this.lastResult);
    } else {
      this.losses++;
      this.burst(this.core.x, this.core.y, COLORS.red, 90, 70, 3, true);
      this.emit("lose", this.lastResult);
    }
    this.hooks.result?.(this.lastResult);
  }

  removeDead() {
    this.units = this.units.filter(unit => !unit.dead);
    this.enemies = this.enemies.filter(enemy => !enemy.dead);
    this.projectiles = this.projectiles.filter(projectile => !projectile.dead);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.08, dt);
      particle.vy = particle.vy * Math.pow(.12, dt) + particle.gravity * dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0).slice(-480);
  }

  updateFloaters(dt) {
    for (const floater of this.floaters) {
      floater.life -= dt;
      floater.y -= dt * floater.speed;
    }
    this.floaters = this.floaters.filter(floater => floater.life > 0).slice(-30);
  }

  updateCamera(dt) {
    const boss = this.boss;
    if (boss) {
      this.camera.targetX = lerp(this.core.x, boss.x, .42);
      this.camera.targetY = lerp(this.core.y, boss.y, .42);
      this.camera.targetZoom = 1.08;
    } else if (this.protocol) {
      this.camera.targetX = this.core.x;
      this.camera.targetY = this.core.y;
      this.camera.targetZoom = 1.055;
    } else if (this.enemies.length) {
      const threat = this.enemies.reduce((best, enemy) => dist2(enemy, this.core) < dist2(best, this.core) ? enemy : best, this.enemies[0]);
      this.camera.targetX = lerp(this.core.x, threat.x, .22);
      this.camera.targetY = lerp(this.core.y, threat.y, .22);
      this.camera.targetZoom = 1.025;
    } else {
      this.camera.targetX = 108;
      this.camera.targetY = 211;
      this.camera.targetZoom = 1;
    }
    const follow = clamp(dt * 1.8, 0, 1);
    this.camera.x = lerp(this.camera.x, this.camera.targetX, follow);
    this.camera.y = lerp(this.camera.y, this.camera.targetY, follow);
    this.camera.zoom = lerp(this.camera.zoom, this.camera.targetZoom, clamp(dt * 2.2, 0, 1));
  }

  damageMultiplier(unit) {
    return (this.doctrine === "reaper" ? 1.26 : 1) * (unit.overdrive > 0 ? 1.35 : 1) * (1 + (this.level - 1) * .025);
  }

  speedMultiplier(unit) {
    return (this.doctrine === "seek" ? 1.22 : 1) * (unit.overdrive > 0 ? 1.18 : 1);
  }

  burst(x, y, color, count = 14, velocity = 25, size = 2, glow = false) {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.float(0, Math.PI * 2);
      const speed = this.rng.float(velocity * .22, velocity);
      const life = this.rng.float(.25, .85);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, color, size: Math.max(1, Math.round(size * this.rng.float(.55, 1.35))),
        glow, gravity: this.rng.float(-2, 12)
      });
    }
  }

  spark(x, y, color, count = 5) { this.burst(x, y, color, count, 18, 1, true); }

  slash(x, y, color, angle) {
    for (let i = -3; i <= 3; i++) {
      const tangent = angle + Math.PI / 2;
      this.particles.push({
        x: x + Math.cos(tangent) * i * 1.3, y: y + Math.sin(tangent) * i * 1.3,
        vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12,
        life: .18 + Math.abs(i) * .015, maxLife: .25, color, size: 1, glow: true, gravity: 0
      });
    }
  }

  message(text, color, x = 108, y = 180, life = 1) {
    this.floaters.push({ text: String(text).toUpperCase(), color, x, y, life, maxLife: life, speed: 7 });
  }

  emit(type, payload = {}) { this.hooks.event?.(type, payload); }
}

function nearest(origin, items) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of items || []) {
    if (!item || item.dead) continue;
    const d = dist2(origin, item);
    if (d < bestDistance) { bestDistance = d; best = item; }
  }
  return best;
}

function orbitPoint(center, id, radius, time) {
  const angle = id * 2.39996 + time;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function rectDistance(a, b) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by) - Math.max(a.w, a.h, b.w, b.h) / 2;
}
