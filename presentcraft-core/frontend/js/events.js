// Event bus kecil supaya modul tidak saling import (hindari dependensi melingkar).
// Event: 'slides:loaded' | 'slide:shown' (changed) | 'layer:added' (index)
const handlers = {};
export const on = (name, fn) => (handlers[name] ??= []).push(fn);
export const emit = (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args));