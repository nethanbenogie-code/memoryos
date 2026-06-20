/**
 * MemoryOS — app.js
 *
 * Application bootstrap: connect to the database, set up the event bus,
 * wire navigation, and kick off the active view.
 */

import * as db from "./data/db.js";
import * as repo from "./data/repository.js";
import { bus } from "./core/events.js";
import * as backup from "./services/backup-service.js";
import { registerAllViews } from "./ui/views.js";

// Open the database and warm up all repositories.
async function boot() {
  console.log("[app] boot");

  // Initialize database
  await db.openDatabase();
  await repo.initializeRepository();

  // Set up views
  registerAllViews();

  // Run auto-backup recovery and if-due checks at startup
  try {
    await backup.autoRestoreAutoBackup();
    await backup.runAutoBackupIfDue();
  } catch (err) {
    console.warn("[app] auto-backup startup check failed:", err);
  }

  // Wire navigation
  let currentView = null;
  const mainEl = document.querySelector("main");
  bus.on("navigate", async (evt) => {
    if (currentView) currentView.unmount();
    const ViewClass = window.__views[evt.view];
    if (!ViewClass) {
      console.error("[app] unknown view:", evt.view);
      return;
    }
    currentView = new ViewClass(mainEl);
    mainEl.scrollTop = 0;
    await currentView.mount();
  });

  // Emit the first navigation; for PWA, also listen for install/beforeinstallprompt
  bus.emit("navigate", { view: "timeline" });

  // Update available (service worker has new code).
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    const banner = document.getElementById("update-available");
    if (banner) banner.style.display = "block";
  });
}

boot().catch((err) => {
  console.error("[app] boot failed:", err);
});
