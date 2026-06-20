/**
 * MemoryOS — services/storage-service.js
 *
 * Database storage location and quota management.
 * Provides visibility into where data is stored, how much space is used,
 * and options to protect the database from browser clearing.
 */

import * as repo from "../data/repository.js";

/**
 * Get information about where the database is stored.
 */
export async function getStorageInfo() {
  const [autoBackupDir, storageEstimate] = await Promise.all([
    repo.getMeta("autoBackupDir"),
    getStorageEstimate(),
  ]);

  const storageUsed = storageEstimate.usage || 0;
  const storageQuota = storageEstimate.quota || 0;
  const persistent = storageEstimate.persistent || false;

  return {
    autoBackupDir: autoBackupDir?.name || null,
    storageUsed,
    storageQuota,
    persistent,
    storagePercent: storageQuota ? Math.round((storageUsed / storageQuota) * 100) : 0,
  };
}

/**
 * Request persistent storage (prevents browser from clearing the database).
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    return { success: false, reason: "Not supported on this browser" };
  }

  try {
    const persistent = await navigator.storage.persist();
    return {
      success: persistent,
      reason: persistent ? "Granted" : "User denied",
    };
  } catch (err) {
    return {
      success: false,
      reason: err.message || "Error requesting permission",
    };
  }
}

/**
 * Format storage information for display.
 */
export function formatStorageInfo(info) {
  const used = formatBytes(info.storageUsed);
  const quota = formatBytes(info.storageQuota);
  const status = info.persistent ? "Protected" : "Not protected";

  return {
    display: `${used} / ${quota} (${info.storagePercent}%) — ${status}`,
    ...info,
  };
}

/**
 * Check if persistent storage is supported on this browser.
 */
export function isPersistentStorageSupported() {
  return !!navigator.storage?.persist;
}

/** @private */
async function getStorageEstimate() {
  try {
    if (!navigator.storage?.estimate) {
      return { usage: 0, quota: 0, persistent: false };
    }

    const estimate = await navigator.storage.estimate();
    const persistent = await navigator.storage.persisted?.() || false;

    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      persistent,
    };
  } catch {
    return { usage: 0, quota: 0, persistent: false };
  }
}

/** @private */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
