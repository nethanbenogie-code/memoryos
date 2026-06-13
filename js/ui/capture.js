/**
 * MemoryOS — ui/capture.js
 *
 * Quick Capture: the most important two seconds in the product. One
 * textarea, type chips, Enter to save. "#tags" typed inline become
 * tags automatically. Opened by the capture button, the FAB, or
 * Ctrl/Cmd+K from anywhere.
 */

import { MemoryType } from "../data/models.js";
import * as memoryService from "../services/memory-service.js";
import { el } from "./components.js";

const CAPTURE_TYPES = [
  MemoryType.NOTE,
  MemoryType.IDEA,
  MemoryType.TASK,
  MemoryType.EVENT,
  MemoryType.LEARNING,
  MemoryType.ARTICLE,
];

/** @type {HTMLDialogElement|null} */
let dialog = null;
let selectedType = MemoryType.NOTE;

/** Build the dialog once and attach it to the document. */
export function initCapture() {
  dialog = el("dialog.capture", { "aria-label": "Quick capture" });

  const typeRow = el(
    "div.capture-types",
    { role: "radiogroup", "aria-label": "Memory type" },
    ...CAPTURE_TYPES.map((type) =>
      el(
        "button.chip.chip-select",
        {
          type: "button",
          dataset: { type },
          role: "radio",
          "aria-checked": String(type === selectedType),
          onclick: (event) => selectType(type, event.currentTarget),
        },
        type[0].toUpperCase() + type.slice(1)
      )
    )
  );

  const textarea = el("textarea.capture-text", {
    placeholder: "What do you want to remember?  First line is the title — #tags welcome.",
    rows: "4",
    "aria-label": "Memory text",
  });

  const hint = el("p.capture-hint", {}, "Enter to save · Shift+Enter for a new line · Esc to close");

  const saveBtn = el(
    "button.btn.btn-primary",
    { type: "button", onclick: save },
    "Save memory"
  );

  dialog.append(
    el("div.capture-inner", {}, typeRow, textarea, el("div.capture-foot", {}, hint, saveBtn))
  );
  document.body.append(dialog);

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save();
    }
  });

  // Close when clicking the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  async function save() {
    const raw = textarea.value.trim();
    if (!raw) return;
    saveBtn.disabled = true;
    try {
      await memoryService.capture(raw, { type: selectedType });
      textarea.value = "";
      dialog.close();
    } catch (err) {
      console.error("[capture] save failed:", err);
      hint.textContent = "Couldn't save — try again.";
    } finally {
      saveBtn.disabled = false;
    }
  }

  function selectType(type, button) {
    selectedType = type;
    for (const chip of typeRow.children) {
      chip.setAttribute("aria-checked", String(chip === button));
    }
    textarea.focus();
  }
}

/** Open the capture dialog with the textarea focused. */
export function openCapture() {
  if (!dialog) return;
  dialog.showModal();
  dialog.querySelector("textarea").focus();
}

/** Global shortcut: Ctrl/Cmd+K from anywhere in the app. */
export function bindCaptureShortcut() {
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCapture();
    }
  });
}
