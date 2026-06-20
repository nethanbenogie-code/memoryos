/**
 * MemoryOS — ui/update-prompt.js
 *
 * Two gentle banners:
 *  - Update available → offers to back up the user's memories to a file,
 *    then switch to the new version.
 *  - Resume backups → after a refresh, browsers drop write permission to
 *    the backup folder; this is a one-tap way to grant it again (it must
 *    run inside the click, which it does).
 */

import { bus } from "../core/events.js";
import { el } from "./components.js";
import { showToast } from "./celebration.js";
import { downloadBackup, reauthorizeAutoBackup } from "../services/backup-service.js";
import { applyUpdate } from "../services/update-service.js";

let banner = null;

function dismiss() {
  banner?.remove();
  banner = null;
}

function showBanner(node) {
  dismiss();
  banner = el("div.app-banner", { role: "dialog", "aria-live": "polite" }, node);
  document.body.append(banner);
}

/** Wire up the "new version available" flow. */
export function initUpdatePrompt() {
  bus.on("update:available", showUpdateBanner);
}

function showUpdateBanner() {
  const status = el("p.app-banner-text", {},
    "A new version of MemoryOS is ready. Your memories stay on your device — we'll save a backup file first, just to be safe."
  );

  const backupAndUpdate = el("button.btn.btn-primary", { type: "button" }, "Back up & update");
  const updateNow = el("button.btn.btn-quiet", { type: "button" }, "Update without backup");
  const later = el("button.btn.btn-quiet", { type: "button", onclick: dismiss }, "Later");

  backupAndUpdate.addEventListener("click", async () => {
    backupAndUpdate.disabled = true;
    updateNow.disabled = true;
    later.disabled = true;
    status.textContent = "Backing up your memories…";
    try {
      const name = await downloadBackup();
      status.textContent = `Saved ${name}. Updating…`;
      showToast("Backup saved. Updating…", { accent: true });
    } catch (err) {
      console.warn("[update] backup failed:", err);
      status.textContent = "Backup couldn't be saved — updating anyway.";
    }
    // Give the download a moment to start, then switch over.
    setTimeout(() => applyUpdate(), 600);
  });

  updateNow.addEventListener("click", () => {
    status.textContent = "Updating…";
    backupAndUpdate.disabled = true;
    updateNow.disabled = true;
    later.disabled = true;
    applyUpdate();
  });

  showBanner(el("div.app-banner-inner", {},
    el("div.app-banner-icon", { "aria-hidden": "true" }, "↻"),
    el("div.app-banner-body", {},
      el("strong.app-banner-title", {}, "Update available"),
      status,
      el("div.app-banner-actions", {}, backupAndUpdate, updateNow, later)
    )
  ));
}

/**
 * Show a one-tap "resume backups" banner (folder write-permission lapsed
 * after a refresh). The reauthorize call runs inside the click gesture,
 * which is required by the browser.
 */
export function showResumeBackupsBanner() {
  const msg = el("p.app-banner-text", {},
    "Automatic backups need permission again after reopening. Resume saving to your folder?"
  );
  const resume = el("button.btn.btn-primary", { type: "button" }, "Resume backups");
  const later = el("button.btn.btn-quiet", { type: "button", onclick: dismiss }, "Not now");

  resume.addEventListener("click", async () => {
    resume.disabled = true;
    try {
      const result = await reauthorizeAutoBackup();
      if (result === "ok") {
        showToast("Automatic backups resumed.", { accent: true });
        dismiss();
      } else {
        msg.textContent = "Permission wasn't granted. You can try again from Backup.";
        resume.disabled = false;
      }
    } catch {
      msg.textContent = "Couldn't resume — try again from the Backup screen.";
      resume.disabled = false;
    }
  });

  showBanner(el("div.app-banner-inner", {},
    el("div.app-banner-icon", { "aria-hidden": "true" }, "⛉"),
    el("div.app-banner-body", {},
      el("strong.app-banner-title", {}, "Resume automatic backups"),
      msg,
      el("div.app-banner-actions", {}, resume, later)
    )
  ));
}
