import { state as S } from "./state.js";
import { on } from "./bus.js";
import { MEDIA_FILTER, kindOf } from "./media.js";
import { itemName } from "./store.js";
import { createTree } from "./tree.js";
import { previewTile, air } from "./background/bg-actions.js";
import * as G from "./groups.js";

export function initExplorer() {
  const tree = createTree({
    ids: {
      list: "ex-list",
      count: "ex-count",
      new: "ex-new",
      add: "ex-add-file",
      sort: "ex-sort",
      del: "ex-delete",
    },
    events: ["groups-changed", "selection-changed"],
    inputKinds: ["video"],
    groups: () => S.groups,
    readOnly: () => false,
    sel: () => ({ gid: S.selectedGroup, iid: S.selectedItem }),
    itemName,
    filters: MEDIA_FILTER,
    kindOf,
    api: {
      selectGroup: G.selectGroup,
      selectItem: (gid, iid) => {
        G.selectItem(gid, iid);
        const it = G.selectedItem();
        if (it) previewTile(it);
      },
      createGroup: G.createGroup,
      addInput: G.addInput,
      renameGroup: G.renameGroup,
      deleteGroup: G.deleteGroup,
      removeItem: G.removeItem,
      moveItem: G.moveItem,
      sortGroup: G.sortGroup,
      addFiles: G.addFiles,
    },
    onActivate: (g, it) => air(it),
  });

  on("item-updated", (it) => {
    if (it.kind === "color") tree.render();
  });
}
