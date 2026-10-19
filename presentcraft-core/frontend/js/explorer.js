import { state as S } from './state.js';
import { on } from './bus.js';
import { $, baseName, setStatus } from './utils.js';
import { MEDIA_FILTER } from './media.js';
import { openDialog, confirmDialog } from './tauri.js';
import * as G from './groups.js';
import { askConfirm } from './confirm.js';

const list = $('ex-list');
const open = new Set(); // grup yang sedang dibuka (tidak disimpan)
let editing = null;     // id grup yang sedang diganti namanya

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function itemRow(g, it) {
  const row = el('div', 'ex-row ex-item' + (S.selectedItem === it.id ? ' sel' : ''));
  row.dataset.gid = g.id;
  row.dataset.iid = it.id;
  row.style.paddingLeft = '34px';
  if (it.kind === 'color') {
    const sw = el('span', 'ex-swatch');
    sw.style.background = it.src;
    row.append(sw, el('span', 'ex-name', it.src));
  } else {
    row.append(el('span', 'ex-ico ' + it.kind), el('span', 'ex-name', baseName(it.src)));
  }
  return row;
}

function groupRow(g) {
  const isOpen = open.has(g.id);
  const row = el('div', 'ex-row ex-group' + (isOpen ? ' open' : '') +
    (S.selectedGroup === g.id && !S.selectedItem ? ' sel' : ''));
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
  $('ex-count').textContent = S.groups.length ? `(${S.groups.length})` : '';
  if (!S.groups.length) {
    list.appendChild(el('p', 'ex-empty', 'Belum ada grup. Klik ikon folder di atas.'));
    return;
  }
  for (const g of S.groups) {
    list.appendChild(groupRow(g));
    if (open.has(g.id)) {
      for (const it of g.items) list.appendChild(itemRow(g, it));
    }
  }
  const inp = list.querySelector('.ex-edit');
  if (inp) { inp.focus(); inp.select(); }
}

function startRename(gid) {
  editing = gid;
  render();
}

function endRename(inp, gid, save) {
  if (editing !== gid) return;
  editing = null;
  const name = inp.value.trim();
  if (save && name) G.renameGroup(gid, name); // memicu render lewat 'groups-changed'
  else render();
}

const nameOf = (it) => (it.kind === 'color' ? it.src : baseName(it.src));

async function deleteSelected() {
  const g = G.selectedGroup();
  if (!g) return;
  const it = G.selectedItem();

  if (it) {
    const ok = await askConfirm({
      key: 'delete',
      title: 'Delete item',
      message: `Remove “${nameOf(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
    });
    if (ok) G.removeItem(g.id, it.id);
    return;
  }

  const n = g.items.length;
  const ok = await askConfirm({
    key: 'delete',
    title: 'Delete group',
    message: n
      ? `Delete “${g.name}” and its ${n} item${n > 1 ? 's' : ''}?\nThe original files on disk are not deleted.`
      : `Delete the empty group “${g.name}”?`,
  });
  if (ok) G.deleteGroup(g.id);
}

async function addFilesToSelected() {
  let g = G.selectedGroup();
  if (!g) g = G.createGroup('Umum');
  const r = await openDialog({ multiple: true, filters: MEDIA_FILTER });
  if (!r) return;
  open.add(g.id);
  G.addFiles(g.id, Array.isArray(r) ? r : [r]);
  render();
}

// ---------- drag item antar grup (berbasis mouse, bukan HTML5 DnD) ----------
let drag = null;
let suppressClick = false;

function groupRowAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const row = el && el.closest('.ex-row');
  if (!row || !list.contains(row)) return null;
  return row.dataset.gid !== drag.gid ? row.dataset.gid : null; // baris item pun dihitung milik grupnya
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
  document.querySelectorAll('.ex-ghost').forEach((g) => g.remove()); // buang semua, termasuk yang yatim
  list.querySelectorAll('.ex-group.drop').forEach((r) => r.classList.remove('drop'));
  document.body.classList.remove('ex-dragging');
  drag = null;
}


function onDragMove(e) {
  if (!drag) return;
  if (!(e.buttons & 1)) return endDrag(); // tombol sudah dilepas di luar jendela / event hilang
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
  const dropped = d.on;
  const to = d.target;
  endDrag();
  if (!dropped) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (!to) return;
  const r = G.moveItem(d.gid, d.iid, to);
  if (r === 'ok') { open.add(to); render(); }
  else if (r === 'dup') setStatus('File itu sudah ada di grup tujuan.');
}

function onDragKey(e) {
  if (e.key === 'Escape') endDrag();
}

function startDragWatch(e) {
  if (e.button !== 0 || e.target.closest('.ex-edit')) return;
  const row = e.target.closest('.ex-item');
  if (!row) return;
  if (drag) endDrag(); // sisa drag sebelumnya
  e.preventDefault();  // cegah seleksi teks dan drag bawaan browser
  list.focus();        // preventDefault menahan fokus otomatis; Delete/F2 tetap perlu fokus
  drag = {
    gid: row.dataset.gid, iid: row.dataset.iid, name: row.textContent.trim(),
    x: e.clientX, y: e.clientY, on: false, ghost: null, target: null,
  };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
  document.addEventListener('keydown', onDragKey, true);
  window.addEventListener('blur', endDrag);
}

// ---------- sort menu ----------
const SORT_BY = [
  ['name', 'Name'],
  ['added', 'Date added'],
  ['kind', 'Type'],
];
const SORT_DIR = [
  ['asc', 'Ascending'],
  ['desc', 'Descending'],
];
const sortPref = new Map(); // groupId -> { by, dir }
let menu = null;

function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  document.removeEventListener('mousedown', menuOutside, true);
  document.removeEventListener('keydown', menuKey, true);
}

function menuOutside(e) {
  if (!e.target.closest('.ex-menu') && !e.target.closest('#ex-sort')) closeMenu();
}

function menuKey(e) {
  if (e.key === 'Escape') closeMenu();
}

function openSortMenu() {
  if (menu) return closeMenu();
  const g = G.selectedGroup();
  if (!g) return setStatus('Select a group first.');
  const pref = { ...(sortPref.get(g.id) || { by: 'name', dir: 'asc' }) };

  menu = el('div', 'ex-menu');
  const addItem = (text, on, fn) => {
    const b = el('button', 'ex-menu-i');
    b.append(el('span', 'ex-menu-dot', on ? '●' : ''), el('span', null, text));
    b.addEventListener('click', () => {
      closeMenu();
      fn();
    });
    menu.appendChild(b);
  };
  const apply = () => {
    sortPref.set(g.id, pref);
    G.sortGroup(g.id, pref.by, pref.dir);
    open.add(g.id);
    render();
  };

  for (const [by, text] of SORT_BY) addItem(text, pref.by === by, () => { pref.by = by; apply(); });
  menu.appendChild(el('div', 'ex-menu-sep'));
  for (const [dir, text] of SORT_DIR) addItem(text, pref.dir === dir, () => { pref.dir = dir; apply(); });

  document.body.appendChild(menu);
  const r = $('ex-sort').getBoundingClientRect();
  let top = r.bottom + 2;
  if (top + menu.offsetHeight > innerHeight) top = Math.max(4, r.top - menu.offsetHeight - 2);
  menu.style.top = top + 'px';
  menu.style.left = Math.max(4, Math.min(r.left, innerWidth - menu.offsetWidth - 4)) + 'px';
  document.addEventListener('mousedown', menuOutside, true);
  document.addEventListener('keydown', menuKey, true);
}

export function initExplorer() {
  // klik: pilih saja, tidak menayangkan apa pun
  list.addEventListener('click', (e) => {
    if (suppressClick) return;
    if (e.target.closest('.ex-edit')) return;
    const row = e.target.closest('.ex-row');
    if (!row) return;
    const gid = row.dataset.gid;
    if (row.dataset.iid) return G.selectItem(gid, row.dataset.iid);
    if (e.target.closest('.ex-twisty')) {
      open.has(gid) ? open.delete(gid) : open.add(gid);
      return render();
    }
    open.add(gid);
    G.selectGroup(gid);
    render();
  });

  list.addEventListener('mousedown', startDragWatch);

  list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.ex-group');
    if (row && !e.target.closest('.ex-edit')) startRename(row.dataset.gid);
  });

  list.addEventListener('keydown', (e) => {
    if (e.target.closest('.ex-edit')) return;
    if (e.key === 'F2' && S.selectedGroup && !S.selectedItem) startRename(S.selectedGroup);
    else if (e.key === 'Delete') deleteSelected();
  });

  const act = (id, fn) =>
    $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  act('ex-new', () => {
    const g = G.createGroup();
    open.add(g.id);
    startRename(g.id);
  });
  act('ex-add-file', addFilesToSelected);
  act('ex-sort', openSortMenu); 
  act('ex-delete', deleteSelected);

  on('groups-changed', render);
  on('selection-changed', render);
  on('item-updated', (it) => { if (it.kind === 'color') render(); });
  if (S.selectedGroup) open.add(S.selectedGroup);
  render();
}