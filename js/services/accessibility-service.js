/**
 * MemoryOS — services/accessibility-service.js
 *
 * Display preferences for older eyes and low vision: text size, line
 * spacing, and high contrast. These are device-level UI settings, so the
 * source of truth is localStorage (it applies instantly, before the
 * database opens, with no flash of small text). A copy is mirrored into
 * the meta store so the preference travels with backups/exports.
 */

import { bus } from "../core/events.js";
import * as repo from "../data/repository.js";

const LS_KEY = "memoryos-display";
const META_KEY = "displaySettings";

export const FONT_SIZES = Object.freeze([
  { value: 0.9, label: "Small" },
  { value: 1.0, label: "Default" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Larger" },
  { value: 1.5, label: "Largest" },
]);

export const LINE_SPACINGS = Object.freeze([
  { value: "normal", label: "Normal", lineHeight: 1.55 },
  { value: "relaxed", label: "Relaxed", lineHeight: 1.75 },
  { value: "spacious", label: "Spacious", lineHeight: 1.95 },
]);

const DEFAULTS = Object.freeze({
  fontScale: 1.0,
  lineSpacing: "normal",
  highContrast: false,
});

let current = null;

/** Read settings synchronously from localStorage (instant, no await). */
function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return null;
}

function persist(settings) {
  current = settings;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {}
  repo.setMeta(META_KEY, settings).catch(() => {});
  apply(settings);
  bus.emit("display:changed", { settings });
}

/** Apply settings to the document root. The app is laid out in px, so we
 *  scale with CSS `zoom` (enlarges text AND layout uniformly) rather than
 *  root font-size, which only affects rem/em. Supported in Chromium, Safari,
 *  and Firefox 126+. */
function apply(settings) {
  const root = document.documentElement;
  root.style.setProperty("--font-scale", String(settings.fontScale));
  root.style.zoom = settings.fontScale === 1 ? "" : String(settings.fontScale);

  root.classList.toggle("high-contrast", !!settings.highContrast);
  root.classList.remove("spacing-relaxed", "spacing-spacious");
  if (settings.lineSpacing === "relaxed") root.classList.add("spacing-relaxed");
  else if (settings.lineSpacing === "spacious") root.classList.add("spacing-spacious");
}

/**
 * Apply saved settings as early as possible (call before the first paint).
 * Uses localStorage so there's no wait and no flash; reconciles with the
 * database copy in the background.
 */
export function initialize() {
  current = readLocal() || { ...DEFAULTS };
  apply(current);

  // Reconcile with the durable copy without blocking startup.
  repo.getMeta(META_KEY)
    .then((stored) => {
      if (stored && !readLocal()) {
        current = { ...DEFAULTS, ...stored };
        try { localStorage.setItem(LS_KEY, JSON.stringify(current)); } catch {}
        apply(current);
        bus.emit("display:changed", { settings: current });
      }
    })
    .catch(() => {});

  return current;
}

export function getSettings() {
  return current || readLocal() || { ...DEFAULTS };
}

export function setFontScale(scale) {
  const clamped = Math.max(0.9, Math.min(1.5, Number(scale) || 1));
  persist({ ...getSettings(), fontScale: clamped });
}

export function setLineSpacing(value) {
  persist({ ...getSettings(), lineSpacing: value });
}

export function setHighContrast(enabled) {
  persist({ ...getSettings(), highContrast: !!enabled });
}

export function resetToDefaults() {
  persist({ ...DEFAULTS });
  return getSettings();
}
