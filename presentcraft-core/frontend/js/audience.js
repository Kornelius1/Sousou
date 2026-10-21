// Mengirim payload slide ke jendela audience.
import { $ } from "./utils.js";
import { state } from "./state.js";
import { convertFileSrc, emitEvent } from "./tauri.js";

export function emitPayload(payload) {
  emitEvent("update-slide-event", payload).catch((err) =>
    console.error("Gagal memperbarui audience display:", err),
  );
}

export function toPayload(slide) {
  const layers = [...(slide.layers || [])]
    .sort((a, b) => a.z - b.z)
    .map((l) => ({
      ...l,
      src: l.path && l.status === "OK" ? convertFileSrc(l.path) : null,
    }));
  const firstMedia = layers.find((l) => l.src);
  return {
    content: slide.content,
    mediaPath: firstMedia ? firstMedia.src : null,
    width: slide.slide_width || 1366,
    height: slide.slide_height || 768,
    layers,
  };
}

export function setBlanked(v) {
  state.blanked = v;
  const b = $("tb-blank");
  if (b) b.setAttribute("aria-pressed", String(!!v));
}

export function emitBlank() {
  setBlanked(true);
  emitPayload({
    content: "",
    mediaPath: null,
    width: 1366,
    height: 768,
    layers: [],
  });
}

let emitTimer;
export const cancelScheduledEmit = () => clearTimeout(emitTimer);
export function scheduleEmit(i) {
  clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    if (i === state.activeIndex && !state.blanked)
      emitPayload(toPayload(state.slides[i]));
  }, 250);
}
