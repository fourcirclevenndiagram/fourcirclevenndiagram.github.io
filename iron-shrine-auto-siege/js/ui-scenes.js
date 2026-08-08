import {
  W, H, COLORS, DOCTRINES, UNIT_SPECS, ROLE_NAMES, ENEMY_NAMES, clamp
} from "./constants.js";
import { drawText, drawKText } from "./bitmap-font.js";
import {
  drawPixelPanel, drawGridBackdrop, drawTechCorners, drawSegmentRing,
  drawCommanderPortrait, drawHeraldPortrait, drawDoctrineGlyph,
  drawShield, drawReticle
} from "./portrait-art.js";

export function drawUnitStatusScene(ctx, sim, meta) {
  const brief = sim.unitBrief;
  if (!brief) return;
  const unit = brief.unit;
  const color = UNIT_SPECS[unit.role].color;
  const elapsed = brief.duration - brief.timer;
  drawGridBackdrop(ctx, W, H, sim.time + elapsed, "#2d354b");
  drawOuterFrame(ctx, color);

  ctx.fillStyle = "#111522ee";
  ctx.fillRect(7, 6, 202, 68);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(7, 72, 202, 3);
  drawKText(ctx, "부대 상태", 10, 8, { size: 10, color: COLORS.paper, shadow: "#000" });
  drawText(ctx, brief.serial, 10, 22, { scale: 1, color });

  drawKText(ctx, "내구도", 10, 38, { size: 7, color: COLORS.slate });
  drawSegmentBar(ctx, 10, 49, 110, 9, unit.hp / unit.maxHp, unit.hp / unit.maxHp < .35 ? COLORS.red : color, 11);
  drawText(ctx, `${Math.ceil(unit.hp)}/${Math.ceil(unit.maxHp)}`, 122, 49, { scale: 1, color: COLORS.paper });
  drawKText(ctx, "점수", 10, 62, { size: 7, color: COLORS.amber });
  drawText(ctx, Math.round(sim.score).toString().padStart(6, "0"), 39, 62, { scale: 1, color: COLORS.amber });
  drawKText(ctx, "시간", 205, 9, { size: 8, color: COLORS.red, align: "right" });
  drawText(ctx, String(Math.ceil(sim.timeLeft)).padStart(3, "0"), 205, 24, { scale: 2, color: COLORS.paper, align: "right", shadow: COLORS.redDark });
  drawKText(ctx, `제 ${sim.level}구역`, 205, 51, { size: 8, color: COLORS.slate, align: "right" });

  drawKText(ctx, brief.roleName, 108, 82, { size: 13, color, align: "center", shadow: "#05060b" });
  drawKText(ctx, `부대 식별 ${brief.serial}`, 108, 98, { size: 7, color: COLORS.slate, align: "center" });

  drawGlassCase(ctx, 45, 111, 126, 224, color, elapsed);
  drawStatusDebris(ctx, elapsed, color);
  drawCommanderPortrait(ctx, unit, 108, 235, 4.15, false, true);
  drawScanSweep(ctx, 51, 117, 114, 212, elapsed, color);

  drawStatBox(ctx, 9, 128, 33, 45, "공격", brief.attack, 160, COLORS.red);
  drawStatBox(ctx, 174, 128, 33, 45, "기동", brief.mobility, 100, COLORS.green);
  drawStatBox(ctx, 9, 270, 33, 45, "생존", brief.survival, 100, COLORS.amber);
  drawStatBox(ctx, 174, 270, 33, 45, "동조", Math.round(62 + sim.ownedRelays * 9), 100, COLORS.cyan);

  drawKText(ctx, "전술 모듈", 108, 343, { size: 8, color: COLORS.slate, align: "center" });
  const ids = ["seek", "bastion", "reaper"];
  ids.forEach((id, index) => drawModuleCard(ctx, id, 7 + index * 70, 356, 62, 82, sim.doctrine === id, elapsed));
  drawKText(ctx, "자동 분석 중", 108, 447, { size: 7, color: COLORS.paper, align: "center" });
  drawKText(ctx, `${Math.max(0, brief.timer).toFixed(1)}초`, 205, 447, { size: 7, color, align: "right" });
}

export function drawTacticalScene(ctx, sim, meta) {
  const protocol = sim.protocol;
  if (!protocol) return;
  const elapsed = protocol.duration - Math.max(0, protocol.timer);
  drawGridBackdrop(ctx, W, H, sim.time + elapsed, "#29263f");
  drawOuterFrame(ctx, protocol.result === "방벽 파손" ? COLORS.red : COLORS.green);

  drawPixelPanel(ctx, 18, 12, 180, 52, COLORS.frame, true);
  drawKText(ctx, protocol.result || protocol.type, 108, 25, {
    size: protocol.result ? 14 : 13,
    color: protocol.result === "방벽 파손" ? COLORS.red : protocol.result ? COLORS.green : COLORS.paper,
    align: "center", shadow: "#000"
  });
  drawKText(ctx, "자동 전술 판정", 108, 45, { size: 7, color: COLORS.slate, align: "center" });

  drawBalanceBar(ctx, protocol.needle, 10, 76, 196, 24);
  drawKText(ctx, "수호대", 12, 103, { size: 7, color: COLORS.green });
  drawKText(ctx, "침식군", 204, 103, { size: 7, color: COLORS.red, align: "right" });

  const ids = ["seek", "bastion", "reaper"];
  ids.forEach((id, index) => drawTacticalBadge(ctx, id, 29, 145 + index * 60, sim.doctrine === id, sim.time));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = .1 + Math.sin(sim.time * 4) * .03;
  ctx.fillStyle = sim.doctrine === "reaper" ? COLORS.red : sim.doctrine === "bastion" ? COLORS.amber : COLORS.green;
  ctx.beginPath();
  ctx.arc(110, 224, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawReticle(ctx, 110, 224, 29, COLORS.paper, sim.time * .35);
  drawReticle(ctx, 110, 224, 47, COLORS.frame, -sim.time * .18);
  drawSegmentRing(ctx, 110, 224, 40, protocol.needle, COLORS.green, COLORS.redDark, 28, 3, sim.time * .025);
  drawText(ctx, String(Math.ceil(protocol.timer)).padStart(2, "0"), 110, 216, { scale: 2, color: COLORS.paper, align: "center", shadow: "#000" });
  drawKText(ctx, "표적 동기화", 110, 244, { size: 7, color: COLORS.slate, align: "center" });

  drawShield(ctx, 181, 148, 1.2, sim.coreHp < 35 ? COLORS.red : COLORS.green);
  drawText(ctx, `${Math.ceil(sim.coreHp)}%`, 181, 177, { scale: 1, color: COLORS.paper, align: "center" });
  drawKText(ctx, "성소 방벽", 181, 187, { size: 7, color: COLORS.slate, align: "center" });

  drawDirectionPad(ctx, 43, 361, COLORS.frame);
  drawVerticalKeys(ctx, 103, 339);
  drawControlOrb(ctx, 169, 354, sim.time, sim.doctrine);
  drawTacticalDevice(ctx, 150, 281, sim.time, protocol.needle);

  ctx.fillStyle = "#171b2aee";
  ctx.fillRect(8, 421, 200, 32);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(8, 421, 200, 2);
  drawKText(ctx, sim.doctrineOverride > 0 ? "관전자 명령 적용" : "지휘 인공지능 판단", 12, 430, {
    size: 8, color: sim.doctrineOverride > 0 ? COLORS.amber : COLORS.cyan
  });
  drawKText(ctx, sim.doctrineReason, 204, 430, { size: 8, color: COLORS.paper, align: "right" });
  drawKText(ctx, "판정 화면에서도 전투는 계속 진행됩니다", 108, 455, { size: 6, color: COLORS.slate, align: "center" });
}

export function drawDuelScene(ctx, sim, meta) {
  const duel = sim.duel;
  if (!duel) return;
  drawGridBackdrop(ctx, W, H, duel.totalTime, "#30364a");
  ctx.fillStyle = "#30364a";
  ctx.fillRect(8, 8, 200, 452);
  ctx.fillStyle = "#111522";
  ctx.fillRect(16, 20, 184, 426);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(16, 20, 184, 4);
  ctx.fillRect(16, 442, 184, 4);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(20, 28, 176, 410);
  ctx.fillStyle = "#0d101b";
  ctx.fillRect(24, 32, 168, 402);
  drawTechCorners(ctx, 29, 37, 158, 392, COLORS.paper, 9);

  drawKText(ctx, "일기토", 108, 47, { size: 22, color: COLORS.paper, align: "center", shadow: COLORS.frameDark });
  drawKText(ctx, duel.phase === "intro" ? "대결 준비" : duel.phase === "active" ? "자동 교전" : duel.result, 108, 76, {
    size: 9,
    color: duel.phase === "result" ? (duel.result === "수호대 승리" ? COLORS.green : COLORS.red) : COLORS.amber,
    align: "center"
  });

  drawKText(ctx, "수호대", 38, 99, { size: 8, color: COLORS.cyan });
  drawKText(ctx, "공허의 사도", 178, 99, { size: 8, color: COLORS.red, align: "right" });
  drawText(ctx, String(duel.heroScore).padStart(6, "0"), 38, 113, { scale: 1, color: COLORS.paper });
  drawText(ctx, String(duel.enemyScore).padStart(6, "0"), 178, 113, { scale: 1, color: COLORS.paper, align: "right" });

  drawDuelHealth(ctx, 34, 133, 68, duel.heroHp / 100, COLORS.cyan, false);
  drawDuelHealth(ctx, 114, 133, 68, duel.enemyHp / 100, COLORS.red, true);
  drawKText(ctx, ROLE_NAMES[duel.champion.role], 38, 149, { size: 7, color: UNIT_SPECS[duel.champion.role].color });
  drawKText(ctx, ENEMY_NAMES.herald, 178, 149, { size: 7, color: COLORS.red, align: "right" });

  const activeFraction = duel.phase === "intro" ? 1 - duel.timer / duel.duration
    : duel.phase === "active" ? duel.timer / duel.duration : 1;
  drawSegmentRing(ctx, 108, 254, 78, activeFraction, COLORS.paper, COLORS.frameDark, 48, 5, duel.ring);
  drawSegmentRing(ctx, 108, 254, 68, duel.heroHp / 100, COLORS.cyan, COLORS.redDark, 40, 3, -duel.ring * .4);
  drawCommanderPortrait(ctx, duel.champion, 78, 258, 2.55, false, true);
  drawHeraldPortrait(ctx, 139, 258, 2.55, true, duel.totalTime);
  drawDuelSlash(ctx, duel.totalTime, duel.phase);
  drawDuelSparks(ctx, duel.sparks);

  if (duel.phase === "intro") {
    drawKText(ctx, "전투원 분석 완료", 108, 339, { size: 9, color: COLORS.paper, align: "center" });
    drawText(ctx, Math.ceil(duel.timer).toString(), 108, 357, { scale: 2, color: COLORS.amber, align: "center", shadow: COLORS.redDark });
  } else if (duel.phase === "active") {
    drawKText(ctx, "남은 시간", 108, 339, { size: 8, color: COLORS.slate, align: "center" });
    drawText(ctx, duel.timer.toFixed(1), 108, 353, { scale: 2, color: COLORS.paper, align: "center", shadow: COLORS.frameDark });
  } else {
    drawKText(ctx, duel.result, 108, 346, {
      size: 15, color: duel.result === "수호대 승리" ? COLORS.green : COLORS.red,
      align: "center", shadow: "#000"
    });
  }

  drawDuelButton(ctx, 29, 385, 72, 37, duel.phase === "intro" ? "개시" : "자동", duel.phase !== "result" ? COLORS.paper : COLORS.frame);
  drawDuelButton(ctx, 115, 385, 72, 37, duel.phase === "result" ? "복귀" : "관전", duel.phase === "result" ? COLORS.green : COLORS.paper);
  drawKText(ctx, "모든 판정은 자동으로 처리됩니다", 108, 428, { size: 6, color: COLORS.slate, align: "center" });
}

function drawOuterFrame(ctx, accent) {
  ctx.fillStyle = "#080a12";
  ctx.fillRect(0, 0, W, 4);
  ctx.fillRect(0, H - 4, W, 4);
  ctx.fillRect(0, 0, 4, H);
  ctx.fillRect(W - 4, 0, 4, H);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(4, 4, W - 8, 2);
  ctx.fillRect(4, H - 6, W - 8, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(5, 5, 24, 2);
  ctx.fillRect(W - 29, H - 7, 24, 2);
}

function drawSegmentBar(ctx, x, y, w, h, fraction, color, segments = 10) {
  ctx.fillStyle = "#070910";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const gap = 2;
  const segmentWidth = Math.floor((w - gap * (segments - 1)) / segments);
  for (let i = 0; i < segments; i++) {
    const filled = (i + .5) / segments <= fraction;
    ctx.fillStyle = filled ? color : "#292d3e";
    ctx.fillRect(x + i * (segmentWidth + gap), y, segmentWidth, h);
    if (filled) {
      ctx.fillStyle = COLORS.paper;
      ctx.globalAlpha = .24;
      ctx.fillRect(x + i * (segmentWidth + gap), y, segmentWidth, 2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawGlassCase(ctx, x, y, w, h, color, time) {
  ctx.fillStyle = "#070910aa";
  ctx.fillRect(x + 5, y + 7, w, h);
  ctx.fillStyle = COLORS.frameDark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#242b40";
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  const glass = ctx.createLinearGradient(x, y, x + w, y + h);
  glass.addColorStop(0, "#7db7ff1d");
  glass.addColorStop(.45, "#1b263622");
  glass.addColorStop(1, "#7db7ff0d");
  ctx.fillStyle = glass;
  ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  drawTechCorners(ctx, x + 6, y + 6, w - 12, h - 12, COLORS.paper, 9);
  ctx.fillStyle = color;
  ctx.globalAlpha = .25;
  ctx.fillRect(x + 10, y + 12, 2, h - 24);
  ctx.fillRect(x + w - 12, y + 12, 2, h - 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#9eb6d31a";
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 10);
  ctx.lineTo(x + 49, y + 10);
  ctx.lineTo(x + 22, y + h - 10);
  ctx.lineTo(x + 10, y + h - 10);
  ctx.fill();
}

function drawScanSweep(ctx, x, y, w, h, time, color) {
  const scanY = y + ((time * 55) % h);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = .32;
  ctx.fillStyle = color;
  ctx.fillRect(x, Math.round(scanY), w, 2);
  ctx.globalAlpha = .08;
  ctx.fillRect(x, Math.round(scanY) - 4, w, 10);
  ctx.restore();
}

function drawStatusDebris(ctx, time, color) {
  for (let i = 0; i < 18; i++) {
    const x = 12 + ((i * 47 + Math.floor(time * (4 + i % 3))) % 192);
    const y = 91 + ((i * 83 + Math.floor(time * (7 + i % 4))) % 238);
    if (x > 42 && x < 174) continue;
    const size = 1 + (i % 3);
    ctx.fillStyle = i % 5 === 0 ? color : "#66718e";
    ctx.globalAlpha = .35 + (i % 4) * .12;
    ctx.fillRect(x, y, size, size + (i % 2));
  }
  ctx.globalAlpha = 1;
}

function drawStatBox(ctx, x, y, w, h, label, value, max, color) {
  ctx.fillStyle = "#090b14cc";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(x, y, w, 2);
  drawKText(ctx, label, x + w / 2, y + 6, { size: 7, color: COLORS.slate, align: "center" });
  drawText(ctx, String(value).padStart(3, "0"), x + w / 2, y + 18, { scale: 1, color, align: "center" });
  ctx.fillStyle = "#242838";
  ctx.fillRect(x + 5, y + 34, w - 10, 4);
  ctx.fillStyle = color;
  ctx.fillRect(x + 5, y + 34, Math.round((w - 10) * clamp(value / max, 0, 1)), 4);
}

function drawModuleCard(ctx, id, x, y, w, h, active, time) {
  const doctrine = DOCTRINES[id];
  drawPixelPanel(ctx, x, y, w, h, active ? doctrine.color : COLORS.frame, true);
  if (active) {
    ctx.fillStyle = doctrine.color;
    ctx.globalAlpha = .1 + Math.sin(time * 5) * .04;
    ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
    ctx.globalAlpha = 1;
  }
  drawDoctrineGlyph(ctx, id, x + w / 2, y + 30, 1.4, active);
  drawKText(ctx, doctrine.label, x + w / 2, y + 53, { size: 9, color: active ? doctrine.color : COLORS.slate, align: "center" });
  drawKText(ctx, active ? "가동" : "대기", x + w / 2, y + 67, { size: 6, color: active ? COLORS.paper : COLORS.frame, align: "center" });
}

function drawBalanceBar(ctx, fraction, x, y, w, h) {
  ctx.fillStyle = "#070910";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(x + 5, y + 5, Math.round((w - 10) * fraction), h - 10);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(x + 4 + Math.round((w - 8) * fraction), y + 1, 3, h - 2);
  ctx.fillStyle = "#ffffff44";
  ctx.fillRect(x + 5, y + 5, w - 10, 2);
}

function drawTacticalBadge(ctx, id, x, y, active, time) {
  const doctrine = DOCTRINES[id];
  ctx.fillStyle = "#080a12";
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = active ? doctrine.color : COLORS.frame;
  ctx.lineWidth = active ? 3 : 2;
  ctx.stroke();
  if (active) drawSegmentRing(ctx, x, y, 24, .72, doctrine.color, "#00000000", 18, 2, time * .06);
  drawDoctrineGlyph(ctx, id, x, y, 1, active);
  drawKText(ctx, doctrine.label, x + 27, y - 5, { size: 8, color: active ? doctrine.color : COLORS.slate });
}

function drawDirectionPad(ctx, x, y, color) {
  ctx.fillStyle = "#080a12";
  ctx.beginPath();
  ctx.arc(x, y, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.frameDark;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = .7;
  ctx.fillRect(x - 20, y - 7, 40, 14);
  ctx.fillRect(x - 7, y - 20, 14, 40);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(x - 16, y - 2, 7, 4);
  ctx.fillRect(x + 9, y - 2, 7, 4);
  ctx.globalAlpha = 1;
}

function drawVerticalKeys(ctx, x, y) {
  for (let i = 0; i < 2; i++) {
    const yPos = y + i * 42;
    drawPixelPanel(ctx, x - 14, yPos - 14, 28, 28, COLORS.frame, true);
    ctx.fillStyle = COLORS.slate;
    if (i === 0) {
      ctx.fillRect(x - 3, yPos - 7, 6, 13);
      ctx.fillRect(x - 7, yPos - 4, 14, 6);
    } else {
      ctx.fillRect(x - 3, yPos - 6, 6, 13);
      ctx.fillRect(x - 7, yPos + 1, 14, 6);
    }
  }
}

function drawControlOrb(ctx, x, y, time, doctrine) {
  ctx.fillStyle = "#070910";
  ctx.beginPath();
  ctx.arc(x, y, 43, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.frameDark;
  ctx.lineWidth = 5;
  ctx.stroke();
  const color = DOCTRINES[doctrine].color;
  ctx.strokeStyle = color;
  ctx.globalAlpha = .45;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (.6 + Math.sin(time) * .08));
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#262b3f";
  ctx.beginPath();
  ctx.arc(x, y, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x - 3, y - 3, 6, 6);
}

function drawTacticalDevice(ctx, x, y, time, fraction) {
  ctx.fillStyle = "#080a12";
  ctx.fillRect(x - 23, y - 18, 47, 27);
  ctx.fillRect(x + 10, y - 30, 17, 18);
  ctx.fillStyle = "#34394b";
  ctx.fillRect(x - 19, y - 15, 39, 20);
  ctx.fillRect(x + 12, y - 28, 13, 15);
  ctx.fillStyle = COLORS.frame;
  ctx.fillRect(x - 14, y - 12, 24, 4);
  ctx.fillStyle = fraction > .5 ? COLORS.green : COLORS.red;
  ctx.fillRect(x + 17, y - 26, 4, 4);
  ctx.globalAlpha = .4 + Math.sin(time * 7) * .2;
  ctx.fillStyle = COLORS.amber;
  ctx.fillRect(x + 15, y - 32, 8, 2);
  ctx.globalAlpha = 1;
}

function drawDuelHealth(ctx, x, y, w, fraction, color, reverse) {
  ctx.fillStyle = "#070910";
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = COLORS.frameDark;
  ctx.fillRect(x + 2, y + 2, w - 4, 6);
  const fill = Math.round((w - 4) * clamp(fraction, 0, 1));
  ctx.fillStyle = color;
  ctx.fillRect(reverse ? x + w - 2 - fill : x + 2, y + 2, fill, 6);
  ctx.fillStyle = COLORS.paper;
  ctx.globalAlpha = .25;
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.globalAlpha = 1;
}

function drawDuelSlash(ctx, time, phase) {
  if (phase !== "active") return;
  const swing = (time * 2.1) % 1;
  if (swing > .55) return;
  const x = 108 + Math.sin(time * 7) * 18;
  const y = 247 + Math.cos(time * 5) * 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.7 + swing * 1.4);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = swing < .2 ? COLORS.paper : COLORS.amber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-31, 0);
  ctx.lineTo(31, 0);
  ctx.stroke();
  ctx.globalAlpha = .2;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function drawDuelSparks(ctx, sparks) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const spark of sparks) {
    ctx.globalAlpha = clamp(spark.life / spark.maxLife, 0, 1);
    ctx.fillStyle = spark.color;
    ctx.fillRect(Math.round(spark.x), Math.round(spark.y), spark.size, spark.size);
  }
  ctx.restore();
}

function drawDuelButton(ctx, x, y, w, h, label, color) {
  ctx.fillStyle = "#060810";
  ctx.fillRect(x + 4, y + 5, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ecebe5";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = "#161a28";
  ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  drawKText(ctx, label, x + w / 2, y + 10, { size: 12, color, align: "center", shadow: "#000" });
}
