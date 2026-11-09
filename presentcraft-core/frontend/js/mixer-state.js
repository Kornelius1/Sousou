// Satu-satunya pemilik state mixer. Tidak menyentuh DOM.
const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;

export const MIXER_EVENT = "mixer-state-event";

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

let strips = []; // { id, itemId, name, cfg, enabled, volume(dB) }
let live = true;
let loaded = false; 
const subs = new Set();
let saveTimer;
let saveChain = Promise.resolve();

const isActive = (s) => s.cfg.mode === "on" || s.enabled;
export const snapshot = () => strips.map((s) => ({ ...s, active: isActive(s) }));
export const getStrips = snapshot;
export const onMixerChange = (cb) => {
  subs.add(cb);
  return () => subs.delete(cb);
};

/** Kirim ulang ke audience (dipanggil saat "audience-ready"). */
export const broadcast = () => emit(MIXER_EVENT, snapshot());

function changed() {
  const snap = snapshot();
  subs.forEach((cb) => cb(snap));
  emit(MIXER_EVENT, snap);
  if (!loaded) return;   
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // `enabled` sengaja tidak disimpan: mic tidak boleh menyala sendiri setelah restart
    const state = {
      strips: strips.map(({ id, itemId, name, cfg, volume }) => ({ id, itemId, name, cfg, volume })),
    };
    saveChain = saveChain
      .then(() => invoke("save_mixer_state", { state }))
      .catch((err) => console.warn("gagal menyimpan mixer:", err));
  }, 300);
}

export async function loadMixer() {
  try {
    const s = await invoke("load_mixer_state");
    strips = Array.isArray(s?.strips)
      ? s.strips
          .filter((x) => x && x.id && x.cfg)
          .map((x) => ({
            id: x.id,
            itemId: x.itemId,
            name: x.name || x.cfg.name || "Audio",
            cfg: x.cfg,
            enabled: x.cfg.mode === "autoon" && live,
            volume: Number.isFinite(+x.volume) ? +x.volume : x.cfg.volume || 0,
          }))
      : [];
  } catch (err) {
    console.warn("gagal memuat mixer:", err);
    strips = [];
  }
  loaded = true;    
  changed();
}

/** item = item library dengan kind "input" dan input.media "audio". 'ok' | 'dup' | null */
export function addStrip(item) {
  const cfg = item?.input;
  if (!cfg || cfg.media !== "audio") return null;
  if (strips.some((s) => s.itemId === item.id)) return "dup";
  strips.push({
    id: uid(),
    itemId: item.id,
    name: cfg.name || "Audio",
    cfg,
    enabled: cfg.mode === "autoon" && live,
    volume: cfg.volume || 0,
  });
  changed();
  return "ok";
}

export function removeStrip(id) {
  strips = strips.filter((s) => s.id !== id);
  changed();
}

export function setEnabled(id, v) {
  const s = strips.find((x) => x.id === id);
  if (!s || s.cfg.mode === "on") return;
  s.enabled = !!v;
  changed();
}

export function setVolume(id, db) {
  const s = strips.find((x) => x.id === id);
  if (!s) return;
  s.volume = Math.min(6, Math.max(-60, Number(db) || 0));
  changed();
}

/** Sinyal "live" (layar tayang). Auto On / Auto Off hanya bereaksi pada perubahan. */
export function setLive(v) {
  v = !!v;
  if (v === live) return;
  live = v;
  for (const s of strips) {
    if (v && s.cfg.mode === "autoon") s.enabled = true;
    if (!v && s.cfg.mode === "autooff") s.enabled = false;
  }
  changed();
}