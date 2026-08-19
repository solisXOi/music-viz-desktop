const FFT_SIZE = 2048;
const SMOOTHING = 0.75;

const BASELINE_GAIN = 0.18;
const BASS_PEAK_GAIN = 5.6;
const ATTACK_SEC = 0.008;
const RELEASE_SEC = 0.09;

function meanRange(data, start, end) {
  const from = Math.max(0, start);
  const to = Math.max(from + 1, Math.min(data.length, end));
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i];
  return sum / ((to - from) * 255);
}

function peakinessRange(data, start, end) {
  const from = Math.max(0, start);
  const to = Math.max(from + 1, Math.min(data.length, end));
  let sum = 0;
  let peak = 0;
  for (let i = from; i < to; i++) {
    const v = data[i];
    sum += v;
    if (v > peak) peak = v;
  }
  const mean = sum / (to - from);
  if (mean < 10) return 0;
  return Math.min(1, (peak / mean - 1) / 3.8);
}

export class AudioCapture {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.inputGain = null;
    this.mute = null;
    this.stream = null;
    this.frequencyData = null;

    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothTreble = 0;
    this.smoothChord = 0;
    this.smoothSaw = 0;
    this.currentGain = BASELINE_GAIN;
    this.punchLevel = 0;
  }

  getVisualizerNode() {
    return this.inputGain ?? this.source;
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
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;

    this.inputGain = this.context.createGain();
    this.inputGain.gain.value = BASELINE_GAIN;

    this.mute = this.context.createGain();
    this.mute.gain.value = 0;

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.analyser.connect(this.mute);
    this.mute.connect(this.context.destination);

    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothTreble = 0;
    this.smoothChord = 0;
    this.smoothSaw = 0;
    this.currentGain = BASELINE_GAIN;
    this.punchLevel = 0;

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    for (const track of this.stream.getVideoTracks()) {
      track.stop();
    }

    return this.stream;
  }

  hzToBin(hz) {
    const sampleRate = this.context?.sampleRate || 44100;
    const nyquist = sampleRate / 2;
    const len = this.frequencyData.length;
    return Math.max(0, Math.min(len, Math.round((hz / nyquist) * len)));
  }

  readBands() {
    if (!this.analyser || !this.frequencyData) {
      return { bass: 0, mid: 0, treble: 0, chord: 0, saw: 0, peakiness: 0, overall: 0 };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);

    const data = this.frequencyData;
    const len = data.length;
    const bassEnd = Math.max(2, this.hzToBin(180));
    const chordEnd = Math.max(bassEnd + 2, this.hzToBin(1400));
    const sawStart = this.hzToBin(700);
    const sawEnd = Math.max(chordEnd + 2, this.hzToBin(5500));

    const bass = meanRange(data, 1, bassEnd);
    const chord = meanRange(data, bassEnd, chordEnd);
    const saw = meanRange(data, sawStart, sawEnd);
    const mid = meanRange(data, bassEnd, sawEnd);
    const treble = meanRange(data, sawEnd, len);
    const peakiness = peakinessRange(data, bassEnd, chordEnd);
    const overall = bass * 0.45 + chord * 0.3 + treble * 0.25;

    return { bass, mid, treble, chord, saw, peakiness, overall };
  }

  updateDynamics() {
    const bands = this.readBands();

    this.smoothBass = this.smoothBass * 0.91 + bands.bass * 0.09;
    this.smoothMid = this.smoothMid * 0.93 + bands.mid * 0.07;
    this.smoothTreble = this.smoothTreble * 0.93 + bands.treble * 0.07;
    this.smoothChord = this.smoothChord * 0.94 + bands.chord * 0.06;
    this.smoothSaw = this.smoothSaw * 0.93 + bands.saw * 0.07;

    const bassTransient = Math.max(0, bands.bass - this.smoothBass * 1.22);
    const bassHit = Math.pow(Math.min(1, bassTransient * 5.6), 0.7);

    const sawEnergy = bands.saw * 0.72 + bands.treble * 0.28;
    const sawBaseline = this.smoothSaw * 0.7 + this.smoothTreble * 0.3;
    const sawTransient = Math.max(0, sawEnergy - sawBaseline * 1.16);
    const sawHit = Math.pow(Math.min(1, sawTransient * 4.8), 0.76);

    const chordLift = Math.max(0, bands.chord - this.smoothChord * 1.1);
    const chordHit = Math.pow(
      Math.min(1, chordLift * 4.4 * (0.5 + bands.peakiness * 0.95)),
      0.78
    );
    const chordGlow = Math.pow(
      Math.min(1, Math.max(0, bands.chord - 0.2) * (0.35 + bands.peakiness * 0.8)),
      1.15
    ) * 0.28;

    const punch = Math.min(1, Math.max(bassHit, sawHit * 0.95, chordHit * 0.92));
    this.punchLevel = punch;

    const targetGain =
      BASELINE_GAIN + punch * (BASS_PEAK_GAIN - BASELINE_GAIN) + chordGlow * 0.9;
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
      isPunch: punch > 0.34,
      isHeavyPunch: punch > 0.55,
    };
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.inputGain) {
      this.inputGain.disconnect();
      this.inputGain = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.mute) {
      this.mute.disconnect();
      this.mute = null;
    }

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

    this.frequencyData = null;
    this.punchLevel = 0;
  }
}
