// Panel background: pintu masuk. Bagian lain ada di js/background/*
import { on } from "./bus.js";
import { $ } from "./utils.js";
import {
  clearBackground,
  setBackgroundVisible,
  isBackgroundVisible,
} from "../shared/background-state.js";
import * as G from "./groups.js";
import { ps } from "./background/bg-shared.js";
import {
  applyTile,
  refreshArea,
  syncEye,
  syncSettings,
  initBgZoom,
} from "./background/bg-view.js";
import { previewTile, air } from "./background/bg-actions.js";
import { initDropzone } from "./background/bg-dropzone.js";
import { initBgKeys } from "./background/bg-keys.js";
import { initBgMenu } from "./background/bg-menu.js";
import { initGridNav } from "./grid-nav.js";

// Kompatibilitas: library.js dan background-state.js masih mengimpor dari file ini.
export { pick } from "./background/bg-actions.js";
export { syncPanel } from "./background/bg-view.js";

// ---------- init (panggil SETELAH loadGroups) ----------
export function initBackgroundPanel() {
  const refresh = () => {
    refreshArea();
    syncSettings();
  };
  on("groups-changed", refresh);
  on("selection-changed", refresh);
  on("item-updated", (it) => applyTile(it));

  const items = () => G.selectedGroup()?.items || [];
  initGridNav($("bg-slides"), {
    sel: ".bgt",
    cur: () => items().findIndex((i) => i.id === ps.tileSel),
    preview: (i) => previewTile(items()[i]),
    air: (i) => air(items()[i]),
  });

  initBgKeys();
  initDropzone();

  // pengaturan
  const eye = $("bg-toggle");
  eye.addEventListener("click", async () => {
    if (!ps.cur) return;
    await setBackgroundVisible(!isBackgroundVisible());
    syncEye();
  });
  eye.addEventListener("contextmenu", async (e) => {
    // right-click: remove the selection
    e.preventDefault();
    await clearBackground();
    syncEye();
  });

  initBgMenu();
  initBgZoom();
  refresh();
}
