import butterchurnImport from "butterchurn";
import butterchurnPresetsImport from "butterchurn-presets";
import { filterPresetKeys, getPresetActivity, hidePreset } from "./presets.js";

function resolveModule(mod) {
  if (!mod) return mod;
  if (typeof mod.createVisualizer === "function" || typeof mod.getPresets === "function") {
    return mod;
  }
  if (mod.default) return resolveModule(mod.default);
  return mod;
}

const butterchurn = resolveModule(butterchurnImport);
const butterchurnPresets = resolveModule(butterchurnPresetsImport);

const MIN_PRESET_MS = 10000;
const MAX_PRESET_MS = 15000;
const BLEND_SEC = 2.5;

function randomDuration() {
  return MIN_PRESET_MS + Math.random() * (MAX_PRESET_MS - MIN_PRESET_MS);
}

function displaySize() {
  return {
    width: Math.max(1, Math.floor(window.innerWidth)),
    height: Math.max(1, Math.floor(window.innerHeight)),
    dpr: window.devicePixelRatio || 1,
  };
}

function syncCanvas(canvas, width, height) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function rendererOptions(width, height, dpr) {
  return {
    width,
    height,
    pixelRatio: dpr,
    textureRatio: 1,
    meshWidth: 96,
    meshHeight: 72,
    outputFXAA: true,
  };
}

function preparePreset(raw, punch = 0, activity = 1) {
  const waveA = raw.baseVals?.wave_a ?? 0.8;
  const mvL = raw.baseVals?.mv_l ?? 0.9;
  const decay = raw.baseVals?.decay ?? 0.98;
  const warp = raw.baseVals?.warpscale ?? 1;
  const gamma = raw.baseVals?.gammaadj ?? 1;
  const motion = raw.baseVals?.warp ?? 0;
  const echoA = raw.baseVals?.echo_alpha ?? 0;

  return {
    ...raw,
    baseVals: {
      ...raw.baseVals,
      echo_zoom: 1,
      zoom: 1,
      zoomexp: 1,
      echo_alpha: echoA * activity,
      gammaadj: 1 + (gamma - 1) * activity,
      warp: motion * activity,
      wave_a: Math.min(2, (waveA * 0.7 + punch * 0.95) * activity),
      mv_l: Math.min(1.8, (mvL * 0.78 + punch * 0.55) * activity),
      decay: Math.max(0.82, decay + 0.012 * (1 - punch) - punch * 0.11 * activity),
      warpscale: warp * (0.8 + punch * 0.58) * activity,
    },
  };
}

export function isVisualizerSupported() {
  const canvas = document.createElement("canvas");
  let gl = null;
  try {
    gl = canvas.getContext("webgl2");
  } catch {
    gl = null;
  }
  return Boolean(gl) && Boolean(window.AudioContext || window.webkitAudioContext);
}

export class VisualEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.visualizer = null;
    this.presetMap = null;
    this.presetKeys = [];
    this.currentPresetKey = null;
    this.presetElapsed = 0;
    this.presetDuration = randomDuration();
    this.punchCooldown = 0;
    this.punchHoldMs = 0;
    this.audioContext = null;
    this.audioNode = null;
    this.onPresetChange = null;
  }

  init(audioContext, audioNode) {
    this.audioContext = audioContext;
    this.audioNode = audioNode;

    const { width, height, dpr } = displaySize();
    syncCanvas(this.canvas, width, height);

    this.presetMap = butterchurnPresets.getPresets();
    this.refreshPresetKeys();
    if (this.presetKeys.length === 0) {
      throw new Error("No Butterchurn presets found.");
    }

    this.visualizer = butterchurn.createVisualizer(
      audioContext,
      this.canvas,
      rendererOptions(width, height, dpr)
    );
    this.visualizer.setOutputAA(true);

    if (audioNode) {
      this.visualizer.connectAudio(audioNode);
    }

    this.loadRandomPreset(0);
  }

  refreshPresetKeys() {
    this.presetKeys = filterPresetKeys(Object.keys(this.presetMap || {}));
  }

  pickNextPresetKey() {
    if (this.presetKeys.length === 0) return null;
    if (this.presetKeys.length === 1) return this.presetKeys[0];
    let key = this.currentPresetKey;
    while (key === this.currentPresetKey) {
      key = this.presetKeys[Math.floor(Math.random() * this.presetKeys.length)];
    }
    return key;
  }

  loadRandomPreset(blendTime = BLEND_SEC) {
    if (!this.visualizer || !this.presetMap) return;

    const key = this.pickNextPresetKey();
    if (!key) return;

    this.currentPresetKey = key;
    this.punchHoldMs = 0;
    this.visualizer.loadPreset(
      preparePreset(this.presetMap[key], 0, getPresetActivity(key)),
      blendTime
    );
    this.presetElapsed = 0;
    this.presetDuration = randomDuration();
    this.onPresetChange?.(key);
  }

  skipPreset() {
    this.loadRandomPreset(1.1);
  }

  hideCurrentPreset() {
    if (!this.currentPresetKey) return;
    hidePreset(this.currentPresetKey);
    this.refreshPresetKeys();
    this.loadRandomPreset(1);
  }

  restoreBaseline() {
    const raw = this.presetMap?.[this.currentPresetKey];
    if (!raw || !this.visualizer) return;
    const activity = getPresetActivity(this.currentPresetKey);
    this.visualizer.loadPreset(preparePreset(raw, 0, activity), 0.5);
  }

  accentPunch(intensity) {
    if (!this.visualizer || !this.presetMap || this.punchCooldown > 0) return;
    if (intensity < 0.55) return;

    const raw = this.presetMap[this.currentPresetKey];
    if (!raw) return;

    const activity = getPresetActivity(this.currentPresetKey);
    this.visualizer.loadPreset(preparePreset(raw, intensity * activity, activity), 0.16);
    this.punchCooldown = 240;
    this.punchHoldMs = 420;
  }

  resize() {
    if (!this.visualizer || !this.audioContext) return;

    const { width, height, dpr } = displaySize();
    const canvasResized = syncCanvas(this.canvas, width, height);

    if (canvasResized) {
      this.init(this.audioContext, this.audioNode);
      return;
    }

    this.visualizer.setRendererSize(width, height, rendererOptions(width, height, dpr));
  }

  update(dt, dynamics) {
    if (!this.visualizer) return;

    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    if (this.punchHoldMs > 0) {
      this.punchHoldMs = Math.max(0, this.punchHoldMs - dt);
      if (this.punchHoldMs === 0) this.restoreBaseline();
    }

    if (dynamics?.isHeavyPunch) {
      this.accentPunch(dynamics.punch);
    }

    this.presetElapsed += dt;
    if (this.presetElapsed >= this.presetDuration) {
      this.loadRandomPreset();
    }
  }

  draw() {
    this.visualizer?.render();
  }

  destroy() {
    this.visualizer = null;
    this.presetMap = null;
    this.presetKeys = [];
    this.currentPresetKey = null;
    this.presetElapsed = 0;
    this.audioContext = null;
    this.audioNode = null;
  }
}
