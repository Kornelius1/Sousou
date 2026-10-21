// Panel Layers (kanan bawah): daftar layer slide aktif.
import { el } from "./dom.js";
import { layerLabel } from "./fields.js";
import { ed, L, q, onEd, fireEd } from "./session.js";

export function renderLayers() {
  const box = q(".ed-list");
  box.replaceChildren();
  if (!L().length) {
    box.appendChild(el("p", "ed-empty", "Slide ini belum punya layer."));
    return;
  }
  L().forEach((l, i) => {
    const row = el("button", "ed-layer" + (i === ed.sel ? " sel" : ""), layerLabel(l, i));
    row.type = "button";
    row.addEventListener("click", () => fireEd("layer:request", i));
    box.appendChild(row);
  });
}

// pembaruan label di tempat (tanpa membangun ulang daftar) supaya klik yang sedang berlangsung tidak hilang
export function updateLayerLabel(i) {
  const row = q(".ed-list").querySelectorAll(".ed-layer")[i];
  if (row && L()[i]) row.textContent = layerLabel(L()[i], i);
}

onEd("text:changed", ({ i }) => ed.root && updateLayerLabel(i));