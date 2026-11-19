import { loadOutput, saveOutput } from "../shared/output-state.js";

const dlg = document.getElementById("settings-dlg");
const preset = document.getElementById("out-preset");
const custom = document.getElementById("out-custom");
const ow = document.getElementById("out-w");
const oh = document.getElementById("out-h");

function show() {
  const o = loadOutput();
  const v = `${o.w}x${o.h}`;
  const known = [...preset.options].some((x) => x.value === v);
  preset.value = known ? v : "custom";
  custom.hidden = known;
  ow.value = o.w;
  oh.value = o.h;
}

preset.addEventListener("change", () => {
  if (preset.value === "custom") {
    custom.hidden = false;
    return;
  }
  const [w, h] = preset.value.split("x").map(Number);
  custom.hidden = true;
  saveOutput({ w, h });
});

const applyCustom = () => {
  const w = parseInt(ow.value), h = parseInt(oh.value);
  if (w >= 320 && h >= 240) saveOutput({ w, h });
};
ow.addEventListener("change", applyCustom);
oh.addEventListener("change", applyCustom);

export function openSettings() {
  show();
  dlg.showModal();
}