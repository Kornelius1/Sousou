// Navigasi grid bersama: klik/panah = preview, klik dua kali/Space = tayang.
const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];

export function initGridNav(host, { sel, cur, preview, air }) {
  const cells = () => [...host.querySelectorAll(sel)];
  const idxOf = (e) => cells().indexOf(e.target.closest(sel));
  const go = (all, i) => {
    preview(i);
    all[i].focus?.({ preventScroll: true });
    all[i].scrollIntoView({ block: "nearest" });
  };

  host.addEventListener("click", (e) => {
    const i = idxOf(e);
    if (i >= 0) go(cells(), i);
  });
  host.addEventListener("dblclick", (e) => {
    const i = idxOf(e);
    if (i >= 0) air(i);
  });

  host.addEventListener("keydown", (e) => {
    const all = cells();
    if (!all.length) return;
    const c = Math.max(0, cur());

    if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (cur() >= 0) air(cur());
      return;
    }
    if (!KEYS.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation(); // jangan bocor ke shortcut ganti slide

    let t = c;
    if (e.key === "Home") t = 0;
    else if (e.key === "End") t = all.length - 1;
    else {
      const r = all[c].getBoundingClientRect();
      const vert = e.key === "ArrowUp" || e.key === "ArrowDown";
      const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
      let best = Infinity;
      all.forEach((el, i) => {
        if (i === c) return;
        const b = el.getBoundingClientRect();
        const dy = b.top - r.top;
        const dx = b.left - r.left;
        const ok = vert
          ? fwd ? dy >= r.height / 2 : dy <= -b.height / 2
          : (fwd ? dx >= r.width / 2 : dx <= -b.width / 2) &&
            Math.abs(dy) < r.height;
        const d = vert ? Math.abs(dy) * 2 + Math.abs(dx) : Math.hypot(dx, dy);
        if (ok && d < best) { best = d; t = i; }
      });
      if (t === c) t = Math.min(all.length - 1, Math.max(0, c + (fwd ? 1 : -1)));
    }
    if (t !== c || cur() < 0) go(all, t);
  });
}