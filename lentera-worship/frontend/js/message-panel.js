import { $ } from "./utils.js";
import * as Msg from "./message-state.js";

const KEY = "pc.msg.quick";
const SEED = [
  {
    id: "s1",
    text: "Would the owner of the vehicle blocking the exit please move it as soon as possible.",
  },
  {
    id: "s2",
    text: "A vehicle key has been found. Please contact the information desk.",
  },
  {
    id: "s3",
    text: "A vehicle key has been lost. If found, please contact the staff. Thank you.",
  },
];
const MODES = [
  ["ticker", "Running text"],
  ["banner", "Banner"],
  ["lower", "Lower third"],
  ["card", "Corner card"],
  ["full", "Full screen"],
];

let quick = [];
function loadQuick() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    quick = Array.isArray(v) ? v : SEED.slice();
  } catch {
    quick = SEED.slice();
  }
}
function saveQuick() {
  try {
    localStorage.setItem(KEY, JSON.stringify(quick));
  } catch {}
}

export function initMessagePanel() {
  const body = $("msg-body");
  if (!body) return;
  const D = Msg.DEFAULTS;
  body.innerHTML = `
    <textarea id="mg-text" placeholder="Type an announcement…"></textarea>
    <div class="mg-grid">
      <label for="mg-mode">Style</label>
      <select id="mg-mode">${MODES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <label for="mg-pos" data-for="ticker banner">Position</label>
      <select id="mg-pos" data-for="ticker banner"><option value="bottom">Bottom</option><option value="top">Top</option></select>
      <label for="mg-size">Size</label>
      <input id="mg-size" type="range" min="3" max="14" step="0.5" value="${D.size}" />
      <label for="mg-speed" data-for="ticker">Speed</label>
      <input id="mg-speed" data-for="ticker" type="range" min="40" max="400" step="10" value="${D.speed}" />
      <label>Color</label>
      <div class="mg-colors">
        Text <input id="mg-color" type="color" value="${D.color}" />
        Background <input id="mg-bg" type="color" value="${D.bg}" />
      </div>
      <label for="mg-auto">Auto hide (s)</label>
      <input id="mg-auto" type="number" min="0" max="3600" step="5" value="0" title="Seconds. 0 = stay until hidden manually" />
    </div>
    <div class="mg-actions">
      <button id="mg-show" class="primary">Show</button>
      <button id="mg-hide">Hide</button>
    </div>
    <div class="mg-sub"><span>Quick messages</span><button id="mg-save" title="Save the text above as a quick message">+ Save</button></div>
    <div id="mg-quick" class="mg-list"></div>`;

  const f = (id) => $(id);
  const read = () => ({
    text: f("mg-text").value,
    mode: f("mg-mode").value,
    pos: f("mg-pos").value,
    size: Number(f("mg-size").value),
    speed: Number(f("mg-speed").value),
    color: f("mg-color").value,
    bg: f("mg-bg").value,
  });
  const auto = () => Math.max(0, Number(f("mg-auto").value) || 0);

  function syncVisibility() {
    const mode = f("mg-mode").value;
    body.querySelectorAll("[data-for]").forEach((el) => {
      el.hidden = !el.dataset.for.split(" ").includes(mode);
    });
  }

  const pvHost = document.getElementById("pv-host");
  const ov = document.createElement("div");
  ov.id = "mg-pv-overlay";
  ov.style.cssText =
    "position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden;";
  const keep = () => {
    if (pvHost.lastChild !== ov) pvHost.appendChild(ov);
  };
  keep();
  new MutationObserver(keep).observe(pvHost, { childList: true });
  const pv = window.MessageRenderer.create(ov);

  function updatePreview() {
    const d = read();
    const text = d.text.trim();
    pv.apply({ ...d, text, visible: !!text });
  }

  [
    "mg-text",
    "mg-mode",
    "mg-pos",
    "mg-size",
    "mg-speed",
    "mg-color",
    "mg-bg",
  ].forEach((id) =>
    f(id).addEventListener("input", () => {
      syncVisibility();
      updatePreview();
    }),
  );

  function renderQuick() {
    const box = f("mg-quick");
    box.replaceChildren();
    for (const q of quick) {
      const row = document.createElement("div");
      row.className = "mg-item";
      const use = document.createElement("button");
      use.textContent = q.text;
      use.title = "Click: fill the text. Double-click: show immediately.";
      use.onclick = () => {
        f("mg-text").value = q.text;
        updatePreview();
      };
      use.ondblclick = () => {
        f("mg-text").value = q.text;
        Msg.showMessage(read(), auto());
      };
      const del = document.createElement("button");
      del.textContent = "✕";
      del.title = "Delete";
      del.onclick = () => {
        quick = quick.filter((x) => x.id !== q.id);
        saveQuick();
        renderQuick();
      };
      row.append(use, del);
      box.append(row);
    }
  }

  f("mg-show").onclick = async () => {
    if (!f("mg-text").value.trim()) return f("mg-text").focus();
    try {
      await Msg.showMessage(read(), auto());
    } catch (err) {
      console.error("Show message gagal:", err);
    }
  };
  f("mg-hide").onclick = async () => {
    try {
      await Msg.hideMessage();
    } catch (err) {
      console.error("Hide message gagal:", err);
    }
  };
  //   f("mg-show").onclick = () => Msg.showMessage(read(), auto());
  //   f("mg-hide").onclick = () => Msg.hideMessage();
  f("mg-save").onclick = () => {
    const t = f("mg-text").value.trim();
    if (!t || quick.some((x) => x.text === t)) return;
    quick.push({ id: Date.now().toString(36), text: t });
    saveQuick();
    renderQuick();
  };
  f("mg-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      f("mg-show").click();
    }
    e.stopPropagation(); // jangan memicu shortcut global saat mengetik (mis. B)
  });

  Msg.onMessageChange((m) => body.classList.toggle("live", m.visible));

  loadQuick();
  renderQuick();
  syncVisibility();
  updatePreview();
}
