// Tampilan panel background: grid tile, tombol mata, sinkronisasi, zoom.
import { $ } from "../utils.js";
import { isBackgroundVisible } from "../../background-state.js";
import * as G from "../groups.js";
import { ps, toBg, isLive, label } from "./bg-shared.js";

const SR = window.SlideRenderer;

const tiles = new Map(); // itemId -> { tile, layer, cap }
let gridSig = "";

const div = (cls) => {
  const d = document.createElement("div");
  d.className = cls;
  return d;
};

export function syncEye() {
  const b = $("bg-toggle");
  b.setAttribute("aria-pressed", String(!isBackgroundVisible()));
  b.disabled = !ps.cur;
}

// ---------- area slide background ----------
export function applyTile(it) {
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

export function refreshArea() {
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
    t.tile.classList.toggle("sel", ps.tileSel === it.id);
    t.tile.classList.toggle("live", isLive(it));
  }
}

// ---------- kolom pengaturan ----------
export function syncSettings() {
  syncEye();
}

// ---------- sinkronisasi dari background-state ----------
export function syncPanel(bg) {
  ps.cur = bg || null;
  const isMedia = !!bg && bg.kind !== "color";
  document
    .querySelectorAll(".lib-item")
    .forEach((el) =>
      el.classList.toggle("active", isMedia && el.dataset.src === bg.src),
    );
  refreshArea();
  syncSettings();
}

// ---------- zoom thumbnail ----------
export function initBgZoom() {
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