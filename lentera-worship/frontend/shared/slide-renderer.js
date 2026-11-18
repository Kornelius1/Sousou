// slide-renderer.js
// Menggambar slide ke stage (audience), thumbnail, dan background persisten.
(function () {
  const ROTATION_SIGN = -1; // jika rotasi miring ke arah salah, ubah ke 1

  const TEXT_DEFAULTS = {
    fontFamily: "Arial, sans-serif",
    fontSize: 54,
    color: "#ffffff",
    align: "center",
    valign: "middle",
    bold: false,
    italic: false,
  };

  const pct = (v) => `${v}%`;

  function positionBox(el, rect) {
    el.style.position = "absolute";
    el.style.left = pct(rect.x);
    el.style.top = pct(rect.y);
    el.style.width = pct(rect.w);
    el.style.height = pct(rect.h);
  }

  function objectFitFor(scale) {
    const s = scale || "";
    if (s.includes("STRETCH")) return "fill";
    if (s.includes("FILL")) return "cover";
    return "contain";
  }

  function playSafe(el) {
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {
        el.muted = true;
        el.play().catch(() => {});
      });
    }
  }

  const readyMedia = (el) =>
    new Promise((res) => {
      if (el.tagName === "IMG") {
        if (!el.getAttribute("src"))
          res(); // belum ada sumber (kamera live)
        else if (el.decode) el.decode().then(res, res);
        else if (el.complete) res();
        else el.onload = el.onerror = res;
      } else if (el.readyState >= 2) res();
      else {
        el.addEventListener("loadeddata", res, { once: true });
        el.addEventListener("error", res, { once: true });
      }
    });

  // ---------- kamera live ----------
  function attachCam(el, name, stale) {
    el.dataset.live = "1";
    window.CamSource.url(name)
      .then((u) => {
        if (el.dataset.dead === "1" || stale()) {
          window.CamSource.release(name); // elemen sudah dibuang sebelum kamera siap
          return;
        }
        el.dataset.cam = name;
        el.src = u;
      })
      .catch((err) => console.warn("Failed to open input:", err));
  }

  // hentikan video dan lepas kamera di dalam root sebelum dibuang
  const stopVideos = (root) => {
    const vids =
      root.tagName === "VIDEO" ? [root] : [...root.querySelectorAll("video")];
    vids.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    const cams = [...root.querySelectorAll("img[data-live]")];
    if (root.matches && root.matches("img[data-live]")) cams.push(root);
    cams.forEach((im) => {
      im.dataset.dead = "1";
      if (im.dataset.cam && window.CamSource) {
        window.CamSource.release(im.dataset.cam);
        delete im.dataset.cam;
      }
      im.removeAttribute("src");
    });
  };

  // ---------- transisi (foreground dan background terpisah) ----------
  const T = { fg: "fade", bg: "fade", msFg: 300, msBg: 300 };
  function setTransition(t) {
    if (!t || typeof t !== "object") return;
    const n = { ...t };
    if (n.ms != null) {
      // format lama: satu durasi untuk keduanya
      n.msFg ??= n.ms;
      n.msBg ??= n.ms;
      delete n.ms;
    }
    Object.assign(T, n);
  }

  const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
  const EASE_IO = "cubic-bezier(.65,0,.35,1)";
  const EASE_IN = "cubic-bezier(.64,0,.78,0)";
  const DIP_COLOR = "#000"; // ganti ke #fff untuk dip to white

  const FX = {
    cut: null,
    none: null,
    fade: {
      in: [{ opacity: 0 }, { opacity: 1 }],
      out: [{ opacity: 1 }, { opacity: 0 }],
      ein: EASE_IO,
      eout: EASE_IO,
    },
    blur: {
      in: [
        { opacity: 0, filter: "blur(14px)" },
        { opacity: 1, filter: "blur(0)" },
      ],
      out: [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: "blur(14px)" },
      ],
      ein: EASE_OUT,
      eout: EASE_IN,
    },
    zoom: {
      in: [
        { opacity: 0, transform: "scale(1.08)" },
        { opacity: 1, transform: "none" },
      ],
      out: [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(.96)" },
      ],
      ein: EASE_OUT,
      eout: EASE_IN,
    },
    slide: {
      in: [{ transform: "translateX(100%)" }, { transform: "none" }],
      out: [
        { transform: "none", opacity: 1 },
        { transform: "translateX(-30%)", opacity: 0.4 },
      ],
      ein: EASE_OUT,
      eout: EASE_OUT,
    },
    wipe: {
      in: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      out: null,
      ein: EASE_IO,
    },
    dip: { dip: true }, // black fade: lama memudar ke hitam, lalu baru muncul dari hitam
  };

  const play = (el, kf, ms, easing, delay = 0) =>
    el
      .animate(kf, {
        duration: ms,
        easing: easing || EASE_IO,
        fill: "both",
        delay,
      })
      .finished.catch(() => {});

  const afterPaint = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // dua tahap berurutan; durasi dibagi dua
  async function dipTransition(host, olds, incoming, ms, stale) {
    const half = Math.max(1, ms / 2);
    const veil = document.createElement("div");
    veil.style.cssText =
      `position:absolute;inset:0;background:${DIP_COLOR};opacity:0;` +
      "z-index:2147483000;pointer-events:none;";
    host.appendChild(veil);
    incoming.style.visibility = "hidden";

    await play(veil, [{ opacity: 0 }, { opacity: 1 }], half, EASE_IN);
    if (stale()) {
      // sudah ada render lebih baru yang mengurus yang lama
      veil.remove();
      incoming.style.visibility = "";
      return false;
    }
    olds.forEach((o) => {
      stopVideos(o);
      o.remove();
    });
    incoming.style.visibility = "";
    await play(veil, [{ opacity: 1 }, { opacity: 0 }], half, EASE_OUT);
    veil.remove();
    return true;
  }

  // ---------- layer ----------
  function mediaElement(layer, mode) {
    const isVideo = layer.kind === "video";
    const el = document.createElement(isVideo ? "video" : "img");
    el.src = isVideo && mode ? layer.src + "#t=0.1" : layer.src;
    el.style.position = "absolute";

    if (layer.inner) {
      positionBox(el, layer.inner);
      el.style.objectFit = "fill";
    } else {
      positionBox(el, { x: 0, y: 0, w: 100, h: 100 });
      el.style.objectFit = objectFitFor(layer.scale);
    }

    if (isVideo) {
      el.playsInline = true;
      if (mode) {
        el.muted = true;
        el.preload = mode === "manual" ? "auto" : "metadata";
        el.loop = mode === "manual" && layer.looped === true;
      } else {
        el.loop = layer.looped === true;
        el.muted = layer.muted === true;
        el.autoplay = true;
        playSafe(el);
      }
    }
    return el;
  }

  function inputElement(layer, preview) {
    const inp = layer.input || {};
    let el;
    if (preview || inp.media !== "video" || inp.ndi || !window.CamSource) {
      el = document.createElement("div");
      el.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "background:#0b2a5a;color:#9db4d8;font:14px sans-serif;text-align:center;";
      el.textContent = "Input: " + (inp.name || "Video");
    } else {
      el = document.createElement("img");
      el.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${objectFitFor(layer.scale)};`;
      attachCam(el, inp.label, () => false);
    }
    return el;
  }

  // posisi, ukuran, rotasi, opasitas: dipakai juga oleh jalur cepat editor
  function applyLayerBox(wrap, layer) {
    positionBox(wrap, layer.rect);
    wrap.style.zIndex = String(layer.z);
    wrap.style.opacity = String(layer.opacity);
    wrap.style.transform = `rotate(${ROTATION_SIGN * (layer.rotation || 0)}deg)`;
    wrap.style.transformOrigin = "50% 50%";
  }

  function fillText(el, layer) {
    if (Array.isArray(layer.runs) && layer.runs.length) {
      el.textContent = "";
      for (const r of layer.runs) {
        if (r.sup) {
          const s = document.createElement("span");
          s.textContent = r.text;
          s.style.fontSize = "0.55em";
          s.style.verticalAlign = "0.55em";
          s.style.lineHeight = "0";
          s.style.opacity = "0.85";
          el.appendChild(s);
        } else {
          el.appendChild(document.createTextNode(r.text));
        }
      }
    } else {
      el.textContent = layer.text || "";
    }
  }

  function layerElement(layer, preview) {
    const wrap = document.createElement("div");
    applyLayerBox(wrap, layer);
    if (layer._i != null) wrap.dataset.li = String(layer._i);

    switch (layer.kind) {
      case "video":
      case "image":
        if (!layer.src) return null;
        wrap.appendChild(mediaElement(layer, preview));
        break;
      case "input":
        wrap.appendChild(inputElement(layer, preview));
        break;
      case "color":
        wrap.style.background = layer.color || "transparent";
        break;
      case "text": {
        const st = { ...TEXT_DEFAULTS, ...(layer.style || {}) };
        wrap.style.display = "flex";
        wrap.style.alignItems =
          st.valign === "top"
            ? "flex-start"
            : st.valign === "bottom"
              ? "flex-end"
              : "center";
        wrap.style.fontFamily = st.fontFamily;
        wrap.style.fontSize = st.fontSize + "px";
        wrap.style.color = st.color;
        wrap.style.fontWeight = st.bold ? "700" : "400";
        wrap.style.fontStyle = st.italic ? "italic" : "normal";
        const inner = document.createElement("div");
        inner.style.width = "100%";
        inner.style.textAlign = st.align;
        inner.style.whiteSpace = "pre-line";
        fillText(inner, layer);
        wrap.appendChild(inner);
        break;
      }
      default:
        return null;
    }
    return wrap;
  }

  function fillStage(stage, payload, preview) {
    const layers = [...(payload.layers || [])].sort((a, b) => a.z - b.z);
    for (const layer of layers) {
      const el = layerElement(layer, preview);
      if (el) stage.appendChild(el);
    }
  }

  // ---------- layar audience (foreground) ----------
  let renderSeq = 0;
  async function renderSlide(stage, payload) {
    const seq = ++renderSeq;
    const stale = () => seq !== renderSeq;
    const w = payload.width || 1366;
    const h = payload.height || 768;

    const next = document.createElement("div");
    fillStage(next, payload, false);

    const media = [...next.querySelectorAll("img, video")];
    if (media.length)
      await Promise.race([
        Promise.all(media.map(readyMedia)),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    if (stale()) {
      stopVideos(next);
      return;
    }

    const group = document.createElement("div");
    group.style.cssText =
      "position:absolute;inset:0;isolation:isolate;will-change:transform,opacity;";
    group.append(...next.childNodes);
    group.dataset.txt = media.length ? "" : "1";

    const olds = [...stage.children];
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    stage.style.overflow = "hidden"; // slide yang bergeser tidak keluar kanvas
    stage.appendChild(group);
    fitStage(stage);

    const drop = () =>
      olds.forEach((o) => {
        stopVideos(o);
        o.remove();
      });

    const fx = FX[T.fg];
    if (!fx || !T.msFg || !olds.length) {
      await afterPaint();
      if (!stale()) drop();
      return;
    }

    if (fx.dip) {
      await dipTransition(stage, olds, group, T.msFg, stale);
      return;
    }

    const seq2 =
      group.dataset.txt === "1" &&
      olds.every((o) => o.dataset.txt === "1") &&
      fx.in[0].opacity === 0 &&
      !!fx.out;

    const jobs = [];
    if (seq2) {
      const half = T.msFg / 2;
      olds.forEach((o) => jobs.push(play(o, fx.out, half, fx.eout)));
      jobs.push(play(group, fx.in, half, fx.ein, half));
    } else {
      jobs.push(play(group, fx.in, T.msFg, fx.ein));
      if (fx.out)
        olds.forEach((o) => jobs.push(play(o, fx.out, T.msFg, fx.eout)));
    }
    await Promise.all(jobs);

    if (stale()) return; // render yang lebih baru yang membersihkan
    group.getAnimations().forEach((a) => a.cancel());
    drop();
  }

  function fitStage(stage) {
    const w = parseFloat(stage.style.width) || 1366;
    const h = parseFloat(stage.style.height) || 768;
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    stage.style.transformOrigin = "0 0";
    stage.style.transform = `scale(${scale})`;
    stage.style.left = (window.innerWidth - w * scale) / 2 + "px";
    stage.style.top = (window.innerHeight - h * scale) / 2 + "px";
  }

  // ---------- thumbnail (tanpa transisi) ----------
  function renderThumbnail(host, payload, opts) {
    const w = payload.width || 1366;
    const h = payload.height || 768;
    host.style.aspectRatio = `${w} / ${h}`;

    if (!host._bg) {
      host._bg = document.createElement("div");
      host._bg.style.cssText =
        "position:absolute;inset:0;overflow:hidden;z-index:0;";
      host.appendChild(host._bg);
    }
    const prevStage = host._stage;

    const stage = document.createElement("div");
    stage.style.cssText = `position:absolute;left:0;top:0;z-index:1;width:${w}px;height:${h}px;transform-origin:0 0;`;
    fillStage(stage, payload, opts && opts.manual ? "manual" : "preview");
    host.appendChild(stage);
    host._stage = stage;

    host._apply = () => {
      stage.style.transform = `scale(${host.clientWidth / w})`;
    };
    host._apply();
    if (!host._ro) {
      host._ro = new ResizeObserver(() => host._apply && host._apply());
      host._ro.observe(host);
    }

    // tukar stage setelah media siap, supaya tidak ada jeda kosong (kedip)
    host._olds = host._olds || [];
    if (prevStage) host._olds.push(prevStage);
    const seq = (host._seq = (host._seq || 0) + 1);
    const dropOlds = () => {
      host._olds.forEach((o) => {
        stopVideos(o);
        o.remove();
      });
      host._olds = [];
    };
    if (!prevStage) return;

    const media = [...stage.querySelectorAll("img, video")];
    if (!media.length) return dropOlds();
    stage.style.visibility = "hidden";
    Promise.race([
      Promise.all(media.map(readyMedia)),
      new Promise((r) => setTimeout(r, 400)),
    ]).then(() => {
      if (host._seq !== seq) return;
      stage.style.visibility = "";
      dropOlds();
    });
  }

  // ---------- background persisten ----------
  const bgState = new WeakMap();

  function toUrl(path) {
    const t = window.__TAURI__;
    const conv = t && t.core && t.core.convertFileSrc;
    return conv ? conv(path) : path;
  }

  function resetBackground(layer) {
    const st = bgState.get(layer);
    if (st && st.dispose) st.dispose();
    stopVideos(layer);
    layer.replaceChildren();
    layer.style.opacity = "";
    bgState.delete(layer);
  }

  function applyBackgroundSettings(layer, el, bg, preview) {
    layer.style.opacity = String(bg.opacity);
    if (bg.kind === "color") return;
    el.style.objectFit = bg.scale === "fit" ? "contain" : "cover";
    if (bg.kind === "video") {
      el.loop = bg.loop;
      el.muted = preview ? true : bg.mute;
      if (!preview && el.paused && (bg.loop || !el.ended)) playSafe(el);
    }
  }

  function renderBackground(layer, bg, opts) {
    const preview = !!(opts && opts.preview);
    const manual = !!(opts && opts.manual);
    if (!bg) {
      resetBackground(layer);
      return;
    }

    const key = bg.kind + "|" + bg.src;
    const prev = bgState.get(layer);
    if (prev && prev.key === key && layer.firstElementChild) {
      applyBackgroundSettings(layer, layer.firstElementChild, bg, preview);
      return;
    }

    const oldEls = [...layer.children];
    const oldState = prev;
    const state = { key };
    bgState.set(layer, state);
    const stale = () => bgState.get(layer) !== state;

    let el;
    if (bg.kind === "color") {
      el = document.createElement("div");
      el.style.background = bg.src;
    } else if (bg.kind === "input") {
      const inp = bg.input || {};
      if (preview || inp.media !== "video" || inp.ndi || !window.CamSource) {
        el = document.createElement("div");
        el.style.cssText =
          "display:flex;align-items:center;justify-content:center;background:#0b2a5a;" +
          "color:#9db4d8;font:12px sans-serif;text-align:center;padding:4px;";
        el.textContent = "Input: " + (inp.name || "Video");
      } else {
        el = document.createElement("img");
        attachCam(el, inp.label, stale);
      }
    } else {
      el = document.createElement(bg.kind === "video" ? "video" : "img");
      if (bg.kind === "video") {
        el.playsInline = true;
        if (preview) {
          el.muted = true;
          el.preload = manual ? "auto" : "metadata";
        } else {
          el.autoplay = true;
          el.preload = "auto";
        }
      }
      el.addEventListener("error", () => {
        if (!stale()) resetBackground(layer);
      });
      const url = toUrl(bg.src);
      el.src = bg.kind === "video" && preview ? url + "#t=0.1" : url;
    }
    if (!el) {
      el = document.createElement("div");
      el.style.background = "#111";
    }
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.opacity = "0";
    layer.appendChild(el);
    applyBackgroundSettings(layer, el, bg, preview);

    const finish = () => {
      if (stale()) return;
      el.style.opacity = "";
      const disposeOld = () => {
        if (oldState && oldState.dispose) oldState.dispose();
      };
      const drop = () => {
        oldEls.forEach((o) => {
          stopVideos(o);
          o.remove();
        });
        disposeOld();
      };

      const fx = FX[T.bg];
      if (preview || !fx || !T.msBg || !oldEls.length) {
        afterPaint().then(() => {
          if (!stale()) drop();
        });
        return;
      }

      layer.style.overflow = "hidden";
      if (fx.dip) {
        dipTransition(layer, oldEls, el, T.msBg, stale).then((done) => {
          if (done) disposeOld();
        });
        return;
      }
      const jobs = [play(el, fx.in, T.msBg, fx.ein)];
      if (fx.out)
        oldEls.forEach((o) => jobs.push(play(o, fx.out, T.msBg, fx.eout)));
      Promise.all(jobs).then(() => {
        if (stale()) return;
        el.getAnimations().forEach((a) => a.cancel());
        drop();
      });
    };

    Promise.race([
      el.tagName === "VIDEO" || el.tagName === "IMG"
        ? readyMedia(el)
        : Promise.resolve(),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(finish);
  }

  window.SlideRenderer = {
    renderSlide,
    fitStage,
    renderThumbnail,
    renderBackground,
    fillText,
    TEXT_DEFAULTS,
    applyLayerBox,
    ROTATION_SIGN,
    setTransition,
    getTransition: () => ({ ...T }),
  };
})();
