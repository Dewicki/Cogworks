# Cogworks: Design

Status: the engine (`src/simulation.ts`), the levels (`src/levels.ts`) and the browser UI (`src/app.ts`, `board.ts`, `editor.ts`) are implemented.

## Concept

A browser puzzle game. The board is a grid of small machines. Each machine runs its own short [Cog](https://github.com/Dewicki/Cog) program and can pass numbers to its neighbours. Data enters at the edge of the grid and must leave as the expected output. You win by wiring up programs so the machines together solve the task.

Inspired by the genre of "programming puzzle" games. All art, levels and code are original.

## Rules

- Each machine has one program with a **line limit** (for example 12 lines) and a few variables.
- Machines connect to their four neighbours through ports `UP`, `DOWN`, `LEFT`, `RIGHT`.
- `send(port, value)` and `recv(port)` are **blocking**: a send finishes only when the neighbour receives, and the other way round.
- All machines advance in **lockstep**, one step per tick, so runs are deterministic.
- A level defines input streams, the expected output stream, which machines are available, and which are locked or prefilled.
- Score: ticks to finish, total lines, number of machines used.

## Interface

- Grid view with animated values moving across ports.
- Click a machine to open its editor (CodeMirror), the current line is highlighted while running.
- Controls: Run, Pause, Step, Reset, speed slider.
- Input and output panels, with a diff of expected and actual output.
- Deadlock notice when every machine is blocked.

## Planned levels (v0.1)

1. Pass-through.
2. Double every number.
3. Drop negative numbers.
4. Route by sign (positives right, negatives left).
5. Add pairs.
6. Smaller of two numbers.
7. Running sum.
8. Sort two numbers (stretch goal).

## Simulation model

- Every connection between two machines is a pair of directed links. A value sent over a link stays in flight until the receiver takes it; the sender is released one tick later.
- Within a tick all machines read the state committed at the end of the previous tick and only stage changes. Changes are applied together at the end of the tick, so results never depend on the order machines are stepped in.
- Input and output edges behave like machines that always want to send or receive.
- A tick where no machine executes a statement and no link changes is reported as a deadlock.
- One value passing through one machine takes 3 ticks (enter, forward, leave).

## Technical decisions

- TypeScript, Vite, Canvas 2D or DOM for the grid. No game engine.
- No backend. Progress is stored in `localStorage`. Hosting on GitHub Pages.
- Levels are JSON files.
- Depends on the Cog interpreter. It must support steppable, blockable execution.

## Out of scope

Accounts, online leaderboards, a level editor, sound, mobile controls.

## Risks

- Balance and difficulty curve: mitigated by short tutorial levels and a visible expected output.
- Deadlocks confuse beginners: mitigated by a clear "all machines blocked" message.
- Scope: this is the bigger of the two projects. Work starts after Cog has a steppable interpreter.

## Roadmap

1. Grid rendering and one machine running a Cog program.
2. Ports, lockstep scheduler, deadlock detection.
3. Editor, controls, first three levels.
4. Remaining levels, scoring, saving.
5. Polish, GIF for the README, public demo.
