export const FIELDS_PRESET_KEY = "solis - Into The Oblivion";

/**
 * Oblivion is the first custom scene. Keep this class aligned with
 * custom/registry.js (init, update, draw, resize, destroy, accentPunch, triggerDrop).
 */

const MAX_SITES = 64;
const MAX_AGENTS = 20;
const MAX_INFECT = 6;
const WORM_COUNT = 5;
const WORM_LEN = 28;
const SHARD_COUNT = 24;

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const VORONOI_FRAG = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_punch;
uniform float u_energy;
uniform float u_edge;
uniform float u_fill;
uniform float u_paper;
uniform float u_tilt;
uniform float u_beatPhase;
uniform float u_lock;
uniform float u_kick;
uniform float u_hat;
uniform vec3 u_tint;
uniform int u_count;
uniform int u_infectN;
uniform vec3 u_sites[${MAX_SITES}];
uniform vec4 u_infect[${MAX_INFECT}];

out vec4 fragColor;

float infectFrom(vec2 p, vec2 aspect) {
  float m = 0.0;
  for (int k = 0; k < ${MAX_INFECT}; k++) {
    if (k >= u_infectN) break;
    vec4 s = u_infect[k];
    float d = length((p - s.xy) * aspect);
    float core = 1.0 - smoothstep(s.z * 0.15, s.z * 1.05, d);
    float halo = 1.0 - smoothstep(s.z * 0.55, s.z * 1.9, d);
    m = max(m, max(core, halo * 0.88));
  }
  return clamp(m, 0.0, 1.0);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);

  uv.x = (uv.x - 0.5) * (1.0 + (uv.y - 0.5) * u_tilt) + 0.5;
  uv += 0.0018 * vec2(
    sin(u_time * 0.11 + uv.y * 3.1),
    cos(u_time * 0.09 + uv.x * 2.6)
  ) * (0.35 + u_energy);
  uv += 0.0008 * u_lock * vec2(
    sin(u_beatPhase * 6.2831853),
    cos(u_beatPhase * 6.2831853)
  );

  float d1 = 1e5;
  float d2 = 1e5;
  int i1 = 0;
  vec2 nearest = uv;
  float flash = 0.0;

  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (i >= u_count) break;
    vec3 site = u_sites[i];
    float d = length((uv - site.xy) * aspect);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      i1 = i;
      nearest = site.xy;
      flash = site.z;
    } else if (d < d2) {
      d2 = d;
    }
  }

  float cellInf = infectFrom(nearest, aspect);
  float blobInf = infectFrom(uv, aspect);
  float infected = smoothstep(0.04, 0.96, blobInf * 0.82 + cellInf * 0.28);

  float scheme = mix(u_paper, 1.0 - u_paper, infected);
  float radial = length((uv - vec2(0.5, 0.42)) * aspect);
  float lift = uv.y * 0.07 + (1.0 - radial) * 0.05;
  float dark = 0.06 + lift;
  float light = 0.91 - uv.y * 0.05 - radial * 0.04;
  float paperLum = mix(dark, light, scheme);
  vec3 bg = vec3(paperLum * 0.96, paperLum, paperLum * 1.05);
  bg *= mix(vec3(1.0), u_tint, 0.12 + u_lock * 0.1);
  float inkLum = mix(0.74 + lift * 0.5, 0.22 - uv.y * 0.04, scheme);
  vec3 ink = vec3(inkLum * 0.98, inkLum, inkLum * 1.03);
  ink *= mix(vec3(1.0), u_tint, 0.08);

  float id = fract(sin(float(i1) * 78.233) * 43758.5453);
  float fill = (0.025 + id * 0.06) * u_fill;
  fill = mix(fill, 0.12 + id * 0.16, flash * 0.7);

  float gap = d2 - d1;
  float edge = 1.0 - smoothstep(0.0, u_edge, gap);
  float glow = exp(-gap * 110.0) * (0.05 + u_punch * 0.1 + u_kick * 0.06 + u_hat * 0.04);
  float fog = smoothstep(0.12, 0.92, uv.y);

  vec3 col = mix(bg, ink, fill * 0.4);
  col = mix(col, ink, edge * 0.55 + glow);
  col = mix(col, bg, fog * 0.22);

  float vig = smoothstep(1.28, 0.38, radial);
  col = mix(bg * 0.92, col, 0.82 + vig * 0.18);
  fragColor = vec4(col, 1.0);
}
`;

const OVERLAY_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_la;
out vec2 v_la;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = 2.0;
  v_la = a_la;
}
`;

const OVERLAY_FRAG = `#version 300 es
precision mediump float;
in vec2 v_la;
uniform float u_hat;
uniform vec3 u_tint;
out vec4 fragColor;
void main() {
  float g = v_la.x;
  vec3 col = vec3(g * 0.96, g, g * 1.04) * mix(vec3(1.0), u_tint, 0.18);
  fragColor = vec4(col, v_la.y * (0.88 + u_hat * 0.35));
}
`;

function fract(x) {
  return x - Math.floor(x);
}

function hash2(x, y, seed) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
}

function snoise(t) {
  return Math.sin(t) * 0.47 + Math.sin(t * 1.73 + 1.2) * 0.33 + Math.sin(t * 0.37 + 2.4) * 0.2;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Shader compile failed");
  }
  return shader;
}

function link(gl, vertSrc, fragSrc) {
  const program = gl.createProgram();
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || "Program link failed");
  }
  return program;
}

function displaySize() {
  return {
    width: Math.max(1, Math.floor(window.innerWidth)),
    height: Math.max(1, Math.floor(window.innerHeight)),
    dpr: Math.min(2, window.devicePixelRatio || 1),
  };
}

function ensure(buf, needed) {
  if (buf.length >= needed) return buf;
  const next = new Float32Array(Math.max(needed, buf.length * 2));
  next.set(buf);
  return next;
}

function randomIn(min, max) {
  return min + Math.random() * (max - min);
}

export class FieldsEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.triProgram = null;
    this.overlayProgram = null;
    this.quad = null;
    this.hairBuf = null;
    this.waveBuf = null;
    this.wormBuf = null;
    this.ready = false;
    this.visible = false;

    this.time = 0;
    this.mood = "groove";
    this.layoutSeed = Math.random() * 1000;
    this.treeKey = "";
    this.worldSegs = [];
    this.punchFlash = 0;
    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothTreble = 0;
    this.smoothEnergy = 0;
    this.paper = 0;
    this.flipping = false;
    this.flipHold = 4200;
    this.infects = [];
    this.agents = [];
    this.worms = [];
    this.shards = [];
    this.cam = { yaw: 0, pitch: 0.1, zoom: 1, roll: 0 };
    this.tunnelLen = 3.5;
    this.travelZ = 0;
    this.drive = 0.1;
    this.dropBoost = 0;
    this.kick = 0;
    this.smoothSub = 0;
    this.smoothSaw = 0;
    this.radiusPulse = 1;
    this.hatFlash = 0;
    this.beatPhase = 0;
    this.barPhase = 0;
    this.lock = 0;
    this.bpm = 124;
    this.tint = [1, 1, 1];
    this.siteData = new Float32Array(MAX_SITES * 3);
    this.siteCount = 0;
    this.infectData = new Float32Array(MAX_INFECT * 4);
    this.hairVerts = new Float32Array(16384);
    this.hairCount = 0;
    this.waveVerts = new Float32Array(8192);
    this.waveCount = 0;
    this.wormVerts = new Float32Array(8192);
    this.wormCount = 0;
    this.uTri = {};
    this.uOver = {};
  }

  init() {
    if (this.ready) {
      this.resize();
      return;
    }

    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("Fields visualizer needs WebGL2.");

    this.gl = gl;
    this.triProgram = link(gl, VERT, VORONOI_FRAG);
    this.overlayProgram = link(gl, OVERLAY_VERT, OVERLAY_FRAG);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.hairBuf = gl.createBuffer();
    this.waveBuf = gl.createBuffer();
    this.wormBuf = gl.createBuffer();

    this.uTri = {
      res: gl.getUniformLocation(this.triProgram, "u_res"),
      time: gl.getUniformLocation(this.triProgram, "u_time"),
      punch: gl.getUniformLocation(this.triProgram, "u_punch"),
      energy: gl.getUniformLocation(this.triProgram, "u_energy"),
      edge: gl.getUniformLocation(this.triProgram, "u_edge"),
      fill: gl.getUniformLocation(this.triProgram, "u_fill"),
      paper: gl.getUniformLocation(this.triProgram, "u_paper"),
      tilt: gl.getUniformLocation(this.triProgram, "u_tilt"),
      beatPhase: gl.getUniformLocation(this.triProgram, "u_beatPhase"),
      lock: gl.getUniformLocation(this.triProgram, "u_lock"),
      kick: gl.getUniformLocation(this.triProgram, "u_kick"),
      hat: gl.getUniformLocation(this.triProgram, "u_hat"),
      tint: gl.getUniformLocation(this.triProgram, "u_tint"),
      count: gl.getUniformLocation(this.triProgram, "u_count"),
      infectN: gl.getUniformLocation(this.triProgram, "u_infectN"),
      sites: gl.getUniformLocation(this.triProgram, "u_sites")
        || gl.getUniformLocation(this.triProgram, "u_sites[0]"),
      infect: gl.getUniformLocation(this.triProgram, "u_infect")
        || gl.getUniformLocation(this.triProgram, "u_infect[0]"),
    };
    this.uOver = {
      hat: gl.getUniformLocation(this.overlayProgram, "u_hat"),
      tint: gl.getUniformLocation(this.overlayProgram, "u_tint"),
    };

    this.spawnAgents(true);
    this.spawnWorms(true);
    this.spawnShards(true);
    this.resize();
    this.ready = true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.canvas.classList.toggle("hidden", !visible);
  }

  inkOf(fog = 0) {
    const ink = this.paper > 0.5 ? 0.2 : 0.78;
    const paper = this.paper > 0.5 ? 0.86 : 0.16;
    return ink + (paper - ink) * fog;
  }

  spawnAgents(reset) {
    while (this.agents.length < MAX_AGENTS) {
      this.agents.push({ x: 0.5, y: 0.5, vx: 0, vy: 0, flash: 0 });
    }
    if (!reset) return;
    for (const agent of this.agents) {
      agent.x = randomIn(0.08, 0.92);
      agent.y = randomIn(0.08, 0.92);
      agent.vx = randomIn(-1, 1) * 0.00004;
      agent.vy = randomIn(-1, 1) * 0.00004;
      agent.flash = 0;
    }
  }

  spawnWorms(reset) {
    while (this.worms.length < WORM_COUNT) {
      this.worms.push({
        pts: [], yaw: 0, pitch: 0, speed: 0, zSpeed: 0, width: 0.04, phase: 0,
      });
    }
    if (!reset) return;
    for (const worm of this.worms) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const x = 0.5 + side * randomIn(0.18, 0.38);
      const y = randomIn(0.22, 0.78);
      const z = randomIn(0.45, this.tunnelLen * 0.75);
      worm.yaw = side > 0 ? Math.PI * 0.9 : Math.PI * 0.1;
      worm.pitch = 0;
      worm.speed = randomIn(0.00008, 0.00014);
      worm.zSpeed = -0.00012;
      worm.width = randomIn(0.018, 0.03);
      worm.phase = randomIn(0, 40);
      worm.pts = [];
      for (let i = 0; i < WORM_LEN; i++) {
        worm.pts.push({
          x: x - Math.cos(worm.yaw) * i * 0.01,
          y: y - Math.sin(worm.yaw) * i * 0.008,
          z: (z + i * 0.055) % this.tunnelLen,
        });
      }
    }
  }

  spawnShards(reset) {
    while (this.shards.length < SHARD_COUNT) {
      this.shards.push({
        x: 0.5, y: 0.5, z: 1, vx: 0, vy: 0, vz: 0,
        r: 0.04, n: 3, spin: 0, rot: 0, kind: 0,
      });
    }
    if (!reset) return;
    for (const shard of this.shards) {
      shard.x = randomIn(0.1, 0.9);
      shard.y = Math.random() > 0.5 ? randomIn(0.12, 0.32) : randomIn(0.68, 0.88);
      shard.z = randomIn(0.4, this.tunnelLen * 0.85);
      shard.vx = randomIn(-1, 1) * 0.00002;
      shard.vy = randomIn(-1, 1) * 0.000015;
      shard.vz = randomIn(-1, 1) * 0.00004;
      shard.r = randomIn(0.014, 0.038);
      shard.n = 3 + Math.floor(Math.random() * 3);
      shard.spin = randomIn(-0.0018, 0.0018);
      shard.rot = randomIn(0, Math.PI * 2);
      shard.kind = Math.random() > 0.72 ? 2 : 0;
    }
  }

  resize() {
    if (!this.canvas) return;
    const { width, height, dpr } = displaySize();
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  holdMs() {
    if (this.mood === "calm") return 6500 + Math.random() * 2500;
    if (this.mood === "peak") return 2800 + Math.random() * 1400;
    return 4000 + Math.random() * 2200;
  }

  beginFlip(extra = 0) {
    this.flipping = true;
    this.infects = [];
    const n = Math.min(MAX_INFECT, 2 + extra + Math.floor(Math.random() * 3));
    for (let i = 0; i < n; i++) {
      this.infects.push({
        x: randomIn(0.1, 0.9),
        y: randomIn(0.12, 0.88),
        r: 0.03 + Math.random() * 0.04,
        vr: 0.00007 + Math.random() * 0.00006,
      });
    }
  }

  commitFlip() {
    this.paper = this.paper > 0.5 ? 0 : 1;
    this.flipping = false;
    this.infects = [];
    this.flipHold = this.holdMs();
  }

  triggerDrop() {
    this.layoutSeed = Math.random() * 1000;
    this.treeKey = "";
    this.punchFlash = 1;
    this.dropBoost = 1;
    this.beginFlip(2);
    this.spawnAgents(true);
    this.spawnShards(true);
    for (const worm of this.worms) {
      worm.zSpeed = -0.0007 - Math.random() * 0.0004;
      worm.speed *= 1.8;
    }
  }

  accentPunch(intensity) {
    this.punchFlash = Math.max(this.punchFlash, intensity);
    for (const agent of this.agents) {
      agent.vx += (agent.x - 0.5) * intensity * 0.00028;
      agent.vy += (agent.y - 0.5) * intensity * 0.00028;
      agent.flash = Math.max(agent.flash, intensity);
    }
    for (const worm of this.worms) {
      worm.zSpeed -= intensity * 0.00035;
      worm.speed *= 1 + intensity * 0.4;
    }
    if (!this.flipping && intensity > 0.78 && this.flipHold < 1800) this.beginFlip(1);
    if (this.flipping && this.infects.length < MAX_INFECT && intensity > 0.7) {
      this.infects.push({
        x: randomIn(0.15, 0.85),
        y: randomIn(0.15, 0.85),
        r: 0.04,
        vr: 0.00012,
      });
    }
  }

  wrapZ(z) {
    const len = this.tunnelLen;
    let r = (z - this.travelZ) % len;
    if (r < 0) r += len;
    return r;
  }

  project(x, y, z) {
    const cam = this.cam;
    const zc = this.wrapZ(z);
    if (zc < 0.07 || zc > this.tunnelLen - 0.05) {
      return { x: 0, y: 0, z: zc, s: 0, fog: 1, ok: false };
    }

    const pulse = this.radiusPulse;
    let px = (x - 0.5) * pulse;
    let py = (y - 0.58) * pulse;
    const cr = Math.cos(cam.roll * 0.28);
    const sr = Math.sin(cam.roll * 0.28);
    const rx = px * cr - py * sr + cam.yaw * 0.1;
    const ry = px * sr + py * cr - cam.pitch * 0.18;
    const s = 0.78 / (zc * cam.zoom);
    const cx = rx * s * 2.45;
    const cyClip = -ry * s * 2.15 - 0.22;
    const ok = Math.abs(cx) < 3.6 && Math.abs(cyClip) < 3.6;
    const fog = Math.min(1, Math.max(0, (zc - 0.14) / (this.tunnelLen * 0.88)));
    return { x: cx, y: cyClip, z: zc, s, fog, ok };
  }

  pushWorld(x0, y0, z0, x1, y1, z1) {
    this.worldSegs.push(x0, y0, z0, x1, y1, z1);
  }

  pushShape(cx, cy, z, r, n, rot) {
    let px = cx + Math.cos(rot) * r;
    let py = cy + Math.sin(rot) * r;
    for (let i = 1; i <= n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      this.pushWorld(px, py, z, x, y, z);
      px = x;
      py = y;
    }
  }

  pushRing(cx, cy, z, r, sides) {
    let px = cx + r;
    let py = cy;
    for (let i = 1; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.78;
      this.pushWorld(px, py, z, x, y, z);
      px = x;
      py = y;
    }
  }

  pushField() {
    const len = this.tunnelLen;
    const frames = 12;
    for (let i = 0; i < frames; i++) {
      const z = (i / frames) * len;
      this.pushWorld(0.07, 0.1, z, 0.93, 0.1, z);
      this.pushWorld(0.07, 0.9, z, 0.93, 0.9, z);
      this.pushWorld(0.07, 0.1, z, 0.07, 0.9, z);
      this.pushWorld(0.93, 0.1, z, 0.93, 0.9, z);
    }
    const rails = 6;
    for (let i = 0; i <= rails; i++) {
      const x = 0.07 + (i / rails) * 0.86;
      this.pushWorld(x, 0.1, 0.05, x, 0.1, len);
      this.pushWorld(x, 0.9, 0.05, x, 0.9, len);
    }
    for (let i = 0; i <= 4; i++) {
      const y = 0.1 + (i / 4) * 0.8;
      this.pushWorld(0.07, y, 0.05, 0.07, y, len);
      this.pushWorld(0.93, y, 0.05, 0.93, y, len);
    }
  }

  buildLayer(z, maxDepth, maxNodes, shapeChance, seed) {
    let nodeCount = 0;
    const visit = (x, y, w, h, depth) => {
      nodeCount += 1;
      const minSpan = Math.min(w, h);
      const kd = (depth + Math.floor(seed)) % 2 === 0;
      const tooSmall = minSpan < 0.022 || depth >= maxDepth || nodeCount >= maxNodes;
      const chance = hash2(x * 8.3, y * 8.3, seed + depth);
      const split = !tooSmall && ((Math.max(w, h) > 0.34 && depth < 2) || chance > 0.36);

      this.pushWorld(x, y, z, x + w, y, z);
      this.pushWorld(x + w, y, z, x + w, y + h, z);
      this.pushWorld(x + w, y + h, z, x, y + h, z);
      this.pushWorld(x, y + h, z, x, y, z);

      if (depth >= 1 && chance > 0.4) {
        if (hash2(x, y, seed + 4) > 0.5) this.pushWorld(x, y, z, x + w, y + h, z);
        else this.pushWorld(x + w, y, z, x, y + h, z);
      }
      if (depth >= 2 && chance > 0.48) {
        this.pushWorld(x + w * 0.5, y, z, x + w * 0.5, y + h, z);
        this.pushWorld(x, y + h * 0.5, z, x + w, y + h * 0.5, z);
      }
      if (depth >= 3 && chance > 0.58) {
        this.pushWorld(x + w * 0.25, y, z, x + w * 0.25, y + h, z);
        this.pushWorld(x + w * 0.75, y, z, x + w * 0.75, y + h, z);
        this.pushWorld(x, y + h * 0.25, z, x + w, y + h * 0.25, z);
        this.pushWorld(x, y + h * 0.75, z, x + w, y + h * 0.75, z);
      }

      if (!split) {
        const cx = x + w * 0.5;
        const cy = y + h * 0.5;
        const rr = Math.min(w, h) * 0.4;
        if (hash2(cx, cy, seed) < shapeChance && rr > 0.01) {
          const kind = Math.floor(hash2(cy, cx, seed + 11) * 6);
          const rot = hash2(x, depth, seed) * Math.PI;
          if (kind === 0) this.pushShape(cx, cy, z, rr, 3, rot);
          else if (kind === 1) this.pushShape(cx, cy, z, rr, 3, rot + 0.4);
          else if (kind === 2) this.pushShape(cx, cy, z, rr, 6, rot);
          else if (kind === 3) this.pushShape(cx, cy, z, rr * 0.9, 5, rot);
          else if (kind === 4) {
            this.pushWorld(cx - rr, cy, z, cx + rr, cy, z);
            this.pushWorld(cx, cy - rr, z, cx, cy + rr, z);
          } else {
            this.pushShape(cx, cy, z, rr, 5, rot);
            this.pushWorld(cx, cy, z, cx + Math.cos(rot) * rr, cy + Math.sin(rot) * rr, z);
          }
        }
        return;
      }

      const j = 0.3 + hash2(x, y + depth, seed) * 0.4;
      if (kd) {
        const hw = w * j;
        visit(x, y, hw, h, depth + 1);
        visit(x + hw, y, w - hw, h, depth + 1);
      } else {
        const hh = h * j;
        visit(x, y, w, hh, depth + 1);
        visit(x, y + hh, w, h - hh, depth + 1);
      }
    };
    visit(0.04, 0.04, 0.92, 0.92, 0);
  }

  rebuildWorld(energy) {
    this.worldSegs = [];
    const seed = this.layoutSeed;
    const punch = this.punchFlash > 0.55 ? 1 : 0;
    const gateDepth = (this.mood === "peak" ? 4 : 3) + punch;
    this.pushField();
    const planes = 8;
    for (let i = 0; i < planes; i++) {
      const z = ((i + 0.2) / planes) * this.tunnelLen;
      this.buildLayer(z, gateDepth, 130 + Math.round(energy * 36), 0.18 + energy * 0.08, seed + i * 2.1);
    }
  }

  pushRibbon(buf, n, ax, ay, bx, by, halfW, lum0, lum1, alpha) {
    let dx = bx - ax;
    let dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfW;
    const ny = (dx / len) * halfW;
    buf = ensure(buf, n + 24);
    const verts = [
      ax + nx, ay + ny, lum0, alpha,
      ax - nx, ay - ny, lum0, alpha,
      bx + nx, by + ny, lum1, alpha,
      ax - nx, ay - ny, lum0, alpha,
      bx - nx, by - ny, lum1, alpha,
      bx + nx, by + ny, lum1, alpha,
    ];
    buf.set(verts, n);
    return { buf, n: n + 24 };
  }

  projectWorld(buf, n) {
    for (let i = 0; i < this.worldSegs.length; i += 6) {
      const a = this.project(this.worldSegs[i], this.worldSegs[i + 1], this.worldSegs[i + 2]);
      const b = this.project(this.worldSegs[i + 3], this.worldSegs[i + 4], this.worldSegs[i + 5]);
      if (!a.ok && !b.ok) continue;
      if (Math.abs(a.z - b.z) > this.tunnelLen * 0.4) continue;
      const lum0 = this.inkOf(a.fog * 0.75);
      const lum1 = this.inkOf(b.fog * 0.75);
      const w = 0.00055 * (0.7 + 0.5 / Math.max(a.z, 0.4));
      ({ buf, n } = this.pushRibbon(buf, n, a.x, a.y, b.x, b.y, w, lum0, lum1, 0.38));
    }
    return { buf, n };
  }

  appendWaveforms(buf, n, t) {
    const bass = this.smoothBass;
    const mid = this.smoothMid;
    const amp = 0.01 + bass * 0.16 + this.smoothSaw * 0.08;
    const len = this.tunnelLen;

    for (let strand = 0; strand < 3; strand++) {
      const y = 0.26 + strand * 0.2;
      let prev = null;
      for (let i = 0; i <= 56; i++) {
        const z = (i / 56) * len;
        const x =
          0.5 +
          amp * Math.sin(z * 7.5 + t * 0.0038 + strand * 1.4) +
          mid * 0.05 * Math.sin(z * 18 + t * 0.007 + strand);
        const p = this.project(x, y, z);
        if (prev && prev.ok && p.ok && Math.abs(prev.z - p.z) < len * 0.35) {
          const lum = this.inkOf(p.fog * 0.25);
          ({ buf, n } = this.pushRibbon(
            buf, n, prev.x, prev.y, p.x, p.y,
            (0.0045 + this.smoothSaw * 0.002) * p.s, lum, lum, 0.78
          ));
        }
        prev = p;
      }
    }
    return { buf, n };
  }

  appendShards(buf, n) {
    for (const shard of this.shards) {
      const sides = shard.kind === 1 ? 4 : shard.n;
      let prev = null;
      let first = null;
      for (let i = 0; i <= sides; i++) {
        const a = shard.rot + (i / sides) * Math.PI * 2;
        const rx = shard.kind === 2 ? shard.r * (i % 2 === 0 ? 1 : 0.42) : shard.r;
        const p = this.project(shard.x + Math.cos(a) * rx, shard.y + Math.sin(a) * rx, shard.z);
        if (!first) first = p;
        if (prev && prev.ok && p.ok) {
          const lum = this.inkOf(p.fog * 0.6);
          const w = 0.0007 * (0.8 + 0.5 / Math.max(p.z, 0.4));
          ({ buf, n } = this.pushRibbon(buf, n, prev.x, prev.y, p.x, p.y, w, lum, lum, 0.42));
        }
        prev = p;
      }
    }
    return { buf, n };
  }

  appendWorms() {
    let buf = this.wormVerts;
    let n = 0;
    const lum = this.paper > 0.5 ? 0.1 : 0.9;
    const edgeLum = this.paper > 0.5 ? 0.28 : 0.72;
    for (const worm of this.worms) {
      const clip = [];
      for (const pt of worm.pts) {
        const p = this.project(pt.x, pt.y, pt.z);
        if (p.ok) clip.push(p);
      }
      if (clip.length < 3) continue;
      for (let i = 0; i < clip.length; i++) {
        const prev = clip[Math.max(0, i - 1)];
        const next = clip[Math.min(clip.length - 1, i + 1)];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const taper = 1 - (i / (clip.length - 1)) * 0.55;
        const w = worm.width * clip[i].s * taper;
        clip[i].lx = clip[i].x + (-dy / len) * w;
        clip[i].ly = clip[i].y + (dx / len) * w;
        clip[i].rx = clip[i].x - (-dy / len) * w;
        clip[i].ry = clip[i].y - (dx / len) * w;
      }
      for (let i = 0; i < clip.length - 1; i++) {
        const a = clip[i];
        const b = clip[i + 1];
        if (Math.abs(a.z - b.z) > this.tunnelLen * 0.4) continue;
        buf = ensure(buf, n + 24);
        const verts = [
          a.lx, a.ly, edgeLum, 0.92,
          a.rx, a.ry, lum, 0.96,
          b.lx, b.ly, edgeLum, 0.92,
          a.rx, a.ry, lum, 0.96,
          b.rx, b.ry, lum, 0.96,
          b.lx, b.ly, edgeLum, 0.92,
        ];
        buf.set(verts, n);
        n += 24;
      }
    }
    this.wormVerts = buf;
    this.wormCount = n / 4;
  }

  updateInfection(dt, dynamics) {
    this.flipHold -= dt;
    const chordDelta = dynamics?.chordDelta || 0;
    const barPhase = dynamics?.barPhase ?? 1;
    const beatPhase = dynamics?.beatPhase ?? 1;
    if (
      !this.flipping &&
      chordDelta > 0.22 &&
      (barPhase < 0.2 || beatPhase < 0.12) &&
      this.flipHold < 900
    ) {
      this.beginFlip(1);
    }
    if (!this.flipping && this.flipHold <= 0) this.beginFlip();
    if (!this.flipping) return;

    let maxR = 0;
    for (const seed of this.infects) {
      seed.r += seed.vr * dt * (1 + this.punchFlash * 0.55);
      if (seed.r > maxR) maxR = seed.r;
    }
    if (maxR > 1.35) this.commitFlip();
  }

  update(dt, dynamics) {
    if (!this.ready || !this.visible) return;

    this.time += dt;
    this.mood = dynamics?.mood || this.mood;
    this.smoothBass = this.smoothBass * 0.86 + (dynamics?.bass || 0) * 0.14;
    this.smoothMid = this.smoothMid * 0.9 + (dynamics?.mid || 0) * 0.1;
    this.smoothTreble = this.smoothTreble * 0.9 + (dynamics?.treble || 0) * 0.1;
    this.smoothSaw = this.smoothSaw * 0.86 + (dynamics?.saw || 0) * 0.14;
    this.smoothSub = this.smoothSub * 0.86 + (dynamics?.subRms || dynamics?.sub || 0) * 0.14;
    this.smoothEnergy = this.smoothEnergy * 0.92 + (dynamics?.energy || 0) * 0.08;
    this.punchFlash = Math.max(0, this.punchFlash - dt * 0.0022);
    this.hatFlash = Math.max(this.hatFlash * 0.88, (dynamics?.hats || dynamics?.hatOnset || 0) * 0.7);
    this.kick = Math.max(this.kick * 0.9, dynamics?.drums || dynamics?.kickOnset || 0);
    this.dropBoost = Math.max(0, this.dropBoost - dt * 0.0016);
    if (dynamics?.isDrop) this.dropBoost = 1;

    this.beatPhase = dynamics?.beatPhase || 0;
    this.barPhase = dynamics?.barPhase || 0;
    this.lock = dynamics?.lock || 0;
    this.bpm = dynamics?.bpm || 124;
    const sat = (1 - (dynamics?.chordEntropy ?? 1)) * 0.4 + this.lock * 0.25;
    const hue = ((dynamics?.chordRoot || 0) / 12) * Math.PI * 2;
    const cool = dynamics?.chordQuality === "min" ? 0.08 : 0;
    this.tint[0] = 1 + sat * 0.12 * Math.cos(hue) - cool;
    this.tint[1] = 1 + sat * 0.05 * Math.cos(hue + 2.1);
    this.tint[2] = 1 + sat * 0.12 * Math.cos(hue + 4.2) + cool;

    const drums = dynamics?.drums || this.kick;
    const bass = dynamics?.bassMotion || this.smoothSub * 0.7 + this.smoothBass * 0.5;

    const body = Math.min(1, bass * 0.85 + this.smoothEnergy * 0.2 + this.dropBoost * 0.35);
    this.drive = 0.1 + 0.9 * body;
    this.radiusPulse = 1 + drums * 0.08 + this.dropBoost * 0.06;

    const beatWave = 0.88 + 0.12 * Math.cos(this.beatPhase * Math.PI * 2);
    const tempo = 0.88 + 0.12 * (this.bpm / 124);
    const cruise =
      0.00084 * this.drive * tempo * beatWave * (1 + this.dropBoost * 1.9) +
      drums * 0.00022;
    this.travelZ += cruise * dt;

    const t = this.time;
    const m = this.drive;
    this.cam.yaw = Math.sin(t * 0.00016) * 0.04 * m;
    this.cam.pitch = 0.12 + Math.sin(t * 0.00012) * 0.02 * m;
    this.cam.roll = (this.smoothSaw * 0.05 + Math.sin(t * 0.00032) * 0.012) * m;
    this.cam.zoom = 1 + drums * 0.03 + this.dropBoost * 0.05 - bass * 0.02;

    this.updateInfection(dt, dynamics);

    const energy = Math.min(1, this.smoothEnergy * 1.35 + this.smoothBass * 0.5 + this.punchFlash * 0.3);
    const treeKey = `${Math.round(energy * 5)}|${this.mood}|${this.layoutSeed}|${this.punchFlash > 0.55 ? 1 : 0}`;
    if (treeKey !== this.treeKey) {
      this.rebuildWorld(energy);
      this.treeKey = treeKey;
    }

    const len = this.tunnelLen;
    for (const agent of this.agents) {
      agent.vx += (Math.random() - 0.5) * 0.0000016 * dt * this.drive;
      agent.vy += (Math.random() - 0.5) * 0.0000016 * dt * this.drive;
      agent.x += agent.vx * dt * this.drive * (1 + bass * 1.4);
      agent.y += agent.vy * dt * this.drive * (1 + bass * 1.4);
      agent.flash = Math.max(0, agent.flash - dt * 0.002);
      agent.x = Math.min(0.94, Math.max(0.06, agent.x));
      agent.y = Math.min(0.94, Math.max(0.06, agent.y));
      if (agent.x <= 0.06 || agent.x >= 0.94) agent.vx *= -0.85;
      if (agent.y <= 0.06 || agent.y >= 0.94) agent.vy *= -0.85;
    }

    for (const shard of this.shards) {
      shard.x += shard.vx * dt * this.drive;
      shard.y += shard.vy * dt * this.drive;
      shard.z += (shard.vz * this.drive - cruise * 1.15) * dt;
      shard.rot += shard.spin * dt * this.drive;
      if (shard.z < 0) shard.z += len;
      if (shard.z > len) shard.z -= len;
      if (shard.x < 0.05 || shard.x > 0.95) shard.vx *= -1;
      if (shard.y < 0.05 || shard.y > 0.95) shard.vy *= -1;
    }

    for (const worm of this.worms) {
      const head = worm.pts[0];
      worm.yaw += snoise(t * 0.0016 + worm.phase) * 0.0018 * dt * this.drive;
      worm.pitch += snoise(t * 0.0012 + worm.phase + 8) * 0.0014 * dt * this.drive;
      const spd = worm.speed * dt * this.drive * (1 + bass * 0.6);
      const nx = head.x + Math.cos(worm.yaw) * spd;
      const ny = head.y + Math.sin(worm.yaw) * spd * 0.85;
      let nz = head.z + (worm.zSpeed * this.drive - cruise * 0.85) * dt;
      worm.zSpeed += (-0.00012 - worm.zSpeed) * 0.02;
      worm.speed += (0.0001 - worm.speed) * 0.012;
      if (nx < 0.12 || nx > 0.88) worm.yaw = Math.PI - worm.yaw;
      if (ny < 0.14 || ny > 0.86) worm.yaw = -worm.yaw;
      if (nz < 0) nz += len;
      if (nz > len) nz -= len;
      worm.pts.unshift({
        x: Math.min(0.88, Math.max(0.12, nx)),
        y: Math.min(0.86, Math.max(0.14, ny)),
        z: nz,
      });
      if (worm.pts.length > WORM_LEN) worm.pts.pop();
    }

    this.packSites(drums);
    this.packInfect();

    let hair = this.hairVerts;
    let hn = 0;
    ({ buf: hair, n: hn } = this.projectWorld(hair, hn));
    ({ buf: hair, n: hn } = this.appendShards(hair, hn));
    this.hairVerts = hair;
    this.hairCount = hn / 4;

    let wave = this.waveVerts;
    let wn = 0;
    ({ buf: wave, n: wn } = this.appendWaveforms(wave, wn, t));
    this.waveVerts = wave;
    this.waveCount = wn / 4;

    this.appendWorms();
  }

  packInfect() {
    this.infectData.fill(0);
    const n = Math.min(MAX_INFECT, this.infects.length);
    for (let i = 0; i < n; i++) {
      const s = this.infects[i];
      this.infectData[i * 4] = s.x;
      this.infectData[i * 4 + 1] = s.y;
      this.infectData[i * 4 + 2] = s.r;
      this.infectData[i * 4 + 3] = 1;
    }
  }

  packSites(punch) {
    const sites = [];
    const corners = new Map();
    for (let i = 0; i < this.worldSegs.length; i += 6) {
      if (this.worldSegs[i + 2] > this.tunnelLen) continue;
      const x = this.worldSegs[i];
      const y = this.worldSegs[i + 1];
      corners.set(`${x.toFixed(3)},${y.toFixed(3)}`, [x, y]);
    }
    const list = [...corners.values()];
    const budget = Math.max(10, MAX_SITES - this.agents.length);
    const step = Math.max(1, Math.ceil(list.length / budget));
    for (let i = 0; i < list.length && sites.length < budget; i += step) sites.push(list[i]);
    for (const agent of this.agents) sites.push([agent.x, agent.y, agent.flash]);

    this.siteCount = Math.min(MAX_SITES, sites.length);
    for (let i = 0; i < this.siteCount; i++) {
      const s = sites[i];
      this.siteData[i * 3] = s[0];
      this.siteData[i * 3 + 1] = s[1];
      this.siteData[i * 3 + 2] = s[2] ?? punch * 0.2;
    }
  }

  drawMesh(gl, buffer, data, count) {
    if (count <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 4), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  draw() {
    if (!this.ready || !this.visible) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    const punch = this.punchFlash;
    const fill = this.mood === "calm" ? 0.45 : this.mood === "peak" ? 0.85 : 0.68;
    const edge = (this.mood === "calm" ? 0.0016 : this.mood === "peak" ? 0.0028 : 0.002) * (1 + punch * 0.5);

    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    gl.useProgram(this.triProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.uTri.res, width, height);
    gl.uniform1f(this.uTri.time, this.time * 0.001);
    gl.uniform1f(this.uTri.punch, punch);
    gl.uniform1f(this.uTri.energy, this.smoothEnergy);
    gl.uniform1f(this.uTri.edge, edge);
    gl.uniform1f(this.uTri.fill, fill);
    gl.uniform1f(this.uTri.paper, this.paper);
    gl.uniform1f(this.uTri.tilt, 0.02);
    gl.uniform1f(this.uTri.beatPhase, this.beatPhase);
    gl.uniform1f(this.uTri.lock, this.lock);
    gl.uniform1f(this.uTri.kick, this.kick);
    gl.uniform1f(this.uTri.hat, this.hatFlash);
    gl.uniform3f(this.uTri.tint, this.tint[0], this.tint[1], this.tint[2]);
    gl.uniform1i(this.uTri.count, this.siteCount);
    gl.uniform1i(this.uTri.infectN, this.flipping ? this.infects.length : 0);
    gl.uniform3fv(this.uTri.sites, this.siteData);
    gl.uniform4fv(this.uTri.infect, this.infectData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.overlayProgram);
    gl.uniform1f(this.uOver.hat, this.hatFlash);
    gl.uniform3f(this.uOver.tint, this.tint[0], this.tint[1], this.tint[2]);
    this.drawMesh(gl, this.hairBuf, this.hairVerts, this.hairCount);
    this.drawMesh(gl, this.waveBuf, this.waveVerts, this.waveCount);
    this.drawMesh(gl, this.wormBuf, this.wormVerts, this.wormCount);
  }

  destroy() {
    const gl = this.gl;
    if (gl) {
      if (this.triProgram) gl.deleteProgram(this.triProgram);
      if (this.overlayProgram) gl.deleteProgram(this.overlayProgram);
      if (this.quad) gl.deleteBuffer(this.quad);
      if (this.hairBuf) gl.deleteBuffer(this.hairBuf);
      if (this.waveBuf) gl.deleteBuffer(this.waveBuf);
      if (this.wormBuf) gl.deleteBuffer(this.wormBuf);
    }
    this.triProgram = null;
    this.overlayProgram = null;
    this.quad = null;
    this.hairBuf = null;
    this.waveBuf = null;
    this.wormBuf = null;
    this.gl = null;
    this.ready = false;
    this.setVisible(false);
  }
}
