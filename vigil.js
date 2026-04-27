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

  // ── boot ────────────────────────────────────────────────────────────
  function boot() {
    injectClock();
    injectVeil();
    injectBellRope();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
