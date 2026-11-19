import { $ } from "./utils.js";
import { loadTransition, setTransition } from "../shared/transition-state.js";

const MS = [150, 300, 500, 800];
const nearest = (v) =>
  MS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function initTransitionUi() {
  const t = loadTransition();
  for (const [id, key] of [
    ["tr-fg", "fg"],
    ["tr-bg", "bg"],
    ["tr-ms-fg", "msFg"],
    ["tr-ms-bg", "msBg"],
  ]) {
    const el = $(id);
    const isMs = key.startsWith("ms");
    el.value = isMs
      ? String(nearest(Number(t[key] ?? t.ms ?? 300)))
      : String(t[key] ?? "fade");
    if (el.selectedIndex < 0) el.value = isMs ? "300" : "fade";
    el.addEventListener("change", () =>
      setTransition({ [key]: isMs ? Number(el.value) : el.value }),
    );
  }
}