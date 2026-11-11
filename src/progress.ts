import type { Programs, Score } from "./level.ts";

/** The part of the Web Storage API that we use. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Best value reached per metric (lower is better for all three). */
export type BestScore = Score;

const PREFIX = "cogworks:v1:";

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Saved programs and best scores. Every storage access is wrapped in
 * try/catch, so a blocked or full localStorage never breaks the game.
 * Pass null for no persistence.
 */
export class Progress {
  private readonly storage: StorageLike | null;

  constructor(storage: StorageLike | null) {
    this.storage = storage;
  }

  private read(key: string): unknown {
    try {
      const raw = this.storage?.getItem(PREFIX + key);
      return raw === null || raw === undefined ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private write(key: string, value: unknown): boolean {
    try {
      if (this.storage === null) return false;
      this.storage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  getPrograms(levelId: string): Programs {
    const data = this.read(`programs:${levelId}`);
    const out: Record<string, string> = {};
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string" && /^\d+,\d+$/.test(key)) out[key] = value;
      }
    }
    return out;
  }

  setPrograms(levelId: string, programs: Programs): boolean {
    return this.write(`programs:${levelId}`, programs);
  }

  getBest(levelId: string): BestScore | undefined {
    const data = this.read(`best:${levelId}`) as Partial<Record<keyof BestScore, unknown>> | undefined;
    if (data && isCount(data.ticks) && isCount(data.lines) && isCount(data.nodes)) {
      return { ticks: data.ticks, lines: data.lines, nodes: data.nodes };
    }
    return undefined;
  }

  isSolved(levelId: string): boolean {
    return this.getBest(levelId) !== undefined;
  }

  /**
   * Remember a successful run. Each metric keeps its own minimum.
   * Returns true when at least one metric improved (the first solve counts).
   */
  recordScore(levelId: string, score: Score): boolean {
    const old = this.getBest(levelId);
    const next: BestScore = old
      ? {
          ticks: Math.min(old.ticks, score.ticks),
          lines: Math.min(old.lines, score.lines),
          nodes: Math.min(old.nodes, score.nodes),
        }
      : { ticks: score.ticks, lines: score.lines, nodes: score.nodes };
    const improved =
      old === undefined || next.ticks < old.ticks || next.lines < old.lines || next.nodes < old.nodes;
    if (improved) this.write(`best:${levelId}`, next);
    return improved;
  }
}

/** localStorage, or null when it is not available at all. */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
