// Pustaka media (kiri): "Media saya" (disimpan di localStorage) + "Dari bundel".
import { $, baseName, setStatus } from './utils.js';
import { state } from './state.js';
import { on, emit } from './events.js';
import { convertFileSrc, openDialog } from './tauri.js';
import { kindOf, MEDIA_FILTER } from './media.js';
import { pick, syncPanel } from './background-panel.js';

const LIB_KEY = 'pc.library';
let library = (() => {
  try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { return []; }
})().filter((p) => typeof p === 'string' && kindOf(p));
const saveLibrary = () => {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); } catch { /* abaikan */ }
};

function collectBundleMedia(slides) {
  const seen = new Set();
  const out = [];
  for (const s of slides) {
    for (const l of s.layers || []) {
      if ((l.kind !== 'video' && l.kind !== 'image') || l.status !== 'OK') continue;
      if (!l.path || seen.has(l.path)) continue;
      seen.add(l.path);
      out.push({ path: l.path, kind: l.kind });
    }
  }
  return out;
}

// Layer baru ditaruh paling belakang (z paling kecil) agar tidak menutupi teks.
function addLayerToSlide(path, kind) {
  const slide = state.slides[state.activeIndex];
  if (!slide) return setStatus('Pilih slide dulu.');
  slide.layers = slide.layers || [];
  const z = slide.layers.reduce((m, l) => Math.min(m, l.z), 0) - 1;
  slide.layers.push({
    kind, z,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0, opacity: 1,
    path, status: 'OK', inner: null,
    scale: 'SCALE_BEHAVIOR_FIT',
    muted: true, looped: true, stop_on_clear: null,
    color: null, text: null,
  });
  emit('layer:added', slide.layers.length - 1);
  setStatus(`${baseName(path)} ditambahkan ke slide ${slide.slide_number}.`);
}

function libTile(path, kind, removable) {
  const url = convertFileSrc(path);
  const tile = document.createElement('div');
  tile.className = 'lib-item';
  tile.dataset.src = path;
  tile.title = path;

  const th = document.createElement('div');
  th.className = 'lib-thumb';
  const m = document.createElement(kind === 'video' ? 'video' : 'img');
  if (kind === 'video') {
    m.muted = true;
    m.preload = 'metadata';
    m.src = url + '#t=0.1';
  } else {
    m.src = url;
  }
  m.addEventListener('error', () => m.remove());
  th.appendChild(m);

  const name = document.createElement('div');
  name.className = 'lib-name';
  name.textContent = (kind === 'video' ? '🎞 ' : '🖼 ') + baseName(path);

  const btns = document.createElement('div');
  btns.className = 'lib-btns';
  const mk = (label, title, fn, cls) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    btns.appendChild(b);
  };
  mk('BG', 'Jadikan background', () => pick(path, kind));
  mk('+ Slide', 'Tambahkan ke slide aktif', () => addLayerToSlide(path, kind));
  if (removable) {
    mk('✕', 'Hapus dari pustaka', () => {
      library = library.filter((p) => p !== path);
      saveLibrary();
      renderLibrary();
    }, 'x');
  }
  tile.append(th, name, btns);
  return tile;
}

export function renderLibrary() {
  const body = $('lib-body');
  body.replaceChildren();
  const section = (title, items, removable, emptyText) => {
    const h = document.createElement('h4');
    h.textContent = title;
    body.appendChild(h);
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'mp-empty';
      p.textContent = emptyText;
      body.appendChild(p);
      return;
    }
    const g = document.createElement('div');
    g.className = 'lib-grid';
    items.forEach((it) => g.appendChild(libTile(it.path, it.kind, removable)));
    body.appendChild(g);
  };
  section('Media saya', library.map((p) => ({ path: p, kind: kindOf(p) })), true, 'Klik “+ Tambah” untuk memasukkan file.');
  section('Dari bundel', state.bundleMedia, false, 'Belum ada bundel dimuat.');
  syncPanel(state.bg);
}

export function initLibrary() {
  $('lib-add').addEventListener('click', async () => {
    const r = await openDialog({ multiple: true, filters: MEDIA_FILTER });
    if (!r) return;
    for (const p of Array.isArray(r) ? r : [r]) {
      if (kindOf(p) && !library.includes(p)) library.push(p);
    }
    saveLibrary();
    renderLibrary();
  });
  on('slides:loaded', () => {
    state.bundleMedia = collectBundleMedia(state.slides);
    renderLibrary();
  });
}