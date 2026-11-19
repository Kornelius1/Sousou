import { $, setStatus } from "./utils.js";
import { state } from "./state.js";
import { refreshThumbBackgrounds } from "./sorter/sorter.js";
import { importFile } from "./sorter/bundle-import.js";
import { resetConfirmations } from "./confirm.js";
import { exportSession, importSession } from "./session.js";
import { openAbout } from "./about.js";
import { openSettings } from "./settings.js";
import { resetSizes } from "./resizer.js";

function togglePane(id, cls) {
  const el = $(id);
  el.hidden = !el.hidden;
  if (cls) $("workspace").classList.toggle(cls, el.hidden);
}

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
    items: [
      { label: "Import file…", key: "Ctrl+O", run: () => importFile() },
      { sep: true },
      { label: "New group", run: press("lib-new") },
      { label: "Add files to group…", run: press("lib-add") },
      { sep: true },
      { label: "Add song…", run: press("lib-song") },
      { label: "Import songs…", run: press("lib-import-song") },
      { sep: true },
      { label: "Import session…", run: () => importSession() },
      { label: "Export session…", run: () => exportSession() },
    ],
  },
  {
    label: "Edit",
    items: [{ label: "Edit slide…", key: "Enter", run: press("tb-edit") }],
  },
  {
    label: "View",
    items: [
      {
        label: "Media Library",
        checked: visible("library"),
        run: () => togglePane("library", "no-lib"),
      },
      {
        label: "Properties Panel",
        checked: visible("props"),
        run: () => togglePane("props", "no-props"),
      },
      {
        label: "Background Panel",
        checked: visible("media-panel"),
        run: toggleHidden("media-panel"),
      },
      {
        label: "Message Panel",
        checked: visible("msg-panel"),
        run: toggleHidden("msg-panel"),
      },
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
      { label: "Zoom in slides", run: press("zoom-in") },
      { label: "Zoom out slides", run: press("zoom-out") },
      { sep: true },
      { label: "Reset layout", run: resetLayout},
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

function fillDropdown(dd, menu) {
  dd.replaceChildren();
  for (const it of menu.items) {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "dd-sep";
      dd.appendChild(s);
      continue;
    }
    const b = document.createElement("button");
    b.className = "dd-item";
    b.disabled = !!it.disabled;
    const chk = document.createElement("span");
    chk.className = "chk";
    chk.textContent = it.checked && it.checked() ? "✓" : "";
    const lab = document.createElement("span");
    lab.textContent = it.label;
    const key = document.createElement("span");
    key.className = "dd-key";
    key.textContent = it.key || "";
    b.append(chk, lab, key);
    b.addEventListener("click", () => {
      closeMenus();
      if (it.run) it.run();
    });
    dd.appendChild(b);
  }
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
}
