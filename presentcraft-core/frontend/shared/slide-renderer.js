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
          res(); // belum ada sumber (mis. kamera live)
        else if (el.decode) el.decode().then(res, res);
        else if (el.complete) res();
        else el.onload = el.onerror = res;
      } else if (el.readyState >= 2) res();
      else {
        el.addEventListener("loadeddata", res, { once: true });
        el.addEventListener("error", res, { once: true });
      }
    });

  const stopVideos = (root) => {
    const list =
      root.tagName === "VIDEO" ? [root] : [...root.querySelectorAll("video")];
    list.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
  };

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
      el.dataset.live = "1";
      el.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${objectFitFor(layer.scale)};`;
      window.CamSource.url(inp.label)
        .then((u) => {
          el.src = u;
        })
        .catch((err) => console.warn("Input gagal dibuka:", err));
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
        inner.textContent = layer.text || "";
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

  // Layar audience: siapkan slide baru di luar layar, tukar setelah media siap.
  let renderSeq = 0;
  async function renderSlide(stage, payload) {
    const seq = ++renderSeq;
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
    if (seq !== renderSeq) {
      stopVideos(next); // sudah ada slide yang lebih baru
      return;
    }

    stopVideos(stage); // hentikan video lama sebelum dibuang
    stage.replaceChildren(...next.childNodes);
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    fitStage(stage);
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

  // Thumbnail: stage baru ditukar setelah media siap, supaya tidak ada jeda kosong (kedip).
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
      if (host._seq !== seq) return; // render yang lebih baru yang akan membersihkan
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
    const v = layer.querySelector("video");
    if (v) {
      v.pause();
      v.srcObject = null;
      v.removeAttribute("src");
      v.load();
    }
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
        el.dataset.live = "1";
        window.CamSource.url(inp.label)
          .then((u) => {
            if (bgState.get(layer) === state) el.src = u;
          })
          .catch((err) => {
            console.warn("Input gagal dibuka:", err);
            if (bgState.get(layer) === state) resetBackground(layer);
          });
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
        if (bgState.get(layer) === state) resetBackground(layer);
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
    const fade = (opts && opts.fade) || 0; // ms; 0 = tukar langsung
    // Elemen baru ada di atas yang lama. Video yang belum punya frame transparan,
    // jadi yang lama tetap terlihat sampai frame pertama yang baru tergambar.
    el.style.opacity = fade ? "0" : "";
    layer.appendChild(el);
    applyBackgroundSettings(layer, el, bg, preview);

    const painted = () =>
      new Promise((res) => {
        const twoFrames = () =>
          requestAnimationFrame(() => requestAnimationFrame(res));
        if (el.tagName === "VIDEO" && el.requestVideoFrameCallback) {
          el.requestVideoFrameCallback(twoFrames);
          setTimeout(res, 800); // video tidak jalan: jangan menunggu selamanya
        } else twoFrames();
      });

    const finish = () => {
      if (bgState.get(layer) !== state) return; // sudah ada background yang lebih baru
      if (fade) {
        el.style.transition = `opacity ${fade}ms ease`;
        el.style.opacity = "";
      }
      setTimeout(() => {
        if (bgState.get(layer) !== state) return;
        oldEls.forEach((o) => {
          stopVideos(o);
          o.remove();
        });
        if (oldState && oldState.dispose) oldState.dispose();
      }, fade);
    };

    const isMedia = el.tagName === "VIDEO" || el.tagName === "IMG";
    Promise.race([
      isMedia
        ? readyMedia(el).then(() => (preview ? null : painted()))
        : Promise.resolve(),
      new Promise((r) => setTimeout(r, preview ? 1500 : 5000)),
    ]).then(finish);
  }

  window.SlideRenderer = {
    renderSlide,
    fitStage,
    renderThumbnail,
    renderBackground,
    TEXT_DEFAULTS,
    applyLayerBox,
    ROTATION_SIGN,
  };
})();
