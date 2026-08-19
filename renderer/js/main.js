import { AudioCapture } from "./audio.js";
import { VisualEngine, isVisualizerSupported } from "./visuals.js";

const canvas = document.getElementById("viz");
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusEl = document.getElementById("status");
const levelMeter = document.getElementById("level-meter");
const fullscreenBtn = document.getElementById("fullscreen-btn");

const desktop = window.desktop;
const audio = new AudioCapture();
const engine = new VisualEngine(canvas);

let running = false;
let rafId = null;
let lastTime = 0;
let isFullscreen = false;

if (!isVisualizerSupported()) {
  setStatus("WebGL 2 is required.");
  startBtn.disabled = true;
}

function updateFullscreenButton() {
  const show = running && !isFullscreen;
  fullscreenBtn.classList.toggle("hidden", !show);
}

async function enterFullscreen() {
  if (desktop?.toggleFullscreen) {
    isFullscreen = await desktop.toggleFullscreen();
    updateFullscreenButton();
    if (running) engine.resize();
  }
}

async function exitFullscreen() {
  if (desktop?.exitFullscreen) {
    await desktop.exitFullscreen();
    isFullscreen = false;
    updateFullscreenButton();
    if (running) engine.resize();
  }
}

function setStatus(message, ok = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
}

function loop(timestamp) {
  if (!running) return;

  const dt = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  const dynamics = audio.updateDynamics();
  engine.update(dt, dynamics);
  engine.draw();

  const meterLevel = Math.max(dynamics.overall, dynamics.punch * 0.85);
  levelMeter.style.setProperty("--level", `${Math.round(meterLevel * 100)}%`);

  rafId = requestAnimationFrame(loop);
}

async function start() {
  startBtn.disabled = true;
  setStatus("Connecting to system audio…");

  try {
    await audio.start();
    engine.init(audio.context, audio.getVisualizerNode());
  } catch (err) {
    startBtn.disabled = false;
    engine.destroy();
    setStatus(err.message || "Could not capture audio.");
    return;
  }

  running = true;
  lastTime = 0;
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  updateFullscreenButton();
  setStatus("Listening…", true);

  const tracks = audio.stream?.getAudioTracks?.() ?? [];
  if (tracks[0]) {
    tracks[0].addEventListener("ended", stop);
  }

  rafId = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);

  if (isFullscreen) {
    exitFullscreen();
  }

  audio.stop();
  engine.destroy();
  overlay.classList.remove("hidden");
  hud.classList.add("hidden");
  fullscreenBtn.classList.add("hidden");
  startBtn.disabled = false;
  setStatus("");
  levelMeter.style.setProperty("--level", "0%");
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
fullscreenBtn.addEventListener("click", enterFullscreen);

window.addEventListener("resize", () => {
  if (running) engine.resize();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isFullscreen) {
    exitFullscreen();
  }
});

if (desktop?.onFullscreenChanged) {
  desktop.onFullscreenChanged((value) => {
    isFullscreen = value;
    updateFullscreenButton();
    if (running) engine.resize();
  });

  desktop.isFullscreen().then((value) => {
    isFullscreen = value;
    updateFullscreenButton();
  });
}
