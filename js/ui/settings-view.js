/**
 * MemoryOS — ui/settings-view.js (Updated)
 *
 * Settings view with accessibility and appearance options.
 */

import { bus } from "../core/events.js";
import * as accessibility from "../services/accessibility-service.js";
import { el, emptyState } from "./components.js";
import { showToast } from "./celebration.js";

export class SettingsView {
  constructor(container) {
    this.container = container;
    this.unsubscribes = [];
  }

  async mount() {
    const refresh = () => this.render();
    this.unsubscribes = [
      bus.on("accessibility:changed", refresh),
    ];
    await this.render();
  }

  unmount() {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
  }

  async render() {
    const settings = await accessibility.getCurrentSettings();
    const fontSizes = accessibility.getFontSizes();

    this.container.replaceChildren(
      el("header.view-head", {}, el("h2.view-title", {}, "Settings")),
      this._fontSizeSection(settings, fontSizes),
      this._lineSpacingSection(settings),
      this._contrastSection(settings),
      this._accessibilityNotesSection(),
      this._resetSection()
    );
  }

  _fontSizeSection(settings, fontSizes) {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Font Size"),
      el("p.settings-hint", {}, "Choose text size that's comfortable for you. Changes apply immediately."),
      el("div.font-size-options", {},
        fontSizes.map((size) =>
          el("button.btn.font-size-btn", {
            type: "button",
            "aria-pressed": String(Math.abs(settings.fontScale - size.value) < 0.01),
            onclick: async () => {
              await accessibility.setFontScale(size.value);
              showToast(`Text size set to ${size.label}`);
              this.render();
            },
            style: `font-size: ${15 * size.value}px;`,
          }, size.label)
        )
      ),
      el("div.font-size-preview", {},
        el("p", {}, "This is how your text will look. You can change it anytime.")
      )
    );
  }

  _lineSpacingSection(settings) {
    const spacings = [
      { value: "normal", label: "Normal", description: "Standard spacing" },
      { value: "relaxed", label: "Relaxed", description: "More comfortable spacing" },
      { value: "spacious", label: "Spacious", description: "Maximum spacing" },
    ];

    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Line Spacing"),
      el("p.settings-hint", {}, "Adjust spacing between lines for easier reading."),
      el("div.spacing-options", {},
        spacings.map((s) =>
          el("label.settings-radio", {},
            el("input", {
              type: "radio",
              name: "line-spacing",
              value: s.value,
              checked: settings.lineSpacing === s.value,
              onchange: async () => {
                await accessibility.setLineSpacing(s.value);
                showToast(`Line spacing set to ${s.label}`);
                this.render();
              },
            }),
            el("span.radio-label", {},
              el("strong", {}, s.label),
              el("small", {}, s.description)
            )
          )
        )
      )
    );
  }

  _contrastSection(settings) {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Visual Enhancements"),
      el("label.settings-checkbox", {},
        el("input", {
          type: "checkbox",
          checked: settings.highContrast,
          onchange: async (e) => {
            await accessibility.setHighContrast(e.target.checked);
            showToast(e.target.checked ? "High contrast on" : "High contrast off");
            this.render();
          },
        }),
        el("span.checkbox-label", {},
          "🎨 High Contrast Mode",
          el("small", {}, "Darker text and borders for better visibility")
        )
      )
    );
  }

  _accessibilityNotesSection() {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Accessibility Tips"),
      el("ul.settings-tips", {},
        el("li", {}, "Use a larger font size if you have vision problems"),
        el("li", {}, "Relaxed or spacious line spacing can help with focus"),
        el("li", {}, "High contrast mode increases text readability"),
        el("li", {}, "All settings save automatically and persist across sessions"),
        el("li", {}, "You can change settings anytime from this screen")
      )
    );
  }

  _resetSection() {
    return el("section.settings-section.settings-danger", {},
      el("h3.section-heading", {}, "Reset"),
      el("p.settings-hint", {}, "Restore all accessibility settings to defaults."),
      el("button.btn.btn-quiet.btn-danger", {
        type: "button",
        onclick: async () => {
          if (confirm("Reset all accessibility settings to defaults?")) {
            await accessibility.resetToDefaults();
            showToast("Settings reset to defaults");
            this.render();
          }
        },
      }, "Reset to Defaults")
    );
  }
}
