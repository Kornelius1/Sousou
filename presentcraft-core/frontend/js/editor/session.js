// State bersama editor + pub-sub kecil antar modul editor.
// File ini TIDAK mengimpor modul editor lain, jadi aman diimpor dari mana saja (tanpa impor melingkar).
// Modul UI saling berkabar lewat fireEd/onEd, bukan saling memanggil.
//
// Event yang dipakai:
//   text:changed {i}      teks layer i berubah (dari kanvas atau form)  -> label layer, form, thumbnail
//   changed               properti layer berubah                         -> thumbnail filmstrip
//   history               tumpukan undo/redo berubah                     -> tombol Undo/Redo
//   restored              undo/redo memulihkan data                      -> render ulang semuanya
//   hit {i,x,y}           klik layer di kanvas                           -> pilih (+ edit teks)
//   stage:blank           klik area kosong di sekitar kanvas             -> akhiri edit teks
//   layer:request i       klik baris di panel Layers                     -> pilih layer
//   slide:request k       klik slide di filmstrip                        -> pindah slide
export const ed = {
  root: null, // elemen .ed-root; null = editor tertutup
  items: [], // [{ index, layers, orig }]  satu entri per slide dalam grup
  cur: 0, // posisi slide aktif di items
  sel: -1, // indeks layer terpilih pada slide aktif
  showBg: true,
  editing: null, // { i, box, txt } saat teks sedang diedit di kanvas
  hist: [], // snapshot JSON seluruh grup
  hi: 0, // posisi di hist
};

export const L = () => ed.items[ed.cur].layers;
export const q = (selector) => ed.root.querySelector(selector);
export const snapshot = () => JSON.stringify(ed.items.map((it) => it.layers));
export const isDirty = () => ed.items.some((it) => JSON.stringify(it.layers) !== it.orig);

const subs = new Map();
export function onEd(ev, fn) {
  if (!subs.has(ev)) subs.set(ev, []);
  subs.get(ev).push(fn);
}
export function fireEd(ev, arg) {
  for (const fn of subs.get(ev) || []) fn(arg);
}