import { invoke } from "./tauri.js";
import { syncCamsSoon } from "./cam-usage.js";

const $ = (id) => document.getElementById(id);
const dlg = $("inputs-dlg");

let drafts = [];
const runtime = new Map(); // id -> { url }
let selId = null,
  nextId = 1,
  onDone = null;
let devs = { cams: [] };
let ndiEnabled = false;
const cur = () => drafts.find((i) => i.id === selId);

/* ---------- Device ---------- */
async function listDevices() {
  const cams = (await invoke("cam_list").catch(() => [])).map((c) => ({
    deviceId: c.name,
    label: c.name,
    kind: "videoinput",
  }));
  return { cams };
}

const fill = (sel, list, first) => {
  sel.innerHTML =
    (first ? `<option value="">${first}</option>` : "") +
    list
      .map((d) => `<option value="${d.deviceId}">${d.label || d.kind}</option>`)
      .join("");
};

/* ---------- Buka dialog ---------- */
// Parameter dipertahankan supaya pemanggil di tree.js tidak perlu diubah.
export async function openInputDialog(_kind, done) {
  onDone = done;
  drafts = [];
  selId = null;
  devs = await listDevices();
  fill($("v-device"), devs.cams, "— Select Device —");
  addDraft();
  dlg.showModal();
  ndiRefresh();
}

function renderList() {
  $("in-items").innerHTML = drafts
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
    n = drafts.length + 1;
  drafts.push({
    id,
    kind: "video",
    name: `Input ${n}`,
    deviceId: "",
    format: "SDR",
  });
  selId = id;
  renderList();
  loadFields();
}
$("in-add").onclick = addDraft;

$("in-rm").onclick = () => {
  const it = cur();
  if (!it) return;
  teardown(it.id);
  drafts = drafts.filter((i) => i !== it);
  selId = drafts[0]?.id ?? null;
  renderList();
  loadFields();
};

/* ---------- Field <-> model ---------- */
function chooseCam(it, d) {
  it.deviceId = d.deviceId;
  if (/^Input \d+$/.test(it.name) && d.label) it.name = d.label;
  renderList();
  loadFields();
  apply(it);
}

function renderPicker(it) {
  const box = $("in-pick");
  const need = !!it && !it.deviceId && !it.ndi && !it.pickNdi;
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
  $("v-name").value = it.name;
  $("v-device").value = it.deviceId;
  $("v-format").textContent = it.format;
  showCam(runtime.get(it.id)?.url ?? "");
}

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

/* ---------- Selesai / batal ---------- */
const labelOf = (list, id) => list.find((d) => d.deviceId === id)?.label ?? "";
const toConfig = (it) => ({
  media: "video",
  name: it.name,
  deviceId: it.deviceId,
  label: labelOf(devs.cams, it.deviceId),
  ndi: it.ndi ?? null,
});

$("in-close").onclick = async () => {
  const done = onDone;
  onDone = null;
  const configs = drafts.map(toConfig);

  [...runtime.keys()].forEach(teardown);
  showCam("");
  dlg.close();

  await new Promise((r) => setTimeout(r, 150));
  configs.forEach((c) => done?.(c));
};
$("in-cancel").onclick = () => dlg.close(); // event "close" membersihkan preview dan onDone

// dipicu juga oleh Esc
dlg.addEventListener("close", () => {
  [...runtime.keys()].forEach(teardown);
  showCam("");
  onDone = null;
  syncCamsSoon();
});

/* ---------- Runtime preview (hanya selama dialog terbuka) ---------- */
function teardown(id) {
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
    if (it.deviceId) {
      r.url = await window.CamSource.url(it.deviceId);
      $("in-res").textContent = "Live";
      if (selId === it.id) showCam(r.url);
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
  box.hidden = false;
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