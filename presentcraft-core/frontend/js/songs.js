// Stage 1: add a song by pasting lyrics. One song = one group, one verse = one slide.
import { setStatus } from "./utils.js";
import { lib } from "./library.js";
import { resolveTag } from "./tags.js";

const SECTION = /^\s*\[\s*(.+?)\s*\]\s*$/;

const key = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// Common aliases (English and Indonesian) -> preset names
const ALIAS = {
  verse: "Verse",
  bait: "Verse",
  chorus: "Chorus",
  reff: "Chorus",
  ref: "Chorus",
  refrain: "Chorus",
  refrein: "Chorus",
  prechorus: "Pre-Chorus",
  prereff: "Pre-Chorus",
  prareff: "Pre-Chorus",
  bridge: "Bridge",
  jembatan: "Bridge",
  intro: "Intro",
  outro: "Outro",
  ending: "Outro",
  penutup: "Outro",
  interlude: "Interlude",
  instrumental: "Interlude",
  tag: "Tag",
};

function canonName(raw) {
  const m = /^(.*?)(\d+)?$/.exec(key(raw));
  const alias = ALIAS[m[1]];
  return alias ? (m[2] ? `${alias} ${m[2]}` : alias) : raw;
}

// canonical names; a bare "Verse" gets numbered in order (Verse 1, Verse 2, ...)
export function normalizeNames(parts) {
  let verse = 0;
  for (const p of parts) {
    if (!p.name) continue;
    p.name = canonName(p.name);
    if (p.name === "Verse") p.name = `Verse ${++verse}`;
  }
}

export function splitLyrics(raw, perSlide = 0) {
  const parts = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.lines.length) parts.push(cur);
    cur = null;
  };
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const m = SECTION.exec(t);
    if (m) {
      flush();
      cur = { name: m[1], lines: [] };
      continue;
    }
    (cur ||= { name: "", lines: [] }).lines.push(t);
  }
  flush();
  normalizeNames(parts);
  if (!perSlide) return parts;
  return parts.flatMap((p) => {
    const out = [];
    for (let i = 0; i < p.lines.length; i += perSlide)
      out.push({ name: p.name, lines: p.lines.slice(i, i + perSlide) });
    return out;
  });
}

function verseItem(n, part) {
  const text = part.lines.join("\n");
  const tag = part.name ? resolveTag(part.name) : null;
  return {
    label: part.lines[0].slice(0, 40),
    ...(tag ? { tag } : {}),
    slide: {
      slide_number: n,
      group_name: tag?.name ?? null,
      group_color: tag?.color ?? null,
      content: text,
      layers: [
        {
          kind: "text",
          z: 1,
          rect: { x: 10, y: 25, w: 80, h: 50 },
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
          style: null,
        },
      ],
    },
  };
}

export async function addSongParts(title, parts) {
  const g = await lib.createGroup(title.trim());
  if (!g) return 0;
  return lib.replaceSlides(
    g.id,
    "song",
    parts.map((p, i) => verseItem(i + 1, p)),
  );
}

export async function addSong(title, raw, perSlide = 0) {
  const parts = splitLyrics(raw, perSlide);
  if (!title.trim() || !parts.length)
    return setStatus("Enter a title and lyrics first.");
  const n = await addSongParts(title, parts);
  if (!n) return setStatus("Failed to save the song.");
  setStatus(`Song "${title.trim()}" added (${n} slides).`);
}

// ---------- dialog (reuses the existing cf-* classes) ----------
function askSong() {
  return new Promise((resolve) => {
    const mk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const title = mk("input", "song-title");
    title.placeholder = "Song title";
    const body = mk("textarea", "song-body");
    body.placeholder =
      "Paste lyrics here.\nSeparate verses with a blank line.\nA [Chorus] or [Verse 1] line becomes the slide name.";
    const per = mk("input", "song-per");
    per.type = "number";
    per.min = "0";
    per.value = "0";
    const perRow = mk(
      "label",
      "cf-msg song-opts",
      "Max lines per slide (0 = follow blank lines): ",
    );
    perRow.appendChild(per);
    const cancel = mk("button", "cf-btn", "Cancel");
    const ok = mk("button", "cf-btn", "Add");
    const btns = mk("div", "cf-btns");
    btns.append(cancel, ok);
    const box = mk("div", "cf-box song-box");
    box.append(mk("div", "cf-title", "Add song"), title, body, perRow, btns);
    const overlay = mk("div", "cf-overlay");
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const finish = (r) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(r);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      }
    };
    cancel.addEventListener("click", () => finish(null));
    ok.addEventListener("click", () =>
      finish({
        title: title.value,
        raw: body.value,
        per: Math.max(0, parseInt(per.value, 10) || 0),
      }),
    );
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener("keydown", onKey, true);
    title.focus();
  });
}

document.addEventListener("click", async (e) => {
  if (!e.target.closest?.("#lib-song")) return;
  const r = await askSong();
  if (r) await addSong(r.title, r.raw, r.per);
});
