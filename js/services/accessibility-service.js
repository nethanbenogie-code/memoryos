/**
 * MemoryOS — services/accessibility-service.js
 *
 * Accessibility settings for elderly users and people with vision problems.
 * Includes font size scaling, high contrast, and persistent preferences.
 */

import { bus } from "../core/events.js";
import * as repo from "../data/repository.js";

const FONT_SIZES = [
  { value: 0.85, label: "Small (85%)" },
  { value: 1.0, label: "Normal (100%)" },
  { value: 1.15, label: "Large (115%)" },
  { value: 1.3, label: "Extra Large (130%)" },
  { value: 1.5, label: "Huge (150%)" },
];

const SETTINGS_KEY = "memoryos-accessibility";
const DEFAULT_FONT_SCALE = 1.0;

let _currentSettings = null;

/**
 * Load accessibility settings from localStorage.
 */
export async function loadSettings() {
  if (_currentSettings) return _currentSettings;

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      _currentSettings = JSON.parse(stored);
      return _currentSettings;
    }
  } catch (err) {
    console.warn("[accessibility] failed to load settings:", err);
  }

  // Load from database metadata if not in localStorage
  try {
    const dbSettings = await repo.getMeta("accessibilitySettings");
    if (dbSettings) {
      _currentSettings = dbSettings;
      saveSettings(_currentSettings); // Sync to localStorage
      return _currentSettings;
    }
  } catch {}

  // Default settings
  _currentSettings = {
    fontScale: DEFAULT_FONT_SCALE,
    highContrast: false,
    lineSpacing: "normal",
    reducedMotion: false,
  };

  return _currentSettings;
}

/**
 * Save settings to localStorage and database.
 */
function saveSettings(settings) {
  _currentSettings = settings;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    repo.setMeta("accessibilitySettings", settings).catch(() => {});
  } catch (err) {
    console.warn("[accessibility] failed to save settings:", err);
  }
  bus.emit("accessibility:changed", { settings });
}

/**
 * Set font size scale (0.85 to 1.5).
 */
export async function setFontScale(scale) {
  const settings = await loadSettings();
  settings.fontScale = Math.max(0.85, Math.min(1.5, scale));
  saveSettings(settings);
  applySettings(settings);
}

/**
 * Toggle high contrast mode.
 */
export async function setHighContrast(enabled) {
  const settings = await loadSettings();
  settings.highContrast = enabled;
  saveSettings(settings);
  applySettings(settings);
}

/**
 * Set line spacing (normal, relaxed, spacious).
 */
export async function setLineSpacing(spacing) {
  const settings = await loadSettings();
  settings.lineSpacing = spacing; // "normal" | "relaxed" | "spacious"
  saveSettings(settings);
  applySettings(settings);
}

/**
 * Respect prefers-reduced-motion system setting.
 */
export async function setReducedMotion(enabled) {
  const settings = await loadSettings();
  settings.reducedMotion = enabled;
  saveSettings(settings);
  applySettings(settings);
}

/**
 * Apply all accessibility settings to the DOM.
 */
function applySettings(settings) {
  const root = document.documentElement;

  // Font size scaling
  root.style.setProperty("--font-scale", settings.fontScale);
  root.style.fontSize = `${15 * settings.fontScale}px`;

  // High contrast mode
  if (settings.highContrast) {
    root.classList.add("high-contrast");
  } else {
    root.classList.remove("high-contrast");
  }

  // Line spacing
  const lineHeights = {
    normal: 1.55,
    relaxed: 1.75,
    spacious: 1.95,
  };
  root.style.lineHeight = lineHeights[settings.lineSpacing] || 1.55;

  // Reduced motion
  if (settings.reducedMotion) {
    root.classList.add("reduce-motion");
  } else {
    root.classList.remove("reduce-motion");
  }
}

/**
 * Initialize accessibility on page load.
 */
export async function initialize() {
  const settings = await loadSettings();
  applySettings(settings);

  // Listen for system preference changes
  if (window.matchMedia) {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionQuery.addListener((e) => {
      setReducedMotion(e.matches);
    });
  }

  // Listen for visibility changes to reapply settings
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      applySettings(_currentSettings);
    }
  });
}

/**
 * Get all available font sizes.
 */
export function getFontSizes() {
  return FONT_SIZES;
}

/**
 * Get current settings.
 */
export async function getCurrentSettings() {
  return await loadSettings();
}

/**
 * Reset to defaults.
 */
export async function resetToDefaults() {
  const defaults = {
    fontScale: DEFAULT_FONT_SCALE,
    highContrast: false,
    lineSpacing: "normal",
    reducedMotion: false,
  };
  saveSettings(defaults);
  applySettings(defaults);
  return defaults;
}
