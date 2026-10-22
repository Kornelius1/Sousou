// Keyboard di area background: panah, spasi/Enter (tayangkan), Delete (hapus).
import { $ } from "../utils.js";
import * as G from "../groups.js";
import { askConfirm } from "../confirm.js";
import { ps, label } from "./bg-shared.js";
import { selectTile, air } from "./bg-actions.js";

function step(dir) {
  const g = G.selectedGroup();
  if (!g || !g.items.length) return;
  let i = g.items.findIndex((x) => x.id === ps.tileSel);
  i = i < 0 ? 0 : Math.min(g.items.length - 1, Math.max(0, i + dir));
  const it = g.items[i];
  selectTile(it);
  air(it);
}

export function initBgKeys() {
  // keyboard: tidak boleh bocor ke shortcut ganti slide presentasi
  $("bg-slides").addEventListener("keydown", (e) => {
    const k = e.key;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        " ",
        "Enter",
        "Delete",
      ].includes(k)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    if (k === "ArrowRight" || k === "ArrowDown") step(1);
    else if (k === "ArrowLeft" || k === "ArrowUp") step(-1);
    else if (k === " " || k === "Enter") {
      const it = G.selectedItem();
      if (it) air(it);
    } else if (k === "Delete") {
      const g = G.selectedGroup();
      const it = G.selectedItem();
      if (g && it) {
        askConfirm({
          key: "delete",
          title: "Delete item",
          message: `Remove “${label(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
        }).then((ok) => {
          if (ok) G.removeItem(g.id, it.id);
        });
      }
    }
  });
}