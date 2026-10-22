import { on } from "./bus.js";
import { $, debounce, baseName } from "./utils.js";
import { openDialog, listen } from "./tauri.js";
import { MEDIA_FILTER } from "./media.js";
import {
  setBackground,
  patchBackground,
  clearBackground,
  setBackgroundVisible,
  isBackgroundVisible,
} from "../background-state.js";
import * as G from "./groups.js";
import { askConfirm } from "./confirm.js";
import { showPopup } from "./tree.js";

const SR = window.SlideRenderer;

let cur = null; // background yang sedang tayang
const tiles = new Map(); // itemId -> { tile, layer, cap }
let gridSig = "";
let tileSel = null;

const tileItem = () => {
  const g = G.selectedGroup();
  return g && tileSel
    ? g.items.find((i) => String(i.id) === String(tileSel)) || null
    : null;
};

const selectTile = (it) => {
  tileSel = it.id;
  refreshArea();
  syncSettings();
};

const toBg = (it) => ({
  src: it.src,
  kind: it.kind,
  loop: it.loop,
  mute: it.mute,
  scale: it.scale,
  opacity: it.opacity,
});
const isLive = (it) => !!cur && cur.kind === it.kind && cur.src === it.src;
const label = (it) =>
  it.kind === "color" ? `Warna ${it.src}` : baseName(it.src);
const air = (it) => setBackground(toBg(it));

const div = (cls) => {
  const d = document.createElement("div");
  d.className = cls;
  return d;
};

function syncEye() {
  const b = $('bg-toggle');
  b.setAttribute('aria-pressed', String(!isBackgroundVisible()));
  b.disabled = !cur;
}

// ---------- area slide background ----------
function applyTile(it) {
  const t = tiles.get(it.id);
  if (!t) return;
  SR.renderBackground(t.layer, toBg(it), { preview: true });
  t.cap.textContent = label(it);
  t.tile.title = it.src;
}

function buildTile(it) {
  const tile = div("bgt");
  tile.dataset.iid = it.id;
  const thumb = div("bgt-thumb");
  const layer = div("bgt-layer");
  thumb.appendChild(layer);
  const cap = div("bgt-cap");
  tile.append(thumb, cap);
  tiles.set(it.id, { tile, layer, cap });
  applyTile(it);
  return tile;
}

function rebuildGrid(items) {
  // lepaskan file video lama sebelum membuang elemennya
  tiles.forEach((t) => SR.renderBackground(t.layer, null));
  tiles.clear();
  $("bg-grid").replaceChildren(...items.map(buildTile));
}

function refreshArea() {
  const g = G.selectedGroup();
  const items = g ? g.items : [];
  $("bg-drop").hidden = items.length > 0;
  $("bg-grid").hidden = items.length === 0;

  const sig = (g ? g.id : "") + "|" + items.map((i) => i.id).join(",");
  if (sig !== gridSig) {
    gridSig = sig;
    rebuildGrid(items);
  }
  for (const it of items) {
    const t = tiles.get(it.id);
    t.tile.classList.toggle("sel", tileSel === it.id);
    t.tile.classList.toggle("live", isLive(it));
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
  syncEye();
}

function editItem(it, patch) {
  const g = G.selectedGroup();
  if (!g || !it) return;
  const live = isLive(it); // check before changing (color replaces src)
  G.updateItem(g.id, it.id, patch);
  if (!live) return;
  if ("src" in patch) setBackground(toBg(it));
  else patchBackground(patch);
}

// ---------- tambah file ----------
function dropFiles(paths) {
  const g = G.selectedGroup() || G.createGroup("Umum");
  const n = G.addFiles(g.id, paths);
  if (n) selectTile(g.items[g.items.length - n]); // hanya memilih, tidak menayangkan
}

async function chooseFiles() {
  const r = await openDialog({ multiple: true, filters: MEDIA_FILTER });
  if (r) dropFiles(Array.isArray(r) ? r : [r]);
}

/** Dipakai library.js (tombol BG): masuk ke grup terpilih, lalu langsung tayang. */
export function pick(src, kind) {
  const g = G.selectedGroup() || G.createGroup("Umum");
  G.addFiles(g.id, [src]);
  const it = g.items.find((i) => i.src === src);
  if (!it) return;
  selectTile(it);
  air(it);
}

// ---------- sinkronisasi dari background-state ----------
export function syncPanel(bg) {
  cur = bg || null;
  const isMedia = !!bg && bg.kind !== "color";
  document
    .querySelectorAll(".lib-item")
    .forEach((el) =>
      el.classList.toggle("active", isMedia && el.dataset.src === bg.src),
    );
  refreshArea();
  syncSettings();
}

// ---------- right-click menu ----------
let colorTarget = null; // item whose color is being edited; null = add a new color

function pickColor(it) {
  colorTarget = it;
  const inp = $("bg-color");
  inp.value = it ? it.src : "#000000";
  inp.click();
}

const chk = (on, text) => `${on ? "☑" : "☐"}  ${text}`;

function tileMenu(e, it) {
  selectTile(it); // select only, don't put it on air
  const isColor = it.kind === "color";
  const isVideo = it.kind === "video";
  const op = it.opacity ?? 1;
  const entries = [];

  if (isColor)
    entries.push(
      { label: "Change color…", run: () => pickColor(it) },
      { sep: true },
    );

  entries.push(
    {
      label: "Scale",
      disabled: isColor,
      submenu: [
        ["fill", "Fill"],
        ["fit", "Fit"],
      ].map(([v, l]) => ({
        label: l,
        radio: it.scale === v,
        run: () => editItem(it, { scale: v }),
      })),
    },
    {
      label: `Opacity (${Math.round(op * 100)}%)`,
      submenu: [1, 0.75, 0.5, 0.25].map((v) => ({
        label: `${v * 100}%`,
        radio: Math.abs(op - v) < 0.01,
        run: () => editItem(it, { opacity: v }),
      })),
    },
    { sep: true },
    {
      label: "Loop",
      radio: !!it.loop,
      disabled: !isVideo,
      run: () => editItem(it, { loop: !it.loop }),
    },
    {
      label: "Mute",
      radio: !!it.mute,
      disabled: !isVideo,
      run: () => editItem(it, { mute: !it.mute }),
    },
  );
  showPopup(entries, { x: e.clientX, y: e.clientY });
}

function initBgZoom() {
  const grid = $("bg-grid");
  const range = $("bg-zoom");
  const out = $("bg-zoom-out");
  const inn = $("bg-zoom-in");
  if (!grid || !range) return;
  const STEP = 20;

  const apply = () => {
    const min = Number(range.min),
      max = Number(range.max),
      v = Number(range.value);
    range.style.setProperty("--fill", ((v - min) / (max - min)) * 100 + "%");
    grid.style.setProperty("--bgt", `${v}px`);
    out.disabled = v <= min;
    inn.disabled = v >= max;
  };
  const nudge = (d) => {
    range.value = Math.min(
      Number(range.max),
      Math.max(Number(range.min), Number(range.value) + d),
    );
    apply();
  };

  range.addEventListener("input", apply);
  out.addEventListener("click", () => nudge(-STEP));
  inn.addEventListener("click", () => nudge(STEP));
  apply();
}

// ---------- init (panggil SETELAH loadGroups) ----------
export function initBackgroundPanel() {
  const refresh = () => {
    refreshArea();
    syncSettings();
  };
  on("groups-changed", refresh);
  on("selection-changed", refresh);
  on("item-updated", (it) => applyTile(it));

  // klik thumbnail = pilih + tayangkan
  $("bg-grid").addEventListener("click", (e) => {
    const tile = e.target.closest(".bgt");
    const g = G.selectedGroup();
    if (!tile || !g) return;
    const it = g.items.find((i) => String(i.id) === tile.dataset.iid);
    if (!it) return;
    selectTile(it);
    air(it);
  });

  // keyboard: tidak boleh bocor ke shortcut ganti slide presentasi
  $("bg-slides").addEventListener("keydown", (e) => {
    const k = e.key;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        " ",
        "Enter",
        "Delete",
      ].includes(k)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    if (k === "ArrowRight" || k === "ArrowDown") step(1);
    else if (k === "ArrowLeft" || k === "ArrowUp") step(-1);
    else if (k === " " || k === "Enter") {
      const it = G.selectedItem();
      if (it) air(it);
    } else if (k === "Delete") {
      const g = G.selectedGroup();
      const it = G.selectedItem();
      if (g && it) {
        askConfirm({
          key: "delete",
          title: "Delete item",
          message: `Remove “${label(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
        }).then((ok) => {
          if (ok) G.removeItem(g.id, it.id);
        });
      }
    }
  });

  $("bg-drop").addEventListener("click", chooseFiles);
  $("bg-drop").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      chooseFiles();
    }
  });

  // pengaturan
    const eye = $("bg-toggle");
  eye.addEventListener("click", async () => {
    if (!cur) return;
    await setBackgroundVisible(!isBackgroundVisible());
    syncEye();
  });
  eye.addEventListener("contextmenu", async (e) => {   // right-click: remove the selection
    e.preventDefault();
    await clearBackground();
    syncEye();
  });

  // klik kanan slide = pengaturannya; klik kanan area kosong = tambah
  $("bg-slides").addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const tile = e.target.closest(".bgt");
    const g = G.selectedGroup();
    const it =
      tile && g ? g.items.find((i) => String(i.id) === tile.dataset.iid) : null;
    if (it) return tileMenu(e, it);
    showPopup(
      [
        { label: "Add files…", run: chooseFiles },
        { label: "Add solid color…", run: () => pickColor(null) },
      ],
      { x: e.clientX, y: e.clientY },
    );
  });

  $("bg-color").addEventListener("change", (e) => {
    const v = e.target.value;
    if (colorTarget) return editItem(colorTarget, { src: v });
    const g = G.selectedGroup() || G.createGroup("Umum");
    const n = G.addColor(g.id, v);
    if (n) selectTile(n);
  });

  // Drag & drop dari OS: di Tauri v2 path file hanya tersedia lewat event ini.
  const panel = $("media-panel");
  const over = (pos) => {
    if (!pos) return false;
    const r = window.devicePixelRatio || 1;
    const el = document.elementFromPoint(pos.x / r, pos.y / r);
    return !!(el && el.closest("#media-panel"));
  };
  const hover = (e) =>
    panel.classList.toggle("dragover", over(e.payload && e.payload.position));
  const safe = (p) =>
    p.catch((err) => console.warn("Drag & drop tidak tersedia:", err));
  safe(listen("tauri://drag-enter", hover));
  safe(listen("tauri://drag-over", hover));
  safe(listen("tauri://drag-leave", () => panel.classList.remove("dragover")));
  safe(
    listen("tauri://drag-drop", (e) => {
      panel.classList.remove("dragover");
      if (over(e.payload.position)) dropFiles(e.payload.paths || []);
    }),
  );

  initBgZoom();
  refresh();
}
