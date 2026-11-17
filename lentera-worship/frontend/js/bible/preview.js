// The verse column (verses, search results, messages) and the footer summary.
import { mk } from "./view.js";
import { bookName } from "./books.js";
import { fmtNums } from "./slides.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plural = (n, one, many) => (n === 1 ? one : many);

const hl = (text, words) => {
  if (!words.length) return [text];
  const re = new RegExp("(" + words.map(esc).join("|") + ")", "gi");
  return text.split(re).map((t, i) => (i % 2 ? mk("mark", null, t) : t));
};

export const selected = (S) =>
  S.cp ? S.cp.verses.filter((x) => S.sel.has(x.n)) : [];

export const paintVerses = (S) =>
  S.rows.forEach((r, n) => r.classList.toggle("sel", S.sel.has(n)));

export function syncBar(S, v) {
  const { ui } = S;
  const ns = selected(S).map((x) => x.n);
  v.sum.classList.toggle("dim", !ns.length || !!S.hits);
  v.sum.textContent = S.hits
    ? ui.openHit
    : ns.length
      ? `${S.cp.book} ${S.cp.chapter}:${fmtNums(ns)} · ${ns.length} ${plural(ns.length, ui.verseOne, ui.verseMany)}`
      : ui.noSelection;
  v.add.disabled = !ns.length || !!S.hits;
  v.bAll.textContent = ui.all;
  v.bNone.textContent = ui.clear;
  v.input.placeholder = ui.example;
}

export function renderVerses(S, v, act) {
  const { ui } = S;
  S.rows = new Map();
  // header kolom ayat: judul + tombol, disembunyikan kalau keduanya kosong
  const head = (title, tools) => {
    v.vtitle.textContent = title;
    v.vtools.hidden = !tools;
    v.vhead.hidden = !title && !tools;
  };
  const note = (text) => {
    head("", false);
    v.vbody.replaceChildren(mk("div", "cf-msg bible-note", text));
    v.vbody.scrollTop = 0;
  };

  if (S.hits) {
    const n = S.hits.length;
    head(`${n} ${plural(n, ui.resultOne, ui.resultMany)}`, false);
    v.vbody.replaceChildren(
      ...S.hits.map((h) => {
        const e = mk("div", "bible-hit");
        const t = mk("span");
        t.append(...hl(h.text, S.hitWords));
        e.append(mk("b", null, `${h.book} ${h.chapter}:${h.verse}`), t);
        e.addEventListener("click", () => act.openHit(h));
        return e;
      }),
    );
    v.vbody.scrollTop = 0;
    return;
  }
  if (S.info) return note(S.info);
  if (!S.cp) return note(ui.hint);

  head(`${bookName(S.book, S.lang)} ${S.cp.chapter}`, true);
  v.vbody.replaceChildren(
    ...S.cp.verses.map((x) => {
      const n = x.n;
      const r = mk("div", "bible-verse");
      r.append(mk("b", null, String(n)), mk("span", null, x.text));
      r.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (e.shiftKey && S.anchor != null) {
          const a = Math.min(S.anchor, n);
          const z = Math.max(S.anchor, n);
          S.cp.verses.forEach((y) => y.n >= a && y.n <= z && S.sel.add(y.n));
        } else {
          S.drag = !S.sel.has(n); // drag adds or removes, depending on the first verse
          S.drag ? S.sel.add(n) : S.sel.delete(n);
        }
        S.anchor = n;
        act.touch();
      });
      r.addEventListener("mouseenter", () => {
        if (S.drag === null) return;
        S.drag ? S.sel.add(n) : S.sel.delete(n);
        S.anchor = n;
        act.touch();
      });
      S.rows.set(n, r);
      return r;
    }),
  );
  paintVerses(S);
  const first = v.vbody.querySelector(".sel");
  if (first) first.scrollIntoView({ block: "nearest" });
  else v.vbody.scrollTop = 0;
}
