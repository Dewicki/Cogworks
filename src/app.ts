import { Board } from "./board.ts";
import { CogEditor } from "./editor.ts";
import { LEVELS } from "./levels.ts";
import { PORT_NAMES, countLines } from "./level.ts";
import type { LevelDef, RunResult } from "./level.ts";
import { Progress, browserStorage } from "./progress.ts";
import { Session } from "./session.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`Missing #${id}`);
  return e as T;
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | null,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const STATUS_TITLES: Record<RunResult["status"], string> = {
  success: "Solved!",
  wrong: "Wrong output",
  deadlock: "Deadlock",
  timeout: "Timeout",
  error: "Program error",
  invalid: "Cannot run",
};

export function startApp(): void {
  const progress = new Progress(browserStorage());
  const editor = new CogEditor($("editor"));
  let session: Session = new Session(LEVELS[0]!, progress);
  let selected: { x: number; y: number } = { x: 0, y: 0 };
  let handledError: RunResult | null = null;
  let listSignature = "";

  const board = new Board($("board") as unknown as SVGSVGElement, (x, y) => selectMachine(x, y));

  function selectMachine(x: number, y: number): void {
    selected = { x, y };
    editor.load(session.getProgram(x, y), session.isLocked(x, y));
    render();
  }

  function loadLevel(level: LevelDef): void {
    const speed = session.speed;
    session = new Session(level, progress);
    session.setSpeed(speed);
    handledError = null;
    const first = level.locked
      ? firstFree(level)
      : { x: 0, y: 0 };
    $("level-title").textContent = level.title;
    $("level-desc").textContent = level.description;
    selectMachine(first.x, first.y);
  }

  function firstFree(level: LevelDef): { x: number; y: number } {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        if (!level.locked?.some((l) => l.x === x && l.y === y)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  editor.setOnChange((text) => {
    session.setProgram(selected.x, selected.y, text);
    render();
  });

  // ---- static parts -------------------------------------------------------

  function renderInputs(): void {
    const level = session.level;
    const entered = session.sim.inputProgress();
    const inputs = $("inputs");
    inputs.replaceChildren();
    level.inputs.forEach((input, i) => {
      const row = h("div", "stream");
      row.append(
        h("span", "stream-name", `IN ${i + 1}`),
        h("span", "stream-where", `${PORT_NAMES[input.port]} of (${input.x},${input.y})`),
      );
      const chips = h("span", "chips");
      input.values.forEach((v, k) => chips.append(h("span", k < (entered[i] ?? 0) ? "chip sent" : "chip", String(v))));
      row.append(chips);
      inputs.append(row);
    });
  }

  // ---- dynamic parts ------------------------------------------------------

  function renderLevelList(): void {
    const signature = LEVELS.map((l) => {
      const b = progress.getBest(l.id);
      return `${l.id}:${b ? `${b.ticks}/${b.lines}/${b.nodes}` : "-"}:${l.id === session.level.id}`;
    }).join("|");
    if (signature === listSignature) return;
    listSignature = signature;
    const list = $("level-list");
    list.replaceChildren();
    for (const level of LEVELS) {
      const best = progress.getBest(level.id);
      const btn = h("button", "level-btn");
      btn.type = "button";
      if (level.id === session.level.id) btn.setAttribute("aria-current", "true");
      btn.append(
        h("span", best ? "check done" : "check", best ? "✓" : "○"),
        h("span", "level-name", level.title),
      );
      if (best) btn.append(h("span", "level-best", `${best.ticks}t ${best.lines}l ${best.nodes}m`));
      btn.title = best
        ? `Best: ${best.ticks} ticks, ${best.lines} lines, ${best.nodes} machines`
        : "Not solved yet";
      btn.addEventListener("click", () => {
        if (level.id !== session.level.id) loadLevel(level);
      });
      const li = h("li", null);
      li.append(btn);
      list.append(li);
    }
  }

  function renderOutputs(): void {
    const box = $("outputs");
    const received = session.sim.outputs();
    box.replaceChildren();
    session.level.outputs.forEach((out, i) => {
      const row = h("div", "stream");
      row.append(
        h("span", "stream-name", `OUT ${i + 1}`),
        h("span", "stream-where", `${PORT_NAMES[out.port]} of (${out.x},${out.y})`),
      );
      const chips = h("span", "chips");
      const got = received[i] ?? [];
      const count = Math.max(got.length, out.expected.length);
      for (let k = 0; k < count; k++) {
        const want = out.expected[k];
        if (k < got.length) {
          const ok = got[k] === want;
          const chip = h("span", ok ? "chip ok" : "chip bad", String(got[k]));
          if (!ok) chip.title = want === undefined ? "unexpected extra value" : `expected ${want}`;
          chips.append(chip);
          if (!ok && want !== undefined) chips.append(h("span", "chip want", `want ${want}`));
        } else {
          chips.append(h("span", "chip pending", String(want)));
        }
      }
      row.append(chips);
      box.append(row);
    });
  }

  function renderBanner(result: RunResult | undefined): void {
    const banner = $("banner");
    if (result === undefined) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.className = `banner ${result.status}`;
    banner.replaceChildren(h("strong", null, STATUS_TITLES[result.status]), h("span", "msg", ` ${result.message}`));
    if (result.status === "success") {
      const s = result.score;
      banner.append(h("div", "score", `Ticks ${s.ticks} · Lines ${s.lines} · Machines ${s.nodes}`));
      const best = progress.getBest(session.level.id);
      if (session.newBest) banner.append(h("div", "score", "New best!"));
      else if (best) banner.append(h("div", "score", `Best: ${best.ticks} ticks · ${best.lines} lines · ${best.nodes} machines`));
    }
  }

  function render(): void {
    const result = session.result;

    // Jump to the failing machine once per error result.
    if (result?.status === "error" && result.errorAt && handledError !== result) {
      handledError = result;
      const at = result.errorAt;
      selected = { x: at.x, y: at.y };
      editor.load(session.getProgram(at.x, at.y), session.isLocked(at.x, at.y));
      editor.goTo(at.line, at.col);
    }

    const sim = session.sim;
    board.update(sim, { selected, result });

    // Editor header and line highlight.
    const locked = session.isLocked(selected.x, selected.y);
    $("editor-title").textContent = `Machine (${selected.x},${selected.y})${locked ? " · locked" : ""}`;
    const lines = countLines(editor.text());
    const counter = $("line-count");
    counter.textContent = locked ? `${lines} lines (read-only)` : `${lines} / ${session.level.maxLines} lines`;
    counter.classList.toggle("over", !locked && lines > session.level.maxLines);

    const machine = sim.nodeAt(selected.x, selected.y).machine;
    if (result?.status === "error" && result.errorAt?.x === selected.x && result.errorAt.y === selected.y) {
      editor.setMark({ line: result.errorAt.line, kind: "error" });
    } else if (machine !== null && sim.ticks > 0 && (machine.status === "running" || machine.status === "blocked")) {
      editor.setMark({ line: machine.line, kind: "active" });
    } else {
      editor.setMark(null);
    }

    renderInputs();
    renderOutputs();
    renderBanner(result);
    renderLevelList();

    const running = session.mode === "running";
    ($("btn-run") as HTMLButtonElement).disabled = running;
    ($("btn-pause") as HTMLButtonElement).disabled = !running;
    $("tick-count").textContent = `tick ${sim.ticks}`;
  }

  // ---- controls -----------------------------------------------------------

  $("btn-run").addEventListener("click", () => {
    session.run();
    render();
  });
  $("btn-pause").addEventListener("click", () => {
    session.pause();
    render();
  });
  $("btn-step").addEventListener("click", () => {
    session.step();
    render();
  });
  $("btn-reset").addEventListener("click", () => {
    session.reset();
    handledError = null;
    render();
  });
  const speed = $("speed") as HTMLInputElement;
  const speedOut = $("speed-out");
  const applySpeed = (): void => {
    session.setSpeed(Number(speed.value));
    speedOut.textContent = `${speed.value} ticks/s`;
  };
  speed.addEventListener("input", applySpeed);

  // ---- animation loop -----------------------------------------------------

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = now - last;
    last = now;
    if (session.mode === "running") {
      session.advance(dt);
      render();
    }
    requestAnimationFrame(frame);
  };

  loadLevel(LEVELS[0]!);
  applySpeed();
  requestAnimationFrame(frame);
}
