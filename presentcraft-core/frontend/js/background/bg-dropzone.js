// Tambah file ke panel background: dialog file, klik area drop, drag & drop dari OS.
import { $ } from "../utils.js";
import { openDialog, listen } from "../tauri.js";
import { MEDIA_FILTER } from "../media.js";
import * as G from "../groups.js";
import { selectTile } from "./bg-actions.js";

function dropFiles(paths) {
  const g = G.selectedGroup() || G.createGroup("Umum");
  const n = G.addFiles(g.id, paths);
  if (n) selectTile(g.items[g.items.length - n]); // hanya memilih, tidak menayangkan
}

export async function chooseFiles() {
  const r = await openDialog({ multiple: true, filters: MEDIA_FILTER });
  if (r) dropFiles(Array.isArray(r) ? r : [r]);
}

export function initDropzone() {
  $("bg-drop").addEventListener("click", chooseFiles);
  $("bg-drop").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      chooseFiles();
    }
  });

  // Drag & drop dari OS: di Tauri v2 path file hanya tersedia lewat event ini.
  const panel = $("media-panel");
  const over = (pos) => {
    if (!pos) return false;
    const r = window.devicePixelRatio || 1;
    const el = document.elementFromPoint(pos.x / r, pos.y / r);
    return !!(el && el.closest("#media-panel"));
  };
  const hover = (e) =>
    panel.classList.toggle("dragover", over(e.payload && e.payload.position));
  const safe = (p) =>
    p.catch((err) => console.warn("Drag & drop tidak tersedia:", err));
  safe(listen("tauri://drag-enter", hover));
  safe(listen("tauri://drag-over", hover));
  safe(listen("tauri://drag-leave", () => panel.classList.remove("dragover")));
  safe(
    listen("tauri://drag-drop", (e) => {
      panel.classList.remove("dragover");
      if (over(e.payload.position)) dropFiles(e.payload.paths || []);
    }),
  );
}