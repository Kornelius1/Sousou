// Pengaturan transisi (global). Control menyimpan di localStorage, audience menerima lewat event.
const { emit, listen } = window.__TAURI__.event;

export const TRANSITION_EVENT = "transition-event";
const KEY = "pc-transition";
const DEFAULT = { fg: "fade", bg: "fade", msFg: 300, msBg: 300 };

// format lama { ms } dipecah jadi msFg dan msBg, lalu "ms" dibuang
function normalize(o) {
  const n = { ...DEFAULT, ...o };
  if (o && o.ms != null) {
    if (o.msFg == null) n.msFg = o.ms;
    if (o.msBg == null) n.msBg = o.ms;
  }
  delete n.ms;
  return n;
}

let cur = normalize(null);

export const getTransition = () => cur;

export function loadTransition() {
  try {
    cur = normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {}
  return cur;
}

export function setTransition(patch) {
  cur = normalize({ ...cur, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {}
  return emit(TRANSITION_EVENT, cur);
}

export const onTransition = (cb) =>
  listen(TRANSITION_EVENT, (e) => {
    cur = normalize(e.payload);
    cb(cur);
  });