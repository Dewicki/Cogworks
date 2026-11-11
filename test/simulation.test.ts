import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, runLevel, validateLevel } from "../src/index.ts";
import type { LevelDef, RunResult } from "../src/index.ts";

const LEFT = 2;
const RIGHT = 3;
const UP = 0;

/** A 1x1 level: values enter on the left and must leave on the right. */
function single(input: number[], expected: number[], maxLines = 10): LevelDef {
  return {
    id: "t",
    title: "t",
    description: "",
    width: 1,
    height: 1,
    maxLines,
    inputs: [{ x: 0, y: 0, port: LEFT, values: input }],
    outputs: [{ x: 0, y: 0, port: RIGHT, expected }],
  };
}

/** A 2x1 level: values enter at the left of (0,0) and leave at the right of (1,0). */
function pair(input: number[], expected: number[]): LevelDef {
  return {
    id: "t2",
    title: "t2",
    description: "",
    width: 2,
    height: 1,
    maxLines: 10,
    inputs: [{ x: 0, y: 0, port: LEFT, values: input }],
    outputs: [{ x: 1, y: 0, port: RIGHT, expected }],
  };
}

const PASS = "while true {\n  send(RIGHT, recv(LEFT))\n}";

test("one value takes three ticks through a single machine", () => {
  // tick 1: value enters the grid. tick 2: machine takes it and sends it.
  // tick 3: the output takes it.
  const r = runLevel(single([7], [7]), { "0,0": PASS });
  assert.equal(r.status, "success");
  assert.equal(r.ticks, 3);
});

test("a second machine adds latency but not throughput loss", () => {
  const level = pair([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]);
  const relay = PASS;
  const r = runLevel(level, { "0,0": relay, "1,0": relay });
  assert.equal(r.status, "success");
  assert.deepEqual(r.outputs[0], [1, 2, 3, 4, 5, 6]);
});

test("runs are deterministic", () => {
  const level = pair([5, 4, 3, 2, 1], [10, 8, 6, 4, 2]);
  const programs = {
    "0,0": PASS,
    "1,0": "while true {\n  send(RIGHT, recv(LEFT) * 2)\n}",
  };
  const a = runLevel(level, programs);
  const b = runLevel(level, programs);
  assert.deepEqual(a, b);
  assert.equal(a.status, "success");
});

test("tick() can be called one at a time and exposes state", () => {
  const sim = new Simulation(single([9], [9]), { "0,0": PASS });
  assert.equal(sim.result, undefined);
  sim.tick();
  assert.equal(sim.ticks, 1);
  assert.equal(sim.nodeAt(0, 0).inLinks[LEFT]!.value, 9); // in flight on the input link
  sim.tick();
  sim.tick();
  assert.equal((sim.result as RunResult | undefined)?.status, "success");
  sim.tick(); // no effect after the run ended
  assert.equal(sim.ticks, 3);
});

test("machine.line is available for highlighting", () => {
  const sim = new Simulation(single([1, 2], [1, 2]), { "0,0": PASS });
  sim.tick();
  sim.tick();
  assert.ok(sim.nodeAt(0, 0).machine!.line >= 1);
});

test("wrong output is reported at the first mismatch", () => {
  const r = runLevel(single([1, 2, 3], [1, 2, 4]), { "0,0": PASS });
  assert.equal(r.status, "wrong");
  assert.match(r.message, /Output 1: value #3 should be 4, but got 3/);
});

test("extra output is reported", () => {
  const r = runLevel(single([1], [1, 2]), {
    "0,0": "while true {\n  let x = recv(LEFT)\n  send(RIGHT, x)\n  send(RIGHT, x)\n}",
  });
  assert.equal(r.status, "wrong");
  assert.match(r.message, /value #2 should be 2, but got 1/);
});

test("deadlock: sender waits for a machine that never receives", () => {
  const r = runLevel(pair([1], [1]), { "0,0": PASS });
  assert.equal(r.status, "deadlock");
  assert.match(r.message, /Nothing can move/);
});

test("deadlock: two machines both waiting to receive", () => {
  const level: LevelDef = { ...pair([], [1]), inputs: [] };
  const r = runLevel(level, { "0,0": "recv(RIGHT)", "1,0": "recv(LEFT)" });
  assert.equal(r.status, "deadlock");
});

test("deadlock: all programs finished but output is missing", () => {
  const r = runLevel(single([1], [1]), { "0,0": "let x = 1" });
  assert.equal(r.status, "deadlock");
});

test("timeout: a program that never stops and never finishes the job", () => {
  const r = runLevel(single([1], [1]), { "0,0": "while true { }" }, { maxTicks: 50 });
  assert.equal(r.status, "timeout");
  assert.equal(r.ticks, 50);
});

test("syntax errors are reported with the machine position", () => {
  const r = runLevel(single([1], [1]), { "0,0": "let" });
  assert.equal(r.status, "error");
  assert.match(r.message, /Machine \(0,0\): Syntax error/);
  assert.deepEqual(r.errorAt && { x: r.errorAt.x, y: r.errorAt.y }, { x: 0, y: 0 });
});

test("runtime errors stop the run", () => {
  const r = runLevel(single([1], [1]), { "0,0": "let x = 1\nprint(x)" });
  assert.equal(r.status, "error");
  assert.match(r.message, /Undefined variable 'print'/);
  assert.equal(r.errorAt?.line, 2);
});

test("sending to a port with nothing connected is an error", () => {
  const r = runLevel(single([1], [1]), { "0,0": "send(UP, 1)" });
  assert.equal(r.status, "error");
  assert.match(r.message, /send: nothing is connected to UP/);
});

test("receiving from a port with nothing connected is an error", () => {
  const r = runLevel(single([1], [1]), { "0,0": "recv(DOWN)" });
  assert.equal(r.status, "error");
  assert.match(r.message, /recv: nothing is connected to DOWN/);
});

test("ports and values are validated", () => {
  const bad = (src: string) => runLevel(single([1], [1]), { "0,0": src });
  assert.match(bad("send(7, 1)").message, /must be a port/);
  assert.match(bad('send(RIGHT, "a")').message, /must be a number/);
  assert.match(bad('recv("left")').message, /must be a port/);
});

test("the line limit is enforced; comments and blank lines are free", () => {
  const level = single([1], [1], 3);
  const tooLong = runLevel(level, { "0,0": "let a = 1\nlet b = 2\nlet c = 3\nlet d = 4" });
  assert.equal(tooLong.status, "invalid");
  assert.match(tooLong.message, /has 4 lines; the limit is 3/);

  const ok = runLevel(level, { "0,0": "// forward everything\n\nwhile true {\n  send(RIGHT, recv(LEFT))\n}" });
  assert.notEqual(ok.status, "invalid");
});

test("programs for machines that do not exist are rejected", () => {
  const r = runLevel(single([1], [1]), { "5,5": PASS });
  assert.equal(r.status, "invalid");
  assert.match(r.message, /no machine at/);
});

test("score counts lines and programmed machines", () => {
  const r = runLevel(pair([1], [1]), { "0,0": PASS, "1,0": PASS });
  assert.equal(r.status, "success");
  assert.equal(r.score.lines, 6);
  assert.equal(r.score.nodes, 2);
  assert.equal(r.score.ticks, r.ticks);
});

test("two inputs and an interior link: values meet in the middle", () => {
  // Machine (0,0) forwards its input; machine (1,0) receives from (0,0) and the top edge.
  const level: LevelDef = {
    id: "meet",
    title: "meet",
    description: "",
    width: 2,
    height: 1,
    maxLines: 10,
    inputs: [
      { x: 0, y: 0, port: LEFT, values: [1, 2, 3] },
      { x: 1, y: 0, port: UP, values: [10, 20, 30] },
    ],
    outputs: [{ x: 1, y: 0, port: RIGHT, expected: [11, 22, 33] }],
  };
  const r = runLevel(level, {
    "0,0": PASS,
    "1,0": "while true {\n  let a = recv(LEFT)\n  let b = recv(UP)\n  send(RIGHT, a + b)\n}",
  });
  assert.equal(r.status, "success");
});

test("validateLevel rejects inconsistent definitions", () => {
  const base = single([1], [1]);
  assert.throws(() => validateLevel({ ...base, width: 0 }), /positive integers/);
  assert.throws(() => validateLevel({ ...base, outputs: [] }), /at least one output/);
  assert.throws(
    () => validateLevel({ ...pair([1], [1]), inputs: [{ x: 0, y: 0, port: RIGHT, values: [1] }] }),
    /not on the edge/,
  );
  assert.throws(
    () =>
      validateLevel({
        ...base,
        inputs: [
          { x: 0, y: 0, port: LEFT, values: [1] },
          { x: 0, y: 0, port: LEFT, values: [2] },
        ],
      }),
    /two connections/,
  );
  assert.throws(() => validateLevel({ ...base, locked: [{ x: 3, y: 0, program: "" }] }), /outside the grid/);
});

test("inputProgress counts values that entered the grid", () => {
  const level: LevelDef = {
    id: "progress",
    title: "Progress",
    description: "",
    width: 1,
    height: 1,
    maxLines: 4,
    inputs: [{ x: 0, y: 0, port: LEFT, values: [1, 2, 3] }],
    outputs: [{ x: 0, y: 0, port: RIGHT, expected: [1, 2, 3] }],
  };
  const idle = new Simulation(level);
  assert.deepEqual(idle.inputProgress(), [0]);
  idle.tick();
  assert.deepEqual(idle.inputProgress(), [1]);
  idle.tick();
  idle.tick();
  assert.deepEqual(idle.inputProgress(), [1], "nobody takes the value, so the next one waits");

  const sim = new Simulation(level, { "0,0": "while true {\n  send(RIGHT, recv(LEFT))\n}" });
  assert.equal(sim.run().status, "success");
  assert.deepEqual(sim.inputProgress(), [3]);
});
