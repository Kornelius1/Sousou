import { emit } from "./bus.js";
import { invoke } from "./tauri.js";

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const itemName = (it) =>
  it.kind === "color"
    ? it.src
    : it.kind === "text" || it.kind === "slide"
      ? it.label || (it.text || "").slice(0, 30)
      : it.src.split(/[\\/]/).pop();

export const sameItem = (a, b) =>
  a.kind === b.kind &&
  (a.kind === "slide"
    ? a.id === b.id
    : a.kind === "text"
      ? a.text === b.text
      : a.src === b.src);

export const newBlank = (name) => ({ ...base(), kind: "slide", label: name });

const base = () => ({
  id: uid(),
  src: "",
  text: "",
  label: "",
  loop: true,
  mute: true,
  scale: "fill",
  opacity: 1,
  added: Date.now(),
});

export function createStore({ name, loadCmd, saveCmd }) {
  const s = { groups: [], gid: null, iid: null };
  const evChanged = `${name}-changed`;
  const evSel = `${name}-selection`;

  const find = (id) => s.groups.find((g) => g.id === id);
  const selectedGroup = () => find(s.gid);
  const selectedItem = () => {
    const g = selectedGroup();
    return g ? g.items.find((i) => i.id === s.iid) : undefined;
  };

  let timer;
  let chain = Promise.resolve();
  function persist() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const store = JSON.parse(JSON.stringify({ groups: s.groups }));
      chain = chain
        .then(() => invoke(saveCmd, { store }))
        .catch((err) => console.warn(`gagal menyimpan ${name}:`, err));
    }, 300);
  }
  function changed() {
    persist();
    emit(evChanged);
  }
  function selFirst() {
    s.gid = s.groups.length ? s.groups[0].id : null;
    s.iid = null;
  }

  async function load() {
    let store = null;
    try {
      store = await invoke(loadCmd);
    } catch (err) {
      console.warn(`gagal memuat ${name}:`, err);
    }
    s.groups = store && Array.isArray(store.groups) ? store.groups : [];
    selFirst();
    return !!store;
  }

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

  function createGroup(n = "Grup baru") {
    const g = { id: uid(), name: n, items: [] };
    s.groups.push(g);
    s.gid = g.id;
    s.iid = null;
    changed();
    emit(evSel);
    return g;
  }
  function renameGroup(id, n) {
    const g = find(id);
    if (!g || !n.trim()) return;
    g.name = n.trim();
    changed();
  }
  function deleteGroup(id) {
    const i = s.groups.findIndex((g) => g.id === id);
    if (i < 0) return;
    s.groups.splice(i, 1);
    if (s.gid === id) {
      const n = s.groups[Math.min(i, s.groups.length - 1)];
      s.gid = n ? n.id : null;
      s.iid = null;
      emit(evSel);
    }
    changed();
  }

  function addFiles(gid, paths, kindFn) {
    const g = find(gid);
    if (!g) return 0;
    let n = 0;
    for (const p of paths) {
      const it = { ...base(), src: p, kind: kindFn(p) };
      if (!it.kind || g.items.some((x) => sameItem(x, it))) continue;
      g.items.push(it);
      n++;
    }
    if (n) changed();
    return n;
  }

  function addBlank(gid, name) {
    const g = find(gid);
    if (!g) return null;
    const it = { ...base(), kind: "slide", label: name };
    g.items.push(it);
    changed();
    return it;
  }

  function replaceSlides(gid, origin, slides) {
    const g = find(gid);
    if (!g) return 0;
    // import ulang bundel yang sama: ganti slide lama, jangan dobel
    g.items = g.items.filter(
      (x) => !(x.kind === "slide" && x.origin === origin),
    );
    for (const s of slides)
      g.items.push({ ...base(), kind: "slide", origin, ...s });
    changed();
    return slides.length;
  }

  function setTag(gid, iid, tag) {
    const g = find(gid);
    const it = g && g.items.find((x) => x.id === iid);
    if (!it) return false;
    if (tag) it.tag = { name: tag.name, color: tag.color };
    else delete it.tag;
    changed();
    return true;
  }

  /** Salin item (mis. dari grup bundel) ke grup ini. 'ok' | 'dup' | null */
  function copyIn(gid, it) {
    const g = find(gid);
    if (!g) return null;
    if (g.items.some((x) => sameItem(x, it))) return "dup";
    g.items.push({ ...base(), ...it, id: uid(), added: Date.now() });
    changed();
    return "ok";
  }

  function removeItem(gid, iid) {
    const g = find(gid);
    if (!g) return;
    g.items = g.items.filter((it) => it.id !== iid);
    if (s.iid === iid) {
      s.iid = null;
      emit(evSel);
    }
    changed();
  }

  function moveItem(fromId, iid, toId) {
    const a = find(fromId),
      b = find(toId);
    if (!a || !b || a === b) return null;
    const i = a.items.findIndex((x) => x.id === iid);
    if (i < 0) return null;
    const it = a.items[i];
    if (b.items.some((x) => sameItem(x, it))) return "dup";
    a.items.splice(i, 1);
    b.items.push(it);
    if (s.iid === iid) s.gid = toId;
    changed();
    emit(evSel);
    return "ok";
  }

  function sortGroup(gid, by, dir) {
    const g = find(gid);
    if (!g) return;
    const sign = dir === "desc" ? -1 : 1;
    const byName = (a, b) => collator.compare(itemName(a), itemName(b));
    const cmp = {
      name: byName,
      kind: (a, b) => collator.compare(a.kind, b.kind) || byName(a, b),
      added: (a, b) => (a.added || 0) - (b.added || 0) || byName(a, b),
    }[by];
    if (!cmp) return;
    g.items.sort((a, b) => sign * cmp(a, b));
    changed();
  }

  /** Cari grup berdasarkan nama; buat bila belum ada. Tidak mengubah pilihan. */
  function ensureGroup(n) {
    let g = s.groups.find((x) => x.name === n);
    if (!g) {
      g = { id: uid(), name: n, items: [] };
      s.groups.push(g);
      changed();
    }
    return g;
  }

  return {
    s,
    find,
    selectedGroup,
    selectedItem,
    load,
    selectGroup,
    selectItem,
    createGroup,
    renameGroup,
    deleteGroup,
    addFiles,
    addBlank,
    copyIn,
    removeItem,
    moveItem,
    sortGroup,
    ensureGroup,
    replaceSlides,
    setTag
  };
}
