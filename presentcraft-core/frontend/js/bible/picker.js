import { mk } from "./view.js";
import { BOOKS, bookName } from "./books.js";
import { translationBooks } from "./importer.js";

export function renderBooks(S, v, act) {
  v.booksPane.replaceChildren();
  S.bookEls = new Map();

  const allowed = translationBooks(v.tr.value);
  const avail = allowed ? BOOKS.filter((x) => allowed.has(x.code)) : BOOKS;

  const sections = [
    [S.ui.oldTestament, avail.filter((x) => x.ot)],
    [S.ui.newTestament, avail.filter((x) => !x.ot && !x.dc)],
    [S.ui.deuterocanon, avail.filter((x) => x.dc)],
  ];

  for (const [title, list] of sections) {
    if (!list.length) continue;
    v.booksPane.append(mk("div", "bible-h", title));
    for (const b of list) {
      const e = mk("div", "bible-item", bookName(b, S.lang));
      e.addEventListener("click", () => act.goTo(b, 1));
      S.bookEls.set(b.code, e);
      v.booksPane.append(e);
    }
  }
  markNav(S);
}

export function renderChaps(S, v, act) {
  v.chapPane.replaceChildren(mk("div", "bible-h", S.ui.chapter));
  S.chapEls = [];
  const g = mk("div", "bible-chapgrid");
  const n = S.book ? S.book.chapters : 0;
  for (let i = 1; i <= n; i++) {
    const e = mk("div", "bible-chap", String(i));
    e.addEventListener("click", () => act.goTo(S.book, i));
    S.chapEls[i] = e;
    g.append(e);
  }
  v.chapPane.append(g);
  markNav(S);
}

export function markNav(S) {
  const code = S.book && S.book.code;
  S.bookEls?.forEach((e, c) => e.classList.toggle("on", c === code));
  S.chapEls?.forEach((e, i) => e && e.classList.toggle("on", i === S.chapter));
  S.bookEls?.get(code)?.scrollIntoView({ block: "nearest" });
  S.chapEls?.[S.chapter]?.scrollIntoView({ block: "nearest" });
}