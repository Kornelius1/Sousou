export const $ = (id) => document.getElementById(id);
export const baseName = (p) => p.split(/[\\/]/).pop();
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
export const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

let statusTimer;
export function setStatus(msg) {
  $('tb-status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => ($('tb-status').textContent = ''), 4000);
}