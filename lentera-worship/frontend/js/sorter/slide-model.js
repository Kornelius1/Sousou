import { buildMediaLayer } from "../layers.js";
import { itemName } from "../store.js";
import { loadOutput } from "../../shared/output-state.js";

export function createBlankSlide(slideNumber = 1) {
  const out = loadOutput();
  return {
    slide_number: slideNumber,
    group_name: null,
    group_color: null,
    content: "",
    layers: [],
  };
}

export function itemToSlide(it, g, n) {
  const orig = it.kind === "slide" ? it.slide : null;
  return {
    ...createBlankSlide(n),
    // slide dari bundel tanpa ukuran tetap memakai default lama, bukan ukuran output
    ...(orig ? { slide_width: 1366, slide_height: 768 } : null),
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