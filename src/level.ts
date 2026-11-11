/** Ports are numbers so Cog programs can pass them around: UP, DOWN, LEFT, RIGHT. */
export type Port = 0 | 1 | 2 | 3;

export const PORT_GLOBALS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 } as const;
export const PORT_NAMES = ["UP", "DOWN", "LEFT", "RIGHT"] as const;

/** The port on the neighbouring machine that faces back at us. */
export const OPPOSITE: readonly Port[] = [1, 0, 3, 2];

/** Grid offsets per port. y grows downwards, so UP is y - 1. */
export const DX: readonly number[] = [0, 0, -1, 1];
export const DY: readonly number[] = [-1, 1, 0, 0];

/** A machine with a fixed program that the player cannot change. */
export interface LockedNode {
  readonly x: number;
  readonly y: number;
  readonly program: string;
}

/** A stream of numbers fed into the grid through an edge port. */
export interface InputDef {
  readonly x: number;
  readonly y: number;
  readonly port: Port;
  readonly values: readonly number[];
}

/** A stream of numbers the grid must produce through an edge port. */
export interface OutputDef {
  readonly x: number;
  readonly y: number;
  readonly port: Port;
  readonly expected: readonly number[];
}

export interface LevelDef {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  /** Line limit per player-editable machine. */
  readonly maxLines: number;
  readonly locked?: readonly LockedNode[];
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];
}

/** Player programs by machine position, keyed "x,y". */
export type Programs = Readonly<Record<string, string>>;

export const nodeKey = (x: number, y: number): string => `${x},${y}`;

/** Lines that count toward the limit and the score: not blank, not comments. */
export function countLines(program: string): number {
  return program
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return t !== "" && !t.startsWith("//");
    }).length;
}

/** Throws Error if a level definition is inconsistent (an authoring mistake). */
export function validateLevel(level: LevelDef): void {
  const fail = (msg: string): never => {
    throw new Error(`Level '${level.id}': ${msg}`);
  };
  const inside = (x: number, y: number): boolean =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < level.width && y < level.height;

  if (!Number.isInteger(level.width) || !Number.isInteger(level.height) || level.width < 1 || level.height < 1) {
    fail("width and height must be positive integers");
  }
  if (level.outputs.length === 0) fail("a level needs at least one output");

  const used = new Set<string>();
  const checkEdge = (kind: string, x: number, y: number, port: number): void => {
    if (!inside(x, y)) fail(`${kind} at (${x},${y}) is outside the grid`);
    if (!Number.isInteger(port) || port < 0 || port > 3) fail(`${kind} at (${x},${y}) has an invalid port`);
    if (inside(x + DX[port]!, y + DY[port]!)) {
      fail(`${kind} at (${x},${y}) port ${PORT_NAMES[port]} is not on the edge of the grid`);
    }
    const key = `${x},${y},${port}`;
    if (used.has(key)) fail(`two connections on (${x},${y}) port ${PORT_NAMES[port]}`);
    used.add(key);
  };
  for (const i of level.inputs) checkEdge("input", i.x, i.y, i.port);
  for (const o of level.outputs) checkEdge("output", o.x, o.y, o.port);

  const seen = new Set<string>();
  for (const l of level.locked ?? []) {
    if (!inside(l.x, l.y)) fail(`locked machine at (${l.x},${l.y}) is outside the grid`);
    const key = nodeKey(l.x, l.y);
    if (seen.has(key)) fail(`two locked machines at (${l.x},${l.y})`);
    seen.add(key);
  }
}

export type RunStatus = "success" | "wrong" | "deadlock" | "timeout" | "error" | "invalid";

export interface Score {
  /** Ticks until the last expected value arrived. */
  readonly ticks: number;
  /** Lines of code in player-editable machines. */
  readonly lines: number;
  /** Player-editable machines that have a program. */
  readonly nodes: number;
}

export interface RunResult {
  readonly status: RunStatus;
  readonly message: string;
  readonly ticks: number;
  /** Values received at each output, in the order of level.outputs. */
  readonly outputs: readonly (readonly number[])[];
  readonly score: Score;
  /** Where a program failed, for status "error". */
  readonly errorAt?: { readonly x: number; readonly y: number; readonly line: number; readonly col: number };
}
