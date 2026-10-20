import { state as S } from './state.js';
import { on } from './bus.js';
import { MEDIA_FILTER, kindOf } from './media.js';
import { itemName } from './store.js';
import { createTree } from './tree.js';
import * as G from './groups.js';

export function initExplorer() {
  const tree = createTree({
    ids: { list: 'ex-list', count: 'ex-count', new: 'ex-new', add: 'ex-add-file', sort: 'ex-sort', del: 'ex-delete' },
    events: ['groups-changed', 'selection-changed'],
    groups: () => S.groups,
    readOnly: () => false,
    sel: () => ({ gid: S.selectedGroup, iid: S.selectedItem }),
    itemName,
    filters: MEDIA_FILTER,
    kindOf,
    api: {
      selectGroup: G.selectGroup,
      selectItem: G.selectItem,
      createGroup: G.createGroup,
      renameGroup: G.renameGroup,
      deleteGroup: G.deleteGroup,
      removeItem: G.removeItem,
      moveItem: G.moveItem,
      sortGroup: G.sortGroup,
      addFiles: G.addFiles,
    },
  });

  on('item-updated', (it) => {
    if (it.kind === 'color') tree.render();
  });
}