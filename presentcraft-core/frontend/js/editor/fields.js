// Definisi field Properties + helper nilai layer. Tambah/ubah field di SINI saja.
// Panel Properties kecil di samping layar nanti bisa memakai subset FIELDS yang sama.
import { baseName } from "../utils.js";

const SR = window.SlideRenderer;

export const FONTS = [
  ["Arial, sans-serif", "Arial"],
  ["'Segoe UI', sans-serif", "Segoe UI"],
  ["Verdana, sans-serif", "Verdana"],
  ["Georgia, serif", "Georgia"],
  ["'Times New Roman', serif", "Times New Roman"],
  ["'Courier New', monospace", "Courier New"],
  ["Impact, sans-serif", "Impact"],
];

export const isText = (l) => l.kind === "text";
export const isMedia = (l) => l.kind === "image" || l.kind === "video";
export const isVideo = (l) => l.kind === "video";

// ikon rata teks: 4 garis dengan panjang berbeda (stroke mengikuti warna teks tombol)
const alignIcon = (lines) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${lines
    .map(([a, b], i) => `<path d="M${a} ${3 + i * 3.3}H${b}"/>`)
    .join("")}</svg>`;

const ICON_LEFT = alignIcon([
  [1, 15],
  [1, 10],
  [1, 15],
  [1, 7],
]);
const ICON_CENTER = alignIcon([
  [1, 15],
  [3.5, 12.5],
  [1, 15],
  [5, 11],
]);
const ICON_RIGHT = alignIcon([
  [1, 15],
  [6, 15],
  [1, 15],
  [9, 15],
]);
const ICON_JUSTIFY = alignIcon([
  [1, 15],
  [1, 15],
  [1, 15],
  [1, 15],
]);

// ---------- ikon (stroke mengikuti warna tombol) ----------
const icon = (inner) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// rata vertikal teks: bingkai + 2 baris teks di atas/tengah/bawah
const vIcon = (y1, y2) =>
  icon(
    `<rect x="1.5" y="1.5" width="13" height="13" rx="1" opacity=".4"/><path d="M4 ${y1}H12M4 ${y2}H10"/>`,
  );
const ICON_TOP = vIcon(4, 6.5);
const ICON_MIDDLE = vIcon(6.75, 9.25);
const ICON_BOTTOM = vIcon(9.5, 12);

// perataan layer terhadap slide: garis acuan + 2 balok
const ICON_A_LEFT = icon(
  `<path d="M2 1.5V14.5"/><rect x="4" y="4" width="9" height="3"/><rect x="4" y="9" width="6" height="3"/>`,
);
const ICON_A_CENTER = icon(
  `<path d="M8 1.5V14.5"/><rect x="3" y="4" width="10" height="3"/><rect x="5" y="9" width="6" height="3"/>`,
);
const ICON_A_RIGHT = icon(
  `<path d="M14 1.5V14.5"/><rect x="3" y="4" width="9" height="3"/><rect x="6" y="9" width="6" height="3"/>`,
);
const ICON_A_TOP = icon(
  `<path d="M1.5 2H14.5"/><rect x="4" y="4" width="3" height="9"/><rect x="9" y="4" width="3" height="6"/>`,
);
const ICON_A_MIDDLE = icon(
  `<path d="M1.5 8H14.5"/><rect x="4" y="3" width="3" height="10"/><rect x="9" y="5" width="3" height="6"/>`,
);
const ICON_A_BOTTOM = icon(
  `<path d="M1.5 14H14.5"/><rect x="4" y="3" width="3" height="9"/><rect x="9" y="6" width="3" height="6"/>`,
);

// ---------- satuan ----------
const SLIDE_PX = SR.SLIDE_SIZE || { w: 1920, h: 1080 };
const SLIDE_IN = { w: 13.333, h: 7.5 };
const PX_PER_IN = SLIDE_PX.w / SLIDE_IN.w;

// jumlah satuan untuk 1% lebar (w) / tinggi (h) slide
const LEN = {
  "%": () => 1,
  px: (d) => SLIDE_PX[d] / 100,
  pt: (d) => (SLIDE_IN[d] * 72) / 100,
  cm: (d) => (SLIDE_IN[d] * 2.54) / 100,
  in: (d) => SLIDE_IN[d] / 100,
};
// ukuran font: jumlah satuan per 1 px (nilai font disimpan dalam px slide)
const FONT = {
  px: 1,
  pt: 72 / PX_PER_IN,
  cm: 2.54 / PX_PER_IN,
  in: 1 / PX_PER_IN,
  "%": 100 / SLIDE_PX.h, // % tinggi slide
};

const META = {
  "%": { label: "%", step: 0.1, big: 1, dec: 2 },
  px: { label: "px", step: 1, big: 10, dec: 1 },
  pt: { label: "pt", step: 0.5, big: 1, dec: 1 },
  cm: { label: "cm", step: 0.1, big: 0.5, dec: 2 },
  in: { label: "in", step: 0.01, big: 0.1, dec: 3 },
};

const optsOf = (keys) => keys.map((k) => [k, META[k].label]);
export const POS_UNITS = optsOf(["%", "px", "pt", "cm", "in"]);
export const SIZE_UNITS = POS_UNITS;
export const FONT_UNITS = optsOf(["px", "pt", "cm", "in", "%"]);

// tiap kelompok punya satuan sendiri, diingat antar sesi
const units = { pos: "%", size: "%", font: "px" };
for (const g of Object.keys(units)) {
  try {
    const s = localStorage.getItem("props.unit." + g);
    if (s && META[s]) units[g] = s;
  } catch {}
}
if (units.font === "%" && !FONT["%"]) units.font = "px";

export const getUnit = (g) => units[g];
export function setUnit(g, u) {
  if (!(g in units) || !META[u]) return;
  units[g] = u;
  try {
    localStorage.setItem("props.unit." + g, u);
  } catch {}
}

// f.ug = kelompok satuan ("pos" | "size" | "font"); f.dim = "w" | "h" untuk panjang slide
export const isLen = (f) => !!f.ug;
export const factor = (f) =>
  f.ug === "font" ? FONT[units.font] : LEN[units[f.ug]](f.dim);
const meta = (f) => META[units[f.ug]];
export const fieldStep = (f) => (isLen(f) ? meta(f).step : f.step);
export const fieldBig = (f) =>
  isLen(f)
    ? meta(f).big
    : Math.max(f.step ?? 1, f.path === "rotation" ? 1 : (f.step ?? 1));
export const fieldMin = (f) =>
  f.min != null && isLen(f) ? +(f.min * factor(f)).toFixed(4) : f.min;
export const fieldTip = (f) =>
  isLen(f) ? `${f.tip.replace(/\s*\(.*\)/, "")} (${meta(f).label})` : f.tip;

// ---------- perataan layer terhadap slide ----------
export function alignLayer(l, how) {
  const r = (l.rect ||= { x: 0, y: 0, w: 100, h: 100 });
  const f = {
    left: () => (r.x = 0),
    center: () => (r.x = (100 - r.w) / 2),
    right: () => (r.x = 100 - r.w),
    top: () => (r.y = 0),
    middle: () => (r.y = (100 - r.h) / 2),
    bottom: () => (r.y = 100 - r.h),
  }[how];
  if (f) f();
}

export const FIELDS = [
  // Transform
  {
    grp: "Transform",
    t: "line",
    ug: "pos",
    opts: POS_UNITS,
    items: [
      {
        path: "rect.x",
        ug: "pos",
        dim: "w",
        label: "X",
        tip: "Position X",
        t: "num",
        step: 0.1,
      },
      {
        path: "rect.y",
        ug: "pos",
        dim: "h",
        label: "Y",
        tip: "Position Y",
        t: "num",
        step: 0.1,
      },
    ],
  },
  {
    grp: "Transform",
    t: "line",
    ug: "size",
    opts: SIZE_UNITS,
    items: [
      {
        path: "rect.w",
        ug: "size",
        dim: "w",
        label: "W",
        tip: "Width",
        t: "num",
        step: 0.1,
        min: 0.1,
      },
      {
        path: "rect.h",
        ug: "size",
        dim: "h",
        label: "H",
        tip: "Height",
        t: "num",
        step: 0.1,
        min: 0.1,
      },
    ],
  },
  {
    grp: "Transform",
    path: "rotation",
    label: "Rotation",
    t: "num",
    span: 2,
    step: 0.1,
    show: (v) => ((v % 360) + 360) % 360,
  },
  {
    grp: "Transform",
    path: "opacity",
    label: "Opacity",
    t: "range",
    span: 2,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    grp: "Transform",
    t: "act",
    label: "Align",
    span: 2,
    run: alignLayer,
    opts: [
      ["left", ICON_A_LEFT, "Align left"],
      ["center", ICON_A_CENTER, "Center horizontally"],
      ["right", ICON_A_RIGHT, "Align right"],
      ["top", ICON_A_TOP, "Align top"],
      ["middle", ICON_A_MIDDLE, "Center vertically"],
      ["bottom", ICON_A_BOTTOM, "Align bottom"],
    ],
  },

  // Text
  {
    grp: "Text",
    path: "text",
    label: "Content",
    t: "area",
    span: 2,
    when: isText,
  },
  {
    grp: "Text",
    path: "style.fontFamily",
    label: "Font",
    t: "sel",
    span: 2,
    opts: FONTS,
    when: isText,
  },
  {
    grp: "Text",
    t: "line",
    ug: "font",
    opts: FONT_UNITS,
    when: isText,
    items: [
      {
        path: "style.fontSize",
        ug: "font",
        label: "Size",
        tip: "Font size",
        t: "num",
        step: 1,
        min: 1,
      },
    ],
  },
  {
    grp: "Text",
    path: "style.color",
    label: "Color",
    t: "color",
    when: isText,
  },
  {
    grp: "Text",
    path: "style.bold",
    label: "B",
    tip: "Bold",
    t: "tog",
    cls: "b",
    when: isText,
  },
  {
    grp: "Text",
    path: "style.italic",
    label: "I",
    tip: "Italic",
    t: "tog",
    cls: "i",
    when: isText,
  },
  {
    grp: "Text",
    path: "style.align",
    label: "Align",
    t: "seg",
    span: 2,
    when: isText,
    opts: [
      ["left", ICON_LEFT, "Align left"],
      ["center", ICON_CENTER, "Align center"],
      ["right", ICON_RIGHT, "Align right"],
      ["justify", ICON_JUSTIFY, "Justify"],
    ],
  },
  {
    grp: "Text",
    path: "style.valign",
    label: "Vertical",
    t: "seg",
    span: 2,
    when: isText,
    opts: [
      ["top", ICON_TOP, "Align top"],
      ["middle", ICON_MIDDLE, "Align middle"],
      ["bottom", ICON_BOTTOM, "Align bottom"],
    ],
  },

  // Color
  {
    grp: "Color",
    path: "color",
    label: "Solid color",
    t: "color",
    span: 2,
    when: (l) => l.kind === "color",
  },

  // Media
  {
    grp: "Media",
    path: "scale",
    label: "Scale",
    t: "sel",
    span: 2,
    when: (l) => isMedia(l) || isInput(l),
    opts: [
      ["SCALE_BEHAVIOR_FILL", "Fill"],
      ["SCALE_BEHAVIOR_FIT", "Fit"],
    ],
  },
  { grp: "Media", path: "looped", label: "Loop", t: "tog", when: isVideo },
  { grp: "Media", path: "muted", label: "Mute", t: "tog", when: isVideo },
];

// ---------- akses nilai lewat path ----------
export const getPath = (o, path) =>
  path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
export function setPath(o, path, v) {
  const ks = path.split(".");
  const last = ks.pop();
  let t = o;
  for (const k of ks) t = t[k] ??= {};
  t[last] = v;
}
// gaya teks yang belum diset jatuh ke TEXT_DEFAULTS, sama seperti panel Properties
export const styleOf = (l) => ({
  ...(SR.TEXT_DEFAULTS || {}),
  ...(l.style || {}),
});

const round = (v, d) => +v.toFixed(d);

export const readValue = (l, f) => {
  if (!f.path) return undefined; // field tanpa path: unit, act
  const v = f.path.startsWith("style.")
    ? styleOf(l)[f.path.slice(6)]
    : getPath(l, f.path);
  return isLen(f) && typeof v === "number"
    ? +(v * factor(f)).toFixed(meta(f).dec)
    : v;
};

export function layerLabel(l, k) {
  let detail = "";
  if (isText(l)) detail = (l.text || "").replace(/\s+/g, " ").slice(0, 24);
  else if (l.path) detail = baseName(l.path);
  else if (l.kind === "input") detail = l.input?.name || "";
  else if (l.kind === "color") detail = l.color || "";
  return `${k + 1}. ${l.kind}${detail ? " — " + detail : ""}`;
}

export const isInput = (l) => l.kind === "input";
