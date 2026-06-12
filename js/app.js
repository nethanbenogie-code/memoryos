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

const VIEWS = [
  { id: "timeline", label: "Timeline", icon: "◷", View: TimelineView },
  { id: "search", label: "Search", icon: "⌕", View: SearchView },
  { id: "tasks", label: "Tasks", icon: "☑", View: TasksView },
  { id: "journal", label: "Journal", icon: "✎", View: JournalView },
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
  tabBar.append(
    el(
      "button.tab-item.tab-capture",
      { type: "button", onclick: openCapture, "aria-label": "Quick capture" },
      el("span.tab-icon", {}, "+"),
      el("span.tab-label", {}, "Capture")
    )
  );

  document.getElementById("capture-btn").addEventListener("click", openCapture);
  document.getElementById("fab").addEventListener("click", openCapture);

  initCapture();
  bindCaptureShortcut();

  await showView("timeline", host);
  registerServiceWorker();

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
