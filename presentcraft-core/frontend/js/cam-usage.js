import { getBackground } from "../shared/background-state.js";
import { debounce } from "./utils.js";
import { state } from "./state.js";
import { lib } from "./library.js";

const wantedCams = () => {
  const wanted = new Set();
  const add = (c) => {
    if (c?.media === "video" && !c.ndi && c.label) wanted.add(c.label);
  };

  // 1. background aktif
  const bg = getBackground();
  if (bg?.kind === "input") add(bg.input);

  // 2. item di library Media
  for (const g of lib.s.groups)
    for (const it of g.items) if (it.kind === "input") add(it.input);

  // 3. item di grup Background (groups.js)
  for (const g of state.groups || [])
    for (const it of g.items) if (it.kind === "input") add(it.input);

  // 4. layer di slide, kalau ada yang membawa input
  for (const s of state.slides || [])
    for (const l of s.layers || []) add(l.input);

  return wanted;
};

export function syncCams() {
  if (document.getElementById("inputs-dlg")?.open) return;
  window.CamSource.sync(wantedCams());
}

export const syncCamsSoon = debounce(syncCams, 100);
