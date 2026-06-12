/**
 * MemoryOS — ui/backup-view.js
 *
 * The Backup view, written for people who don't read: one big button
 * that does the right thing, status in color (green fresh, amber stale),
 * and restore that's merge-safe so clicking it can never destroy data.
 */

import { bus } from "../core/events.js";
import * as backup from "../services/backup-service.js";
import { el, emptyState } from "./components.js";
import { showToast } from "./celebration.js";
import { shareApp } from "./share.js";

export class BackupView {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;
    this.unsubscribes = [];
  }

  async mount() {
    const refresh = () => this.render();
    this.unsubscribes = [
      bus.on("backup:done", refresh),
      bus.on("backup:restored", refresh),
    ];
    await this.render();
  }

  unmount() {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
  }

  async render() {
    const status = await backup.getBackupStatus();

    this.container.replaceChildren(
      el("header.view-head", {}, el("h2.view-title", {}, "Backup")),
      this._statusCard(status),
      this._actions(status),
      backup.autoBackupSupported() ? await this._autoSection(status) : null,
      this._restoreSection(),
      this._explainer(),
      this._tellAFriend()
    );
  }

  _statusCard(status) {
    let line;
    let tone = "fresh";
    if (status.memoryCount === 0) {
      line = "Nothing to back up yet — capture your first memory.";
      tone = "neutral";
    } else if (!status.lastBackupAt) {
      line = "Your memories have never been backed up.";
      tone = "stale";
    } else if (status.daysSince === 0) {
      line = "Backed up today. All good.";
    } else if (status.daysSince === 1) {
      line = "Last backup: yesterday.";
    } else {
      line = `Last backup: ${status.daysSince} days ago.`;
      if (status.stale) tone = "stale";
    }
    return el(
      "section.backup-status",
      { dataset: { tone } },
      el("p.backup-line", {}, line),
      el(
        "p.backup-sub",
        {},
        `${status.memoryCount} ${status.memoryCount === 1 ? "memory" : "memories"} on this device.`
      )
    );
  }

  _actions(status) {
    const download = el(
      "button.btn.btn-primary.backup-big",
      {
        type: "button",
        onclick: async () => {
          try {
            const name = await backup.downloadBackup();
            showToast(`Backup saved: ${name}`, { accent: true });
          } catch (err) {
            console.error(err);
            showToast("Backup failed — try again.");
          }
        },
        disabled: status.memoryCount === 0 ? "disabled" : null,
      },
      "⬇ Back up now"
    );

    const share = backup.canShareBackup()
      ? el(
          "button.btn.backup-big",
          {
            type: "button",
            onclick: async () => {
              try {
                await backup.shareBackup();
                showToast("Backup shared.", { accent: true });
              } catch (err) {
                if (err?.name !== "AbortError") {
                  console.error(err);
                  showToast("Sharing didn't finish — try Back up now instead.");
                }
              }
            },
            disabled: status.memoryCount === 0 ? "disabled" : null,
          },
          "📤 Share backup"
        )
      : null;

    return el(
      "section.backup-actions",
      {},
      download,
      share,
      el(
        "p.backup-hint",
        {},
        share
          ? "Back up now saves a file to this device. Share backup sends it to Google Drive, email, or any app — the safest place for a backup is a second place."
          : "Back up now saves a file to this device. Keep a copy somewhere else too — a USB drive, Google Drive, or email it to yourself."
      )
    );
  }

  async _autoSection(status) {
    const host = el("section.journal-section");
    host.append(el("h3.section-heading", {}, "Automatic backup"));

    if (!status.autoConfigured) {
      host.append(
        el(
          "p.backup-hint",
          {},
          "Set it once and forget it: choose a folder, and MemoryOS quietly saves a backup file there every day you use it."
        ),
        el(
          "button.btn",
          {
            type: "button",
            onclick: async () => {
              try {
                const folder = await backup.setupAutoBackupFolder();
                showToast(`Automatic backup on — saving to "${folder}".`, { accent: true });
              } catch (err) {
                if (err?.name !== "AbortError") {
                  console.error(err);
                  showToast("Couldn't set up that folder — try another one.");
                }
              }
            },
          },
          "Choose a backup folder"
        )
      );
      return host;
    }

    const state = await backup.runAutoBackupIfDue();
    if (state === "needs-permission") {
      host.append(
        el("p.backup-hint", {}, "Your browser paused automatic backups. One click turns them back on."),
        el(
          "button.btn.btn-primary",
          {
            type: "button",
            onclick: async () => {
              const result = await backup.reauthorizeAutoBackup();
              showToast(
                result === "ok" ? "Automatic backups are back on." : "Permission wasn't granted."
              );
              this.render();
            },
          },
          "Turn automatic backup back on"
        )
      );
    } else {
      host.append(
        el(
          "p.backup-hint",
          {},
          state === "failed"
            ? "Today's automatic backup couldn't be written — is the folder still there?"
            : "Automatic backup is on. A dated backup file is saved to your chosen folder once a day."
        )
      );
    }
    host.append(
      el(
        "button.btn.btn-quiet",
        {
          type: "button",
          onclick: async () => {
            await backup.disableAutoBackup();
            showToast("Automatic backup turned off.");
            this.render();
          },
        },
        "Turn off automatic backup"
      )
    );
    return host;
  }

  _restoreSection() {
    const input = el("input", {
      type: "file",
      accept: ".json,application/json",
      style: "display:none",
      "aria-hidden": "true",
    });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const report = await backup.restoreFromFile(file);
        const total = report.inserted + report.updated;
        showToast(
          total === 0
            ? "Already up to date — nothing in that backup was newer."
            : `Restored: ${report.inserted} added, ${report.updated} updated.`,
          { accent: true }
        );
      } catch (err) {
        showToast(err.message || "That file couldn't be restored.");
      } finally {
        input.value = "";
      }
    });

    return el(
      "section.journal-section",
      {},
      el("h3.section-heading", {}, "Restore"),
      el(
        "p.backup-hint",
        {},
        "Restoring adds what's missing and keeps whichever copy is newer. It never wipes anything — restoring the same file twice changes nothing."
      ),
      el("button.btn", { type: "button", onclick: () => input.click() }, "Restore from a backup file"),
      input
    );
  }

  _tellAFriend() {
    return el(
      "section.journal-section",
      {},
      el("h3.section-heading", {}, "Tell a friend"),
      el(
        "p.backup-hint",
        {},
        "If MemoryOS helps you, pass it on. Everyone gets their own private copy — free, no account, no ads."
      ),
      el("button.btn", { type: "button", onclick: shareApp }, "♡ Share MemoryOS")
    );
  }

  _explainer() {
    return el(
      "section.journal-section",
      {},
      el("h3.section-heading", {}, "Why this matters"),
      el(
        "p.backup-hint",
        {},
        "Your memories live only on this device — that's what keeps them private. A backup file is your safety net if this device is lost, broken, or its browser data gets cleared. One tap a week is enough."
      )
    );
  }
}
