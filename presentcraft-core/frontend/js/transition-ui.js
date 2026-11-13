import { $ } from "./utils.js";
import { loadTransition, setTransition } from "../shared/transition-state.js";

export function initTransitionUi() {
  const t = loadTransition();
  for (const [id, key] of [["tr-fg", "fg"], ["tr-bg", "bg"], ["tr-ms", "ms"]]) {
    const el = $(id);
    el.value = String(t[key]);
    el.addEventListener("change", () =>
      setTransition({ [key]: key === "ms" ? Number(el.value) : el.value }),
    );
  }
}