// Panel Properties: Ratakan, Rotasi, Opasitas untuk layer terpilih.
import { $, clamp, round } from "./utils.js";
import { state, curLayer } from "./state.js";
import { on } from "./events.js";
import { scheduleEmit } from "./audience.js";
import { renderThumb, refreshThumbBackgrounds } from "./sorter/sorter.js";
import { renderPreviewSoon } from "./preview.js";

function alignLayer(l, how) {
  const r = (l.rect ||= { x: 0, y: 0, w: 100, h: 100 });
  const f = {
    left: () => (r.x = 0),
    center: () => (r.x = (100 - r.w) / 2),
    right: () => (r.x = 100 - r.w),
    top: () => (r.y = 0),
    middle: () => (r.y = (100 - r.h) / 2),
    bottom: () => (r.y = 100 - r.h),
  }[how];
  if (f) f();
}

function fillProps() {
  const slide = state.slides[state.activeIndex];
  const has = !!slide && (slide.layers || []).length > 0;
  $("props-empty").hidden = has;
  $("props-body").hidden = !has;
  $("props-empty").textContent = slide
    ? "The slide doesn't have layers"
    : "Select a slide..";
  if (has) fillFields();
}

// pengganti rebuildLayerSelect: hanya menentukan layer terpilih
function pickLayer(want) {
  const layers = state.slides[state.activeIndex]?.layers || [];
  const firstText = layers.findIndex((l) => l.kind === "text");
  state.selectedLayer = layers.length
    ? want != null
      ? want
      : firstText >= 0
        ? firstText
        : 0
    : -1;
  fillProps();
}

function fillFields() {
  const l = curLayer();
  if (!l) return;
  $("p-opacity").value = l.opacity;
  $("p-opacity-v").textContent = Math.round(l.opacity * 100) + "%";
  $("p-rotation").value = round(l.rotation || 0);
}

function touched() {
  renderThumb(state.activeIndex);
  refreshThumbBackgrounds();
  renderPreviewSoon();
  scheduleEmit(state.activeIndex);
}

function bind(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    const l = curLayer();
    if (!l) return;
    const v = e.target.valueAsNumber;
    if (!Number.isFinite(v)) return;
    fn(l, v);
    touched();
  });
}

export function initProperties() {
  bind("p-opacity", (l, v) => {
    l.opacity = clamp(v, 0, 1);
    $("p-opacity-v").textContent = Math.round(l.opacity * 100) + "%";
  });
  bind("p-rotation", (l, v) => {
    l.rotation = v;
  });

  $("props").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ralign]");
    const l = curLayer();
    if (!b || !l) return;
    alignLayer(l, b.dataset.ralign);
    touched();
  });

  on("slides:loaded", fillProps);
  on("slide:shown", (changed) => {
    if (changed) pickLayer();
  });
  on("layer:added", (index) => {
    pickLayer(index);
    touched();
  });
}
