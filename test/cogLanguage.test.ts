import assert from "node:assert/strict";
import { test } from "node:test";
import { StringStream } from "@codemirror/language";
import { COG_BUILTINS, COG_KEYWORDS, COG_PORTS, cogParser } from "../src/cogLanguage.ts";
import { tokenize } from "../src/cog.ts";

/** Tokenize one line into [text, token] pairs, skipping whitespace. */
function tokens(line: string): [string, string | null][] {
  const stream = new StringStream(line, 2, 2);
  const out: [string, string | null][] = [];
  while (!stream.eol()) {
    const type = cogParser.token(stream, null);
    if (type !== null || stream.current().trim() !== "") out.push([stream.current(), type]);
    stream.start = stream.pos;
  }
  return out;
}

test("every highlighted keyword is a keyword for Cog's lexer, and ports and builtins are not", () => {
  for (const word of COG_KEYWORDS) assert.equal(tokenize(word)[0]?.type, "keyword", word);
  for (const word of [...COG_PORTS, ...COG_BUILTINS]) assert.equal(tokenize(word)[0]?.type, "ident", word);
});

test("keywords, ports, builtins, identifiers", () => {
  assert.deepEqual(tokens("while true"), [["while", "keyword"], ["true", "keyword"]]);
  assert.deepEqual(tokens("send(UP, x)")[0], ["send", "builtin"]);
  assert.deepEqual(tokens("RIGHT")[0], ["RIGHT", "atom"]);
  assert.deepEqual(tokens("total")[0], ["total", "variableName"]);
});

test("numbers, strings, operators", () => {
  assert.deepEqual(tokens("3.5 + 2"), [["3.5", "number"], ["+", "operator"], ["2", "number"]]);
  assert.deepEqual(tokens('"a\\"b"'), [['"a\\"b"', "string"]]);
  assert.deepEqual(tokens("a <= b")[1], ["<=", "operator"]);
});

test("line comments", () => {
  assert.deepEqual(tokens("x // note UP"), [["x", "variableName"], ["// note UP", "comment"]]);
});
