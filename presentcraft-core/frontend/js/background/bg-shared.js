// State bersama + helper kecil untuk panel background. Tanpa DOM.
// cur dan tileSel ada di objek `ps` karena modul ES tidak bisa meng-assign variabel hasil impor.
import { baseName } from "../utils.js";

export const ps = {
  cur: null, // background yang sedang tayang
  tileSel: null, // id item yang dipilih di grid
};

export const toBg = (it) => ({
  src: it.src,
  kind: it.kind,
  loop: it.loop,
  mute: it.mute,
  scale: it.scale,
  opacity: it.opacity,
});

export const isLive = (it) =>
  !!ps.cur && ps.cur.kind === it.kind && ps.cur.src === it.src;

export const label = (it) =>
  it.kind === "color" ? `Warna ${it.src}` : baseName(it.src);