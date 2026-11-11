import { Simulation } from "./simulation.ts";
import type { LevelDef, RunResult } from "./level.ts";
import { nodeKey } from "./level.ts";
import type { Progress } from "./progress.ts";

export type Mode = "idle" | "running" | "paused" | "finished";

/** At most this many ticks per advance() call, so a slow frame cannot freeze the page. */
export const MAX_TICKS_PER_ADVANCE = 200;

/**
 * State of one level being played: the player's programs, the current
 * simulation and the run controls. No DOM in here, so it can be tested.
 */
export class Session {
  readonly level: LevelDef;
  private readonly progress: Progress;
  private programs: Record<string, string>;
  private _sim: Simulation;
  private _mode: Mode = "idle";
  private _started = false;
  private _newBest = false;
  private _speed = 4;
  private carry = 0;

  constructor(level: LevelDef, progress: Progress) {
    this.level = level;
    this.progress = progress;
    this.programs = { ...progress.getPrograms(level.id) };
    this._sim = new Simulation(level, this.programs);
  }

  get sim(): Simulation {
    return this._sim;
  }

  get mode(): Mode {
    return this._mode;
  }

  /** True once Run or Step was used since the last reset. Results are only shown then. */
  get started(): boolean {
    return this._started;
  }

  /** The run result, but only after the player started a run. */
  get result(): RunResult | undefined {
    return this._started ? this._sim.result : undefined;
  }

  /** The last successful run beat a saved best (or was the first solve). */
  get newBest(): boolean {
    return this._newBest;
  }

  /** Ticks per second. */
  get speed(): number {
    return this._speed;
  }

  setSpeed(ticksPerSecond: number): void {
    if (Number.isFinite(ticksPerSecond) && ticksPerSecond > 0) this._speed = ticksPerSecond;
  }

  /** Program text of a machine (locked machines return their fixed program). */
  getProgram(x: number, y: number): string {
    const locked = this.level.locked?.find((l) => l.x === x && l.y === y);
    return locked ? locked.program : (this.programs[nodeKey(x, y)] ?? "");
  }

  isLocked(x: number, y: number): boolean {
    return this.level.locked?.some((l) => l.x === x && l.y === y) ?? false;
  }

  /** Change a program. Stops the run and starts again from tick 0. */
  setProgram(x: number, y: number, source: string): void {
    if (this.isLocked(x, y)) return;
    const key = nodeKey(x, y);
    if (source === "") delete this.programs[key];
    else this.programs[key] = source;
    this.progress.setPrograms(this.level.id, this.programs);
    this.reset();
  }

  /** Back to tick 0 with the current programs. */
  reset(): void {
    this._sim = new Simulation(this.level, this.programs);
    this._mode = "idle";
    this._started = false;
    this._newBest = false;
    this.carry = 0;
  }

  /** Start or continue running; after a finished run, starts a new one. */
  run(): void {
    if (this._mode === "finished") this.reset();
    this._started = true;
    this.settle();
    if (this._mode !== "finished") this._mode = "running";
  }

  pause(): void {
    if (this._mode === "running") this._mode = "paused";
  }

  /** One tick. Stops a running animation. */
  step(): void {
    if (this._mode === "finished") this.reset();
    this._started = true;
    this._mode = "paused";
    this.doTick();
  }

  /** Called every frame with the elapsed time. Returns the number of ticks made. */
  advance(dtMs: number): number {
    if (this._mode !== "running") return 0;
    this.carry += (Math.max(0, dtMs) * this._speed) / 1000;
    const n = Math.min(Math.floor(this.carry), MAX_TICKS_PER_ADVANCE);
    this.carry -= Math.floor(this.carry);
    let done = 0;
    for (; done < n && this._mode === "running"; done++) this.doTick();
    return done;
  }

  private doTick(): void {
    this._sim.tick();
    this.settle();
  }

  /** If the simulation has a result, finish the run and record the score. */
  private settle(): void {
    const result = this._sim.result;
    if (result === undefined || this._mode === "finished") return;
    this._mode = "finished";
    if (result.status === "success") this._newBest = this.progress.recordScore(this.level.id, result.score);
  }
}
