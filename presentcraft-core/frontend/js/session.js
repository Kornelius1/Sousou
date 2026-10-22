import { state } from './state.js';
import { setStatus } from './utils.js';
import { invoke, openDialog, saveDialog } from './tauri.js';
import { setBackground } from '../background-state.js';
import { applySlides } from './sorter/sorter.js';
import { lib } from './library.js';
import * as G from './groups.js';

const FILTERS = [{ name: 'PresentCraft session', extensions: ['ppsession'] }];

/** Dialog pilihan cakupan. Resolve { workspace, background } atau null bila dibatalkan. */
function chooseScope() {
  return new Promise((resolve) => {
    const mk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const row = (label, hint) => {
      const l = mk('label', 'cf-skip');
      const c = mk('input');
      c.type = 'checkbox';
      c.checked = true;
      const t = mk('span');
      t.append(mk('b', null, label), mk('br'), mk('span', null, hint));
      l.append(c, t);
      return { l, c };
    };

    const ws = row('Workspace', 'Slides with your edits, and the media library');
    const bg = row('Background', 'Background groups and the active background');
    const cancel = mk('button', 'cf-btn', 'Cancel');
    const ok = mk('button', 'cf-btn', 'Export');
    const btns = mk('div', 'cf-btns');
    btns.append(cancel, ok);

    const box = mk('div', 'cf-box');
    box.append(mk('div', 'cf-title', 'Export session'), mk('div', 'cf-msg', 'Choose what to include:'), ws.l, bg.l, btns);
    const overlay = mk('div', 'cf-overlay');
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const sync = () => { ok.disabled = !ws.c.checked && !bg.c.checked; };
    ws.c.addEventListener('change', sync);
    bg.c.addEventListener('change', sync);

    const finish = (r) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(r);
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(null);
    };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => finish({ workspace: ws.c.checked, background: bg.c.checked }));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(null); });
    document.addEventListener('keydown', onKey, true);
    ok.focus();
  });
}

export async function exportSession() {
  const opt = await chooseScope();
  if (!opt) return;

  const data = {};
  if (opt.workspace) {
    data.workspace = { bundleName: state.bundleName, slides: state.slides };
    data.library = { groups: lib.s.groups };
  }
  if (opt.background) data.background = { groups: state.groups, active: state.bg };

  const dest = await saveDialog({
    filters: FILTERS,
    defaultPath: (state.bundleName || 'session') + '.ppsession',
  });
  if (!dest) return;

  setStatus('Exporting…');
  try {
    const warnings = await invoke('export_session', {
      req: { dest, data: JSON.parse(JSON.stringify(data)) },
    });
    setStatus(warnings.length
      ? `Exported with ${warnings.length} warning(s): ${warnings[0]}`
      : 'Session exported.');
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + err);
  }
}

export async function importSession() {
  const pack = await openDialog({ multiple: false, filters: FILTERS });
  if (!pack) return;

  setStatus('Importing…');
  try {
    const d = await invoke('import_session', { pack });

    if (d.library) {
      for (const g of d.library.groups || []) {
        const t = lib.ensureGroup(g.name);
        for (const it of g.items || []) lib.copyIn(t.id, it);
      }
    }
    if (d.background) {
      G.mergeGroups(d.background.groups && d.background.groups.groups ? d.background.groups.groups : d.background.groups);
      if (d.background.active) await setBackground(d.background.active);
    }
    if (d.workspace) applySlides(d.workspace.slides || [], [], d.workspace.bundleName);

    setStatus('Session imported.');
  } catch (err) {
    console.error(err);
    setStatus('Import failed: ' + err);
  }
}