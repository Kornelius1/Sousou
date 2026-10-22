// Zoom thumbnail + navigasi keyboard (panah, Home, End) pada grid slide.
// Tidak mengimpor sorter.js (hindari impor melingkar): showSlide dioper sebagai parameter.
import { $ } from "../utils.js";
import { state } from "../state.js";

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

function initKeyNav(grid, showSlide) {
  grid.addEventListener("keydown", (e) => {
    if (!state.slides.length) return;

    const currentIdx = state.activeIndex < 0 ? 0 : state.activeIndex;
    const cards = Array.from(grid.querySelectorAll(".card"));
    const currentCard = cards[currentIdx];

    if (!currentCard) return;

    const curRect = currentCard.getBoundingClientRect();
    let targetIdx = currentIdx;

    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();

      let bestMatch = -1;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        if (idx === currentIdx) return;
        const rect = card.getBoundingClientRect();

        let isValid = false;
        let distance = Infinity;

        // Validasi arah dan hitung jarak geometris terdekat
        if (e.key === "ArrowRight") {
          // Harus berada di sebelah kanan dan sejajar secara vertikal
          isValid =
            rect.left >= curRect.left + curRect.width / 2 &&
            Math.abs(rect.top - curRect.top) < curRect.height;
          distance = Math.hypot(
            rect.left - curRect.left,
            rect.top - curRect.top,
          );
        } else if (e.key === "ArrowLeft") {
          // Harus berada di sebelah kiri dan sejajar secara vertikal
          isValid =
            rect.left <= curRect.left - rect.width / 2 &&
            Math.abs(rect.top - curRect.top) < curRect.height;
          distance = Math.hypot(
            curRect.left - rect.left,
            curRect.top - rect.top,
          );
        } else if (e.key === "ArrowDown") {
          // Harus berada di bawah secara vertikal
          isValid = rect.top >= curRect.top + curRect.height / 2;
          // Bobot lebih besar pada selisih vertikal agar pindah baris lebih natural
          distance =
            Math.abs(rect.top - curRect.top) * 2 +
            Math.abs(rect.left - curRect.left);
        } else if (e.key === "ArrowUp") {
          // Harus berada di atas secara vertikal
          isValid = rect.top <= curRect.top - rect.height / 2;
          distance =
            Math.abs(curRect.top - rect.top) * 2 +
            Math.abs(rect.left - curRect.left);
        }

        if (isValid && distance < minDistance) {
          minDistance = distance;
          bestMatch = idx;
        }
      });

      // Jika ada kartu terdekat yang valid di arah tersebut, pindahkan pilihan
      if (bestMatch !== -1) {
        targetIdx = bestMatch;
      } else {
        // Fallback linier jika berada di ujung grid
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          targetIdx = Math.min(state.slides.length - 1, currentIdx + 1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          targetIdx = Math.max(0, currentIdx - 1);
        }
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      targetIdx = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      targetIdx = state.slides.length - 1;
    }

    if (targetIdx !== state.activeIndex) {
      showSlide(targetIdx);
      state.cards[targetIdx]?.card.focus({ preventScroll: true });
    }
  });
}

/** Dipanggil sekali dari initSorter(). */
export function initSorterNav(grid, showSlide) {
  initZoom(grid);
  initKeyNav(grid, showSlide);
}