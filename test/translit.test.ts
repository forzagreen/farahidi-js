/** Unit tests for Buckwalter⇄Arabic transliteration. */
import { describe, expect, it } from "vitest";

import { arabicToBw, bwToArabic } from "../src/translit.js";

describe("transliteration", () => {
  it("bwToArabic maps Buckwalter to Arabic script", () => {
    expect(bwToArabic("ktb")).toBe("كتب");
    expect(bwToArabic("musotawaY")).toBe("مُسْتَوَى");
    expect(bwToArabic(">aHomad")).toBe("أَحْمَد");
  });

  it("arabicToBw is the inverse", () => {
    for (const w of ["كتب", "مُسْتَوَى", "أَحْمَد", "قَرَأَ"]) {
      expect(bwToArabic(arabicToBw(w))).toBe(w);
    }
  });

  it("unknown characters pass through unchanged", () => {
    expect(bwToArabic("ktb 123")).toBe("كتب 123");
  });
});
