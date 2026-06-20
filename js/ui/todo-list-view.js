/**
 * MemoryOS — ui/todo-list-view.js
 *
 * Quick to-do list view: a dedicated interface for rapid task management
 * with filtering, bulk operations, and templates. Complements the main
 * Tasks board with a simpler, faster flow for power users.
 */

import { bus } from "../core/events.js";
import { Priority, TaskStatus } from "../data/models.js";
import * as todo from "../services/todo-service.js";
import { el, emptyState } from "./components.js";
import { showToast } from "./celebration.js";

const FILTERS = [
  { id: null, label: "All tasks" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "this-week", label: "This week" },
  { id: "completed", label: "Completed" },
];

const PRIORITY_LABELS = {
  [Priority.HIGH]: "🔴",
  [Priority.MEDIUM]: "🟡",
  [Priority.LOW]: "🟢",
};

export class TodoListView {
  constructor(container) {
    this.container = container;
    this.unsubscribes = [];
    this.currentFilter = null;
    this.selectedTasks = new Set();
  }

  async mount() {
    const refresh = () => this.render();
    this.unsubscribes = [
      bus.on("memory:created", refresh),
      bus.on("memory:updated", refresh),
      bus.on("memory:deleted", refresh),
    ];
    await this.render();
  }

  unmount() {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
  }

  async render() {
    const stats = await todo.getTaskStats();
    const board = await todo.getTaskBoard(this.currentFilter);

    this.container.replaceChildren(
      el("header.view-head", {},
        el("h2.view-title", {}, "Quick To-Do"),
        this._quickStats(stats)
      ),
      this._filters(),
      this._toolbar(board),
      this._taskList(board),
      this._templateSection()
    );
  }

  _quickStats(stats) {
    return el("div.todo-stats", {},
      el("span.stat", { title: "Pending tasks" }, `${stats.pending} pending`),
      stats.overdue > 0 ? el("span.stat.overdue", {}, `⚠️ ${stats.overdue} overdue`) : null,
      el("span.stat", { title: "Due today" }, `📅 ${stats.today} today`)
    );
  }

  _filters() {
    return el("div.todo-filters", { role: "toolbar", "aria-label": "Filter tasks" },
      FILTERS.map((f) =>
        el("button.chip.chip-select", {
          type: "button",
          "aria-pressed": String(this.currentFilter === f.id),
          onclick: () => {
            this.currentFilter = f.id;
            this.selectedTasks.clear();
            this.render();
          },
        }, f.label)
      )
    );
  }

  _toolbar(board) {
    const allTasks = [
      ...board.pending,
      ...board.inProgress,
      ...board.completed,
    ];
    const hasSelected = this.selectedTasks.size > 0;

    return el("div.todo-toolbar", {},
      el("label.checkbox-label", {},
        el("input", {
          type: "checkbox",
          checked: this.selectedTasks.size === allTasks.length && allTasks.length > 0,
          onchange: (e) => {
            if (e.target.checked) {
              this.selectedTasks = new Set(allTasks.map((t) => t.id));
            } else {
              this.selectedTasks.clear();
            }
            this.render();
          },
        }),
        "Select all"
      ),
      hasSelected
        ? el("div.todo-actions", {},
            el("button.btn.btn-quiet", {
              type: "button",
              onclick: async () => {
                await todo.bulkUpdateStatus([...this.selectedTasks], TaskStatus.COMPLETED);
                this.selectedTasks.clear();
                showToast(`Marked as completed`);
                this.render();
              },
            }, "✅ Complete"),
            el("button.btn.btn-quiet.btn-danger", {
              type: "button",
              onclick: async () => {
                if (confirm(`Delete ${this.selectedTasks.size} task(s)?`)) {
                  await todo.bulkDeleteTasks([...this.selectedTasks]);
                  this.selectedTasks.clear();
                  showToast(`Deleted task(s)`);
                  this.render();
                }
              },
            }, "🗑️ Delete")
          )
        : null
    );
  }

  _taskList(board) {
    const allTasks = [
      ...board.pending,
      ...board.inProgress,
      ...board.completed,
    ];

    if (!allTasks.length) {
      return emptyState(
        "No tasks in this view",
        "Try a different filter or create your first task."
      );
    }

    return el("div.todo-list", {},
      allTasks.map((task) => this._taskCard(task))
    );
  }

  _taskCard(task) {
    const isSelected = this.selectedTasks.has(task.id);
    const priorityIcon = PRIORITY_LABELS[task.priority] || "⚪";
    const dueDate = task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "";
    const isOverdue = task.dueAt && task.dueAt < new Date().toISOString() && task.status !== TaskStatus.COMPLETED;

    return el("div.todo-item", { "data-status": task.status },
      el("label.checkbox-label", {},
        el("input", {
          type: "checkbox",
          checked: isSelected,
          onchange: (e) => {
            if (e.target.checked) {
              this.selectedTasks.add(task.id);
            } else {
              this.selectedTasks.delete(task.id);
            }
            this.render();
          },
        }),
        el("span.todo-checkbox", {})
      ),
      el("div.todo-content", {},
        el("div.todo-header", {},
          priorityIcon,
          el("span.todo-title", {
            style: task.status === TaskStatus.COMPLETED ? "text-decoration:line-through;" : "",
          }, task.title),
          isOverdue ? el("span.todo-overdue", {}, "⚠️ Overdue") : null
        ),
        dueDate ? el("div.todo-due", {}, `📅 ${dueDate}`) : null,
        task.tags?.length ? el("div.todo-tags", {},
          task.tags.map((tag) => el("span.tag", {}, `#${tag}`))
        ) : null
      ),
      el("div.todo-actions", {},
        task.status !== TaskStatus.COMPLETED
          ? el("button.btn.btn-quiet", {
              type: "button",
              title: "Mark complete",
              onclick: async () => {
                await todo.updateTaskStatus(task.id, TaskStatus.COMPLETED);
                this.render();
              },
            }, "✓")
          : el("button.btn.btn-quiet", {
              type: "button",
              title: "Reopen task",
              onclick: async () => {
                await todo.updateTaskStatus(task.id, TaskStatus.PENDING);
                this.render();
              },
            }, "↺")
      )
    );
  }

  _templateSection() {
    const templates = todo.getTaskTemplates();
    const hasTemplates = Object.keys(templates).length > 0;

    return el("section.todo-templates", {},
      el("h3", {}, "Quick templates"),
      hasTemplates
        ? el("div.template-grid", {},
            Object.entries(templates).map(([name]) =>
              el("button.btn.btn-small", {
                type: "button",
                onclick: async () => {
                  await todo.createTaskFromTemplate(name);
                  showToast(`Created task from template`);
                  this.render();
                },
              }, `+ ${name}`)
            )
          )
        : el("p", {}, "No templates saved yet.")
    );
  }
}