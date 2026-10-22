// Model slide: membuat objek slide. Tanpa DOM, tanpa event.
import { buildMediaLayer } from "../layers.js";
import { itemName } from "../store.js";

export function createBlankSlide(slideNumber = 1) {
  return {
    slide_number: slideNumber,
    group_name: null,
    group_color: null,
    content: "",
    layers: [],
  };
}

/** Ubah item library (it) di grup (g) menjadi objek slide bernomor n. */
export function itemToSlide(it, g, n) {
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