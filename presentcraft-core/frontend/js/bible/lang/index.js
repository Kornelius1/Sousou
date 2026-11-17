import eng from "./eng.js";
import ind from "./ind.js";

const REGISTRY = { eng, ind };

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

const LANGS = {};
const ALIAS_MAP = {};

for (const [code, l] of Object.entries(REGISTRY)) {
  LANGS[code] = {
    code,
    ui: { ...eng.ui, ...l.ui },
    books: parseBooks(l.books || ""),
  };
  ALIAS_MAP[code.toLowerCase()] = code;
  for (const alias of l.aliases || []) {
    ALIAS_MAP[alias.toLowerCase()] = code;
  }
}

export function resolveLang(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "eng";
  if (ALIAS_MAP[key]) return ALIAS_MAP[key];
  const base = key.split(/[-_]/)[0];
  return ALIAS_MAP[base] || "eng";
}

export const getLang = (code) => LANGS[resolveLang(code)] || LANGS.eng;
export const allLangs = () => Object.values(LANGS);