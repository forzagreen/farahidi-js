/**
 * Tests for the public morphological model built on top of the AlKhalil port.
 *
 * The golden suite checks the raw per-(reading × ending) records against the
 * Java reference; here we check what `analyze()` makes of them: readings
 * collapsed over their إعراب endings, structured features and affixes, `null`
 * instead of the `"-"` / `"#"` placeholders, numeric scores.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Analyzer, analyze, analyzeText, type Analysis } from "../src/index.js";
import { parsePosLabel } from "../src/morphology.js";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden.jsonl", import.meta.url));
const WORDS: string[] = readFileSync(GOLDEN, "utf-8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l).word);

const analyzer = new Analyzer();

// Lexicon strings carry shadda (U+0651) before the vowel; spell these out so the
// literal does not depend on how the editor orders combining marks.
const SHADDA_FATHA = "َّ";

describe("collapsing over إعراب", () => {
  it("عندليب is one reading with five inflections", () => {
    const analyses = analyze("عندليب");
    expect(analyses).toHaveLength(1);
    const a = analyses[0];
    expect(a.diacritized).toBe("عَنْدَلِيب"); // no case ending at the morphological level
    expect([a.lemma, a.root, a.stem]).toEqual(["عَنْدَلِيب", "عندل", "عَنْدَلِيب"]);
    expect([a.pattern, a.lemmaPattern]).toEqual(["فَعْلَلِيل", "فَعْلَلِيل"]);
    expect([a.pos, a.type, a.gender, a.number]).toEqual(["اسم", "اسم جامد", "مذكر", "مفرد"]);
    expect(a.tense).toBeNull();
    expect(a.person).toBeNull();
    expect("case" in a).toBe(false);
    expect("caseOrMood" in a).toBe(false);
    const got = new Set(a.inflections.map((i) => `${i.diacritized}|${i.case}|${i.state}`));
    expect(got).toEqual(
      new Set([
        "عَنْدَلِيبٌ|مرفوع|نكرة",
        "عَنْدَلِيبٍ|مجرور|نكرة",
        "عَنْدَلِيبُ|مرفوع|مضاف",
        "عَنْدَلِيبَ|منصوب|مضاف",
        "عَنْدَلِيبِ|مجرور|مضاف",
      ]),
    );
    expect(a.inflections.every((i) => i.mood === null)).toBe(true);
    expect(a.score).toBe(Math.max(...a.inflections.map((i) => i.score)));
  });

  it("inflections cover every raw record", () => {
    for (const word of WORDS) {
      const raw = analyzer._processToken(word);
      const analyses = analyzer.analyze(word);
      expect(analyses.length).toBeLessThanOrEqual(raw.length);
      const forms = new Set(analyses.flatMap((a) => a.inflections.map((i) => i.diacritized)));
      expect(forms).toEqual(new Set(raw.map((r) => r.voweledWord)));
      for (const a of analyses) {
        expect(a.inflections.length).toBeGreaterThan(0);
        expect(a.score).toBe(Math.max(...a.inflections.map((i) => i.score)));
        const scores = a.inflections.map((i) => i.score);
        expect(scores).toEqual([...scores].sort((x, y) => y - x));
      }
    }
  });

  it("the best raw record is in a top-scored analysis", () => {
    for (const word of WORDS) {
      const raw = analyzer._processToken(word);
      if (raw.length === 0) continue;
      let best = raw[0];
      for (const r of raw) if (r.priority > best.priority) best = r;
      const analyses = analyzer.analyze(word);
      const topScore = analyses[0].score;
      expect(Number(best.priority)).toBe(topScore);
      expect(
        analyses.some(
          (a) => a.score === topScore && a.lemma === best.lemma && (a.root ?? "-") === best.root,
        ),
      ).toBe(true);
    }
  });

  it("is sorted by score descending", () => {
    for (const word of ["كتب", "لأنهم", "مدرسة"]) {
      const scores = analyze(word).map((a) => a.score);
      expect(scores).toEqual([...scores].sort((x, y) => y - x));
      expect(scores.every((s) => typeof s === "number")).toBe(true);
    }
  });

  it("maqṣūr noun collapses across the tanween spelling", () => {
    const analyses = analyze("إلى");
    const particles = analyses.filter((a) => a.pos === "حرف");
    const nouns = analyses.filter((a) => a.pos === "اسم");
    expect(particles).toHaveLength(1);
    expect(nouns).toHaveLength(1);
    const p = particles[0];
    expect([p.type, p.root, p.pattern, p.lemmaPattern]).toEqual(["جر", null, null, null]);
    expect(p.inflections).toEqual([
      { diacritized: "إِلَى", case: null, mood: null, state: null, score: p.score },
    ]);
    const n = nouns[0];
    expect([n.diacritized, n.pattern]).toEqual(["إِلَى", "فِعَل"]);
    expect(n.inflections).toHaveLength(6);
    expect(new Set(n.inflections.map((i) => i.diacritized))).toEqual(new Set(["إِلًى", "إِلَى"]));
  });

  it("unanalyzable word gives an empty array", () => {
    expect(analyze("zzz")).toEqual([]);
  });
});

describe("features and affixes", () => {
  it("verb features and affixes", () => {
    const analyses = analyze("يكتبوا");
    expect(analyses.length).toBeGreaterThan(0);
    for (const a of analyses) {
      expect(a.pos).toBe("فعل");
      expect(a.tense).toBe("مضارع");
      expect(a.type).toBeNull();
      expect(a.gender).toBeNull();
      expect(["معلوم", "مجهول"]).toContain(a.voice);
      expect(["مجرد", "مزيد"]).toContain(a.augmentation);
      expect(a.emphatic).toBe(false);
      expect(a.prefixes).toEqual([{ form: "ي", description: "حرف المضارعة" }]);
      expect(a.suffixes).toEqual([{ form: "وا", description: "واو الجماعة" }]);
      expect(a.proclitics).toEqual([]);
      expect(a.enclitics).toEqual([]);
      // The same written form is منصوب or مجزوم: two inflections, one reading.
      expect(new Set(a.inflections.map((i) => i.mood))).toEqual(new Set(["منصوب", "مجزوم"]));
      expect(a.inflections.every((i) => i.case === null && i.state === null)).toBe(true);
    }
    const top = analyses[0];
    expect([top.lemma, top.root, top.person, top.pronoun]).toEqual(["كَتَبَ", "كتب", "غائب", "هم"]);
  });

  it("indeclinable verbs keep their final vowel", () => {
    const analyses = analyze("كتبوا");
    for (const a of analyses) {
      expect(["ماض", "أمر"]).toContain(a.tense);
      expect(a.inflections).toHaveLength(1);
      expect(a.inflections[0].mood).toBeNull();
      expect(a.inflections[0].diacritized).toBe(a.diacritized);
    }
    expect(analyses.map((a) => a.diacritized)).toContain("كَتَبُوا");
    expect(
      analyze("قال")
        .filter((a) => a.pos === "فعل")
        .map((a) => a.diacritized),
    ).toContain("قَالَ");
  });

  it("emphatic verb", () => {
    const emphatic = analyze("لنكتبن").filter((a) => a.emphatic);
    expect(emphatic.length).toBeGreaterThan(0);
    for (const a of emphatic) {
      expect(a.inflections[0].mood).toBeNull(); // مبني with نون التوكيد
      expect(a.proclitics.length).toBeGreaterThan(0);
      expect(a.prefixes).toEqual([{ form: "ن", description: "حرف المضارعة" }]);
    }
  });

  it("clitics and nominal suffixes are structured", () => {
    for (const a of analyze("بالمدرسة")) {
      expect(a.proclitics).toEqual([{ form: "بِال", description: "حرف الجر+ال:التعريف" }]);
      expect(a.suffixes).toEqual([{ form: "ة", description: "تاء التأنيث" }]);
      expect(a.prefixes).toEqual([]);
      expect(a.enclitics).toEqual([]);
      expect(a.inflections).toEqual([
        {
          diacritized: a.diacritized + "ِ",
          case: "مجرور",
          mood: null,
          state: "معرف",
          score: a.score,
        },
      ]);
    }
    const duals = analyze("معلمتان");
    expect(duals.length).toBeGreaterThan(0);
    for (const a of duals) {
      expect(a.suffixes).toEqual([
        { form: "ة", description: "تاء التأنيث" },
        { form: "ان", description: "علامة الإعراب" },
      ]);
      expect([a.number, a.gender]).toEqual(["مثنى", "مؤنث"]);
    }
    const particle = analyze("لأنهم").find((a) => a.pos === "حرف")!;
    expect(particle.proclitics).toEqual([{ form: "لَ", description: "حرف الابتداء" }]);
    expect(particle.enclitics).toEqual([{ form: "هُمْ", description: "ضمير الغائبين" }]);
    expect(particle.type).toBe("ناسخ");
    expect(particle.lemma).toBe("أَن" + SHADDA_FATHA);
  });

  it("proper noun", () => {
    const a = analyze("محمد")[0];
    expect([a.pos, a.type, a.root, a.pattern]).toEqual(["اسم", "اسم علم", null, null]);
    expect(a.diacritized).toBe("مُحَم" + SHADDA_FATHA + "د");
    expect(a.number).toBe("مفرد");
    expect(a.gender).toBeNull();
    expect(new Set(a.inflections.map((i) => `${i.case}|${i.state}`))).toEqual(
      new Set(["مرفوع|نكرة", "مجرور|نكرة", "مرفوع|مضاف", "منصوب|مضاف", "مجرور|مضاف"]),
    );
  });

  it("exceptional الله", () => {
    const [a, ...rest] = analyze("الله");
    expect(rest).toEqual([]);
    expect([a.pos, a.type, a.lemma, a.root, a.score]).toEqual([
      "اسم",
      "اسم الجلالة",
      "الله",
      null,
      1,
    ]);
    expect(a.inflections).toEqual([
      { diacritized: "الله", case: null, mood: null, state: null, score: 1 },
    ]);
    const [b] = analyze("والله");
    expect(b.proclitics).toEqual([{ form: "وَ", description: null }]);
    expect(b.enclitics).toEqual([]);
  });

  it("parsePosLabel", () => {
    expect(parsePosLabel("اسم|إشارة|مؤنث|جمع")).toEqual({
      pos: "اسم",
      type: "إشارة",
      tense: null,
      gender: "مؤنث",
      number: "جمع",
      person: null,
    });
    expect(parsePosLabel("اسم|ضمير|الغائب").person).toBe("غائب");
    expect(parsePosLabel("فعل|ماض|جامد")).toEqual({
      pos: "فعل",
      type: "جامد",
      tense: "ماض",
      gender: null,
      number: null,
      person: null,
    });
    expect(parsePosLabel("اسم|فعل|ماض").type).toBe("فعل");
    expect(parsePosLabel("حرف|").type).toBeNull();
    expect(parsePosLabel("جار ومجرور").pos).toBe("حرف");
    expect(parsePosLabel("اسم الجلالة")).toEqual({
      pos: "اسم",
      type: "اسم الجلالة",
      tense: null,
      gender: null,
      number: null,
      person: null,
    });
  });
});

describe("data model", () => {
  it("is plain JSON data", () => {
    const a: Analysis = analyze("بالمدرسة")[0];
    const text = JSON.stringify(a);
    expect(JSON.parse(text)).toEqual(a);
    expect(Object.keys(a)).toContain("inflections");
    expect(Object.keys(a)).not.toContain("caseOrMood");
  });

  it("TokenResult.root is null for particles", () => {
    const byToken = new Map(analyzeText("ذهب الولد إلى المدرسة").map((r) => [r.token, r]));
    expect(byToken.get("إلى")!.root).toBeNull();
    expect(byToken.get("إلى")!.analyzed).toBe(true);
    expect(byToken.get("ذهب")!.root).toBe("ذهب");
  });
});
