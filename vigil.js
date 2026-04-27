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
        <button class="map-overlay-close" aria-label="Close map">×</button>
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
    const img = overlay.querySelector('.map-overlay-image');
    let scale = 1, tx = 0, ty = 0;

    function paint() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    paint();

    function frameCenter() {
      const r = frame.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }

    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      const next = Math.max(1, Math.min(8, scale * factor));
      if (next === scale) return;
      const [cxI, cyI] = frameCenter();
      const dx = e.clientX - cxI;
      const dy = e.clientY - cyI;
      const R = next / scale;
      tx = dx * (1 - R) + tx * R;
      ty = dy * (1 - R) + ty * R;
      scale = next;
      paint();
    }, { passive: false });

    let dragging = false, dragX = 0, dragY = 0;
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-overlay-close')) return;
      dragging = true;
      dragX = e.clientX; dragY = e.clientY;
      overlay.classList.add('dragging');
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    });
    overlay.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      tx += e.clientX - dragX;
      ty += e.clientY - dragY;
      dragX = e.clientX; dragY = e.clientY;
      paint();
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      overlay.classList.remove('dragging');
      try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    overlay.addEventListener('pointerup', stop);
    overlay.addEventListener('pointercancel', stop);

    overlay.addEventListener('dblclick', (e) => {
      if (e.target.closest('.map-overlay-close')) return;
      const [cxI, cyI] = frameCenter();
      const dx = e.clientX - cxI;
      const dy = e.clientY - cyI;
      let next;
      if (scale < 2.5) next = 3;
      else { tx = 0; ty = 0; scale = 1; paint(); return; }
      const R = next / scale;
      tx = dx * (1 - R) + tx * R;
      ty = dy * (1 - R) + ty * R;
      scale = next;
      img.style.transition = 'transform 0.28s ease';
      paint();
      setTimeout(() => { img.style.transition = ''; }, 320);
    });
  }

  // ── boot ────────────────────────────────────────────────────────────
  function boot() {
    injectClock();
    injectVeil();
    injectBellRope();
    injectMapExpander();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
