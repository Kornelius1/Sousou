import { createStore, uid } from "./store.js";
import { kindOf } from "./media.js";

export const store = createStore({
  name: "groups",
  loadCmd: "load_groups",
  saveCmd: "save_groups",
  events: { changed: "groups-changed", selection: "selection-changed" },
  quietUpdate: true,
});

const s = store.s;

// API lama, nama sama, jadi pemanggil tidak perlu diubah
export const findGroup = store.find;
export const selectedGroup = store.selectedGroup;
export const selectedItem = store.selectedItem;
export const loadGroups = store.load;
export const selectGroup = store.selectGroup;
export const selectItem = store.selectItem;
export const createGroup = store.createGroup;
export const renameGroup = store.renameGroup;
export const deleteGroup = store.deleteGroup;
export const removeItem = store.removeItem;
export const moveItem = store.moveItem;
export const sortGroup = store.sortGroup;
export const addInput = store.addInput;
export const updateItem = store.updateItem;
export const addFiles = (gid, paths) => store.addFiles(gid, paths, kindOf);

// ---------- khusus background ----------
export const newItem = (src, kind) => ({
  id: uid(), src, kind, loop: true, mute: true, scale: "fill", opacity: 1, added: Date.now(),
});

export function addColor(gid, colorHex) {
  const g = findGroup(gid);
  if (!g) return null;
  const item = { ...newItem(colorHex, "color"), loop: false, mute: true, scale: "fill" };
  g.items.push(item);
  store.changed();
  return item;
}

export function migrateBackground(bg) {
  const items = [];
  if (bg && bg.src && bg.kind) {
    items.push({ ...newItem(bg.src, bg.kind), loop: bg.loop, mute: bg.mute, scale: bg.scale, opacity: bg.opacity });
  }
  s.groups = [{ id: uid(), name: "Umum", items }];
  s.gid = s.groups[0].id;
  s.iid = null;
  store.changed();
}

export function mergeGroups(groups) {
  for (const src of groups || []) {
    let g = s.groups.find((x) => x.name === src.name);
    if (!g) {
      g = { id: uid(), name: src.name, items: [] };
      s.groups.push(g);
    }
    for (const it of src.items || []) {
      if (g.items.some((x) => x.kind === it.kind && x.src === it.src)) continue;
      g.items.push({ ...it, id: uid() });
    }
  }
  store.changed();
}