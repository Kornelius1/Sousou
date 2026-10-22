// Entry point: inisialisasi semua modul. Tidak ada logika bisnis di sini.
import {
  onBackgroundChange,
  loadBackground,
  setBackgroundVisible,
  isBackgroundVisible,
  onBackgroundVisible,
} from "../background-state.js";
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

initMenu();
initToolbar();
initShortcuts();
initSorter();
initPreview();
initProperties();
await lib.load();
initLibrary();

// Listener dipasang sebelum membaca disk, agar event yang datang saat startup tidak terlewat.
await onBackgroundChange((bg) => {
  state.bg = bg;
  refreshPreviewBackground();
  syncPanel(bg);
});

await onBackgroundVisible(() => {
  refreshPreviewBackground();
  syncPanel(state.bg);   // memanggil syncEye(), jadi ikon mata selalu cocok dengan status
});


state.bg = await loadBackground();
const hadGroups = await loadGroups();
if (!hadGroups) migrateBackground(state.bg);

// Semua yang bergantung pada grup dan background dipanggil setelah keduanya dimuat.
initExplorer();
initBackgroundPanel();
window.__TAURI__.event.listen("audience-ready", () => {
  setBackgroundVisible(isBackgroundVisible()); // re-send the current state
});
syncPanel(state.bg);
refreshThumbBackgrounds();
renderLibrary();
refreshGrid();
renderPreview();
