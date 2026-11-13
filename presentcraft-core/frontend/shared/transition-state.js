// Pengaturan transisi (global). Control menyimpan di localStorage, audience menerima lewat event.
const { emit, listen } = window.__TAURI__.event;

export const TRANSITION_EVENT = "transition-event";
const KEY = "pc-transition";
const DEFAULT = { fg: "fade", bg: "fade", ms: 300 };
let cur = { ...DEFAULT };

export const getTransition = () => cur;

export function loadTransition() {
  try {
    cur = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {}
  return cur;
}

export function setTransition(patch) {
  cur = { ...cur, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {}
  return emit(TRANSITION_EVENT, cur);
}

export const onTransition = (cb) =>
  listen(TRANSITION_EVENT, (e) => {
    cur = { ...DEFAULT, ...e.payload };
    cb(cur);
  });