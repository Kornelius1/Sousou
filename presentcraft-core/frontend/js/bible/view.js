// Builds the dialog's DOM and returns the elements the other modules need.
import { CATALOG } from "./catalog.js";

export const mk = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function buildView() {
  const v = {};
  v.overlay = mk("div", "cf-overlay");
  v.box = mk("div", "cf-box bible-box");

  // translation + search box
  v.tr = mk("select");
  v.input = mk("input");
  v.input.autocomplete = "off";
  v.input.spellcheck = false;
  v.sug = mk("div", "bible-sug");
  v.sug.hidden = true;
  const searchWrap = mk("div", "bible-search");
  searchWrap.append(v.input, v.sug);
  const top = mk("div", "bible-top");
  top.append(v.tr, searchWrap);

  // three columns: books | chapters | verses
  v.booksPane = mk("div", "bible-pane");
  v.chapPane = mk("div", "bible-pane");
  v.vtitle = mk("span", "bible-vtitle");
  v.bAll = mk("button", "cf-btn");
  v.bNone = mk("button", "cf-btn");
  v.vtools = mk("span");
  v.vtools.append(v.bAll, " ", v.bNone);
  v.vhead = mk("div", "bible-vhead");
  v.vhead.append(v.vtitle, v.vtools);
  v.vbody = mk("div", "bible-vbody");
  const versePane = mk("div", "bible-pane bible-verses");
  versePane.append(v.vhead, v.vbody);
  const cols = mk("div", "bible-cols");
  cols.append(v.booksPane, v.chapPane, versePane);

  // options
  v.per = mk("select");
  for (const [val, t] of [
    ["0", "Auto (by length)"],
    ["1", "1 verse"],
    ["2", "2 verses"],
    ["3", "3 verses"],
    ["4", "4 verses"],
  ]) {
    const o = mk("option", null, t);
    o.value = val;
    v.per.appendChild(o);
  }
  const check = (label, on) => {
    const l = mk("label", "cf-msg");
    const c = mk("input");
    c.type = "checkbox";
    c.checked = on;
    l.append(c, mk("span", null, label));
    return { l, c };
  };
  const nums = check("Verse numbers", false);
  const credit = check("Copyright line on the last slide", true);
  v.nums = nums.c;
  v.credit = credit.c;
  const perGroup = mk("div", "bible-group");
  perGroup.append(mk("span", "cf-msg", "Per slide"), v.per);
  const opts = mk("div", "bible-opts");
  opts.append(perGroup, nums.l, credit.l);

  // footer
  v.sum = mk("div", "cf-msg bible-sum");
  v.close = mk("button", "cf-btn", "Close");
  v.add = mk("button", "cf-btn", "Add to slides");
  const foot = mk("div", "bible-foot");
  foot.append(v.sum, v.close, v.add);

  // add translation (collapsed)
  v.cat = mk("select");
  CATALOG.forEach((c, i) => {
    const o = mk("option", null, `${c.name}: ${c.title}`);
    o.value = String(i);
    v.cat.appendChild(o);
  });
  v.dl = mk("button", "cf-btn", "Download");
  v.imp = mk("button", "cf-btn", "Import zip…");
  const impRow = mk("div", "bible-improw");
  impRow.append(v.cat, v.dl, v.imp);
  v.hint = mk("div", "cf-msg bible-hint");
  v.det = mk("details", "bible-imp");
  v.det.append(mk("summary", "cf-msg", "Add translation"), impRow, v.hint);

  v.box.append(mk("div", "cf-title", "Bible"), top, cols, opts, foot, v.det);
  v.overlay.appendChild(v.box);
  return v;
}
