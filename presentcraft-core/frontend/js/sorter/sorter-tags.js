// Tag pada kartu slide: badge warna, menu klik kanan, sinkronisasi event.
import { state } from "../state.js";
import { emit, on } from "../bus.js";
import { showPopup } from "../tree.js";
import { mergeTags, textOn, resolveTag } from "../tags.js";
import { openEditor } from "../editor.js";

export const tagOf = (s) => {
  if (s.tag === null) return null; // sengaja tanpa tag
  const raw =
    s.tag !== undefined ? s.tag : s.group_name ? { name: s.group_name } : null; // undefined = belum lewat library
  return raw ? resolveTag(raw.name) : null;
};

export function decorateCard(card, slide) {
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

export function openTagMenu(e, i) {
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

/** Pasang listener event tag. Dipanggil sekali dari initSorter(). */
export function initSorterTags() {
  on("tag:applied", ({ itemId, tag }) => {
    const i = state.slides.findIndex((s) => s.itemId === itemId);
    if (i < 0) return;
    state.slides[i].tag = tag;
    const c = state.cards[i];
    if (c) decorateCard(c.card, state.slides[i]);
  });
}