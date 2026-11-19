const KEY = "lw-output";
const DEFAULT = { w: 1920, h: 1080 };

export function loadOutput() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && o.w > 0 && o.h > 0) return o;
  } catch {}
  return { ...DEFAULT };
}

export async function saveOutput(o) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {}
  await window.__TAURI__.event.emit("output-changed", o);
}