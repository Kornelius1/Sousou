// Entry point: inisialisasi semua modul. Tidak ada logika bisnis di sini.
import { onBackgroundChange, loadBackground } from '../background-state.js';
import { state } from './state.js';
import { initMenu } from './menu.js';
import { initToolbar, initShortcuts } from './toolbar.js';
import { initSorter, refreshThumbBackgrounds } from './sorter.js';
import { initPreview, renderPreview, refreshPreviewBackground } from './preview.js';
import { initProperties } from './properties.js';
import { initLibrary, renderLibrary, lib } from './library.js';
import { initBackgroundPanel, syncPanel } from './background-panel.js';
import { loadGroups, migrateBackground } from './groups.js';
import { initExplorer } from './explorer.js';

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

state.bg = await loadBackground();
const hadGroups = await loadGroups();
if (!hadGroups) migrateBackground(state.bg);

// Semua yang bergantung pada grup dan background dipanggil setelah keduanya dimuat.
initExplorer();
initBackgroundPanel();
syncPanel(state.bg);
refreshThumbBackgrounds();
renderLibrary();
renderPreview();