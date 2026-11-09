import { invoke } from "./tauri.js";
import { syncCamsSoon } from "./cam-usage.js";

const $ = (id) => document.getElementById(id);
const dB2g = (db) => Math.pow(10, db / 20);
const dlg = $("inputs-dlg");

const drafts = { video: [], audio: [] };
const runtime = new Map(); // id -> { stream, audioStream, src, delay, master, ... }
let tab = "video",
  selId = null,
  nextId = 1,
  onDone = null;
let transition = 1.0;
let devs = { cams: [], mics: [] };
let ac;
const audioCtx = () => (ac ??= new AudioContext());
const cur = () => drafts[tab].find((i) => i.id === selId);

/* ---------- Device ---------- */
async function listDevices() {
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true }))
      .getTracks()
      .forEach((t) => t.stop());
  } catch {}
  const d = await navigator.mediaDevices.enumerateDevices();
  const cams = (await invoke("cam_list").catch(() => [])).map((c) => ({
    deviceId: c.name,
    label: c.name,
    kind: "videoinput",
  }));
  return { cams, mics: d.filter((x) => x.kind === "audioinput") };
}

const fill = (sel, list, first) => {
  sel.innerHTML =
    (first ? `<option value="">${first}</option>` : "") +
    list
      .map((d) => `<option value="${d.deviceId}">${d.label || d.kind}</option>`)
      .join("");
};

/* ---------- Buka dialog ---------- */
export async function openInputDialog(kind, done, kinds = ["video", "audio"]) {
  onDone = done;
  drafts.video = [];
  drafts.audio = [];
  selId = null;
  devs = await listDevices();
  fill($("v-device"), devs.cams, "— Select Device —");
  fill($("v-audio"), devs.mics, "- No Audio Source -");
  fill($("a-device"), devs.mics, "- No Audio Source -");
  for (const k of ["video", "audio"])
    document.querySelector(`.in-tabs [data-tab=${k}]`).hidden =
      !kinds.includes(k);
  switchTab(kind);
  if (!drafts[kind].length) addDraft();
  dlg.showModal();
  ndiRefresh();
}

function switchTab(t) {
  tab = t;
  document
    .querySelectorAll(".in-tabs button")
    .forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $("in-video").hidden = t !== "video";
  $("in-audio").hidden = t !== "audio";
  selId = drafts[t][0]?.id ?? null;
  renderList();
  loadFields();
  const nb = $("in-ndi-box");
  if (nb && ndiEnabled) nb.hidden = t !== "video";
}
document
  .querySelectorAll(".in-tabs button")
  .forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

function renderList() {
  $("in-items").innerHTML = drafts[tab]
    .map(
      (i) =>
        `<li data-id="${i.id}" class="${i.id === selId ? "sel" : ""}">${i.name}</li>`,
    )
    .join("");
  $("in-items")
    .querySelectorAll("li")
    .forEach(
      (li) =>
        (li.onclick = () => {
          selId = +li.dataset.id;
          renderList();
          loadFields();
        }),
    );
}

function addDraft() {
  const id = nextId++,
    n = drafts[tab].length + 1;
  const it =
    tab === "video"
      ? {
          id,
          kind: "video",
          name: `Input ${n}`,
          deviceId: "",
          format: "SDR",
          audioId: "",
          delay: 0,
          volume: 0,
        }
      : {
          id,
          kind: "audio",
          name: `Input ${n}`,
          deviceId: "",
          mode: "off",
          delay: 0,
          volume: 0,
          channels: [true, true],
        };
  drafts[tab].push(it);
  selId = id;
  renderList();
  loadFields();
}
$("in-add").onclick = addDraft;

$("in-rm").onclick = () => {
  const it = cur();
  if (!it) return;
  teardown(it.id);
  drafts[tab] = drafts[tab].filter((i) => i !== it);
  selId = drafts[tab][0]?.id ?? null;
  renderList();
  loadFields();
};

/* ---------- Field <-> model ---------- */
const HINT = {
  off: "Off until manually enabled",
  on: "Always on",
  autooff: "On until the video input is hidden",
  autoon: "On when the video input is shown",
};

let ndiEnabled = false;

function chooseCam(it, d) {
  it.deviceId = d.deviceId;
  if (/^Input \d+$/.test(it.name) && d.label) it.name = d.label;
  renderList();
  loadFields();
  apply(it);
}

function renderPicker(it) {
  const box = $("in-pick");
  const need =
    tab === "video" && !!it && !it.deviceId && !it.ndi && !it.pickNdi;
  box.hidden = !need;
  if (!need) return;
  box.replaceChildren();
  const p = document.createElement("p");
  p.textContent = devs.cams.length
    ? "Pilih sumber video"
    : "Tidak ada kamera terdeteksi";
  box.append(p);
  const add = (icon, label, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    const i = document.createElement("i");
    i.className = "fa-solid " + icon;
    const s = document.createElement("span");
    s.textContent = label;
    b.append(i, s);
    b.onclick = fn;
    box.append(b);
  };
  devs.cams.forEach((d) =>
    add("fa-video", d.label || "Kamera", () => chooseCam(it, d)),
  );
  if (ndiEnabled)
    add("fa-network-wired", "NDI (sumber di jaringan)", () => {
      it.pickNdi = true;
      loadFields();
    });
}

function loadFields() {
  const it = cur();
  renderPicker(it);
  document
    .querySelectorAll("#inputs-dlg section input, #inputs-dlg section select")
    .forEach((e) => (e.disabled = !it));
  if (!it) {
    $("in-res").textContent = "";
    showCam("");
    return;
  }
  if (tab === "video") {
    $("v-name").value = it.name;
    $("v-device").value = it.deviceId;
    $("v-audio").value = it.audioId;
    $("v-delay").value = it.delay;
    $("v-vol").value = it.volume;
    $("v-vol-o").value = it.volume + "dB";
    $("v-format").textContent = it.format;
    showCam(runtime.get(it.id)?.url ?? "");
  } else {
    $("a-name").value = it.name;
    $("a-device").value = it.deviceId;
    $("a-delay").value = it.delay;
    $("a-vol").value = it.volume;
    $("a-vol-o").value = it.volume + "dB";
    document
      .querySelectorAll("#a-mode button")
      .forEach((b) => b.classList.toggle("on", b.dataset.m === it.mode));
    $("a-mode-hint").textContent = HINT[it.mode];
    renderChannels(it);
  }
}
function renderChannels(it) {
  $("a-channels").innerHTML = it.channels
    .map(
      (on, i) =>
        `<label><input type="checkbox" data-ch="${i}" ${on ? "checked" : ""}/> ${i + 1}</label>`,
    )
    .join(" ");
  $("a-channels")
    .querySelectorAll("input")
    .forEach(
      (c) =>
        (c.onchange = () => {
          it.channels[+c.dataset.ch] = c.checked;
          applyGains(it);
        }),
    );
}
$("a-ch-all").onclick = (e) => {
  e.preventDefault();
  const it = cur();
  if (!it) return;
  it.channels.fill(true);
  renderChannels(it);
  applyGains(it);
};
$("a-ch-none").onclick = (e) => {
  e.preventDefault();
  const it = cur();
  if (!it) return;
  it.channels.fill(false);
  renderChannels(it);
  applyGains(it);
};

const bind = (id, key, parse = (v) => v, after) => {
  const h = (e) => {
    const it = cur();
    if (!it) return;
    it[key] = parse(e.target.value);
    if (key === "name") renderList();
    after?.(it);
  };
  $(id).addEventListener("input", h);
  $(id).addEventListener("change", h);
};

bind("v-name", "name");
bind("a-name", "name");
bind(
  "v-device",
  "deviceId",
  (v) => v,
  (it) => {
    const d = devs.cams.find((x) => x.deviceId === it.deviceId);
    if (/^Input \d+$/.test(it.name) && d?.label) it.name = d.label;
    renderList();
    loadFields();
    apply(it);
  },
);
bind("a-device", "deviceId", (v) => v, apply);
bind("v-audio", "audioId", (v) => v, apply);
bind("v-delay", "delay", Number, applyDelay);
bind("a-delay", "delay", Number, applyDelay);
bind("v-vol", "volume", Number, (it) => {
  $("v-vol-o").value = it.volume + "dB";
  applyGains(it);
});
bind("a-vol", "volume", Number, (it) => {
  $("a-vol-o").value = it.volume + "dB";
  applyGains(it);
});
document.querySelectorAll("#a-mode button").forEach(
  (b) =>
    (b.onclick = () => {
      const it = cur();
      if (!it) return;
      it.mode = b.dataset.m;
      loadFields();
      applyGains(it);
    }),
);
$("in-trans").oninput = (e) => {
  transition = +e.target.value;
  $("in-trans-o").value = transition.toFixed(1).replace(".", ",") + "s";
};

/* ---------- Selesai / batal ---------- */
const labelOf = (list, id) => list.find((d) => d.deviceId === id)?.label ?? "";
function toConfig(it) {
  const v = it.kind === "video";
  return {
    media: it.kind,
    name: it.name,
    deviceId: it.deviceId,
    label: labelOf(v ? devs.cams : devs.mics, it.deviceId),
    audioId: it.audioId ?? "",
    audioLabel: labelOf(devs.mics, it.audioId),
    delay: it.delay,
    volume: it.volume,
    mode: it.mode ?? "off",
    channels: it.channels ?? [true, true],
    transition,
    ndi: it.ndi ?? null,
  };
}
$("in-close").onclick = async () => {
  const done = onDone;
  onDone = null;
  const configs = [];
  for (const k of ["video", "audio"])
    for (const it of drafts[k]) configs.push(toConfig(it));

  [...runtime.keys()].forEach(teardown);
  showCam("");
  dlg.close();

  await new Promise((r) => setTimeout(r, 150));
  configs.forEach((c) => done?.(c));
};
$("in-cancel").onclick = () => dlg.close(); // event "close" membersihkan kamera/mic dan onDone
// dipicu juga oleh Esc: matikan kamera/mic di jendela control
dlg.addEventListener("close", () => {
  [...runtime.keys()].forEach(teardown);
  showCam("");
  onDone = null;
  syncCamsSoon();
});

/* ---------- Runtime preview (hanya selama dialog terbuka) ---------- */
function teardown(id) {
  const r = runtime.get(id);
  if (!r) return;
  r.stream?.getTracks().forEach((t) => t.stop());
  r.audioStream?.getTracks().forEach((t) => t.stop());
  r.src?.disconnect();
  r.master?.disconnect();
  runtime.delete(id);
}

function showCam(url) {
  const img = $("in-preview-img");
  img.src = url || "";
  img.hidden = !url;
}

async function apply(it) {
  teardown(it.id);
  const r = {};
  runtime.set(it.id, r);
  try {
    if (it.kind === "video" && it.deviceId) {
      r.url = await window.CamSource.url(it.deviceId);
      $("in-res").textContent = "Live";
      if (selId === it.id) showCam(r.url);
    }
    const micId = it.kind === "video" ? it.audioId : it.deviceId;
    if (micId) {
      const ctx = audioCtx();
      r.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: micId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const nCh = Math.max(
        1,
        r.audioStream.getAudioTracks()[0].getSettings().channelCount || 2,
      );
      if (it.kind === "audio")
        it.channels = Array.from(
          { length: nCh },
          (_, i) => it.channels[i] ?? true,
        );
      r.src = ctx.createMediaStreamSource(r.audioStream);
      r.split = ctx.createChannelSplitter(nCh);
      r.merge = ctx.createChannelMerger(nCh);
      r.chGain = Array.from({ length: nCh }, () => ctx.createGain());
      r.delay = ctx.createDelay(5);
      r.master = ctx.createGain();
      r.src.connect(r.split);
      r.chGain.forEach((g, i) => {
        r.split.connect(g, i);
        g.connect(r.merge, 0, i);
      });
      r.merge.connect(r.delay).connect(r.master); // sengaja TIDAK ke destination: preview tanpa suara
      applyDelay(it);
      applyGains(it, true);
      if (it.kind === "audio") renderChannels(it);
    }
  } catch (err) {
    console.warn("Input gagal dibuka:", err);
    const why =
      {
        NotReadableError: "perangkat sedang dipakai / tidak tersedia",
        NotAllowedError: "izin ditolak",
        NotFoundError: "perangkat tidak ditemukan",
        OverconstrainedError: "perangkat tidak cocok",
      }[err.name] ||
      err.name ||
      "error";
    if (selId === it.id) $("in-res").textContent = "Gagal membuka: " + why;
  }
}

function applyDelay(it) {
  const r = runtime.get(it.id);
  if (r?.delay) r.delay.delayTime.value = it.delay / 1000;
}
function applyGains(it, instant = false) {
  const r = runtime.get(it.id);
  if (!r?.master) return;
  const active = it.kind === "audio" ? it.mode === "on" : true;
  const t = audioCtx().currentTime,
    d = instant ? 0 : transition;
  r.master.gain.cancelScheduledValues(t);
  r.master.gain.setValueAtTime(r.master.gain.value, t);
  r.master.gain.linearRampToValueAtTime(active ? dB2g(it.volume) : 0, t + d);
  r.chGain?.forEach((g, i) =>
    g.gain.setTargetAtTime((it.channels?.[i] ?? true) ? 1 : 0, t, 0.01),
  );
}

/* ---------- NDI ---------- */
const NDI_NOTE =
  '<small style="color:#888">NDI® is a registered trademark of Vizrt NDI AB. ' +
  '<a href="#" id="in-ndi-site">ndi.video</a></small>';

async function ndiRefresh() {
  const box = $("in-ndi-box");
  if (!box) return;
  let st;
  try {
    st = await invoke("ndi_status");
  } catch {
    st = { enabled: false, installed: false };
  }

  if (!st.enabled) {
    ndiEnabled = false;
    box.hidden = true;
    renderPicker(cur());
    return;
  }
  ndiEnabled = true;
  box.hidden = tab !== "video";
  renderPicker(cur());

  if (!st.installed) {
    box.innerHTML = `
      <b>NDI Input</b>
      <small>Untuk memakai sumber NDI, pasang NDI Tools (gratis) sekali saja:</small>
      <ol style="margin:0;padding-left:18px;font-size:12px;color:#bbb">
        <li>Klik <b>Unduh NDI Tools</b></li>
        <li>Pasang seperti biasa (Next → Install)</li>
        <li>Kembali ke sini, otomatis terdeteksi</li>
      </ol>
      <div style="display:flex;gap:6px">
        <button id="in-ndi-dl">Unduh NDI Tools</button>
        <button id="in-ndi-recheck">Periksa lagi</button>
      </div>${NDI_NOTE}`;
    $("in-ndi-dl").onclick = () => invoke("ndi_open_download").catch(() => {});
    $("in-ndi-recheck").onclick = ndiRefresh;
  } else {
    box.innerHTML = `
      <b>NDI Input <span style="color:#3c9;font-weight:normal">● terpasang</span></b>
      <div style="display:flex;gap:6px">
        <select id="in-ndi-list" style="flex:1"></select>
        <button id="in-ndi-scan">Cari</button>
      </div>${NDI_NOTE}`;
    $("in-ndi-scan").onclick = ndiScan;
    ndiScan();
  }
  const site = $("in-ndi-site");
  if (site)
    site.onclick = (e) => {
      e.preventDefault();
      invoke("ndi_open_download").catch(() => {});
    };
}

async function ndiScan() {
  const sel = $("in-ndi-list");
  if (!sel) return;
  sel.innerHTML = '<option value="">Mencari sumber NDI…</option>';
  try {
    const list = await invoke("ndi_discover");
    const it = cur();
    sel.innerHTML =
      '<option value="">- Tidak dipakai -</option>' +
      list.map((s) => `<option value="${s.name}">${s.name}</option>`).join("");
    if (!list.length)
      sel.options[0].textContent = "Tidak ada sumber NDI di jaringan";
    sel.value = it?.ndi ?? "";
    sel.onchange = () => {
      const c = cur();
      if (c) c.ndi = sel.value || null;
    };
  } catch (e) {
    sel.innerHTML = `<option value="">Gagal: ${String(e)}</option>`;
  }
}

// Pengguna kembali dari installer -> deteksi otomatis
window.addEventListener("focus", () => {
  if (dlg.open) ndiRefresh();
});
