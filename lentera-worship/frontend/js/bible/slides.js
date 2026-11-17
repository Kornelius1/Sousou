// Turning verses into slides: chunking, text layers and adding them to a group.
import { lib } from "../library.js";

const AUTO_CHARS = 200; // "Auto": start a new slide when a slide would pass about this many characters

/** "16,17,18,20" -> "16-18,20" */
export function fmtNums(ns) {
  const s = [...ns].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return out.join(",");
}

/** Split verses into slide-sized groups. perSlide > 0: fixed number of verses; 0: by text length. */
export function chunkVerses(verses, perSlide) {
  const out = [];
  let cur = [];
  const size = (g) => g.reduce((n, v) => n + v.text.length + 1, 0);
  for (const v of verses) {
    const full =
      perSlide > 0
        ? cur.length >= perSlide
        : size(cur) + v.text.length > AUTO_CHARS;
    if (cur.length && full) {
      out.push(cur);
      cur = [];
    }
    cur.push(v);
  }
  if (cur.length) out.push(cur);
  return out;
}

// Look of a Bible slide: three text layers. Anything not set here (font, color, verse size) comes from the
// editor's text defaults, so the verse text follows whatever the app considers normal. Sizes are in px.
const LOOK = {
  verse: {
    rect: { x: 8, y: 5, w: 84, h: 70 },
    style: { align: "center", valign: "middle" },
  },
  ref: {
    rect: { x: 8, y: 77, w: 84, h: 11 },
    style: { align: "center", valign: "middle", fontSize: 32, bold: true },
  },
  credit: {
    rect: { x: 8, y: 90, w: 84, h: 8 },
    style: { align: "center", valign: "middle", fontSize: 20 },
  },
};

function textLayer(z, text, look, runs) {
  const l = {
    kind: "text",
    z,
    rect: { ...look.rect },
    rotation: 0,
    opacity: 1,
    path: null,
    status: null,
    inner: null,
    scale: null,
    muted: null,
    looped: null,
    stop_on_clear: null,
    color: null,
    text,
    style: { ...look.style },
  };
  if (runs) l.runs = runs;
  return l;
}

function slideOf(n, layers) {
  return {
    slide_number: n,
    group_name: null,
    group_color: null,
    content: layers.map((l) => l.text).join("\n"), // same rule the app uses for slide.content
    layers,
  };
}

export function buildItems(p, o) {
  const groups = chunkVerses(p.verses, o.perSlide);
  return groups.map((g, i) => {
    const ref = `${p.book} ${p.chapter}:${fmtNums(g.map((v) => v.n))} (${p.translation})`;
    const plain = g
      .map((v) => (o.nums ? `${v.n} ${v.text}` : v.text))
      .join(" ");
    const runs = o.nums
      ? g.flatMap((v, k) => [
          { text: String(v.n), sup: true },
          { text: " " + v.text + (k < g.length - 1 ? " " : "") },
        ])
      : null;
    const layers = [
      textLayer(1, plain, LOOK.verse, runs),
      textLayer(2, ref, LOOK.ref),
    ];
    if (o.credit && i === groups.length - 1 && p.attribution)
      layers.push(textLayer(3, p.attribution, LOOK.credit));
    return { label: ref, slide: slideOf(i + 1, layers) };
  });
}

export async function addToSlides(p, o) {
  let gid = lib.s.gid;
  if (!gid) {
    const g = await lib.ensureGroup("Bible");
    gid = g && g.id;
  }
  if (!gid) return "Could not find a group to add the slides to.";
  // one origin per passage: adding the same passage again replaces it instead of duplicating it
  const n = await lib.replaceSlides(
    gid,
    `bible:${p.translation}:${p.label}`,
    buildItems(p, o),
  );
  return n
    ? `${p.label} added (${n} slide${n > 1 ? "s" : ""}).`
    : "Failed to add the passage.";
}