import { getLang, allLangs } from "./lang/index.js";
import rawBooks from "../../shared/books.json" with { type: "json" };

export const BOOKS = rawBooks.map((b) => ({
  code: b.code,
  chapters: b.chapters,
  ot: b.testament === "OT",
  dc: b.testament === "DC",
  fallbackName: b.name,
}));

const norm = (s) => String(s).toLowerCase().replace(/[\s.\-]/g, "");

const KEYS = {};
for (const l of allLangs()) {
  KEYS[l.code] = {};
  for (const b of BOOKS) {
    const e = l.books[b.code];
    if (e) KEYS[l.code][b.code] = [e.name, ...e.abbr].map(norm);
  }
}

export const bookName = (b, lang) => {
  if (!b.code) return b.name;
  const entry = getLang(lang)?.books?.[b.code] || getLang("eng")?.books?.[b.code];
  return entry ? entry.name : b.fallbackName || b.code;
};

export const bookRef = (b) => {
  if (!b.code) return b.name;
  const entry = getLang("eng")?.books?.[b.code];
  return entry ? entry.name : b.fallbackName || b.code;
};

export function findBook(text, lang) {
  const n = norm(text);
  if (!n) return null;
  const order = [lang, ...Object.keys(KEYS).filter((k) => k !== lang)];
  for (const l of order)
    for (const b of BOOKS) if (KEYS[l]?.[b.code]?.includes(n)) return b;
  return null;
}

export const bookFor = (name, lang) =>
  findBook(name, lang) || { code: null, name, chapters: 0, ot: false, dc: false };

export function suggestBooks(text, lang) {
  const n = norm(text);
  if (!n) return [];
  const keys = KEYS[lang] || KEYS.eng;
  const exact = findBook(text, lang);
  const rest = BOOKS.filter(
    (b) => b !== exact && keys[b.code]?.some((k) => k.startsWith(n)),
  );
  return (exact ? [exact, ...rest] : rest).slice(0, 8);
}

const REF =
  /^\s*((?:[1-3]\s*)?\p{L}[\p{L}.\- ]*?)\s*(?:(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?)?\s*$/u;
export function parseRef(q) {
  const m = REF.exec(q.replace(/[:\-–.\s]+$/, ""));
  return m
    ? {
        text: m[1].trim(),
        ch: Number(m[2]) || 0,
        a: Number(m[3]) || 0,
        b: Number(m[4]) || 0,
      }
    : null;
}