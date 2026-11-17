// Panel tengah: grid slide, kartu, slide aktif, reorder.
// Bagian lain dipisah ke: slide-model.js, sorter-tags.js, sorter-nav.js, bundle-import.js
import { $ } from "../utils.js";
import { state } from "../state.js";
import { emit, on } from "../bus.js";
import {
  emitPayload,
  toPayload,
  setBlanked,
  emitBlank,
  cancelScheduledEmit,
} from "../audience.js";
import { createBlankSlide, itemToSlide } from "./slide-model.js";
import { decorateCard, openTagMenu, initSorterTags } from "./sorter-tags.js";
import { initSorterNav } from "./sorter-nav.js";
import { initGridNav } from "../grid-nav.js";

// Kompatibilitas: file lain yang masih mengimpor createBlankSlide dari sorter.js tetap jalan.
// Setelah semua impor diubah ke slide-model.js, baris ini boleh dihapus.
export { createBlankSlide };

const SR = window.SlideRenderer;
const grid = $("slide-grid");

function padNum(n) {
  const width = Math.max(2, String(state.slides.length).length);
  return String(n).padStart(width, "0");
}

function buildCaption(cap, slide, i) {
  const num = document.createElement("span");
  num.className = "cap-num";
  num.textContent = padNum(i + 1);
  cap.appendChild(num);

  const folder = slide.folder_name || "";
  const name = slide.label || "";
  if (folder) {
    const f = document.createElement("span");
    f.className = "cap-folder";
    f.textContent = folder;
    cap.appendChild(f);
  }
  if (folder && name) {
    const sep = document.createElement("span");
    sep.className = "cap-sep";
    sep.textContent = "|";
    cap.appendChild(sep);
  }
  if (name) {
    const n = document.createElement("span");
    n.className = "cap-name";
    n.textContent = name;
    cap.appendChild(n);
  }
  cap.title = [folder, name].filter(Boolean).join(" | "); // tooltip untuk teks yang terpotong
}

function syncLive() {
  state.cards.forEach((c, idx) => {
    if (c && c.card)
      c.card.classList.toggle(
        "live",
        idx === state.liveIndex && !state.blanked,
      );
  });
}

export function initBlankDeck() {
  applySlides([createBlankSlide()], [], "");
}

export function renderThumb(i) {
  const c = state.cards[i];
  if (c && state.slides[i])
    SR.renderThumbnail(c.thumb, toPayload(state.slides[i]));
}

export function refreshThumbBackgrounds() {
  for (const c of state.cards) {
    if (c && c.thumb && c.thumb._bg) {
      SR.renderBackground(c.thumb._bg, state.showBgInThumbs ? state.bg : null, {
        preview: true,
      });
    }
  }
}

function reorderSlides(fromIdx, toIdx) {
  const [movedSlide] = state.slides.splice(fromIdx, 1);
  state.slides.splice(toIdx, 0, movedSlide);

  if (state.activeIndex === fromIdx) {
    state.activeIndex = toIdx;
  } else if (state.activeIndex > fromIdx && state.activeIndex <= toIdx) {
    state.activeIndex--;
  } else if (state.activeIndex < fromIdx && state.activeIndex >= toIdx) {
    state.activeIndex++;
  }

  applySlides(state.slides, [], state.bundleName);
  if (state.activeIndex >= 0) {
    showSlide(state.activeIndex, false);
  }
}

// Auto-scroll saat drag mendekati tepi grid
function handleAutoScroll(e) {
  const rect = grid.getBoundingClientRect();
  const threshold = 50; // jarak zona scroll dari tepi atas/bawah (px)
  const speed = 12; // kecepatan scroll

  if (e.clientY < rect.top + threshold) {
    grid.scrollTop -= speed;
  } else if (e.clientY > rect.bottom - threshold) {
    grid.scrollTop += speed;
  }
}

function makeCard(slide, i) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.draggable = true;
  card.dataset.index = i;

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const cap = document.createElement("div");
  cap.className = "cap";

  buildCaption(cap, slide, i);

  card.append(thumb, cap);

  decorateCard(card, slide);
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openTagMenu(e, i);
  });

  // Drag and drop
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(i));
    card.classList.add("dragging");
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    handleAutoScroll(e);
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    const srcIdx = Number(e.dataTransfer.getData("text/plain"));
    const dstIdx = i;
    if (!Number.isNaN(srcIdx) && srcIdx !== dstIdx) {
      reorderSlides(srcIdx, dstIdx);
    }
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  state.cards[i] = { card, thumb };
  return card;
}

export function showSlide(i, live = true) {
  if (i < 0 || i >= state.slides.length) return;
  const changed = i !== state.activeIndex;
  state.activeIndex = i;
  if (live) setBlanked(false);

  state.cards.forEach((c, idx) => {
    if (c && c.card) c.card.classList.toggle("active", idx === i);
  });
  state.cards[i]?.card.scrollIntoView({ block: "nearest" });

  emit("slide:shown", changed); // preview
  if (live) {
    state.liveIndex = i;
    emitPayload(toPayload(state.slides[i]));
    syncLive();
  }
}

export function toggleBlank() {
  if (!state.blanked) {
    emitBlank();
    emit("blank:changed"); // preview ikut dikosongkan
    return;
  }
  if (state.activeIndex >= 0) showSlide(state.activeIndex);
  else setBlanked(false);
}

// Dipakai applySlides; tetap di sini agar bundle-import.js tidak perlu diimpor balik.
function renderWarnings(warnings) {
  const slot = $("warn-slot");
  slot.replaceChildren();
  if (!warnings || warnings.length === 0) return;

  const d = document.createElement("details");
  d.className = "warnings";
  const sum = document.createElement("summary");
  sum.textContent = `${warnings.length} peringatan saat memuat`;

  const ul = document.createElement("ul");
  warnings.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    ul.appendChild(li);
  });

  d.append(sum, ul);
  slot.appendChild(d);
}

export function applySlides(slides, warnings, bundleName) {
  state.slides = slides || [];
  if (state.slides.length === 0) {
    state.slides = [createBlankSlide()]; // fallback: selalu ada minimal satu slide
  }
  state.bundleName = bundleName || "";
  state.cards = [];
  state.activeIndex = -1;
  state.liveIndex = -1;
  state.selectedLayer = -1;
  cancelScheduledEmit();

  $("slide-count").textContent = `(${state.slides.length})`;
  renderWarnings(warnings || []);

  grid.replaceChildren();
  state.slides.forEach((slide, i) => grid.appendChild(makeCard(slide, i)));
  state.slides.forEach((_, i) => renderThumb(i));
  syncLive();
  refreshThumbBackgrounds();

  emit("slides:loaded");
}

export function showGroupSlides(g) {
  const all = g ? g.items : [];
  const slides = all
    .filter(
      (it) =>
        it.kind === "slide" ||
        ((it.kind === "image" || it.kind === "video") &&
          it.origin !== "bundle"),
    )
    .map((it, i) => {
      const s = itemToSlide(it, g, i + 1);
      // item media yang pernah diedit: pakai layer tersimpan, jangan bangun ulang dari src
      if (it.kind !== "slide" && Array.isArray(it.slide?.layers)) {
        s.layers = structuredClone(it.slide.layers);
      }
      return s;
    });
  applySlides(
    slides.length ? slides : [createBlankSlide()],
    [],
    g ? g.name : "",
  );
}

export function initSorter() {
  initSorterNav(grid);

  initGridNav(grid, {
    sel: ".card",
    cur: () => state.activeIndex,
    preview: (i) => showSlide(i, false),
    air: (i) => showSlide(i),
  });

  initSorterTags();

  on("background-changed", () => refreshThumbBackgrounds());
  on("blank:changed", syncLive);
  on("slide:edited", ({ index, layers }) => {
    const s = state.slides[index];
    if (!s) return;
    const arr = (s.layers ||= []);
    arr.splice(0, arr.length, ...layers); // in-place, referensi tetap sama
    renderThumb(index);
    if (state.activeIndex === index) {
      if (state.liveIndex === index && !state.blanked)
        emitPayload(toPayload(s));
      emit("slide:shown", true);
    }
  });
}
