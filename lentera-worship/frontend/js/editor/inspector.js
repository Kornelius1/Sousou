// Panel Properties (kanan atas): dibangun dari daftar FIELDS di fields.js.
import { el } from "./dom.js";
import {
  FIELDS,
  readValue,
  setPath,
  isLen,
  factor,
  fieldStep,
  fieldBig,
  fieldMin,
  fieldTip,
  getUnit,
  setUnit,
} from "./fields.js";
import { ed, L, q, onEd, fireEd } from "./session.js";
import { renderOverlay, renderPreview, updateGeometry } from "./canvas.js";
import { push } from "./history.js";
import { round } from "../utils.js";

const closedSecs = new Set(); // bagian yang sedang dilipat; diingat antar render

// Menulis nilai ke layer, lalu menyegarkan bagian lain yang bergantung padanya.
let changedT;
const changedSoon = () => {
  clearTimeout(changedT);
  changedT = setTimeout(() => ed.root && fireEd("changed"), 250);
};

function setVal(f, l, val) {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return false;
    if (isLen(f)) val = val / factor(f);
    if (f.min != null) val = Math.max(f.min, val);
    if (f.max != null) val = Math.min(f.max, val);
  }
  setPath(l, f.path, val);
  if (f.path === "text") fireEd("text:changed", { i: ed.sel });
  if (
    f.path.startsWith("rect.") ||
    f.path === "rotation" ||
    f.path === "opacity"
  )
    updateGeometry(ed.sel);
  else renderPreview();
  changedSoon();
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
      const m = fieldMin(f);
      if (m != null) inp.min = m;
      row.title = fieldTip(f);
    } else {
      if (f.min != null) inp.min = f.min;
    }
    if (f.max != null) inp.max = f.max;
    inp.step = f.t === "num" ? "any" : (f.step ?? "any");
    if (f.t === "num") inp.step = fieldBig(f);
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

  // modifier: Shift = 10 satuan, Alt = 0,1 satuan, biasa = 1 satuan
  const mult = (e) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
  let prev = Number(inp.value);
  let mods = { shiftKey: false, altKey: false }; // modifier saat klik spinner

  inp.addEventListener("pointerdown", (e) => {
    mods = { shiftKey: e.shiftKey, altKey: e.altKey };
  });

  inp.addEventListener("input", (ev) => {
    // klik spinner native (bukan ketikan): skala deltanya sesuai Shift/Alt
    if (f.t === "num" && !ev.inputType && Number.isFinite(prev)) {
      const delta = Number(inp.value) - prev;
      inp.value = +(prev + delta * mult(mods)).toFixed(4);
    }
    const val = read();
    if (val !== null) setVal(f, l, val);
    prev = Number(inp.value);
  });
  inp.addEventListener("change", () => {
    const val = read();
    if (val !== null) setVal(f, l, val);
    push();
  });

  if (f.t === "num") {
    const fine = fieldStep(f);
    const show = () => {
      const n = Number(readValue(l, f));
      if (Number.isFinite(n)) {
        inp.value = round(f.show ? f.show(n) : n);
        prev = Number(inp.value);
      }
    };

    // panah keyboard: 1 / Shift 10 / Alt 0,1
    let pushT;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.blur();
        ed.root.focus();
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      e.stopPropagation(); // jangan sampai menggeser layer di kanvas
      const cur = Number(inp.value);
      const base = Number.isFinite(cur) ? cur : 0;
      const dir = e.key === "ArrowUp" ? 1 : -1;
      if (setVal(f, l, +(base + dir * mult(e)).toFixed(4))) show();
      clearTimeout(pushT);
      pushT = setTimeout(push, 300); // satu entri undo per rentetan tekan
    });

    // seret label: kontinu, Shift = halus (x0,1)
    const lab = row.querySelector(".ed-fl");
    if (lab) {
      lab.classList.add("scrub");
      lab.title = "Geser kiri/kanan untuk mengubah nilai (Shift: halus)";
      lab.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        lab.setPointerCapture(e.pointerId);
        let x0 = e.clientX;
        let v0 = Number(inp.value) || 0;
        let lastM = 1;
        const move = (ev) => {
          const m = ev.shiftKey ? 0.1 : 1;
          if (m !== lastM) {
            // Shift ditekan/dilepas di tengah geser: jangan melompat
            v0 = Number(inp.value) || 0;
            x0 = ev.clientX;
            lastM = m;
          }
          setVal(f, l, +(v0 + (ev.clientX - x0) * fine * 5 * m).toFixed(4));
          show();
        };
        const up = () => {
          lab.removeEventListener("pointermove", move);
          lab.removeEventListener("pointerup", up);
          lab.removeEventListener("pointercancel", up);
          push();
        };
        lab.addEventListener("pointermove", move);
        lab.addEventListener("pointerup", up);
        lab.addEventListener("pointercancel", up);
      });
    }
  }
  row.appendChild(inp);
  return row;
}

let lastLayer = null;
export function renderFields() {
  const box = q(".ed-fields");
  const l = L()[ed.sel];
  const a = document.activeElement;
  if (
    l &&
    l === lastLayer &&
    a &&
    box.contains(a) &&
    (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "range"))
  ) {
    syncNumbers(); // sudah melewati input yang sedang fokus
    return;
  }
  lastLayer = l;
  box.replaceChildren();
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

const ALL_FIELDS = FIELDS.flatMap((f) => (f.t === "line" ? f.items : [f]));

export function syncNumbers() {
  const l = L()[ed.sel];
  if (!l) return;
  for (const f of ALL_FIELDS) {
    if (!f.path || (f.t !== "num" && f.t !== "range")) continue;
    const inp = q(`.ed-f[data-path="${f.path}"] input`);
    if (!inp || document.activeElement === inp) continue;
    const n = Number(readValue(l, f));
    if (Number.isFinite(n)) inp.value = round(f.show ? f.show(n) : n);
  }
}
onEd("geom", () => ed.root && syncNumbers());
