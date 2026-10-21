// Undo/redo berbasis snapshot seluruh grup. Tidak menyentuh DOM; hanya memberi kabar lewat event.
import { ed, L, snapshot, fireEd } from "./session.js";

export function resetHistory() {
  ed.hist = [snapshot()];
  ed.hi = 0;
}

export function push() {
  const s = snapshot();
  if (s === ed.hist[ed.hi]) return;
  ed.hist = ed.hist.slice(0, ed.hi + 1);
  ed.hist.push(s);
  ed.hi = ed.hist.length - 1;
  fireEd("history");
}

// d = -1 (undo) atau 1 (redo). Pemanggil harus mengakhiri edit teks di kanvas lebih dulu.
export function go(d) {
  const n = ed.hi + d;
  if (n < 0 || n >= ed.hist.length) return;
  ed.hi = n;
  const arr = JSON.parse(ed.hist[ed.hi]);
  ed.items.forEach((it, k) => (it.layers = arr[k]));
  if (ed.sel >= L().length) ed.sel = L().length - 1;
  fireEd("restored");
}