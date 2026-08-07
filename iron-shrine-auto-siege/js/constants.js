export const W = 216;
export const H = 468;
export const ARENA = Object.freeze({ left: 7, right: 209, top: 42, bottom: 381 });

export const COLORS = Object.freeze({
  void: "#0a0c15",
  ink: "#10131f",
  floorA: "#171d2b",
  floorB: "#1b2231",
  grid: "#252d3f",
  frame: "#535d78",
  frameDark: "#292f43",
  paper: "#eeece5",
  slate: "#8390ad",
  green: "#72df6d",
  greenDark: "#2c7e4e",
  amber: "#f2b64e",
  amberDark: "#875128",
  red: "#ff515d",
  redDark: "#7d2939",
  cyan: "#7db7ff",
  cyanDark: "#34548a",
  purple: "#b482ff",
  purpleDark: "#503778"
});

export const DOCTRINES = Object.freeze({
  seek: { id: "seek", label: "ASCEND", color: COLORS.green, icon: "up" },
  bastion: { id: "bastion", label: "BASTION", color: COLORS.amber, icon: "block" },
  reaper: { id: "reaper", label: "REAPER", color: COLORS.red, icon: "heart" }
});

export const UNIT_SPECS = Object.freeze({
  runner:   { hp: 34, speed: 18, damage: 5, range: 10, rate: 0.62, cost: 10, color: COLORS.green },
  sentinel: { hp: 82, speed: 10, damage: 9, range: 11, rate: 0.88, cost: 18, color: COLORS.amber },
  lancer:   { hp: 46, speed: 13, damage: 8, range: 45, rate: 0.72, cost: 16, color: COLORS.cyan },
  medic:    { hp: 39, speed: 12, damage: 3, range: 38, rate: 1.1, cost: 20, color: COLORS.paper }
});

export const ENEMY_SPECS = Object.freeze({
  gnawer:  { hp: 21, speed: 13, damage: 7, range: 8, rate: 0.8, score: 20, color: "#a86b86" },
  wisp:    { hp: 13, speed: 20, damage: 4, range: 9, rate: 0.55, score: 24, color: "#9b82d8" },
  spitter: { hp: 28, speed: 8, damage: 6, range: 47, rate: 1.15, score: 32, color: "#d56d73" },
  rammer:  { hp: 55, speed: 11, damage: 13, range: 9, rate: 1.1, score: 45, color: "#bd7856" },
  leech:   { hp: 32, speed: 12, damage: 5, range: 9, rate: 0.7, score: 38, color: "#8b5daa" },
  brute:   { hp: 115, speed: 6, damage: 17, range: 12, rate: 1.4, score: 90, color: "#a94b55" },
  herald:  { hp: 490, speed: 5, damage: 20, range: 15, rate: 1.25, score: 700, color: "#e44d63" }
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
