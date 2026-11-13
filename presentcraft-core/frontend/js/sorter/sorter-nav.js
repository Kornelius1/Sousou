// Zoom thumbnail + navigasi keyboard (panah, Home, End) pada grid slide.
// Tidak mengimpor sorter.js (hindari impor melingkar): showSlide dioper sebagai parameter.
import { $ } from "../utils.js";

function initZoom(grid) {
  const zoomInput = $("zoom");
  if (!zoomInput) return;

  const out = $("zoom-out");
  const inn = $("zoom-in");
  const STEP = 20;

  const apply = () => {
    const min = Number(zoomInput.min),
      max = Number(zoomInput.max),
      v = Number(zoomInput.value);
    zoomInput.style.setProperty("--fill", ((v - min) / (max - min)) * 100 + "%");
    grid.style.setProperty("--thumb", `${v}px`);
    out.disabled = v <= min; // tombol mati di batas
    inn.disabled = v >= max;
  };
  const nudge = (d) => {
    const min = Number(zoomInput.min),
      max = Number(zoomInput.max);
    zoomInput.value = Math.min(max, Math.max(min, Number(zoomInput.value) + d));
    apply();
  };

  zoomInput.addEventListener("input", apply);
  out.addEventListener("click", () => nudge(-STEP));
  inn.addEventListener("click", () => nudge(STEP));
  apply();
}

/** Dipanggil sekali dari initSorter(). */
export function initSorterNav(grid, showSlide) {
  initZoom(grid);
}