// Pemilik state pesan. Tidak menyentuh DOM.
const { emit } = window.__TAURI__.event;

export const MESSAGE_EVENT = "message-event";

export const DEFAULTS = {
  mode: "ticker",   // ticker | banner | lower | card | full
  pos: "bottom",    // top | bottom (ticker & banner)
  size: 6,          // % tinggi layar
  speed: 120,       // px/detik pada layar setinggi 1080
  color: "#000000",
  bg: "#ffffff",
};

let current = { visible: false, text: "", ...DEFAULTS };
let timer;
const subs = new Set();

export const getMessage = () => ({ ...current });
export const onMessageChange = (cb) => (subs.add(cb), () => subs.delete(cb));

function push() {
  const snap = { ...current };
  subs.forEach((cb) => cb(snap));
  return emit(MESSAGE_EVENT, snap);
}

/** Tampilkan / perbarui pesan. autoHide = detik (0 = sampai disembunyikan manual). */
export function showMessage(msg, autoHide = 0) {
  const text = String(msg?.text ?? "").trim();
  if (!text) return;
  current = { ...DEFAULTS, ...msg, text, visible: true };
  clearTimeout(timer);
  if (autoHide > 0) timer = setTimeout(hideMessage, autoHide * 1000);
  return push();
}

export function hideMessage() {
  clearTimeout(timer);
  current = { ...current, visible: false };
  return push();
}

/** Dipanggil saat "audience-ready": kirim ulang state terakhir. */
export const broadcastMessage = () => push();   