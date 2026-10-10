'use strict';

/* ============ MINESWEEPER — logika game ============ */

const $ = (s) => document.querySelector(s);

const LEVELS = {
  pemula:   { label: 'PEMULA',   cols: 9,  rows: 9,  mines: 10 },
  menengah: { label: 'MENENGAH', cols: 16, rows: 16, mines: 40 },
  mahir:    { label: 'MAHIR',    cols: 30, rows: 16, mines: 99 },
  kustom:   { label: 'KUSTOM' },
};

const STORE_KEY = 'minesweeper-v1';
const LONG_PRESS_MS = 400;

/* ---------- ikon pixel (SVG) ---------- */
const SVG_MINE =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="2" y="2" width="4" height="4" fill="#e2e8f0"/><rect x="3" y="1" width="2" height="1" fill="#e2e8f0"/>' +
  '<rect x="1" y="3" width="1" height="2" fill="#e2e8f0"/><rect x="6" y="3" width="1" height="2" fill="#e2e8f0"/>' +
  '<rect x="3" y="6" width="2" height="1" fill="#e2e8f0"/><rect x="5" y="0" width="1" height="1" fill="#fbbf24"/>' +
  '<rect x="6" y="0" width="1" height="1" fill="#fbbf24"/></svg>';

const SVG_MINE_BOOM = SVG_MINE.replaceAll('#e2e8f0', '#0f1222').replaceAll('#fbbf24', '#0f1222');

const SVG_FLAG =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="3" y="0" width="1" height="6" fill="#94a3b8"/><rect x="4" y="1" width="3" height="2" fill="#ef4444"/>' +
  '<rect x="4" y="3" width="2" height="1" fill="#ef4444"/><rect x="2" y="6" width="4" height="1" fill="#94a3b8"/></svg>';

const SVG_FLAG_X =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="3" y="0" width="1" height="6" fill="#94a3b8"/><rect x="4" y="1" width="3" height="2" fill="#ef4444"/>' +
  '<rect x="4" y="3" width="2" height="1" fill="#ef4444"/><rect x="2" y="6" width="4" height="1" fill="#94a3b8"/>' +
  '<g fill="#f87171"><rect x="0" y="0" width="2" height="2"/><rect x="3" y="3" width="2" height="2"/>' +
  '<rect x="6" y="6" width="2" height="2"/><rect x="6" y="0" width="2" height="2"/><rect x="0" y="6" width="2" height="2"/></g></svg>';

/* ---------- penyimpanan (localStorage) ---------- */
let store = loadStore();

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        stats: s.stats || {}, top: s.top || {}, kustom: s.kustom || null,
        lastLevel: s.lastLevel || 'pemula',
        audio: (s.audio === 0 || s.audio === 1) ? s.audio : 2,
      };
    }
  } catch (e) { /* storage rusak / dipblok — mulai kosong */ }
  return { stats: {}, top: {}, kustom: null, lastLevel: 'pemula', audio: 2 };
}

function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* penuh / dipblok — abaikan */ }
}

function levelStats(id) {
  return store.stats[id] || (store.stats[id] = { played: 0, won: 0, best: null });
}

function levelTop(id) {
  return store.top[id] || (store.top[id] = []);
}

/* ---------- audio 8-bit (Web Audio, tanpa file) ----------
   mode di store.audio: 2 = sfx + musik, 1 = sfx saja, 0 = bisu */
const AudioFX = (() => {
  let ctx = null, sfxGain = null, musGain = null;
  let musTimer = null, step = 0, nextNoteTime = 0;
  const BPM = 132;
  const STEP = 60 / BPM / 2; // not kedelapan

  // 32 langkah: melodi pentatonik A-minor + bass pendamping
  const LEAD = [
    440, 0, 523, 0, 659, 0, 587, 523,
    440, 0, 392, 0, 330, 0, 392, 0,
    440, 0, 523, 0, 659, 0, 784, 659,
    587, 0, 523, 0, 440, 0, 0, 0,
  ];
  const BASS = [
    110, 0, 0, 0, 165, 0, 0, 0,
    98, 0, 0, 0, 147, 0, 0, 0,
    110, 0, 0, 0, 165, 0, 0, 0,
    131, 0, 0, 0, 110, 0, 0, 0,
  ];

  // penghitung untuk verifikasi manual
  const dbg = { reveal: 0, flag: 0, chord: 0, boom: 0, win: 0, lose: 0, click: 0, steps: 0 };

  const sfxReady = () => ctx && store.audio !== 0;

  // satu nada: oscillator + amplop eksponensial
  function tone(dest, type, freq, t, dur, vol, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ledakan: buffer white-noise + filter lowpass melorot
  function noiseBurst(t, dur, vol, fFrom, fTo) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(fFrom, t);
    f.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + dur);
  }

  function sfxReveal(adj) {
    if (!sfxReady()) return;
    dbg.reveal++;
    const f = adj > 0 ? 660 + adj * 40 : 520;
    tone(sfxGain, 'square', f, ctx.currentTime, 0.08, 0.5, f * 0.6);
  }

  function sfxFlag(on) {
    if (!sfxReady()) return;
    dbg.flag++;
    const t = ctx.currentTime;
    if (on) { tone(sfxGain, 'square', 587, t, 0.06, 0.5); tone(sfxGain, 'square', 880, t + 0.07, 0.09, 0.5); }
    else { tone(sfxGain, 'square', 880, t, 0.06, 0.5); tone(sfxGain, 'square', 587, t + 0.07, 0.09, 0.5); }
  }

  function sfxChord() {
    if (!sfxReady()) return;
    dbg.chord++;
    const t = ctx.currentTime;
    [523, 659, 784].forEach((f, i) => tone(sfxGain, 'square', f, t + i * 0.05, 0.08, 0.45));
  }

  function sfxBoom() {
    if (!sfxReady()) return;
    dbg.boom++;
    noiseBurst(ctx.currentTime, 0.45, 0.8, 1200, 80);
    tone(sfxGain, 'square', 150, ctx.currentTime, 0.45, 0.7, 40);
  }

  function sfxWin() {
    if (!sfxReady()) return;
    dbg.win++;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(sfxGain, 'square', f, t + i * 0.1, 0.12, 0.5));
    tone(sfxGain, 'square', 1319, t + 0.4, 0.4, 0.5);
  }

  function sfxLose() {
    if (!sfxReady()) return;
    dbg.lose++;
    tone(sfxGain, 'sawtooth', 320, ctx.currentTime, 0.55, 0.4, 65);
  }

  function sfxClick() {
    if (!sfxReady()) return;
    dbg.click++;
    tone(sfxGain, 'square', 1600, ctx.currentTime, 0.035, 0.35, 1200);
  }

  // musik: penjadwal look-ahead (aman dari jeda setInterval)
  function schedule() {
    while (nextNoteTime < ctx.currentTime + 0.18) {
      const i = step % LEAD.length;
      if (LEAD[i]) tone(musGain, 'square', LEAD[i], nextNoteTime, STEP * 0.95, 0.5);
      if (BASS[i]) tone(musGain, 'triangle', BASS[i], nextNoteTime, STEP * 1.9, 0.9);
      nextNoteTime += STEP; step++; dbg.steps++;
    }
  }

  function applyMode() {
    if (!ctx) return;
    const on = store.audio === 2;
    if (on && !musTimer) {
      nextNoteTime = ctx.currentTime + 0.1;
      musTimer = setInterval(schedule, 60);
    } else if (!on && musTimer) {
      clearInterval(musTimer); musTimer = null;
    }
    if (musGain) musGain.gain.value = on ? 0.10 : 0;
  }

  // dipanggil pada gestur pertama — kebijakan autoplay browser
  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.22; sfxGain.connect(ctx.destination);
      musGain = ctx.createGain(); musGain.gain.value = 0.10; musGain.connect(ctx.destination);
      applyMode();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  return { unlock, applyMode, dbg, sfxReveal, sfxFlag, sfxChord, sfxBoom, sfxWin, sfxLose, sfxClick };
})();

// nama pendek untuk hook aksi game
const { sfxReveal, sfxFlag, sfxChord, sfxBoom, sfxWin, sfxLose, sfxClick } = AudioFX;

/* ---------- state game ---------- */
let levelId = 'pemula';
let cols = 9, rows = 9, mines = 10;
let cells = [];          // { mine, adj, revealed, flagged }
let cellEls = [];
let started = false, over = false, win = false;
let flagsPlaced = 0, revealedCount = 0;
let timerId = null, t0 = 0;
let flagMode = false;

/* ---------- elemen ---------- */
const board = $('#board');
const boardWrap = $('#board-wrap');
const minesCountEl = $('#mines-count');
const timeCountEl = $('#time-count');
const overlay = $('#overlay');
const ovTitle = $('#ov-title');
const ovDetail = $('#ov-detail');
const ovRecord = $('#ov-record');
const gameHint = $('#game-hint');

/* ---------- navigasi layar ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

/* ---------- util ---------- */
const pad3 = (n) => {
  n = Math.max(0, Math.min(999, n));
  return String(n).padStart(3, '0');
};

function fmtTime(sec) {
  const m = Math.floor(sec / 60), r = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function neighbors(i) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

/* ---------- timer & penghitung ---------- */
function startTimer() {
  t0 = Date.now();
  timerId = setInterval(updateTimer, 250);
  updateTimer();
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function elapsedSec() {
  return Math.min(999, Math.floor((Date.now() - t0) / 1000));
}

function updateTimer() {
  timeCountEl.textContent = started ? pad3(elapsedSec()) : '000';
}

function updateMinesCounter() {
  const left = mines - flagsPlaced;
  minesCountEl.textContent = left < 0
    ? '-' + String(Math.min(99, -left)).padStart(2, '0')
    : pad3(left);
}

/* ---------- membangun papan ---------- */
function startGame(id, settings) {
  levelId = id;
  if (id === 'kustom' && settings) {
    cols = settings.cols; rows = settings.rows; mines = settings.mines;
    store.kustom = { cols, rows, mines };
  } else {
    const L = LEVELS[id];
    cols = L.cols; rows = L.rows; mines = L.mines;
  }
  store.lastLevel = id;
  saveStore();

  cells = Array.from({ length: cols * rows }, () => ({ mine: false, adj: 0, revealed: false, flagged: false }));
  started = false; over = false; win = false;
  flagsPlaced = 0; revealedCount = 0;
  stopTimer();

  gameHint.textContent = 'TAP = BUKA \u00B7 TEKAN LAMA = BENDERA';
  flagMode = false;
  syncFlagBtn();
  updateMinesCounter();
  updateTimer();

  board.classList.remove('lose', 'win');
  overlay.classList.add('hidden');

  buildBoard();
  fitTiles();
  showScreen('screen-game');
}

function buildBoard() {
  board.style.setProperty('--cols', cols);
  board.innerHTML = '';
  cellEls = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cells.length; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = i;
    frag.appendChild(el);
    cellEls.push(el);
  }
  board.appendChild(frag);
}

function fitTiles() {
  if (!$('#screen-game').classList.contains('active')) return;
  const avail = boardWrap.clientWidth - 8;
  const t = Math.floor((avail - (cols - 1) * 4) / cols);
  board.style.setProperty('--tile', Math.max(18, Math.min(34, t)) + 'px');
}

/* ---------- sebar bom (klik pertama aman) ---------- */
function placeMines(safeIndex) {
  const forbidden = new Set([safeIndex, ...neighbors(safeIndex)]);
  let pool = [];
  for (let i = 0; i < cells.length; i++) if (!forbidden.has(i)) pool.push(i);
  if (pool.length < mines) { // papan terlalu penuh — cukup amankan kotak pertama
    pool = [];
    for (let i = 0; i < cells.length; i++) if (i !== safeIndex) pool.push(i);
  }
  // Fisher-Yates parsial
  for (let k = 0; k < mines; k++) {
    const j = k + Math.floor(Math.random() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    cells[pool[k]].mine = true;
  }
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].mine) cells[i].adj = neighbors(i).filter((n) => cells[n].mine).length;
  }
}

/* ---------- aksi pemain ---------- */
function reveal(i) {
  if (over || cells[i].revealed || cells[i].flagged) return;
  if (!started) { placeMines(i); started = true; startTimer(); }
  if (cells[i].mine) { boom(i); return; }
  const before = revealedCount;
  floodOpen(i);
  checkWin();
  if (!over && revealedCount > before) sfxReveal(cells[i].adj);
}

function floodOpen(start) {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    const c = cells[i];
    if (c.revealed || c.flagged) continue;
    c.revealed = true;
    revealedCount++;
    paintRevealed(i);
    if (c.adj === 0) {
      for (const n of neighbors(i)) {
        if (!cells[n].revealed && !cells[n].flagged) stack.push(n);
      }
    }
  }
}

function flag(i) {
  if (over || cells[i].revealed) return;
  const c = cells[i];
  c.flagged = !c.flagged;
  flagsPlaced += c.flagged ? 1 : -1;
  cellEls[i].classList.toggle('flag', c.flagged);
  cellEls[i].innerHTML = c.flagged ? SVG_FLAG : '';
  updateMinesCounter();
  sfxFlag(c.flagged);
}

function chord(i) {
  const c = cells[i];
  if (!c.revealed || c.adj === 0 || over) return;
  const nb = neighbors(i);
  const flagged = nb.filter((n) => cells[n].flagged).length;
  if (flagged !== c.adj) return;
  const before = revealedCount;
  for (const n of nb) {
    if (cells[n].flagged || cells[n].revealed) continue;
    if (cells[n].mine) { boom(n); return; }
    floodOpen(n);
  }
  checkWin();
  if (!over && revealedCount > before) sfxChord();
}

/* ---------- hasil ---------- */
function boom(hitIndex) {
  over = true;
  stopTimer();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.mine && !c.flagged) {
      cellEls[i].classList.add('mine');
      cellEls[i].innerHTML = i === hitIndex ? SVG_MINE_BOOM : SVG_MINE;
      if (i === hitIndex) cellEls[i].classList.add('boom-cell');
    }
    if (!c.mine && c.flagged) {
      cellEls[i].classList.add('wrong');
      cellEls[i].innerHTML = SVG_FLAG_X;
    }
  }
  board.classList.add('lose');
  sfxBoom();
  finishGame(false);
}

function checkWin() {
  if (revealedCount !== cells.length - mines) return;
  over = true; win = true;
  stopTimer();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine && !cells[i].flagged) {
      cells[i].flagged = true;
      flagsPlaced++;
      cellEls[i].classList.add('flag');
      cellEls[i].innerHTML = SVG_FLAG;
    }
  }
  updateMinesCounter();
  board.classList.add('win');
  finishGame(true);
}

function finishGame(didWin) {
  if (didWin) sfxWin(); else sfxLose();
  const sec = started ? elapsedSec() : 0;
  const st = levelStats(levelId);
  st.played++;
  let record = '', top10 = '';
  if (didWin) {
    st.won++;
    if (st.best == null || sec < st.best) { st.best = sec; record = 'REKOR BARU!'; }
    const arr = levelTop(levelId);
    const rec = { t: sec, d: Date.now() };
    if (levelId === 'kustom') { rec.c = cols; rec.r = rows; rec.m = mines; }
    arr.push(rec);
    arr.sort((a, b) => a.t - b.t || a.d - b.d);
    if (arr.length > 10) arr.length = 10;
    if (!record && arr.some((e) => e.t === sec)) top10 = 'MASUK TOP 10!';
  }
  saveStore();
  setTimeout(() => showOverlay(didWin, sec, record || top10), 650);
}

function showOverlay(didWin, sec, recordMsg) {
  ovTitle.textContent = didWin ? 'MENANG!' : 'KALAH...';
  ovTitle.className = didWin ? 'win' : 'lose';
  ovDetail.textContent = 'WAKTU: ' + fmtTime(sec);
  ovRecord.textContent = recordMsg;
  ovRecord.classList.toggle('hidden', !recordMsg);
  overlay.classList.remove('hidden');
}

/* ---------- render sel ---------- */
function paintRevealed(i) {
  const el = cellEls[i];
  const c = cells[i];
  el.classList.add('revealed');
  if (c.adj > 0) {
    el.textContent = c.adj;
    el.dataset.n = c.adj;
  }
}

/* ---------- input: mouse + sentuh ---------- */
let lpTimer = null, suppressClick = false, lpX = 0, lpY = 0, lpFired = false, touchActive = false;

function cellIndexFromEvent(e) {
  const el = e.target.closest('.cell');
  return el ? Number(el.dataset.i) : -1;
}

function doFlag(i) { if (i >= 0) flag(i); }

board.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const i = cellIndexFromEvent(e);
  if (i < 0) return;
  if (touchActive) {
    // HP: menu bawaan tekan-tahan. Bendera diurus SEKALI oleh gestur ini —
    // toggle lagi di sini penyebab bendera pasang-lalu-hilang.
    if (!lpFired) {
      lpFired = true;
      suppressClick = true;
      doFlag(i);
    }
    return;
  }
  doFlag(i); // desktop: klik kanan
});

board.addEventListener('pointerdown', (e) => {
  lpFired = false; // gestur baru → izinkan satu kali ubah bendera
  suppressClick = false; // gestur baru → jangan menelan tap pertama pemain
  touchActive = e.pointerType !== 'mouse';
  if (e.pointerType === 'mouse') return; // desktop pakai klik kanan
  const i = cellIndexFromEvent(e);
  if (i < 0) return;
  lpX = e.clientX; lpY = e.clientY;
  lpTimer = setTimeout(() => {
    lpTimer = null;
    if (lpFired) return; // gestur ini sudah mengubah bendera — jangan toggle lagi
    lpFired = true;
    suppressClick = true;
    if (navigator.vibrate) navigator.vibrate(30);
    doFlag(i);
  }, LONG_PRESS_MS);
});

board.addEventListener('pointermove', (e) => {
  if (!lpTimer) return;
  if (Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) {
    clearTimeout(lpTimer);
    lpTimer = null;
  }
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  board.addEventListener(ev, () => {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  })
);

board.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const i = cellIndexFromEvent(e);
  if (i < 0 || over) return;
  if (flagMode) { doFlag(i); return; }
  if (cells[i].revealed) { chord(i); return; }
  reveal(i);
});

/* ---------- tombol ---------- */
function syncFlagBtn() {
  const b = $('#btn-flagmode');
  b.classList.toggle('active', flagMode);
  b.setAttribute('aria-pressed', String(flagMode));
}

$('#btn-flagmode').addEventListener('click', () => {
  flagMode = !flagMode;
  syncFlagBtn();
});

$('#btn-home').addEventListener('click', () => {
  stopTimer();
  overlay.classList.add('hidden');
  showScreen('screen-home');
});

$('#btn-again').addEventListener('click', () => startGame(levelId, levelId === 'kustom' ? store.kustom : null));

$('#ov-home').addEventListener('click', () => {
  overlay.classList.add('hidden');
  showScreen('screen-home');
});

document.querySelectorAll('.level-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const id = b.dataset.level;
    if (id === 'kustom') openKustom();
    else startGame(id);
  });
});

/* ---------- dialog kustom ---------- */
const kDialog = $('#dialog-kustom');
const kCols = $('#k-cols'), kRows = $('#k-rows'), kMines = $('#k-mines'), kInfo = $('#k-info');

function clampInputs() {
  let c = Math.max(5, Math.min(40, Number(kCols.value) || 5));
  let r = Math.max(5, Math.min(30, Number(kRows.value) || 5));
  const maxMines = c * r - 10;
  let m = Math.max(1, Math.min(maxMines, Number(kMines.value) || 1));
  kCols.value = c; kRows.value = r; kMines.value = m;
  kInfo.textContent = 'MAKS BOM: ' + maxMines;
  return { cols: c, rows: r, mines: m };
}

function openKustom() {
  const s = store.kustom || { cols: 12, rows: 12, mines: 20 };
  kCols.value = s.cols; kRows.value = s.rows; kMines.value = s.mines;
  clampInputs();
  kDialog.classList.remove('hidden');
}

// Clamp HANYA saat keluar input (blur) — jangan saat mengetik,
// supaya bisa memasukkan angka multi-digit (mis. 11) tanpa dimakan batas minimum.
[kCols, kRows, kMines].forEach((el) => el.addEventListener('blur', clampInputs));

$('#k-start').addEventListener('click', () => {
  const s = clampInputs();
  kDialog.classList.add('hidden');
  startGame('kustom', s);
});

$('#k-cancel').addEventListener('click', () => kDialog.classList.add('hidden'));

/* ---------- stepper ▲▼ (kolom/baris/bom) ---------- */
document.querySelectorAll('.stp').forEach((b) => {
  const dir = b.classList.contains('stp-up') ? 1 : -1;
  const target = document.getElementById(b.dataset.target);
  let repTimer = null;

  const step = () => {
    target.value = (Number(target.value) || 0) + dir;
    clampInputs();
  };
  const stop = () => {
    if (repTimer) { clearInterval(repTimer); repTimer = null; }
  };

  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // cegah fokus pindah / seleksi teks / zoom dobel-tap
    step();
    clearInterval(repTimer);
    repTimer = setInterval(step, 90); // tahan = ulang cepat
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
  b.addEventListener('contextmenu', (e) => e.preventDefault()); // tahan di HP: tanpa menu
});

/* ---------- leaderboard ---------- */
let lbTab = store.lastLevel || 'pemula';

$('#btn-leaderboard').addEventListener('click', () => {
  if (!levelTop(lbTab).length) {
    lbTab = levelTop(store.lastLevel).length ? store.lastLevel : 'pemula';
  }
  renderLeaderboard();
  showScreen('screen-board');
});

$('#btn-back').addEventListener('click', () => showScreen('screen-home'));

// label ukuran papan rekor kustom ("12×15 · 20 BOM"); rekor lama tanpa ukuran → '—'
function cfgLabel(e) {
  return e.c ? e.c + '\u00d7' + e.r + ' \u00b7 ' + e.m + ' BOM' : '\u2014';
}

// baris UKURAN pada kartu statistik kustom: konfigurasi terakhir yang dipakai
function ukuranRow() {
  const k = store.kustom;
  return '<div class="stat-row"><span>UKURAN</span><b>' +
    (k ? k.cols + '\u00d7' + k.rows + ' \u00b7 ' + k.mines + ' BOM' : '\u2014') + '</b></div>';
}

function renderLeaderboard() {
  // kartu statistik
  const grid = $('#stat-grid');
  grid.innerHTML = '';
  for (const id of Object.keys(LEVELS)) {
    const st = levelStats(id);
    const rate = st.played ? Math.round((st.won / st.played) * 100) + '%' : '\u2014';
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML =
      '<h3>' + LEVELS[id].label + '</h3>' +
      '<div class="stat-row"><span>TERBAIK</span><b>' + (st.best != null ? fmtTime(st.best) : '\u2014') + '</b></div>' +
      '<div class="stat-row"><span>MAIN</span><b>' + st.played + '</b></div>' +
      '<div class="stat-row"><span>MENANG</span><b>' + st.won + '</b></div>' +
      '<div class="stat-row"><span>RATIO</span><b>' + rate + '</b></div>' +
      (id === 'kustom' ? ukuranRow() : '');
    grid.appendChild(card);
  }

  // tab tingkat
  const tabs = $('#lb-tabs');
  tabs.innerHTML = '';
  for (const id of Object.keys(LEVELS)) {
    const b = document.createElement('button');
    b.className = 'btn' + (id === lbTab ? ' active' : '');
    b.textContent = LEVELS[id].label;
    b.addEventListener('click', () => { lbTab = id; renderLeaderboard(); });
    tabs.appendChild(b);
  }

  // daftar 10 waktu terbaik
  const list = $('#top-list');
  list.innerHTML = '';
  const arr = levelTop(lbTab);
  if (!arr.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'BELUM ADA REKOR \u2014 MAIN DULU!';
    list.appendChild(li);
    return;
  }
  arr.forEach((e, idx) => {
    const li = document.createElement('li');
    const d = new Date(e.d);
    const tgl = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    const cfg = lbTab === 'kustom' ? cfgLabel(e) : '';
    li.innerHTML =
      '<span class="rank">#' + (idx + 1) + '</span>' +
      '<span class="t">' + fmtTime(e.t) + '</span>' +
      '<span class="d">' + tgl + '</span>' +
      (cfg ? '<span class="cfg">' + cfg + '</span>' : '');
    if (cfg) li.className = 'has-cfg';
    list.appendChild(li);
  });
}

/* ---------- tombol suara (mengambang, semua layar) ---------- */
const audioBtn = $('#btn-audio');

const SVG_SND_ALL =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="0" y="3" width="2" height="2" fill="currentColor"/><rect x="2" y="2" width="1" height="4" fill="currentColor"/>' +
  '<rect x="3" y="1" width="1" height="6" fill="currentColor"/>' +
  '<rect x="5" y="3" width="1" height="2" fill="#4ade80"/><rect x="6" y="2" width="1" height="4" fill="#4ade80"/></svg>';

const SVG_SND_SFX =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="0" y="3" width="2" height="2" fill="currentColor"/><rect x="2" y="2" width="1" height="4" fill="currentColor"/>' +
  '<rect x="3" y="1" width="1" height="6" fill="currentColor"/></svg>';

const SVG_SND_OFF =
  '<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect x="0" y="3" width="2" height="2" fill="currentColor"/><rect x="2" y="2" width="1" height="4" fill="currentColor"/>' +
  '<rect x="3" y="1" width="1" height="6" fill="currentColor"/>' +
  '<g fill="#f87171"><rect x="5" y="1" width="1" height="1"/><rect x="6" y="2" width="1" height="1"/>' +
  '<rect x="7" y="3" width="1" height="1"/><rect x="7" y="1" width="1" height="1"/><rect x="5" y="3" width="1" height="1"/></g></svg>';

function syncAudioBtn() {
  audioBtn.innerHTML =
    store.audio === 2 ? SVG_SND_ALL : store.audio === 1 ? SVG_SND_SFX : SVG_SND_OFF;
  audioBtn.title =
    store.audio === 2 ? 'Suara: SEMUA (efek + musik)' :
    store.audio === 1 ? 'Suara: EFEK SAJA' : 'Suara: BISU';
}

audioBtn.addEventListener('click', () => {
  store.audio = (store.audio + 2) % 3; // 2 → 1 → 0 → 2
  saveStore();
  AudioFX.unlock();
  AudioFX.applyMode();
  syncAudioBtn();
});

// bunyi klik untuk semua tombol
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn')) sfxClick();
}, true);

/* ---------- init ---------- */
window.addEventListener('resize', fitTiles);
document.addEventListener('pointerdown', () => AudioFX.unlock());
syncAudioBtn();
showScreen('screen-home');
