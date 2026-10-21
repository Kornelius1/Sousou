// Panel Properties (kanan atas): dibangun dari daftar FIELDS di fields.js.
import { el } from "./dom.js";
import {
  FIELDS,
  readValue,
  setPath,
  isLen,
  factor,
  fieldStep,
  fieldMin,
  fieldTip,
  getUnit,
  setUnit,
} from "./fields.js";
import { ed, L, q, onEd, fireEd } from "./session.js";
import { renderOverlay, renderPreview } from "./canvas.js";
import { push } from "./history.js";
import { round } from "../utils.js";

const closedSecs = new Set(); // bagian yang sedang dilipat; diingat antar render

// Menulis nilai ke layer, lalu menyegarkan bagian lain yang bergantung padanya.
function setVal(f, l, val) {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return false;
    if (isLen(f)) val = val / factor(f);
    if (f.min != null) val = Math.max(f.min, val);
    if (f.max != null) val = Math.min(f.max, val);
  }
  setPath(l, f.path, val);
  if (f.path === "text") fireEd("text:changed", { i: ed.sel });
  if (f.path.startsWith("rect.") || f.path === "rotation") renderOverlay();
  renderPreview();
  fireEd("changed");
  return true;
}

// perbarui nilai textarea di tempat (kecuali sedang diketik)
export function syncField(path, value) {
  const t = q(`.ed-f[data-path="${path}"] textarea`);
  if (t && document.activeElement !== t) t.value = value ?? "";
}

function fieldRow(f, l) {
  if (f.t === "line") {
    const wrap = el("div", "ed-lines");
    f.items.forEach((it, i) => {
      const line = el("div", "ed-f s2 ed-line");
      line.appendChild(fieldRow(it, l));
      if (i === 0) {
        const sel = el("select", "ed-unit");
        for (const [val, name] of f.opts) {
          const o = el("option", null, name);
          o.value = val;
          sel.appendChild(o);
        }
        sel.value = getUnit(f.ug);
        sel.addEventListener("change", () => {
          setUnit(f.ug, sel.value);
          renderFields();
        });
        line.appendChild(sel);
      }
      wrap.appendChild(line);
    });
    return wrap;
  }

  const row = el(
    "div",
    "ed-f" + (f.span === 2 ? " s2" : "") + (f.t === "area" ? " area" : ""),
  );
  if (f.path) row.dataset.path = f.path;
  const v = f.path ? readValue(l, f) : undefined;

  if (f.t === "tog") {
    const b = el("button", "ed-tog" + (f.cls ? " " + f.cls : ""), f.label);
    b.type = "button";
    if (f.tip) b.title = f.tip;
    b.setAttribute("aria-pressed", String(!!v));
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(on));
      setVal(f, l, on);
      push();
    });
    row.appendChild(b);
    return row;
  }

  if (f.tip) row.title = f.tip;
  row.appendChild(el("span", "ed-fl", f.label));

  // pilihan satuan
  if (f.t === "unit") {
    const sel = el("select");
    for (const [val, name] of f.opts) {
      const o = el("option", null, name);
      o.value = val;
      sel.appendChild(o);
    }
    sel.value = getUnit(f.ug);
    sel.addEventListener("change", () => {
      setUnit(f.ug, sel.value);
      renderFields(); // hitung ulang nilai di kelompok itu
    });
    row.appendChild(sel);
    return row;
  }

  // tombol aksi (ratakan terhadap slide), tanpa status aktif
  if (f.t === "act") {
    const wrap = el("div", "ed-seg");
    for (const [key, svg, tip] of f.opts) {
      const b = el("button");
      b.type = "button";
      b.innerHTML = svg;
      b.title = tip;
      b.setAttribute("aria-label", tip);
      b.addEventListener("click", () => {
        f.run(l, key);
        renderOverlay();
        renderPreview();
        fireEd("changed");
        push();
        renderFields(); // segarkan X/Y
      });
      wrap.appendChild(b);
    }
    row.appendChild(wrap);
    return row;
  }

  if (f.t === "seg") {
    const wrap = el("div", "ed-seg");
    for (const [val, text, tip] of f.opts) {
      const b = el("button");
      if (text.startsWith("<svg")) b.innerHTML = text;
      else b.textContent = text;
      if (tip) b.setAttribute("aria-label", tip);
      b.type = "button";
      b.title = tip || text;
      b.setAttribute("aria-pressed", String(val === v));
      b.addEventListener("click", () => {
        wrap
          .querySelectorAll("button")
          .forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        setVal(f, l, val);
        push();
      });
      wrap.appendChild(b);
    }
    row.appendChild(wrap);
    return row;
  }

  let inp;
  if (f.t === "area") {
    inp = el("textarea");
    inp.rows = 5;
    inp.value = v ?? "";
  } else if (f.t === "sel") {
    inp = el("select");
    for (const [val, name] of f.opts) {
      const o = el("option", null, name);
      o.value = val;
      inp.appendChild(o);
    }
    inp.value = v ?? f.opts[0][0];
  } else {
    inp = el("input");
    inp.type = f.t === "color" ? "color" : f.t === "range" ? "range" : "number";
    if (f.t === "num" && isLen(f)) {
      inp.step = fieldStep(f);
      const m = fieldMin(f);
      if (m != null) inp.min = m;
      row.title = fieldTip(f);
    } else {
      if (f.step != null) inp.step = f.step;
      if (f.min != null) inp.min = f.min;
    }
    if (f.max != null) inp.max = f.max;
    if (f.step != null) inp.step = f.step;
    if (f.min != null) inp.min = f.min;
    if (f.max != null) inp.max = f.max;
    if (f.t === "color") {
      inp.value = /^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff";
    } else {
      const n = Number(v);
      inp.value = Number.isFinite(n) ? round(f.show ? f.show(n) : n) : "";
    }
  }
  const read = () =>
    f.t === "num" || f.t === "range"
      ? inp.value === ""
        ? null
        : Number(inp.value)
      : inp.value;
  inp.addEventListener("input", () => {
    const val = read();
    if (val !== null) setVal(f, l, val);
  });
  inp.addEventListener("change", () => {
    const val = read();
    if (val !== null) setVal(f, l, val);
    push();
  });
  row.appendChild(inp);
  return row;
}

export function renderFields() {
  const box = q(".ed-fields");
  box.replaceChildren();
  const l = L()[ed.sel];
  if (!l) return;
  let grp = null;
  let grid = null;
  for (const f of FIELDS) {
    if (f.when && !f.when(l)) continue;
    if (f.grp !== grp) {
      grp = f.grp;
      const g = grp;
      const d = el("details", "ed-sec");
      d.open = !closedSecs.has(g);
      d.addEventListener("toggle", () =>
        d.open ? closedSecs.delete(g) : closedSecs.add(g),
      );
      grid = el("div", "ed-grid");
      d.append(el("summary", null, g), grid);
      box.appendChild(d);
    }
    grid.appendChild(fieldRow(f, l));
  }
}

// teks diubah di kanvas -> samakan isi form "Isi teks"
onEd(
  "text:changed",
  ({ i }) => ed.root && i === ed.sel && syncField("text", L()[i]?.text),
);
