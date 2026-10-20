// Daftar tag bawaan + helper warna. Satu-satunya tempat yang tahu tentang tag preset.
export const TAG_PRESETS = [
  { name: 'Intro',      color: '#78909c' },
  { name: 'Verse 1',    color: '#43a047' },
  { name: 'Verse 2',    color: '#1e88e5' },
  { name: 'Verse 3',    color: '#8e24aa' },
  { name: 'Verse 4',    color: '#00acc1' },
  { name: 'Pre-Chorus', color: '#fb8c00' },
  { name: 'Chorus',     color: '#e53935' },
  { name: 'Bridge',     color: '#fdd835' },
  { name: 'Tag',        color: '#ec407a' },
  { name: 'Interlude',  color: '#6d4c41' },
  { name: 'Outro',      color: '#546e7a' },
];

/** Preset + tag hasil import yang belum ada di preset (dibandingkan lewat nama). */
export function mergeTags(used) {
  const out = [...TAG_PRESETS];
  const seen = new Set(out.map((t) => t.name.toLowerCase()));
  for (const t of used) {
    if (!t || !t.name) continue;
    const k = t.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: t.name, color: t.color || '#888888' });
  }
  return out;
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