// Aksi pada background: pilih tile, tayangkan, edit properti, pick dari library.
import {
  setBackground,
  patchBackground,
} from "../../shared/background-state.js";
import * as G from "../groups.js";
import { ps, toBg, isLive } from "./bg-shared.js";
import { refreshArea, syncSettings } from "./bg-view.js";

export const selectTile = (it) => {
  ps.tileSel = it.id;
  refreshArea();
  syncSettings();
};

export const air = (it) => setBackground(toBg(it));

export function editItem(it, patch) {
  const g = G.selectedGroup();
  if (!g || !it) return;
  const live = isLive(it); // check before changing (color replaces src)
  G.updateItem(g.id, it.id, patch);
  if (!live) return;
  if ("src" in patch) setBackground(toBg(it));
  else patchBackground(patch);
}

/** Dipakai library.js (tombol BG): masuk ke grup terpilih, lalu langsung tayang. */
export function pick(src, kind, input) {
  const g = G.selectedGroup() || G.createGroup("Umum");
  let it;
  if (kind === "input") {
    if (!input) return;
    it =
      g.items.find(
        (i) =>
          i.kind === "input" &&
          i.input?.name === input.name &&
          i.input?.deviceId === input.deviceId,
      ) || G.addInput(g.id, input);
  } else {
    G.addFiles(g.id, [src]);
    it = g.items.find((i) => i.src === src);
  }
  if (!it) return;
  selectTile(it);
  air(it);
}
