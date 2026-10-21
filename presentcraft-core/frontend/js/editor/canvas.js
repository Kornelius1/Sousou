// Kanvas tengah: render pratinjau slide dan kotak transparan (overlay) untuk memilih layer.
import { state } from "../state.js";
import { toPayload } from "../audience.js";
import { el } from "./dom.js";
import { isText } from "./fields.js";
import { ed, L, q, fireEd } from "./session.js";

const SR = window.SlideRenderer;

// hideIdx >= 0: teks layer itu dikosongkan (dipakai saat layer sedang diedit di tempat)
export function payloadFor(k, hideIdx = -1) {
  const it = ed.items[k];
  const layers = hideIdx < 0 ? it.layers : it.layers.map((l, i) => (i === hideIdx ? { ...l, text: "" } : l));
  return toPayload({ ...state.slides[it.index], layers });
}

export function renderPreview() {
  const host = q(".ed-render");
  SR.renderThumbnail(host, payloadFor(ed.cur, ed.editing ? ed.editing.i : -1));
  // sama seperti refreshThumbBackgrounds di sorter.js
  if (host._bg) SR.renderBackground(host._bg, ed.showBg ? state.bg : null, { preview: true });
}

// posisi/ukuran kotak sebuah layer di atas kanvas (persen, sama dengan data layer)
export const boxStyle = (l) => {
  const r = l.rect || { x: 0, y: 0, w: 100, h: 100 };
  const rot = Number(l.rotation) % 360;
  return {
    left: r.x + "%",
    top: r.y + "%",
    width: r.w + "%",
    height: r.h + "%",
    transform: rot ? `rotate(${rot}deg)` : "",
  };
};

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
    ov.appendChild(b);
  }
}

// Dipanggil sekali setiap editor dibuka (DOM-nya baru). Hanya melaporkan klik lewat event.
export function initCanvas() {
  q(".ed-ov").addEventListener("mousedown", (e) => {
    const b = e.target.closest(".ed-hit");
    if (!b || e.button !== 0) return;
    e.preventDefault();
    fireEd("hit", { i: Number(b.dataset.i), x: e.clientX, y: e.clientY });
  });
  q(".ed-stage").addEventListener("mousedown", (e) => {
    if (!e.target.closest(".ed-hit, .ed-editbox")) fireEd("stage:blank");
  });
}