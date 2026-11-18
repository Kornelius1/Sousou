const TERMS_VERSION = "1"; // naikkan kalau isi ndi-terms.*.txt berubah secara substansi
const KEY = "ndiTermsAccepted";
const LANG_KEY = "ndiTermsLang";
const CSS_URL = "css/ndi-terms.css";
const termsUrl = (lang) => `legal/ndi-terms.${lang}.txt`;

const UI = {
  en: {
    title: "Third-party software terms",
    language: "Language",
    loading: "Loading…",
    check: "I have read and accept these terms",
    accept: "Accept",
    decline: "Decline",
    note: "The English version prevails in case of any difference.",
    declined: "These terms need to be accepted to use this application.",
    failed: "Could not load the terms. Please reinstall the application. You can also read them at http://ndi.link/ndisdk_license",
  },
  id: {
    title: "Ketentuan perangkat lunak pihak ketiga",
    language: "Bahasa",
    loading: "Memuat…",
    check: "Saya sudah membaca dan menyetujui ketentuan ini",
    accept: "Setuju",
    decline: "Tolak",
    note: "Jika ada perbedaan, versi bahasa Inggris yang berlaku.",
    declined: "Ketentuan ini perlu disetujui agar aplikasi dapat digunakan.",
    failed: "Gagal memuat ketentuan. Silakan pasang ulang aplikasi. Anda juga bisa membacanya di http://ndi.link/ndisdk_license",
  },
};

let acceptedThisSession = false;
let pending = null;

function alreadyAccepted() {
  if (acceptedThisSession) return true;
  try { return localStorage.getItem(KEY) === TERMS_VERSION; } catch { return false; }
}

function readLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return UI[v] ? v : "en"; // bawaan: bahasa Inggris
  } catch { return "en"; }
}

function loadCss() {
  if (document.querySelector(`link[href="${CSS_URL}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_URL;
  document.head.appendChild(link);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

async function showTerms() {
  loadCss();
  let lang = readLang();
  const cache = {};
  let loaded = false;
  let token = 0;

  const title = el("h2", { className: "ndi-terms-title" });
  const select = el("select", { className: "ndi-terms-select" },
    new Option("English", "en"), new Option("Bahasa Indonesia", "id"));
  select.value = lang;
  const globe = el("i", { className: "fa-solid fa-globe" });
  globe.setAttribute("aria-hidden", "true");
  const head = el("div", { className: "ndi-terms-head" }, title,
    el("div", { className: "ndi-terms-lang" }, globe, select));

  const text = el("div", { className: "ndi-terms-text", tabIndex: 0 });
  const link = el("a", { href: "#", textContent: "ndi.video" });
  link.setAttribute("data-ndi-link", ""); // dibuka lewat handler ndi_open_download
  const check = el("input", { type: "checkbox" });
  const checkText = el("span");
  const note = el("small", { className: "ndi-terms-note" });
  const declined = el("p", { className: "ndi-terms-declined", hidden: true });
  const body = el("div", { className: "ndi-terms-body" }, text,
    el("div", { className: "ndi-terms-link" }, link),
    el("label", { className: "ndi-terms-check" }, check, checkText),
    note, declined);

  const decline = el("button", { type: "button", className: "ndi-terms-btn" });
  const accept = el("button", { type: "button", className: "ndi-terms-btn ndi-terms-primary", disabled: true });
  const foot = el("div", { className: "ndi-terms-foot" }, decline, accept);
  const dlg = el("dialog", { id: "ndi-terms-dlg" }, head, body, foot);

  function applyUi() {
    const t = UI[lang];
    title.textContent = t.title;
    select.setAttribute("aria-label", t.language);
    checkText.textContent = t.check;
    note.textContent = t.note;
    declined.textContent = t.declined;
    decline.textContent = t.decline;
    accept.textContent = t.accept;
  }

  function refresh() {
    check.disabled = !loaded;
    accept.disabled = !(loaded && check.checked);
  }

  async function loadText() {
    const my = ++token;
    loaded = false;
    text.textContent = UI[lang].loading;
    refresh();
    try {
      if (!cache[lang]) {
        const res = await fetch(termsUrl(lang), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cache[lang] = await res.text();
      }
      if (my !== token) return;
      text.textContent = cache[lang];
      text.scrollTop = 0;
      loaded = true;
    } catch (err) {
      if (my !== token) return;
      console.error("Failed to load NDI terms:", err);
      text.textContent = UI[lang].failed;
    }
    refresh();
  }

  document.body.appendChild(dlg);
  dlg.addEventListener("cancel", (e) => e.preventDefault()); // Esc tidak menutup
  select.addEventListener("change", () => {
    lang = select.value;
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    applyUi();
    loadText();
  });
  check.addEventListener("change", refresh);
  decline.addEventListener("click", () => { declined.hidden = false; });

  applyUi();
  dlg.showModal();
  loadText();

  return new Promise((resolve) => {
    accept.addEventListener("click", () => {
      if (!loaded || !check.checked) return;
      acceptedThisSession = true;
      try { localStorage.setItem(KEY, TERMS_VERSION); } catch {}
      dlg.close();
      dlg.remove();
      resolve(true);
    });
  });
}

// Aman dipanggil berkali-kali: dialog hanya dibuat satu kali.
export function ensureNdiTerms() {
  if (alreadyAccepted()) return Promise.resolve(true);
  if (!pending) pending = showTerms().finally(() => { pending = null; });
  return pending;
}

// Hanya menagih persetujuan pada build yang menyertakan NDI.
export async function ensureNdiTermsIfEnabled() {
  try {
    const s = await window.__TAURI__.core.invoke("ndi_status");
    if (!s.enabled) return true;
  } catch (err) {
    console.error(err); // jika ragu, tagih persetujuan
  }
  return ensureNdiTerms();
}