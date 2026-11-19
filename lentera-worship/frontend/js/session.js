import { state } from "./state.js";
import { setStatus } from "./utils.js";
import { invoke, openDialog, saveDialog } from "./tauri.js";
import { setBackground } from "../shared/background-state.js";
import { applySlides } from "./sorter/sorter.js";
import { lib } from "./library.js";
import * as G from "./groups.js";
import { emit, on } from "./bus.js";
import { askSave } from "./confirm.js";

const EXT = "lentera";
const FILTERS = [{ name: "Lentera Worship session", extensions: [EXT] }];
const ALL = { workspace: true, background: true };

const withExt = (p) =>
  p.toLowerCase().endsWith("." + EXT) ? p : `${p}.${EXT}`;
export const baseName = (p) => String(p).split(/[\\/]/).pop();

// ---------- sesi aktif & recent ----------
const RECENT_KEY = "pc.recent";
const RECENT_MAX = 10;
let currentPath = null;

export const getCurrentPath = () => currentPath;

export function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}
function setRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {}
}
const pushRecent = (p) => setRecent([p, ...getRecent().filter((x) => x !== p)]);
const dropRecent = (p) => setRecent(getRecent().filter((x) => x !== p));
export const clearRecent = () => setRecent([]);

// ---------- dirty, autosave ----------
const AUTOSAVE_KEY = "pc.autosave";
const AUTOSAVE_MS = 30000;
let dirty = false;
let rev = 0; // naik tiap ada perubahan, supaya edit saat menyimpan tidak ikut dianggap bersih
let loading = false;
let saving = false;
let timer = null;
let isolated = false;

export const autosaveOn = () => localStorage.getItem(AUTOSAVE_KEY) !== "0";

export function setAutosave(v) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, v ? "1" : "0");
  } catch {}
  if (v) schedule();
  else clearTimeout(timer);
  setStatus(v ? "Autosave on." : "Autosave off.");
}

function markClean(atRev = rev) {
  if (atRev !== rev) return; // ada edit baru selama menyimpan
  dirty = false;
  clearTimeout(timer);
}

function markDirty() {
  if (loading) return;
  dirty = true;
  rev++;
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (autosaveOn() && currentPath) timer = setTimeout(autosave, AUTOSAVE_MS);
}

async function autosave() {
  if (!dirty || !currentPath || saving) return;
  await saveTo(currentPath, { silent: true });
}

// ---------- tulis ----------
async function writeSession(dest, opt, silent = false) {
  const data = {};
  if (opt.workspace) {
    data.workspace = { bundleName: state.bundleName, slides: state.slides };
    data.library = { groups: lib.s.groups };
  }
  if (opt.background) {
    data.background = { groups: G.store.s.groups, active: state.bg };
  }

  if (!silent) setStatus("Saving…");
  try {
    const warnings = await invoke("export_session", {
      req: { dest, data: JSON.parse(JSON.stringify(data)) },
    });
    if (warnings.length) {
      setStatus(`Saved with ${warnings.length} warning(s): ${warnings[0]}`);
    } else if (!silent) {
      setStatus(`Saved: ${baseName(dest)}`);
    }
    return true;
  } catch (err) {
    console.error(err);
    setStatus("Save failed: " + err);
    return false;
  }
}

// Dipakai Save, Save as, dan autosave: menyimpan lalu menandai bersih.
async function saveTo(dest, { silent = false } = {}) {
  saving = true;
  const at = rev;
  try {
    const ok = await writeSession(dest, ALL, silent);
    if (ok) {
      currentPath = dest;
      pushRecent(dest);
      markClean(at);
    }
    return ok;
  } finally {
    saving = false;
  }
}

export async function saveSessionAs() {
  const picked = await saveDialog({
    filters: FILTERS,
    defaultPath: currentPath || (state.bundleName || "session") + "." + EXT,
  });
  if (picked) await saveTo(withExt(picked));
}

export async function saveSession() {
  if (!currentPath) return saveSessionAs();
  return saveTo(currentPath);
}

// Export parsial (pilih cakupan). Tidak mengubah currentPath.
export async function exportSession() {
  const opt = await chooseScope();
  if (!opt) return;
  const picked = await saveDialog({
    filters: FILTERS,
    defaultPath: (state.bundleName || "session") + "." + EXT,
  });
  if (picked) await writeSession(withExt(picked), opt);
}

/** Dialog pilihan cakupan. Resolve { workspace, background } atau null bila dibatalkan. */
function chooseScope() {
  return new Promise((resolve) => {
    const mk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const row = (label, hint) => {
      const l = mk("label", "cf-skip");
      const c = mk("input");
      c.type = "checkbox";
      c.checked = true;
      const t = mk("span");
      t.append(mk("b", null, label), mk("br"), mk("span", null, hint));
      l.append(c, t);
      return { l, c };
    };

    const ws = row(
      "Workspace",
      "Slides with your edits, and the media library",
    );
    const bg = row("Background", "Background groups and the active background");
    const cancel = mk("button", "cf-btn", "Cancel");
    const ok = mk("button", "cf-btn", "Export");
    const btns = mk("div", "cf-btns");
    btns.append(cancel, ok);

    const box = mk("div", "cf-box");
    box.append(
      mk("div", "cf-title", "Export session"),
      mk("div", "cf-msg", "Choose what to include:"),
      ws.l,
      bg.l,
      btns,
    );
    const overlay = mk("div", "cf-overlay");
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const sync = () => {
      ok.disabled = !ws.c.checked && !bg.c.checked;
    };
    ws.c.addEventListener("change", sync);
    bg.c.addEventListener("change", sync);

    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") finish(null);
    };
    const finish = (r) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(r);
    };

    cancel.addEventListener("click", () => finish(null));
    ok.addEventListener("click", () =>
      finish({ workspace: ws.c.checked, background: bg.c.checked }),
    );
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener("keydown", onKey, true);
    ok.focus();
  });
}

// ---------- baca ----------
export async function openSessionPath(pack) {
  loading = true;
  setStatus("Importing…");
  try {
    const d = await invoke("import_session", { pack });

    if (d.library) {
      for (const g of d.library.groups || []) {
        const t = await lib.ensureGroup(g.name);
        if (t) await lib.copyInMany(t.id, g.items || []);
      }
    }
    if (d.background) {
      G.mergeGroups(
        d.background.groups && d.background.groups.groups
          ? d.background.groups.groups
          : d.background.groups,
      );
      if (d.background.active) await setBackground(d.background.active);
    }
    if (d.workspace) {
      applySlides(d.workspace.slides || [], [], d.workspace.bundleName);
      emit("bundle:imported");
    }
    currentPath = pack;
    pushRecent(pack);
    setStatus(`Opened: ${baseName(pack)}`);
  } catch (err) {
    console.error(err);
    dropRecent(pack); // file hilang / rusak: buang dari daftar recent
    setStatus("Import failed: " + err);
  } finally {
    setTimeout(() => {
      loading = false;
      dirty = false;
      clearTimeout(timer);
    }, 500);
  }
}

// ---------- window ----------
export const newWindow = () => invoke("new_window", { open: null });
export const openInNewWindow = (p) => invoke("new_window", { open: p });

// "Open session…" membuka file di window baru supaya sesi yang sedang berjalan aman.
export async function importSession() {
  const pack = await openDialog({ multiple: false, filters: FILTERS });
  if (pack) await openInNewWindow(pack);
}

// Panggil sekali saat startup, setelah initLibrary() dan sorter siap
export async function openLaunchFile() {
  const f = await invoke("launch_file");
  if (f) await openSessionPath(f);
}

// ---------- tracking & konfirmasi tutup ----------
export async function initSessionTracking() {
  const win = window.__TAURI__.window.getCurrentWindow();
  try {
    isolated = await invoke("is_isolated");
  } catch {}

  for (const ev of [
    "lib-changed",
    "groups-changed",
    "slide:edited",
    "layer:added",
    "background-changed",
  ])
    on(ev, markDirty);

  // abaikan event dari proses startup
  loading = true;
  setTimeout(() => {
    loading = false;
    dirty = false;
  }, 1000);

  await win.onCloseRequested(async (event) => {
    if (!dirty) return; // tidak ada yang perlu disimpan, tutup biasa
    event.preventDefault();

    // autosave aktif + sudah punya file: simpan diam-diam
    if (currentPath && autosaveOn()) {
      if (await saveTo(currentPath, { silent: true })) return win.destroy();
    }
    // window utama tanpa file: datanya sudah tersimpan otomatis di app data
    if (!currentPath && !isolated) return win.destroy();

    const name = currentPath ? baseName(currentPath) : "this session";
    const r = await askSave({
      title: "Save changes?",
      message: `Save changes to ${name} before closing?`,
    });
    if (r === "cancel") return;
    if (r === "save") {
      await saveSession();
      if (dirty) return; // simpan gagal atau dialog dibatalkan, jangan tutup
    }
    await win.destroy();
  });
}