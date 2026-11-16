// The 66 books (USFM codes, chapter counts) plus lookup and reference parsing.
// Names and abbreviations are not here: they live in lang/*.js.
import { getLang, allLangs } from "./lang/index.js";

const RAW =
  "GEN 50,EXO 40,LEV 27,NUM 36,DEU 34,JOS 24,JDG 21,RUT 4,1SA 31,2SA 24,1KI 22,2KI 25,1CH 29,2CH 36," +
  "EZR 10,NEH 13,EST 10,JOB 42,PSA 150,PRO 31,ECC 12,SNG 8,ISA 66,JER 52,LAM 5,EZK 48,DAN 12,HOS 14," +
  "JOL 3,AMO 9,OBA 1,JON 4,MIC 7,NAM 3,HAB 3,ZEP 3,HAG 2,ZEC 14,MAL 4," +
  "MAT 28,MRK 16,LUK 24,JHN 21,ACT 28,ROM 16,1CO 16,2CO 13,GAL 6,EPH 6,PHP 4,COL 4,1TH 5,2TH 3," +
  "1TI 6,2TI 4,TIT 3,PHM 1,HEB 13,JAS 5,1PE 5,2PE 3,1JN 5,2JN 1,3JN 1,JUD 1,REV 22";

export const BOOKS = RAW.split(",").map((s, i) => {
  const [code, n] = s.split(" ");
  return { code, chapters: Number(n), ot: i < 39 };
});

const norm = (s) => String(s).toLowerCase().replace(/[\s.\-]/g, "");

// KEYS[lang][code] = normalized name + abbreviations
const KEYS = {};
for (const l of allLangs()) {
  KEYS[l.code] = {};
  for (const b of BOOKS) {
    const e = l.books[b.code];
    if (e) KEYS[l.code][b.code] = [e.name, ...e.abbr].map(norm);
  }
}

/** Display name of a book in a language (falls back to English). */
export const bookName = (b, lang) =>
  b.code
    ? (getLang(lang).books[b.code] || getLang("eng").books[b.code]).name
    : b.name;

/** The name the backend's reference parser understands (English). */
export const bookRef = (b) =>
  b.code ? getLang("eng").books[b.code].name : b.name;

/** Find a book by any name or abbreviation; the given language wins on conflicts. */
export function findBook(text, lang) {
  const n = norm(text);
  if (!n) return null;
  const order = [lang, ...Object.keys(KEYS).filter((k) => k !== lang)];
  for (const l of order)
    for (const b of BOOKS) if (KEYS[l]?.[b.code]?.includes(n)) return b;
  return null;
}

/** Book from a name the backend returned; unknown names still work as-is. */
export const bookFor = (name, lang) =>
  findBook(name, lang) || { code: null, name, chapters: 0, ot: false };

/** Books whose name or abbreviation starts with the text (active language). */
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

// "yoh 3:16-18" -> { text: "yoh", ch: 3, a: 16, b: 18 }; "Allah mengasihi" -> { text, ch: 0 }
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