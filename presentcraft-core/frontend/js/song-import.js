// Stage 2: import song files (OpenLyrics XML, OpenSong, plain text).
import { setStatus } from "./utils.js";
import { lib } from "./library.js";
import { splitLyrics, normalizeNames, addSongParts } from "./songs.js";

const ALLOWED_EXT = new Set(["xml", "txt"]); // OpenLyrics/OpenSong = .xml, plain text = .txt
const MAX_BYTES = 1024 * 1024; // 1 MB per file; a song is a few KB at most
const extOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] || "").toLowerCase();

const FOLLOW_ORDER = true; // repeat sections following the file's verse order (e.g. v1 c v2 c)

const OL_NAMES = {
  v: "Verse",
  c: "Chorus",
  p: "Pre-Chorus",
  b: "Bridge",
  i: "Intro",
  e: "Outro",
  o: "Misc",
};
const OS_NAMES = {
  V: "Verse",
  C: "Chorus",
  P: "Pre-Chorus",
  B: "Bridge",
  T: "Tag",
};

// text of a <lines> element: <br/> becomes a newline, chords and comments are skipped
function linesText(el) {
  let out = "";
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1) {
        if (c.localName === "br") out += "\n";
        else if (c.localName !== "chord" && c.localName !== "comment") walk(c);
      }
    }
  };
  walk(el);
  return out;
}

function parseOpenLyrics(doc) {
  const first = (t) => doc.getElementsByTagNameNS("*", t)[0];
  const lookup = new Map();
  const natural = [];
  for (const v of doc.getElementsByTagNameNS("*", "verse")) {
    const id = (v.getAttribute("name") || "").toLowerCase();
    const lines = [...v.getElementsByTagNameNS("*", "lines")]
      .map(linesText)
      .join("\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const m = /^([a-z])(\d*)/.exec(id);
    const label = m ? OL_NAMES[m[1]] || "" : "";
    const part = { name: label ? label + (m[2] ? ` ${m[2]}` : "") : "", lines };
    natural.push(part);
    const k = id.toUpperCase();
    if (!lookup.has(k)) lookup.set(k, []);
    lookup.get(k).push(part);
  }
  return {
    title: first("title")?.textContent.trim() || "",
    natural,
    lookup,
    order: (first("verseOrder")?.textContent || "")
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean),
  };
}

function parseOpenSong(doc) {
  const tag = (t) => doc.getElementsByTagName(t)[0]?.textContent ?? "";
  const lookup = new Map();
  const natural = [];
  let cur = null;
  let key = "";
  const open = (k, name) => {
    key = k.toUpperCase();
    cur = { name, lines: [] };
    natural.push(cur);
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(cur);
  };
  const openByCode = (code) => {
    const m = /^([A-Za-z])(\d*)$/.exec(code);
    const label = m && OS_NAMES[m[1].toUpperCase()];
    open(code, label ? label + (m[2] ? ` ${m[2]}` : "") : code);
  };
  for (const raw of tag("lyrics").replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.startsWith(".") || raw.startsWith(";")) continue; // chord line / comment
    const t = raw.trim();
    if (!t) continue;
    const m = /^\[(.+)\]$/.exec(t);
    if (m) {
      openByCode(m[1].trim());
      continue;
    }
    if (!cur) open("", "");
    const brk = t.endsWith("||"); // slide break: the rest continues on a new slide
    const line = t.replace(/\|+$/, "").trim();
    if (line) cur.lines.push(line);
    if (brk) open(key, cur.name);
  }
  const keep = (p) => p.lines.length > 0;
  for (const [k, arr] of lookup) lookup.set(k, arr.filter(keep));
  return {
    title: tag("title").trim(),
    natural: natural.filter(keep),
    lookup,
    order: tag("presentation")
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean),
  };
}

function parseText(raw, fileName) {
  return {
    title: fileName.replace(/\.[^.]+$/, ""),
    natural: splitLyrics(raw),
    lookup: new Map(),
    order: [],
  };
}

async function parseFile(file) {
  const raw = (await file.text()).replace(/^\uFEFF/, "");
  if (raw.includes("\u0000")) return null; // binary file: not supported
  if (/^\s*<\?xml|^\s*<song[\s>]/i.test(raw)) {
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (
      doc.querySelector("parsererror") ||
      doc.documentElement.localName !== "song"
    )
      return null;
    return doc.getElementsByTagNameNS("*", "verse").length
      ? parseOpenLyrics(doc)
      : parseOpenSong(doc);
  }
  return parseText(raw, file.name);
}

function arrange(song) {
  if (!song.order.length) return song.natural;
  const out = [];
  for (const k of song.order)
    for (const p of song.lookup.get(k) || []) out.push(p);
  return out.length ? out : song.natural;
}

export async function importSongFiles(files) {
  let added = 0,
    skipped = 0,
    failed = 0,
    rejected = 0;
  for (const f of files) {
    if (!ALLOWED_EXT.has(extOf(f.name)) || f.size > MAX_BYTES) {
      rejected++;
      continue;
    }
    try {
      const song = await parseFile(f);
      if (!song) {
        failed++;
        continue;
      }
      normalizeNames(song.natural); // before repeating sections, so numbering stays correct
      const title = (song.title || f.name.replace(/\.[^.]+$/, "")).trim();
      const parts = FOLLOW_ORDER ? arrange(song) : song.natural;
      if (!title || !parts.length) {
        failed++;
        continue;
      }
      if (lib.s.groups.some((g) => g.name === title)) {
        skipped++;
        continue;
      }
      if (await addSongParts(title, parts)) added++;
      else failed++;
    } catch (err) {
      console.warn("song import failed:", f.name, err);
      failed++;
    }
  }
  setStatus(
    `Songs imported: ${added}` +
      (skipped ? `, ${skipped} already in library` : "") +
      (failed ? `, ${failed} failed or unsupported` : "") +
      (rejected ? `, ${rejected} rejected (only .xml/.txt up to 1 MB)` : "") +
      ".",
  );
}

document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#lib-import-song")) return;
  const inp = document.createElement("input");
  inp.type = "file";
  inp.multiple = true;
  inp.accept = ".xml,.txt";
  inp.addEventListener("change", () => {
    if (inp.files.length) importSongFiles([...inp.files]);
  });
  inp.click();
});
