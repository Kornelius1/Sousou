// Satu-satunya tempat yang menyentuh window.__TAURI__.
const T = window.__TAURI__;
export const { invoke, convertFileSrc } = T.core;
export const openDialog = (opts) => T.dialog.open(opts);
export const emitEvent = (name, payload) => T.event.emit(name, payload);
export const listen = (name, cb) => T.event.listen(name, cb);
export const confirmDialog = (msg) =>
  T.dialog.confirm(msg, { title: 'PresentCraft', kind: 'warning' });
export const saveDialog = (opts) => T.dialog.save(opts);