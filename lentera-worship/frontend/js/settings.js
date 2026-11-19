import { loadOutput, saveOutput } from "../shared/output-state.js";

const dlg = document.getElementById("settings-dlg");
const preset = document.getElementById("out-preset");
const custom = document.getElementById("out-custom");
const ow = document.getElementById("out-w");
const oh = document.getElementById("out-h");
const save = document.getElementById("out-save");

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
  custom.hidden = preset.value !== "custom";
  if (preset.value !== "custom") {
    const [w, h] = preset.value.split("x").map(Number);
    ow.value = w;
    oh.value = h;
  }
});

save.addEventListener("click", async () => {
  const w = parseInt(ow.value),
    h = parseInt(oh.value);
  if (!(w >= 320 && h >= 240)) {
    custom.hidden = false;
    ow.focus();
    return;
  }
  await saveOutput({ w, h });
  dlg.close();
});

const applyCustom = () => {
  const w = parseInt(ow.value),
    h = parseInt(oh.value);
  if (w >= 320 && h >= 240) saveOutput({ w, h });
};
ow.addEventListener("change", applyCustom);
oh.addEventListener("change", applyCustom);

export function openSettings() {
  show();
  dlg.showModal();
}
