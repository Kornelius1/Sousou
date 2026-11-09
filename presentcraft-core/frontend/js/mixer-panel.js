import { $, setStatus } from "./utils.js";
import * as M from "./mixer-state.js";

const { listen } = window.__TAURI__.event;
const MODE = { off: "Off", on: "On", autoon: "Auto On", autooff: "Auto Off" };
const rows = new Map();
let sig = "";

function buildRow(s) {
  const r = document.createElement("div");
  r.className = "mx-row";
  r.innerHTML = `
    <button class="mx-on" title="Nyalakan / matikan"><i class="fa-solid"></i></button>
    <div class="mx-main">
      <div class="mx-top"><span class="mx-name"></span><small class="mx-mode"></small></div>
      <div class="mx-meter"><i></i></div>
      <input class="mx-vol" type="range" min="-60" max="6" step="0.5" />
    </div>
    <output class="mx-db"></output>
    <button class="mx-rm" title="Hapus dari mixer"><i class="fa-solid fa-xmark"></i></button>`;
  const cur = () => M.getStrips().find((x) => x.id === s.id);
  r.querySelector(".mx-on").onclick = () => { const c = cur(); if (c) M.setEnabled(s.id, !c.active); };
  r.querySelector(".mx-vol").oninput = (e) => M.setVolume(s.id, e.target.value);
  r.querySelector(".mx-rm").onclick = () => M.removeStrip(s.id);
  return r;
}

function paint(s) {
  const r = rows.get(s.id);
  r.classList.toggle("active", s.active);
  r.querySelector(".mx-name").textContent = s.name;
  r.querySelector(".mx-mode").textContent = MODE[s.cfg.mode] || "";
  const b = r.querySelector(".mx-on");
  b.disabled = s.cfg.mode === "on";
  b.firstChild.className = "fa-solid " + (s.active ? "fa-volume-high" : "fa-volume-xmark");
  const rng = r.querySelector(".mx-vol");
  if (document.activeElement !== rng) rng.value = s.volume; // jangan rebut slider yang sedang digeser
  r.querySelector(".mx-db").textContent = s.volume.toFixed(1) + " dB";
  if (!s.active) r.querySelector(".mx-meter i").style.transform = "scaleX(0)";
}

function render(list) {
  const nextSig = list.map((s) => s.id).join(",");
  if (nextSig !== sig) { // rebangun hanya jika daftar berubah, bukan saat fader digeser
    sig = nextSig;
    rows.clear();
    const box = $("mx-strips");
    box.replaceChildren(...list.map((s) => { const r = buildRow(s); rows.set(s.id, r); return r; }));
    $("mx-empty").hidden = list.length > 0;
  }
  list.forEach(paint);
}

export function initMixerPanel() {
  const dlg = $("mixer");
  $("tb-mixer").addEventListener("click", () => (dlg.open ? dlg.close() : dlg.show())); // show() = non-modal
  $("mx-close").addEventListener("click", () => dlg.close());

  M.onMixerChange(render);
  render(M.getStrips());

  listen("mixer-levels", (e) => {
    for (const [id, peak] of Object.entries(e.payload || {})) {
      const m = rows.get(id)?.querySelector(".mx-meter i");
      if (!m) continue;
      const db = peak > 0 ? 20 * Math.log10(peak) : -60;
      m.style.transform = `scaleX(${Math.min(1, Math.max(0, (db + 60) / 60))})`;
    }
  });
  listen("mixer-error", (e) => {
    const p = e.payload || {};
    const s = M.getStrips().find((x) => x.id === p.id);
    setStatus(`Mixer: ${s ? s.name : "input"} gagal dibuka (${p.message})`);
  });
}