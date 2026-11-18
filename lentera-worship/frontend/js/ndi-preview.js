// Satu aliran NDI untuk preview, dibagi ke semua <canvas> yang sedang terpasang.
const { Channel, invoke } = window.__TAURI__.core;

let name = null;
let gen = 0;
let busy = false;
let stopTimer = 0;
const canvases = new Set();

function scheduleStop() {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(stopNdiPreview, 1500);
}

function draw(bmp) {
  for (const c of canvases) {
    if (!c.isConnected) {
      canvases.delete(c);
      continue;
    }
    if (c.width !== bmp.width) c.width = bmp.width;
    if (c.height !== bmp.height) c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
  }
  if (!canvases.size) scheduleStop();
}

async function begin(n) {
  const my = ++gen;
  const ch = new Channel();
  ch.onmessage = async (buf) => {
    if (my !== gen || busy) return; // lewati frame jika decode sebelumnya belum selesai
    busy = true;
    try {
      const bmp = await createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
      if (my === gen) draw(bmp);
      bmp.close();
    } catch {
      /* frame rusak, abaikan */
    } finally {
      busy = false;
    }
  };
  try {
    await invoke("ndi_preview_start", { name: n, onFrame: ch });
  } catch (e) {
    console.warn("NDI preview gagal:", e);
    if (my === gen) name = null;
  }
}

/** Pasang canvas ke sumber NDI. Aman dipanggil berulang untuk sumber yang sama. */
export function attachNdi(sourceName, canvas) {
  clearTimeout(stopTimer);
  if (sourceName !== name) {
    canvases.clear();
    name = sourceName;
    begin(sourceName);
  }
  canvases.add(canvas);
}

export function stopNdiPreview() {
  clearTimeout(stopTimer);
  gen++;
  name = null;
  canvases.clear();
  invoke("ndi_preview_stop").catch(() => {});
}