// Language registry. To add a language:
//   1. copy eng.js to lang/<code>.js (code = ISO 639-3, same as `lang` in catalog.js) and translate it
//   2. import it below and add it to REGISTRY
// Anything a language file leaves out (a UI label, a book) falls back to English.
import eng from "./eng.js";
import ind from "./ind.js";

const REGISTRY = { eng, ind };

/** "GEN=Genesis|Gen" lines -> { GEN: { name: "Genesis", abbr: ["Gen"] } } */
function parseBooks(text) {
  const out = {};
  for (const line of text.trim().split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    const [name, ...abbr] = line.slice(i + 1).split("|").map((s) => s.trim());
    out[line.slice(0, i).trim()] = { name, abbr };
  }
  return out;
}

const LANGS = Object.fromEntries(
  Object.entries(REGISTRY).map(([code, l]) => [
    code,
    { code, ui: { ...eng.ui, ...l.ui }, books: parseBooks(l.books || "") },
  ]),
);

export const getLang = (code) => LANGS[code] || LANGS.eng;
export const allLangs = () => Object.values(LANGS);