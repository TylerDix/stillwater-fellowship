/* ──────────────────────────────────────────────
   The Vigil
   Time-of-day theming, lamps-out cursor, the five bells.
   Self-contained; no dependencies; deferred from <script>.
   ────────────────────────────────────────────── */

(function () {
  'use strict';

  const BANDS = ['rising', 'morning', 'midday', 'supper', 'lampsout'];
  const BELL_TIMES = [[5, 0], [6, 30], [12, 0], [18, 0], [21, 0]];

  // Allow ?vigil=lampsout (etc.) as an override for demo / testing.
  const params = new URLSearchParams(location.search);
  const override = params.get('vigil');
  const FORCED = BANDS.includes(override) ? override : null;

  function currentBand(now = new Date()) {
    if (FORCED) return FORCED;
    const m = now.getHours() * 60 + now.getMinutes();
    if (m >= 300 && m < 390)  return 'rising';     // 05:00–06:30
    if (m >= 390 && m < 720)  return 'morning';    // 06:30–12:00
    if (m >= 720 && m < 1080) return 'midday';     // 12:00–18:00
    if (m >= 1080 && m < 1260) return 'supper';    // 18:00–21:00
    return 'lampsout';                             // 21:00–05:00
  }

  function fmtClock(now = new Date()) {
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // ── 1. Time-of-day attribute on <html> ──────────────────────────────
  function setBand() {
    document.documentElement.setAttribute('data-timeofday', currentBand());
  }
  setBand();
  setInterval(setBand, 30 * 1000);

  // ── 2. "the bells say it is HH:MM" — appended into footer fineprint ─
  function injectClock() {
    const fineprint = document.querySelector('.footer-fineprint');
    const span = document.createElement('span');
    span.className = 'bells-time';
    span.setAttribute('aria-live', 'polite');
    span.textContent = ` · the bells say it is ${fmtClock()}`;
    if (fineprint) {
      fineprint.appendChild(span);
    } else {
      const fallback = document.createElement('p');
      fallback.className = 'bells-time bells-time-fallback';
      fallback.textContent = `the bells say it is ${fmtClock()}`;
      document.body.appendChild(fallback);
    }
    setInterval(() => {
      span.textContent = ` · the bells say it is ${fmtClock()}`;
      const fb = document.querySelector('.bells-time-fallback');
      if (fb) fb.textContent = `the bells say it is ${fmtClock()}`;
    }, 30 * 1000);
  }

  // ── 3. Lamps-out veil with a cursor-tracked light pool ──────────────
  function injectVeil() {
    const veil = document.createElement('div');
    veil.className = 'lamps-out-veil';
    veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(veil);

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let pending = false;

    function paint() {
      pending = false;
      veil.style.setProperty('--mx', mx + 'px');
      veil.style.setProperty('--my', my + 'px');
    }
    window.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(paint);
      }
    }, { passive: true });

    // Touch users: brief pulse around the touch.
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!t) return;
      mx = t.clientX;
      my = t.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(paint);
      }
    }, { passive: true });
  }

  // ── 4. The bell rope, the audio context, the bells ──────────────────
  let audioCtx = null;
  let audioReady = false;
  let nextBellTimer = null;

  function ringBell(when = 0, intensity = 1) {
    if (!audioReady) return;
    const t0 = audioCtx.currentTime + when;
    const partials = [
      { f: 261.63,           g: 0.9 * intensity, d: 3.4 },  // fundamental ~C4
      { f: 261.63 * 2.0,     g: 0.4 * intensity, d: 2.6 },
      { f: 261.63 * 2.76,    g: 0.55 * intensity, d: 2.2 }, // strike tone
      { f: 261.63 * 5.4,     g: 0.32 * intensity, d: 1.4 },
      { f: 261.63 * 8.93,    g: 0.18 * intensity, d: 0.8 },
    ];
    const master = audioCtx.createGain();
    master.gain.value = 0.22;
    master.connect(audioCtx.destination);
    partials.forEach(p => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.f;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(p.g, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.d);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + p.d + 0.05);
    });
  }

  function msUntilNextBell(now = new Date()) {
    for (const [h, m] of BELL_TIMES) {
      const c = new Date(now);
      c.setHours(h, m, 0, 0);
      if (c > now) return { ms: c - now, when: c };
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return { ms: tomorrow - now, when: tomorrow };
  }

  function scheduleNextBell() {
    if (nextBellTimer) clearTimeout(nextBellTimer);
    const { ms } = msUntilNextBell();
    nextBellTimer = setTimeout(() => {
      ringBell(0, 1);
      // 21:00 specifically: a single long final bell, no repeat call needed.
      scheduleNextBell();
    }, ms);
  }

  function activateAudio() {
    if (audioReady) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioReady = true;
    document.documentElement.setAttribute('data-bells', 'rung');
    ringBell(0.05, 0.9);            // acknowledgement chime
    scheduleNextBell();
  }

  function injectBellRope() {
    const rope = document.createElement('button');
    rope.type = 'button';
    rope.className = 'bell-rope';
    rope.setAttribute('aria-label', 'pull the bell rope to permit ambient sound');
    rope.innerHTML = `
      <svg viewBox="0 0 24 84" aria-hidden="true">
        <line class="rope-cord" x1="12" y1="0" x2="12" y2="56"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <ellipse class="rope-knot" cx="12" cy="60" rx="4" ry="5.5" fill="currentColor"/>
        <g class="rope-tassel" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
          <line x1="8"  y1="65" x2="7"  y2="80"/>
          <line x1="10" y1="65" x2="10" y2="82"/>
          <line x1="12" y1="65" x2="12" y2="83"/>
          <line x1="14" y1="65" x2="14" y2="82"/>
          <line x1="16" y1="65" x2="17" y2="80"/>
        </g>
      </svg>
    `;
    rope.addEventListener('click', () => {
      if (!audioReady) {
        activateAudio();
      } else {
        // Subsequent pulls just ring the bell again — the easter egg.
        ringBell(0, 0.85);
      }
    });
    document.body.appendChild(rope);
  }

  // ── 5. Fullscreen parchment map (View Transitions API) ──────────────
  function findMapFigure() {
    const imgs = document.querySelectorAll('figure.featured-photo img');
    for (const img of imgs) {
      if (/map\.png(\?|$)/.test(img.getAttribute('src') || '')) {
        return img.closest('figure.featured-photo');
      }
    }
    return null;
  }

  function injectMapExpander() {
    const figure = findMapFigure();
    if (!figure) return;
    figure.classList.add('map-expandable');
    figure.setAttribute('role', 'button');
    figure.setAttribute('tabindex', '0');
    figure.setAttribute('aria-label',
      'Expand the site plan to a fullscreen pan-and-zoom view');

    const open = () => expandMap(figure);
    figure.addEventListener('click', open);
    figure.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  function expandMap(figure) {
    const apply = () => {
      figure.style.viewTransitionName = '';
      showMapOverlay(figure);
    };
    figure.style.viewTransitionName = 'site-map';
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  function showMapOverlay(sourceFigure) {
    document.documentElement.classList.add('map-open');
    const sourceImg = sourceFigure.querySelector('img');
    const overlay = document.createElement('div');
    overlay.className = 'map-overlay';
    overlay.innerHTML = `
      <div class="map-overlay-frame" style="view-transition-name: site-map;">
        <img class="map-overlay-image" draggable="false"
             src="${sourceImg.getAttribute('src')}"
             alt="${sourceImg.getAttribute('alt') || ''}">
      </div>
      <div class="map-overlay-controls">
        <button class="map-overlay-close" aria-label="Close map"></button>
      </div>
      <p class="map-overlay-hint">scroll to zoom · drag to pan · double-click to zoom · esc to close</p>
    `;
    document.body.appendChild(overlay);

    const close = () => closeMap(sourceFigure, overlay, escListener);
    function escListener(e) { if (e.key === 'Escape') close(); }
    overlay.querySelector('.map-overlay-close').addEventListener('click', close);
    document.addEventListener('keydown', escListener);

    setupPanZoom(overlay);
  }

  function closeMap(sourceFigure, overlay, escListener) {
    document.removeEventListener('keydown', escListener);
    document.documentElement.classList.remove('map-open');
    const apply = () => {
      overlay.remove();
      sourceFigure.style.viewTransitionName = 'site-map';
    };
    if (document.startViewTransition) {
      const t = document.startViewTransition(apply);
      t.finished.then(() => { sourceFigure.style.viewTransitionName = ''; });
    } else {
      overlay.remove();
    }
  }

  function setupPanZoom(overlay) {
    const frame = overlay.querySelector('.map-overlay-frame');
    const img   = overlay.querySelector('.map-overlay-image');
    let scale = 1, tx = 0, ty = 0;

    function paint() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    paint();

    function frameCenter() {
      const r = frame.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }

    // Zoom toward (cx, cy) in viewport coords, to absolute newScale.
    function zoomTo(cx, cy, newScale) {
      newScale = Math.max(1, Math.min(8, newScale));
      if (newScale === scale) return;
      const [cxI, cyI] = frameCenter();
      const dx = cx - cxI;
      const dy = cy - cyI;
      const R = newScale / scale;
      tx = dx * (1 - R) + tx * R;
      ty = dy * (1 - R) + ty * R;
      scale = newScale;
      paint();
    }

    // Mouse wheel — desktop only.
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      zoomTo(e.clientX, e.clientY, scale * factor);
    }, { passive: false });

    // Multi-touch via Pointer Events: 1 finger pans, 2 fingers pinch-zoom.
    const pointers = new Map();
    let pinch = null;

    overlay.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-overlay-close')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      overlay.classList.add('dragging');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          cx:   (a.x + b.x) / 2,
          cy:   (a.y + b.y) / 2,
          startScale: scale,
        };
      }
    });

    overlay.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const newDist = Math.hypot(b.x - a.x, b.y - a.y);
        zoomTo(pinch.cx, pinch.cy, pinch.startScale * (newDist / pinch.dist));
      } else if (pointers.size === 1) {
        tx += e.clientX - prev.x;
        ty += e.clientY - prev.y;
        paint();
      }
    });

    const releasePointer = (e) => {
      pointers.delete(e.pointerId);
      try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
      if (pointers.size === 0) overlay.classList.remove('dragging');
      if (pointers.size < 2)   pinch = null;
    };
    overlay.addEventListener('pointerup',     releasePointer);
    overlay.addEventListener('pointercancel', releasePointer);
    overlay.addEventListener('pointerleave',  releasePointer);

    overlay.addEventListener('dblclick', (e) => {
      if (e.target.closest('.map-overlay-close')) return;
      img.style.transition = 'transform 0.28s ease';
      if (scale < 2.5) {
        zoomTo(e.clientX, e.clientY, 3);
      } else {
        tx = 0; ty = 0; scale = 1; paint();
      }
      setTimeout(() => { img.style.transition = ''; }, 320);
    });
  }

  // ── 6. WebGL parchment shader ───────────────────────────────────────
  function injectShader() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 480) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'vigil-shader';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);

    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false
    });
    if (!gl) { canvas.remove(); return; }

    const vsrc = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

    const fsrc = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_band;
out vec4 fragColor;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 fc = uv * u_resolution;

  // Slowly drifting parchment grain
  vec2 gp = fc * 0.014 + vec2(u_time * 0.013, u_time * 0.04);
  float grain = fbm(gp);

  // Warm light pool follows the (smoothed) mouse
  vec2 d = uv - u_mouse;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  float pool = exp(-dist * 2.4) * 0.7;

  // Time-of-day light color
  vec3 light;
  if      (u_band < 0.5) light = vec3(0.62, 0.74, 0.96); // rising  — cool dawn
  else if (u_band < 1.5) light = vec3(0.98, 0.92, 0.78); // morning — soft warm
  else if (u_band < 2.5) light = vec3(1.00, 0.96, 0.82); // midday
  else if (u_band < 3.5) light = vec3(1.00, 0.72, 0.42); // supper  — amber
  else                   light = vec3(1.00, 0.55, 0.24); // lampsout — candle

  float alpha = pool * 0.30 + grain * 0.045;
  alpha = clamp(alpha, 0.0, 1.0);

  fragColor = vec4(light * alpha, alpha); // premultiplied
}`;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('vigil shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }
    const vs = compile(gl.VERTEX_SHADER, vsrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) { canvas.remove(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('vigil program:', gl.getProgramInfoLog(prog));
      canvas.remove(); return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uRes   = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uBand  = gl.getUniformLocation(prog, 'u_band');

    let mouseX = 0.5, mouseY = 0.5;
    let targetX = 0.5, targetY = 0.5;
    window.addEventListener('mousemove', (e) => {
      targetX = e.clientX / window.innerWidth;
      targetY = 1.0 - e.clientY / window.innerHeight; // flip Y for GL
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0]; if (!t) return;
      targetX = t.clientX / window.innerWidth;
      targetY = 1.0 - t.clientY / window.innerHeight;
    }, { passive: true });

    function bandIndex() {
      return BANDS.indexOf(currentBand());
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

    const t0 = performance.now();
    function frame() {
      const t = (performance.now() - t0) / 1000;
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;
      gl.useProgram(prog);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform1f(uBand, bandIndex());
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    }
    frame();
  }

  // ── 7. Typewriter form (apply.html) ─────────────────────────────────
  function injectTypewriter() {
    const form = document.querySelector('.apply-form');
    if (!form) return;
    form.classList.add('typewriter-form');

    // Cache one buffer of decaying noise; reuse it for clicks.
    let clickBuffer = null;
    function buildClickBuffer() {
      if (!audioCtx || clickBuffer) return;
      const dur = 0.05;
      const sr = audioCtx.sampleRate;
      const buf = audioCtx.createBuffer(1, Math.floor(sr * dur), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.008));
      }
      clickBuffer = buf;
    }

    function playClick(volume = 1) {
      if (!audioReady) return;
      buildClickBuffer();
      const src = audioCtx.createBufferSource();
      src.buffer = clickBuffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1700 + Math.random() * 700;
      filter.Q.value = 1.6;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.10 * volume;
      src.connect(filter).connect(gain).connect(audioCtx.destination);
      src.start();
    }

    function playDing() {
      if (!audioReady) return;
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1180;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.10, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.6);
    }

    function playStamp() {
      if (!audioReady) return;
      const t0 = audioCtx.currentTime;
      // Low thud
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, t0);
      osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.18);
      const og = audioCtx.createGain();
      og.gain.setValueAtTime(0.35, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(og).connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.5);
      // Paper crinkle
      const noise = audioCtx.createBufferSource();
      const sr = audioCtx.sampleRate;
      const buf = audioCtx.createBuffer(1, Math.floor(sr * 0.12), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.04));
      }
      noise.buffer = buf;
      const ng = audioCtx.createGain();
      ng.gain.value = 0.16;
      noise.connect(ng).connect(audioCtx.destination);
      noise.start();
    }

    form.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (e.key === 'Tab' || e.key.startsWith('Arrow') ||
          e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' ||
          e.key === 'Alt' || e.key === 'CapsLock') return;
      if (e.key === 'Enter') { playDing(); return; }
      playClick(0.95 + Math.random() * 0.15);
    });

    let lastFocused = null;
    form.addEventListener('focusin', (e) => {
      if (e.target.matches('input, textarea, select')) {
        if (lastFocused && lastFocused !== e.target) playDing();
        lastFocused = e.target;
      }
    });

    form.addEventListener('submit', () => {
      document.documentElement.classList.add('letter-sealing');
      if (audioReady) {
        // A staccato of last keys, then the stamp.
        for (let i = 0; i < 5; i++) setTimeout(() => playClick(1.2), i * 65);
        setTimeout(playStamp, 460);
      }
      setTimeout(() => {
        document.documentElement.classList.remove('letter-sealing');
      }, 2200);
    });
  }

  // ── 8. Drifting dust particles ──────────────────────────────────────
  function injectDust() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 480) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'vigil-dust';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 32;
    const particles = [];
    function spawn(reset) {
      const w = window.innerWidth, h = window.innerHeight;
      return {
        x: Math.random() * w,
        y: reset ? h + Math.random() * 60 : Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -0.12 - Math.random() * 0.22,
        r:  0.5 + Math.random() * 1.7,
        a:  0.07 + Math.random() * 0.18,
        drift: Math.random() * Math.PI * 2,
      };
    }
    for (let i = 0; i < COUNT; i++) particles.push(spawn(false));

    function bandColor() {
      switch (currentBand()) {
        case 'rising':   return '160, 168, 195';
        case 'morning':  return '180, 160, 110';
        case 'midday':   return '188, 168, 116';
        case 'supper':   return '212, 148, 72';
        case 'lampsout': return '232, 158, 78';
        default:         return '180, 160, 110';
      }
    }

    let lastT = performance.now();
    function frame() {
      const now = performance.now();
      const dt = Math.min(50, now - lastT);
      lastT = now;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      const c = bandColor();
      for (const p of particles) {
        p.drift += dt * 0.0006;
        const dx = Math.sin(p.drift) * 0.35;
        p.x += (p.vx + dx) * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        if (p.y < -10 || p.x < -10 || p.x > w + 10) {
          Object.assign(p, spawn(true));
        }
        ctx.fillStyle = `rgba(${c}, ${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    frame();
  }

  // ── boot ────────────────────────────────────────────────────────────
  function boot() {
    injectShader();
    injectDust();
    injectClock();
    injectVeil();
    injectBellRope();
    injectMapExpander();
    injectTypewriter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
