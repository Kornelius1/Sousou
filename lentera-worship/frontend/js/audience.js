// Mengirim payload slide ke jendela audience.
import { $, setStatus } from "./utils.js";
import { state } from "./state.js";
import { convertFileSrc, emitEvent, invoke } from "./tauri.js";
import { loadOutput } from "../shared/output-state.js";

export function emitPayload(payload) {
  emitEvent("update-slide-event", payload).catch((err) =>
    console.error("Failed to update audience display:", err),
  );
}

const isUrl = (v) =>
  typeof v === "string" &&
  /^(https?:|asset:|http:\/\/asset\.localhost|blob:|data:)/i.test(v);

export function toPayload(slide) {
  const out = loadOutput();
  const layers = [...(slide.layers || [])]
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
    .map((l) => {
      const candidate =
        l.path && l.status === "OK" ? l.path : (l.src ?? null);
      const src =
        !candidate || isUrl(candidate) ? candidate : convertFileSrc(candidate);
      return { ...l, src };
    });
  const firstMedia = layers.find((l) => l.src);
  return {
    content: slide.content,
    mediaPath: firstMedia ? firstMedia.src : null,
    width: slide.slide_width || out.w,
    height: slide.slide_height || out.h,
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
          ? "Audience: second screen (fullscreen)."
          : "Audience: test window (1 monitor).",
      );
    }
  } catch (err) {
    console.error(err);
    setStatus("Failed to open audience: " + err);
  }
});
