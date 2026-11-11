import assert from "node:assert/strict";
import { test } from "node:test";
import { Progress } from "../src/progress.ts";
import type { StorageLike } from "../src/progress.ts";

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("quota");
  },
};

test("programs round-trip per level", () => {
  const p = new Progress(new MemoryStorage());
  assert.deepEqual(p.getPrograms("a"), {});
  assert.equal(p.setPrograms("a", { "0,0": "send(RIGHT, 1)" }), true);
  assert.deepEqual(p.getPrograms("a"), { "0,0": "send(RIGHT, 1)" });
  assert.deepEqual(p.getPrograms("b"), {});
});

test("corrupt stored data is ignored", () => {
  const s = new MemoryStorage();
  s.setItem("cogworks:v1:programs:a", "{not json");
  s.setItem("cogworks:v1:best:a", JSON.stringify({ ticks: "x" }));
  s.setItem("cogworks:v1:programs:b", JSON.stringify({ "0,0": 5, "bad": "x", "1,0": "ok" }));
  const p = new Progress(s);
  assert.deepEqual(p.getPrograms("a"), {});
  assert.equal(p.getBest("a"), undefined);
  assert.deepEqual(p.getPrograms("b"), { "1,0": "ok" });
});

test("best score keeps the minimum of each metric", () => {
  const p = new Progress(new MemoryStorage());
  assert.equal(p.isSolved("a"), false);
  assert.equal(p.recordScore("a", { ticks: 20, lines: 5, nodes: 2 }), true);
  assert.equal(p.isSolved("a"), true);
  assert.equal(p.recordScore("a", { ticks: 25, lines: 6, nodes: 2 }), false);
  assert.equal(p.recordScore("a", { ticks: 30, lines: 3, nodes: 2 }), true);
  assert.deepEqual(p.getBest("a"), { ticks: 20, lines: 3, nodes: 2 });
});

test("a failing storage never throws", () => {
  const p = new Progress(throwing);
  assert.deepEqual(p.getPrograms("a"), {});
  assert.equal(p.setPrograms("a", {}), false);
  assert.equal(p.getBest("a"), undefined);
  p.recordScore("a", { ticks: 1, lines: 1, nodes: 1 });
});

test("null storage works as no persistence", () => {
  const p = new Progress(null);
  assert.equal(p.setPrograms("a", { "0,0": "x" }), false);
  assert.deepEqual(p.getPrograms("a"), {});
});
