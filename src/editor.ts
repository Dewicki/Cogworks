import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { cogLanguage } from "./cogLanguage.ts";

export type LineMark = { line: number; kind: "active" | "error" } | null;

const setMark = StateEffect.define<LineMark>();

const markField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMark)) continue;
      const mark = e.value;
      if (mark === null || mark.line < 1 || mark.line > tr.state.doc.lines) {
        deco = Decoration.none;
      } else {
        const from = tr.state.doc.line(mark.line).from;
        deco = Decoration.set([Decoration.line({ class: `cm-mark-${mark.kind}` }).range(from)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Thin wrapper around one CodeMirror view that is reused for every machine. */
export class CogEditor {
  private readonly view: EditorView;
  private onChange: (text: string) => void = () => {};
  private silent = false;
  private mark: LineMark = null;

  constructor(parent: HTMLElement) {
    this.view = new EditorView({ state: this.createState("", true), parent });
  }

  private createState(doc: string, readOnly: boolean): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        cogLanguage(),
        markField,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !this.silent) this.onChange(u.state.doc.toString());
        }),
      ],
    });
  }

  /** Called with the new text whenever the player edits. */
  setOnChange(fn: (text: string) => void): void {
    this.onChange = fn;
  }

  /** Show another program. Resets undo history. */
  load(text: string, readOnly: boolean): void {
    this.silent = true;
    try {
      this.view.setState(this.createState(text, readOnly));
    } finally {
      this.silent = false;
    }
    this.mark = null;
  }

  text(): string {
    return this.view.state.doc.toString();
  }

  setMark(mark: LineMark): void {
    if (this.mark?.line === mark?.line && this.mark?.kind === mark?.kind) return;
    this.mark = mark;
    this.view.dispatch({ effects: setMark.of(mark) });
  }

  /** Move the cursor to a 1-based line and column and focus the editor. */
  goTo(line: number, col: number): void {
    const doc = this.view.state.doc;
    const l = doc.line(Math.min(Math.max(line, 1), doc.lines));
    const pos = Math.min(l.from + Math.max(col - 1, 0), l.to);
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }
}
