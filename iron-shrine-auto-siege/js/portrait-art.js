import { COLORS, DOCTRINES, UNIT_SPECS } from "./constants.js";

export function drawPixelPanel(ctx, x, y, w, h, accent = COLORS.frame, inset = true) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = "#060810aa";
  ctx.fillRect(x + 4, y + 5, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ecebe5";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = inset ? "#151927" : "#2d3449";
  ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  ctx.fillStyle = "#69738c";
  ctx.fillRect(x + 7, y + 7, w - 14, 2);
  ctx.fillStyle = "#070911";
  ctx.fillRect(x + 7, y + h - 9, w - 14, 2);
}

export function drawGridBackdrop(ctx, width, height, time = 0, accent = "#283047") {
  ctx.fillStyle = "#0d101a";
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(width * .5, height * .42, 8, width * .5, height * .42, height * .62);
  gradient.addColorStop(0, "#273047");
  gradient.addColorStop(.45, "#171c2b");
  gradient.addColorStop(1, "#090b13");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.globalAlpha = .36;
  for (let x = 0; x < width; x += 12) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 12) ctx.fillRect(0, y, width, 1);
  ctx.globalAlpha = .18;
  for (let x = -height; x < width + height; x += 54) {
    ctx.fillRect(Math.round(x + (time * 3) % 54), 0, 2, height);
  }
  ctx.globalAlpha = 1;
}

export function drawTechCorners(ctx, x, y, w, h, color = COLORS.paper, size = 7) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, 2);
  ctx.fillRect(x, y, 2, size);
  ctx.fillRect(x + w - size, y, size, 2);
  ctx.fillRect(x + w - 2, y, 2, size);
  ctx.fillRect(x, y + h - 2, size, 2);
  ctx.fillRect(x, y + h - size, 2, size);
  ctx.fillRect(x + w - size, y + h - 2, size, 2);
  ctx.fillRect(x + w - 2, y + h - size, 2, size);
}

export function drawSegmentRing(ctx, x, y, radius, fraction, color, inactive = COLORS.frameDark, segments = 36, size = 4, spin = 0) {
  const activeCount = Math.round(segments * Math.max(0, Math.min(1, fraction)));
  for (let i = 0; i < segments; i++) {
    const angle = -Math.PI / 2 + ((i / segments) + spin) * Math.PI * 2;
    const px = Math.round(x + Math.cos(angle) * radius);
    const py = Math.round(y + Math.sin(angle) * radius);
    ctx.fillStyle = i < activeCount ? color : inactive;
    ctx.fillRect(px - Math.floor(size / 2), py - Math.floor(size / 2), size, size);
  }
}

export function drawCommanderPortrait(ctx, unit, x, y, scale = 3, flip = false, glow = true) {
  const role = unit?.role || "sentinel";
  const color = UNIT_SPECS[role]?.color || COLORS.amber;
  const secondary = role === "runner" ? COLORS.greenDark
    : role === "sentinel" ? COLORS.amberDark
    : role === "lancer" ? COLORS.cyanDark : COLORS.frame;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(flip ? -scale : scale, scale);
  if (glow) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = .22;
    ctx.fillStyle = color;
    ctx.fillRect(-11, -17, 22, 34);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.fillStyle = "#080a12";
  ctx.fillRect(-7, 12, 6, 3);
  ctx.fillRect(2, 12, 6, 3);
  ctx.fillRect(-8, -12, 16, 14);
  ctx.fillRect(-6, 2, 12, 12);
  ctx.fillRect(-10, -1, 4, 12);
  ctx.fillRect(6, -1, 4, 12);

  ctx.fillStyle = color;
  ctx.fillRect(-6, -11, 12, 4);
  ctx.fillRect(-7, -7, 14, 5);
  ctx.fillStyle = "#30384f";
  ctx.fillRect(-5, -7, 10, 6);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(2, -6, 2, 2);
  ctx.fillStyle = "#1a1f30";
  ctx.fillRect(3, -5, 1, 1);

  ctx.fillStyle = secondary;
  ctx.fillRect(-5, 1, 10, 10);
  ctx.fillStyle = "#4b566f";
  ctx.fillRect(-3, 2, 6, 7);
  ctx.fillStyle = color;
  ctx.fillRect(-2, 3, 4, 4);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(-1, 4, 2, 2);

  ctx.fillStyle = secondary;
  ctx.fillRect(-9, 0, 3, 9);
  ctx.fillRect(6, 0, 3, 9);
  ctx.fillStyle = color;
  ctx.fillRect(-10, 2, 2, 5);
  ctx.fillRect(8, 2, 2, 5);
  ctx.fillStyle = "#3c455d";
  ctx.fillRect(-5, 10, 4, 5);
  ctx.fillRect(2, 10, 4, 5);

  if (role === "sentinel") {
    ctx.fillStyle = "#080a12";
    ctx.fillRect(-13, -1, 5, 13);
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(-12, 0, 3, 10);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-11, 2, 1, 4);
  } else if (role === "lancer") {
    ctx.fillStyle = "#080a12";
    ctx.fillRect(8, 0, 11, 5);
    ctx.fillStyle = COLORS.cyanDark;
    ctx.fillRect(9, 1, 8, 3);
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(16, 2, 5, 1);
  } else if (role === "medic") {
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-1, 2, 2, 6);
    ctx.fillRect(-3, 4, 6, 2);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-8, -10, 4, 3);
  } else {
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-8, -14, 16, 3);
    ctx.fillRect(-10, -11, 4, 4);
  }
  ctx.restore();
}

export function drawHeraldPortrait(ctx, x, y, scale = 3, flip = false, pulse = 0) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(flip ? -scale : scale, scale);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = .18 + Math.sin(pulse * 5) * .05;
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(-13, -18, 26, 36);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#070910";
  ctx.fillRect(-10, -13, 20, 25);
  ctx.fillRect(-15, -12, 6, 7);
  ctx.fillRect(9, -12, 6, 7);
  ctx.fillRect(-8, 11, 6, 5);
  ctx.fillRect(2, 11, 6, 5);
  ctx.fillStyle = "#bd4256";
  ctx.fillRect(-9, -12, 18, 4);
  ctx.fillRect(-13, -10, 4, 4);
  ctx.fillRect(9, -10, 4, 4);
  ctx.fillRect(-8, -7, 16, 16);
  ctx.fillStyle = "#2a283a";
  ctx.fillRect(-6, -6, 12, 11);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(-5, -3, 4, 2);
  ctx.fillRect(2, -3, 4, 2);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(-1, 1, 2, 2);
  ctx.fillStyle = COLORS.redDark;
  ctx.fillRect(-7, 9, 5, 6);
  ctx.fillRect(2, 9, 5, 6);
  ctx.restore();
}

export function drawDoctrineGlyph(ctx, id, x, y, scale = 1, active = true) {
  const doctrine = DOCTRINES[id];
  const color = active ? doctrine.color : COLORS.slate;
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  if (id === "seek") {
    ctx.fillRect(x - 3 * scale, y - 7 * scale, 6 * scale, 15 * scale);
    ctx.fillRect(x - 7 * scale, y - 3 * scale, 14 * scale, 6 * scale);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x - scale, y - 4 * scale, 2 * scale, 9 * scale);
  } else if (id === "bastion") {
    ctx.fillRect(x - 8 * scale, y - 7 * scale, 16 * scale, 15 * scale);
    ctx.fillStyle = COLORS.amberDark;
    ctx.fillRect(x - 5 * scale, y - 4 * scale, 10 * scale, 9 * scale);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x - 4 * scale, y - 4 * scale, 8 * scale, 2 * scale);
  } else {
    ctx.fillRect(x - 8 * scale, y - 5 * scale, 16 * scale, 7 * scale);
    ctx.fillRect(x - 6 * scale, y + 2 * scale, 12 * scale, 4 * scale);
    ctx.fillRect(x - 3 * scale, y + 6 * scale, 6 * scale, 3 * scale);
    ctx.fillStyle = "#ff8a84";
    ctx.fillRect(x - 4 * scale, y - 4 * scale, 3 * scale, 3 * scale);
  }
}

export function drawShield(ctx, x, y, scale = 1, color = COLORS.green) {
  ctx.fillStyle = "#080a12";
  ctx.fillRect(x - 10 * scale, y - 12 * scale, 20 * scale, 19 * scale);
  ctx.fillRect(x - 7 * scale, y + 7 * scale, 14 * scale, 4 * scale);
  ctx.fillStyle = color;
  ctx.fillRect(x - 8 * scale, y - 10 * scale, 16 * scale, 15 * scale);
  ctx.fillRect(x - 5 * scale, y + 5 * scale, 10 * scale, 4 * scale);
  ctx.fillStyle = "#315346";
  ctx.fillRect(x - 4 * scale, y - 6 * scale, 8 * scale, 10 * scale);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(x - scale, y - 5 * scale, 2 * scale, 8 * scale);
}

export function drawReticle(ctx, x, y, radius = 22, color = COLORS.paper, spin = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * .32);
  ctx.arc(0, 0, radius, Math.PI * .5, Math.PI * .82);
  ctx.arc(0, 0, radius, Math.PI, Math.PI * 1.32);
  ctx.arc(0, 0, radius, Math.PI * 1.5, Math.PI * 1.82);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-2, -radius - 7, 4, 12);
  ctx.fillRect(-2, radius - 5, 4, 12);
  ctx.fillRect(-radius - 7, -2, 12, 4);
  ctx.fillRect(radius - 5, -2, 12, 4);
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}
