// Pub/sub internal antar modul. Bukan event Tauri (itu emitEvent di tauri.js).
const subs = {};
export const on = (ev, fn) => (subs[ev] ||= []).push(fn);
export const emit = (ev, ...args) => (subs[ev] || []).forEach((f) => f(...args));