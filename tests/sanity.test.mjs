// Sanity tests for MemoryOS pure logic (everything that doesn't need a browser).
import { uuidv7, timestampOf } from "../js/core/ids.js";
import { EventBus, bus } from "../js/core/events.js";
import { createMemory, createLink, normalizeTags, deriveTitle, MemoryType, TaskStatus } from "../js/data/models.js";
import { SearchIndex, tokenize } from "../js/services/search-service.js";
import { extractTags } from "../js/services/memory-service.js";
import { dayKey, dayBounds } from "../js/services/journal-service.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.error("FAIL  " + name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- ids ---
test("uuidv7 format", () => {
  const id = uuidv7();
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), id);
});
test("uuidv7 ids are time-ordered and unique", () => {
  const ids = Array.from({length: 500}, () => uuidv7());
  assert(new Set(ids).size === 500, "duplicates");
  const sorted = [...ids].sort();
  assert(JSON.stringify(sorted) === JSON.stringify(ids), "not monotone-friendly");
});
test("timestampOf round-trip", () => {
  const now = Date.now();
  const t = timestampOf(uuidv7(now)).getTime();
  assert(Math.abs(t - now) <= 1, `delta ${t - now}`);
});

// --- events ---
test("event bus on/emit/off + error isolation", () => {
  const b = new EventBus();
  let hits = 0;
  const off = b.on("x", () => hits++);
  b.on("x", () => { throw new Error("boom"); });
  b.on("x", () => hits++);
  b.emit("x");
  assert(hits === 2, "handlers should run despite one throwing");
  off();
  b.emit("x");
  assert(hits === 3, "unsubscribe failed");
});

// --- models ---
test("createMemory defaults + occurredAt fallback", () => {
  const m = createMemory({ title: "Hello", content: "World" });
  assert(m.type === MemoryType.NOTE && m.occurredAt === m.createdAt && m.deletedAt === null);
});
test("task gets pending status; note gets null", () => {
  assert(createMemory({ type: "task", title: "t" }).status === TaskStatus.PENDING);
  assert(createMemory({ title: "n" }).status === null);
});
test("title derived from content when missing", () => {
  const m = createMemory({ content: "First line here\nmore" });
  assert(m.title === "First line here", m.title);
});
test("rejects empty memory and unknown type", () => {
  let threw = 0;
  try { createMemory({}); } catch { threw++; }
  try { createMemory({ type: "alien", title: "x" }); } catch { threw++; }
  assert(threw === 2);
});
test("normalizeTags dedupes, lowercases, strips #", () => {
  assert(JSON.stringify(normalizeTags(["#Work", "work", " POS "])) === JSON.stringify(["work", "pos"]));
});
test("createLink validates", () => {
  const l = createLink("a", "b");
  assert(l.sourceId === "a" && l.targetId === "b");
  let threw = false;
  try { createLink("a", "a"); } catch { threw = true; }
  assert(threw, "self-link allowed");
});
test("deriveTitle truncates", () => {
  assert(deriveTitle("x".repeat(200)).length === 80);
});

// --- capture parsing ---
test("extractTags pulls inline #tags out of text", () => {
  const { text, tags } = extractTags("Fix the BIR export #apos #urgent\nDetails here");
  assert(JSON.stringify(tags) === JSON.stringify(["apos", "urgent"]), tags.join());
  assert(text.startsWith("Fix the BIR export"), text);
  assert(!text.includes("#"), text);
});

// --- search ---
test("search: AND terms, prefix on last term, filters", () => {
  const idx = new SearchIndex();
  const m1 = createMemory({ title: "APOS BIR transmitter", tags: ["apos"], occurredAt: "2026-06-10T00:00:00Z" });
  const m2 = createMemory({ type: "task", title: "Fix MLEA receipt numbering", tags: ["mlea"], occurredAt: "2026-06-11T00:00:00Z" });
  const m3 = createMemory({ title: "Bible study notes", content: "Strong's concordance", occurredAt: "2026-06-12T00:00:00Z" });
  idx.build([m1, m2, m3]);
  assert(idx.search("bir trans").length === 1, "prefix match");
  assert(idx.search("fix receipt").length === 1, "AND");
  assert(idx.search("", { tag: "mlea" })[0].id === m2.id, "tag filter");
  assert(idx.search("", { type: "task" }).length === 1, "type filter");
  idx.update({ ...m3, deletedAt: "2026-06-12T01:00:00Z" });
  assert(idx.search("concordance").length === 0, "deleted stays indexed");
  const counts = idx.tagCounts();
  assert(counts.length === 2, "tagCounts");
});
test("tokenize is unicode-friendly", () => {
  assert(JSON.stringify(tokenize("Magandang araw, kaibigan!")) === JSON.stringify(["magandang","araw","kaibigan"]));
});

// --- journal day math ---
test("dayKey and dayBounds are consistent", () => {
  const key = dayKey(new Date(2026, 5, 13, 15, 30));
  assert(key === "2026-06-13", key);
  const { startIso, endIso } = dayBounds(key);
  assert(new Date(endIso) - new Date(startIso) === 86400000, "not 24h");
});

// --- import graph of UI modules (no DOM access at import time) ---
test("UI modules import cleanly without a DOM", async () => {
  await import("../js/ui/components.js");
  await import("../js/ui/capture.js");
  await import("../js/ui/timeline-view.js");
  await import("../js/ui/search-view.js");
  await import("../js/ui/tasks-view.js");
  await import("../js/ui/journal-view.js");
  await import("../js/data/db.js");
  await import("../js/data/repository.js");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
