(function () {
  const hexA = (hex, a) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // host: elemen ber-posisi. Ukuran teks mengikuti tinggi host.
  function create(host) {
    host.style.opacity = "0";
    host.style.transition = "opacity .35s ease";
    let key = "", anim = null, last = null;

    const H = () => host.clientHeight || innerHeight;
    const W = () => host.clientWidth || innerWidth;

    function clear() {
      if (anim) { anim.cancel(); anim = null; }
      host.replaceChildren();
    }

    function build(m) {
      clear();
      const fs = (H() * m.size) / 100;
      const t = document.createElement("div");
      t.dataset.role = "text";
      t.textContent = m.text;
      const base = `position:absolute;font:700 ${fs}px/1.25 Arial,sans-serif;`;
      const box = document.createElement("div");
      box.dataset.role = "box";

      if (m.mode === "ticker" || m.mode === "banner") {
        const h = fs * 1.7;
        box.style.cssText =
          `position:absolute;left:0;right:0;height:${h}px;overflow:hidden;` +
          (m.pos === "top" ? "top:0;" : "bottom:0;");
        if (m.mode === "ticker") {
          t.style.cssText = base + `left:0;top:0;white-space:nowrap;line-height:${h}px;will-change:transform;`;
          box.appendChild(t);
          host.appendChild(box);
          requestAnimationFrame(() => {
            const w = t.offsetWidth, cw = W();
            const pps = Math.max(20, m.speed * (H() / 1080));
            if (anim) anim.cancel();
            anim = t.animate(
              [{ transform: `translateX(${cw}px)` }, { transform: `translateX(${-w}px)` }],
              { duration: ((cw + w) / pps) * 1000, iterations: Infinity, easing: "linear" },
            );
          });
        } else {
          t.style.cssText = base + "inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 3%;";
          box.appendChild(t);
          host.appendChild(box);
        }
      } else if (m.mode === "lower") {
        box.style.cssText = `position:absolute;left:4%;bottom:6%;max-width:62%;padding:${fs * 0.6}px ${fs}px;border-radius:${fs * 0.4}px;`;
        t.style.cssText = base + "position:static;";
        box.appendChild(t);
        host.appendChild(box);
      } else if (m.mode === "card") {
        box.style.cssText = `position:absolute;right:3%;top:5%;max-width:32%;padding:${fs * 0.6}px ${fs * 0.8}px;border-radius:${fs * 0.4}px;`;
        t.style.cssText = base + "position:static;";
        box.appendChild(t);
        host.appendChild(box);
      } else {
        box.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:6%;";
        t.style.cssText = base + "position:static;text-align:center;";
        box.appendChild(t);
        host.appendChild(box);
      }
      paint(m);
    }

    function paint(m) {
      const box = host.querySelector('[data-role="box"]');
      const t = host.querySelector('[data-role="text"]');
      if (t) t.style.color = m.color;
      if (!box) return;
      box.style.background = hexA(m.bg, 1);
      box.style.boxShadow = m.mode === "ticker" || m.mode === "banner" ? "none" : "0 8px 30px #0005";
    }

    function apply(m) {
      if (m && m.visible) m = { color: "#000000", bg: "#ffffff", ...m };
      last = m || null;
      if (!m || !m.visible) {
        host.style.opacity = "0";
        key = "";
        setTimeout(() => { if (host.style.opacity === "0") clear(); }, 400);
        return;
      }
      const k = [m.text, m.mode, m.pos, m.size, m.speed, H(), W()].join("|");
      if (k !== key) { key = k; build(m); } else paint(m);
      host.style.opacity = "1";
    }

    new ResizeObserver(() => { if (last && last.visible) apply(last); }).observe(host);

    return { apply };
  }

  window.MessageRenderer = { create };
})();