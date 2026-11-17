// The Bible dialog: state, the type-a-reference-or-words box, search and wiring.
// Translations are imported once from a USFM zip and then work fully offline (see bible.rs).
import { invoke } from "../tauri.js";
import { setStatus } from "../utils.js";
import { getLang } from "./lang/index.js";
import {
  BOOKS,
  bookFor,
  bookName,
  bookRef,
  findBook,
  parseRef,
  suggestBooks,
} from "./books.js";
import { buildView, mk } from "./view.js";
import { renderVerses, paintVerses, syncBar, selected } from "./preview.js";
import { renderBooks, renderChaps, markNav } from "./picker.js";
import { loadTranslations, translationLang, wireImport } from "./importer.js";
import { addToSlides, fmtNums } from "./slides.js";

let open = false;
let lastPos = null; // { book, chapter }, remembered while the app runs

// which verses to select once a chapter is loaded
const ALL = (p) => p.verses.map((x) => x.n);
const RANGE = (a, b) => (p) =>
  p.verses.filter((x) => x.n >= a && x.n <= (b || a)).map((x) => x.n);
const LIST = (ns) => () => ns;

export function openBible() {
  if (open) return;
  open = true;

  const v = buildView();
  const S = {
    lang: "eng",
    ui: getLang("eng").ui,
    book: null,
    chapter: 0,
    cp: null, // loaded chapter
    hits: null, // word-search results
    hitWords: [],
    info: "", // message shown in the verse column
    anchor: null,
    drag: null, // true = adding, false = removing, null = not dragging
    rows: new Map(),
    bookEls: new Map(),
    chapEls: [],
    sel: new Set(),
  };
  let token = 0; // ignore async results that are no longer current
  let timer = 0;
  let sugList = [];
  let sugIdx = 0;

  const act = { goTo, touch, openHit };

  document.body.appendChild(v.overlay);
  if (!getComputedStyle(v.box).getPropertyValue("--bb-bg")) {
    console.error("bible.css is not loaded");
    setStatus("bible.css is not loaded: check the <link> in index.html");
  }

  // ---------- state helpers ----------
  function setLang() {
    S.lang = translationLang(v.tr.value);
    S.ui = getLang(S.lang).ui;
  }
  function redraw() {
    renderBooks(S, v, act);
    renderChaps(S, v, act);
    renderVerses(S, v, act);
    syncBar(S, v);
  }
  function touch() {
    paintVerses(S);
    syncBar(S, v);
  }
  function openHit(h) {
    goTo(bookFor(h.book, S.lang), h.chapter, LIST([h.verse]));
  }

  // ---------- actions ----------
  // load one chapter; want(p) -> verse numbers to select right away
  async function goTo(b, ch, want) {
    if (!v.tr.value) return;
    const my = ++token;
    S.hits = null;
    if (S.book !== b) {
      S.book = b;
      S.chapter = ch;
      renderChaps(S, v, act);
    }
    S.chapter = ch;
    markNav(S);
    try {
      const p = await invoke("bible_passage", {
        id: v.tr.value,
        reference: `${bookRef(b)} ${ch}`,
      });
      if (my !== token) return;
      S.cp = p;
      S.info = "";
      S.sel.clear();
      (want ? want(p) : []).forEach((n) => S.sel.add(n));
      S.anchor = S.sel.size ? [...S.sel].pop() : null;
      lastPos = { book: b, chapter: ch };
    } catch (err) {
      if (my !== token) return;
      const msg = String(err);
      S.cp = null;
      S.sel.clear();
      S.info = `${bookName(b, S.lang)} ${ch}: ${
        /is not in this translation/.test(msg)
          ? msg + " Try another translation."
          : msg
      }`;
    }
    renderVerses(S, v, act);
    syncBar(S, v);
  }

  async function doSearch(q) {
    const my = ++token;
    try {
      const list = await invoke("bible_search", {
        id: v.tr.value,
        query: q,
        limit: 50,
      });
      if (my !== token) return;
      S.hitWords = q.split(/\s+/).filter((w) => w.length > 1);
      S.hits = list.length ? list : null;
      S.info = list.length ? "" : S.ui.noHits;
    } catch (err) {
      if (my !== token) return;
      S.hits = null;
      S.info = String(err);
    }
    renderVerses(S, v, act);
    syncBar(S, v);
  }

  // a reference our book table doesn't know: let the backend try, and search words if it gives up
  async function runBackend(q) {
    try {
      const p = await invoke("bible_passage", { id: v.tr.value, reference: q });
      goTo(bookFor(p.book, S.lang), p.chapter, LIST(p.verses.map((x) => x.n)));
    } catch (err) {
      if (/^(Unknown book|Type a chapter|Invalid reference)/.test(String(err)))
        doSearch(q);
      else {
        token++;
        S.hits = null;
        S.info = String(err);
        renderVerses(S, v, act);
        syncBar(S, v);
      }
    }
  }

  // ---------- book suggestions ----------
  function hideSug() {
    v.sug.hidden = true;
    sugList = [];
  }
  function showSug(list) {
    sugList = list;
    sugIdx = 0;
    v.sug.hidden = false;
    v.sug.replaceChildren(
      ...list.map((b, i) => {
        const e = mk(
          "div",
          "bible-sugi" + (i === 0 ? " on" : ""),
          bookName(b, S.lang),
        );
        e.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          pickSug(b);
        });
        return e;
      }),
    );
  }
  function moveSug(d) {
    sugIdx = (sugIdx + d + sugList.length) % sugList.length;
    [...v.sug.children].forEach((e, i) =>
      e.classList.toggle("on", i === sugIdx),
    );
  }
  function pickSug(b) {
    clearTimeout(timer);
    hideSug();
    v.input.value = bookName(b, S.lang) + " ";
    goTo(b, 1);
    v.input.focus();
  }

  // ---------- the box: reference or words ----------
  const later = (fn, now, ms = 250) => {
    if (now) fn();
    else timer = setTimeout(fn, ms);
  };
  function dispatch(immediate) {
    clearTimeout(timer);
    const q = v.input.value.trim();
    if (!q) return hideSug();
    if (!v.tr.value) {
      hideSug();
      S.info = "Install a translation first (see “Add translation” below).";
      renderVerses(S, v, act);
      return syncBar(S, v);
    }
    const r = parseRef(q);
    if (r) {
      const ex = findBook(r.text, S.lang);
      if (ex && r.ch) {
        hideSug();
        return later(
          () => goTo(ex, r.ch, r.a ? RANGE(r.a, r.b) : ALL),
          immediate,
        );
      }
      if (!r.ch) {
        const s = suggestBooks(r.text, S.lang);
        if (s.length) return showSug(s);
      } else {
        hideSug();
        return later(() => runBackend(q), immediate);
      }
    }
    hideSug();
    if (q.length >= 3 && !/^\d+$/.test(q))
      later(() => doSearch(q), immediate, 350);
  }

  function defaultBookForTr() {
    const code = v.tr.value === "tbdc" ? "TOB" : "JHN";
    return BOOKS.find((b) => b.code === code) || BOOKS[0];
  }

  function start() {
    if (!v.tr.value) return;
    const isDcTr = v.tr.value === "tbdc";
    const validLast =
      lastPos && lastPos.book && (isDcTr ? lastPos.book.dc : !lastPos.book.dc);
    const pos = validLast ? lastPos : { book: defaultBookForTr(), chapter: 1 };
    goTo(pos.book, pos.chapter);
  }

  // ---------- events ----------
  const stopDrag = () => (S.drag = null);
  const finish = () => {
    clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mouseup", stopDrag);
    v.overlay.remove();
    open = false;
  };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (!v.sug.hidden) hideSug();
    else finish();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("mouseup", stopDrag);
  v.overlay.addEventListener("keydown", (e) => e.stopPropagation()); // typing must not trigger app shortcuts
  v.overlay.addEventListener("mousedown", (e) => {
    if (e.target === v.overlay) finish();
  });
  v.close.addEventListener("click", finish);

  v.input.addEventListener("input", () => dispatch(false));
  v.input.addEventListener("blur", hideSug);
  v.input.addEventListener("keydown", (e) => {
    if (!v.sug.hidden && e.key === "ArrowDown") {
      e.preventDefault();
      moveSug(1);
    } else if (!v.sug.hidden && e.key === "ArrowUp") {
      e.preventDefault();
      moveSug(-1);
    } else if (e.key === "Enter") {
      if (!v.sug.hidden) pickSug(sugList[sugIdx]);
      else dispatch(true);
    }
  });

  v.bAll.addEventListener("click", () => {
    S.cp?.verses.forEach((x) => S.sel.add(x.n));
    touch();
  });
  v.bNone.addEventListener("click", () => {
    S.sel.clear();
    touch();
  });

  // another translation: labels follow its language, the selected verses stay
  v.tr.addEventListener("change", () => {
    setLang();
    redraw();
    if (S.book && S.chapter) {
      const isDcTr = v.tr.value === "tbdc";
      if (isDcTr !== Boolean(S.book.dc)) {
        goTo(defaultBookForTr(), 1);
      } else {
        goTo(S.book, S.chapter, LIST([...S.sel]));
      }
    } else if (S.hits) {
      dispatch(true);
    }
  });

  v.add.addEventListener("click", async () => {
    const verses = selected(S);
    if (!verses.length) return;
    const label = `${S.cp.book} ${S.cp.chapter}:${fmtNums(verses.map((x) => x.n))}`;
    v.add.disabled = true;
    const msg = await addToSlides(
      { ...S.cp, label, verses },
      {
        perSlide: Number(v.per.value) || 0,
        nums: v.nums.checked,
        credit: v.credit.checked,
      },
    );
    setStatus(msg);
    v.add.disabled = false;
    v.sum.classList.remove("dim");
    v.sum.textContent = msg; // selection stays, so you can Add again with other options
  });

  wireImport(v, () => {
    setLang();
    redraw();
    if (S.book && S.chapter) goTo(S.book, S.chapter, LIST([...S.sel]));
    else {
      S.info = "";
      renderVerses(S, v, act);
      start();
    }
  });

  // ---------- go ----------
  setLang();
  redraw();
  loadTranslations(v).then((list) => {
    setLang();
    if (!list.length) {
      v.det.open = true;
      S.info =
        "No translation installed yet. Open “Add translation” below and click Download.";
    }
    redraw();
    if (list.length) start();
    v.input.focus();
  });
}
