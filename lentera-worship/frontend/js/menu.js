import { $, setStatus } from "./utils.js";
import { state } from "./state.js";
import { refreshThumbBackgrounds } from "./sorter/sorter.js";
import { importFile } from "./sorter/bundle-import.js";
import { resetConfirmations } from "./confirm.js";
import { openAbout } from "./about.js";
import { openSettings } from "./settings.js";
import { resetSizes } from "./resizer.js";
import { openLibraryFind, deleteActiveSlide } from "./library.js";
import {
  newWindow,
  saveSession,
  saveSessionAs,
  exportSession,
  importSession,
  openSessionPath,
  getRecent,
  clearRecent,
  baseName,
  autosaveOn,
  setAutosave,
} from "./session.js";

const win = window.__TAURI__.window.getCurrentWindow();

const REPO = "https://github.com/Kornelius1/lentera-worship";

const openUrl = (url) => async () => {
  try {
    await window.__TAURI__.opener.openUrl(url);
  } catch (err) {
    console.error("openUrl gagal:", err);
    setStatus("Tidak bisa membuka link.");
  }
};

function togglePane(id, cls) {
  const el = $(id);
  el.hidden = !el.hidden;
  if (cls) $("workspace").classList.toggle(cls, el.hidden);
}

// Theme
const THEME_KEY = "pc.theme";
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
}
try {
  setTheme(localStorage.getItem(THEME_KEY) || "dark");
} catch {}

const toggleHidden = (id) => () => {
  $(id).hidden = !$(id).hidden;
};
const visible = (id) => () => !$(id).hidden;
const pressed = (id) => () => $(id).getAttribute("aria-pressed") === "true";
const press = (id) => () => $(id).click(); // reuse the existing button, so logic isn't duplicated

function resetLayout() {
  // 1. tampilkan semua panel
  for (const id of ["library", "props", "media-panel", "msg-panel", "toolbar"])
    $(id).hidden = false;
  $("workspace").classList.remove("no-lib", "no-props");

  // 2. kembalikan ukuran panel
  resetSizes();

  // 3. kembalikan slider zoom (default dari HTML)
  for (const [id, val] of [
    ["zoom", 200],
    ["bg-zoom", 160],
  ]) {
    const el = $(id);
    el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  setStatus("Layout reset.");
}

const MENUS = [
  {
    label: "File",
    get items() {
      const recent = getRecent();
      return [
        { label: "New window", key: "Ctrl+N", run: () => newWindow() },
        { label: "Open session…", key: "Ctrl+O", run: () => importSession() },
        {
          label: "Open recent",
          disabled: !recent.length,
          submenu: [
            ...recent.map((p) => ({
              label: baseName(p),
              title: p, // path lengkap muncul saat hover
              run: () => openSessionPath(p),
            })),
            { sep: true },
            { label: "Clear recent", run: () => clearRecent() },
          ],
        },
        { label: "Save session", key: "Ctrl+S", run: () => saveSession() },
        {
          label: "Save session as…",
          key: "Ctrl+Shift+S",
          run: () => saveSessionAs(),
        },
        { label: "Export session…", run: () => exportSession() },
        { sep: true },
        { label: "Import file…", run: () => importFile() },
        { sep: true },
        { label: "New group", run: press("lib-new") },
        { label: "Add files to group…", run: press("lib-add") },
        { sep: true },
        { label: "Add song…", run: press("lib-song") },
        { label: "Import songs…", run: press("lib-import-song") },
        { sep: true },
        {
          label: "Autosave",
          checked: () => autosaveOn(),
          run: () => setAutosave(!autosaveOn()),
        },
        { sep: true },
        { label: "Exit", key: "Ctrl+Q", run: () => win.close() },
      ];
    },
  },
  {
    label: "Edit",
    items: [
      { label: "Edit slide…", key: "Enter", run: press("tb-edit") },
      { label: "Delete slide", key: "Del", run: () => deleteActiveSlide() },
      { label: "Find…", key: "Ctrl+F", run: () => openLibraryFind() },
    ],
  },
  {
    label: "View",
    items: [
      // {
      //   label: "Media Library",
      //   checked: visible("library"),
      //   run: () => togglePane("library", "no-lib"),
      // },
      // {
      //   label: "Properties Panel",
      //   checked: visible("props"),
      //   run: () => togglePane("props", "no-props"),
      // },
      // {
      //   label: "Background Panel",
      //   checked: visible("media-panel"),
      //   run: toggleHidden("media-panel"),
      // },
      // {
      //   label: "Message Panel",
      //   checked: visible("msg-panel"),
      //   run: toggleHidden("msg-panel"),
      // },
      {
        label: "Bible & Transitions Bar",
        checked: visible("toolbar"),
        run: toggleHidden("toolbar"),
      },
      { sep: true },
      {
        label: "Background in thumbnails",
        checked: () => state.showBgInThumbs,
        run: () => {
          state.showBgInThumbs = !state.showBgInThumbs;
          refreshThumbBackgrounds();
        },
      },
      { sep: true },
      {
        label: "Fullscreen",
        key: "F11",
        run: () =>
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "F11" })),
      },
      { sep: true },
      { label: "Zoom in slides", run: press("zoom-in") },
      { label: "Zoom out slides", run: press("zoom-out") },
      { sep: true },
      { label: "Reset layout", run: resetLayout },
    ],
  },
  {
    label: "Output",
    items: [
      {
        label: "Audience window",
        checked: pressed("tb-audience"),
        run: press("tb-audience"),
      },
      {
        label: "Blank audience screen",
        key: "B",
        checked: pressed("tb-blank"),
        run: press("tb-blank"),
      },
      { sep: true },
      { label: "Bible…", run: press("tb-bible") },
      { sep: true },
      { label: "Settings…", run: () => openSettings() },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Check for updates", run: openUrl(REPO + "/releases/latest") },
      { label: "User guide", run: openUrl(REPO + "#readme") },
      { label: "Report an issue", run: openUrl(REPO + "/issues/new") },
      { sep: true },
      {
        label: "Reset confirmation dialogs",
        run: () => {
          resetConfirmations();
          setStatus("Confirmations enabled again.");
        },
      },
      { sep: true },
      { label: "About Lentera Worship", run: () => openAbout() },
    ],
  },
];

const wraps = [];
let openMenu = -1;

function fillItems(parent, items) {
  for (const it of items) {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "dd-sep";
      parent.appendChild(s);
      continue;
    }

    const b = document.createElement("button");
    b.className = "dd-item";
    b.disabled = !!it.disabled;
    if (it.title) b.title = it.title;

    const chk = document.createElement("span");
    chk.className = "chk";
    chk.textContent = it.checked && it.checked() ? "✓" : "";
    const lab = document.createElement("span");
    lab.textContent = it.label;
    const key = document.createElement("span");
    key.className = "dd-key";
    if (it.submenu) key.classList.add("dd-arrow");
    else key.textContent = it.key || "";
    b.append(chk, lab, key);

    if (it.submenu && !it.disabled) {
      const wrap = document.createElement("div");
      wrap.className = "dd-sub";
      const sub = document.createElement("div");
      sub.className = "dd-submenu";
      fillItems(sub, it.submenu);
      // klik pada induk submenu tidak menutup menu
      b.addEventListener("click", (e) => e.stopPropagation());
      wrap.append(b, sub);
      parent.appendChild(wrap);
    } else {
      b.addEventListener("click", () => {
        closeMenus();
        if (it.run) it.run();
      });
      parent.appendChild(b);
    }
  }
}

function fillDropdown(dd, menu) {
  dd.replaceChildren();
  fillItems(dd, menu.items);
}

function setOpen(mi) {
  openMenu = mi;
  wraps.forEach((w, i) => {
    w.classList.toggle("open", i === mi);
    if (i === mi) fillDropdown(w.querySelector(".dropdown"), MENUS[i]);
  });
}
export const closeMenus = () => setOpen(-1);

export function initMenu() {
  const bar = $("menubar");
  MENUS.forEach((m, mi) => {
    const wrap = document.createElement("div");
    wrap.className = "menu";
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = m.label;
    const dd = document.createElement("div");
    dd.className = "dropdown";
    wrap.append(btn, dd);
    bar.appendChild(wrap);
    wraps.push(wrap);
    btn.addEventListener("click", () => setOpen(openMenu === mi ? -1 : mi));
    btn.addEventListener("mouseenter", () => {
      if (openMenu >= 0) setOpen(mi);
    });
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".menu")) closeMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      e.shiftKey ? saveSessionAs() : saveSession();
    } else if (k === "n") {
      e.preventDefault();
      newWindow();
    } else if (k === "o") {
      e.preventDefault();
      importSession();
    }
  });
}
