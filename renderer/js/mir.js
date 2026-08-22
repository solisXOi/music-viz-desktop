export function hzToBin(hz, sampleRate, binCount) {
  const nyquist = sampleRate / 2;
  return Math.max(0, Math.min(binCount, Math.round((hz / nyquist) * binCount)));
}

export function dbToLin(db) {
  return Math.pow(10, Math.max(-90, db) / 20);
}

export function meanDbLin(spec, k0, k1) {
  const from = Math.max(0, k0);
  const to = Math.max(from + 1, Math.min(spec.length, k1));
  let sum = 0;
  for (let i = from; i < to; i++) sum += dbToLin(spec[i]);
  return Math.min(1, sum / ((to - from) * 0.18));
}

export function peakinessDb(spec, k0, k1) {
  const from = Math.max(0, k0);
  const to = Math.max(from + 1, Math.min(spec.length, k1));
  let sum = 0;
  let peak = -120;
  for (let i = from; i < to; i++) {
    const v = spec[i];
    sum += dbToLin(v);
    if (v > peak) peak = v;
  }
  const mean = sum / (to - from);
  if (mean < 0.008) return 0;
  return Math.min(1, (dbToLin(peak) / mean - 1) / 3.8);
}

export function superFlux(cur, prev, k0, k1) {
  let s = 0;
  const last = cur.length - 1;
  const from = Math.max(1, k0);
  const to = Math.min(last, k1);
  for (let k = from; k < to; k++) {
    const a = Math.max(-90, cur[k]);
    const b = Math.max(-90, Math.max(prev[k - 1], prev[k], prev[k + 1]));
    s += Math.max(0, a - b);
  }
  return s / Math.max(1, to - from);
}

export function highFrequencyContent(spec, k0, k1) {
  let s = 0;
  let w = 0;
  const from = Math.max(1, k0);
  const to = Math.min(spec.length, k1);
  for (let k = from; k < to; k++) {
    const mag = dbToLin(spec[k]);
    s += mag * k;
    w += k;
  }
  return w > 0 ? Math.min(1, (s / w) * 8) : 0;
}

function medianOf(hist, n) {
  const t = Array.from(hist.subarray(0, n));
  t.sort((a, b) => a - b);
  const m = Math.floor(n / 2);
  return n % 2 ? t[m] : 0.5 * (t[m - 1] + t[m]);
}

export class PeakPicker {
  constructor(refractoryMs, k = 1.55, floor = 0.045) {
    this.refractoryMs = refractoryMs;
    this.k = k;
    this.floor = floor;
    this.hist = new Float32Array(51);
    this.n = 0;
    this.w = 0;
    this.cool = 0;
  }

  reset() {
    this.n = 0;
    this.w = 0;
    this.cool = 0;
    this.hist.fill(0);
  }

  push(odf, dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.hist[this.w] = odf;
    this.w = (this.w + 1) % 51;
    this.n = Math.min(51, this.n + 1);
    if (this.n < 8) return 0;
    const med = medianOf(this.hist, this.n);
    const thresh = med * this.k + this.floor;
    if (odf > thresh && this.cool <= 0) {
      this.cool = this.refractoryMs;
      return Math.min(1, (odf - thresh) / (thresh + 0.18));
    }
    return 0;
  }
}

export function chromaFromDb(spec, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  const binHz = sampleRate / fftSize;
  for (let k = 1; k < spec.length; k++) {
    const f = k * binHz;
    if (f < 80 || f > 2000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const lin = dbToLin(spec[k]);
    chroma[pc] += lin * lin;
  }
  let s = 0;
  for (let i = 0; i < 12; i++) s += chroma[i];
  if (s > 1e-12) {
    for (let i = 0; i < 12; i++) chroma[i] /= s;
  }
  return chroma;
}

function templateScore(chroma, intervals) {
  const scores = new Float32Array(12);
  for (let root = 0; root < 12; root++) {
    let s = 0;
    for (const iv of intervals) s += chroma[(root + iv) % 12];
    scores[root] = s;
  }
  return scores;
}

export function matchChord(chroma) {
  const maj = templateScore(chroma, [0, 4, 7]);
  const min = templateScore(chroma, [0, 3, 7]);
  let best = 0;
  let quality = "maj";
  let root = 0;
  for (let i = 0; i < 12; i++) {
    if (maj[i] > best) {
      best = maj[i];
      quality = "maj";
      root = i;
    }
    if (min[i] > best) {
      best = min[i];
      quality = "min";
      root = i;
    }
  }
  let entropy = 0;
  for (let i = 0; i < 12; i++) {
    const p = chroma[i];
    if (p > 1e-8) entropy -= p * Math.log(p);
  }
  entropy /= Math.log(12);
  return { root, quality, score: best, entropy };
}

export function cosine12(a, b) {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na * nb);
  return den > 1e-12 ? d / den : 1;
}

export function lerpChroma(dst, src, a) {
  const b = 1 - a;
  for (let i = 0; i < 12; i++) dst[i] = dst[i] * b + src[i] * a;
}

export class BeatTracker {
  constructor() {
    this.buf = new Float32Array(256);
    this.n = 0;
    this.w = 0;
    this.bpm = 124;
    this.phase = 0;
    this.barPhase = 0;
    this.lock = 0;
    this.frames = 0;
    this.dtEma = 16;
  }

  reset() {
    this.buf.fill(0);
    this.n = 0;
    this.w = 0;
    this.bpm = 124;
    this.phase = 0;
    this.barPhase = 0;
    this.lock = 0;
    this.frames = 0;
    this.dtEma = 16;
  }

  push(odf, dt, onset) {
    this.dtEma = this.dtEma * 0.95 + dt * 0.05;
    this.buf[this.w] = odf;
    this.w = (this.w + 1) % 256;
    this.n = Math.min(256, this.n + 1);
    this.frames += 1;
    if (this.frames % 12 === 0 && this.n > 80) this.induce();

    const hz = this.bpm / 60;
    this.phase += hz * (dt / 1000);
    this.phase -= Math.floor(this.phase);
    this.barPhase += hz * 0.25 * (dt / 1000);
    this.barPhase -= Math.floor(this.barPhase);

    if (onset > 0.4) {
      let err = this.phase;
      if (err > 0.5) err -= 1;
      this.phase = (this.phase - 0.12 * err + 1) % 1;
      this.lock = Math.min(1, this.lock + 0.1);
    } else {
      this.lock *= 0.997;
    }
  }

  induce() {
    let mean = 0;
    for (let i = 0; i < this.n; i++) mean += this.buf[i];
    mean /= this.n;
    if (mean < 0.02) return;

    const fps = 1000 / Math.max(8, this.dtEma);
    const minLag = Math.max(8, Math.round((fps * 60) / 180));
    const maxLag = Math.min(this.n - 2, Math.round((fps * 60) / 70));
    let best = -1;
    let bestLag = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      let c = 0;
      for (let i = 0; i < this.n - lag; i++) {
        const a = this.buf[(this.w - 1 - i + 256) % 256];
        const b = this.buf[(this.w - 1 - i - lag + 256) % 256];
        s += a * b;
        c += 1;
      }
      s /= c;
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    const bpm = 60 / (bestLag / fps);
    if (bpm >= 70 && bpm <= 180) {
      this.bpm = this.bpm * 0.85 + bpm * 0.15;
    }
  }
}
