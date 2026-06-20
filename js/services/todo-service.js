/**
 * MemoryOS — services/todo-service.js
 *
 * Enhanced to-do list functionality with local storage caching,
 * task templates, recurring tasks, and quick list operations.
 * All tasks are stored in the main IndexedDB but cached locally
 * for instant load times and offline quick-capture.
 */

import { bus } from "../core/events.js";
import { MemoryType, TaskStatus, Priority, createMemory } from "../data/models.js";
import * as repo from "../data/repository.js";

const CACHE_KEY = "memoryos-todo-cache";
const TEMPLATES_KEY = "memoryos-task-templates";
const RECURRING_KEY = "memoryos-recurring-tasks";

/* ========================= LOCAL STORAGE CACHE ========================= */

/**
 * Quick in-memory cache of tasks for instant UI load.
 * Syncs with IndexedDB on changes.
 */
let _cachedTasks = null;
let _cachePromise = null;

/**
 * Load all tasks from cache (or IndexedDB if cache is stale).
 * Returns immediately if cache is warm.
 */
export async function loadTasks() {
  if (_cachedTasks) return _cachedTasks;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async () => {
    try {
      // Try cached version first (fast)
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && Date.now() - data.timestamp < 60000) {
          // Cache is less than 1 minute old
          _cachedTasks = data.tasks || [];
          _cachePromise = null;
          return _cachedTasks;
        }
      }
    } catch {}

    // Load from database and refresh cache
    const tasks = await repo.listMemoriesByType(MemoryType.TASK);
    _cachedTasks = tasks;
    saveTasksToCache(tasks);
    _cachePromise = null;
    return tasks;
  })();

  return _cachePromise;
}

/**
 * Save tasks to localStorage for instant load next time.
 */
function saveTasksToCache(tasks) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        tasks: tasks.slice(0, 100),
      })
    );
  } catch (err) {
    console.warn("[todo] failed to cache tasks:", err);
  }
}

/**
 * Clear the task cache (called after create/update/delete).
 */
function invalidateCache() {
  _cachedTasks = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

/* ========================= TASK OPERATIONS ========================= */

/**
 * Create a new task with optional quick properties.
 */
export async function createTask(fields = {}) {
  const task = createMemory({
    type: MemoryType.TASK,
    title: fields.title || "",
    content: fields.content || "",
    status: TaskStatus.PENDING,
    priority: fields.priority || Priority.MEDIUM,
    dueAt: fields.dueAt || null,
    tags: fields.tags || [],
    extra: {
      ...(fields.extra || {}),
      recurringPattern: fields.recurringPattern || null,
    },
  });
  await repo.insertMemory(task);
  bus.emit("memory:created", { memory: task });
  invalidateCache();
  return task;
}

/**
 * Update task status (pending → in_progress → completed).
 */
export async function updateTaskStatus(taskId, newStatus) {
  const task = await repo.getMemory(taskId);
  if (!task) throw new Error("Task not found");

  task.status = newStatus;
  task.modifiedAt = new Date().toISOString();

  if (newStatus === TaskStatus.COMPLETED) {
    task.extra.completedAt = new Date().toISOString();
  } else if (newStatus !== TaskStatus.COMPLETED && task.extra.completedAt) {
    delete task.extra.completedAt;
  }

  await repo.updateMemory(task);
  bus.emit("memory:updated", { memory: task });
  invalidateCache();
  return task;
}

/**
 * Bulk update task statuses.
 */
export async function bulkUpdateStatus(taskIds, newStatus) {
  const tasks = await Promise.all(taskIds.map((id) => repo.getMemory(id)));
  const now = new Date().toISOString();

  for (const task of tasks.filter(Boolean)) {
    task.status = newStatus;
    task.modifiedAt = now;
    if (newStatus === TaskStatus.COMPLETED) {
      task.extra.completedAt = now;
    }
    await repo.updateMemory(task);
    bus.emit("memory:updated", { memory: task });
  }

  invalidateCache();
}

/**
 * Delete a task (soft-delete).
 */
export async function deleteTask(taskId) {
  const task = await repo.getMemory(taskId);
  if (!task) throw new Error("Task not found");

  task.deletedAt = new Date().toISOString();
  task.modifiedAt = new Date().toISOString();
  await repo.updateMemory(task);
  bus.emit("memory:deleted", { memory: task });
  invalidateCache();
}

/**
 * Bulk delete multiple tasks.
 */
export async function bulkDeleteTasks(taskIds) {
  const now = new Date().toISOString();
  const tasks = await Promise.all(taskIds.map((id) => repo.getMemory(id)));

  for (const task of tasks.filter(Boolean)) {
    task.deletedAt = now;
    task.modifiedAt = now;
    await repo.updateMemory(task);
    bus.emit("memory:deleted", { memory: task });
  }

  invalidateCache();
}

/* ========================= TASK FILTERING ========================= */

/**
 * Get tasks grouped by status with optional time filtering.
 */
export async function getTaskBoard(filter = null) {
  const tasks = await loadTasks();
  const nonDeleted = tasks.filter((t) => !t.deletedAt);

  let filtered = nonDeleted;
  if (filter === "today") {
    const today = new Date().toISOString().split("T")[0];
    filtered = nonDeleted.filter(
      (t) => t.dueAt && t.dueAt.startsWith(today) && t.status !== TaskStatus.COMPLETED
    );
  } else if (filter === "overdue") {
    const now = new Date().toISOString();
    filtered = nonDeleted.filter(
      (t) => t.dueAt && t.dueAt < now && t.status !== TaskStatus.COMPLETED
    );
  } else if (filter === "this-week") {
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    filtered = nonDeleted.filter(
      (t) => t.dueAt && t.dueAt <= weekEnd && t.status !== TaskStatus.COMPLETED
    );
  } else if (filter === "completed") {
    filtered = nonDeleted.filter((t) => t.status === TaskStatus.COMPLETED);
  }

  return {
    pending: filtered.filter((t) => t.status === TaskStatus.PENDING),
    inProgress: filtered.filter((t) => t.status === TaskStatus.IN_PROGRESS),
    completed: filtered.filter((t) => t.status === TaskStatus.COMPLETED),
  };
}

/**
 * Quick count of high-priority pending tasks.
 */
export async function getTaskStats() {
  const tasks = await loadTasks();
  const nonDeleted = tasks.filter((t) => !t.deletedAt);
  const now = new Date().toISOString();

  const pending = nonDeleted.filter((t) => t.status === TaskStatus.PENDING).length;
  const overdue = nonDeleted.filter(
    (t) => t.dueAt && t.dueAt < now && t.status !== TaskStatus.COMPLETED
  ).length;
  const today = nonDeleted.filter(
    (t) => t.dueAt && t.dueAt.startsWith(new Date().toISOString().split("T")[0]) && t.status !== TaskStatus.COMPLETED
  ).length;
  const completed = nonDeleted.filter((t) => t.status === TaskStatus.COMPLETED).length;

  return { pending, overdue, today, completed };
}

/* ========================= TASK TEMPLATES ========================= */

/**
 * Save a task as a reusable template.
 */
export function saveTaskTemplate(name, taskFields) {
  try {
    const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "{}");
    templates[name] = {
      title: taskFields.title,
      content: taskFields.content,
      priority: taskFields.priority,
      tags: taskFields.tags,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all saved task templates.
 */
export function getTaskTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Create a task from a template.
 */
export async function createTaskFromTemplate(templateName) {
  const templates = getTaskTemplates();
  const template = templates[templateName];
  if (!template) throw new Error("Template not found");

  return createTask({
    title: template.title,
    content: template.content,
    priority: template.priority,
    tags: template.tags,
  });
}

/**
 * Delete a task template.
 */
export function deleteTaskTemplate(name) {
  try {
    const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "{}");
    delete templates[name];
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

/* ========================= RECURRING TASKS ========================= */

/**
 * Mark a recurring task pattern.
 */
export async function setRecurringPattern(taskId, pattern) {
  const task = await repo.getMemory(taskId);
  if (!task) throw new Error("Task not found");

  task.extra.recurringPattern = pattern;
  task.modifiedAt = new Date().toISOString();
  await repo.updateMemory(task);
  invalidateCache();
}

/**
 * Get recurring patterns for a week/day.
 */
export async function getRecurringPatterns() {
  try {
    return JSON.parse(localStorage.getItem(RECURRING_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Auto-create tasks from recurring patterns (call daily at startup).
 */
export async function applyRecurringTasks() {
  const tasks = await loadTasks();
  const today = new Date().toISOString().split("T")[0];
  const lastRun = localStorage.getItem("memoryos-recurring-last-run");

  if (lastRun === today) return;

  const dailies = tasks.filter(
    (t) => t.extra.recurringPattern === "daily" && !t.deletedAt
  );
  const weeklies = tasks.filter(
    (t) => t.extra.recurringPattern === "weekly" && !t.deletedAt
  );

  for (const task of dailies) {
    const todayInstance = tasks.find(
      (t) => t.extra.fromRecurring === task.id && t.createdAt.startsWith(today)
    );
    if (!todayInstance) {
      await createTask({
        title: task.title,
        content: task.content,
        priority: task.priority,
        tags: task.tags,
        extra: { fromRecurring: task.id },
      });
    }
  }

  localStorage.setItem("memoryos-recurring-last-run", today);
}

bus.on("memory:created", invalidateCache);
bus.on("memory:updated", invalidateCache);
bus.on("memory:deleted", invalidateCache);
