(function () {
  const { listen, emit } = window.__TAURI__.event;
  const dB2g = (db) => Math.pow(10, db / 20);

  let ctx = null;
  const bundles = new Map(); // stripId -> node graph, atau { error, active }

  async function open(s) {
    const list = await window.InputPlayer.listDevices();
    const id = window.InputPlayer.find(list, "audioinput", s.cfg.deviceId, s.cfg.label);
    if (!id) throw new Error("perangkat tidak ditemukan: " + (s.cfg.label || s.name));
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const nCh = Math.max(1, stream.getAudioTracks()[0].getSettings().channelCount || 2);
    const src = ctx.createMediaStreamSource(stream);
    const split = ctx.createChannelSplitter(nCh);
    const merge = ctx.createChannelMerger(nCh);
    const chGain = Array.from({ length: nCh }, () => ctx.createGain());
    const delay = ctx.createDelay(5);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    src.connect(split);
    chGain.forEach((g, i) => { split.connect(g, i); g.connect(merge, 0, i); });
    merge.connect(delay).connect(gain);
    gain.connect(analyser);
    gain.connect(ctx.destination);
    return { stream, src, chGain, delay, gain, analyser, active: false };
  }

  function dispose(b) {
    if (!b || b.error) return;
    b.stream.getTracks().forEach((t) => t.stop());
    try { b.src.disconnect(); b.gain.disconnect(); } catch {}
  }

  function apply(s, b) {
    const t = ctx.currentTime;
    b.delay.delayTime.value = (s.cfg.delay || 0) / 1000;
    b.chGain.forEach((g, i) => g.gain.setTargetAtTime((s.cfg.channels?.[i] ?? true) ? 1 : 0, t, 0.01));

    const target = s.active ? dB2g(s.volume) : 0;
    const g = b.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (s.active !== b.active) {
      // nyala/mati: pakai "Input Audio Transition Duration"
      g.linearRampToValueAtTime(target, t + Math.max(0.01, s.cfg.transition ?? 1));
    } else {
      g.setTargetAtTime(target, t, 0.03); // geser fader: responsif, tanpa transisi panjang
    }
    b.active = s.active;
  }

  async function sync(list) {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const ids = new Set(list.map((s) => s.id));
    for (const [id, b] of bundles) {
      if (!ids.has(id)) { dispose(b); bundles.delete(id); }
    }
    for (const s of list) {
      let b = bundles.get(s.id);
      if (b && b.error) {
        if (b.active === s.active) continue; // sudah gagal; coba lagi hanya jika toggle berubah
        bundles.delete(s.id);
        b = null;
      }
      if (!b) {
        if (!s.active) continue; // buka perangkat hanya saat pertama kali dibutuhkan
        try {
          b = await open(s);
        } catch (err) {
          bundles.set(s.id, { error: true, active: s.active });
          emit("mixer-error", { id: s.id, message: String(err.message || err) }).catch(() => {});
          continue;
        }
        bundles.set(s.id, b);
      }
      apply(s, b);
    }
  }

  // Antrian: selalu proses snapshot terbaru, jangan menumpuk.
  let latest = null;
  let busy = false;
  async function request(list) {
    latest = list;
    if (busy) return;
    busy = true;
    try {
      while (latest) {
        const l = latest;
        latest = null;
        await sync(l);
      }
    } finally {
      busy = false;
    }
  }

  // Meter level -> jendela control
  const buf = new Float32Array(512);
  setInterval(() => {
    if (!bundles.size) return;
    const out = {};
    for (const [id, b] of bundles) {
      if (!b.analyser) continue;
      b.analyser.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
      out[id] = p;
    }
    emit("mixer-levels", out).catch(() => {});
  }, 80);

  listen("mixer-state-event", (e) => request(Array.isArray(e.payload) ? e.payload : []));
})();