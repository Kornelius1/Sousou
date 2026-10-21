// Daftar tag bawaan. URUTAN DI SINI = URUTAN DI MENU (tetap, tidak berubah).
export const TAG_PRESETS = [
  { name: 'Intro',        color: '#78909c' },
  { name: 'Verse 1',      color: '#43a047' },
  { name: 'Verse 2',      color: '#1e88e5' },
  { name: 'Verse 3',      color: '#8e24aa' },
  { name: 'Verse 4',      color: '#00acc1' },
  { name: 'Pre-Chorus 1', color: '#fb8c00' },
  { name: 'Chorus 1',     color: '#e53935' },
  { name: 'Pre-Chorus 2', color: '#ffa726' },
  { name: 'Chorus 2',     color: '#ef5350' },
  { name: 'Pre-Chorus',   color: '#f57c00' },
  { name: 'Chorus',       color: '#d32f2f' },
  { name: 'Bridge',       color: '#fdd835' },
  { name: 'Tag',          color: '#ec407a' },
  { name: 'Interlude',    color: '#6d4c41' },
  { name: 'Outro',        color: '#546e7a' },
  { name: 'Misc',         color: '#9e9e9e' },
];

// Kunci pencocokan: huruf kecil tanpa spasi/tanda baca.
// "Pre-Chorus 1", "prechorus1", "PRE_CHORUS 1" -> "prechorus1"
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const PRESET_MAP = new Map(TAG_PRESETS.map((t) => [key(t.name), t]));

// Warna cadangan untuk nama di luar preset (dipilih dari hash nama, jadi selalu sama).
const EXTRA_COLORS = ['#26a69a', '#7e57c2', '#ef6c00', '#5c6bc0', '#9ccc65', '#d4e157', '#ff7043', '#29b6f6'];
function hashColor(k) {
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}

/**
 * Nama tag apa pun -> { name, color }.
 *  - cocok dengan preset (mis. "prechorus1")  -> nama dan warna preset ("Pre-Chorus 1")
 *  - "Chorus 3" (angka di luar preset)        -> nama tetap, warna keluarga "Chorus"
 *  - lainnya                                  -> warna dari hash nama
 */
export function resolveTag(name) {
  const raw = String(name || '').trim();
  const k = key(raw);
  if (!k) return null;
  const exact = PRESET_MAP.get(k);
  if (exact) return { name: exact.name, color: exact.color };
  const family = PRESET_MAP.get(k.replace(/\d+$/, ''));
  if (family) return { name: raw, color: family.color };
  return { name: raw, color: hashColor(k) };
}

/** Preset (urutan tetap) + tag lain yang dipakai, diurutkan menurut nama. */
export function mergeTags(used) {
  const extras = new Map();
  for (const t of used) {
    const r = t && resolveTag(t.name);
    if (!r) continue;
    const k = key(r.name);
    if (!PRESET_MAP.has(k) && !extras.has(k)) extras.set(k, r);
  }
  const sorted = [...extras.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return [...TAG_PRESETS, ...sorted];
}

/** Warna teks (gelap/terang) yang terbaca di atas warna latar hex. */
export function textOn(color) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || '').trim());
  if (!m) return '#fff';
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}