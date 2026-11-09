(function () {
  const started = new Set(); // kamera yang dimulai dari jendela ini
  const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

  window.CamSource = {
    async url(name) {
      const u = await invoke("cam_start", { name }); // idempoten di Rust
      started.add(name);
      return u;
    },
    release(name) {
      started.delete(name);
      return invoke("cam_stop", { name }).catch(() => {});
    },
    // wanted: Set<string>. Hanya dipanggil dari jendela control.
    sync(wanted) {
      for (const n of [...started]) if (!wanted.has(n)) this.release(n);
    },
  };
})();