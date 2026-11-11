import assert from "node:assert/strict";
import type { RunResult } from "../src/level.ts";
import { test } from "node:test";
import { LEVELS } from "../src/levels.ts";
import { Progress } from "../src/progress.ts";
import { MAX_TICKS_PER_ADVANCE, Session } from "../src/session.ts";
import { SOLUTIONS } from "./solutions.ts";

const level = LEVELS[0]!;
const solution = SOLUTIONS[level.id]!;

function solved(progress = new Progress(null)): Session {
  const s = new Session(level, progress);
  for (const [key, src] of Object.entries(solution)) {
    const [x, y] = key.split(",").map(Number);
    s.setProgram(x!, y!, src);
  }
  return s;
}

test("starts idle and hides results until a run starts", () => {
  const s = new Session(level, new Progress(null));
  assert.equal(s.mode, "idle");
  assert.equal(s.result, undefined);
});

test("step makes one tick and pauses", () => {
  const s = solved();
  s.step();
  assert.equal(s.sim.ticks, 1);
  assert.equal(s.mode, "paused");
});

test("advance ticks according to speed and only while running", () => {
  const s = solved();
  s.setSpeed(10);
  assert.equal(s.advance(1000), 0, "idle does nothing");
  s.run();
  assert.equal(s.advance(500), 5);
  assert.equal(s.advance(50), 0, "fraction is carried");
  assert.equal(s.advance(50), 1);
  s.pause();
  assert.equal(s.advance(1000), 0);
});

test("advance is capped per call", () => {
  const s = solved();
  s.setSpeed(1_000_000);
  s.run();
  assert.ok(s.advance(10_000) <= MAX_TICKS_PER_ADVANCE);
});

test("a correct solution finishes with success and records the best score", () => {
  const stored: Record<string, string> = {};
  const p = new Progress({
    getItem: (k) => stored[k] ?? null,
    setItem: (k, v) => void (stored[k] = v),
  });
  const s = solved(p);
  s.setSpeed(1000);
  s.run();
  while (s.mode as string === "running") s.advance(1000);
  assert.equal(s.mode, "finished");
  assert.equal((s.result as RunResult | undefined)?.status, "success");
  assert.equal(s.newBest, true);
  assert.equal(p.isSolved(level.id), true);

  s.run(); // restarts after a finished run
  while (s.mode as string === "running") s.advance(1000);
  assert.equal(s.newBest, false, "same score is not a new best");
});

test("editing a program resets the run and is saved", () => {
  const s = solved();
  s.step();
  s.setProgram(0, 0, "send(RIGHT, 1)");
  assert.equal(s.mode, "idle");
  assert.equal(s.sim.ticks, 0);
  assert.equal(s.getProgram(0, 0), "send(RIGHT, 1)");
});

test("locked machines cannot be edited", () => {
  const chain = LEVELS.find((l) => l.locked && l.locked.length > 0)!;
  const s = new Session(chain, new Progress(null));
  const l = chain.locked![0]!;
  assert.equal(s.isLocked(l.x, l.y), true);
  s.setProgram(l.x, l.y, "send(RIGHT, 0)");
  assert.equal(s.getProgram(l.x, l.y), l.program);
});

test("an invalid program reports its result only after Run", () => {
  const s = new Session(level, new Progress(null));
  s.setProgram(0, 0, "1\n2\n3\n4\n5\n6");
  assert.equal(s.result, undefined);
  s.run();
  assert.equal((s.result as RunResult | undefined)?.status, "invalid");
  assert.equal(s.mode, "finished");
});

test("programs are loaded from saved progress", () => {
  const stored: Record<string, string> = {};
  const p = new Progress({
    getItem: (k) => stored[k] ?? null,
    setItem: (k, v) => void (stored[k] = v),
  });
  solved(p);
  const again = new Session(level, p);
  assert.equal(again.getProgram(0, 0), solution["0,0"]);
});
