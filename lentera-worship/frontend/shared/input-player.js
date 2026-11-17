(function () {
  const dB2g = (db) => Math.pow(10, db / 20);

  async function listDevices() {
    let list = await navigator.mediaDevices.enumerateDevices();
    if (list.some((d) => !d.label)) { // label kosong sebelum izin diberikan
      try {
        (await navigator.mediaDevices.getUserMedia({ audio: true, video: true }))
          .getTracks().forEach((t) => t.stop());
      } catch {}
      list = await navigator.mediaDevices.enumerateDevices();
    }
    return list;
  }
  const find = (list, kind, id, label) =>
    (list.find((d) => d.kind === kind && d.deviceId === id) ||
      list.find((d) => d.kind === kind && label && d.label === label))?.deviceId;

  async function mount(videoEl, cfg) {
    const list = await listDevices();
    const tracks = [];
    let ctx = null;
    const dispose = () => {
      tracks.forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      videoEl.srcObject = null;
    };
    try {
      const vid = find(list, 'videoinput', cfg.deviceId, cfg.label);
      const mic = find(list, 'audioinput', cfg.audioId, cfg.audioLabel);
      const stream = new MediaStream();

      if (vid) {
        const v = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: vid } },
        });
        v.getTracks().forEach((t) => { tracks.push(t); stream.addTrack(t); });
      }
      if (mic) {
        const a = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: mic }, echoCancellation: false,
                   noiseSuppression: false, autoGainControl: false },
        });
        a.getTracks().forEach((t) => tracks.push(t));
        ctx = new AudioContext();
        const delay = ctx.createDelay(5);
        delay.delayTime.value = (cfg.delay || 0) / 1000;
        const gain = ctx.createGain();
        gain.gain.value = dB2g(cfg.volume || 0);
        ctx.createMediaStreamSource(a).connect(delay).connect(gain).connect(ctx.destination);
        ctx.resume().catch(() => {});
      }
      videoEl.srcObject = stream; // hanya video; audio lewat AudioContext
      await videoEl.play().catch(() => {});
      return dispose;
    } catch (e) {
      dispose();
      throw e;
    }
  }

  window.InputPlayer = { mount, listDevices, find };//baris terakhir
})();

