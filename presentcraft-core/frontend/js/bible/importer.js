// Installed translations (select box) and the Download / Import zip buttons.
import { invoke, openDialog } from "../tauri.js";
import { setStatus } from "../utils.js";
import { CATALOG } from "./catalog.js";
import { mk } from "./view.js";

const LANG_OF = new Map(); // translation id -> language code

/** Language of an installed translation (backend's `lang`, else the catalog's, else English). */
export const translationLang = (id) => LANG_OF.get(id) || "eng";

export async function loadTranslations(v, pick) {
  const keep = v.tr.value;
  let list = [];
  try {
    list = await invoke("bible_list");
  } catch (err) {
    console.warn("bible_list failed:", err);
  }
  v.tr.replaceChildren();
  LANG_OF.clear();
  for (const t of list) {
    LANG_OF.set(t.id, t.lang || CATALOG.find((c) => c.id === t.id)?.lang || "eng");
    const o = mk("option", null, `${t.name} (${t.books} books)`);
    o.value = t.id;
    v.tr.appendChild(o);
  }
  const want = pick || keep;
  if (want && list.some((t) => t.id === want)) v.tr.value = want;
  return list;
}

export function wireImport(v, onImported) {
  const showHint = () => {
    const c = CATALOG[v.cat.selectedIndex];
    v.hint.textContent = `${c.license}. ${c.note} Click Download, or import a USFM zip you downloaded from ${c.source}.`;
  };
  v.cat.addEventListener("change", showHint);
  showHint();

  const meta = (c) => ({
    id: c.id,
    name: c.name,
    lang: c.lang,
    license: c.license,
    attribution: c.attribution,
  });

  const run = async (c, busy, failed, job) => {
    v.dl.disabled = v.imp.disabled = true;
    v.hint.textContent = `${busy} ${c.name}…`;
    try {
      const info = await job();
      await loadTranslations(v, c.id);
      onImported();
      v.hint.textContent = `${c.name} imported (${info.books} books).`;
      setStatus(v.hint.textContent);
    } catch (err) {
      v.hint.textContent = `${failed}: ${err}`;
    }
    v.dl.disabled = v.imp.disabled = false;
  };

  v.imp.addEventListener("click", async () => {
    const c = CATALOG[v.cat.selectedIndex];
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "USFM zip", extensions: ["zip"] }],
    });
    if (!path) return;
    run(c, "Importing", "Import failed", () =>
      invoke("bible_import_usfm", { path, meta: meta(c) }),
    );
  });

  v.dl.addEventListener("click", () => {
    const c = CATALOG[v.cat.selectedIndex];
    run(c, "Downloading", "Download failed", () =>
      invoke("bible_download_usfm", { id: c.id, meta: meta(c) }),
    );
  });
}