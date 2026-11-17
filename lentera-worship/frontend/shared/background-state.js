// Satu-satunya pemilik state background. Tidak menyentuh DOM.
// Konvensi: untuk kind "video"/"image", src = path absolut file;
// untuk kind "color", src = string warna CSS (mis. "#000000").
const { invoke } = window.__TAURI__.core;
const { emit, listen } = window.__TAURI__.event;

export const BACKGROUND_EVENT = 'update-background-event';

const KINDS = ['video', 'image', 'color', 'input'];
const SCALES = ['fit', 'fill'];

let current = null;               // null = tidak ada background
let saveChain = Promise.resolve(); // simpan berurutan agar tidak saling timpa

/** Rapikan input apa pun menjadi objek valid, atau null. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!KINDS.includes(raw.kind) || !raw.src) return null;
  if (raw.kind === 'input' && !(raw.input && raw.input.media === 'video')) return null;
  const opacity = Number(raw.opacity);
  const out = {
    src: String(raw.src),
    kind: raw.kind,
    loop: raw.loop !== false,
    mute: raw.mute !== false,
    scale: SCALES.includes(raw.scale) ? raw.scale : 'fill',
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
  };
  if (raw.kind === 'input') out.input = raw.input;
  return out;
}

export const getBackground = () => current;

/** Baca dari disk. Dipanggil saat startup, oleh control maupun audience. */
export async function loadBackground() {
  try {
    current = normalize(await invoke('load_background_state'));
  } catch (err) {
    console.warn('gagal memuat state background:', err);
    current = null;
  }
  return current;
}

function persist(state) {
  saveChain = saveChain
    .then(() => invoke('save_background_state', { state }))
    .catch((err) => console.warn('gagal menyimpan state background:', err));
  return saveChain;
}

/** Ganti seluruh background. Hanya dipanggil dari Control Center. */
export async function setBackground(bg) {
  if (!visible) await setBackgroundVisible(true); 
  current = normalize(bg);
  await emit(BACKGROUND_EVENT, current); // layar dulu, disk menyusul
  await persist(current);
  return current;
}

/** Ubah sebagian pengaturan (mute, loop, opacity, scale) tanpa memilih ulang file. */
export function patchBackground(patch) {
  if (!current) return Promise.resolve(null);
  return setBackground({ ...current, ...patch });
}

export const clearBackground = () => setBackground(null);

export const BACKGROUND_VISIBLE_EVENT = 'background-visible-event';
let visible = true;

export const isBackgroundVisible = () => visible;

export function setBackgroundVisible(v) {
  visible = !!v;
  return emit(BACKGROUND_VISIBLE_EVENT, visible);
}

export function onBackgroundVisible(cb) {
  return listen(BACKGROUND_VISIBLE_EVENT, (e) => cb(!!e.payload));
}

/**
 * Dengarkan perubahan dari jendela mana pun (termasuk jendela sendiri).
 * Mengembalikan fungsi unlisten.
 */
export function onBackgroundChange(cb) {
  return listen(BACKGROUND_EVENT, (e) => {
    current = normalize(e.payload);
    cb(current);
  });
}