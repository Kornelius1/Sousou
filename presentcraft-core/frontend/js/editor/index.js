// Pengendali editor: membuka/menutup, Simpan/Batal, pintasan keyboard, dan merangkai modul lain.
// Modul UI (canvas, filmstrip, layers, inspector, textedit) tidak saling memanggil;
// mereka berkabar lewat event di session.js, dan keputusan navigasinya diambil di sini.
import { setStatus } from "../utils.js";
import { state } from "../state.js";
import { emit } from "../bus.js";
import { askConfirm } from "../confirm.js";
import { el } from "./dom.js";
import { isText } from "./fields.js";
import { ed, L, q, snapshot, isDirty, onEd } from "./session.js";
import { resetHistory, go } from "./history.js";
import { initCanvas, renderOverlay, renderPreview } from "./canvas.js";
import { startEdit, endEdit, styleEditBox } from "./textedit.js";
import { buildFilmstrip, markCurrent, disposeFilmstrip } from "./filmstrip.js";
import { renderLayers } from "./layers.js";
import { renderFields } from "./inspector.js";
import {
  handleShortcut,
  toggleHelp,
  closeHelp,
  helpOpen,
} from "./shortcuts.js";

let ro = null; // ResizeObserver kanvas

// ---------- render gabungan ----------
function syncHistoryButtons() {
  q('[data-a="undo"]').disabled = ed.hi === 0;
  q('[data-a="redo"]').disabled = ed.hi >= ed.hist.length - 1;
}

function updateHeader() {
  const s = state.slides[ed.items[ed.cur].index];
  q(".ed-title").textContent =
    s.folder_name || state.bundleName || "Edit slide";
  q(".ed-count").textContent = `${ed.cur + 1} / ${ed.items.length}`;
  markCurrent();
}

function renderAll() {
  renderLayers();
  renderFields();
  renderOverlay();
  renderPreview();
  updateHeader();
  syncHistoryButtons();
}

// ---------- navigasi ----------
// layer awal yang dipilih pada sebuah slide: teks pertama, kalau tidak ada layer pertama
const initialSel = () => {
  const i = L().findIndex(isText);
  return L().length ? (i >= 0 ? i : 0) : -1;
};

function selectLayer(i) {
  endEdit();
  ed.sel = i;
  renderLayers();
  renderFields();
  renderOverlay();
}

function selectSlide(k) {
  if (k < 0 || k >= ed.items.length || k === ed.cur) return;
  endEdit();
  ed.cur = k;
  ed.sel = initialSel();
  renderAll();
}

const undo = () => {
  endEdit();
  go(-1);
};
const redo = () => {
  endEdit();
  go(1);
};

onEd("layer:request", (i) => ed.root && selectLayer(i));
onEd("slide:request", (k) => ed.root && selectSlide(k));
onEd("stage:blank", () => {
  if (!ed.root) return;
  endEdit();
  if (ed.sel !== -1) selectLayer(-1); // klik area kosong: sembunyikan kotak seleksi
});
onEd("edit:end", () => ed.root && endEdit());
onEd("history", () => ed.root && syncHistoryButtons());
onEd("restored", () => ed.root && renderAll());
onEd("structure", () => ed.root && renderAll());
// klik layer di kanvas: pilih; kalau teks, langsung diedit di tempat
onEd("hit", ({ i, x, y }) => {
  if (!ed.root) return;
  selectLayer(i);
  if (isText(L()[i])) startEdit(i, x, y);
});

// ---------- tutup / simpan / batal ----------
function close() {
  if (!ed.root) return;
  window.removeEventListener("keydown", onKeyCapture, true);
  ro?.disconnect();
  ro = null;
  disposeFilmstrip();
  ed.editing = null;
  ed.root.remove();
  ed.root = null;
  ed.items = [];
}

function save() {
  endEdit();
  let n = 0;
  let mem = 0;
  for (const it of ed.items) {
    if (JSON.stringify(it.layers) === it.orig) continue;
    const s = state.slides[it.index];
    emit("slide:edited", {
      index: it.index,
      groupId: s.groupId,
      itemId: s.itemId,
      layers: it.layers,
    });
    n++;
    if (!s.itemId) mem++;
  }
  close();
  setStatus(
    !n
      ? "Tidak ada perubahan."
      : mem
        ? `${n} slide diubah (${mem} belum ada di library, hanya di memori).`
        : `${n} slide disimpan.`,
  );
}

async function cancel() {
  endEdit();
  if (!isDirty()) return close();
  const ok = await askConfirm({
    key: "discard-edit",
    title: "Buang perubahan",
    message: "Perubahan pada slide-slide ini belum disimpan. Buang?",
  });
  if (ok) close();
}

function onKey(e) {
  e.stopPropagation(); // jangan bocor ke pintasan global (B, panah, dst.)
  const typing =
    e.target.isContentEditable || e.target.matches("textarea, select, input");
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  // webview memuat ulang halaman pada Ctrl+R: cegah di semua kondisi
  if (mod && (k === "r" || k === "d")) e.preventDefault();
  if (e.key === "Escape") return helpOpen() ? closeHelp() : cancel();
  if (mod && k === "s") {
    e.preventDefault();
    return save();
  }
  if (typing) return;
  if (mod && k === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (mod && k === "y") {
    e.preventDefault();
    redo();
  } else if (e.key === "PageDown") {
    e.preventDefault();
    selectSlide(ed.cur + 1);
  } else if (e.key === "PageUp") {
    e.preventDefault();
    selectSlide(ed.cur - 1);
  } else if (!mod && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
    e.preventDefault();
    selectSlide(ed.cur + 1);
  } else if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
    e.preventDefault();
    selectSlide(ed.cur - 1);
  } else handleShortcut(e);
}

// Fase capture di window: editor mendapat tombol lebih dulu daripada pintasan global
// (panah tidak lagi memindah slide). Saat mengetik di kolom isian, biarkan alur normal.
function onKeyCapture(e) {
  if (!ed.root) return;
  const t = e.target;
  const inside =
    ed.root.contains(t) ||
    t === document.body ||
    t === document.documentElement;
  if (!inside) return; // mis. dialog konfirmasi di luar editor
  const typing =
    t.isContentEditable || (t.matches && t.matches("textarea, select, input"));
  if (typing) return;
  e.stopImmediatePropagation();
  onKey(e);
}

// ---------- buka ----------
const SKELETON = `
  <header class="ed-top">
    <b class="ed-title"></b><span class="ed-count"></span>
    <span class="ed-sp"></span>
    <button class="ed-btn" data-a="undo" title="Undo (Ctrl+Z)">Undo</button>
    <button class="ed-btn" data-a="redo" title="Redo (Ctrl+Y)">Redo</button>
    <span class="ed-vr"></span>
    <button class="ed-btn" data-a="bg" aria-pressed="true" title="Tampilkan / sembunyikan background">Background</button>
    <span class="ed-vr"></span>
    <button class="ed-btn" data-a="help" title="Pintasan keyboard (F1)">?</button>
    <span class="ed-vr"></span>
    <button class="ed-btn" data-a="cancel" title="Batal (Esc)">Batal</button>
    <button class="ed-btn primary" data-a="save" title="Simpan (Ctrl+S)">Simpan</button>
  </header>
  <div class="ed-body">
    <aside class="ed-fs" aria-label="Slide dalam grup"></aside>
    <section class="ed-stage">
      <div class="ed-canvas">
        <div class="thumb ed-render"></div>
        <div class="ed-ov"></div>
        <div class="ed-eb"></div>
      </div>
    </section>
    <aside class="ed-dock">
      <section class="ed-panel ed-props"><div class="ed-ph">Properties</div><div class="ed-fields"></div></section>
      <section class="ed-panel ed-lay"><div class="ed-ph">Layers</div><div class="ed-list"></div></section>
    </aside>
  </div>`;

export function openEditor(i) {
  if (ed.root) return;
  const s0 = state.slides[i];
  if (!s0) return setStatus("Pilih sebuah slide dulu.");

  // semua slide dalam grup yang sama; slide tanpa groupId (hasil import) = seluruh grid
  const idxs = state.slides
    .map((_, k) => k)
    .filter(
      (k) => s0.groupId == null || state.slides[k].groupId === s0.groupId,
    );
  ed.items = idxs.map((k) => {
    const layers = state.slides[k].layers || [];
    return {
      index: k,
      layers: structuredClone(layers),
      orig: JSON.stringify(layers),
    };
  });
  for (const it of ed.items) {
    if (!it.layers.length) {
      it.layers.push({
        kind: "text",
        z: 1,
        rect: { x: 10, y: 25, w: 80, h: 50 },
        rotation: 0,
        opacity: 1,
        path: null,
        status: null,
        inner: null,
        scale: null,
        muted: null,
        looped: null,
        stop_on_clear: null,
        color: null,
        text: "Teks",
        style: null,
      });
    }
  }
  ed.cur = Math.max(0, idxs.indexOf(i));
  ed.sel = initialSel();
  ed.showBg = true;
  ed.editing = null;
  resetHistory();

  const root = el("div", "ed-root");
  root.tabIndex = -1;
  root.innerHTML = SKELETON;
  ed.root = root;

  root.addEventListener("keydown", onKey);
  window.addEventListener("keydown", onKeyCapture, true);
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-a]");
    if (!btn) return;
    const a = btn.dataset.a;
    if (a === "save") save();
    else if (a === "cancel") cancel();
    else if (a === "undo") undo();
    else if (a === "redo") redo();
    else if (a === "bg") {
      ed.showBg = !ed.showBg;
      btn.setAttribute("aria-pressed", String(ed.showBg));
      renderPreview();
    } else if (a === "help") toggleHelp();
  });

  document.body.appendChild(root);
  ro = new ResizeObserver(() => styleEditBox());
  ro.observe(q(".ed-canvas"));
  initCanvas();
  buildFilmstrip();
  renderAll();
  root.focus();
}

// Tombol pensil (#tb-edit): didelegasikan di sini, jadi tidak bergantung pada urutan inisialisasi.
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#tb-edit")) return;
  if (!state.slides.length) return setStatus("Belum ada slide.");
  openEditor(state.activeIndex >= 0 ? state.activeIndex : 0);
});
