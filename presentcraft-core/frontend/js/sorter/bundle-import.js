// Import bundel (.probundle / .zip / .pro). Hanya memanggil applySlides di akhir.
import { $ } from "../utils.js";
import { emit } from "../bus.js";
import { invoke, openDialog } from "../tauri.js";
import { applySlides } from "./sorter.js";

function showMessage(text, color) {
  const grid = $("slide-grid");
  grid.replaceChildren();
  const p = document.createElement("p");
  p.className = "empty";
  p.style.color = color;
  p.textContent = text;
  grid.appendChild(p);
}

export async function importFile() {
  const filePath = await openDialog({
    multiple: false,
    filters: [
      { name: "ProPresenter", extensions: ["probundle", "zip", "pro"] },
    ],
  });
  if (!filePath) return;

  showMessage("Mengekstrak dan memuat bundel...", "#03dac6");
  $("warn-slot").replaceChildren();

  try {
    const result = await invoke("load_presentation_bundle", { filePath });
    const name = filePath
      .split(/[\\/]/)
      .pop()
      .replace(/\.[^.]+$/, "");

    const slides = result?.slides || [];
    applySlides(slides, result?.warnings || [], name);
    if (slides.length) emit("bundle:imported");
  } catch (error) {
    console.error(error);
    showMessage(`Gagal memuat: ${String(error)}`, "#ff6b6b");
  }
}