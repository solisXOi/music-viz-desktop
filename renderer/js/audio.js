import {
  BeatTracker,
  PeakPicker,
  chromaFromDb,
  cosine12,
  highFrequencyContent,
  hzToBin,
  lerpChroma,
  matchChord,
  meanDbLin,
  peakinessDb,
  superFlux,
} from "./mir.js";

const FFT_SIZE = 2048;
const BASELINE_GAIN = 0.18;
const BASS_BODY_GAIN = 1.15;
const HIT_GAIN = 2.4;
const ATTACK_SEC = 0.012;
const RELEASE_SEC = 0.14;

function disconnect(node) {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // already disconnected
  }
}

export class AudioCapture {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.analyserMid = null;
    this.analyserSide = null;
    this.source = null;
    this.inputGain = null;
    this.mute = null;
    this.stream = null;
    this.msNodes = [];
    this.spec = null;
    this.specPrev = null;
    this.specMid = null;
    this.specSide = null;
    this.chromaFast = new Float32Array(12);
    this.chromaSlow = new Float32Array(12);
    this.kickPicker = new PeakPicker(170, 1.95, 0.075);
    this.snarePicker = new PeakPicker(150, 2.05, 0.085);
    this.hatPicker = new PeakPicker(80, 2.15, 0.09);
    this.beats = new BeatTracker();
    this.frame = 0;
    this.resetState();
  }

  resetState() {
    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothTreble = 0;
    this.smoothChord = 0;
    this.smoothSaw = 0;
    this.smoothSub = 0;
    this.smoothHat = 0;
    this.smoothKickBand = 0;
    this.smoothSnare = 0;
    this.currentGain = BASELINE_GAIN;
    this.punchLevel = 0;
    this.energyFast = 0;
    this.energySlow = 0;
    this.bassFast = 0;
    this.bassSlow = 0;
    this.lowShareSlow = 0.25;
    this.energyFloor = 1;
    this.dropArmMs = 0;
    this.dropPendingMs = 0;
    this.analysisMs = 0;
    this.quietMs = 0;
    this.dropCooldownMs = 0;
    this.hitTimes = [];
    this.kickTimes = [];
    this.mood = "groove";
    this.frame = 0;
    this.chromaFast.fill(0);
    this.chromaSlow.fill(0);
    this.kickPicker.reset();
    this.snarePicker.reset();
    this.hatPicker.reset();
    this.beats.reset();
  }

  getVisualizerNode() {
    return this.inputGain ?? this.source;
  }

  makeAnalyser() {
    const analyser = this.context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    return analyser;
  }

  wireMidSide(channelCount) {
    this.msNodes = [];
    if (channelCount < 2) return;

    const splitter = this.context.createChannelSplitter(2);
    this.source.connect(splitter);

    const midL = this.context.createGain();
    const midR = this.context.createGain();
    midL.gain.value = 0.5;
    midR.gain.value = 0.5;
    this.analyserMid = this.makeAnalyser();
    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    midL.connect(this.analyserMid);
    midR.connect(this.analyserMid);

    const sideL = this.context.createGain();
    const sideR = this.context.createGain();
    sideL.gain.value = 0.5;
    sideR.gain.value = -0.5;
    this.analyserSide = this.makeAnalyser();
    splitter.connect(sideL, 0);
    splitter.connect(sideR, 1);
    sideL.connect(this.analyserSide);
    sideR.connect(this.analyserSide);

    this.msNodes = [splitter, midL, midR, sideL, sideR];
    const bins = this.analyserMid.frequencyBinCount;
    this.specMid = new Float32Array(bins);
    this.specSide = new Float32Array(bins);
    this.specMid.fill(-100);
    this.specSide.fill(-100);
  }

  async start() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("System audio capture is not available in this app.");
    }

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stop();
      throw new Error("No system audio detected. Check Windows sound output and try again.");
    }

    this.context = new AudioContext();
    this.analyser = this.makeAnalyser();

    this.inputGain = this.context.createGain();
    this.inputGain.gain.value = BASELINE_GAIN;

    this.mute = this.context.createGain();
    this.mute.gain.value = 0;

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    this.analyser.connect(this.mute);
    this.mute.connect(this.context.destination);

    this.source.connect(this.inputGain);

    const bins = this.analyser.frequencyBinCount;
    this.spec = new Float32Array(bins);
    this.specPrev = new Float32Array(bins);
    this.spec.fill(-100);
    this.specPrev.fill(-100);

    this.wireMidSide(this.source.channelCount || 1);
    this.resetState();

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    for (const track of this.stream.getVideoTracks()) {
      track.stop();
    }

    return this.stream;
  }

  bin(hz) {
    const sampleRate = this.context?.sampleRate || 44100;
    const len = this.spec?.length || 1024;
    return hzToBin(hz, sampleRate, len);
  }

  readSpectrum() {
    if (!this.analyser || !this.spec) {
      return {
        bass: 0,
        sub: 0,
        mid: 0,
        treble: 0,
        chord: 0,
        saw: 0,
        peakiness: 0,
        sawPeak: 0,
        overall: 0,
        kickBand: 0,
        snareBand: 0,
        hat: 0,
        hfc: 0,
        kickFlux: 0,
        snareFlux: 0,
        hatFlux: 0,
        midEnergy: 0,
        sideEnergy: 0,
        stereoWidth: 0,
      };
    }

    this.specPrev.set(this.spec);
    this.analyser.getFloatFrequencyData(this.spec);
    this.frame += 1;

    const spec = this.spec;
    const prev = this.specPrev;
    const len = spec.length;
    const fluxReady = this.frame > 3;

    const subEnd = Math.max(2, this.bin(80));
    const bassEnd = Math.max(subEnd + 1, this.bin(200));
    const kick0 = this.bin(30);
    const kick1 = Math.max(kick0 + 1, this.bin(120));
    const snareLow0 = this.bin(150);
    const snareLow1 = Math.max(snareLow0 + 1, this.bin(400));
    const snareHi0 = this.bin(2000);
    const snareHi1 = Math.max(snareHi0 + 1, this.bin(5000));
    const chordEnd = Math.max(bassEnd + 2, this.bin(1400));
    const sawStart = this.bin(650);
    const sawEnd = Math.max(chordEnd + 2, this.bin(6000));
    const hat0 = this.bin(5000);
    const hat1 = Math.max(hat0 + 1, this.bin(12000));

    const sub = meanDbLin(spec, 1, subEnd);
    const bass = meanDbLin(spec, 1, bassEnd);
    const kickBand = meanDbLin(spec, kick0, kick1);
    const snareBand = 0.55 * meanDbLin(spec, snareLow0, snareLow1) + 0.45 * meanDbLin(spec, snareHi0, snareHi1);
    const chord = meanDbLin(spec, bassEnd, chordEnd);
    const saw = meanDbLin(spec, sawStart, sawEnd);
    const mid = meanDbLin(spec, bassEnd, sawEnd);
    const treble = meanDbLin(spec, sawEnd, len);
    const hat = meanDbLin(spec, hat0, hat1);
    const peakiness = peakinessDb(spec, bassEnd, chordEnd);
    const sawPeak = peakinessDb(spec, sawStart, sawEnd);
    const hfc = highFrequencyContent(spec, hat0, hat1);
    const overall = sub * 0.18 + bass * 0.3 + chord * 0.22 + saw * 0.16 + treble * 0.14;

    const kickFlux = fluxReady ? superFlux(spec, prev, kick0, kick1) : 0;
    const snareFlux = fluxReady
      ? 0.55 * superFlux(spec, prev, snareLow0, snareLow1) + 0.45 * superFlux(spec, prev, snareHi0, snareHi1)
      : 0;
    const hatFlux = fluxReady ? superFlux(spec, prev, hat0, hat1) : 0;

    let midEnergy = 0;
    let sideEnergy = 0;
    let stereoWidth = 0;
    if (this.analyserMid && this.specMid && this.analyserSide && this.specSide) {
      this.analyserMid.getFloatFrequencyData(this.specMid);
      this.analyserSide.getFloatFrequencyData(this.specSide);
      midEnergy = meanDbLin(this.specMid, 1, this.bin(400));
      sideEnergy = meanDbLin(this.specSide, this.bin(2000), hat1);
      const den = midEnergy + 1e-4;
      stereoWidth = sideEnergy / den > 0.05 ? Math.min(1, sideEnergy / den) : 0;
    }

    return {
      bass,
      sub,
      mid,
      treble,
      chord,
      saw,
      peakiness,
      sawPeak,
      overall,
      kickBand,
      snareBand,
      hat,
      hfc,
      kickFlux,
      snareFlux,
      hatFlux,
      midEnergy,
      sideEnergy,
      stereoWidth,
    };
  }

  updateDynamics(dt = 16) {
    const bands = this.readSpectrum();
    const sampleRate = this.context?.sampleRate || 44100;

    this.smoothBass = this.smoothBass * 0.91 + bands.bass * 0.09;
    this.smoothMid = this.smoothMid * 0.93 + bands.mid * 0.07;
    this.smoothTreble = this.smoothTreble * 0.93 + bands.treble * 0.07;
    this.smoothChord = this.smoothChord * 0.94 + bands.chord * 0.06;
    this.smoothSaw = this.smoothSaw * 0.9 + bands.saw * 0.1;
    this.smoothSub = this.smoothSub * 0.9 + (bands.sub || 0) * 0.1;
    this.smoothHat = this.smoothHat * 0.88 + bands.hat * 0.12;
    this.smoothKickBand = this.smoothKickBand * 0.9 + bands.kickBand * 0.1;
    this.smoothSnare = this.smoothSnare * 0.9 + bands.snareBand * 0.1;

    const kickOnset = this.kickPicker.push(bands.kickFlux, dt);
    const snareOnset = this.snarePicker.push(bands.snareFlux, dt);
    const hatOnset = this.hatPicker.push(bands.hatFlux, dt);
    this.beats.push(bands.kickFlux + snareOnset * 0.35, dt, kickOnset);

    let chroma = this.chromaFast;
    let chord = { root: 0, quality: "maj", score: 0, entropy: 1 };
    let chordDelta = 0;
    if (this.spec) {
      chroma = chromaFromDb(this.spec, sampleRate, FFT_SIZE);
      lerpChroma(this.chromaFast, chroma, 0.35);
      lerpChroma(this.chromaSlow, chroma, 0.08);
      chord = matchChord(this.chromaFast);
      chordDelta = Math.max(0, 1 - cosine12(this.chromaFast, this.chromaSlow));
    }

    const bassTransient = Math.max(0, bands.bass - this.smoothBass * 1.18);
    const bassHit = Math.pow(Math.min(1, bassTransient * 5.6), 0.7);
    const kick = Math.max(kickOnset, Math.pow(Math.min(1, bassTransient * 7.2), 0.64) * 0.55);

    const subTransient = Math.max(0, (bands.sub || 0) - this.smoothSub * 1.16);
    const subHit = Math.pow(Math.min(1, subTransient * 7.4), 0.62);

    const sawEnergy = bands.saw * 0.62 + bands.treble * 0.22 + (bands.sawPeak || 0) * 0.28;
    const sawBaseline = this.smoothSaw * 0.68 + this.smoothTreble * 0.32;
    const sawTransient = Math.max(0, sawEnergy - sawBaseline * 1.1);
    const sawHit = Math.pow(Math.min(1, sawTransient * 5.6), 0.72);
    const sawPulse = Math.pow(Math.min(1, sawTransient * 6.8 + (bands.sawPeak || 0) * 0.45), 0.68);

    const chordLift = Math.max(0, bands.chord - this.smoothChord * 1.1);
    const chordHit = Math.pow(
      Math.min(1, chordLift * 4.4 * (0.5 + bands.peakiness * 0.95)),
      0.78
    );
    const chordGlow = Math.pow(
      Math.min(1, Math.max(0, bands.chord - 0.2) * (0.35 + bands.peakiness * 0.8)),
      1.15
    ) * 0.28;

    const beatPhase = this.beats.phase;
    const barPhase = this.beats.barPhase;
    const lock = this.beats.lock;
    const bpm = this.beats.bpm;

    const drums = Math.min(1, Math.max(kickOnset, snareOnset * 0.82, kick * 0.45));
    const bassMotion = Math.min(1, this.smoothSub * 0.7 + this.smoothBass * 0.5 + subHit * 0.35);
    const hats = Math.min(1, hatOnset * 0.85 + this.smoothHat * 0.2);
    const punch = drums;
    this.punchLevel = punch;

    this.dropCooldownMs = Math.max(0, this.dropCooldownMs - dt);
    this.analysisMs += dt;

    const instant = bands.overall;
    this.energyFast = this.energyFast * 0.8 + instant * 0.2;
    this.energySlow = this.energySlow * 0.995 + instant * 0.005;

    const bassNow = (bands.sub || 0) * 0.55 + bands.bass * 0.45;
    this.bassFast = this.bassFast * 0.7 + bassNow * 0.3;
    this.bassSlow = this.bassSlow * 0.992 + bassNow * 0.008;

    const lowShare = bassNow / (instant + 1e-4);
    this.lowShareSlow = this.lowShareSlow * 0.988 + Math.min(1.5, lowShare) * 0.012;

    if (this.energyFast < this.energyFloor) this.energyFloor = this.energyFast;
    else this.energyFloor += (this.energyFast - this.energyFloor) * 0.0035;

    if (this.energyFast < 0.18) this.quietMs += dt;
    else this.quietMs *= 0.92;

    const heldBack =
      this.energyFast < this.energySlow * 0.85 ||
      this.bassFast < this.bassSlow * 0.8 ||
      this.quietMs > 180;
    if (heldBack) this.dropArmMs = Math.min(6000, this.dropArmMs + dt);
    else this.dropArmMs = Math.max(0, this.dropArmMs - dt * 0.4);

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (kickOnset > 0.4) this.kickTimes.push(now);
    this.kickTimes = this.kickTimes.filter((time) => now - time < 800);
    const kickDensity = this.kickTimes.length;

    if (punch > 0.55) this.hitTimes.push(now);
    this.hitTimes = this.hitTimes.filter((time) => now - time < 2000);
    const hitsPerSec = this.hitTimes.length / 2;

    if (this.mood === "calm") {
      if (this.energySlow > 0.28 || hitsPerSec > 1.8) {
        this.mood = hitsPerSec > 2.2 && this.energySlow > 0.36 ? "peak" : "groove";
      }
    } else if (this.mood === "peak") {
      if (this.energySlow < 0.24 && hitsPerSec < 1.4) this.mood = "calm";
      else if (this.energySlow < 0.34 && hitsPerSec < 1.6) this.mood = "groove";
    } else if (this.energySlow < 0.18 && hitsPerSec < 1.1) {
      this.mood = "calm";
    } else if (this.energySlow > 0.4 && hitsPerSec > 2) {
      this.mood = "peak";
    }

    const bassJump = this.bassFast > this.bassSlow * 1.16 + 0.02;
    const hardBass = this.bassFast > this.bassSlow * 1.32 + 0.04;
    const shareJump = lowShare > this.lowShareSlow * 1.18 + 0.04;
    const floorJump = this.energyFast > this.energyFloor * 1.45 + 0.035;
    const slam = bassNow > 0.06 && (kickOnset > 0.18 || subHit > 0.14 || bassJump);
    const dropShape =
      this.analysisMs > 1600 &&
      this.dropCooldownMs <= 0 &&
      slam &&
      (shareJump || hardBass || (bassJump && this.dropArmMs > 180) || (floorJump && bassJump));

    if (dropShape) this.dropPendingMs += dt;
    else this.dropPendingMs = 0;

    const isDrop = this.dropPendingMs >= 45;
    if (isDrop) {
      this.dropCooldownMs = 12000;
      this.dropPendingMs = 0;
      this.dropArmMs = 0;
      this.mood = "peak";
    }

    const isHeavyPunch = kickOnset > 0.62 || snareOnset > 0.74;

    const body = this.smoothSub * 0.55 + this.smoothBass * 0.35;
    const hit = kickOnset * 0.7 + snareOnset * 0.25;
    const targetGain =
      BASELINE_GAIN +
      body * BASS_BODY_GAIN +
      hit * HIT_GAIN +
      chordGlow * 0.35;
    const rising = targetGain > this.currentGain;
    this.currentGain = targetGain;

    if (this.inputGain && this.context) {
      this.inputGain.gain.setTargetAtTime(
        targetGain,
        this.context.currentTime,
        rising ? ATTACK_SEC : RELEASE_SEC
      );
    }

    return {
      ...bands,
      punch,
      drums,
      bassMotion,
      hats,
      isPunch: punch > 0.48,
      isHeavyPunch,
      mood: this.mood,
      isDrop,
      energy: this.energySlow,
      bassHit,
      kick,
      kickOnset,
      snareOnset,
      hatOnset,
      subHit,
      sawHit,
      sawPulse,
      chordHit,
      chordDelta,
      chordRoot: chord.root,
      chordQuality: chord.quality,
      chordEntropy: chord.entropy,
      chroma: this.chromaFast,
      beatPhase,
      barPhase,
      lock,
      bpm,
      kickDensity,
      subRms: this.smoothSub,
    };
  }

  stop() {
    disconnect(this.source);
    disconnect(this.inputGain);
    disconnect(this.analyser);
    disconnect(this.analyserMid);
    disconnect(this.analyserSide);
    disconnect(this.mute);
    for (const node of this.msNodes) disconnect(node);
    this.msNodes = [];

    this.source = null;
    this.inputGain = null;
    this.analyser = null;
    this.analyserMid = null;
    this.analyserSide = null;
    this.mute = null;

    if (this.context) {
      this.context.close();
      this.context = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    this.spec = null;
    this.specPrev = null;
    this.specMid = null;
    this.specSide = null;
    this.resetState();
  }
}
