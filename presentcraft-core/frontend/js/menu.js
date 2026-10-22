import { $, setStatus } from './utils.js';
import { state } from './state.js';
import { refreshThumbBackgrounds } from './sorter/sorter.js';
import { importFile } from "./sorter/bundle-import.js";
import { resetConfirmations } from './confirm.js';
import { exportSession, importSession } from './session.js';

function togglePane(id, cls) {
  const el = $(id);
  el.hidden = !el.hidden;
  $('workspace').classList.toggle(cls, el.hidden);
}

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'Import file…', key: 'Ctrl+O', run: () => importFile() },
      { sep: true },
      { label: 'Import session…', run: () => importSession() },
      { label: 'Export session…', run: () => exportSession() },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Pustaka Media', checked: () => !$('library').hidden, run: () => togglePane('library', 'no-lib') },
      { label: 'Panel Properties', checked: () => !$('props').hidden, run: () => togglePane('props', 'no-props') },
      { label: 'Panel Background', checked: () => !$('media-panel').hidden, run: () => { $('media-panel').hidden = !$('media-panel').hidden; } },
      { label: 'Bar tombol', checked: () => !$('toolbar').hidden, run: () => { $('toolbar').hidden = !$('toolbar').hidden; } },
      { sep: true },
      { label: 'Background di thumbnail', checked: () => state.showBgInThumbs,
        run: () => { state.showBgInThumbs = !state.showBgInThumbs; refreshThumbBackgrounds(); } },
      { sep: true },
      { label: 'Reset confirmation dialogs', run: () => { resetConfirmations(); setStatus('Confirmations enabled again.'); } },
    ],
  },
];

const wraps = [];
let openMenu = -1;

function fillDropdown(dd, menu) {
  dd.replaceChildren();
  for (const it of menu.items) {
    if (it.sep) {
      const s = document.createElement('div');
      s.className = 'dd-sep';
      dd.appendChild(s);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'dd-item';
    b.disabled = !!it.disabled;
    const chk = document.createElement('span');
    chk.className = 'chk';
    chk.textContent = it.checked && it.checked() ? '✓' : '';
    const lab = document.createElement('span');
    lab.textContent = it.label;
    const key = document.createElement('span');
    key.className = 'dd-key';
    key.textContent = it.key || '';
    b.append(chk, lab, key);
    b.addEventListener('click', () => { closeMenus(); if (it.run) it.run(); });
    dd.appendChild(b);
  }
}

function setOpen(mi) {
  openMenu = mi;
  wraps.forEach((w, i) => {
    w.classList.toggle('open', i === mi);
    if (i === mi) fillDropdown(w.querySelector('.dropdown'), MENUS[i]);
  });
}
export const closeMenus = () => setOpen(-1);

export function initMenu() {
  const bar = $('menubar');
  MENUS.forEach((m, mi) => {
    const wrap = document.createElement('div');
    wrap.className = 'menu';
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.textContent = m.label;
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    wrap.append(btn, dd);
    bar.appendChild(wrap);
    wraps.push(wrap);
    btn.addEventListener('click', () => setOpen(openMenu === mi ? -1 : mi));
    btn.addEventListener('mouseenter', () => { if (openMenu >= 0) setOpen(mi); });
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
}