(function () {
  const { listen } = window.__TAURI__.event;
  const root = document.createElement("div");
  root.id = "msg-overlay";
  root.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
  document.body.appendChild(root);
  const r = window.MessageRenderer.create(root);
  listen("message-event", (e) => r.apply(e.payload));
})();