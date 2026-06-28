/**
 * Layer-2 parity tests: farahidi's in-context disambiguation must match the Java
 * `ADATAnalyzer` per-token chosen lemma / stem / root.
 *
 * The fixture `sentences.jsonl` carries the exact token list the Java tokenizer
 * produced, so these tests isolate Layer-2 from tokenization: we feed those
 * tokens straight to the disambiguator.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Disambiguator } from "../src/index.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/sentences.jsonl", import.meta.url));

interface SentenceCase {
  sentence: string;
  tokens: string[];
  lemmas: string[];
  stems: string[];
  roots: string[];
}

function load(): SentenceCase[] {
  const out: SentenceCase[] = [];
  for (const line of readFileSync(FIXTURE, "utf-8").split("\n")) {
    if (line.trim()) out.push(JSON.parse(line));
  }
  return out;
}

const RECORDS = load();
const DIS = new Disambiguator();

describe("Layer-2 disambiguation parity (per-token lemma/stem/root)", () => {
  it.each(RECORDS.map((r) => [r.sentence, r] as const))("%s", (_sentence, rec) => {
    const results = DIS.disambiguate(rec.tokens);
    expect(results.map((r) => r.lemma)).toEqual(rec.lemmas);
    expect(results.map((r) => r.stem)).toEqual(rec.stems);
    expect(results.map((r) => r.root)).toEqual(rec.roots);
  });
});

it("sentences fixture is non-empty", () => {
  expect(RECORDS.length).toBeGreaterThanOrEqual(10);
});
