import { state } from "./state.js";
import { emit, on } from "./bus.js";
import { setStatus } from "./utils.js";
import { LIB_FILTER, libKindOf } from "./media.js";
import { createStore, itemName } from "./store.js";
import { createTree } from "./tree.js";
import { pick } from "./background-panel.js";
import { showGroupSlides, showSlide } from "./sorter.js";

export const lib = createStore({
  name: "lib",
  loadCmd: "load_library",
  saveCmd: "save_library",
});

let tree = null;
let syncing = false;
export function refreshGrid() {
  const g = lib.s.groups.find((x) => x.id === lib.s.gid);
  if (!g) return false;
  const hasSlides = g.items.some((it) => it.kind === "slide");
  if (g.items.length && !hasSlides) return false;

  syncing = true;
  try {
    showGroupSlides(g);
  } finally {
    syncing = false;
  }

  if (lib.s.iid) {
    const idx = state.slides.findIndex((s) => s.itemId === lib.s.iid);
    if (idx >= 0) showSlide(idx);
  }
  return true;
}

/** Salin isi bundel yang baru dimuat ke grup permanen (nama = nama file). */
function syncBundle() {
  if (!state.slides.length) return;
  const g = lib.ensureGroup(state.bundleName || "Bundle");
  const seen = new Set();
  for (const s of state.slides) {
    const text = (s.content || "").trim();
    if (text) {
      const first = text.split("\n")[0].slice(0, 40);
      lib.copyIn(g.id, {
        kind: "text",
        text,
        src: "",
        label: `${s.slide_number}${s.group_name ? " · " + s.group_name : ""} — ${first}`,
      });
    }
    for (const l of s.layers || []) {
      if ((l.kind !== "video" && l.kind !== "image") || l.status !== "OK")
        continue;
      if (!l.path || seen.has(l.path)) continue;
      seen.add(l.path);
      lib.copyIn(g.id, { kind: l.kind, src: l.path });
    }
  }
  tree.openGroup(g.id);
  lib.s.gid = g.id;
  lib.s.iid = null;
  renderLibrary();
}

// ---------- aksi pada slide ----------
const curSlide = () => state.slides[state.activeIndex];
const syncContent = (slide) => {
  slide.content = slide.layers
    .filter((l) => l.kind === "text" && l.text)
    .map((l) => l.text)
    .join("\n");
};

function addMediaLayer(it) {
  const slide = curSlide();
  if (!slide) return setStatus("Select a slide first.");
  if (it.kind !== "image" && it.kind !== "video")
    return setStatus("Only images and videos can be added to a slide.");
  slide.layers = slide.layers || [];
  const z = slide.layers.reduce((m, l) => Math.min(m, l.z), 0) - 1;
  slide.layers.push({
    kind: it.kind,
    z,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: 1,
    path: it.src,
    status: "OK",
    inner: null,
    scale: "SCALE_BEHAVIOR_FIT",
    muted: true,
    looped: true,
    stop_on_clear: null,
    color: null,
    text: null,
  });
  emit("layer:added", slide.layers.length - 1);
  setStatus(`Added to slide ${slide.slide_number}.`);
}

function addTextLayer(text) {
  const slide = curSlide();
  if (!slide) return setStatus("Select a slide first.");
  slide.layers = slide.layers || [];
  const z = slide.layers.reduce((m, l) => Math.max(m, l.z), 0) + 1;
  slide.layers.push({
    kind: "text",
    z,
    rect: { x: 10, y: 25, w: 80, h: 50 },
    rotation: 0,
    opacity: 1,
    path: null,
    status: null,
    inner: null,
    scale: null,
    muted: null,
    looped: null,
    stop_on_clear: null,
    color: null,
    text,
    style: null,
  });
  syncContent(slide);
  emit("layer:added", slide.layers.length - 1);
  setStatus(`Text added to slide ${slide.slide_number}.`);
}

function replaceSelectedText(text) {
  const slide = curSlide();
  const l = slide && slide.layers ? slide.layers[state.selectedLayer] : null;
  if (!l || l.kind !== "text")
    return setStatus("Select a text layer in Properties first.");
  l.text = text;
  syncContent(slide);
  emit("layer:added", state.selectedLayer);
  setStatus("Text replaced.");
}

export function renderLibrary() {
  if (tree) tree.render();
}

export function initLibrary() {
  tree = createTree({
    ids: {
      list: "lib-list",
      count: "lib-count",
      new: "lib-new",
      add: "lib-add",
      sort: "lib-sort",
      del: "lib-del",
    },
    events: ["lib-changed", "lib-selection"],
    openByDefault: [],
    groups: () => lib.s.groups,
    readOnly: () => false,
    sel: () => ({ gid: lib.s.gid, iid: lib.s.iid }),
    itemName,
    filters: LIB_FILTER,
    kindOf: libKindOf,
    api: {
      selectGroup: lib.selectGroup,
      selectItem: (gid, iid) => {
        lib.selectItem(gid, iid);
        const g = lib.s.groups.find((x) => x.id === gid);
        const it = g && g.items.find((x) => x.id === iid);
        if (it && it.kind === "text")
          setStatus(it.text.replace(/\s+/g, " ").slice(0, 120));
      },
      createGroup: lib.createGroup,
      renameGroup: lib.renameGroup,
      deleteGroup: lib.deleteGroup,
      removeItem: lib.removeItem,
      sortGroup: lib.sortGroup,
      addFiles: (gid, paths) => lib.addFiles(gid, paths, libKindOf),
      addBlank: lib.addBlank,
      moveItem: lib.moveItem,
    },
    onActivate: (g, it) => {
      if (it.kind === "text") addTextLayer(it.text);
      else addMediaLayer(it);
    },
    contextMenu: (g, it) => {
      if (it.kind === "text") {
        return [
          { label: "Add as new text layer", run: () => addTextLayer(it.text) },
          {
            label: "Replace selected text",
            run: () => replaceSelectedText(it.text),
          },
        ];
      }
      if (it.kind === "image" || it.kind === "video") {
        return [
          { label: "Use as background", run: () => pick(it.src, it.kind) },
          { label: "Add to slide", run: () => addMediaLayer(it) },
        ];
      }
      return [{ label: "No actions for this type", disabled: true }];
    },
  });

  on("lib-changed", refreshGrid);
  on("lib-selection", refreshGrid);
  on("slides:loaded", () => {
    if (!syncing) syncBundle();
  });
}
