(function () {
  const started = new Set(); // kamera yang dimulai dari jendela ini
  const timers = new Map();  // nama -> timer penutupan tertunda
  const GRACE_MS = 2000;
  const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

  const cancel = (name) => {
    clearTimeout(timers.get(name));
    timers.delete(name);
  };

  window.CamSource = {
    async url(name) {
      cancel(name); // ada yang meminta lagi: batalkan penutupan
      const u = await invoke("cam_start", { name }); // idempoten di Rust
      started.add(name);
      return u;
    },
    release(name) {
      cancel(name);
      started.delete(name);
      return invoke("cam_stop", { name }).catch(() => {});
    },
    // wanted: Set<string>. Hanya dipanggil dari jendela control.
    sync(wanted) {
      for (const n of [...started]) {
        if (wanted.has(n)) {
          cancel(n); // dibutuhkan lagi
        } else if (!timers.has(n)) {
          timers.set(n, setTimeout(() => this.release(n), GRACE_MS));
        }
      }
    },
  };
})();