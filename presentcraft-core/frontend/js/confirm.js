// Dialog konfirmasi dengan kotak centang "Don't ask again".
// Pilihan disimpan di localStorage per `key`.
const PREFIX = 'pc.skipConfirm.';

const skipped = (key) => {
  try { return localStorage.getItem(PREFIX + key) === '1'; } catch { return false; }
};

/** Kembalikan semua dialog ke keadaan "tanya lagi". */
export function resetConfirmations() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* abaikan */ }
}

let busy = false;

/** Resolve true bila pengguna setuju (atau sudah pernah memilih "jangan tanya lagi"). */
export function askConfirm({ title, message, okText = 'Delete', key }) {
  if (key && skipped(key)) return Promise.resolve(true);
  if (busy) return Promise.resolve(false);
  busy = true;

  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const mk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    const overlay = mk('div', 'cf-overlay');
    const box = mk('div', 'cf-box');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');

    const check = mk('input');
    check.type = 'checkbox';
    const skipRow = mk('label', 'cf-skip');
    skipRow.append(check, mk('span', null, "Don't ask again"));

    const cancel = mk('button', 'cf-btn', 'Cancel');
    const ok = mk('button', 'cf-btn cf-danger', okText);
    const row = mk('div', 'cf-btns');
    row.append(cancel, ok);

    box.append(mk('div', 'cf-title', title), mk('div', 'cf-msg', message));
    if (key) box.appendChild(skipRow);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function finish(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      busy = false;
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(result);
    }

    function onKey(e) {
      e.stopPropagation(); // jangan bocor ke shortcut slide / explorer
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab') {
        // fokus tetap di dalam dialog
        const f = [...box.querySelectorAll('input, button')];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }

    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => {
      // disimpan hanya kalau benar-benar dikonfirmasi
      if (key && check.checked) {
        try { localStorage.setItem(PREFIX + key, '1'); } catch { /* abaikan */ }
      }
      finish(true);
    });
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(false); });
    document.addEventListener('keydown', onKey, true);
    ok.focus();
  });
}