import type { Programs } from "../src/index.ts";

/** Reference solutions: proof that every built-in level can be solved. */
export const SOLUTIONS: Record<string, Programs> = {
  "pass-through": {
    "0,0": "while true {\n  send(RIGHT, recv(LEFT))\n}",
  },
  double: {
    "0,0": "while true {\n  send(RIGHT, recv(LEFT) * 2)\n}",
  },
  chain: {
    "1,0": "while true {\n  send(RIGHT, recv(LEFT) + 1)\n}",
  },
  filter: {
    "0,0": "while true {\n  let x = recv(LEFT)\n  if x > 0 {\n    send(RIGHT, x)\n  }\n}",
  },
  "route-by-sign": {
    "0,0":
      "while true {\n  let x = recv(LEFT)\n  if x > 0 {\n    send(RIGHT, x)\n  } else {\n    send(UP, x)\n  }\n}",
  },
  "add-pairs": {
    "0,0": "while true {\n  let a = recv(LEFT)\n  let b = recv(LEFT)\n  send(RIGHT, a + b)\n}",
  },
  "running-sum": {
    "0,0": "let sum = 0\nwhile true {\n  sum = sum + recv(LEFT)\n  send(RIGHT, sum)\n}",
  },
  "smaller-of-two": {
    "0,0":
      "while true {\n  let a = recv(LEFT)\n  let b = recv(UP)\n  if a < b {\n    send(RIGHT, a)\n  } else {\n    send(RIGHT, b)\n  }\n}",
  },
};
