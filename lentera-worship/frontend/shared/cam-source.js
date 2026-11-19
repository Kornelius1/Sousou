(function () {
  const started = new Set(); // kamera yang dimulai dari jendela ini
  const timers = new Map(); // nama -> timer penutupan tertunda
  const GRACE_MS = 2000;
  const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

  const cancel = (name) => {
    clearTimeout(timers.get(name));
    timers.delete(name);
  };

  window.CamSource = {
    async url(name) {
      cancel(name);
      const u = await invoke("cam_start", { name });
      started.add(name);
      return u;
    },
    release(name) {
      cancel(name);
      started.delete(name);
      return invoke("cam_stop", { name }).catch(() => {});
    },
    sync(wanted) {
      for (const n of [...started]) {
        if (wanted.has(n)) {
          cancel(n);
        } else if (!timers.has(n)) {
          timers.set(
            n,
            setTimeout(() => this.release(n), GRACE_MS),
          );
        }
      }
    },
  };

  let ndiSeq = 0;
  const ndiStreams = new Map(); // "sumber|lebar" -> stream bersama

  window.NdiSource = {
    attach(imgEl, sourceName, { width = 1280 } = {}) {
      const t = window.__TAURI__;
      if (!t || !t.core || !sourceName) return () => {};

      const key = `${sourceName}|${width}`;
      let s = ndiStreams.get(key);

      if (s) {
        clearTimeout(s.timer);
      } else {
        s = {
          slot: `ndi-${++ndiSeq}`,
          subs: new Set(),
          lastUrl: null,
          timer: 0,
        };
        ndiStreams.set(key, s);
        const stream = s;
        const ch = new t.core.Channel();

        ch.onmessage = (buf) => {
          if (ndiStreams.get(key) !== stream) return;
          const url = URL.createObjectURL(
            new Blob([buf], { type: "image/jpeg" }),
          );
          for (const el of stream.subs)
            if (el.dataset.dead !== "1") el.src = url;
          if (stream.lastUrl) URL.revokeObjectURL(stream.lastUrl);
          stream.lastUrl = url;
        };

        invoke("ndi_preview_start", {
          name: sourceName,
          width,
          slot: stream.slot,
          onFrame: ch,
        })
          .then(() => {
            if (ndiStreams.get(key) !== stream)
              invoke("ndi_preview_stop", { slot: stream.slot }).catch(() => {});
          })
          .catch((err) => {
            console.warn("Failed to open NDI:", err);
            if (ndiStreams.get(key) === stream) ndiStreams.delete(key);
          });
      }

      s.subs.add(imgEl);
      if (s.lastUrl) imgEl.src = s.lastUrl; // tampilkan frame terakhir langsung

      const stream = s;
      return () => {
        stream.subs.delete(imgEl);
        if (stream.subs.size) return;
        stream.timer = setTimeout(() => {
          if (stream.subs.size || ndiStreams.get(key) !== stream) return;
          ndiStreams.delete(key);
          if (stream.lastUrl) URL.revokeObjectURL(stream.lastUrl);
          invoke("ndi_preview_stop", { slot: stream.slot }).catch(() => {});
        }, 1500);
      };
    },
  };
})();
