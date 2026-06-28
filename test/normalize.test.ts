/** Unit tests for the Arabic string layer (ports of ArabicStringUtil/Validator/CreatHamza). */
import { describe, expect, it } from "vitest";

import * as N from "../src/normalize.js";

describe("normalize", () => {
  it("removeAllDiacritics", () => {
    expect(N.removeAllDiacritics("كَتَبَ")).toBe("كتب");
    expect(N.removeAllDiacritics("مُسْتَوَى")).toBe("مستوى");
    expect(N.removeAllDiacritics("بلا")).toBe("بلا");
  });

  it("removeLastDiacritics keeps shadda", () => {
    expect(N.removeLastDiacritics("كَتَبَ")).toBe("كَتَب");
    expect(N.removeLastDiacritics("أَنّ")).toBe("أَنّ"); // trailing shadda kept
  });

  it("normalizeHamza folds carriers", () => {
    expect(N.normalizeHamza("سأل")).toBe("سءل");
    expect(N.normalizeHamza("مؤمن")).toBe("مءمن");
    expect(N.normalizeHamza("بئر")).toBe("بءر");
  });

  it("replaceAllHamza drops carriers", () => {
    expect(N.replaceAllHamza("سأل")).toBe("سل");
  });

  it("typeHamza", () => {
    expect(N.typeHamza("سأل")).toBe("أ");
    expect(N.typeHamza("مؤمن")).toBe("ؤ");
    expect(N.typeHamza("كتب")).toBe("");
  });

  it("predicates", () => {
    expect(N.isDiacritic("َ")).toBe(true);
    expect(N.isDiacritic("ك")).toBe(false);
    expect(N.isSolar("ت")).toBe(true);
    expect(N.isSolar("ق")).toBe(false);
    expect(N.isDefinit("N1")).toBe(true);
    expect(N.isDefinit("V1")).toBe(false);
    expect(N.isHamza("أ")).toBe(true);
    expect(N.isHamza("ا")).toBe(false);
  });

  it("wordFromRootAndPattern", () => {
    // فَعَلَ over root ك-ت-ب -> كَتَبَ
    expect(N.wordFromRootAndPattern("كتب", "فَعَلَ")).toBe("كَتَبَ");
    // مَفْعُول over ك-ت-ب -> مَكْتُوب
    expect(N.wordFromRootAndPattern("كتب", "مَفْعُول")).toBe("مَكْتُوب");
  });

  it("isDiacPattern", () => {
    expect(N.isDiacPattern("كتب", "فعل")).toBe(true);
    expect(N.isDiacPattern("كتب", "فمل")).toBe(false); // literal م must match
  });

  it("correctErreur normalizes alef wasla", () => {
    expect(N.correctErreur("ٱلكتاب").includes("ٱ")).toBe(false);
  });
});
