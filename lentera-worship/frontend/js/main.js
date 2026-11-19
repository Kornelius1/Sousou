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
  renderThumb,
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
import { syncCamsSoon } from "./cam-usage.js";
import { on } from "./bus.js";
import { broadcastMessage } from "./message-state.js";
import { initMessagePanel } from "./message-panel.js";
import { initResizer } from "./resizer.js";
import { initTransitionUi } from "./transition-ui.js";
import { setTransition } from "../shared/transition-state.js";
import "./songs.js";
import "./song-import.js";
import "./settings.js";
import { loadOutput, saveOutput } from "../shared/output-state.js";
import { emitPayload, toPayload } from "./audience.js";
import { openLaunchFile, initSessionTracking } from "./session.js";

/* ---- Slider: isi --fill supaya trek yang terisi ikut posisi gagang ---- */
const setFill = (el) => {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = max > min ? ((el.value - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--fill", pct + "%");
};
const fillAll = (root = document) =>
  root.querySelectorAll('input[type="range"]').forEach(setFill);

const applyOutputRatio = () => {
  const o = loadOutput();
  // dibatasi supaya LED wall 32:9 tidak membuat tile terlalu pipih
  const r = Math.min(Math.max(o.w / o.h, 1), 2.4);
  document.documentElement.style.setProperty("--out-ar", String(r));
};

const win = window.__TAURI__.window.getCurrentWindow();
const maxBtn = document.getElementById("win-max");
document.getElementById("win-min").onclick = () => win.minimize();
maxBtn.onclick = () => win.toggleMaximize();
document.getElementById("win-close").onclick = () => win.close();
const syncMax = async () =>
  maxBtn.classList.toggle("maxed", await win.isMaximized());

// slider digeser pengguna
document.addEventListener("input", (e) => {
  if (e.target.matches('input[type="range"]')) setFill(e.target);
});
// slider yang nilainya diubah lewat kode (el.value = ...) tidak memicu "input",
// jadi dengarkan juga "change" dan panggil window.fillSliders() bila perlu
document.addEventListener("change", (e) => {
  if (e.target.matches('input[type="range"]')) setFill(e.target);
});
window.fillSliders = fillAll;

// slider yang dibuat JS belakangan (panel Message, dialog, dll.), dibatasi
// lewat requestAnimationFrame supaya tidak berjalan di setiap perubahan DOM
let fillQueued = false;
new MutationObserver(() => {
  if (fillQueued) return;
  fillQueued = true;
  requestAnimationFrame(() => {
    fillQueued = false;
    fillAll();
  });
}).observe(document.body, { childList: true, subtree: true });

initMenu();
initToolbar();
initShortcuts();
initSorter();
initPreview();
initProperties();
await lib.load();
initLibrary();
initMessagePanel();
initResizer();
initTransitionUi();
fillAll();
applyOutputRatio();

// Listener dipasang sebelum membaca disk, agar event yang datang saat startup tidak terlewat.
await onBackgroundChange((bg) => {
  state.bg = bg;
  refreshPreviewBackground();
  syncPanel(bg);
  syncCamsSoon();
});

await onBackgroundVisible((v) => {
  refreshPreviewBackground();
  syncPanel(state.bg);
});

state.bg = await loadBackground();
const hadGroups = await loadGroups();
if (!hadGroups) migrateBackground(state.bg);

// Semua yang bergantung pada grup dan background dipanggil setelah keduanya dimuat.
initExplorer();
initBackgroundPanel();

window.__TAURI__.event.listen("audience-ready", () => {
  saveOutput(loadOutput());
  setTransition({});
  setBackgroundVisible(isBackgroundVisible());
  broadcastMessage();
});

window.__TAURI__.event.listen("output-changed", () => {
  applyOutputRatio();
  state.slides.forEach((_, i) => renderThumb(i));
  const i = state.liveIndex;
  if (i >= 0 && !state.blanked && state.slides[i])
    emitPayload(toPayload(state.slides[i]));
});

let wasMax = false;
window.addEventListener("keydown", async (e) => {
  if (e.key !== "F11") return;
  e.preventDefault();
  if (await win.isFullscreen()) {
    await win.setFullscreen(false);
    if (wasMax) await win.maximize();
  } else {
    wasMax = await win.isMaximized();
    if (wasMax) await win.unmaximize();
    await win.setFullscreen(true);
  }
});

window.addEventListener("resize", syncMax);
syncMax();
syncPanel(state.bg);
refreshThumbBackgrounds();
renderLibrary();
refreshGrid();
renderPreview();
fillAll();
on("groups-changed", syncCamsSoon);
on("lib-changed", syncCamsSoon);

await initSessionTracking();
await openLaunchFile();
