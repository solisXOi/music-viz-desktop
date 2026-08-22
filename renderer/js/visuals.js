import butterchurnImport from "butterchurn";
import butterchurnPresetsImport from "butterchurn-presets";
import { FieldsEngine, FIELDS_PRESET_KEY } from "./fields.js";
import { filterPresetKeys, getPresetActivity, hidePreset, keysForDrop, keysForMood, loadHiddenPresets } from "./presets.js";

export { FIELDS_PRESET_KEY };

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

const MIN_PRESET_MS = 20000;
const MAX_PRESET_MS = 35000;
const MIN_HOLD_MS = 12000;
const MIN_HOLD_AFTER_DROP_MS = 8000;
const MIN_HOLD_BEFORE_DROP_MS = 800;
const BLEND_CALM_SEC = 5.8;
const BLEND_GROOVE_SEC = 3.4;
const BLEND_PEAK_SEC = 2.2;
const BLEND_SKIP_SEC = 1.1;
const BLEND_DROP_SEC = 0.55;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function stemMotion(motion) {
  if (typeof motion === "number") {
    return { drums: clamp01(motion), bass: 0, hats: 0 };
  }
  return {
    drums: clamp01(motion?.drums || 0),
    bass: clamp01(motion?.bass || 0),
    hats: clamp01(motion?.hats || 0),
  };
}

function preparePreset(raw, motion = 0, activity = 1, { lockZoom = true } = {}) {
  const { drums, bass, hats } = stemMotion(motion);
  const waveA = raw.baseVals?.wave_a ?? 0.8;
  const mvL = raw.baseVals?.mv_l ?? 0.9;
  const mvA = raw.baseVals?.mv_a ?? 0;
  const decay = raw.baseVals?.decay ?? 0.98;
  const warp = raw.baseVals?.warpscale ?? 1;
  const gamma = raw.baseVals?.gammaadj ?? 1;
  const fieldWarp = raw.baseVals?.warp ?? 0;
  const echoA = raw.baseVals?.echo_alpha ?? 0;
  const rot = raw.baseVals?.rot ?? 0;

  return {
    ...raw,
    baseVals: {
      ...raw.baseVals,
      echo_zoom: lockZoom ? 1 : (raw.baseVals?.echo_zoom ?? 1),
      zoom: lockZoom ? 1 : (raw.baseVals?.zoom ?? 1),
      zoomexp: lockZoom ? 1 : (raw.baseVals?.zoomexp ?? 1),
      echo_alpha: Math.min(0.6, echoA * activity + drums * 0.18),
      gammaadj: 1 + (gamma - 1) * activity + hats * 0.12,
      warp: fieldWarp * activity * (0.85 + bass * 0.7),
      rot: rot + drums * 0.035,
      wave_a: Math.min(1.6, (waveA * 0.7 + hats * 0.55) * activity),
      mv_a: Math.min(1, mvA + drums * 0.45),
      mv_l: Math.min(1.7, (mvL * 0.78 + drums * 0.7) * activity),
      decay: Math.max(0.88, decay + 0.01 * (1 - bass) - bass * 0.07 * activity),
      warpscale: warp * (0.82 + bass * 0.55) * activity,
    },
  };
}

function randomDuration() {
  return MIN_PRESET_MS + Math.random() * (MAX_PRESET_MS - MIN_PRESET_MS);
}

function blendForMood(mood) {
  if (mood === "calm") return BLEND_CALM_SEC;
  if (mood === "peak") return BLEND_PEAK_SEC;
  return BLEND_GROOVE_SEC;
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
  constructor(canvas, fieldsCanvas) {
    this.canvas = canvas;
    this.fieldsCanvas = fieldsCanvas;
    this.visualizer = null;
    this.fields = null;
    this.fieldsReady = false;
    this.mode = "butterchurn";
    this.presetMap = null;
    this.presetKeys = [];
    this.currentPresetKey = null;
    this.presetElapsed = 0;
    this.presetDuration = randomDuration();
    this.punchCooldown = 0;
    this.punchHoldMs = 0;
    this.blendUntil = 0;
    this.sceneMood = "groove";
    this.lastMood = "groove";
    this.minHoldMs = MIN_HOLD_MS;
    this.audioContext = null;
    this.audioNode = null;
    this.onPresetChange = null;
    this.pendingRotate = false;
    this.pendingRotateSince = 0;
    this.pendingBlend = BLEND_GROOVE_SEC;
    this.pendingMood = "groove";
    this.lastLock = 0;
    this.lastBeatPhase = 0;
    this.lastBarPhase = 0;
    this.recentKeys = [];
  }

  isFields() {
    return this.mode === "fields";
  }

  init(audioContext, audioNode) {
    this.audioContext = audioContext;
    this.audioNode = audioNode;

    const { width, height, dpr } = displaySize();
    syncCanvas(this.canvas, width, height);

    this.presetMap = butterchurnPresets.getPresets();
    if (filterPresetKeys(Object.keys(this.presetMap || {})).length === 0) {
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

    this.fieldsReady = false;
    if (this.fieldsCanvas) {
      try {
        this.fields = this.fields || new FieldsEngine(this.fieldsCanvas);
        this.fields.init();
        this.fieldsReady = true;
      } catch {
        this.fieldsReady = false;
        this.fields?.setVisible(false);
      }
    }
    this.refreshPresetKeys();

    const keepKey = this.currentPresetKey;
    const keepElapsed = this.presetElapsed;
    const keepDuration = this.presetDuration;
    const restoring = Boolean(keepKey);

    if (keepKey === FIELDS_PRESET_KEY && this.fieldsReady) {
      this.loadFields();
    } else if (keepKey && keepKey !== FIELDS_PRESET_KEY && this.presetMap[keepKey]) {
      this.loadButterchurnPreset(keepKey, 0, this.sceneMood);
    } else if (this.fieldsReady && !loadHiddenPresets().has(FIELDS_PRESET_KEY)) {
      this.loadFields();
    } else {
      this.loadRandomPreset(0);
    }

    if (restoring) {
      this.presetElapsed = keepElapsed;
      this.presetDuration = keepDuration;
    }
  }

  refreshPresetKeys() {
    this.presetKeys = filterPresetKeys(Object.keys(this.presetMap || {}));
    if (this.fieldsReady && !loadHiddenPresets().has(FIELDS_PRESET_KEY)) {
      this.presetKeys.push(FIELDS_PRESET_KEY);
    }
  }

  rememberKey(key) {
    if (!key) return;
    this.recentKeys.push(key);
    if (this.recentKeys.length > 6) this.recentKeys.shift();
  }

  pickFrom(pool) {
    if (!pool.length) return null;
    const avoid = new Set(this.recentKeys);
    let fresh = pool.filter((key) => !avoid.has(key));
    if (fresh.length === 0) fresh = pool.filter((key) => key !== this.currentPresetKey);
    if (fresh.length === 0) fresh = pool;
    return fresh[Math.floor(Math.random() * fresh.length)];
  }

  pickNextPresetKey(mood = "groove", { allowFields = true } = {}) {
    let pool = keysForMood(this.presetKeys, mood);
    if (!allowFields) pool = pool.filter((key) => key !== FIELDS_PRESET_KEY);
    return this.pickFrom(pool);
  }

  isBlending() {
    return Date.now() < this.blendUntil;
  }

  loadFields() {
    if (!this.fieldsReady || !this.fields) return;
    this.pendingRotate = false;
    this.mode = "fields";
    this.currentPresetKey = FIELDS_PRESET_KEY;
    this.sceneMood = this.lastMood;
    this.punchHoldMs = 0;
    this.blendUntil = 0;
    this.minHoldMs = MIN_HOLD_MS;
    this.presetElapsed = 0;
    this.presetDuration = randomDuration();
    this.fields.setVisible(true);
    this.rememberKey(FIELDS_PRESET_KEY);
    this.onPresetChange?.(FIELDS_PRESET_KEY);
  }

  loadButterchurnPreset(key, blendTime, mood, motion = 0, { lockZoom = true } = {}) {
    if (!this.visualizer || !this.presetMap?.[key]) return;
    this.pendingRotate = false;
    this.mode = "butterchurn";
    this.fields?.setVisible(false);
    this.currentPresetKey = key;
    this.sceneMood = mood;
    this.punchHoldMs = 0;
    this.blendUntil = Date.now() + Math.max(0, blendTime) * 1000;
    this.minHoldMs = blendTime === 0 ? MIN_HOLD_AFTER_DROP_MS : MIN_HOLD_MS;
    this.visualizer.loadPreset(
      preparePreset(this.presetMap[key], motion, getPresetActivity(key), { lockZoom }),
      blendTime
    );
    this.presetElapsed = 0;
    this.presetDuration = randomDuration();
    this.rememberKey(key);
    this.onPresetChange?.(key);
  }

  loadRandomPreset(blendTime = BLEND_GROOVE_SEC, mood = this.lastMood) {
    this.pendingRotate = false;
    if (!this.visualizer || !this.presetMap) return;
    const leavingFields = this.isFields();
    const key = this.pickNextPresetKey(mood, { allowFields: !leavingFields });
    if (!key) return;
    if (key === FIELDS_PRESET_KEY) {
      this.loadFields();
      return;
    }
    this.loadButterchurnPreset(key, blendTime, mood);
  }

  queueRotate(blendTime, mood) {
    if (this.lastLock > 0.42 && !this.pendingRotate) {
      this.pendingRotate = true;
      this.pendingRotateSince = 0;
      this.pendingBlend = blendTime;
      this.pendingMood = mood;
      return;
    }
    this.loadRandomPreset(blendTime, mood);
  }

  flushPendingRotate() {
    if (!this.pendingRotate) return false;
    const onBeat = this.lastBeatPhase < 0.14 || this.lastBarPhase < 0.1;
    if (onBeat || this.pendingRotateSince > 2200) {
      this.loadRandomPreset(this.pendingBlend, this.pendingMood);
      return true;
    }
    return false;
  }

  skipPreset() {
    this.loadRandomPreset(BLEND_SKIP_SEC, this.lastMood);
  }

  loadDropPreset() {
    this.pendingRotate = false;
    const key = this.pickFrom(keysForDrop(this.presetKeys));
    if (!key) return;
    this.loadButterchurnPreset(key, BLEND_DROP_SEC, "peak", 0, { lockZoom: false });
    this.minHoldMs = MIN_HOLD_AFTER_DROP_MS;
  }

  showFields() {
    if (!this.fieldsReady || this.isFields()) return;
    this.loadFields();
  }

  hideCurrentPreset() {
    if (!this.currentPresetKey) return;
    hidePreset(this.currentPresetKey);
    this.refreshPresetKeys();
    this.loadRandomPreset(BLEND_SKIP_SEC, this.lastMood);
  }

  accentPunch(dynamics) {
    if (!this.isFields()) return;
    if (this.punchCooldown > 0) return;
    const drums = dynamics?.drums || dynamics?.kickOnset || 0;
    if (drums < 0.58) return;
    this.fields?.accentPunch(drums);
    this.punchCooldown = 420;
  }

  resize() {
    if (!this.audioContext) return;

    const { width, height, dpr } = displaySize();
    const canvasResized = syncCanvas(this.canvas, width, height);
    this.fields?.resize();

    if (canvasResized) {
      this.init(this.audioContext, this.audioNode);
      return;
    }

    this.visualizer?.setRendererSize(width, height, rendererOptions(width, height, dpr));
  }

  update(dt, dynamics) {
    if (!this.visualizer && !this.fieldsReady) return;

    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.lastMood = dynamics?.mood || this.lastMood;
    this.lastLock = dynamics?.lock || 0;
    this.lastBeatPhase = dynamics?.beatPhase || 0;
    this.lastBarPhase = dynamics?.barPhase || 0;
    if (this.pendingRotate) this.pendingRotateSince += dt;

    if (this.isFields()) {
      this.fields?.update(dt, dynamics);
    }

    if (dynamics?.isDrop && this.presetElapsed >= MIN_HOLD_BEFORE_DROP_MS) {
      this.loadDropPreset();
      return;
    }

    if (this.flushPendingRotate()) return;

    if (!this.isBlending() && dynamics?.isHeavyPunch) {
      this.accentPunch(dynamics);
    }

    const musicMood = dynamics?.mood || "groove";
    const crossedCalm =
      (this.sceneMood === "calm") !== (musicMood === "calm") &&
      this.presetElapsed >= this.minHoldMs;

    this.presetElapsed += dt;
    if (this.isFields()) {
      this.sceneMood = musicMood;
      if (this.presetElapsed >= this.presetDuration) {
        this.queueRotate(blendForMood(musicMood), musicMood);
      }
      return;
    }

    if (crossedCalm) {
      this.queueRotate(blendForMood(musicMood), musicMood);
      return;
    }

    if (this.presetElapsed >= this.presetDuration && !this.isBlending()) {
      this.queueRotate(blendForMood(musicMood), musicMood);
    }
  }

  draw() {
    if (this.isFields()) {
      this.fields?.draw();
      return;
    }
    this.visualizer?.render();
  }

  destroy() {
    this.fields?.destroy();
    this.fields = null;
    this.fieldsReady = false;
    this.mode = "butterchurn";
    this.visualizer = null;
    this.presetMap = null;
    this.presetKeys = [];
    this.currentPresetKey = null;
    this.presetElapsed = 0;
    this.audioContext = null;
    this.audioNode = null;
  }
}
