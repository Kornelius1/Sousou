// Menu klik kanan (tile dan area kosong) + color picker.
import { $ } from "../utils.js";
import { showPopup } from "../tree.js";
import * as G from "../groups.js";
import { chooseFiles } from "./bg-dropzone.js";
import { selectTile, editItem } from "./bg-actions.js";

let colorTarget = null; // item whose color is being edited; null = add a new color

function pickColor(it) {
  colorTarget = it;
  const inp = $("bg-color");
  inp.value = it ? it.src : "#000000";
  inp.click();
}

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

export function initBgMenu() {
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
}