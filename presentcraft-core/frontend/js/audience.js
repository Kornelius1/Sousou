// Mengirim payload slide ke jendela audience.
import { $, setStatus } from "./utils.js";
import { state } from "./state.js";
import { convertFileSrc, emitEvent, invoke } from "./tauri.js"

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

// Tombol #tb-audience: nyalakan / matikan window audience.
document.addEventListener("click", async (e) => {
  const b = e.target.closest?.("#tb-audience");
  if (!b) return;
  try {
    const external = await invoke("toggle_audience");
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (on) {
      // kirim ulang slide yang sedang tayang supaya layar tidak kosong
      const i = state.liveIndex;
      if (i >= 0 && !state.blanked && state.slides[i])
        emitPayload(toPayload(state.slides[i]));
      setStatus(
        external
          ? "Audience: layar kedua (fullscreen)."
          : "Audience: window uji (1 monitor).",
      );
    }
  } catch (err) {
    console.error(err);
    setStatus("Gagal membuka audience: " + err);
  }
});
