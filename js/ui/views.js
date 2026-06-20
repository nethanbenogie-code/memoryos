/**
 * MemoryOS — ui/views.js
 *
 * View registry + navigation. app.js calls registerAllViews() once at boot:
 * it publishes the view classes on window.__views (which app.js's navigate
 * handler instantiates) and builds the sidebar + bottom tab bar from a single
 * declarative list. Clicking any nav item emits a "navigate" event; the active
 * item is highlighted as the route changes.
 *
 * NOTE: this file was reconstructed — the uploaded branch imported it from
 * app.js but did not include it, so the app could not boot. The view set below
 * mirrors the app's established navigation, plus this branch's Settings and
 * To-Do views.
 */

import { bus } from "../core/events.js";
import { el } from "./components.js";
import { openCapture } from "./capture.js";
import { shareApp } from "./share.js";

import { SecondBrainView } from "./second-brain-view.js";
import { TimelineView } from "./timeline-view.js";
import { JournalView } from "./journal-view.js";
import { TasksView } from "./tasks-view.js";
import { TodoListView } from "./todo-list-view.js";
import { SearchView } from "./search-view.js";
import { AIView } from "../ai/ai-view.js";
import { BackupView } from "./backup-view.js";
import { SettingsView } from "./settings-view.js";
import { AboutView } from "./about-view.js";
import { ManualView } from "./manual-view.js";

const REGISTRY = {
  brain: SecondBrainView,
  timeline: TimelineView,
  journal: JournalView,
  tasks: TasksView,
  todo: TodoListView,
  search: SearchView,
  ai: AIView,
  backup: BackupView,
  settings: SettingsView,
  about: AboutView,
  manual: ManualView,
};

// Primary navigation (sidebar + bottom tab bar).
const NAV = [
  { id: "brain", label: "Second Brain", icon: "◈" },
  { id: "timeline", label: "Timeline", icon: "◷" },
  { id: "journal", label: "Journal", icon: "✎" },
  { id: "tasks", label: "Tasks", icon: "☑" },
  { id: "todo", label: "To-Do", icon: "✓" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "ai", label: "AI Assistant", icon: "✦" },
  { id: "backup", label: "Backup", icon: "⛉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

// Secondary links (in the sidebar footer, not the tab bar).
const SECONDARY = [
  { id: "about", label: "About MemoryOS" },
  { id: "manual", label: "User manual" },
];

export function registerAllViews() {
  window.__views = REGISTRY;
  buildNav();
}

function navButton(item, className) {
  return el(`button.${className}`, {
    type: "button",
    dataset: { view: item.id },
    "aria-label": item.label,
    onclick: () => bus.emit("navigate", { view: item.id }),
  },
    el("span.nav-icon", { "aria-hidden": "true" }, item.icon || "•"),
    el("span.nav-label", {}, item.label)
  );
}

function buildNav() {
  const sideNav = document.getElementById("side-nav");
  const tabBar = document.getElementById("tab-bar");
  const sideLinks = document.getElementById("side-links");

  if (sideNav) sideNav.replaceChildren(...NAV.map((n) => navButton(n, "nav-item")));
  if (tabBar) tabBar.replaceChildren(...NAV.map((n) => navButton(n, "tab-item")));
  if (sideLinks) {
    sideLinks.replaceChildren(...SECONDARY.map((s) =>
      el("button.side-link", {
        type: "button",
        dataset: { view: s.id },
        onclick: () => bus.emit("navigate", { view: s.id }),
      }, s.label)
    ));
  }

  document.getElementById("capture-btn")?.addEventListener("click", () => openCapture());
  document.getElementById("fab")?.addEventListener("click", () => openCapture());
  document.getElementById("share-btn")?.addEventListener("click", () => { shareApp(); });

  // Keyboard quick-capture (Ctrl/Cmd-K), matching the sidebar hint.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      openCapture();
    }
  });

  bus.on("navigate", ({ view }) => setActiveNav(view));
}

function setActiveNav(view) {
  for (const btn of document.querySelectorAll("[data-view]")) {
    btn.classList.toggle("is-active", btn.dataset.view === view);
  }
}
