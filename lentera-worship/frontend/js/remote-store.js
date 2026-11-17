// Mirror dari data yang dimiliki Rust. JS tidak mengubah `s.groups` sendiri:
// setiap perubahan lewat command, lalu mirror diganti dengan hasil dari Rust.
import { emit } from "./bus.js";
import { invoke } from "./tauri.js";

export function createRemoteStore({ name, prefix }) {
  const s = { groups: [], gid: null, iid: null };
  const evChanged = `${name}-changed`;
  const evSel = `${name}-selection`;

  const find = (id) => s.groups.find((g) => g.id === id);
  const selectedGroup = () => find(s.gid);
  const selectedItem = () => {
    const g = selectedGroup();
    return g ? g.items.find((i) => i.id === s.iid) : undefined;
  };

  function fixSelection() {
    if (!find(s.gid)) {
      s.gid = s.groups.length ? s.groups[0].id : null;
      s.iid = null;
    } else if (s.iid && !selectedItem()) {
      s.iid = null;
    }
  }

  // Semua perubahan berjalan berurutan supaya mirror tidak tertimpa balasan lama.
  let queue = Promise.resolve();
  function mutate(cmd, args, fallback = null, beforeFix) {
    const run = queue.then(async () => {
      const prevG = s.gid;
      const prevI = s.iid;
      try {
        const r = await invoke(`${prefix}_${cmd}`, args);
        s.groups = r.store.groups;
        if (beforeFix) beforeFix(r.result);
        fixSelection();
        emit(evChanged);
        if (s.gid !== prevG || s.iid !== prevI) emit(evSel);
        return r.result;
      } catch (err) {
        console.warn(`gagal ${cmd} (${name}):`, err);
        return fallback;
      }
    });
    queue = run;
    return run;
  }

  async function load() {
    let store = null;
    try {
      store = await invoke(`${prefix}_get`);
    } catch (err) {
      console.warn(`gagal memuat ${name}:`, err);
    }
    s.groups = store && Array.isArray(store.groups) ? store.groups : [];
    s.gid = s.groups.length ? s.groups[0].id : null;
    s.iid = null;
    return !!store;
  }

  // ---- pilihan: murni urusan tampilan, tetap sinkron di JS ----
  function selectGroup(id) {
    if (s.gid === id && s.iid === null) return;
    s.gid = id;
    s.iid = null;
    emit(evSel);
  }
  function selectItem(gid, iid) {
    s.gid = gid;
    s.iid = iid;
    emit(evSel);
  }

  // ---- perubahan data: semuanya async ----
  const createGroup = (n = "Grup baru") =>
    mutate("create_group", { name: n }, null, (g) => {
      s.gid = g.id;
      s.iid = null;
    });

  const renameGroup = (id, n) => mutate("rename_group", { id, name: n }, false);

  function deleteGroup(id) {
    const idx = s.groups.findIndex((g) => g.id === id);
    return mutate("delete_group", { id }, false, (ok) => {
      if (ok && s.gid === id) {
        const n = s.groups[Math.min(idx, s.groups.length - 1)];
        s.gid = n ? n.id : null;
        s.iid = null;
      }
    });
  }

  async function ensureGroup(n) {
    const id = await mutate("ensure_group", { name: n });
    return id ? find(id) : null;
  }

  // argumen ketiga (kindFn) diabaikan: Rust yang menentukan tipe file
  const addFiles = (gid, paths) => mutate("add_files", { gid, paths }, 0);
  const addInput = (gid, cfg) => mutate("add_input", { gid, cfg });
  const addBlank = (gid, n) => mutate("add_blank", { gid, name: n });
  const replaceSlides = (gid, origin, slides) =>
    mutate("replace_slides", { gid, origin, slides }, 0);
  const setTag = (gid, iid, tag) =>
    mutate("set_tag", { gid, iid, tag: tag ? { name: tag.name, color: tag.color } : null }, false);
  const copyInMany = (gid, items) =>
    mutate("copy_in_many", { gid, items }, { ok: 0, dup: 0 });
  async function copyIn(gid, it) {
    const r = await copyInMany(gid, [it]);
    return r.ok ? "ok" : r.dup ? "dup" : null;
  }
  const removeItem = (gid, iid) => mutate("remove_item", { gid, iid }, false);

  async function moveItem(from, iid, to) {
    const wasSel = s.iid === iid;
    const r = await mutate("move_item", { from, iid, to }, "notfound", (res) => {
      if (res === "ok" && wasSel) {
        s.gid = to;
        s.iid = iid;
      }
    });
    return r === "ok" || r === "dup" ? r : null;
  }

  const sortGroup = (gid, by, dir) => mutate("sort_group", { gid, by, dir }, false);

  // Sering dipanggil (geser layer): Rust hanya membalas item yang berubah.
  function updateItem(gid, iid, patch) {
    const run = queue.then(async () => {
      try {
        const it = await invoke(`${prefix}_update_item`, { gid, iid, patch });
        if (!it) return false;
        const g = find(gid);
        const i = g ? g.items.findIndex((x) => x.id === iid) : -1;
        if (i >= 0) g.items[i] = it;
        emit(evChanged);
        return true;
      } catch (err) {
        console.warn(`gagal update_item (${name}):`, err);
        return false;
      }
    });
    queue = run;
    return run;
  }

  return {
    s, find, selectedGroup, selectedItem, load,
    selectGroup, selectItem, createGroup, renameGroup, deleteGroup,
    addFiles, addBlank, addInput, copyIn, copyInMany, removeItem,
    moveItem, sortGroup, ensureGroup, replaceSlides, setTag, updateItem,
  };
}