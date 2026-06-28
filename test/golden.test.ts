/**
 * Parity tests against the Java AlKhalil reference.
 *
 * `test/fixtures/golden.jsonl` holds, per word, every analysis produced by the
 * original `AlKhalil2Analyzer.processToken` (12 fields each). We require the JS
 * port to reproduce the exact same multiset of analyses, and that the
 * top-ranked candidate matches after sorting by `priority`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Analyzer, type Analysis } from "../src/index.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/golden.jsonl", import.meta.url));

// 12 fields, in a fixed order — the golden keys are already camelCase.
const FIELDS: (keyof Analysis)[] = [
  "voweledWord",
  "proclitic",
  "stem",
  "partOfSpeech",
  "diacPatternStem",
  "patternStem",
  "lemma",
  "patternLemma",
  "root",
  "caseOrMood",
  "enclitic",
  "priority",
];

interface GoldenCase {
  word: string;
  analyses: Record<string, string>[];
}

function loadGolden(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const line of readFileSync(FIXTURE, "utf-8").split("\n")) {
    const t = line.trim();
    if (t) cases.push(JSON.parse(t));
  }
  return cases;
}

const GOLDEN = loadGolden();

function tuple(a: Record<string, string>): string {
  // A stable, collision-free join (fields never contain U+0001).
  return FIELDS.map((k) => a[k]).join("");
}

/** Multiset of analyses as a count map keyed by the 12-field tuple. */
function multiset(items: Record<string, string>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of items) {
    const k = tuple(a);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const analyzer = new Analyzer();

describe("golden parity (multiset)", () => {
  it.each(GOLDEN.map((c) => [c.word, c] as const))("%s — same multiset of analyses", (_word, c) => {
    const expected = multiset(c.analyses);
    const got = multiset(analyzer.processToken(c.word) as unknown as Record<string, string>[]);
    expect(got).toEqual(expected);
  });
});

describe("golden parity (top-1 ranking)", () => {
  it.each(GOLDEN.map((c) => [c.word, c] as const))("%s — top-ranked matches reference", (_word, c) => {
    if (c.analyses.length === 0) return; // nothing to rank
    // The reference fixture is unsorted; compare against its max-priority set.
    let best = c.analyses[0].priority;
    for (const a of c.analyses) if (a.priority > best) best = a.priority;
    const expectedBest = new Set(c.analyses.filter((a) => a.priority === best).map(tuple));
    const ranked = analyzer.analyze(c.word);
    expect(ranked.length).toBeGreaterThan(0);
    expect(expectedBest.has(tuple(ranked[0] as unknown as Record<string, string>))).toBe(true);
  });
});

it("golden fixture is non-empty", () => {
  expect(GOLDEN.length).toBeGreaterThanOrEqual(25);
});
