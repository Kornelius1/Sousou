import { $, setStatus } from './utils.js';
import { on } from './bus.js';
import { openDialog } from './tauri.js';
import { askConfirm } from './confirm.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const ICON_KINDS = new Set(['image', 'video', 'audio', 'text']);

// ---------- popup menu (satu untuk seluruh aplikasi) ----------
let popup = null;
let popupAnchor = null;

export function closePopup() {
  if (!popup) return;
  popup.remove();
  popup = null;
  popupAnchor = null;
  document.removeEventListener('mousedown', popupOutside, true);
  document.removeEventListener('keydown', popupKey, true);
}
function popupOutside(e) {
  if (e.target.closest('.ex-menu')) return;
  if (popupAnchor && popupAnchor.contains(e.target)) return; // klik tombol pemilik = toggle
  closePopup();
}
function popupKey(e) { if (e.key === 'Escape') closePopup(); }
const popupOpenFor = (a) => !!popup && popupAnchor === a;

/** entries: { label, dot?, disabled?, run? } | { sep: true } */
export function showPopup(entries, { x = 0, y = 0, anchor = null } = {}) {
  closePopup();
  const m = el('div', 'ex-menu');
  for (const e of entries) {
    if (e.sep) { m.appendChild(el('div', 'ex-menu-sep')); continue; }
    const b = el('button', 'ex-menu-i');
    b.disabled = !!e.disabled;
    b.append(el('span', 'ex-menu-dot', e.dot ? '●' : ''), el('span', null, e.label));
    b.addEventListener('click', () => { closePopup(); if (e.run) e.run(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  popup = m;
  popupAnchor = anchor;

  let left = x, top = y;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    left = r.left; top = r.bottom + 2;
    if (top + m.offsetHeight > innerHeight) top = Math.max(4, r.top - m.offsetHeight - 2);
  } else if (top + m.offsetHeight > innerHeight) {
    top = Math.max(4, innerHeight - m.offsetHeight - 4);
  }
  m.style.top = top + 'px';
  m.style.left = Math.max(4, Math.min(left, innerWidth - m.offsetWidth - 4)) + 'px';
  document.addEventListener('mousedown', popupOutside, true);
  document.addEventListener('keydown', popupKey, true);
}

// ---------- pohon ----------
const SORT_BY = [['name', 'Name'], ['added', 'Date added'], ['kind', 'Type']];
const SORT_DIR = [['asc', 'Ascending'], ['desc', 'Descending']];

/**
 * cfg = {
 *   ids: { list, count, new, add, sort, del },
 *   events: string[],                 // event bus yang memicu render ulang
 *   groups: () => Group[],            // termasuk grup virtual
 *   readOnly: (gid) => boolean,
 *   sel: () => ({ gid, iid }),
 *   itemName, filters, kindOf, openByDefault?: string[],
 *   api: { selectGroup, selectItem, createGroup, renameGroup, deleteGroup,
 *          removeItem, moveItem, sortGroup, addFiles },
 *   onActivate?: (group, item) => void,          // klik dua kali pada item
 *   contextMenu?: (group, item) => entries[],    // klik kanan pada item
 * }
 */
export function createTree(cfg) {
  const list = $(cfg.ids.list);
  const open = new Set(cfg.openByDefault || []);
  const sortPref = new Map();
  let editing = null;
  let drag = null;
  let suppressClick = false;

  const group = (gid) => cfg.groups().find((g) => g.id === gid);
  const ro = (gid) => cfg.readOnly(gid);

  // ----- render -----
  function itemRow(g, it, si) {
    const row = el('div', 'ex-row ex-item' + (si === it.id ? ' sel' : ''));
    row.dataset.gid = g.id;
    row.dataset.iid = it.id;
    row.style.paddingLeft = '34px';
    if (it.kind === 'color') {
      const sw = el('span', 'ex-swatch');
      sw.style.background = it.src;
      row.appendChild(sw);
    } else {
      row.appendChild(el('span', 'ex-ico ' + (ICON_KINDS.has(it.kind) ? it.kind : 'file')));
    }
    row.appendChild(el('span', 'ex-name', cfg.itemName(it)));
    return row;
  }

  function groupRow(g, sg, si) {
    const row = el('div', 'ex-row ex-group' + (open.has(g.id) ? ' open' : '') +
      (ro(g.id) ? ' ro' : '') + (sg === g.id && !si ? ' sel' : ''));
    row.dataset.gid = g.id;
    row.append(el('span', 'ex-twisty', '▸'));
    if (editing === g.id) {
      const inp = el('input', 'ex-edit');
      inp.value = g.name;
      inp.maxLength = 60;
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') endRename(inp, g.id, true);
        else if (e.key === 'Escape') endRename(inp, g.id, false);
      });
      inp.addEventListener('blur', () => endRename(inp, g.id, true));
      row.appendChild(inp);
    } else {
      row.appendChild(el('span', 'ex-name', g.name));
    }
    row.appendChild(el('span', 'ex-n', String(g.items.length)));
    return row;
  }

  function render() {
    list.replaceChildren();
    const groups = cfg.groups();
    const cnt = $(cfg.ids.count);
    if (cnt) cnt.textContent = groups.length ? `(${groups.length})` : '';
    if (!groups.length) {
      list.appendChild(el('p', 'ex-empty', 'Belum ada grup. Klik ikon folder di atas.'));
      return;
    }
    const { gid: sg, iid: si } = cfg.sel();
    for (const g of groups) {
      list.appendChild(groupRow(g, sg, si));
      if (open.has(g.id)) for (const it of g.items) list.appendChild(itemRow(g, it, si));
    }
    const inp = list.querySelector('.ex-edit');
    if (inp) { inp.focus(); inp.select(); }
  }

  // ----- ganti nama -----
  function startRename(gid) {
    if (ro(gid)) return setStatus('This group is read-only.');
    editing = gid;
    render();
  }
  function endRename(inp, gid, save) {
    if (editing !== gid) return;
    editing = null;
    const name = inp.value.trim();
    if (save && name) cfg.api.renameGroup(gid, name); // memicu render lewat event
    else render();
  }

  // ----- hapus (dengan konfirmasi) -----
  async function deleteSelected() {
    const { gid } = cfg.sel();
    const g = group(gid);
    if (!g) return;
    if (ro(g.id)) return setStatus('This group is read-only.');
    const it = g.items.find((x) => x.id === cfg.sel().iid);
    if (it) {
      const ok = await askConfirm({
        key: 'delete', title: 'Delete item',
        message: `Remove “${cfg.itemName(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
      });
      if (ok) cfg.api.removeItem(g.id, it.id);
      return;
    }
    const n = g.items.length;
    const ok = await askConfirm({
      key: 'delete', title: 'Delete group',
      message: n
        ? `Delete “${g.name}” and its ${n} item${n > 1 ? 's' : ''}?\nThe original files on disk are not deleted.`
        : `Delete the empty group “${g.name}”?`,
    });
    if (ok) cfg.api.deleteGroup(g.id);
  }

  // ----- tambah file -----
  async function addFilesToSelected() {
    let g = group(cfg.sel().gid);
    if (!g || ro(g.id)) g = cfg.groups().find((x) => !ro(x.id)) || cfg.api.createGroup('Umum');
    const r = await openDialog({ multiple: true, filters: cfg.filters });
    if (!r) return;
    open.add(g.id);
    cfg.api.addFiles(g.id, Array.isArray(r) ? r : [r]);
    render();
  }

  // ----- sort -----
  function openSortMenu() {
    const btn = $(cfg.ids.sort);
    if (popupOpenFor(btn)) return closePopup();
    const g = group(cfg.sel().gid);
    if (!g) return setStatus('Select a group first.');
    if (ro(g.id)) return setStatus('This group is read-only.');
    const pref = { ...(sortPref.get(g.id) || { by: 'name', dir: 'asc' }) };
    const apply = () => {
      sortPref.set(g.id, pref);
      cfg.api.sortGroup(g.id, pref.by, pref.dir);
      open.add(g.id);
      render();
    };
    showPopup([
      ...SORT_BY.map(([by, label]) => ({ label, dot: pref.by === by, run: () => { pref.by = by; apply(); } })),
      { sep: true },
      ...SORT_DIR.map(([dir, label]) => ({ label, dot: pref.dir === dir, run: () => { pref.dir = dir; apply(); } })),
    ], { anchor: btn });
  }

  // ----- seret item antar grup (berbasis mouse) -----
  function groupRowAt(x, y) {
    const e = document.elementFromPoint(x, y);
    const row = e && e.closest('.ex-row');
    if (!row || !list.contains(row)) return null;
    const gid = row.dataset.gid;
    return gid !== drag.gid && !ro(gid) ? gid : null;
  }
  function setDropTarget(gid) {
    if (drag.target === gid) return;
    list.querySelectorAll('.ex-group.drop').forEach((r) => r.classList.remove('drop'));
    drag.target = gid;
    if (gid) {
      const r = list.querySelector(`.ex-group[data-gid="${gid}"]`);
      if (r) r.classList.add('drop');
    }
  }
  function endDrag() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    document.removeEventListener('keydown', onDragKey, true);
    window.removeEventListener('blur', endDrag);
    document.querySelectorAll('.ex-ghost').forEach((g) => g.remove());
    list.querySelectorAll('.ex-group.drop').forEach((r) => r.classList.remove('drop'));
    document.body.classList.remove('ex-dragging');
    drag = null;
  }
  function onDragMove(e) {
    if (!drag) return;
    if (!(e.buttons & 1)) return endDrag();
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.on = true;
      drag.ghost = el('div', 'ex-ghost', drag.name);
      document.body.appendChild(drag.ghost);
      document.body.classList.add('ex-dragging');
      window.getSelection()?.removeAllRanges();
    }
    drag.ghost.style.left = e.clientX + 12 + 'px';
    drag.ghost.style.top = e.clientY + 8 + 'px';
    setDropTarget(groupRowAt(e.clientX, e.clientY));
  }
  function onDragUp() {
    if (!drag) return;
    const d = drag;
    endDrag();
    if (!d.on) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (!d.target) return;
    const r = cfg.api.moveItem(d.gid, d.iid, d.target); // grup baca-saja: disalin, bukan dipindah
    const name = (group(d.target) || {}).name || '';
    if (r === 'ok') {
      open.add(d.target);
      render();
      setStatus(`${ro(d.gid) ? 'Copied' : 'Moved'} to “${name}”.`);
    } else if (r === 'dup') {
      setStatus('That item already exists in the target group.');
    }
  }
  function onDragKey(e) { if (e.key === 'Escape') endDrag(); }
  function startDragWatch(e) {
    if (e.button !== 0 || e.target.closest('.ex-edit')) return;
    const row = e.target.closest('.ex-item');
    if (!row) return;
    if (drag) endDrag();
    e.preventDefault();
    list.focus();
    drag = {
      gid: row.dataset.gid, iid: row.dataset.iid, name: row.textContent.trim(),
      x: e.clientX, y: e.clientY, on: false, ghost: null, target: null,
    };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
    document.addEventListener('keydown', onDragKey, true);
    window.addEventListener('blur', endDrag);
  }

  // ----- event DOM -----
  list.addEventListener('click', (e) => {
    if (suppressClick || e.target.closest('.ex-edit')) return;
    const row = e.target.closest('.ex-row');
    if (!row) return;
    const gid = row.dataset.gid;
    if (row.dataset.iid) return cfg.api.selectItem(gid, row.dataset.iid);
    if (e.target.closest('.ex-twisty')) {
      open.has(gid) ? open.delete(gid) : open.add(gid);
      return render();
    }
    open.add(gid);
    cfg.api.selectGroup(gid);
    render();
  });
  list.addEventListener('mousedown', startDragWatch);
  list.addEventListener('dblclick', (e) => {
    if (e.target.closest('.ex-edit')) return;
    const item = e.target.closest('.ex-item');
    if (item) {
      const g = group(item.dataset.gid);
      const it = g && g.items.find((x) => x.id === item.dataset.iid);
      if (it && cfg.onActivate) cfg.onActivate(g, it);
      return;
    }
    const row = e.target.closest('.ex-group');
    if (row) startRename(row.dataset.gid);
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.ex-item');
    if (!row || !cfg.contextMenu) return;
    e.preventDefault();
    const g = group(row.dataset.gid);
    const it = g && g.items.find((x) => x.id === row.dataset.iid);
    if (!it) return;
    cfg.api.selectItem(g.id, it.id);
    const entries = cfg.contextMenu(g, it);
    if (entries && entries.length) showPopup(entries, { x: e.clientX, y: e.clientY });
  });
  list.addEventListener('keydown', (e) => {
    if (e.target.closest('.ex-edit')) return;
    if (e.key.startsWith('Arrow') || e.key === ' ') e.stopPropagation();
    const { gid, iid } = cfg.sel();
    if (e.key === 'F2' && gid && !iid) startRename(gid);
    else if (e.key === 'Delete') deleteSelected();
  });

  const act = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  act(cfg.ids.new, () => {
    const g = cfg.api.createGroup();
    open.add(g.id);
    startRename(g.id);
  });
  act(cfg.ids.add, addFilesToSelected);
  act(cfg.ids.sort, openSortMenu);
  act(cfg.ids.del, deleteSelected);

  cfg.events.forEach((ev) => on(ev, render));
  const { gid } = cfg.sel();
  if (gid) open.add(gid);
  render();
  return { render, openGroup: (id) => open.add(id) };
}