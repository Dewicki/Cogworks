import type { LevelDef } from "./level.ts";

/**
 * The built-in levels, in play order. Streams are fed in through the LEFT or
 * UP edge and must come out through the RIGHT or UP edge as described.
 */
export const LEVELS: readonly LevelDef[] = [
  {
    id: "pass-through",
    title: "Pass-through",
    description: "Send every number you receive on the left out through the right.",
    width: 1,
    height: 1,
    maxLines: 4,
    inputs: [{ x: 0, y: 0, port: 2, values: [3, 1, 4, 1, 5] }],
    outputs: [{ x: 0, y: 0, port: 3, expected: [3, 1, 4, 1, 5] }],
  },
  {
    id: "double",
    title: "Double",
    description: "Output every input number multiplied by two.",
    width: 1,
    height: 1,
    maxLines: 4,
    inputs: [{ x: 0, y: 0, port: 2, values: [1, 2, 3, 4, 5, 6] }],
    outputs: [{ x: 0, y: 0, port: 3, expected: [2, 4, 6, 8, 10, 12] }],
  },
  {
    id: "chain",
    title: "Chain",
    description:
      "The first machine doubles every number and passes it on. Make the second machine add one before the number leaves.",
    width: 2,
    height: 1,
    maxLines: 4,
    locked: [{ x: 0, y: 0, program: "while true {\n  send(RIGHT, recv(LEFT) * 2)\n}" }],
    inputs: [{ x: 0, y: 0, port: 2, values: [1, 2, 3, 4] }],
    outputs: [{ x: 1, y: 0, port: 3, expected: [3, 5, 7, 9] }],
  },
  {
    id: "filter",
    title: "Filter",
    description: "Drop every negative number. Pass the positive ones through.",
    width: 1,
    height: 1,
    maxLines: 7,
    inputs: [{ x: 0, y: 0, port: 2, values: [3, -1, 4, -1, -5, 9, 2, -6] }],
    outputs: [{ x: 0, y: 0, port: 3, expected: [3, 4, 9, 2] }],
  },
  {
    id: "route-by-sign",
    title: "Route by sign",
    description: "Send positive numbers out through the right and negative numbers out through the top.",
    width: 1,
    height: 1,
    maxLines: 9,
    inputs: [{ x: 0, y: 0, port: 2, values: [3, -2, 5, -7, 1, -4] }],
    outputs: [
      { x: 0, y: 0, port: 3, expected: [3, 5, 1] },
      { x: 0, y: 0, port: 0, expected: [-2, -7, -4] },
    ],
  },
  {
    id: "add-pairs",
    title: "Add pairs",
    description: "Read numbers two at a time and output their sum.",
    width: 1,
    height: 1,
    maxLines: 7,
    inputs: [{ x: 0, y: 0, port: 2, values: [1, 2, 3, 4, 5, 6, 7, 8] }],
    outputs: [{ x: 0, y: 0, port: 3, expected: [3, 7, 11, 15] }],
  },
  {
    id: "running-sum",
    title: "Running sum",
    description: "After each number, output the sum of everything received so far.",
    width: 1,
    height: 1,
    maxLines: 8,
    inputs: [{ x: 0, y: 0, port: 2, values: [1, 2, 3, 4, 5, 6] }],
    outputs: [{ x: 0, y: 0, port: 3, expected: [1, 3, 6, 10, 15, 21] }],
  },
  {
    id: "smaller-of-two",
    title: "Smaller of two",
    description: "Numbers arrive in pairs: one from the left, one from the top. Output the smaller of each pair.",
    width: 1,
    height: 1,
    maxLines: 10,
    inputs: [
      { x: 0, y: 0, port: 2, values: [5, 2, 8, 6] },
      { x: 0, y: 0, port: 0, values: [3, 7, 1, 6] },
    ],
    outputs: [{ x: 0, y: 0, port: 3, expected: [3, 2, 1, 6] }],
  },
];

export function getLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
