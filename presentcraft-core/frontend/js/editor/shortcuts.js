// Pintasan keyboard editor (salin/tempel/duplikat/urutan/geser/skala) + panel panduan.
import { ed, L, fireEd } from "./session.js";
import { push } from "./history.js";
import { updateGeometry } from "./canvas.js";
import { el } from "./dom.js";

let clip = null; // tahan antar slide, bahkan antar sesi editor

const cur = () => L()[ed.sel];
const topZ = () => L().reduce((m, l) => Math.max(m, l.z ?? 0), 0);
const structure = () => {
  fireEd("structure"); // index.js: render ulang semuanya
  fireEd("changed");
  push();
};

function copy() {
  const l = cur();
  if (l) clip = structuredClone(l);
  return !!l;
}

function remove() {
  if (!cur()) return;
  L().splice(ed.sel, 1);
  ed.sel = Math.min(ed.sel, L().length - 1);
  structure();
}

function insert(src) {
  const n = structuredClone(src);
  n.z = topZ() + 1;
  n.rect = n.rect || { x: 0, y: 0, w: 100, h: 100 };
  const taken = () =>
    L().some(
      (l) =>
        l.rect &&
        Math.abs(l.rect.x - n.rect.x) < 0.01 &&
        Math.abs(l.rect.y - n.rect.y) < 0.01,
    );
  for (let k = 0; k < 20 && taken(); k++) {
    n.rect.x = +(n.rect.x + 2).toFixed(2); // tempel di posisi yang sama: geser sedikit
    n.rect.y = +(n.rect.y + 2).toFixed(2);
  }
  L().push(n);
  ed.sel = L().length - 1;
  structure();
}

function reorder(mode) {
  const ls = L();
  if (!cur()) return;
  const order = ls
    .map((_, i) => i)
    .sort((a, b) => (ls[a].z ?? 0) - (ls[b].z ?? 0) || a - b);
  const pos = order.indexOf(ed.sel);
  const to =
    mode === "up"
      ? pos + 1
      : mode === "down"
        ? pos - 1
        : mode === "front"
          ? order.length - 1
          : 0;
  if (to < 0 || to >= order.length || to === pos) return;
  order.splice(pos, 1);
  order.splice(to, 0, ed.sel);
  order.forEach((li, rank) => (ls[li].z = rank));
  structure();
}

// Kembalikan layer terpilih ke keadaan saat editor dibuka.
function resetLayer() {
  const l = cur();
  if (!l) return;
  let o = null;
  try {
    o = JSON.parse(ed.items[ed.cur].orig)[ed.sel];
  } catch {
    o = null;
  }
  const fresh =
    o && o.kind === l.kind
      ? structuredClone(o)
      : { ...l, rect: { x: 0, y: 0, w: 100, h: 100 }, rotation: 0, opacity: 1 }; // layer baru: tidak ada keadaan awal
  fresh.z = l.z; // urutan tumpukan tidak ikut direset
  L()[ed.sel] = fresh;
  structure();
}

// perubahan beruntun (panah) dicatat sebagai satu langkah undo
let commitT;
function commitSoon() {
  clearTimeout(commitT);
  commitT = setTimeout(() => {
    if (!ed.root) return;
    fireEd("changed");
    push();
  }, 400);
}

function nudge(dx, dy) {
  const l = cur();
  if (!l) return;
  const r = (l.rect = l.rect || { x: 0, y: 0, w: 100, h: 100 });
  r.x = +(r.x + dx).toFixed(2);
  r.y = +(r.y + dy).toFixed(2);
  updateGeometry(ed.sel);
  fireEd("geom");
  commitSoon();
}

// perbesar/perkecil dengan titik tengah tetap, proporsi tetap
function scaleCenter(f) {
  const l = cur();
  if (!l) return;
  const r = (l.rect = l.rect || { x: 0, y: 0, w: 100, h: 100 });
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  r.w = +Math.max(0.5, r.w * f).toFixed(2);
  r.h = +Math.max(0.5, r.h * f).toFixed(2);
  r.x = +(cx - r.w / 2).toFixed(2);
  r.y = +(cy - r.h / 2).toFixed(2);
  updateGeometry(ed.sel);
  fireEd("geom");
  commitSoon();
}

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

// true = sudah ditangani
export function handleShortcut(e) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  if (e.key === "F1" || e.key === "?") {
    e.preventDefault();
    toggleHelp();
    return true;
  }
  if (mod) {
    if (ARROWS[e.key] && cur()) {
      e.preventDefault();
      if (e.altKey && e.shiftKey) {
        const grow = e.key === "ArrowUp" || e.key === "ArrowRight";
        scaleCenter(grow ? 1.05 : 1 / 1.05);
        return true;
      }
      const st = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
      nudge(ARROWS[e.key][0] * st, ARROWS[e.key][1] * st);
      return true;
    }
    switch (k) {
      case "c":
        e.preventDefault();
        copy();
        return true;
      case "x":
        e.preventDefault();
        if (copy()) remove();
        return true;
      case "v":
        e.preventDefault();
        if (clip) insert(clip);
        return true;
      case "d":
        e.preventDefault();
        if (cur()) insert(cur());
        return true;
      case "r":
        e.preventDefault();
        resetLayer();
        return true;
      case "]":
      case "}":
        e.preventDefault();
        reorder(e.shiftKey ? "front" : "up");
        return true;
      case "[":
      case "{":
        e.preventDefault();
        reorder(e.shiftKey ? "back" : "down");
        return true;
    }
    return false;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (!cur()) return false;
    e.preventDefault();
    remove();
    return true;
  }

  if (e.key === "Tab") {
    const n = L().length;
    if (!n) return false;
    e.preventDefault();
    const next =
      ed.sel < 0
        ? e.shiftKey
          ? n - 1
          : 0
        : (ed.sel + (e.shiftKey ? -1 : 1) + n) % n;
    fireEd("layer:request", next);
    return true;
  }
  return false;
}

// ---------- panel panduan ----------
const KEYS = [
  ["Ctrl+Z", "Undo"],
  ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
  ["Ctrl+C / Ctrl+X / Ctrl+V", "Salin / potong / tempel layer"],
  ["Ctrl+D", "Duplikat layer"],
  ["Delete / Backspace", "Hapus layer"],
  ["← → ↑ ↓", "Slide sebelumnya / berikutnya"],
  ["Ctrl+← → ↑ ↓", "Geser layer 1% (Shift 5%, Alt 0,1%)"],
  ["Ctrl+Alt+Shift+← → ↑ ↓", "Perbesar / perkecil dari tengah"],
  ["Ctrl+] / Ctrl+[", "Naikkan / turunkan urutan layer"],
  ["Ctrl+Shift+] / [", "Ke paling depan / belakang"],
  ["Ctrl+R", "Kembalikan layer ke keadaan awal"],
  ["Tab / Shift+Tab", "Layer berikutnya / sebelumnya"],
  ["PageUp / PageDown", "Slide sebelumnya / berikutnya"],
  ["Ctrl+S", "Simpan"],
  ["Esc", "Tutup panduan / batal"],
  ["F1 atau ?", "Panduan ini"],
];
const MOUSE = [
  ["Seret layer", "Pindah (Shift: kunci sumbu, Alt: tanpa snap)"],
  ["Seret handle kotak", "Ubah ukuran"],
  ["Handle + Alt", "Ubah ukuran dari tengah"],
  ["Handle + Shift", "Proporsi tetap"],
  ["Handle + Alt + Shift", "Dari tengah, proporsi tetap"],
  ["Seret lingkaran di atas kotak", "Putar (Shift: kelipatan 15°)"],
  ["Klik teks", "Edit teks langsung"],
  ["Klik area kosong", "Sembunyikan kotak seleksi"],
  ["Seret label (X, Y, W, H, Rotasi)", "Ubah nilai kontinu (Shift: halus ×0,1)"],
  ["↑ ↓ / klik ▲▼ di kolom angka", "± 1 satuan (Shift: 10, Alt: 0,1)"],
  ["Ketik di kolom angka", "Nilai persis, Enter untuk menerapkan"],
];

export const helpOpen = () => !!(ed.root && ed.root.querySelector(".ed-help"));

export function closeHelp() {
  const h = ed.root && ed.root.querySelector(".ed-help");
  if (h) h.remove();
  if (ed.root) ed.root.focus();
}

export function toggleHelp() {
  if (!ed.root) return;
  if (helpOpen()) return closeHelp();
  const wrap = el("div", "ed-help");
  const card = el("div", "ed-help-card");
  card.appendChild(el("h3", null, "Pintasan & kontrol"));
  
    // kolom kiri keyboard: tiap kombinasi (dipisah " / ") jadi <kbd> sendiri
  const keyCell = (text) => {
    const td = el("td", "hk-key");
    text.split(" / ").forEach((combo, i) => {
      if (i) td.append(" atau ");
      td.appendChild(el("kbd", null, combo));
    });
    return td;
  };

  const sect = (title, rows, mouse = false) => {
    const t = el("table", "ed-help-table");
    t.appendChild(el("caption", null, title));

    const head = el("tr");
    head.append(
      el("th", null, mouse ? "Aksi" : "Pintasan"),
      el("th", null, mouse ? "Hasil" : "Fungsi"),
    );
    const thead = el("thead");
    thead.appendChild(head);

    const tbody = el("tbody");
    for (const [a, b] of rows) {
      const tr = el("tr");
      tr.append(mouse ? el("td", "hk-act", a) : keyCell(a), el("td", null, b));
      tbody.appendChild(tr);
    }
    t.append(thead, tbody);
    card.appendChild(t);
  };
  sect("Keyboard", KEYS);
  sect("Mouse & panel Properties", MOUSE, true);
  
  wrap.appendChild(card);
  wrap.addEventListener("pointerdown", (e) => {
    if (e.target === wrap) closeHelp();
  });
  ed.root.appendChild(wrap);
}
