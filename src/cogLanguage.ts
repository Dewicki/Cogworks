import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import type { StreamParser } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Keep in sync with KEYWORDS in Cog's src/lexer.ts (a test checks that each one is a keyword there). */
export const COG_KEYWORDS: readonly string[] = [
  "let", "if", "else", "while", "fn", "return", "break", "continue",
  "true", "false", "null", "and", "or", "not",
];

export const COG_PORTS: readonly string[] = ["UP", "DOWN", "LEFT", "RIGHT"];
export const COG_BUILTINS: readonly string[] = ["send", "recv"];

const keywords = new Set(COG_KEYWORDS);
const ports = new Set(COG_PORTS);
const builtins = new Set(COG_BUILTINS);

/** Token names are the ones CodeMirror's StreamLanguage understands. */
export const cogParser: StreamParser<null> = {
  name: "cog",
  startState: () => null,
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.eat('"')) {
      let ch: string | void;
      while ((ch = stream.next()) !== undefined) {
        if (ch === '"') break;
        if (ch === "\\") stream.next();
      }
      return "string";
    }
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      if (keywords.has(word)) return "keyword";
      if (ports.has(word)) return "atom";
      if (builtins.has(word)) return "builtin";
      return "variableName";
    }
    if (stream.match(/^(==|!=|<=|>=)/)) return "operator";
    const ch = stream.next();
    return ch !== undefined && "+-*/%<>=".includes(ch) ? "operator" : null;
  },
  languageData: { commentTokens: { line: "//" } },
};

const cogHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c678dd", fontWeight: "600" },
  { tag: tags.atom, color: "#e5a04b", fontWeight: "600" },
  { tag: tags.standard(tags.variableName), color: "#56b6c2" },
  { tag: tags.number, color: "#d19a66" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.comment, color: "#7f8a9c", fontStyle: "italic" },
  { tag: tags.operator, color: "#abb2bf" },
]);

export function cogLanguage() {
  return [StreamLanguage.define(cogParser), syntaxHighlighting(cogHighlight)];
}
