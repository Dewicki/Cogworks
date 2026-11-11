import { DX, DY, PORT_NAMES } from "./level.ts";
import type { Port, RunResult } from "./level.ts";
import type { Link, SimNode, Simulation } from "./simulation.ts";

const NS = "http://www.w3.org/2000/svg";
const CW = 150; // machine width
const CH = 96; // machine height
const GAP = 60; // space between machines (room for links)
const MARGIN = 64; // space around the grid (edge connections)
const OFFSET = 8; // the two directions of a connection are drawn side by side

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

interface CellView {
  node: SimNode;
  g: SVGGElement;
  status: SVGTextElement;
  code: SVGTextElement;
}

interface LinkView {
  link: Link;
  bubble: SVGGElement;
  bubbleText: SVGTextElement;
  ack: SVGCircleElement;
  line: SVGLineElement;
}

export interface BoardState {
  selected: { x: number; y: number } | null;
  /** Shown only once a run has started. */
  result: RunResult | undefined;
}

/** Draws the machine grid as SVG and keeps it in sync with a Simulation. */
export class Board {
  private readonly svg: SVGSVGElement;
  private readonly onSelect: (x: number, y: number) => void;
  private sim: Simulation | null = null;
  private cells: CellView[] = [];
  private links: LinkView[] = [];

  constructor(svg: SVGSVGElement, onSelect: (x: number, y: number) => void) {
    this.svg = svg;
    this.onSelect = onSelect;
  }

  private cellX(x: number): number {
    return MARGIN + x * (CW + GAP);
  }

  private cellY(y: number): number {
    return MARGIN + y * (CH + GAP);
  }

  /** Point on the border of machine (x, y) where a port sits. */
  private anchor(x: number, y: number, port: Port): [number, number] {
    const left = this.cellX(x);
    const top = this.cellY(y);
    switch (port) {
      case 0:
        return [left + CW / 2, top];
      case 1:
        return [left + CW / 2, top + CH];
      case 2:
        return [left, top + CH / 2];
      default:
        return [left + CW, top + CH / 2];
    }
  }

  private build(sim: Simulation): void {
    const { level } = sim;
    this.sim = sim;
    this.cells = [];
    this.links = [];
    this.svg.replaceChildren();
    const width = 2 * MARGIN + level.width * CW + (level.width - 1) * GAP;
    const height = 2 * MARGIN + level.height * CH + (level.height - 1) * GAP;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const defs = el("defs", {}, this.svg);
    const marker = el(
      "marker",
      { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 3.5, markerHeight: 3.5, orient: "auto" },
      defs,
    );
    el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrow-head" }, marker);

    const linkLayer = el("g", { class: "links" }, this.svg);
    const cellLayer = el("g", { class: "cells" }, this.svg);

    const addLink = (link: Link, x: number, y: number, port: Port, kind: "out" | "in" | "edge-out", label?: string): void => {
      const [ax, ay] = this.anchor(x, y, port);
      const dx = DX[port]!;
      const dy = DY[port]!;
      const internal = kind === "out" && x + dx >= 0 && y + dy >= 0 && x + dx < level.width && y + dy < level.height;
      const len = internal ? GAP : MARGIN - 8;
      const off = internal ? OFFSET : 0;
      const px = -dy * off;
      const py = dx * off;
      const [x1, y1, x2, y2] =
        kind === "in"
          ? [ax + dx * len + px, ay + dy * len + py, ax + px, ay + py]
          : [ax + px, ay + py, ax + dx * len + px, ay + dy * len + py];
      const line = el("line", { x1, y1, x2, y2, class: "link", "marker-end": "url(#arrow)" }, linkLayer);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const bubble = el("g", { class: "bubble", transform: `translate(${mx},${my})` }, linkLayer);
      el("circle", { r: 13 }, bubble);
      const bubbleText = el("text", { "text-anchor": "middle", dy: "0.35em" }, bubble);
      const ack = el("circle", { r: 4, class: "ack", cx: mx, cy: my }, linkLayer);
      if (label !== undefined) {
        const far = kind === "in" ? [x1, y1] : [x2, y2];
        el(
          "text",
          {
            class: "edge-label",
            x: far[0]! + dx * 4,
            y: far[1]! + dy * 4 + (dy === 0 ? -8 : dy > 0 ? 12 : -4),
            "text-anchor": dx > 0 ? "start" : dx < 0 ? "end" : "middle",
          },
          linkLayer,
        ).textContent = label;
      }
      this.links.push({ link, bubble, bubbleText, ack, line });
    };

    for (const node of sim.nodes) {
      for (let p = 0; p < 4; p++) {
        const port = p as Port;
        const out = node.outLinks[port];
        if (out) {
          const isEdge = !this.inside(level.width, level.height, node.x + DX[port]!, node.y + DY[port]!);
          const idx = level.outputs.findIndex((o) => o.x === node.x && o.y === node.y && o.port === port);
          addLink(out, node.x, node.y, port, isEdge ? "edge-out" : "out", isEdge ? `OUT ${idx + 1}` : undefined);
        }
        const inn = node.inLinks[port];
        if (inn && !this.inside(level.width, level.height, node.x + DX[port]!, node.y + DY[port]!)) {
          const idx = level.inputs.findIndex((i) => i.x === node.x && i.y === node.y && i.port === port);
          addLink(inn, node.x, node.y, port, "in", `IN ${idx + 1}`);
        }
      }
    }

    for (const node of sim.nodes) {
      const g = el("g", { class: "cell", tabindex: 0, role: "button" }, cellLayer);
      const left = this.cellX(node.x);
      const top = this.cellY(node.y);
      el("rect", { x: left, y: top, width: CW, height: CH, rx: 10, class: "cell-body" }, g);
      el("text", { x: left + 10, y: top + 20, class: "cell-title" }, g).textContent =
        `(${node.x},${node.y})${node.locked ? " 🔒" : ""}`;
      const status = el("text", { x: left + CW - 10, y: top + 20, "text-anchor": "end", class: "cell-status" }, g);
      const code = el("text", { x: left + 10, y: top + CH - 16, class: "cell-code" }, g);
      for (let p = 0; p < 4; p++) {
        const port = p as Port;
        if (node.outLinks[port] || node.inLinks[port]) {
          const [ax, ay] = this.anchor(node.x, node.y, port);
          el("circle", { cx: ax, cy: ay, r: 4, class: "port" }, g);
          const lx = ax - DX[port]! * 12;
          const ly = ay - DY[port]! * 12 + 4;
          el("text", { x: lx, y: ly, "text-anchor": "middle", class: "port-label" }, g).textContent = PORT_NAMES[port]![0]!;
        }
      }
      g.addEventListener("click", () => this.onSelect(node.x, node.y));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(node.x, node.y);
        }
      });
      this.cells.push({ node, g, status, code });
    }
  }

  private inside(w: number, h: number, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < w && y < h;
  }

  /** Redraw. Rebuilds the SVG when the simulation object changed (e.g. after Reset). */
  update(sim: Simulation, state: BoardState): void {
    if (sim !== this.sim) this.build(sim);
    const err = state.result?.status === "error" ? state.result.errorAt : undefined;

    for (const v of this.links) {
      const link = v.link;
      const flying = link.value !== null;
      v.bubble.style.display = flying ? "" : "none";
      v.ack.style.display = !flying && link.ack ? "" : "none";
      if (flying) v.bubbleText.textContent = String(link.value);
      v.line.classList.toggle("busy", flying || link.ack);
    }

    for (const c of this.cells) {
      const { node } = c;
      const m = node.machine;
      const isError = err !== undefined && err.x === node.x && err.y === node.y;
      const status: string = isError ? "error" : m === null ? "empty" : m.status;
      c.g.setAttribute("class", `cell st-${status}${node.locked ? " locked" : ""}`);
      c.g.classList.toggle("selected", state.selected?.x === node.x && state.selected?.y === node.y);
      c.status.textContent = status;
      c.g.setAttribute("aria-label", `Machine ${node.x},${node.y}${node.locked ? ", locked" : ""}: ${status}`);
      let code = "";
      if (m !== null && (status === "running" || status === "blocked") && sim.ticks > 0) {
        const text = node.source.split(/\r?\n/)[m.line - 1]?.trim() ?? "";
        code = `${m.line}: ${text}`;
        if (code.length > 22) code = code.slice(0, 21) + "…";
      }
      c.code.textContent = code;
    }
  }
}
