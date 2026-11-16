// The book and chapter columns.
import { mk } from "./view.js";
import { BOOKS, bookName } from "./books.js";

/** Book column: Old / New Testament headings and names in the translation's language. */
export function renderBooks(S, v, act) {
  v.booksPane.replaceChildren();
  S.bookEls = new Map();
  for (const [title, ot] of [
    [S.ui.oldTestament, true],
    [S.ui.newTestament, false],
  ]) {
    v.booksPane.append(mk("div", "bible-h", title));
    for (const b of BOOKS.filter((x) => x.ot === ot)) {
      const e = mk("div", "bible-item", bookName(b, S.lang));
      e.addEventListener("click", () => act.goTo(b, 1));
      S.bookEls.set(b.code, e);
      v.booksPane.append(e);
    }
  }
  markNav(S);
}

/** Chapter column for the current book. */
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

/** Highlight the current book and chapter and keep them in view. */
export function markNav(S) {
  const code = S.book && S.book.code;
  S.bookEls?.forEach((e, c) => e.classList.toggle("on", c === code));
  S.chapEls?.forEach((e, i) => e && e.classList.toggle("on", i === S.chapter));
  S.bookEls?.get(code)?.scrollIntoView({ block: "nearest" });
  S.chapEls?.[S.chapter]?.scrollIntoView({ block: "nearest" });
}