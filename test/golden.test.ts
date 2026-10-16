/**
 * Parity tests against the Java AlKhalil reference.
 *
 * `test/fixtures/golden.jsonl` holds, per word, every analysis produced by the
 * original `AlKhalil2Analyzer.processToken` (12 fields each). We require the
 * port's raw records (`Analyzer._processToken`, one per reading × إعراب ending)
 * to reproduce the exact same multiset, and the top-ranked record to match after
 * sorting by `priority`. The public `analyze()` is checked against those raw
 * records in `analysis.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { RawAnalysis } from "../src/analyzer.js";
import { Analyzer } from "../src/index.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/golden.jsonl", import.meta.url));

// 12 fields, in a fixed order — the golden keys are already camelCase.
const FIELDS: (keyof RawAnalysis)[] = [
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
    const got = multiset(analyzer._processToken(c.word) as unknown as Record<string, string>[]);
    expect(got).toEqual(expected);
  });
});

describe("golden parity (top-1 ranking)", () => {
  it.each(GOLDEN.map((c) => [c.word, c] as const))(
    "%s — top-ranked matches reference",
    (_word, c) => {
      if (c.analyses.length === 0) return; // nothing to rank
      // The reference fixture is unsorted; compare against its max-priority set.
      let best = c.analyses[0].priority;
      for (const a of c.analyses) if (a.priority > best) best = a.priority;
      const expectedBest = new Set(c.analyses.filter((a) => a.priority === best).map(tuple));
      // Stable sort by the priority string, descending (ties keep pipeline order).
      const ranked = analyzer
        ._processToken(c.word)
        .map((a, i) => [a, i] as const)
        .sort((x, y) =>
          x[0].priority < y[0].priority ? 1 : x[0].priority > y[0].priority ? -1 : x[1] - y[1],
        )
        .map(([a]) => a);
      expect(ranked.length).toBeGreaterThan(0);
      expect(expectedBest.has(tuple(ranked[0] as unknown as Record<string, string>))).toBe(true);
    },
  );
});

it("golden fixture is non-empty", () => {
  expect(GOLDEN.length).toBeGreaterThanOrEqual(25);
});
