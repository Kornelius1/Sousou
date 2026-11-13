// Kanvas tengah: render pratinjau slide, overlay seleksi, dan interaksi drag/resize/rotate.
import { state } from "../state.js";
import { toPayload } from "../audience.js";
import { el } from "./dom.js";
import { isText } from "./fields.js";
import { ed, L, q, fireEd } from "./session.js";
import { push } from "./history.js";

const SR = window.SlideRenderer;
const SGN = () => (SR.ROTATION_SIGN ?? -1);

// hideIdx >= 0: teks layer itu dikosongkan (saat diedit di tempat)
// _i = indeks layer asli, dipakai jalur cepat untuk menemukan elemennya
export function payloadFor(k, hideIdx = -1) {
  const it = ed.items[k];
  const layers = it.layers.map((l, i) => ({ ...l, _i: i, ...(i === hideIdx ? { text: "" } : null) }));
  return toPayload({ ...state.slides[it.index], layers });
}

function renderPreviewNow() {
  if (!ed.root) return;
  const host = q(".ed-render");
  SR.renderThumbnail(host, payloadFor(ed.cur, ed.editing ? ed.editing.i : -1));
  if (host._bg) SR.renderBackground(host._bg, ed.showBg ? state.bg : null, { preview: true });
}

// banyak perubahan beruntun dalam satu frame digabung jadi satu render
let raf = 0;
export function renderPreview() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderPreviewNow();
  });
}

// Jalur cepat: hanya memperbarui posisi/ukuran/rotasi/opasitas satu elemen yang sudah ada.
function previewLayerFast(i) {
  if (!SR.applyLayerBox || ed.editing) return false;
  const host = q(".ed-render");
  const st = host && host._stage;
  if (!st) return false;
  const wrap = st.querySelector(`[data-li="${i}"]`);
  const pl = payloadFor(ed.cur).layers.find((x) => x._i === i);
  if (!wrap || !pl) return false;
  SR.applyLayerBox(wrap, pl);
  return true;
}

// posisi/ukuran kotak sebuah layer di atas kanvas (persen, sama dengan data layer)
export const boxStyle = (l) => {
  const r = l.rect || { x: 0, y: 0, w: 100, h: 100 };
  const rot = (SGN() * (Number(l.rotation) || 0)) % 360;
  return {
    left: r.x + "%",
    top: r.y + "%",
    width: r.w + "%",
    height: r.h + "%",
    transform: rot ? `rotate(${rot}deg)` : "",
  };
};

// Perubahan geometri satu layer: kotak overlay + pratinjau, tanpa membangun ulang apa pun.
export function updateGeometry(i = ed.sel) {
  const l = L()[i];
  if (!l) return;
  const b = q(`.ed-hit[data-i="${i}"]`);
  if (b) Object.assign(b.style, boxStyle(l));
  if (!previewLayerFast(i)) renderPreview();
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function renderOverlay() {
  const ov = q(".ed-ov");
  ov.replaceChildren();
  const layers = L();
  const order = layers.map((_, i) => i).sort((a, b) => (layers[a].z ?? 0) - (layers[b].z ?? 0) || a - b);
  for (const i of order) {
    const l = layers[i];
    const b = el("div", "ed-hit" + (i === ed.sel ? " sel" : "") + (isText(l) ? " txt" : ""));
    b.dataset.i = i;
    Object.assign(b.style, boxStyle(l));
    if (i === ed.sel) {
      for (const h of HANDLES) {
        const d = el("div", "ed-h");
        d.dataset.h = h;
        b.appendChild(d);
      }
      const r = el("div", "ed-rot");
      r.dataset.h = "rot";
      b.appendChild(r);
    }
    ov.appendChild(b);
  }
}

// ---------- drag: pindah / ubah ukuran / putar ----------
const HDIR = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const MIN_PX = 12;
const SNAP = 1; // persen
const r2 = (v) => +v.toFixed(2);

function snapAxis(v, size) {
  let best = null;
  for (const off of [0, size / 2, size])
    for (const t of [0, 50, 100]) {
      const d = t - (v + off);
      if (Math.abs(d) <= SNAP && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
  return best;
}

function guide(ov, axis, pos) {
  let g = ov.querySelector(`.ed-guide.${axis}`);
  if (pos == null) {
    if (g) g.remove();
    return;
  }
  if (!g) {
    g = el("div", "ed-guide " + axis);
    ov.appendChild(g);
  }
  g.style[axis === "v" ? "left" : "top"] = pos + "%";
}

function startDrag(ov, e, i, mode) {
  const l = L()[i];
  if (!l) return;
  const r = (l.rect = l.rect || { x: 0, y: 0, w: 100, h: 100 });
  const box = ov.getBoundingClientRect();
  const W = box.width;
  const H = box.height;
  if (!W || !H) return;
  const s = { x: r.x, y: r.y, w: r.w, h: r.h, rot: Number(l.rotation) || 0 };
  const th = (SGN() * s.rot * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const cx0 = box.left + ((s.x + s.w / 2) / 100) * W;
  const cy0 = box.top + ((s.y + s.h / 2) / 100) * H;
  const a0 = Math.atan2(e.clientY - cy0, e.clientX - cx0);
  const px = e.clientX;
  const py = e.clientY;
  let moved = false;
  ov.setPointerCapture(e.pointerId);

  const move = (ev) => {
    const dx = ev.clientX - px;
    const dy = ev.clientY - py;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;

    if (mode === "move") {
      let nx = s.x + (dx / W) * 100;
      let ny = s.y + (dy / H) * 100;
      const lockY = ev.shiftKey && Math.abs(dx) > Math.abs(dy);
      const lockX = ev.shiftKey && !lockY;
      if (lockY) ny = s.y;
      if (lockX) nx = s.x;
      const a = ev.altKey || lockX ? null : snapAxis(nx, s.w);
      const b = ev.altKey || lockY ? null : snapAxis(ny, s.h);
      if (a) nx += a.d;
      if (b) ny += b.d;
      guide(ov, "v", a ? a.t : null);
      guide(ov, "h", b ? b.t : null);
      r.x = r2(nx);
      r.y = r2(ny);
    } else if (mode === "rot") {
      const a = Math.atan2(ev.clientY - cy0, ev.clientX - cx0);
      let deg = s.rot + SGN() * (((a - a0) * 180) / Math.PI);
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      l.rotation = +((((deg % 360) + 360) % 360).toFixed(1));
    } else {
      const [sx, sy] = HDIR[mode];
      // vektor geser dalam sumbu lokal layer (kebalikan rotasi)
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const w = (s.w * W) / 100;
      const h = (s.h * H) / 100;
      const k2 = ev.altKey ? 2 : 1; // Alt: dari tengah, kedua sisi bergerak
      let nw = w + sx * lx * k2;
      let nh = h + sy * ly * k2;
      if (ev.shiftKey) {
        // Shift: proporsi tetap (sudut maupun sisi)
        let k;
        if (sx && sy) k = Math.max(nw / w, nh / h);
        else if (sx) k = nw / w;
        else k = nh / h;
        k = Math.max(k, MIN_PX / w, MIN_PX / h);
        nw = w * k;
        nh = h * k;
      }
      nw = Math.max(MIN_PX, nw);
      nh = Math.max(MIN_PX, nh);
      // tanpa Alt: sisi/sudut yang berseberangan tetap diam (pusat bergeser setengah selisih)
      const ox = ev.altKey ? 0 : (sx * (nw - w)) / 2;
      const oy = ev.altKey ? 0 : (sy * (nh - h)) / 2;
      const ncx = cx0 + ox * cos - oy * sin;
      const ncy = cy0 + ox * sin + oy * cos;
      r.w = r2((nw / W) * 100);
      r.h = r2((nh / H) * 100);
      r.x = r2(((ncx - box.left - nw / 2) / W) * 100);
      r.y = r2(((ncy - box.top - nh / 2) / H) * 100);
    }
    updateGeometry(i);
    fireEd("geom");
  };

  const up = () => {
    ov.removeEventListener("pointermove", move);
    ov.removeEventListener("pointerup", up);
    ov.removeEventListener("pointercancel", up);
    guide(ov, "v", null);
    guide(ov, "h", null);
    if (moved) {
      fireEd("changed");
      push();
    } else if (mode === "move" && isText(L()[i] || {})) {
      fireEd("hit", { i, x: px, y: py }); // klik tanpa geser pada teks: edit di tempat
    }
  };
  ov.addEventListener("pointermove", move);
  ov.addEventListener("pointerup", up);
  ov.addEventListener("pointercancel", up);
}

// Dipanggil sekali setiap editor dibuka (DOM-nya baru).
export function initCanvas() {
  const ov = q(".ed-ov");
  ov.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const hit = e.target.closest(".ed-hit");
    if (!hit) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    ed.root.focus(); // supaya pintasan keyboard tetap jalan setelah klik
    if (ed.editing) fireEd("edit:end"); 
    const i = Number(hit.dataset.i);
    if (i !== ed.sel) fireEd("layer:request", i);
    const h = e.target.closest(".ed-h, .ed-rot");
    startDrag(ov, e, i, h ? h.dataset.h : "move");
  });
  q(".ed-stage").addEventListener("mousedown", (e) => {
    if (!e.target.closest(".ed-hit, .ed-editbox")) fireEd("stage:blank");
  });
}