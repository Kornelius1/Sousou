// Edit teks langsung di kanvas (contenteditable yang ditumpuk di atas layer teks).
import { el } from "./dom.js";
import { styleOf } from "./fields.js";
import { ed, L, q, fireEd } from "./session.js";
import { boxStyle, renderPreview } from "./canvas.js";
import { push } from "./history.js";

// Lebar acuan untuk ukuran font. Ukuran font di layer dianggap piksel pada kanvas selebar ini,
// lalu diskalakan ke lebar kanvas editor. Kalau teks saat diedit tampak lebih besar/kecil
// daripada hasil render, sesuaikan angka ini dengan slide-renderer.js.
const REF_W = 1920;

const readTxt = (txt) => (txt.contentEditable === "plaintext-only" ? txt.textContent : txt.innerText);

// Dipanggil juga oleh ResizeObserver di index.js saat ukuran kanvas berubah.
export function styleEditBox() {
  if (!ed.editing) return;
  const l = L()[ed.editing.i];
  if (!l) return;
  const { box, txt } = ed.editing;
  Object.assign(box.style, boxStyle(l));
  const st = styleOf(l);
  const k = q(".ed-canvas").clientWidth / REF_W;
  Object.assign(txt.style, {
    fontFamily: st.fontFamily,
    fontSize: st.fontSize * k + "px",
    color: st.color,
    fontWeight: st.bold ? "700" : "400",
    fontStyle: st.italic ? "italic" : "normal",
    textAlign: st.align || "left",
  });
  box.style.justifyContent = { top: "flex-start", middle: "center", bottom: "flex-end" }[st.valign] || "flex-start";
}

function placeCaret(txt, x, y) {
  let range = null;
  try {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p && txt.contains(p.offsetNode)) {
        range = document.createRange();
        range.setStart(p.offsetNode, p.offset);
      }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r && txt.contains(r.startContainer)) range = r;
    }
  } catch {
    range = null;
  }
  const s = getSelection();
  s.removeAllRanges();
  if (range) {
    range.collapse(true);
  } else {
    range = document.createRange();
    range.selectNodeContents(txt);
    range.collapse(false); // tidak ketemu titiknya: taruh kursor di akhir
  }
  s.addRange(range);
}

export function startEdit(i, cx, cy) {
  const l = L()[i];
  if (!l) return;
  const box = el("div", "ed-editbox");
  const txt = el("div", "ed-txt");
  try {
    txt.contentEditable = "plaintext-only";
  } catch {
    /* peramban lama: pakai "true" di bawah */
  }
  if (txt.contentEditable !== "plaintext-only") txt.contentEditable = "true";
  txt.spellcheck = false;
  txt.textContent = l.text || "";
  box.appendChild(txt);
  q(".ed-eb").appendChild(box);
  ed.editing = { i, box, txt };
  styleEditBox();
  renderPreview(); // sembunyikan teks asli layer ini supaya tidak dobel

  txt.addEventListener("input", () => {
    if (!ed.editing) return;
    L()[ed.editing.i].text = readTxt(txt);
    fireEd("text:changed", { i: ed.editing.i });
  });
  txt.addEventListener("blur", () => endEdit());
  txt.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation(); // Esc di sini hanya mengakhiri edit teks, bukan menutup editor
      e.preventDefault();
      endEdit();
    }
  });
  txt.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  txt.focus();
  placeCaret(txt, cx, cy);
}

export function endEdit() {
  if (!ed.editing) return;
  const { i, box, txt } = ed.editing;
  ed.editing = null; // null dulu: remove() bisa memicu blur lagi
  const l = L()[i];
  if (l) l.text = readTxt(txt);
  box.remove();
  push();
  renderPreview();
  // pembaruan di tempat (bukan membangun ulang panel) supaya klik yang sedang berlangsung tidak hilang
  if (l) fireEd("text:changed", { i });
}