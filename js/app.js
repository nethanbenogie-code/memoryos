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
import * as accessibility from "./services/accessibility-service.js";
import * as storage from "./services/storage-service.js";
import { registerAllViews } from "./ui/views.js";

// Open the database and warm up all repositories.
async function boot() {
  console.log("[app] boot");

  // Initialize database
  await db.openDatabase();
  await repo.initializeRepository();

  // Set up views
  registerAllViews();

  // Apply saved accessibility settings (font size, contrast, spacing) so they
  // take effect immediately on every load, not only after visiting Settings.
  try {
    await accessibility.initialize();
  } catch (err) {
    console.warn("[app] accessibility init failed:", err);
  }

  // Always-save: ask the browser to keep our database persistent (don't evict
  // it under storage pressure), so the user never has to enable it by hand.
  try {
    if (storage.isPersistentStorageSupported()) {
      await storage.requestPersistentStorage();
    }
  } catch (err) {
    console.warn("[app] persistent storage request failed:", err);
  }

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
  bus.emit("navigate", { view: "brain" });

  // Update available (service worker has new code).
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    const banner = document.getElementById("update-available");
    if (banner) banner.style.display = "block";
  });
}

boot().catch((err) => {
  console.error("[app] boot failed:", err);
});
