// ═══════════════════════════════════════════════════════════════════════════
// hero-shader.js — mikihoo / 微氣候  interactive hero
// Vanilla OGL WebGL, no build step. ESM module.
// Live on load (video + duotone shader + particle pointillism). Clicking
// anywhere in the hero area silently requests the mic to add an audio layer.
// ═══════════════════════════════════════════════════════════════════════════

import { Renderer, Program, Mesh, Triangle, Texture, Geometry }
  from 'https://cdn.jsdelivr.net/npm/ogl/+esm';

// ─── TUNABLE PARAMETERS ───────────────────────────────────────────────────
// Edit these values to adjust every effect without touching shader code.
const P = {
  // ── Duotone color mapping (normalized 0-1 RGB) ──────────────────────────
  SHADOW_COLOR:    [0.122, 0.086, 0.063],  // #1f1610 warm dark (NOT pure black)
  HIGHLIGHT_COLOR: [0.769, 0.694, 0.620],  // #c4b19e warm grey highlight
  DUOTONE_MIX:     0.52,                    // 0=pure b&w  1=full duotone

  // ── Displacement / wave ripple (UV units; 0.02 ≈ 2% of width) ───────────
  DISP_BASE:       0.015,    // always-on ripple amplitude
  DISP_POINTER:    0.020,    // extra amplitude near pointer
  DISP_BASS:       0.022,    // extra amplitude from bass audio

  // ── Chromatic aberration (RGB split, UV units) ──────────────────────────
  CHROMA_BASE:     0.0016,   // subtle always-on split (~1px)
  CHROMA_VEL:      0.010,    // split when pointer moves fast (×4-6 boost)
  CHROMA_HIGH:     0.008,    // split from treble audio

  // ── Komorebi light flares (screen-blend additive) ───────────────────────
  FLARE_BASE:      0.22,     // autonomous drifting glow intensity
  FLARE_POINTER:   0.18,     // near-pointer glow boost
  FLARE_AUDIO:     0.16,     // from overall volume (RMS)
  FLARE_CLAMP:     0.50,     // ceiling on total flare (keeps video visible)

  // ── Glitch events (rate = events/sec; ~0.15 ≈ one per ~7s) ──────────────
  GLITCH_RATE:     0.16,     // base glitch frequency
  GLITCH_RATE_H:   1.4,      // extra frequency when treble is loud
  GLITCH_DUR:      0.13,     // seconds each glitch event lasts

  // ── Mouse tracking inertia (0=instant, higher=more lag/smoothness) ──────
  MOUSE_INERTIA:   0.08,

  // ── Ease-in durations (seconds) ─────────────────────────────────────────
  ACTIVE_EASE_DUR: 2.2,      // load → fully active fade-in
  AUDIO_EASE_DUR:  1.8,      // mic granted → audio takes effect

  // ── Particle system (the main visual) ───────────────────────────────────
  PARTICLES:       true,     // false to disable entirely
  PART_SIZE:       2.2,      // base point size (px, scaled by dpr & lum)
  PART_DRIFT:      0.012,    // autonomous noise-flow drift amplitude (UV)
  PART_REPEL:      0.16,     // pointer repulsion strength
  PART_REPEL_R:    0.10,     // pointer repulsion radius (UV²-ish)
  PART_BASS_SCAT:  0.10,     // bass-driven scatter amplitude
  PART_GLITCH_FRAC:0.08,     // fraction of particles that glitch-jump (0-1)
  PART_GLITCH_AMP: 0.05,     // glitch jump distance (UV)
  PART_ALPHA:      0.55,     // overall particle opacity
  // counts are chosen by screen width in particleCount()
};
// ─────────────────────────────────────────────────────────────────────────

const REDUCED  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_MOB   = window.innerWidth <= 768 || 'ontouchstart' in window;

function particleCount() {
  const w = window.innerWidth;
  if (REDUCED)      return 6000;
  if (w <= 480)     return 5000;
  if (w <= 768)     return 9000;
  if (w <= 1280)    return 24000;
  if (w <= 1920)    return 40000;
  return 52000;
}

// ─── Shared GLSL: Simplex 2D noise ─────────────────────────────────────────
const NOISE_GLSL = /* glsl */`
vec3 _mod289v3(vec3 x) { return x - floor(x*(1.0/289.0))*289.0; }
vec2 _mod289v2(vec2 x) { return x - floor(x*(1.0/289.0))*289.0; }
vec3 _perm(vec3 x)     { return _mod289v3(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1  = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy  -= i1;
  i = _mod289v2(i);
  vec3 p = _perm(_perm(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x  = 2.0*fract(p*C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x *x0.x  + h.x *x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0*dot(m,g);
}`;

// ─── GLSL: Main vertex (fullscreen triangle) ─────────────────────────────
const VERT = /* glsl */`
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// ─── GLSL: Main fragment (post-process video texture) ────────────────────
const FRAG = /* glsl */`
precision highp float;

uniform sampler2D tVideo;
uniform float uTime;
uniform float uActive;       // 0=idle, 1=fully active
uniform vec2  uMouse;        // smoothed mouse [0,1]
uniform float uMouseVel;     // mouse velocity (0–1 normalized)
uniform float uAudio;        // RMS level × audio ease
uniform float uBass;
uniform float uHigh;
uniform float uGlitch;       // 0 or 1
uniform float uGlitchY;
uniform float uGlitchH;
uniform float uGlitchOff;
uniform vec4  uVideoUV;      // [scaleX, scaleY, offX, offY] — object-fit:cover

// ── Tunable uniforms (mapped from P object) ──
uniform vec3  uShadowColor;
uniform vec3  uHighlightColor;
uniform float uDuotoneMix;
uniform float uDispBase;
uniform float uDispPointer;
uniform float uDispBass;
uniform float uFlareBase;
uniform float uFlarePointer;
uniform float uFlareAudio;
uniform float uFlareClamp;
uniform float uChromaBase;
uniform float uChromaVel;
uniform float uChromaHigh;

varying vec2 vUv;

${NOISE_GLSL}

// ── Video UV: object-fit:cover equivalent ───────────────────────────────
vec2 videoUV(vec2 uv) { return uv * uVideoUV.xy + uVideoUV.zw; }

// ── Soft radial flare ─────────────────────────────────────────────────
float flare(vec2 uv, vec2 center, float r) {
  vec2 d = uv - center;
  return exp(-dot(d,d) / (r*r));
}

void main() {
  vec2 uv   = vUv;
  float t   = uTime;
  float act = uActive;

  // ── 1. Displacement ──────────────────────────────────────────────────
  float nFreq = 2.6;
  float nx = snoise(uv * nFreq + vec2(t*0.13,  t*0.09));
  float ny = snoise(uv * nFreq + vec2(t*0.11 + 3.7, t*0.15 + 1.3));

  vec2  mp   = vec2(uMouse.x, uMouse.y);
  float md   = length(uv - mp);
  float mprx = exp(-md*md / 0.06) * act;

  float damp    = mix(0.30, 1.0, act);
  float dispAmp = (uDispBase + mprx*uDispPointer + uBass*uDispBass) * damp;
  vec2  dispUV  = uv + vec2(nx, ny) * dispAmp;

  // ── 2. Chromatic aberration (subtle always-on, boosted by vel/treble) ──
  float chromaAmt = (uChromaBase + uMouseVel*uChromaVel + uHigh*uChromaHigh)
                    * mix(0.4, 1.0, act);
  vec2  cDir      = normalize(vec2(nx, ny) + 0.0001);

  // ── 3. Glitch horizontal band ────────────────────────────────────────
  vec2 sampleUV = dispUV;
  if (uGlitch > 0.5) {
    float inBand = step(uGlitchY - uGlitchH, uv.y)
                 - step(uGlitchY + uGlitchH, uv.y);
    sampleUV.x  += inBand * uGlitchOff;
    chromaAmt   += inBand * 0.006;   // extra split inside glitch band
  }

  // ── 4. Sample video with RGB split ───────────────────────────────────
  vec2 vR = clamp(videoUV(sampleUV + cDir*chromaAmt), 0.0, 1.0);
  vec2 vG = clamp(videoUV(sampleUV),                  0.0, 1.0);
  vec2 vB = clamp(videoUV(sampleUV - cDir*chromaAmt), 0.0, 1.0);

  float r = texture2D(tVideo, vR).r;
  float g = texture2D(tVideo, vG).g;
  float b = texture2D(tVideo, vB).b;
  float lum = dot(vec3(r,g,b), vec3(0.299, 0.587, 0.114));

  // ── 5. Duotone color mapping ──────────────────────────────────────────
  vec3 duoColor = mix(uShadowColor, uHighlightColor, lum);
  vec3 color    = mix(vec3(lum), duoColor, uDuotoneMix);

  // ── 6. Komorebi flares (screen-blend additive) ───────────────────────
  float ft = t * 0.18;
  vec2 fc1 = vec2(0.30 + 0.22*snoise(vec2(ft,     0.0)),
                  0.42 + 0.18*snoise(vec2(0.0,     ft+1.3)));
  vec2 fc2 = vec2(0.68 + 0.14*snoise(vec2(ft+5.1, 0.0)),
                  0.60 + 0.14*snoise(vec2(0.0,     ft+2.7)));

  float f1 = flare(uv, fc1, 0.28) * uFlareBase;
  float f2 = flare(uv, fc2, 0.20) * uFlareBase * 0.7;
  float fp = flare(uv, mp, 0.16) * uFlarePointer * mprx;
  float fa = uAudio * uFlareAudio;

  float fTotal = clamp((f1 + f2 + fp) * act + fa * act, 0.0, uFlareClamp);
  color = 1.0 - (1.0 - color) * (1.0 - fTotal);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

// ─── GLSL: Particle vertex ────────────────────────────────────────────────
const PART_VERT = /* glsl */`
attribute vec2  aUV;      // home position in video space [0,1]
attribute float aSpeed;   // drift speed multiplier
attribute float aRand;    // per-particle random [0,1]
uniform sampler2D tVideo;
uniform float uTime;
uniform float uActive;
uniform vec2  uMouse;
uniform float uMouseVel;
uniform float uBass;
uniform float uHigh;
uniform vec4  uVideoUV;
uniform float uPointSize;
uniform float uDpr;
uniform float uDrift;
uniform float uRepel;
uniform float uRepelR;
uniform float uBassScat;
uniform float uGlitchFrac;
uniform float uGlitchAmp;
uniform float uScanline;    // 0-1 strength of horizontal alignment event
uniform float uScanlineY;   // target Y in [0,1]
uniform vec3  uShadowColor;
uniform vec3  uHighlightColor;
varying float vLum;
varying float vAlpha;
varying vec3  vColor;
varying float vGlitch;      // -1 / 0 / +1 channel push

${NOISE_GLSL}

void main() {
  vec2 uv = aUV;

  // Sample luminance at this particle's home position
  vec2 texUV = clamp(uv * uVideoUV.xy + uVideoUV.zw, 0.0, 1.0);
  float lum  = texture2D(tVideo, texUV).r;
  vLum = lum;

  // ── Autonomous noise-flow drift ──────────────────────────────────────
  float t  = uTime * (0.25 + aSpeed*0.35);
  float dx = snoise(uv*3.0 + vec2(t*0.30, aRand*10.0)) * uDrift;
  float dy = snoise(uv*3.0 + vec2(aRand*10.0, t*0.26)) * uDrift;
  vec2 pos = uv + vec2(dx, dy);

  // ── Pointer repulsion (force pushes particles away) ──────────────────
  vec2  toM   = pos - uMouse;
  float md2   = dot(toM, toM);
  float push  = exp(-md2 / uRepelR) * uRepel * uActive;
  pos += normalize(toM + 0.0001) * push;

  // Fast pointer leaves streaks: stretch along push dir with velocity
  pos += normalize(toM + 0.0001) * push * uMouseVel * 1.5;

  // ── Bass scatter (whole field trembles) ──────────────────────────────
  float sc = uBass * uBassScat;
  pos += vec2(snoise(uv*8.0 + uTime),
              snoise(uv*8.0 - uTime)) * sc;

  // ── Glitch jump: a fraction of particles tick to a new spot, RGB-split ─
  float gWindow = step(aRand, uGlitchFrac);
  float gPulse  = step(0.92, fract(uTime*7.0 + aRand*53.0)) * gWindow;
  vGlitch = 0.0;
  if (gPulse > 0.5) {
    vec2 j = vec2(snoise(uv*20.0 + uTime*9.0),
                  snoise(uv*20.0 - uTime*9.0));
    pos += j * (uGlitchAmp + uHigh*0.04);
    vGlitch = sign(j.x);   // tint toward R (+) or B (-)
  }

  // ── Scanline alignment event ─────────────────────────────────────────
  pos.y = mix(pos.y, uScanlineY, uScanline * (0.6 + 0.4*aRand));

  // ── Color from duotone palette + per-particle warm/cool variance ─────
  vec3 base  = mix(uShadowColor, uHighlightColor, clamp(lum*1.15, 0.0, 1.0));
  vec3 warm  = base * vec3(1.08, 1.0, 0.92);
  vec3 cool  = base * vec3(0.92, 0.98, 1.08);
  vColor = mix(cool, warm, aRand) * (0.8 + lum*0.6);

  // ── Density: bright video areas → brighter/larger; dark → faint ──────
  vAlpha = uActive * smoothstep(0.10, 0.55, lum) * (0.5 + aRand*0.5);

  vec2 clip = pos * 2.0 - 1.0;
  gl_PointSize = uPointSize * uDpr * (0.6 + lum*0.9);
  gl_Position  = vec4(clip, 0.0, 1.0);
}`;

// ─── GLSL: Particle fragment ──────────────────────────────────────────────
const PART_FRAG = /* glsl */`
precision mediump float;
uniform float uAlpha;
varying float vLum;
varying float vAlpha;
varying vec3  vColor;
varying float vGlitch;
void main() {
  vec2  d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = (0.5 - r) * 2.0;           // soft round falloff (grain feel)
  a *= a;

  vec3 col = vColor;
  // RGB-split tint on glitching particles
  col.r += max(vGlitch, 0.0) * 0.5;
  col.b += max(-vGlitch, 0.0) * 0.5;

  gl_FragColor = vec4(col, vAlpha * a * uAlpha);
}`;

// ─── STATE ───────────────────────────────────────────────────────────────
const STATE = { LIVE: 0, MIC: 1 };
let state      = STATE.LIVE;   // live immediately on load (no entry gate)
let activeEase = 0;
let audioEase  = 0;
let micRequested = false;

// ─── POINTER ─────────────────────────────────────────────────────────────
const rawMouse = { x: 0.5, y: 0.5 };
const smMouse  = { x: 0.5, y: 0.5 };
let mouseVelRaw = 0;
let mouseVelSm  = 0;

function onPointerMove(e) {
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const nx = cx / window.innerWidth;
  const ny = 1.0 - cy / window.innerHeight;   // flip Y → shader bottom=0
  const dx = nx - rawMouse.x, dy = ny - rawMouse.y;
  mouseVelRaw = Math.sqrt(dx*dx + dy*dy);
  rawMouse.x  = nx;
  rawMouse.y  = ny;
}
window.addEventListener('mousemove', onPointerMove, { passive: true });
window.addEventListener('touchmove', onPointerMove, { passive: true });

// ─── AUDIO ────────────────────────────────────────────────────────────────
let analyser, freqData, audioStream;
let audioLevel = 0, audioBass = 0, audioHigh = 0;

async function initAudio() {
  if (micRequested) return;
  micRequested = true;
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') await actx.resume();
    const src = actx.createMediaStreamSource(audioStream);
    analyser  = actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    state    = STATE.MIC;   // upgrade silently
  } catch(_) {
    // denied/unsupported — stay LIVE, no visual feedback
  }
}

function updateAudio() {
  if (!analyser || !freqData) return;
  analyser.getByteFrequencyData(freqData);
  let s = 0;
  for (let i = 0; i < freqData.length; i++) s += (freqData[i]/255)**2;
  audioLevel = Math.sqrt(s / freqData.length);
  let b = 0;
  for (let i = 0; i < 4; i++) b += freqData[i]/255;
  audioBass = b / 4;
  let h = 0, hN = freqData.length - 80;
  for (let i = 80; i < freqData.length; i++) h += freqData[i]/255;
  audioHigh = hN > 0 ? h / hN : 0;
}

// ─── GLITCH (band shader + particle scanline) ──────────────────────────────
let glitchActive = 0, glitchTimer = 0;
let glitchY = 0.5, glitchH = 0.04, glitchOff = 0;
let scanline = 0, scanlineTimer = 0, scanlineY = 0.5;

function maybeGlitch(dt) {
  // Horizontal band glitch
  if (glitchTimer > 0) {
    glitchTimer -= dt;
    if (glitchTimer <= 0) { glitchActive = 0; glitchTimer = 0; }
  } else {
    const rate = P.GLITCH_RATE + audioHigh * P.GLITCH_RATE_H;
    if (Math.random() < rate * dt) {
      glitchActive = 1;
      glitchTimer  = P.GLITCH_DUR;
      glitchY      = Math.random();
      glitchH      = 0.03 + Math.random() * 0.07;
      glitchOff    = (Math.random() - 0.5) * 0.05;
    }
  }
  // Particle scanline alignment event (rarer, longer)
  if (scanlineTimer > 0) {
    scanlineTimer -= dt;
    // ease in/out of the alignment over its lifetime
    const life = 1.4;
    const k = Math.max(0, scanlineTimer / life);
    scanline = Math.sin(k * Math.PI) * 0.9;
    if (scanlineTimer <= 0) { scanline = 0; scanlineTimer = 0; }
  } else if (Math.random() < (0.07 + audioHigh * 0.4) * dt) {
    scanlineTimer = 1.4;
    scanlineY     = 0.25 + Math.random() * 0.5;
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────
const heroEl  = document.querySelector('.hero');
const videoEl = document.querySelector('.hero-video');

// ─── WEBGL ────────────────────────────────────────────────────────────────
let canvasEl, renderer, gl, program, mesh, videoTexture;
let particleMesh, particleProgram, particleGeo;
let videoUvTransform = [1, 1, 0, 0];  // [sx, sy, ox, oy]
let dpr = 1;

// Canvas bridge — OGL checks image.width which is 0 on HTMLVideoElement;
// drawing to a 2D canvas gives a proper .width value OGL can rely on.
const vidCanvas = document.createElement('canvas');
let   vidCtx    = null;

function computeVideoUV() {
  if (!videoEl || !canvasEl) return;
  const vw = videoEl.videoWidth  || 1920;
  const vh = videoEl.videoHeight || 1080;
  const cw = canvasEl.offsetWidth  || window.innerWidth;
  const ch = canvasEl.offsetHeight || window.innerHeight;
  const vAR = vw / vh, cAR = cw / ch;
  let sx = 1, sy = 1, ox = 0, oy = 0;
  if (vAR > cAR) { sx = cAR / vAR; ox = (1 - sx) * 0.5; }
  else           { sy = vAR / cAR; oy = (1 - sy) * 0.5; }
  videoUvTransform = [sx, sy, ox, oy];
  if (program)         program.uniforms.uVideoUV.value = videoUvTransform;
  if (particleProgram) particleProgram.uniforms.uVideoUV.value = videoUvTransform;
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer?.setSize(w, h);
  computeVideoUV();
}

// ─── Init WebGL ───────────────────────────────────────────────────────────
function initWebGL() {
  try {
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'heroShaderCanvas';
    canvasEl.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:1',
    ].join(';');
    heroEl.insertBefore(canvasEl, heroEl.children[1] || null);

    dpr = Math.min(window.devicePixelRatio, 2);
    renderer = new Renderer({ canvas: canvasEl, alpha: false, antialias: false, dpr });
    gl = renderer.gl;
    renderer.autoClear = false;   // we draw video (opaque) then particles (additive)

    resize();
    window.addEventListener('resize', debounce(resize, 200));

    videoTexture = new Texture(gl, {
      generateMipmaps: false,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });

    const geo = new Triangle(gl);
    program   = new Program(gl, {
      vertex: VERT, fragment: FRAG,
      uniforms: {
        tVideo:          { value: videoTexture },
        uTime:           { value: 0 },
        uActive:         { value: 0 },
        uMouse:          { value: [0.5, 0.5] },
        uMouseVel:       { value: 0 },
        uAudio:          { value: 0 },
        uBass:           { value: 0 },
        uHigh:           { value: 0 },
        uGlitch:         { value: 0 },
        uGlitchY:        { value: 0.5 },
        uGlitchH:        { value: 0.04 },
        uGlitchOff:      { value: 0 },
        uVideoUV:        { value: [1, 1, 0, 0] },
        uShadowColor:    { value: P.SHADOW_COLOR },
        uHighlightColor: { value: P.HIGHLIGHT_COLOR },
        uDuotoneMix:     { value: P.DUOTONE_MIX },
        uDispBase:       { value: P.DISP_BASE },
        uDispPointer:    { value: P.DISP_POINTER },
        uDispBass:       { value: P.DISP_BASS },
        uFlareBase:      { value: P.FLARE_BASE },
        uFlarePointer:   { value: P.FLARE_POINTER },
        uFlareAudio:     { value: P.FLARE_AUDIO },
        uFlareClamp:     { value: P.FLARE_CLAMP },
        uChromaBase:     { value: P.CHROMA_BASE },
        uChromaVel:      { value: P.CHROMA_VEL },
        uChromaHigh:     { value: P.CHROMA_HIGH },
      },
    });

    mesh = new Mesh(gl, { geometry: geo, program });
    return true;
  } catch(e) {
    console.warn('[mikihoo-hero] WebGL failed, falling back to plain video', e);
    return false;
  }
}

// ─── Particle system ──────────────────────────────────────────────────────
let liveCount = 0;

function initParticles() {
  const N    = particleCount();
  const uvs  = new Float32Array(N * 2);
  const spds = new Float32Array(N);
  const rnd  = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    uvs[i*2]   = Math.random();
    uvs[i*2+1] = Math.random();
    spds[i]    = 0.4 + Math.random() * 0.8;
    rnd[i]     = Math.random();
  }
  particleGeo = new Geometry(gl, {
    aUV:    { size: 2, data: uvs },
    aSpeed: { size: 1, data: spds },
    aRand:  { size: 1, data: rnd },
  });
  liveCount = N;
  particleGeo.setDrawRange?.(0, N);
  if (particleGeo.drawRange) particleGeo.drawRange.count = N;

  particleProgram = new Program(gl, {
    vertex: PART_VERT, fragment: PART_FRAG,
    uniforms: {
      tVideo:          { value: videoTexture },
      uTime:           { value: 0 },
      uActive:         { value: 0 },
      uMouse:          { value: [0.5, 0.5] },
      uMouseVel:       { value: 0 },
      uBass:           { value: 0 },
      uHigh:           { value: 0 },
      uVideoUV:        { value: [1, 1, 0, 0] },
      uPointSize:      { value: P.PART_SIZE },
      uDpr:            { value: dpr },
      uDrift:          { value: REDUCED ? P.PART_DRIFT * 0.25 : P.PART_DRIFT },
      uRepel:          { value: P.PART_REPEL },
      uRepelR:         { value: P.PART_REPEL_R },
      uBassScat:       { value: P.PART_BASS_SCAT },
      uGlitchFrac:     { value: REDUCED ? 0 : P.PART_GLITCH_FRAC },
      uGlitchAmp:      { value: P.PART_GLITCH_AMP },
      uScanline:       { value: 0 },
      uScanlineY:      { value: 0.5 },
      uAlpha:          { value: P.PART_ALPHA },
      uShadowColor:    { value: P.SHADOW_COLOR },
      uHighlightColor: { value: P.HIGHLIGHT_COLOR },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  // Additive blending (light-like accumulation over the video)
  particleProgram.setBlendFunc(gl.SRC_ALPHA, gl.ONE);

  particleMesh = new Mesh(gl, { geometry: particleGeo, program: particleProgram,
                                 mode: gl.POINTS });
}

// ─── FPS monitor → step particle count down if struggling ──────────────────
let fpsAccum = 0, fpsFrames = 0, fpsReduced = false;
function monitorFPS(dt) {
  if (fpsReduced || !particleGeo) return;
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 2.0) {                 // sample over 2s
    const fps = fpsFrames / fpsAccum;
    if (fps < 30 && liveCount > 4000) {
      liveCount = Math.floor(liveCount * 0.6);
      if (particleGeo.drawRange) particleGeo.drawRange.count = liveCount;
      particleGeo.setDrawRange?.(0, liveCount);
    } else {
      fpsReduced = true;                 // stable, stop watching
    }
    fpsAccum = 0; fpsFrames = 0;
  }
}

// ─── Render loop ──────────────────────────────────────────────────────────
let rafId = null, lastTs = null, elapsed = 0;

function tick(ts) {
  rafId = requestAnimationFrame(tick);
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0.016;
  lastTs   = ts;
  elapsed += dt;

  // Active eases up automatically on load (no entry gate)
  if (!REDUCED) activeEase = Math.min(1, activeEase + dt / P.ACTIVE_EASE_DUR);
  else          activeEase = 0.6;
  if (state === STATE.MIC && !REDUCED)
    audioEase = Math.min(1, audioEase + dt / P.AUDIO_EASE_DUR);

  updateAudio();
  if (!REDUCED) maybeGlitch(dt);
  monitorFPS(dt);

  // Smooth mouse
  smMouse.x  += (rawMouse.x - smMouse.x) * P.MOUSE_INERTIA;
  smMouse.y  += (rawMouse.y - smMouse.y) * P.MOUSE_INERTIA;
  mouseVelSm  = mouseVelSm * 0.84 + mouseVelRaw * 0.16;
  mouseVelRaw *= 0.78;
  const mvel  = Math.min(mouseVelSm * 50, 1);

  // Upload video frame via canvas bridge
  if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (vidCanvas.width !== vw || vidCanvas.height !== vh) {
      vidCanvas.width = vw; vidCanvas.height = vh;
      vidCtx = vidCanvas.getContext('2d');
      computeVideoUV();
    }
    vidCtx.drawImage(videoEl, 0, 0, vw, vh);
    videoTexture.image = vidCanvas;
    videoTexture.needsUpdate = true;
  }

  // Main shader uniforms
  const u = program.uniforms;
  u.uTime.value     = elapsed;
  u.uActive.value   = activeEase;
  u.uMouse.value    = [smMouse.x, smMouse.y];
  u.uMouseVel.value = mvel;
  u.uAudio.value    = audioLevel * audioEase;
  u.uBass.value     = audioBass  * audioEase;
  u.uHigh.value     = audioHigh  * audioEase;
  u.uGlitch.value   = glitchActive;
  u.uGlitchY.value  = glitchY;
  u.uGlitchH.value  = glitchH;
  u.uGlitchOff.value = glitchOff;
  u.uVideoUV.value  = videoUvTransform;

  // Draw opaque video shader (covers whole screen — no clear needed)
  renderer.render({ scene: mesh });

  // Draw particles additively on top
  if (particleMesh) {
    const pu = particleProgram.uniforms;
    pu.uTime.value     = elapsed;
    pu.uActive.value   = activeEase;
    pu.uMouse.value    = [smMouse.x, smMouse.y];
    pu.uMouseVel.value = mvel;
    pu.uBass.value     = audioBass * audioEase;
    pu.uHigh.value     = audioHigh * audioEase;
    pu.uVideoUV.value  = videoUvTransform;
    pu.uScanline.value = scanline;
    pu.uScanlineY.value = scanlineY;
    renderer.render({ scene: particleMesh });
  }
}

// ─── Visibility: pause when tab hidden ───────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    rafId = null;
    videoEl?.pause();
  } else if (!rafId) {
    lastTs = null;
    rafId  = requestAnimationFrame(tick);
    videoEl?.play().catch(() => {});
  }
});

// ─── Cleanup on unload ────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(rafId);
  audioStream?.getTracks().forEach(t => t.stop());
});

// ─── Entry point ─────────────────────────────────────────────────────────
function init() {
  if (!initWebGL()) return;   // fall back to plain video element

  videoEl.style.opacity = '0';   // hide raw video; shader is the visible layer
  videoEl.play().catch(e => console.warn('[mikihoo-hero] video play failed', e));

  if (P.PARTICLES) {
    try { initParticles(); }
    catch(e) { console.warn('[mikihoo-hero] particles failed', e); }
  }

  rafId = requestAnimationFrame(tick);

  videoEl.addEventListener('loadedmetadata', computeVideoUV, { once: true });
  if (videoEl.videoWidth) computeVideoUV();

  // Whole hero area is the silent mic trigger
  heroEl.addEventListener('click', () => { initAudio(); });
  heroEl.addEventListener('touchend', () => { initAudio(); }, { passive: true });
}

init();
