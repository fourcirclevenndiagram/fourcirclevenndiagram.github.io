import { Simulation } from "./simulation.js";
import { Renderer } from "./renderer.js";
import { AudioEngine } from "./audio.js";
import { InputController } from "./input.js";

const canvas = document.querySelector("#game");
const shell = document.querySelector("#gameShell");
const boot = document.querySelector("#boot");
const gameStatus = document.querySelector("#gameStatus");
const audio = new AudioEngine();
const stats = loadStats();
const seed = makeSeed();

const simulation = new Simulation(seed, {
  event(type, payload) {
    audio.play(type);
    if (["capture", "hurt", "boss", "win", "lose"].includes(type)) haptic(type);
  },
  result(result) {
    stats.runs++;
    if (result.win) stats.wins++;
    else stats.losses++;
    stats.bestScore = Math.max(stats.bestScore, result.score);
    stats.highestLevel = Math.max(stats.highestLevel, result.level);
    saveStats(stats);
  }
});
simulation.wins = stats.wins;
simulation.losses = stats.losses;

let renderer;
try {
  renderer = new Renderer(canvas);
} catch (error) {
  console.error(error);
  document.body.dataset.renderError = "true";
  throw error;
}

const meta = {
  muted: audio.muted,
  soundReady: audio.unlocked,
  bestScore: stats.bestScore
};

const refreshMeta = () => {
  meta.muted = audio.muted;
  meta.soundReady = audio.unlocked;
  meta.bestScore = stats.bestScore;
  boot.classList.add("hidden");
};

new InputController(canvas, shell, simulation, audio, refreshMeta);

setTimeout(() => boot.classList.add("hidden"), 1750);

let previous = performance.now();
let accumulator = 0;
let lastStatusUpdate = 0;
const fixedStep = 1 / 60;

function frame(now) {
  if (simulation.paused !== document.hidden) simulation.setPaused(document.hidden);
  const elapsed = Math.min(.1, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (!simulation.paused) accumulator += elapsed * simulation.speed;
  let steps = 0;
  while (accumulator >= fixedStep && steps < 14) {
    simulation.update(fixedStep);
    accumulator -= fixedStep;
    steps++;
  }
  if (steps === 14) accumulator = 0;
  renderer.render(simulation, meta);
  if (now - lastStatusUpdate > 500) {
    lastStatusUpdate = now;
    gameStatus.value = `Sector ${simulation.level}. ${simulation.phase}. ${Math.ceil(simulation.timeLeft)} seconds. Core ${Math.ceil(simulation.coreHp)}. Charge ${Math.floor(simulation.coreCharge)} percent. ${simulation.units.length} units and ${simulation.enemies.length} enemies. Doctrine ${simulation.doctrine}.`;
    gameStatus.dataset.phase = simulation.phase;
    gameStatus.dataset.time = simulation.time.toFixed(2);
    gameStatus.dataset.charge = simulation.coreCharge.toFixed(2);
    gameStatus.dataset.enemies = String(simulation.enemies.length);
    gameStatus.dataset.doctrine = simulation.doctrine;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  simulation.setPaused(document.hidden);
  previous = performance.now();
  accumulator = 0;
  if (!document.hidden && audio.ctx?.state === "suspended" && audio.unlocked) audio.ctx.resume().catch(() => {});
});

window.addEventListener("pagehide", () => saveStats(stats));
window.addEventListener("contextmenu", event => event.preventDefault());

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

function haptic(type) {
  if (!navigator.vibrate) return;
  const pattern = type === "win" ? [35, 35, 55]
    : type === "lose" || type === "boss" ? [55, 25, 55]
    : type === "hurt" ? 20 : 12;
  navigator.vibrate(pattern);
}

function makeSeed() {
  const date = new Date();
  const dayCode = Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`);
  return (dayCode ^ ((Date.now() / 1000) | 0) ^ (Math.random() * 0xffffffff)) >>> 0;
}

function loadStats() {
  try {
    return { bestScore: 0, highestLevel: 1, wins: 0, losses: 0, runs: 0, ...JSON.parse(localStorage.getItem("iron-shrine-stats") || "{}") };
  } catch {
    return { bestScore: 0, highestLevel: 1, wins: 0, losses: 0, runs: 0 };
  }
}

function saveStats(value) {
  try { localStorage.setItem("iron-shrine-stats", JSON.stringify(value)); } catch {}
}
