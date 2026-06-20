/**
 * MemoryOS — services/update-service.js
 *
 * Controlled service-worker updates. A newly deployed version installs but
 * WAITS; the page is notified ("update:available") so it can back the user's
 * memories up first and let them choose when to switch. applyUpdate() then
 * tells the waiting worker to take over, and the page reloads once it does.
 */

import { bus } from "../core/events.js";

let waitingWorker = null;
let reloading = false;

/** Register the service worker and watch for updates. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("./sw.js").then((reg) => {
    // An update may already be installed and waiting from a previous visit.
    if (reg.waiting && navigator.serviceWorker.controller) {
      announce(reg.waiting);
    }

    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        // "installed" + an existing controller = an update (not first run).
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          announce(reg.waiting || sw);
        }
      });
    });

    // Check for a new version periodically and when the tab refocuses.
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    window.addEventListener("focus", () => reg.update().catch(() => {}));
  }).catch((err) => console.warn("[sw] registration failed:", err));

  // When the new worker takes control, reload once to pick up fresh code.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function announce(worker) {
  waitingWorker = worker;
  bus.emit("update:available");
}

/** Is there a new version installed and waiting to take over? */
export function hasPendingUpdate() {
  return !!waitingWorker;
}

/** Tell the waiting worker to activate; controllerchange then reloads. */
export function applyUpdate() {
  if (!waitingWorker) {
    // Nothing waiting (shouldn't happen) — hard reload as a fallback.
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}
