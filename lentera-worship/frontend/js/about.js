const { invoke } = window.__TAURI__.core;

document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-ndi-link]")) return;
  e.preventDefault();
  invoke("ndi_open_download").catch(console.error);
});

invoke("ndi_status")
  .then((s) => {
    document.querySelectorAll("[data-ndi-only]").forEach((el) => {
      el.hidden = !s.enabled;
    });
  })
  .catch(console.error);

export async function openAbout() {
  try {
    document.getElementById("about-ver").textContent =
      await window.__TAURI__.app.getVersion();
  } catch {}
  document.getElementById("about-dlg").showModal();
}