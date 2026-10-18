import { state as S } from './state.js';
import { on } from './bus.js';
import { $, baseName } from './utils.js';
import { MEDIA_FILTER } from './media.js';
import { openDialog, confirmDialog } from './tauri.js';
import * as G from './groups.js';

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
  row.title = it.kind === 'color' ? it.src : it.src;
  if (it.kind === 'color') {
    const sw = el('span', 'ex-swatch');
    sw.style.background = it.src;
    row.append(sw, el('span', 'ex-name', it.src));
  } else {
    row.append(el('span', 'ex-ico', it.kind === 'video' ? '🎞' : '🖼'), el('span', 'ex-name', baseName(it.src)));
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
      if (!g.items.length) list.appendChild(el('p', 'ex-empty ex-indent', 'Grup kosong'));
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

async function deleteSelected() {
  const g = G.selectedGroup();
  if (!g) return;
  if (S.selectedItem) return G.removeItem(g.id, S.selectedItem);
  if (g.items.length && !(await confirmDialog(`Hapus grup “${g.name}” beserta ${g.items.length} item di dalamnya?\n(File aslinya tidak dihapus.)`))) return;
  G.deleteGroup(g.id);
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

export function initExplorer() {
  // klik: pilih saja, tidak menayangkan apa pun
  list.addEventListener('click', (e) => {
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
  act('ex-delete', deleteSelected);

  on('groups-changed', render);
  on('selection-changed', render);
  if (S.selectedGroup) open.add(S.selectedGroup);
  render();
}