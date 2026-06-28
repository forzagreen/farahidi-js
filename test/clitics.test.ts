/** Unit tests for clitic segmentation. */
import { describe, expect, it } from "vitest";

import { getListsSegment, type Segment } from "../src/clitics.js";
import { Lexicon } from "../src/lexicon.js";

const lex = new Lexicon();

function triples(segments: Segment[]): Set<string> {
  return new Set(segments.map((s) => `${s.proclitic.unvoweledform}|${s.stem}|${s.enclitic.unvoweledform}`));
}

describe("clitics", () => {
  it("bare word has the empty-clitic segment", () => {
    const t = triples(getListsSegment(lex, "كتب"));
    expect(t.has("|كتب|")).toBe(true);
  });

  it("proclitic + enclitic split (لأنهم)", () => {
    const segs = getListsSegment(lex, "لأنهم");
    const t = triples(segs);
    const hasLAn = t.has("ل|أنهم|");
    const hasLHum = segs.some((s) => s.proclitic.unvoweledform === "ل" && s.enclitic.unvoweledform === "هم");
    expect(hasLAn || hasLHum).toBe(true);
  });

  it("segments respect class compatibility", () => {
    for (const seg of getListsSegment(lex, "بالمدرسة")) {
      const proc = seg.proclitic.classe;
      const enc = seg.enclitic.classe;
      expect(enc.startsWith("V") && proc.startsWith("N")).toBe(false);
      expect(proc.startsWith("V") && enc.startsWith("N")).toBe(false);
    }
  });

  it("returns an array", () => {
    expect(Array.isArray(getListsSegment(lex, "من"))).toBe(true);
  });
});
