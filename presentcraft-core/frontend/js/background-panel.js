import { on } from './bus.js';
import { $, debounce, baseName } from './utils.js';
import { openDialog, listen } from './tauri.js';
import { MEDIA_FILTER } from './media.js';
import { setBackground, patchBackground, clearBackground } from '../background-state.js';
import * as G from './groups.js';
import { askConfirm } from './confirm.js';
import { state } from './state.js';

const SR = window.SlideRenderer;

let cur = null;            // background yang sedang tayang
const tiles = new Map();   // itemId -> { tile, layer, cap }
let gridSig = '';
let tileSel = null;

const tileItem = () => {
  const g = G.selectedGroup();
  return g && tileSel ? g.items.find((i) => String(i.id) === String(tileSel)) || null : null;
};

const selectTile = (it) => { tileSel = it.id; refreshArea(); syncSettings(); };

const toBg = (it) => ({
  src: it.src, kind: it.kind, loop: it.loop, mute: it.mute, scale: it.scale, opacity: it.opacity,
});
const isLive = (it) => !!cur && cur.kind === it.kind && cur.src === it.src;
const label = (it) => (it.kind === 'color' ? `Warna ${it.src}` : baseName(it.src));
const air = (it) => setBackground(toBg(it));

const div = (cls) => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};

// ---------- area slide background ----------
function applyTile(it) {
  const t = tiles.get(it.id);
  if (!t) return;
  SR.renderBackground(t.layer, toBg(it), { preview: true });
  t.cap.textContent = label(it);
  t.tile.title = it.src;
}

function buildTile(it) {
  const tile = div('bgt');
  tile.dataset.iid = it.id;
  const thumb = div('bgt-thumb');
  const layer = div('bgt-layer');
  thumb.appendChild(layer);
  const cap = div('bgt-cap');
  tile.append(thumb, cap);
  tiles.set(it.id, { tile, layer, cap });
  applyTile(it);
  return tile;
}

function rebuildGrid(items) {
  // lepaskan file video lama sebelum membuang elemennya
  tiles.forEach((t) => SR.renderBackground(t.layer, null));
  tiles.clear();
  $('bg-grid').replaceChildren(...items.map(buildTile));
}

function refreshArea() {
  const g = G.selectedGroup();
  const items = g ? g.items : [];
  $('bg-drop').hidden = items.length > 0;
  $('bg-grid').hidden = items.length === 0;

  const sig = (g ? g.id : '') + '|' + items.map((i) => i.id).join(',');
  if (sig !== gridSig) {
    gridSig = sig;
    rebuildGrid(items);
  }
  for (const it of items) {
    const t = tiles.get(it.id);
    t.tile.classList.toggle('sel', tileSel === it.id);
    t.tile.classList.toggle('live', isLive(it));
  }
}

function step(dir) {
  const g = G.selectedGroup();
  if (!g || !g.items.length) return;
  let i = g.items.findIndex((x) => x.id === tileSel);
  i = i < 0 ? 0 : Math.min(g.items.length - 1, Math.max(0, i + dir));
  const it = g.items[i];
  selectTile(it);
  air(it);
}

// ---------- kolom pengaturan ----------
function syncSettings() {
  const it = tileItem();
  const has = !!it;
  const isMedia = has && it.kind !== 'color';
  const isVideo = has && it.kind === 'video';
  if (has) {
    $('bg-loop').checked = it.loop;
    $('bg-mute').checked = it.mute;
    $('bg-scale').value = it.scale;
    $('bg-opacity').value = it.opacity;
    if (it.kind === 'color') $('bg-color').value = it.src;
  }
  $('bgs-title').textContent = has ? `Pengaturan: ${label(it)}` : 'Pilih item untuk mengatur';
  $('bg-opacity').disabled = !has;
  $('bg-scale').disabled = !isMedia;
  $('lbl-loop').classList.toggle('off', !isVideo);
  $('lbl-mute').classList.toggle('off', !isVideo);
  $('bg-clear').disabled = !cur;
}

// Simpan ke item; kalau item itu sedang tayang, audience ikut berubah.
function edit(patch) {
  const g = G.selectedGroup();
  const it = G.selectedItem();
  if (!g || !it) return;
  const live = isLive(it); // dicek sebelum diubah (warna mengganti src)
  G.updateItem(g.id, it.id, patch);
  if (!live) return;
  if ('src' in patch) setBackground(toBg(it));
  else patchBackground(patch);
}

// ---------- tambah file ----------
function dropFiles(paths) {
  const g = G.selectedGroup() || G.createGroup('Umum');
  const n = G.addFiles(g.id, paths);
  if (n) selectTile(g.items[g.items.length - n]); // hanya memilih, tidak menayangkan
}

async function chooseFiles() {
  const r = await openDialog({ multiple: true, filters: MEDIA_FILTER });
  if (r) dropFiles(Array.isArray(r) ? r : [r]);
}

/** Dipakai library.js (tombol BG): masuk ke grup terpilih, lalu langsung tayang. */
export function pick(src, kind) {
  const g = G.selectedGroup() || G.createGroup('Umum');
  G.addFiles(g.id, [src]);
  const it = g.items.find((i) => i.src === src);
  if (!it) return;
  selectTile(it);
  air(it);
}

// ---------- sinkronisasi dari background-state ----------
export function syncPanel(bg) {
  cur = bg || null;
  const isMedia = !!bg && bg.kind !== 'color';
  document.querySelectorAll('.lib-item').forEach((el) =>
    el.classList.toggle('active', isMedia && el.dataset.src === bg.src));
  refreshArea();
  syncSettings();
}

// ---------- init (panggil SETELAH loadGroups) ----------
export function initBackgroundPanel() {
  const refresh = () => { refreshArea(); syncSettings(); };
  on('groups-changed', refresh);
  on('selection-changed', refresh);
  on('item-updated', (it) => applyTile(it));

  // klik thumbnail = pilih + tayangkan
  $('bg-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('.bgt');
    const g = G.selectedGroup();
    if (!tile || !g) return;
    const it = g.items.find((i) => String(i.id) === tile.dataset.iid);
    if (!it) return;
    selectTile(it);
    air(it);
  });

  // keyboard: tidak boleh bocor ke shortcut ganti slide presentasi
  $('bg-slides').addEventListener('keydown', (e) => {
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Delete'].includes(k)) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === 'ArrowRight' || k === 'ArrowDown') step(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') step(-1);
    else if (k === ' ' || k === 'Enter') {
      const it = G.selectedItem();
      if (it) air(it);
    } else if (k === 'Delete') {
      const g = G.selectedGroup();
      const it = G.selectedItem();
      if (g && it) {
        askConfirm({
          key: 'delete',
          title: 'Delete item',
          message: `Remove “${label(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
        }).then((ok) => { if (ok) G.removeItem(g.id, it.id); });
      }
    }
  });

  $('bg-drop').addEventListener('click', chooseFiles);
  $('bg-drop').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      chooseFiles();
    }
  });

  // pengaturan
  $('bg-clear').addEventListener('click', () => clearBackground());
  $('bg-loop').addEventListener('change', (e) => edit({ loop: e.target.checked }));
  $('bg-mute').addEventListener('change', (e) => edit({ mute: e.target.checked }));
  $('bg-scale').addEventListener('change', (e) => edit({ scale: e.target.value }));
  const setOpacity = debounce((v) => edit({ opacity: v }));
  $('bg-opacity').addEventListener('input', (e) => setOpacity(Number(e.target.value)));
  $('bg-color').addEventListener('change', (e) => {
    const v = e.target.value;
    const it = tileItem();
    if (it && it.kind === 'color') return edit({ src: v });
    const g = G.selectedGroup() || G.createGroup('Umum');
    const n = G.addColor(g.id, v);
    if (n) selectTile(n);
  });

  // Drag & drop dari OS: di Tauri v2 path file hanya tersedia lewat event ini.
  const panel = $('media-panel');
  const over = (pos) => {
    if (!pos) return false;
    const r = window.devicePixelRatio || 1;
    const el = document.elementFromPoint(pos.x / r, pos.y / r);
    return !!(el && el.closest('#media-panel'));
  };
  const hover = (e) => panel.classList.toggle('dragover', over(e.payload && e.payload.position));
  const safe = (p) => p.catch((err) => console.warn('Drag & drop tidak tersedia:', err));
  safe(listen('tauri://drag-enter', hover));
  safe(listen('tauri://drag-over', hover));
  safe(listen('tauri://drag-leave', () => panel.classList.remove('dragover')));
  safe(listen('tauri://drag-drop', (e) => {
    panel.classList.remove('dragover');
    if (over(e.payload.position)) dropFiles(e.payload.paths || []);
  }));

  refresh();
}
