// Entry point: inisialisasi semua modul. Tidak ada logika bisnis di sini.
import {
  onBackgroundChange,
  loadBackground,
  setBackgroundVisible,
  isBackgroundVisible,
  onBackgroundVisible,
} from "../shared/background-state.js";
import { state } from "./state.js";
import { initMenu } from "./menu.js";
import { initToolbar, initShortcuts } from "./toolbar.js";
import {
  initSorter,
  refreshThumbBackgrounds,
  initBlankDeck,
} from "./sorter/sorter.js";
import {
  initPreview,
  renderPreview,
  refreshPreviewBackground,
} from "./preview.js";
import { initProperties } from "./properties.js";
import { initLibrary, renderLibrary, lib, refreshGrid } from "./library.js";
import { initBackgroundPanel, syncPanel } from "./background-panel.js";
import { loadGroups, migrateBackground } from "./groups.js";
import { initExplorer } from "./explorer.js";
import { initPanels } from "./panels.js";
import * as M from "./mixer-state.js";
import { initMixerPanel } from "./mixer-panel.js";
import { syncCamsSoon } from "./cam-usage.js";
import { on } from "./bus.js";
import { broadcastMessage } from "./message-state.js";
import { initMessagePanel } from "./message-panel.js";

initMenu();
initToolbar();
initShortcuts();
initSorter();
initPreview();
initProperties();
await lib.load();
initLibrary();
initPanels();
initMixerPanel();
initMessagePanel(); 

// Listener dipasang sebelum membaca disk, agar event yang datang saat startup tidak terlewat.
await onBackgroundChange((bg) => {
  state.bg = bg;
  refreshPreviewBackground();
  syncPanel(bg);
  syncCamsSoon();
});

await onBackgroundVisible((v) => {
  M.setLive(v); // sinyal live untuk Auto On / Auto Off
  refreshPreviewBackground();
  syncPanel(state.bg);
});

state.bg = await loadBackground();
await M.loadMixer();
const hadGroups = await loadGroups();
if (!hadGroups) migrateBackground(state.bg);

// Semua yang bergantung pada grup dan background dipanggil setelah keduanya dimuat.
initExplorer();
initBackgroundPanel();
window.__TAURI__.event.listen("audience-ready", () => {
  setBackgroundVisible(isBackgroundVisible());
  M.broadcast();
  broadcastMessage(); 
});
syncPanel(state.bg);
refreshThumbBackgrounds();
renderLibrary();
refreshGrid();
renderPreview();
on("groups-changed", syncCamsSoon);
on("lib-changed", syncCamsSoon);
