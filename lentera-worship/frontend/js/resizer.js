const KEY = "pc.layout.v1";
const DEF = { libW: 240, propsW: 300, bgW: 240, msgW: 300, bottomH: 260 };
const MIN = { libW: 160, propsW: 220, bgW: 160, msgW: 220, bottomH: 140 };
const PAIR = { libW: "bgW", bgW: "libW", propsW: "msgW", msgW: "propsW" }; // dijaga sejajar
const CENTER_MIN = 320;

let size = { ...DEF };
try { Object.assign(size, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}

const root = document.documentElement;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(size)); } catch {} };
const paint = () => { for (const k in size) root.style.setProperty("--" + k, size[k] + "px"); };

function limit(key, v) {
  if (key === "bottomH") {
    const max = innerHeight - 260; // sisakan ruang untuk menubar, workspace, toolbar
    return Math.max(MIN.bottomH, Math.min(v, max));
  }
  const other = key.startsWith("lib") || key === "bgW" ? size.propsW : size.libW;
  const max = innerWidth - other - CENTER_MIN - 12;
  return Math.max(MIN[key], Math.min(v, max));
}

function set(key, v, linked) {
  size[key] = Math.round(limit(key, v));
  if (linked && PAIR[key]) size[PAIR[key]] = Math.round(limit(PAIR[key], size[key]));
  paint();
}

function handle(key, dir, ref) {
  const h = document.createElement("div");
  h.className = "rz " + (key === "bottomH" ? "rz-row" : "rz-col");
  h.title = "Drag to resize. Alt: this row only. Double-click: reset.";
  ref.parentNode.insertBefore(h, dir === "after" ? ref.nextSibling : ref);

  const sign = key === "propsW" || key === "msgW" ? -1 : 1;
  h.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    document.body.classList.add("rz-drag", key === "bottomH" ? "rz-v" : "rz-h");
    const start = key === "bottomH" ? e.clientY : e.clientX;
    const base = size[key];
    const move = (ev) => {
      const d = key === "bottomH" ? -(ev.clientY - start) : sign * (ev.clientX - start);
      set(key, base + d, !ev.altKey);
    };
    const up = () => {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      h.removeEventListener("pointercancel", up);
      document.body.classList.remove("rz-drag", "rz-v", "rz-h");
      save();
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  });
  h.addEventListener("dblclick", () => {
    set(key, DEF[key], true);
    save();
  });
}

export function initResizer() {
  const $ = (id) => document.getElementById(id);
  handle("libW", "before", $("sorter"));
  handle("propsW", "before", $("props"));
  handle("bgW", "before", $("bg-detail"));
  handle("msgW", "before", $("msg-panel"));
  handle("bottomH", "before", $("toolbar"));

  for (const k in size) size[k] = Math.max(MIN[k], size[k]);
  paint();
  window.addEventListener("resize", () => {
    for (const k in size) size[k] = Math.round(limit(k, size[k]));
    paint();
  });
}