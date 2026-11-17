import { el } from "./dom.js";
import { layerLabel } from "./fields.js";
import { ed, L, q, onEd, fireEd } from "./session.js";
import { addText } from "./shortcuts.js";

export function renderLayers() {
  const box = q(".ed-list");
  box.replaceChildren();

  const add = el("button", "ed-btn", "+ Text");
  add.type = "button";
  add.addEventListener("click", addText);
  box.appendChild(add);

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