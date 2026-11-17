// Filmstrip kiri: thumbnail semua slide dalam grup yang sedang diedit.
import { state } from "../state.js";
import { el } from "./dom.js";
import { ed, q, onEd, fireEd } from "./session.js";
import { payloadFor } from "./canvas.js";

const SR = window.SlideRenderer;

let thumbs = [];
const pending = new Set();
let timer = 0;

export function renderFsThumb(k) {
  const th = thumbs[k];
  if (!ed.root || !th) return;
  SR.renderThumbnail(th, payloadFor(k));
  if (th._bg) SR.renderBackground(th._bg, state.showBgInThumbs ? state.bg : null, { preview: true });
}
export const renderAllThumbs = () => thumbs.forEach((_, k) => renderFsThumb(k));

// render ulang thumbnail ditunda 120 ms supaya mengetik tidak berat
export function queueThumb(k) {
  pending.add(k);
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending.forEach(renderFsThumb);
    pending.clear();
  }, 120);
}

export function buildFilmstrip() {
  const fs = q(".ed-fs");
  fs.replaceChildren();
  thumbs = [];
  ed.items.forEach((it, k) => {
    const s = state.slides[it.index];
    const b = el("button", "ed-fs-i" + (k === ed.cur ? " sel" : ""));
    b.type = "button";
    b.dataset.k = k;
    const th = el("div", "thumb ed-fs-th");
    const cap = el("div", "ed-fs-cap");
    cap.append(el("span", "ed-fs-n", String(it.index + 1)), el("span", "ed-fs-t", s.label || ""));
    b.append(th, cap);
    fs.appendChild(b);
    thumbs[k] = th;
    renderFsThumb(k);
  });
  fs.onclick = (e) => {
    const b = e.target.closest(".ed-fs-i");
    if (b) fireEd("slide:request", Number(b.dataset.k));
  };
}

export function markCurrent() {
  q(".ed-fs")
    .querySelectorAll(".ed-fs-i")
    .forEach((b, k) => {
      b.classList.toggle("sel", k === ed.cur);
      if (k === ed.cur) b.scrollIntoView({ block: "nearest" });
    });
}

export function disposeFilmstrip() {
  clearTimeout(timer);
  pending.clear();
  thumbs = [];
}

onEd("text:changed", () => ed.root && queueThumb(ed.cur));
onEd("changed", () => ed.root && queueThumb(ed.cur));
onEd("restored", () => ed.root && renderAllThumbs());