// slide-renderer.js
// Menggambar slide (payload dari 'update-slide-event') ke elemen `stage`,
// ke thumbnail, dan menggambar background persisten.
//
// payload = { width, height, layers: [{ kind, z, rect, rotation, opacity,
//             src, inner, scale, muted, looped, text, color, style }] }
// style (teks) = { fontFamily, fontSize(px slide), color, align, valign, bold, italic }

(function () {
  const ROTATION_SIGN = -1; // jika rotasi miring ke arah salah, ubah ke 1

  const TEXT_DEFAULTS = {
    fontFamily: 'Arial, sans-serif',
    fontSize: 54,
    color: '#ffffff',
    align: 'center',   // left | center | right | justify
    valign: 'middle',  // top | middle | bottom
    bold: false,
    italic: false,
  };

  const pct = (v) => `${v}%`;

  function positionBox(el, rect) {
    el.style.position = 'absolute';
    el.style.left = pct(rect.x);
    el.style.top = pct(rect.y);
    el.style.width = pct(rect.w);
    el.style.height = pct(rect.h);
  }

  function objectFitFor(scale) {
    const s = scale || '';
    if (s.includes('STRETCH')) return 'fill';
    if (s.includes('FILL')) return 'cover';
    return 'contain';
  }

  function playSafe(el) {
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {
        el.muted = true; // autoplay bersuara bisa diblokir webview
        el.play().catch(() => {});
      });
    }
  }

  function mediaElement(layer, mode) {
    const isVideo = layer.kind === 'video';
    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = isVideo && mode ? layer.src + '#t=0.1' : layer.src;
    el.style.position = 'absolute';

    if (layer.inner) {
      positionBox(el, layer.inner);
      el.style.objectFit = 'fill';
    } else {
      positionBox(el, { x: 0, y: 0, w: 100, h: 100 });
      el.style.objectFit = objectFitFor(layer.scale);
    }

    if (isVideo) {
      el.playsInline = true;
      if (mode) {
        el.muted = true;
        el.preload = mode === 'manual' ? 'auto' : 'metadata';
        el.loop = mode === 'manual' && layer.looped === true;
      } else {
        el.loop = layer.looped === true;
        el.muted = layer.muted === true;
        el.autoplay = true;
        playSafe(el);
      }
    }
    return el;
  }
  function layerElement(layer, preview) {
    const wrap = document.createElement('div');
    positionBox(wrap, layer.rect);
    wrap.style.zIndex = String(layer.z);
    wrap.style.opacity = String(layer.opacity);
    wrap.style.transform = `rotate(${ROTATION_SIGN * (layer.rotation || 0)}deg)`;
    wrap.style.transformOrigin = '50% 50%';

    switch (layer.kind) {
      case 'video':
      case 'image':
        if (!layer.src) return null;
        wrap.appendChild(mediaElement(layer, preview));
        break;
      case 'color':
        wrap.style.background = layer.color || 'transparent';
        break;
      case 'text': {
        const st = { ...TEXT_DEFAULTS, ...(layer.style || {}) };
        wrap.style.display = 'flex';
        wrap.style.alignItems =
          st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center';
        wrap.style.fontFamily = st.fontFamily;
        wrap.style.fontSize = st.fontSize + 'px';
        wrap.style.color = st.color;
        wrap.style.fontWeight = st.bold ? '700' : '400';
        wrap.style.fontStyle = st.italic ? 'italic' : 'normal';
        const inner = document.createElement('div');
        inner.style.width = '100%';
        inner.style.textAlign = st.align;
        inner.style.whiteSpace = 'pre-line';
        inner.textContent = layer.text || '';
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

  // Ganti isi stage dengan slide baru (layar audience).
  function renderSlide(stage, payload) {
    const w = payload.width || 1366;
    const h = payload.height || 768;
    stage.replaceChildren(); // hentikan & buang video lama
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    fillStage(stage, payload, false);
    fitStage(stage);
  }

  // Skala stage agar muat di window (letterbox, di tengah).
  function fitStage(stage) {
    const w = parseFloat(stage.style.width) || 1366;
    const h = parseFloat(stage.style.height) || 768;
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `scale(${scale})`;
    stage.style.left = (window.innerWidth - w * scale) / 2 + 'px';
    stage.style.top = (window.innerHeight - h * scale) / 2 + 'px';
  }

  // Gambar slide ke dalam `host` (div) sebagai thumbnail yang mengikuti lebar host.
  // host._bg = div untuk background di belakang slide (diisi lewat renderBackground).
  function renderThumbnail(host, payload, opts) {
    const w = payload.width || 1366;
    const h = payload.height || 768;
    host.style.aspectRatio = `${w} / ${h}`;

    if (!host._bg) {
      host._bg = document.createElement('div');
      host._bg.style.cssText = 'position:absolute;inset:0;overflow:hidden;z-index:0;';
      host.appendChild(host._bg);
    }
    if (host._stage) host._stage.remove();

    const stage = document.createElement('div');
    stage.style.cssText =
      `position:absolute;left:0;top:0;z-index:1;width:${w}px;height:${h}px;transform-origin:0 0;`;
    fillStage(stage, payload, opts && opts.manual ? 'manual' : 'preview');
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
  }

  // ---------- background persisten ----------
  // bg = { src, kind: 'video'|'image'|'color', loop, mute, scale: 'fit'|'fill', opacity } | null
  // opts.preview = true: video tidak diputar (untuk thumbnail).
  const bgState = new WeakMap();

  function toUrl(path) {
    const t = window.__TAURI__;
    const conv = t && t.core && t.core.convertFileSrc;
    return conv ? conv(path) : path;
  }

  function resetBackground(layer) {
    const v = layer.querySelector('video');
    if (v) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    layer.replaceChildren();
    layer.style.opacity = '';
    bgState.delete(layer);
  }

  function applyBackgroundSettings(layer, el, bg, preview) {
    layer.style.opacity = String(bg.opacity);
    if (bg.kind === 'color') return;
    el.style.objectFit = bg.scale === 'fit' ? 'contain' : 'cover';
    if (bg.kind === 'video') {
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

    const key = bg.kind + '|' + bg.src;
    const prev = bgState.get(layer);
    if (prev && prev.key === key && layer.firstElementChild) {
      applyBackgroundSettings(layer, layer.firstElementChild, bg, preview);
      return;
    }

    resetBackground(layer);
    const state = { key };
    bgState.set(layer, state);

    let el;
    if (bg.kind === 'color') {
      el = document.createElement('div');
      el.style.background = bg.src;
    } else {
      el = document.createElement(bg.kind === 'video' ? 'video' : 'img');
      if (bg.kind === 'video') {
        el.playsInline = true;
        if (preview) {
          el.muted = true;
          el.preload = manual ? 'auto' : 'metadata'; 
        } else {
          el.autoplay = true;
          el.preload = 'auto';
        }
      }
      el.addEventListener('error', () => {
        if (bgState.get(layer) === state) resetBackground(layer);
      });
      const url = toUrl(bg.src);
      el.src = bg.kind === 'video' && preview ? url + '#t=0.1' : url;
    }
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';

    layer.appendChild(el);
    applyBackgroundSettings(layer, el, bg, preview);
  }

  window.SlideRenderer = {
    renderSlide, fitStage, renderThumbnail, renderBackground, TEXT_DEFAULTS,
  };
})();