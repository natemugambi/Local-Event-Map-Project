// Registers the service worker (offline support / installable app).
// Lives in its own file because the Content-Security-Policy blocks inline <script> tags.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
