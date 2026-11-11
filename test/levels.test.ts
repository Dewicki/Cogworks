import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, runLevel, validateLevel } from "../src/index.ts";
import { SOLUTIONS } from "./solutions.ts";

test("every level has a reference solution", () => {
  assert.deepEqual(LEVELS.map((l) => l.id).sort(), Object.keys(SOLUTIONS).sort());
});

test("level ids are unique", () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
});

for (const level of LEVELS) {
  test(`level '${level.id}' is well-formed`, () => {
    validateLevel(level);
  });

  test(`level '${level.id}' can be solved`, () => {
    const result = runLevel(level, SOLUTIONS[level.id]);
    assert.equal(result.message, "All outputs are correct.");
    assert.equal(result.status, "success");
    level.outputs.forEach((o, i) => assert.deepEqual(result.outputs[i], o.expected));
    assert.ok(result.score.ticks > 0 && result.score.ticks < 2000);
    assert.ok(result.score.nodes >= 1);
  });

  test(`level '${level.id}' is not solved by an empty program`, () => {
    const result = runLevel(level, {});
    assert.notEqual(result.status, "success");
  });
}

test("the reference solutions fit the line limits", () => {
  for (const level of LEVELS) {
    const result = runLevel(level, SOLUTIONS[level.id]);
    assert.notEqual(result.status, "invalid", level.id);
  }
});

test("a wrong solution is caught with a useful message", () => {
  const level = LEVELS.find((l) => l.id === "double")!;
  const result = runLevel(level, { "0,0": "while true {\n  send(RIGHT, recv(LEFT) * 3)\n}" });
  assert.equal(result.status, "wrong");
  assert.match(result.message, /value #1 should be 2, but got 3/);
});

test("the locked machine in 'chain' cannot be replaced", () => {
  const level = LEVELS.find((l) => l.id === "chain")!;
  const result = runLevel(level, { "0,0": "while true { }" });
  assert.equal(result.status, "invalid");
  assert.match(result.message, /locked/);
});
