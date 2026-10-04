'use strict';

(() => {
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'gluecksrad.state.v1';
  const MIN_ITEMS = 2;
  const MAX_ITEMS = 30;
  const MAX_LABEL = 40;
  const DURATIONS = [3000, 5000, 8000];
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
  const PALETTE = [
    '#ff6b6b', '#ffa94d', '#ffd43b', '#8ce99a', '#38d9a9',
    '#4dabf7', '#91a7ff', '#da77f2', '#f783ac', '#c0eb75',
  ];

  // ---------- Randomness (crypto-grade, unbiased) ----------

  function randomUint32() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }

  function random() {
    return randomUint32() / 4294967296;
  }

  // Uniform integer in [0, n) using rejection sampling to avoid modulo bias.
  function randomInt(n) {
    const limit = 4294967296 - (4294967296 % n);
    let x;
    do {
      x = randomUint32();
    } while (x >= limit);
    return x % n;
  }

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  // ---------- State ----------

  function uid() {
    return Date.now().toString(36) + randomUint32().toString(36);
  }

  function defaultLabel(i) {
    return `Option ${i + 1}`;
  }

  function defaultState() {
    return {
      activeId: 'essen',
      wheels: [
        { id: 'essen', name: 'Was essen wir?', items: ['Pizza', 'Sushi', 'Burger', 'Pasta', 'Curry', 'Selbst kochen'], eliminated: [] },
        { id: 'janein', name: 'Ja oder Nein?', items: ['Ja', 'Nein'], eliminated: [] },
        { id: 'wer', name: 'Wer ist dran?', items: ['Ich', 'Du'], eliminated: [] },
      ],
      settings: { sound: true, haptics: true, removeWinner: false, duration: 5000 },
    };
  }

  function sanitizeWheel(w, seenIds) {
    if (!w || typeof w !== 'object' || !Array.isArray(w.items)) return null;
    const items = w.items.slice(0, MAX_ITEMS).map((x) => String(x ?? '').slice(0, MAX_LABEL));
    while (items.length < MIN_ITEMS) items.push('');
    let id = typeof w.id === 'string' && w.id ? w.id : uid();
    while (seenIds.has(id)) id = uid();
    seenIds.add(id);
    let eliminated = Array.isArray(w.eliminated)
      ? [...new Set(w.eliminated.filter((i) => Number.isInteger(i) && i >= 0 && i < items.length))]
      : [];
    if (eliminated.length >= items.length) eliminated = [];
    const name = String(w.name ?? '').slice(0, MAX_LABEL) || 'Glücksrad';
    return { id, name, items, eliminated };
  }

  function sanitize(raw) {
    const fallback = defaultState();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.wheels)) return fallback;
    const seen = new Set();
    const wheels = raw.wheels.map((w) => sanitizeWheel(w, seen)).filter(Boolean);
    if (!wheels.length) return fallback;
    const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const settings = {
      sound: typeof s.sound === 'boolean' ? s.sound : fallback.settings.sound,
      haptics: typeof s.haptics === 'boolean' ? s.haptics : fallback.settings.haptics,
      removeWinner: typeof s.removeWinner === 'boolean' ? s.removeWinner : fallback.settings.removeWinner,
      duration: DURATIONS.includes(s.duration) ? s.duration : fallback.settings.duration,
    };
    const activeId = wheels.some((w) => w.id === raw.activeId) ? raw.activeId : wheels[0].id;
    return { activeId, wheels, settings };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : defaultState();
    } catch {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: keep working in memory */
    }
  }

  const state = load();

  function activeWheel() {
    return state.wheels.find((w) => w.id === state.activeId) || state.wheels[0];
  }

  function labelOf(wheel, i) {
    const text = (wheel.items[i] ?? '').trim();
    return text || defaultLabel(i);
  }

  // Indices of items currently on the wheel (respects "remove winner" mode).
  function visibleIndices(wheel) {
    const out = new Set(wheel.eliminated);
    return wheel.items.map((_, i) => i).filter((i) => !out.has(i));
  }

  function colorFor(i, n) {
    const L = PALETTE.length;
    let c = i % L;
    // Avoid the last slice having the same colour as the first one.
    if (n > 1 && i === n - 1 && c === 0) c = Math.floor(L / 2);
    return PALETTE[c];
  }

  function textColorFor(hex) {
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 255;
    const g = (v >> 8) & 255;
    const b = v & 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 120 ? '#1d1726' : '#ffffff';
  }

  // ---------- DOM ----------

  const $ = (id) => document.getElementById(id);
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const pointer = $('pointer');
  const hubBtn = $('hubBtn');
  const spinBtn = $('spinBtn');
  const editBtn = $('editBtn');
  const wheelSelect = $('wheelSelect');
  const resultEl = $('result');
  const elimBar = $('elimBar');
  const elimText = $('elimText');
  const elimReset = $('elimReset');

  const editor = $('editor');
  const wheelName = $('wheelName');
  const countInput = $('countInput');
  const countMinus = $('countMinus');
  const countPlus = $('countPlus');
  const itemList = $('itemList');
  const addItem = $('addItem');
  const shuffleItems = $('shuffleItems');
  const optRemove = $('optRemove');
  const optSound = $('optSound');
  const optHaptics = $('optHaptics');
  const optHapticsRow = $('optHapticsRow');
  const optDuration = $('optDuration');
  const newWheel = $('newWheel');
  const dupWheel = $('dupWheel');
  const delWheel = $('delWheel');

  const overlay = $('winnerOverlay');
  const winnerLabel = $('winnerLabel');
  const winnerNote = $('winnerNote');
  const winnerCard = overlay.querySelector('.winner-card');
  const okBtn = $('okBtn');
  const againBtn = $('againBtn');
  const confettiCanvas = $('confetti');

  const canVibrate = typeof navigator.vibrate === 'function';
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  let rotation = 0;
  let spinning = false;
  let pendingElimination = null;

  // ---------- Wheel drawing ----------

  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const size = Math.round(stage.clientWidth * dpr);
    if (size > 0 && (canvas.width !== size || canvas.height !== size)) {
      canvas.width = size;
      canvas.height = size;
    }
    drawWheel();
  }

  function drawWheel() {
    const size = canvas.width;
    if (!size) return;
    const wheel = activeWheel();
    const idx = visibleIndices(wheel);
    const n = idx.length;
    const seg = TAU / n;
    const c = size / 2;
    const rimW = size * 0.035;
    const R = c - rimW;
    const dpr = size / Math.max(1, stage.clientWidth);
    const rimColor = getComputedStyle(document.documentElement).getPropertyValue('--rim').trim() || '#2b2340';

    ctx.clearRect(0, 0, size, size);

    // Rim
    ctx.beginPath();
    ctx.arc(c, c, c, 0, TAU);
    ctx.fillStyle = rimColor;
    ctx.fill();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);

    // Slices
    for (let k = 0; k < n; k++) {
      const start = -Math.PI / 2 + k * seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, start, start + seg);
      ctx.closePath();
      ctx.fillStyle = colorFor(idx[k], wheel.items.length);
      ctx.fill();
    }
    if (n > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, size * 0.004);
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + k * seg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
      }
    }

    // Subtle depth shading
    const shade = ctx.createRadialGradient(0, 0, R * 0.25, 0, 0, R);
    shade.addColorStop(0, 'rgba(255,255,255,0.10)');
    shade.addColorStop(0.75, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = shade;
    ctx.fill();

    // Labels
    const fontSize = Math.max(
      11 * dpr,
      Math.min(size * 0.058, 2 * R * 0.45 * Math.sin(Math.min(seg / 2, Math.PI / 2)) * 0.75),
    );
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const outer = R * 0.9;
    const maxWidth = outer - R * 0.25;
    const minFont = 11 * dpr;
    // Vertical room of a slice around the middle of the label.
    const room = n > 1 ? 2 * R * 0.55 * Math.sin(Math.min(seg / 2, Math.PI / 2)) : R;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      ctx.save();
      ctx.rotate(-Math.PI / 2 + (k + 0.5) * seg);
      ctx.fillStyle = textColorFor(colorFor(i, wheel.items.length));
      drawLabel(labelOf(wheel, i), fontSize, minFont, outer, maxWidth, room);
      ctx.restore();
    }

    // Bulbs on the rim
    const bulbs = 24;
    for (let b = 0; b < bulbs; b++) {
      const a = (b / bulbs) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (R + rimW / 2), Math.sin(a) * (R + rimW / 2), rimW * 0.2, 0, TAU);
      ctx.fillStyle = b % 2 ? '#fff4c2' : '#ffffff';
      ctx.fill();
    }

    ctx.restore();
  }

  function setFont(px) {
    ctx.font = `700 ${px}px ${FONT}`;
  }

  // Split at the space that gives the most balanced two lines.
  function splitInTwo(text) {
    let best = null;
    for (let j = 0; j < text.length; j++) {
      if (text[j] !== ' ') continue;
      const a = text.slice(0, j).trim();
      const b = text.slice(j + 1).trim();
      if (!a || !b) continue;
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || w < best.w) best = { a, b, w };
    }
    return best;
  }

  // Draws a label right-aligned at `outer`, shrinking it and, if there is room, wrapping it
  // onto two lines before falling back to an ellipsis.
  function drawLabel(text, fontSize, minFont, outer, maxWidth, room) {
    setFont(fontSize);
    const width = ctx.measureText(text).width;
    if (width <= maxWidth) {
      ctx.fillText(text, outer, 0);
      return;
    }
    const single = Math.max(minFont, (fontSize * maxWidth) / width);
    if (single >= fontSize * 0.75) {
      setFont(single);
      ctx.fillText(fitText(text, maxWidth), outer, 0);
      return;
    }
    const lines = splitInTwo(text);
    if (lines) {
      const two = Math.max(minFont, Math.min(fontSize, (fontSize * maxWidth) / lines.w, room / 2.3));
      if (two >= single) {
        setFont(two);
        ctx.fillText(fitText(lines.a, maxWidth), outer, -two * 0.55);
        ctx.fillText(fitText(lines.b, maxWidth), outer, two * 0.55);
        return;
      }
    }
    setFont(single);
    ctx.fillText(fitText(text, maxWidth), outer, 0);
  }

  // Index (into the visible slices) that sits under the pointer at 12 o'clock.
  function sliceAt(rot, n) {
    return Math.floor(mod(-rot, TAU) / (TAU / n)) % n;
  }

  // ---------- Sound & haptics ----------

  let audioCtx = null;
  let lastTick = 0;

  function ensureAudio() {
    if (!state.settings.sound) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state !== 'running') audioCtx.resume();
    } catch {
      audioCtx = null;
    }
  }

  function tone(freq, start, length, gain, type) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  function tick() {
    const now = performance.now();
    if (now - lastTick < 35) return;
    lastTick = now;
    pointer.animate(
      [{ transform: 'rotate(-20deg)' }, { transform: 'rotate(0deg)' }],
      { duration: 140, easing: 'ease-out' },
    );
    if (state.settings.sound && audioCtx && audioCtx.state === 'running') {
      tone(1200, audioCtx.currentTime, 0.04, 0.15, 'triangle');
    }
  }

  function winFeedback() {
    if (state.settings.sound && audioCtx && audioCtx.state === 'running') {
      const t = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.09, 0.35, 0.16, 'sine'));
    }
    if (state.settings.haptics && canVibrate) navigator.vibrate([40, 60, 40]);
  }

  // ---------- Confetti ----------

  function confetti(colors) {
    if (reducedMotionQuery.matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    confettiCanvas.width = w * dpr;
    confettiCanvas.height = h * dpr;
    const cctx = confettiCanvas.getContext('2d');
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const parts = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 5,
      r: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 0.4,
      s: 6 + Math.random() * 7,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    function frame(now) {
      const t = now - t0;
      cctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.38;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(p.r);
        cctx.globalAlpha = Math.max(0, 1 - t / 2800);
        cctx.fillStyle = p.c;
        cctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        cctx.restore();
      }
      if (t < 2800) requestAnimationFrame(frame);
      else cctx.clearRect(0, 0, w, h);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Spinning ----------

  function setSpinning(on) {
    spinning = on;
    for (const el of [spinBtn, hubBtn, editBtn, wheelSelect, elimReset]) el.disabled = on;
    document.body.classList.toggle('is-spinning', on);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  // `velocity` (rad/ms, sign = direction) comes from a flick; without it the wheel spins clockwise
  // with the usual random strength. Either way the winner is drawn independently of the gesture.
  function spin(velocity) {
    if (spinning || drag || !overlay.hidden || editor.open) return;
    const wheel = activeWheel();
    const idx = visibleIndices(wheel);
    const n = idx.length;
    if (!n) return;
    ensureAudio();

    // Pick the winner first (uniformly at random), then animate to a random spot inside it.
    const winner = randomInt(n);
    const seg = TAU / n;
    const landing = (winner + 0.12 + 0.76 * random()) * seg;
    const reduced = reducedMotionQuery.matches;
    const dir = velocity < 0 ? -1 : 1;
    const speed = Math.abs(velocity || 0);
    const start = rotation;
    let duration = reduced ? 1800 : state.settings.duration * (0.9 + 0.2 * random());
    let turns = reduced ? 2 : 4 + randomInt(3);
    if (speed && !reduced) {
      // easeOut starts at 4 × (distance / duration): pick the distance that keeps the finger's speed.
      turns = Math.max(1, Math.min(12, Math.floor((speed * duration) / 4 / TAU)));
    }
    const distance = turns * TAU + mod(dir * (-landing - start), TAU);
    if (speed && !reduced) {
      const base = state.settings.duration;
      duration = Math.max(0.5 * base, Math.min(1.5 * base, (4 * distance) / speed));
    }
    const end = start + dir * distance;

    setSpinning(true);
    resultEl.textContent = '';
    let lastSlice = sliceAt(start, n);
    const t0 = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      rotation = start + (end - start) * easeOut(t);
      const s = sliceAt(rotation, n);
      if (s !== lastSlice) {
        lastSlice = s;
        tick();
      }
      drawWheel();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        rotation = mod(rotation, TAU);
        setSpinning(false);
        showWinner(idx[sliceAt(rotation, n)]);
      }
    }
    requestAnimationFrame(frame);
  }

  function showWinner(i) {
    const wheel = activeWheel();
    const label = labelOf(wheel, i);
    const color = colorFor(i, wheel.items.length);

    pendingElimination = state.settings.removeWinner ? { wheelId: wheel.id, index: i } : null;
    winnerLabel.textContent = label;
    winnerCard.style.setProperty('--winner-color', color);
    winnerNote.textContent = '';
    if (pendingElimination) {
      const remaining = visibleIndices(wheel).length - 1;
      const rest = visibleIndices(wheel).filter((x) => x !== i);
      winnerNote.textContent = remaining > 1
        ? `Wird für die nächsten Runden entfernt (${remaining} übrig).`
        : remaining === 1
          ? `Als Letztes übrig: ${labelOf(wheel, rest[0])}.`
          : 'Alle waren einmal dran – das Rad startet neu.';
    }

    resultEl.replaceChildren('Ergebnis: ', Object.assign(document.createElement('strong'), { textContent: label }));
    overlay.hidden = false;
    setBackgroundInert(true);
    okBtn.focus();
    winFeedback();
    confetti([color, ...PALETTE]);
  }

  function setBackgroundInert(on) {
    for (const el of document.querySelectorAll('.topbar, .main')) {
      el.inert = on;
      if (on) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
  }

  function closeWinner() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    setBackgroundInert(false);
    if (pendingElimination) {
      const wheel = state.wheels.find((w) => w.id === pendingElimination.wheelId);
      const i = pendingElimination.index;
      if (wheel && i < wheel.items.length && !wheel.eliminated.includes(i)) {
        wheel.eliminated.push(i);
        if (wheel.eliminated.length >= wheel.items.length) wheel.eliminated = [];
        save();
      }
      pendingElimination = null;
      drawWheel();
      renderElimBar();
    }
    spinBtn.focus();
  }

  // ---------- Rendering of controls ----------

  function renderWheelSelect() {
    wheelSelect.replaceChildren(
      ...state.wheels.map((w) => {
        const o = document.createElement('option');
        o.value = w.id;
        o.textContent = w.name;
        return o;
      }),
    );
    wheelSelect.value = activeWheel().id;
  }

  function renderElimBar() {
    const wheel = activeWheel();
    const show = state.settings.removeWinner || wheel.eliminated.length > 0;
    elimBar.hidden = !show;
    if (!show) return;
    const remaining = wheel.items.length - wheel.eliminated.length;
    elimText.textContent = `${remaining} von ${wheel.items.length} noch im Rad`;
    elimReset.hidden = wheel.eliminated.length === 0;
  }

  function renderMain() {
    renderWheelSelect();
    renderElimBar();
    drawWheel();
  }

  // ---------- Editor ----------

  function renderItemList(focusIndex) {
    const wheel = activeWheel();
    const n = wheel.items.length;
    itemList.replaceChildren(
      ...wheel.items.map((text, i) => {
        const li = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = colorFor(i, n);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = text;
        input.placeholder = defaultLabel(i);
        input.maxLength = MAX_LABEL;
        input.autocomplete = 'off';
        input.enterKeyHint = 'next';
        input.setAttribute('aria-label', `Möglichkeit ${i + 1}`);
        input.dataset.index = String(i);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del-btn';
        del.textContent = '✕';
        del.disabled = n <= MIN_ITEMS;
        del.dataset.index = String(i);
        del.setAttribute('aria-label', `Möglichkeit ${i + 1} entfernen`);
        li.append(swatch, input, del);
        return li;
      }),
    );
    countInput.value = String(n);
    countMinus.disabled = n <= MIN_ITEMS;
    countPlus.disabled = n >= MAX_ITEMS;
    addItem.disabled = n >= MAX_ITEMS;
    if (focusIndex != null) {
      const el = itemList.querySelector(`input[data-index="${focusIndex}"]`);
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function renderEditor() {
    const wheel = activeWheel();
    wheelName.value = wheel.name;
    optRemove.checked = state.settings.removeWinner;
    optSound.checked = state.settings.sound;
    optHaptics.checked = state.settings.haptics;
    optHapticsRow.hidden = !canVibrate;
    optDuration.value = String(state.settings.duration);
    delWheel.disabled = state.wheels.length <= 1;
    renderItemList();
  }

  // Called after the list of options changed in a way that shifts indices.
  function itemsChanged(focusIndex) {
    activeWheel().eliminated = [];
    save();
    renderItemList(focusIndex);
    renderElimBar();
    drawWheel();
  }

  function setCount(n) {
    const wheel = activeWheel();
    if (!Number.isFinite(n)) {
      countInput.value = String(wheel.items.length);
      return;
    }
    const target = Math.max(MIN_ITEMS, Math.min(MAX_ITEMS, Math.round(n)));
    if (target === wheel.items.length) {
      countInput.value = String(target);
      return;
    }
    const dropped = wheel.items.slice(target).filter((x) => x.trim()).length;
    if (dropped > 1 && !confirm(`${dropped} ausgefüllte Möglichkeiten werden entfernt. Fortfahren?`)) {
      countInput.value = String(wheel.items.length);
      return;
    }
    while (wheel.items.length < target) wheel.items.push('');
    wheel.items.length = target;
    itemsChanged();
  }

  function openEditor() {
    if (spinning || !overlay.hidden || editor.open) return;
    renderEditor();
    editor.showModal();
  }

  function selectWheel(id) {
    state.activeId = id;
    rotation = 0;
    resultEl.textContent = '';
    save();
    renderMain();
  }

  function addWheel(wheel) {
    state.wheels.push(wheel);
    state.activeId = wheel.id;
    save();
    renderMain();
    renderEditor();
    wheelName.focus();
    wheelName.select();
  }

  // ---------- Drag & flick ----------

  // The wheel follows the finger (or mouse) around its centre. Letting go with enough speed spins it
  // in that direction; a plain tap spins it like the button does.
  const FLICK_MIN = 0.0025; // rad/ms, roughly 0.4 turns per second
  const TAP_SLOP = 8; // px
  let drag = null;

  function pointerAngle(e) {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy), radius: r.width / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (drag || spinning || !overlay.hidden || editor.open) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ensureAudio();
    const p = pointerAngle(e);
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      angle: p.angle,
      moved: false,
      samples: [{ t: e.timeStamp, rot: rotation }],
      slice: sliceAt(rotation, visibleIndices(activeWheel()).length),
    };
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointerAngle(e);
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < TAP_SLOP) return;
    drag.moved = true;
    // Near the centre the angle jumps wildly, so only follow the finger further out.
    if (p.dist > p.radius * 0.12) rotation += mod(p.angle - drag.angle + Math.PI, TAU) - Math.PI;
    drag.angle = p.angle;
    drag.samples.push({ t: e.timeStamp, rot: rotation });
    if (drag.samples.length > 20) drag.samples.shift();
    const s = sliceAt(rotation, visibleIndices(activeWheel()).length);
    if (s !== drag.slice) {
      drag.slice = s;
      tick();
    }
    drawWheel();
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, samples } = drag;
    drag = null;
    canvas.classList.remove('is-dragging');
    if (cancelled) return;
    if (!moved) {
      spin();
      return;
    }
    // Speed over the last ~100 ms of movement; a finger that rested before lifting gives zero.
    const last = samples[samples.length - 1];
    const first = samples.find((s) => last.t - s.t <= 100);
    const velocity = e.timeStamp - last.t > 60 ? 0 : (last.rot - first.rot) / Math.max(16, last.t - first.t);
    if (Math.abs(velocity) >= FLICK_MIN) spin(velocity);
    else rotation = mod(rotation, TAU);
  }

  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---------- Events ----------

  spinBtn.addEventListener('click', () => spin());
  hubBtn.addEventListener('click', () => spin());
  editBtn.addEventListener('click', openEditor);
  wheelSelect.addEventListener('change', () => selectWheel(wheelSelect.value));
  okBtn.addEventListener('click', closeWinner);
  againBtn.addEventListener('click', () => {
    closeWinner();
    spin();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeWinner();
  });
  elimReset.addEventListener('click', () => {
    activeWheel().eliminated = [];
    save();
    renderElimBar();
    drawWheel();
  });

  document.addEventListener('keydown', (e) => {
    if (!overlay.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWinner();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === okBtn ? againBtn : okBtn).focus();
      }
      return;
    }
    if (editor.open) return;
    const tag = e.target && e.target.tagName;
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(tag)) {
      e.preventDefault();
      spin();
    }
  });

  // Editor
  wheelName.addEventListener('input', () => {
    activeWheel().name = wheelName.value.slice(0, MAX_LABEL);
    save();
    renderWheelSelect();
  });
  wheelName.addEventListener('blur', () => {
    const wheel = activeWheel();
    if (!wheel.name.trim()) {
      wheel.name = 'Glücksrad';
      wheelName.value = wheel.name;
      save();
      renderWheelSelect();
    }
  });

  countMinus.addEventListener('click', () => setCount(activeWheel().items.length - 1));
  countPlus.addEventListener('click', () => setCount(activeWheel().items.length + 1));
  countInput.addEventListener('change', () => setCount(parseInt(countInput.value, 10)));

  itemList.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-index]');
    if (!input) return;
    activeWheel().items[Number(input.dataset.index)] = input.value.slice(0, MAX_LABEL);
    save();
    drawWheel();
  });
  itemList.addEventListener('click', (e) => {
    const del = e.target.closest('button.del-btn');
    if (!del || del.disabled) return;
    const wheel = activeWheel();
    if (wheel.items.length <= MIN_ITEMS) return;
    const i = Number(del.dataset.index);
    wheel.items.splice(i, 1);
    itemsChanged();
  });

  // Enter must not submit the dialog form; move to the next field instead.
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (t === wheelName) {
      e.preventDefault();
      wheelName.blur();
    } else if (t === countInput) {
      e.preventDefault();
      setCount(parseInt(countInput.value, 10));
    } else if (t.matches && t.matches('input[data-index]')) {
      e.preventDefault();
      const i = Number(t.dataset.index);
      const wheel = activeWheel();
      if (i < wheel.items.length - 1) {
        itemList.querySelector(`input[data-index="${i + 1}"]`).focus();
      } else if (wheel.items.length < MAX_ITEMS) {
        wheel.items.push('');
        itemsChanged(wheel.items.length - 1);
      } else {
        t.blur();
      }
    } else if (t.tagName !== 'BUTTON') {
      e.preventDefault();
    }
  });

  addItem.addEventListener('click', () => {
    const wheel = activeWheel();
    if (wheel.items.length >= MAX_ITEMS) return;
    wheel.items.push('');
    itemsChanged(wheel.items.length - 1);
  });

  shuffleItems.addEventListener('click', () => {
    const items = activeWheel().items;
    for (let i = items.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    itemsChanged();
  });

  optRemove.addEventListener('change', () => {
    state.settings.removeWinner = optRemove.checked;
    if (!optRemove.checked) for (const w of state.wheels) w.eliminated = [];
    save();
    renderElimBar();
    drawWheel();
  });
  optSound.addEventListener('change', () => {
    state.settings.sound = optSound.checked;
    save();
    if (optSound.checked) ensureAudio();
  });
  optHaptics.addEventListener('change', () => {
    state.settings.haptics = optHaptics.checked;
    save();
  });
  optDuration.addEventListener('change', () => {
    const v = Number(optDuration.value);
    state.settings.duration = DURATIONS.includes(v) ? v : 5000;
    save();
  });

  newWheel.addEventListener('click', () => {
    addWheel({ id: uid(), name: 'Neues Rad', items: ['', ''], eliminated: [] });
  });
  dupWheel.addEventListener('click', () => {
    const w = activeWheel();
    addWheel({ id: uid(), name: `${w.name.slice(0, MAX_LABEL - 8)} (Kopie)`, items: [...w.items], eliminated: [] });
  });
  delWheel.addEventListener('click', () => {
    if (state.wheels.length <= 1) return;
    const w = activeWheel();
    if (!confirm(`„${w.name}“ wirklich löschen?`)) return;
    const pos = state.wheels.indexOf(w);
    state.wheels = state.wheels.filter((x) => x.id !== w.id);
    state.activeId = state.wheels[Math.min(pos, state.wheels.length - 1)].id;
    rotation = 0;
    save();
    renderMain();
    renderEditor();
  });

  editor.addEventListener('close', () => {
    const wheel = activeWheel();
    if (!wheel.name.trim()) {
      wheel.name = 'Glücksrad';
      save();
    }
    renderMain();
  });
  // Tap on the backdrop closes the sheet.
  editor.addEventListener('click', (e) => {
    if (e.target === editor) editor.close();
  });

  // Layout / theme changes
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(stage);
  window.addEventListener('resize', resizeCanvas);
  const onSchemeChange = () => drawWheel();
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSchemeChange);
  else if (darkQuery.addListener) darkQuery.addListener(onSchemeChange);

  // ---------- Boot ----------

  renderMain();
  resizeCanvas();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
