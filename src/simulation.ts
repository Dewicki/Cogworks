import { BLOCK, CogError, Machine, typeName } from "./cog.ts";
import type { HostFunction, Value } from "./cog.ts";
import { DX, DY, OPPOSITE, PORT_GLOBALS, PORT_NAMES, countLines, nodeKey, validateLevel } from "./level.ts";
import type { LevelDef, Port, Programs, RunResult, RunStatus, Score } from "./level.ts";

/**
 * One direction of one connection between two machines (or a machine and the
 * edge of the grid). A value sent over a link stays "in flight" until the
 * receiver takes it; the sender is released a tick later.
 *
 * Within a tick everybody reads the state committed at the end of the previous
 * tick and only stages changes (sendReq, takeReq, ackClear). The changes are
 * committed together at the end of the tick, so results never depend on the
 * order in which machines are stepped.
 */
export class Link {
  /** Value in flight, or null. */
  value: number | null = null;
  /** The last value was taken; the sender may finish its send. */
  ack = false;
  sendReq: number | null = null;
  takeReq = false;
  ackClear = false;
}

export interface SimNode {
  readonly x: number;
  readonly y: number;
  readonly locked: boolean;
  readonly source: string;
  /** null for an empty program. */
  machine: Machine | null;
  readonly inLinks: (Link | null)[];
  readonly outLinks: (Link | null)[];
}

interface Feeder {
  readonly link: Link;
  readonly values: readonly number[];
  index: number;
}

interface Sink {
  readonly link: Link;
  readonly expected: readonly number[];
  readonly received: number[];
}

export interface SimulationOptions {
  /** Give up after this many ticks. Default 10,000. */
  maxTicks?: number;
}

function toPort(fn: string, value: Value | undefined): Port {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${fn}: the first argument must be a port (UP, DOWN, LEFT or RIGHT)`);
  }
  return value as Port;
}

/**
 * A level being played: a grid of Cog machines advancing in lockstep.
 * Call tick() repeatedly (for animation) or run() to finish at once.
 */
export class Simulation {
  readonly level: LevelDef;
  readonly nodes: SimNode[] = [];
  readonly links: Link[] = [];
  private readonly feeders: Feeder[] = [];
  private readonly sinks: Sink[] = [];
  private readonly maxTicks: number;
  private readonly score: Score;
  private _ticks = 0;
  private _result: RunResult | undefined;

  constructor(level: LevelDef, programs: Programs = {}, options: SimulationOptions = {}) {
    validateLevel(level);
    this.level = level;
    this.maxTicks = options.maxTicks ?? 10_000;

    // Which programs run where.
    const lockedAt = new Map<string, string>();
    for (const l of level.locked ?? []) lockedAt.set(nodeKey(l.x, l.y), l.program);

    let lines = 0;
    let programmed = 0;
    let invalid: string | undefined;

    for (const key of Object.keys(programs)) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.width || y >= level.height) {
        invalid ??= `There is no machine at (${key}).`;
      } else if (lockedAt.has(key)) {
        invalid ??= `The machine at (${key}) is locked.`;
      }
    }

    const links = new Map<string, Link>();
    const outLink = (x: number, y: number, port: number): Link => {
      const key = `${x},${y},${port}`;
      let link = links.get(key);
      if (link === undefined) {
        link = new Link();
        links.set(key, link);
        this.links.push(link);
      }
      return link;
    };

    const startupErrors: { x: number; y: number; error: CogError }[] = [];

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const key = nodeKey(x, y);
        const locked = lockedAt.has(key);
        const source = locked ? lockedAt.get(key)! : (programs[key] ?? "");

        if (!locked && source.trim() !== "") {
          const count = countLines(source);
          lines += count;
          programmed++;
          if (count > level.maxLines) {
            invalid ??= `The machine at (${x},${y}) has ${count} lines; the limit is ${level.maxLines}.`;
          }
        }

        const inLinks: (Link | null)[] = [null, null, null, null];
        const outLinks: (Link | null)[] = [null, null, null, null];
        for (let p = 0; p < 4; p++) {
          const nx = x + DX[p]!;
          const ny = y + DY[p]!;
          if (nx >= 0 && ny >= 0 && nx < level.width && ny < level.height) {
            outLinks[p] = outLink(x, y, p);
            inLinks[p] = outLink(nx, ny, OPPOSITE[p]!);
          }
        }

        const node: SimNode = {
          x,
          y,
          locked,
          source,
          machine: null,
          inLinks,
          outLinks,
        };
        node.machine = this.createMachine(node, (error) => startupErrors.push({ x, y, error }));
        this.nodes.push(node);
      }
    }

    for (const input of level.inputs) {
      const link = new Link();
      this.links.push(link);
      this.nodeAt(input.x, input.y).inLinks[input.port] = link;
      this.feeders.push({ link, values: input.values, index: 0 });
    }
    for (const output of level.outputs) {
      const link = new Link();
      this.links.push(link);
      this.nodeAt(output.x, output.y).outLinks[output.port] = link;
      this.sinks.push({ link, expected: output.expected, received: [] });
    }

    this.score = { ticks: 0, lines, nodes: programmed };

    if (invalid !== undefined) {
      this._result = this.finish("invalid", invalid);
    } else if (startupErrors.length > 0) {
      const { x, y, error } = startupErrors[0]!;
      this._result = this.finish("error", `Machine (${x},${y}): ${error.format(this.nodeAt(x, y).source)}`, {
        x,
        y,
        line: error.line,
        col: error.col,
      });
    }
  }

  get ticks(): number {
    return this._ticks;
  }

  /** Set once the run is over (success or failure). */
  get result(): RunResult | undefined {
    return this._result;
  }

  nodeAt(x: number, y: number): SimNode {
    return this.nodes[y * this.level.width + x]!;
  }

  /** How many values have entered the grid so far through each input, in the order of level.inputs. */
  inputProgress(): number[] {
    return this.feeders.map((f) => f.index);
  }

  /** Values received so far at each output. */
  outputs(): number[][] {
    return this.sinks.map((s) => s.received.slice());
  }

  private createMachine(node: SimNode, onError: (e: CogError) => void): Machine | null {
    if (node.source.trim() === "") return null;

    const send: HostFunction = (args) => {
      const port = toPort("send", args[0]);
      const link = node.outLinks[port];
      if (link === null || link === undefined) {
        throw new Error(`send: nothing is connected to ${PORT_NAMES[port]}`);
      }
      const value = args[1];
      if (typeof value !== "number") {
        throw new Error(`send: the value must be a number, got ${typeName(value as Value)}`);
      }
      if (link.ack) {
        link.ackClear = true;
        return null;
      }
      if (link.value === null && link.sendReq === null) link.sendReq = value;
      return BLOCK;
    };

    const recv: HostFunction = (args) => {
      const port = toPort("recv", args[0]);
      const link = node.inLinks[port];
      if (link === null || link === undefined) {
        throw new Error(`recv: nothing is connected to ${PORT_NAMES[port]}`);
      }
      if (link.value !== null && !link.takeReq) {
        link.takeReq = true;
        return link.value;
      }
      return BLOCK;
    };

    try {
      return new Machine(node.source, { globals: { ...PORT_GLOBALS }, builtins: { send, recv } });
    } catch (e) {
      if (e instanceof CogError) {
        onError(e);
        return null;
      }
      throw e;
    }
  }

  /** Advance every machine by one step. Does nothing once the run is over. */
  tick(): void {
    if (this._result !== undefined) return;
    this._ticks++;
    let progress = false;

    // Edge connections act like machines that always want to send / receive.
    for (const f of this.feeders) {
      if (f.link.ack) f.link.ackClear = true;
      if (f.link.value === null && f.index < f.values.length) f.link.sendReq = f.values[f.index++]!;
    }
    for (const s of this.sinks) {
      if (s.link.value !== null && !s.link.takeReq) {
        s.link.takeReq = true;
        s.received.push(s.link.value);
      }
    }

    let failure: { x: number; y: number; error: CogError } | undefined;
    for (const node of this.nodes) {
      if (node.machine === null) continue;
      const r = node.machine.step();
      if (r.status === "running") progress = true;
      if (r.status === "error" && failure === undefined) {
        failure = { x: node.x, y: node.y, error: r.error! };
      }
    }

    for (const l of this.links) {
      if (l.takeReq) {
        l.value = null;
        l.ack = true;
        l.takeReq = false;
        progress = true;
      }
      if (l.sendReq !== null) {
        l.value = l.sendReq;
        l.sendReq = null;
        progress = true;
      }
      if (l.ackClear) {
        l.ack = false;
        l.ackClear = false;
        progress = true;
      }
    }

    if (failure !== undefined) {
      const { x, y, error } = failure;
      this._result = this.finish("error", `Machine (${x},${y}): ${error.format(this.nodeAt(x, y).source)}`, {
        x,
        y,
        line: error.line,
        col: error.col,
      });
      return;
    }

    // Compare outputs with what the level expects.
    let complete = true;
    for (let i = 0; i < this.sinks.length; i++) {
      const s = this.sinks[i]!;
      const name = `Output ${i + 1}`;
      for (let k = 0; k < s.received.length; k++) {
        if (k >= s.expected.length) {
          this._result = this.finish("wrong", `${name}: unexpected extra value ${s.received[k]}.`);
          return;
        }
        if (s.received[k] !== s.expected[k]) {
          this._result = this.finish(
            "wrong",
            `${name}: value #${k + 1} should be ${s.expected[k]}, but got ${s.received[k]}.`,
          );
          return;
        }
      }
      if (s.received.length < s.expected.length) complete = false;
    }
    if (complete) {
      this._result = this.finish("success", "All outputs are correct.");
      return;
    }

    if (!progress) {
      this._result = this.finish("deadlock", "Nothing can move: every machine is waiting or finished, but outputs are missing.");
      return;
    }
    if (this._ticks >= this.maxTicks) {
      this._result = this.finish("timeout", `No result after ${this.maxTicks} ticks.`);
    }
  }

  /** Run until the level is solved or fails. */
  run(): RunResult {
    while (this._result === undefined) this.tick();
    return this._result;
  }

  private finish(
    status: RunStatus,
    message: string,
    errorAt?: { x: number; y: number; line: number; col: number },
  ): RunResult {
    const result: RunResult = {
      status,
      message,
      ticks: this._ticks,
      outputs: this.outputs(),
      score: { ...this.score, ticks: this._ticks },
      ...(errorAt !== undefined ? { errorAt } : {}),
    };
    return result;
  }
}

/** Convenience: build a Simulation and run it to the end. */
export function runLevel(level: LevelDef, programs: Programs = {}, options: SimulationOptions = {}): RunResult {
  return new Simulation(level, programs, options).run();
}
