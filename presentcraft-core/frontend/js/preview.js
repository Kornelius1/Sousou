// Panel preview: renderer sendiri (video/gambar/teks/background) + kontrol transport.
// Tidak memakai SR.renderThumbnail supaya video ikut diputar seperti di layar audience.
import { $, clamp, debounce } from './utils.js';
import { state } from './state.js';
import { on } from './events.js';
import { toPayload } from './audience.js';
import { convertFileSrc } from './tauri.js';

const SR = window.SlideRenderer;
const pvHost = $('pv-host');
const pv = { dir: 0, raf: 0, loop: null, rate: 1 }; // dir: 1 putar, 0 jeda; loop null = ikut layer
let stage = null;
let stageW = 1366;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
};

// ---------- renderer ----------
const FIT = { SCALE_BEHAVIOR_FILL: 'cover', SCALE_BEHAVIOR_STRETCH: 'fill' }; // selain itu: contain

function mediaEl(kind, src, { loop, fit }) {
  const m = document.createElement(kind === 'video' ? 'video' : 'img');
  if (kind === 'video') {
    m.muted = true; // preview selalu bisu agar tidak dobel dengan audience
    m.loop = !!loop;
    m.playsInline = true;
    m.preload = 'auto';
  }
  m.src = src;
  m.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};display:block`;
  return m;
}

function backgroundEl(bg) {
  if (!bg) return null;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;overflow:hidden;opacity:${bg.opacity ?? 1}`;
  if (bg.kind === 'color') el.style.background = bg.src;
  else el.append(mediaEl(bg.kind, convertFileSrc(bg.src), { loop: bg.loop, fit: bg.scale === 'fit' ? 'contain' : 'cover' }));
  return el;
}

const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

function layerEl(l) {
  const el = document.createElement('div');
  const r = l.rect;
  el.style.cssText =
    `position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;` +
    `opacity:${l.opacity ?? 1};transform:rotate(${l.rotation || 0}deg);overflow:hidden`;

  if (l.kind === 'video' || l.kind === 'image') {
    if (!l.src) return null;
    el.append(mediaEl(l.kind, l.src, { loop: l.looped, fit: FIT[l.scale] || 'contain' }));
  } else if (l.kind === 'color') {
    el.style.background = l.color || 'transparent';
  } else if (l.kind === 'text') {
    const st = { ...SR.TEXT_DEFAULTS, ...(l.style || {}) };
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent = VALIGN[st.valign] || 'center';
    const t = document.createElement('div');
    t.textContent = l.text || '';
    t.style.cssText =
      `white-space:pre-wrap;word-break:break-word;font-family:${st.fontFamily};font-size:${st.fontSize}px;` +
      `color:${st.color};font-weight:${st.bold ? 700 : 400};font-style:${st.italic ? 'italic' : 'normal'};` +
      `text-align:${st.align}`;
    el.append(t);
  }
  return el;
}

function applyScale() {
  if (stage && pvHost.clientWidth) stage.style.transform = `scale(${pvHost.clientWidth / stageW})`;
}

function buildStage(slide) {
  const p = toPayload(slide);
  stageW = p.width;
  pvHost.replaceChildren();
  pvHost.style.aspectRatio = `${p.width} / ${p.height}`;
  stage = document.createElement('div');
  stage.className = 'pv-stage';
  stage.style.cssText = `width:${p.width}px;height:${p.height}px;overflow:hidden`;
  const bg = backgroundEl(state.bg);
  if (bg) stage.append(bg);
  for (const l of p.layers) {
    const el = layerEl(l);
    if (el) stage.append(el);
  }
  pvHost.append(stage);
  applyScale();
}

// ---------- transport ----------
const RATES = [0.5, 1, 1.5, 2];
const pvVideos = () => [...pvHost.querySelectorAll('video')];
const pvMain = () =>
  pvVideos()
    .filter((v) => Number.isFinite(v.duration))
    .sort((a, b) => b.duration - a.duration)[0];
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CTRL = ['pv-restart', 'pv-back', 'pv-toggle', 'pv-fwd', 'pv-loop', 'pv-speed', 'pv-seek'];

function pvUi() {
  const has = pvVideos().length > 0;
  for (const id of CTRL) $(id).disabled = !has;
  $('pv-toggle').innerHTML = pv.dir !== 0 ? ICON.pause : ICON.play;
  $('pv-restart').innerHTML = ICON.restart;
  $('pv-loop').innerHTML = ICON.loop;
  $('pv-loop').classList.toggle('on', has && !!(pvMain() || pvVideos()[0]).loop);
  $('pv-speed').textContent = pv.rate + '×';
  pvScrubUi();
}

function pvScrubUi() {
  const m = pvMain();
  const f = m ? m.currentTime / m.duration : 0;
  $('pv-seek').value = String(Math.round(f * 1000));
  $('pv-seek').style.setProperty('--p', f * 100 + '%');
  $('pv-time').textContent = m ? `${fmt(m.currentTime)} / ${fmt(m.duration)}` : '0:00 / 0:00';
}

function pvStop() {
  cancelAnimationFrame(pv.raf);
  pv.raf = 0;
  pv.dir = 0;
  pvVideos().forEach((v) => v.pause());
  pvUi();
}

function pvTick() {
  if (pvVideos().every((v) => v.ended || v.paused)) return pvStop();
  pvScrubUi();
  pv.raf = requestAnimationFrame(pvTick);
}

function pvPlay() {
  cancelAnimationFrame(pv.raf);
  pv.dir = 1;
  for (const v of pvVideos()) {
    if (v.ended) v.currentTime = 0;
    v.playbackRate = pv.rate;
    v.play().catch(() => {});
  }
  pv.raf = requestAnimationFrame(pvTick);
  pvUi();
}

function seekBy(delta) {
  for (const v of pvVideos()) {
    if (Number.isFinite(v.duration)) v.currentTime = clamp(v.currentTime + delta, 0, v.duration);
  }
  pvScrubUi();
}

function applyVideoPrefs() {
  for (const v of pvVideos()) {
    if (pv.loop !== null) v.loop = pv.loop;
    v.playbackRate = pv.rate;
  }
}

// keep: pertahankan posisi & status putar (dipakai saat edit properties / ganti background)
export function renderPreview({ keep = false } = {}) {
  const prev = keep ? { times: pvVideos().map((v) => v.currentTime), dir: pv.dir } : null;
  cancelAnimationFrame(pv.raf);
  pv.raf = 0;
  pv.dir = 0;

  const slide = state.slides[state.activeIndex];
  pvHost.hidden = !slide;
  $('pv-empty').hidden = !!slide;
  if (!slide) {
    pvHost.replaceChildren();
    stage = null;
    return pvUi();
  }

  buildStage(slide);
  applyVideoPrefs();
  const vids = pvVideos();
  if (prev) {
    vids.forEach((v, i) => {
      const t = prev.times[i];
      if (t) v.addEventListener('loadedmetadata', () => { v.currentTime = t; }, { once: true });
    });
  }
  if (vids.length && (!prev || prev.dir !== 0)) pvPlay(); // autoplay seperti audience
  else pvUi();
}
export const renderPreviewSoon = debounce(() => renderPreview({ keep: true }), 150);
export const refreshPreviewBackground = () => renderPreview({ keep: true });

export function initPreview() {
  pvHost.addEventListener('loadedmetadata', pvScrubUi, true);
  new ResizeObserver(applyScale).observe(pvHost);

  const toggle = () => (pv.dir !== 0 ? pvStop() : pvPlay());
  $('pv-toggle').addEventListener('click', toggle);
  pvHost.addEventListener('click', () => { if (pvVideos().length) toggle(); });
  $('pv-restart').addEventListener('click', () => {
    for (const v of pvVideos()) v.currentTime = 0;
    pvPlay();
  });
  $('pv-back').addEventListener('click', () => seekBy(-5));
  $('pv-fwd').addEventListener('click', () => seekBy(5));
  $('pv-loop').addEventListener('click', () => {
    pv.loop = !(pvMain() || pvVideos()[0])?.loop;
    applyVideoPrefs();
    pvUi();
  });
  $('pv-speed').addEventListener('click', () => {
    pv.rate = RATES[(RATES.indexOf(pv.rate) + 1) % RATES.length];
    applyVideoPrefs();
    pvUi();
  });

  // Seek: jeda selagi digeser, lanjut putar bila tadinya sedang putar.
  const seek = $('pv-seek');
  let resume = false;
  seek.addEventListener('pointerdown', () => { resume = pv.dir !== 0; });
  seek.addEventListener('input', () => {
    if (pv.dir !== 0) pvStop();
    const f = Number(seek.value) / 1000;
    for (const v of pvVideos()) if (Number.isFinite(v.duration)) v.currentTime = f * v.duration;
    pvScrubUi();
  });
  seek.addEventListener('change', () => { if (resume) pvPlay(); resume = false; });

  on('slides:loaded', () => renderPreview());
  on('slide:shown', () => renderPreview());
  pvUi();
}