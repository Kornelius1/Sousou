import { state } from "./state.js";
import { emit, on } from "./bus.js";
import { setStatus } from "./utils.js";
import { LIB_FILTER, libKindOf } from "./media.js";
import { createTree } from "./tree.js";
import { pick } from "./background-panel.js";
import { showGroupSlides, showSlide, initBlankDeck } from "./sorter/sorter.js";
import { resolveTag } from "./tags.js";
import { itemName } from "./store.js";
import { createRemoteStore } from "./remote-store.js";

export const lib = createRemoteStore({ name: "lib", prefix: "library" });

let tree = null;
let syncing = false;
let shownGid = null;

const textOf = (it) =>
  it.kind === "text"
    ? it.text
    : it.kind === "slide"
      ? it.slide?.content || ""
      : "";

function withSync(fn) {
  if (syncing) return;
  syncing = true;
  try {
    fn();
  } finally {
    syncing = false;
  }
}

async function withSyncAsync(fn) {
  if (syncing) return;
  syncing = true;
  try {
    await fn();
  } finally {
    syncing = false;
  }
}

export function refreshGrid() {
  withSync(() => {
    const g = lib.s.groups.find((x) => x.id === lib.s.gid);
    shownGid = g ? g.id : null;
    if (!g) return initBlankDeck();
    showGroupSlides(g);
    selectInGrid();
  });
}

function selectInGrid() {
  if (!lib.s.iid) return;
  const idx = state.slides.findIndex((s) => s.itemId === lib.s.iid);
  if (idx >= 0) showSlide(idx, false);
}

function onLibSelection() {
  if (lib.s.gid === shownGid) selectInGrid();
  else refreshGrid();
}

async function syncBundle() {
  const slides = state.slides;
  if (!slides.length) return;
  const g = await lib.ensureGroup(state.bundleName || "Bundle");
  if (!g) return;

  await lib.replaceSlides(
    g.id,
    "bundle",
    slides.map((s) => {
      const first = (s.content || "").trim().split("\n")[0].slice(0, 40);
      return {
        label: first || `Slide ${s.slide_number}`,
        tag: resolveTag(s.group_name),
        slide: s,
      };
    }),
  );

  const seen = new Set();
  const media = [];
  for (const s of slides) {
    for (const l of s.layers || []) {
      if ((l.kind !== "video" && l.kind !== "image") || l.status !== "OK")
        continue;
      if (!l.path || seen.has(l.path)) continue;
      seen.add(l.path);
      media.push({ kind: l.kind, src: l.path });
    }
  }
  if (media.length) await lib.copyInMany(g.id, media);

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

function addInputLayer(it) {
  const slide = curSlide();
  if (!slide) return setStatus("Select a slide first.");
  if (it.kind !== "input" || it.input?.media !== "video") return;
  slide.layers = slide.layers || [];
  const z = slide.layers.reduce((m, l) => Math.min(m, l.z), 0) - 1;
  slide.layers.push({
    kind: "input",
    z,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: 1,
    path: null,
    status: "OK",
    inner: null,
    scale: "SCALE_BEHAVIOR_FIT",
    muted: true,
    looped: null,
    stop_on_clear: null,
    color: null,
    text: null,
    input: it.input,
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
        const t = it ? textOf(it) : "";
        if (t) setStatus(t.replace(/\s+/g, " ").slice(0, 120));
      },
      createGroup: lib.createGroup,
      addInput: lib.addInput,
      renameGroup: lib.renameGroup,
      deleteGroup: lib.deleteGroup,
      removeItem: lib.removeItem,
      sortGroup: lib.sortGroup,
      addFiles: (gid, paths) => lib.addFiles(gid, paths, libKindOf),
      addBlank: lib.addBlank,
      moveItem: lib.moveItem,
    },
    onActivate: (g, it) => {
      const t = textOf(it);
      if (t) addTextLayer(t);
      else if (it.kind === "image" || it.kind === "video") addMediaLayer(it);
      else if (it.kind === "input" && it.input?.media === "video")
        addInputLayer(it);
    },
    contextMenu: (g, it) => {
      const t = textOf(it);
      if (t) {
        return [
          { label: "Add as new text layer", run: () => addTextLayer(t) },
          { label: "Replace selected text", run: () => replaceSelectedText(t) },
        ];
      }
      if (it.kind === "image" || it.kind === "video") {
        return [
          { label: "Use as background", run: () => pick(it.src, it.kind) },
          { label: "Add to slide", run: () => addMediaLayer(it) },
        ];
      }
      if (it.kind === "input" && it.input?.media === "video") {
        return [
          {
            label: "Use as background",
            run: () => pick(it.src, it.kind, it.input),
          },
          { label: "Add to slide", run: () => addInputLayer(it) },
        ];
      }
      return [{ label: "No actions for this type", disabled: true }];
    },
  });

  on("lib-changed", refreshGrid);
  on("lib-selection", onLibSelection);
  on("bundle:imported", async () => {
    await withSyncAsync(syncBundle);
    refreshGrid();
  });
  on("tag:set", async ({ groupId, itemId, tag }) => {
    let ok = false;
    await withSyncAsync(async () => {
      ok = await lib.setTag(groupId, itemId, tag);
    });
    if (ok) emit("tag:applied", { itemId, tag });
  });
  on("slide:edited", ({ index, itemId, groupId, layers }) => {
    const s = state.slides[index];
    if (s) {
      s.layers = structuredClone(layers);
      syncContent(s);
    }
    if (!itemId) return;
    const gid = groupId ?? lib.s.gid;
    const g = lib.s.groups.find((x) => x.id === gid);
    const it = g && g.items.find((x) => x.id === itemId);
    if (!it) return;
    const next = { ...(it.slide || s || {}), layers: structuredClone(layers) };
    next.content = next.layers
      .filter((l) => l.kind === "text" && l.text)
      .map((l) => l.text)
      .join("\n");
    withSyncAsync(() => lib.updateItem(gid, itemId, { slide: next }));
  });
}
