import { emit } from './bus.js';
import { invoke } from './tauri.js';
import { kindOf } from './media.js';

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export function createGroupManager(config) {
  const { getState, eventPrefix } = config;

  const emitChanged = () => emit(`${eventPrefix}-groups-changed`);
  const emitSelection = () => emit(`${eventPrefix}-selection-changed`);

  let saveTimer;
  let saveChain = Promise.resolve();

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const store = JSON.parse(JSON.stringify({ groups: getState().groups }));
      saveChain = saveChain
        .then(() => invoke('save_groups', { store }))
        .catch((err) => console.warn('Gagal menyimpan grup:', err));
    }, 300);
  }

  function changed() {
    persist();
    emitChanged();
  }

  return {
    getGroups: () => getState().groups,
    selectedGroup: () => getState().groups.find((g) => g.id === getState().selectedGroup) || null,
    selectedItem: () => {
      const g = getState().groups.find((g) => g.id === getState().selectedGroup);
      return g ? g.items.find((i) => i.id === getState().selectedItem) : undefined;
    },

    selectGroup: (gid) => {
      if (getState().selectedGroup === gid && getState().selectedItem === null) return;
      getState().selectedGroup = gid;
      getState().selectedItem = null;
      emitSelection();
    },

    selectItem: (gid, iid) => {
      getState().selectedGroup = gid;
      getState().selectedItem = iid;
      emitSelection();
    },

    createGroup: (name = 'Grup baru') => {
      const g = { id: uid(), name, items: [] };
      getState().groups.push(g);
      getState().selectedGroup = g.id;
      getState().selectedItem = null;
      changed();
      emitSelection();
      return g;
    },

    renameGroup: (id, name) => {
      const g = getState().groups.find((x) => x.id === id);
      if (!g || !name.trim()) return;
      g.name = name.trim();
      changed();
    },

    deleteGroup: (id) => {
      const groups = getState().groups;
      const i = groups.findIndex((g) => g.id === id);
      if (i < 0) return;
      groups.splice(i, 1);
      if (getState().selectedGroup === id) {
        const n = groups[Math.min(i, groups.length - 1)];
        getState().selectedGroup = n ? n.id : null;
        getState().selectedItem = null;
        emitSelection();
      }
      changed();
    },

    addFiles: (gid, paths) => {
      const g = getState().groups.find((x) => x.id === gid);
      if (!g) return 0;
      let n = 0;
      for (const p of paths) {
        const k = kindOf(p);
        if (!k || g.items.some((it) => it.src === p)) continue;
        g.items.push({
          id: uid(),
          src: p,
          kind: k,
          loop: true,
          mute: true,
          scale: 'fill',
          opacity: 1,
          added: Date.now(),
        });
        n++;
      }
      if (n) changed();
      return n;
    },

    removeItem: (gid, iid) => {
      const g = getState().groups.find((x) => x.id === gid);
      if (!g) return;
      g.items = g.items.filter((it) => it.id !== iid);
      if (getState().selectedItem === iid) {
        getState().selectedItem = null;
        emitSelection();
      }
      changed();
    },

    moveItem: (fromId, iid, toId) => {
      const groups = getState().groups;
      const a = groups.find((x) => x.id === fromId);
      const b = groups.find((x) => x.id === toId);
      if (!a || !b || a === b) return null;
      const i = a.items.findIndex((x) => x.id === iid);
      if (i < 0) return null;
      const it = a.items[i];
      if (b.items.some((x) => x.src === it.src && x.kind === it.kind)) return 'dup';
      a.items.splice(i, 1);
      b.items.push(it);
      if (getState().selectedItem === iid) getState().selectedGroup = toId;
      changed();
      emitSelection();
      return 'ok';
    },

    sortGroup: (gid, by, dir) => {
      const g = getState().groups.find((x) => x.id === gid);
      if (!g) return;
      const sign = dir === 'desc' ? -1 : 1;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const nameOf = (it) => (it.kind === 'color' ? it.src : it.src.split(/[\\/]/).pop());
      const byName = (a, b) => collator.compare(nameOf(a), nameOf(b));
      const cmp = {
        name: byName,
        kind: (a, b) => collator.compare(a.kind, b.kind) || byName(a, b),
        added: (a, b) => (a.added || 0) - (b.added || 0) || byName(a, b),
      }[by];
      if (!cmp) return;
      g.items.sort((a, b) => sign * cmp(a, b));
      changed();
    },
  };
}