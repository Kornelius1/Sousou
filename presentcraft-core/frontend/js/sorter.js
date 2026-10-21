// Panel tengah: grid slide, load bundel, navigasi slide.
import { $, setStatus } from "./utils.js";
import { state } from "./state.js";
import { emit, on } from "./bus.js";
import { invoke, openDialog } from "./tauri.js";
import {
  emitPayload,
  toPayload,
  setBlanked,
  emitBlank,
  cancelScheduledEmit,
} from "./audience.js";
import { buildMediaLayer } from "./layers.js";
import { itemName } from "./store.js";
import { showPopup } from "./tree.js";
import { mergeTags, textOn, resolveTag } from "./tags.js";
import { openEditor } from "./editor.js";

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

export function createBlankSlide(slideNumber = 1) {
  return {
    slide_number: slideNumber,
    group_name: null,
    group_color: null,
    content: "",
    layers: [],
  };
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
    showSlide(state.activeIndex);
  }
}

// Fitur Auto-Scroll saat menyeberang tepi grid
function handleAutoScroll(e) {
  const rect = grid.getBoundingClientRect();
  const threshold = 50; // Jarak zona scroll dari tepi atas/bawah (px)
  const speed = 12; // Kecepatan scroll

  if (e.clientY < rect.top + threshold) {
    grid.scrollTop -= speed;
  } else if (e.clientY > rect.bottom - threshold) {
    grid.scrollTop += speed;
  }
}

const tagOf = (s) => {
  if (s.tag === null) return null; // sengaja tanpa tag
  const raw =
    s.tag !== undefined ? s.tag : s.group_name ? { name: s.group_name } : null; // undefined = belum lewat library
  return raw ? resolveTag(raw.name) : null;
};

function decorateCard(card, slide) {
  const tag = tagOf(slide);
  card.querySelector(".tag-badge")?.remove();
  card.classList.toggle("tagged", !!tag);
  if (!tag) {
    card.style.removeProperty("--tag-color");
    return;
  }

  const color = tag.color || "#888888";
  card.style.setProperty("--tag-color", color);
  const b = document.createElement("span");
  b.className = "tag-badge";
  b.textContent = tag.name;
  b.style.background = color;
  b.style.color = textOn(color);
  card.appendChild(b); // di card, bukan di thumb: thumbnail dirender ulang oleh SlideRenderer
}

function openTagMenu(e, i) {
  const slide = state.slides[i];
  if (!slide) return;

  const entries = [
    { label: "Edit slide…", run: () => openEditor(i) },
    { sep: true },
  ];

  if (slide.itemId) {
    const cur = tagOf(slide)?.name.toLowerCase() || null;
    const set = (tag) =>
      emit("tag:set", { groupId: slide.groupId, itemId: slide.itemId, tag });
    const choices = mergeTags(state.slides.map(tagOf));

    entries.push({
      label: "Tag",
      submenu: [
        ...choices.map((t) => ({
          label: t.name,
          color: t.color,
          dot: t.name.toLowerCase() === cur, // titik = tag yang sedang dipilih
          run: () => set(t),
        })),
        { sep: true },
        { label: "Hapus tag", disabled: !cur, run: () => set(null) },
      ],
    });
  } else {
    entries.push({ label: "Tag (slide belum ada di library)", disabled: true });
  }

  showPopup(entries, { x: e.clientX, y: e.clientY });
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

  card.addEventListener("click", () => {
    showSlide(i);
    card.focus();
  });

  // Event Drag and Drop
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(i));
    card.classList.add("dragging");
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    handleAutoScroll(e); // Pemicu auto-scroll
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

export function showSlide(i) {
  if (i < 0 || i >= state.slides.length) return;
  const changed = i !== state.activeIndex;
  state.activeIndex = i;
  setBlanked(false);

  state.cards.forEach((c, idx) => {
    if (c && c.card) c.card.classList.toggle("active", idx === i);
  });

  const activeCard = state.cards[i]?.card;
  if (activeCard) {
    activeCard.scrollIntoView({ block: "nearest" });
  }

  emit("slide:shown", changed);
  emitPayload(toPayload(state.slides[i]));
}

export function toggleBlank() {
  if (!state.blanked) return emitBlank();
  if (state.activeIndex >= 0) showSlide(state.activeIndex);
  else setBlanked(false);
}

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

function showMessage(text, color) {
  grid.replaceChildren();
  const p = document.createElement("p");
  p.className = "empty";
  p.style.color = color;
  p.textContent = text;
  grid.appendChild(p);
}

export async function importFile() {
  const filePath = await openDialog({
    multiple: false,
    filters: [
      { name: "ProPresenter", extensions: ["probundle", "zip", "pro"] },
    ],
  });
  if (!filePath) return;

  showMessage("Mengekstrak dan memuat bundel...", "#03dac6");
  $("warn-slot").replaceChildren();

  try {
    const result = await invoke("load_presentation_bundle", { filePath });
    const name = filePath
      .split(/[\\/]/)
      .pop()
      .replace(/\.[^.]+$/, "");

    const slides = result?.slides || [];
    applySlides(slides, result?.warnings || [], name);
    if (slides.length) emit("bundle:imported");
  } catch (error) {
    console.error(error);
    showMessage(`Gagal memuat: ${String(error)}`, "#ff6b6b");
  }
}

export function applySlides(slides, warnings, bundleName) {
  state.slides = slides || [];
  if (state.slides.length === 0) {
    state.slides = [createBlankSlide()]; // fallback: selalu ada minimal satu slide
  }
  state.bundleName = bundleName || "";
  state.cards = [];
  state.activeIndex = -1;
  state.selectedLayer = -1;
  cancelScheduledEmit();

  $("slide-count").textContent = `(${state.slides.length})`;
  renderWarnings(warnings || []);

  grid.replaceChildren();
  state.slides.forEach((slide, i) => grid.appendChild(makeCard(slide, i)));
  state.slides.forEach((_, i) => renderThumb(i));
  refreshThumbBackgrounds();

  emit("slides:loaded");
}

export function initSorter() {
  const zoomInput = $("zoom");
  if (zoomInput) {
    const out = $("zoom-out");
    const inn = $("zoom-in");
    const STEP = 20;

    const apply = () => {
      const min = Number(zoomInput.min),
        max = Number(zoomInput.max),
        v = Number(zoomInput.value);
      zoomInput.style.setProperty(
        "--fill",
        ((v - min) / (max - min)) * 100 + "%",
      );
      grid.style.setProperty("--thumb", `${v}px`);
      out.disabled = v <= min; // tombol mati di batas
      inn.disabled = v >= max;
    };
    const nudge = (d) => {
      const min = Number(zoomInput.min),
        max = Number(zoomInput.max);
      zoomInput.value = Math.min(
        max,
        Math.max(min, Number(zoomInput.value) + d),
      );
      apply();
    };

    zoomInput.addEventListener("input", apply);
    out.addEventListener("click", () => nudge(-STEP));
    inn.addEventListener("click", () => nudge(STEP));
    apply();
  }

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
          // Berikan bobot lebih besar pada selisih vertikal agar pindah baris lebih natural
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

      // Jika ada kartu terdekat yang valid di arah tersebut, pindahkan fokus/pilihan
      if (bestMatch !== -1) {
        targetIdx = bestMatch;
      } else {
        // Fallback perilaku linier jika berada di ujung grid
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

  on("background-changed", () => refreshThumbBackgrounds());
  on("tag:applied", ({ itemId, tag }) => {
    const i = state.slides.findIndex((s) => s.itemId === itemId);
    if (i < 0) return;
    state.slides[i].tag = tag;
    const c = state.cards[i];
    if (c) decorateCard(c.card, state.slides[i]);
  });
  on("slide:edited", ({ index, layers }) => {
    const s = state.slides[index];
    if (!s) return;
    const arr = (s.layers ||= []);
    arr.splice(0, arr.length, ...layers); // in-place, referensi tetap sama
    renderThumb(index);
    if (state.activeIndex === index) {
      if (!state.blanked) emitPayload(toPayload(s));
      emit("slide:shown", true);
    }
  });
}

function itemToSlide(it, g, n) {
  const orig = it.kind === "slide" ? it.slide : null; // objek slide asli dari bundel
  return {
    ...createBlankSlide(n),
    ...(orig || {}),
    slide_number: n,
    folder_name: g.name,
    tag: it.tag ?? null,
    groupId: g.id,
    itemId: it.id,
    label: itemName(it),
    layers:
      it.kind === "slide"
        ? (it.layers ?? orig?.layers ?? [])
        : [buildMediaLayer(it)],
  };
}

export function showGroupSlides(g) {
  const all = g ? g.items : [];
  // grup hasil import: hanya slide-nya. File media di dalamnya hanyalah bahan.
  const fromBundle = all.some(
    (it) => it.kind === "slide" && it.origin === "bundle",
  );
  const kinds = fromBundle ? ["slide"] : ["slide", "image", "video"];
  const slides = all
    .filter((it) => kinds.includes(it.kind))
    .map((it, i) => itemToSlide(it, g, i + 1));
  applySlides(
    slides.length ? slides : [createBlankSlide()],
    [],
    g ? g.name : "",
  );
}
