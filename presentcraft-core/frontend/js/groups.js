import { state as S } from './state.js';
import { invoke } from './tauri.js';
import { createGroupManager } from './group-factory.js';

// ID generator lokal agar tidak memicu error import dari utils.js
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const bgManager = createGroupManager({
  getState: () => S,
  eventPrefix: 'groups',
});

// Re-export metode dari manager agar modul lain (seperti background-panel.js) tetap berjalan lancar
export const {
  findGroup,
  selectedGroup,
  selectedItem,
  selectGroup,
  selectItem,
  createGroup,
  renameGroup,
  deleteGroup,
  addFiles,
  addColor,
  removeItem,
  updateItem,
  moveItem,
  sortGroup,
} = bgManager;

function selectFirst() {
  S.selectedGroup = S.groups.length ? S.groups[0].id : null;
  S.selectedItem = null;
}

/** Mengembalikan true bila file groups.json sudah ada; false = pertama kali. */
export async function loadGroups() {
  let store = null;
  try {
    store = await invoke('load_groups');
  } catch (err) {
    console.warn('Gagal memuat grup:', err);
  }
  S.groups = store && Array.isArray(store.groups) ? store.groups : [];
  selectFirst();
  return !!store;
}

/** Pertama kali: bungkus background lama menjadi grup "Umum". */
export function migrateBackground(bg) {
  const items = [];
  if (bg && bg.src && bg.kind) {
    items.push({
      id: uid(),
      src: bg.src,
      kind: bg.kind,
      loop: bg.loop,
      mute: bg.mute,
      scale: bg.scale,
      opacity: bg.opacity,
      added: Date.now(),
    });
  }
  S.groups = [{ id: uid(), name: 'Umum', items }];
  selectFirst();
}

/** Gabungkan grup dari paket sesi: nama sama digabung, item duplikat dilewati. */
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
}