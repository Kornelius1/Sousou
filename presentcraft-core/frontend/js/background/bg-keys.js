import { $ } from "../utils.js";
import * as G from "../groups.js";
import { askConfirm } from "../confirm.js";
import { label } from "./bg-shared.js";

export function initBgKeys() {
  $("bg-slides").addEventListener("keydown", (e) => {
    if (e.key !== "Delete") return;
    e.preventDefault();
    e.stopPropagation();
    const g = G.selectedGroup();
    const it = G.selectedItem();
    if (!g || !it) return;
    askConfirm({
      key: "delete",
      title: "Delete item",
      message: `Remove “${label(it)}” from “${g.name}”?\nThe original file on disk is not deleted.`,
    }).then((ok) => {
      if (ok) G.removeItem(g.id, it.id);
    });
  });
}