import { state as S } from './state.js';
import { emit } from './bus.js';
import { invoke } from './tauri.js';
import { kindOf } from './media.js';
import { newBlank } from './store.js';

// Pakai fungsi murni bawaan browser, TIDAK ada import dari utils.js
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const findGroup = (id) => S.groups.find((g) => g.id === id);
export const selectedGroup = () => findGroup(S.selectedGroup);
export const selectedItem = () => {
  const g = selectedGroup();
  return g ? g.items.find((i) => i.id === S.selectedItem) : undefined;
};

export const newItem = (src, kind) => ({
  id: uid(), src, kind, loop: true, mute: true, scale: 'fill', opacity: 1, added: Date.now(),
});

// ---------- penyimpanan (ditunda 300 ms, berurutan) ----------
let saveTimer;
let saveChain = Promise.resolve();
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const store = JSON.parse(JSON.stringify({ groups: S.groups }));
    saveChain = saveChain
      .then(() => invoke('save_groups', { store }))
      .catch((err) => console.warn('gagal menyimpan grup:', err));
  }, 300);
}

function changed() {
  persist();
  emit('groups-changed');
}

function selectFirst() {
  S.selectedGroup = S.groups.length ? S.groups[0].id : null;
  S.selectedItem = null;
}

export async function loadGroups() {
  let store = null;
  try {
    store = await invoke('load_groups');
  } catch (err) {
    console.warn('gagal memuat grup:', err);
  }
  S.groups = store && Array.isArray(store.groups) ? store.groups : [];
  selectFirst();
  return !!store;
}

export function migrateBackground(bg) {
  const items = [];
  if (bg && bg.src && bg.kind) {
    items.push({ ...newItem(bg.src, bg.kind), loop: bg.loop, mute: bg.mute, scale: bg.scale, opacity: bg.opacity });
  }
  S.groups = [{ id: uid(), name: 'Umum', items }];
  selectFirst();
  changed();
}

export function selectGroup(id) {
  if (S.selectedGroup === id && S.selectedItem === null) return;
  S.selectedGroup = id;
  S.selectedItem = null;
  emit('selection-changed');
}

export function selectItem(gid, iid) {
  S.selectedGroup = gid;
  S.selectedItem = iid;
  emit('selection-changed');
}

export function createGroup(name = 'Grup baru') {
  const g = { id: uid(), name, items: [] };
  S.groups.push(g);
  S.selectedGroup = g.id;
  S.selectedItem = null;
  changed();
  emit('selection-changed');
  return g;
}

export function renameGroup(id, name) {
  const g = findGroup(id);
  if (!g || !name.trim()) return;
  g.name = name.trim();
  changed();
}

export function deleteGroup(id) {
  const i = S.groups.findIndex((g) => g.id === id);
  if (i < 0) return;
  S.groups.splice(i, 1);
  if (S.selectedGroup === id) {
    const n = S.groups[Math.min(i, S.groups.length - 1)];
    S.selectedGroup = n ? n.id : null;
    S.selectedItem = null;
    emit('selection-changed');
  }
  changed();
}

export function addFiles(gid, paths) {
  const g = findGroup(gid);
  if (!g) return 0;
  let n = 0;
  for (const p of paths) {
    const kind = kindOf(p);
    if (!kind || g.items.some((it) => it.src === p)) continue;
    g.items.push(newItem(p, kind));
    n++;
  }
  if (n) changed();
  return n;
}

export function addColor(gid, colorHex) {
  const g = findGroup(gid);
  if (!g) return null;
  const item = {
    ...newItem(colorHex, 'color'),
    loop: false,
    mute: true,
    scale: 'fill',
  };
  g.items.push(item);
  changed();
  return item;
}

export function removeItem(gid, iid) {
  const g = findGroup(gid);
  if (!g) return;
  g.items = g.items.filter((it) => it.id !== iid);
  if (S.selectedItem === iid) {
    S.selectedItem = null;
    emit('selection-changed');
  }
  changed();
}

export function updateItem(gid, iid, patch) {
  const g = findGroup(gid);
  const it = g && g.items.find((x) => x.id === iid);
  if (!it) return;
  Object.assign(it, patch);
  persist();
  emit('item-updated', it);
}

export function moveItem(fromId, iid, toId) {
  const a = findGroup(fromId);
  const b = findGroup(toId);
  if (!a || !b || a === b) return null;
  const i = a.items.findIndex((x) => x.id === iid);
  if (i < 0) return null;
  const it = a.items[i];
  if (b.items.some((x) => x.src === it.src && x.kind === it.kind)) return 'dup';
  a.items.splice(i, 1);
  b.items.push(it);
  if (S.selectedItem === iid) S.selectedGroup = toId; 
  changed();
  emit('selection-changed');
  return 'ok';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const nameOf = (it) => (it.kind === 'color' ? it.src : it.src.split(/[\\/]/).pop());

export function sortGroup(gid, by, dir) {
  const g = findGroup(gid);
  if (!g) return;
  const sign = dir === 'desc' ? -1 : 1;
  const byName = (a, b) => collator.compare(nameOf(a), nameOf(b));
  const cmp = {
    name: byName,
    kind: (a, b) => collator.compare(a.kind, b.kind) || byName(a, b),
    added: (a, b) => (a.added || 0) - (b.added || 0) || byName(a, b),
  }[by];
  if (!cmp) return;
  g.items.sort((a, b) => sign * cmp(a, b));
  changed();
}

export function mergeGroups(groups) {
  for (const src of groups || []) {
    let g = S.groups.find((x) => x.name === src.name);
    if (!g) {
      g = { id: uid(), name: src.name, items: [] };
      S.groups.push(g);
    }
    for (const it of src.items || []) {
      if (g.items.some((x) => x.kind === it.kind && x.src === it.src)) continue;
      g.items.push({ ...it, id: uid() });
    }
  }
  changed();
}
