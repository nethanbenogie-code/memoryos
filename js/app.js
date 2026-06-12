/**
 * MemoryOS — app.js
 *
 * Bootstrap: open the database, warm the search index, wire navigation,
 * register the service worker. Views are mounted into one host element;
 * a tiny view registry stands in for a router until the app earns one.
 */

import { bus } from "./core/events.js";
import { openDatabase } from "./data/db.js";
import * as memoryService from "./services/memory-service.js";
import { searchIndex } from "./services/search-service.js";
import { initCapture, openCapture, bindCaptureShortcut } from "./ui/capture.js";
import { el } from "./ui/components.js";
import { TimelineView } from "./ui/timeline-view.js";
import { SearchView } from "./ui/search-view.js";
import { TasksView } from "./ui/tasks-view.js";
import { JournalView } from "./ui/journal-view.js";
import { BackupView } from "./ui/backup-view.js";
import { showToast } from "./ui/celebration.js";
import { getBackupStatus } from "./services/backup-service.js";
import { shareApp } from "./ui/share.js";
import { initCelebrations } from "./ui/celebration.js";
import { startReminderLoop } from "./services/reminder-service.js";

const VIEWS = [
  { id: "timeline", label: "Timeline", icon: "◷", View: TimelineView },
  { id: "search", label: "Search", icon: "⌕", View: SearchView },
  { id: "tasks", label: "Tasks", icon: "☑", View: TasksView },
  { id: "journal", label: "Journal", icon: "✎", View: JournalView },
  { id: "backup", label: "Backup", icon: "⛉", View: BackupView },
];

let currentView = null;
let currentId = null;

async function main() {
  await openDatabase();
  searchIndex.build(await memoryService.listAll());

  const host = document.getElementById("view-host");
  const sideNav = document.getElementById("side-nav");
  const tabBar = document.getElementById("tab-bar");

  for (const { id, label, icon } of VIEWS) {
    sideNav.append(navButton(id, label, icon, "nav-item"));
    tabBar.append(navButton(id, label, icon, "tab-item"));
  }

  document.getElementById("capture-btn").addEventListener("click", openCapture);
  document.getElementById("share-btn").addEventListener("click", shareApp);
  document.getElementById("fab").addEventListener("click", openCapture);

  initCapture();
  bindCaptureShortcut();
  initCelebrations();
  startReminderLoop();

  await showView("timeline", host);
  registerServiceWorker();

  // After a restore, rebuild the search index and re-render the open view.
  bus.on("backup:restored", async () => {
    searchIndex.build(await memoryService.listAll());
    const id = currentId;
    currentId = null;
    showView(id, host);
  });

  // Backup nudge for people who don't read: an amber dot on the Backup
  // tab whenever backups are stale, plus one gentle toast per session.
  updateBackupAttention();
  bus.on("backup:done", updateBackupAttention);
  bus.on("memory:created", updateBackupAttention);

  let nudged = false;
  async function updateBackupAttention() {
    const status = await getBackupStatus();
    for (const button of document.querySelectorAll('[data-view="backup"]')) {
      button.toggleAttribute("data-attention", status.stale);
    }
    if (status.stale && !nudged) {
      nudged = true;
      showToast(
        status.lastBackupAt
          ? `It's been ${status.daysSince} days since your last backup.`
          : "Tip: back up your memories — it takes one tap."
      );
    }
  }

  function navButton(id, label, icon, className) {
    return el(
      `button.${className}`,
      {
        type: "button",
        dataset: { view: id },
        onclick: () => showView(id, host),
        "aria-label": label,
      },
      el("span.nav-icon", { "aria-hidden": "true" }, icon),
      el("span.nav-label", {}, label)
    );
  }
}

/**
 * @param {string} id
 * @param {HTMLElement} host
 */
async function showView(id, host) {
  if (id === currentId) return;
  const entry = VIEWS.find((v) => v.id === id);
  if (!entry) return;

  currentView?.unmount?.();
  host.replaceChildren();

  currentView = new entry.View(host);
  currentId = id;
  await currentView.mount();

  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-current", String(button.dataset.view === id));
  }
  bus.emit("view:changed", { view: id });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("./sw.js")
    .catch((err) => console.warn("[sw] registration failed:", err));
}

main().catch((err) => {
  console.error("[app] fatal startup error:", err);
  document.getElementById("view-host").replaceChildren(
    el(
      "div.empty",
      {},
      el("p.empty-message", {}, "MemoryOS couldn't start."),
      el("p.empty-hint", {}, "Open the browser console for details, then reload.")
    )
  );
});
