// Satu bus untuk seluruh aplikasi. Implementasinya ada di bus.js.
// Event: 'slides:loaded' | 'slide:shown' (changed) | 'layer:added' (index)
//        'groups-changed' | 'selection-changed' | 'item-updated'
//        'lib-changed' | 'lib-selection'
export { on, emit } from './bus.js';