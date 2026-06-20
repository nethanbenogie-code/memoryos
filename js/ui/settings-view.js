/**
 * MemoryOS — ui/settings-view.js
 *
 * Display & accessibility settings — built for older eyes and low vision.
 * Text size, line spacing, and high contrast, applied live and remembered
 * across sessions. Follows the standard view contract (mount/unmount).
 */

import { bus } from "../core/events.js";
import { el } from "./components.js";
import { showToast } from "./celebration.js";
import * as a11y from "../services/accessibility-service.js";

export class SettingsView {
  constructor(container) {
    this.container = container;
    this.offs = [];
  }

  async mount() {
    this.offs.push(bus.on("display:changed", () => this.render()));
    this.render();
  }

  unmount() {
    for (const off of this.offs) off();
    this.offs = [];
  }

  render() {
    const s = a11y.getSettings();
    this.container.replaceChildren(
      el("header.view-head", {}, el("h2.view-title", {}, "Settings")),
      el("div.settings", {},
        this._textSize(s),
        this._lineSpacing(s),
        this._contrast(s),
        this._preview(),
        this._reset()
      )
    );
  }

  _textSize(s) {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Text size"),
      el("p.settings-hint", {}, "Make the writing bigger and easier to read. Changes apply right away."),
      el("div.font-size-options", {},
        ...a11y.FONT_SIZES.map((size) =>
          el("button.btn.font-size-btn", {
            type: "button",
            "aria-pressed": String(Math.abs(s.fontScale - size.value) < 0.001),
            style: `font-size:${15 * size.value}px;`,
            onclick: () => {
              a11y.setFontScale(size.value);
              showToast(`Text size: ${size.label}`);
            },
          }, size.label)
        )
      )
    );
  }

  _lineSpacing(s) {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Line spacing"),
      el("p.settings-hint", {}, "More space between lines can be easier to follow."),
      el("div.spacing-options", {},
        ...a11y.LINE_SPACINGS.map((opt) =>
          el("label.settings-radio", {},
            el("input", {
              type: "radio", name: "line-spacing", value: opt.value,
              checked: s.lineSpacing === opt.value,
              onchange: () => { a11y.setLineSpacing(opt.value); showToast(`Line spacing: ${opt.label}`); },
            }),
            el("span.radio-label", {}, el("strong", {}, opt.label))
          )
        )
      )
    );
  }

  _contrast(s) {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Contrast"),
      el("label.settings-checkbox", {},
        el("input", {
          type: "checkbox", checked: s.highContrast,
          onchange: (e) => {
            a11y.setHighContrast(e.target.checked);
            showToast(e.target.checked ? "High contrast on" : "High contrast off");
          },
        }),
        el("span.checkbox-label", {},
          el("strong", {}, "High contrast"),
          el("small", {}, "Darker text and stronger borders for better visibility")
        )
      )
    );
  }

  _preview() {
    return el("section.settings-section", {},
      el("h3.section-heading", {}, "Preview"),
      el("div.settings-preview", {},
        el("p", {}, "This is how your text looks. Adjust the size above until it's comfortable to read."),
        el("p.settings-preview-soft", {}, "Smaller, secondary text looks like this.")
      )
    );
  }

  _reset() {
    return el("section.settings-section.settings-danger", {},
      el("button.btn.btn-quiet", {
        type: "button",
        onclick: () => {
          a11y.resetToDefaults();
          showToast("Display settings reset");
        },
      }, "Reset to defaults")
    );
  }
}
