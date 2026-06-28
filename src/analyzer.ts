/**
 * Layer-1 (out-of-context) morphological analysis — port of AlKhalil's
 * `AlKhalil2Analyzer.processToken` and the verbal/nominal/propernoun/toolword/
 * exceptional analyzers.
 *
 * The pipeline per word: normalize → exceptional lookup (short-circuits) →
 * segment into proclitic+stem+enclitic → for each segment run the category
 * analyzers (gated by clitic `classe`) → resolve the `Formulas` join → assemble
 * {@link Analysis} candidates. Results are returned in pipeline order;
 * {@link Analyzer.analyze} sorts them by `priority` (descending).
 */
import type { Segment } from "./clitics.js";
import { getListsSegment } from "./clitics.js";
import { fmtFreq } from "./freq.js";
import { Lexicon } from "./lexicon.js";
import type { Analysis } from "./models.js";
import * as N from "./normalize.js";
import { decodeNoun, decodeVerb } from "./pos.js";
import { vowelize } from "./vowelize.js";

const NUMBERED = "123456789";

function makeAnalysis(
  voweled: string,
  proclitic: string,
  stem: string,
  pos: string,
  diacPatternStem: string,
  patternStem: string,
  lemma: string,
  patternLemma: string,
  root: string,
  casemood: string,
  enclitic: string,
  priority: string,
): Analysis {
  // Replicates the AlKhalil `Result` constructor, including its stem
  // recomputation from root + diac pattern.
  const dps = N.removeLastDiacritics(diacPatternStem);
  if (root !== "#" && root !== "-" && dps !== "-") {
    stem = N.wordFromRootAndPattern(root, dps);
  }
  return {
    voweledWord: voweled,
    proclitic,
    stem,
    partOfSpeech: pos,
    diacPatternStem: dps,
    patternStem,
    lemma,
    patternLemma,
    root,
    caseOrMood: casemood,
    enclitic,
    priority,
  };
}

/**
 * Reusable analyzer. Construct once and call {@link process_token} /
 * {@link analyze} repeatedly; the bundled tables load lazily and are shared.
 */
export class Analyzer {
  private lex: Lexicon;
  private verbCache: Map<string, Map<string, Map<string, any[]>>>;
  private nounCache: Map<string, Map<string, Map<string, any[]>>>;

  constructor() {
    this.lex = new Lexicon();
    this.verbCache = new Map();
    this.nounCache = new Map();
  }

  // ------------------------------------------------------------------ API
  /** All analyses of `word`, sorted by `priority` (descending). */
  analyze(word: string): Analysis[] {
    const results = this.processToken(word);
    // AlKhalil/Python sort by the priority STRING descending, stably (string
    // sort == numeric sort for these fixed-format non-negative decimals, and
    // ties keep pipeline order). JS Array.sort is stable since ES2019.
    return results
      .map((a, i) => [a, i] as const)
      .sort((x, y) => {
        if (x[0].priority < y[0].priority) return 1;
        if (x[0].priority > y[0].priority) return -1;
        return x[1] - y[1];
      })
      .map(([a]) => a);
  }

  /** Port of `processToken` — analyses in pipeline order (unsorted). */
  processToken(word: string): Analysis[] {
    const lex = this.lex;
    const unvoweled = N.removeAllDiacritics(word);
    let normalized = N.correctErreur(word);

    const exc = this.analyzeExceptional(normalized, unvoweled);
    if (exc.length) return exc;

    const segments = getListsSegment(lex, unvoweled);
    const results: Analysis[] = [];
    for (const seg of segments) {
      results.push(...this.analyzeProperNoun(normalized, unvoweled, seg));
      results.push(...this.filtreHamza(normalized, this.analyzeToolwords(normalized, unvoweled, seg)));
      results.push(...this.filtreHamza(normalized, this.analyzeNominal(normalized, seg)));
      results.push(...this.filtreHamza(normalized, this.analyzeVerbal(normalized, seg)));
    }

    if (results.length === 0 && normalized.endsWith("ًا") && !normalized.endsWith("ًّا")) {
      normalized = normalized.replace(/ًا$/, "ًّا");
      for (const seg of segments) {
        results.push(...this.analyzeProperNoun(normalized, unvoweled, seg));
        results.push(...this.analyzeNominal(normalized, seg));
      }
    }
    return results;
  }

  // -------------------------------------------------------------- helpers
  private filtreHamza(normalizedWord: string, results: Analysis[]): Analysis[] {
    const hamza = N.typeHamza(normalizedWord);
    if (hamza === "") return results;
    return results.filter((r) => r.stem.includes(hamza));
  }

  // ----------------------------------------------------------- exceptional
  private analyzeExceptional(normalizedWord: string, unvoweledWord: string): Analysis[] {
    const ew = this.lex.map("exceptional").get(unvoweledWord) as any;
    if (ew == null) return [];
    return [
      makeAnalysis(
        ew.voweledform,
        ew.proclitic,
        ew.stem,
        ew.pos,
        "-",
        "-",
        "الله",
        "-",
        "-",
        "-",
        ew.enclitic,
        "1",
      ),
    ];
  }

  // ------------------------------------------------------------- toolwords
  private analyzeToolwords(normalizedWord: string, unvoweledWord: string, seg: Segment): Analysis[] {
    const lex = this.lex;
    const stem = seg.stem;
    const unv = lex.map("toolwords_unvoweled").get(stem) as string | undefined;
    if (unv == null) return [];
    const proc = seg.proclitic;
    const enc = seg.enclitic;
    const voweledList = lex.list("toolwords_voweled");
    const posList = lex.list("toolwords_pos");
    const out: Analysis[] = [];
    for (const sid of unv.split(" ")) {
      const tw = voweledList[Number(sid) - 1];
      const procClass = tw.procClass || "";
      const encClass = tw.encClass || "";
      if (!procClass.includes(seg.proclitic.classe) || !encClass.includes(seg.enclitic.classe)) {
        continue;
      }
      const twvow: string = tw.voweledform;
      const endsI = twvow.endsWith("ي") || twvow.endsWith("يْ") || twvow.endsWith("ِ");
      if (enc.unvoweledform === "ه") enc.voweledform = endsI ? "هِ" : "هُ";
      else if (enc.unvoweledform === "هما") enc.voweledform = endsI ? "هِمَا" : "هُمَا";
      else if (enc.unvoweledform === "هم") enc.voweledform = endsI ? "هِمْ" : "هُمْ";
      else if (enc.unvoweledform === "هن") enc.voweledform = endsI ? "هِنَّ" : "هُنَّ";
      const lemma = tw.lemma;
      const rootRaw = tw.root || "";
      const root = rootRaw === N.removeAllDiacritics(rootRaw) ? rootRaw : "-";
      let voweled: string;
      if (["N1", "N2", "N3", "N5"].some((c) => procClass.includes(c))) {
        const res = twvow;
        if (N.isSolar(res[0])) {
          voweled = proc.voweledform + "ْ" + res[0] + "ّ" + res.slice(1) + enc.voweledform;
        } else {
          voweled = proc.voweledform + "ْ" + res + enc.voweledform;
        }
      } else {
        voweled = proc.voweledform + twvow + enc.voweledform;
      }
      const pf = proc.voweledform === "" ? "#" : proc.voweledform + " : " + (proc.desc || "");
      const sf = enc.voweledform === "" ? "#" : enc.voweledform + " : " + (enc.desc || "");
      const typeStr = posList[Number(tw.pos) - 1];
      voweled = voweled.replaceAll("لَلْلّ", "لَلّ").replaceAll("لِلْلّ", "لِلّ");
      voweled = voweled.replaceAll("لِالّ", "لِلّ").replaceAll("لَالّ", "لَلّ");
      if (!N.notCompatible(normalizedWord, voweled)) {
        out.push(
          makeAnalysis(
            voweled,
            pf,
            N.removeLastDiacritics(twvow),
            typeStr,
            "-",
            "-",
            lemma,
            "-",
            root,
            "-",
            sf,
            "0.0001100101",
          ),
        );
      }
    }
    return out;
  }

  // ------------------------------------------------------------ propernoun
  private analyzeProperNoun(normalizedWord: string, unvoweledWord: string, seg: Segment): Analysis[] {
    const procClass = seg.proclitic.classe;
    const encClass = seg.enclitic.classe;
    if (procClass.includes("V") || encClass.includes("V")) return [];
    const lex = this.lex;
    const unv = lex.map("propernoun_unvoweled").get(seg.stem) as string | undefined;
    if (unv == null) return [];
    const voweledList = lex.list("propernoun_voweled");
    const posList = lex.list("propernoun_pos");
    const casemoodList = lex.list("propernoun_casemood");
    const proc = seg.proclitic;
    const enc = seg.enclitic;
    const out: Analysis[] = [];
    for (const sid of unv.split(" ")) {
      const ipn = Number(sid);
      if (ipn > voweledList.length) continue;
      const pn = voweledList[ipn - 1];
      const pnvow: string = pn.vowform;
      const endsI = pnvow.endsWith("ي") || pnvow.endsWith("يْ") || pnvow.endsWith("ِ");
      if (enc.unvoweledform === "ه") enc.voweledform = endsI ? "هِ" : "هُ";
      else if (enc.unvoweledform === "هما") enc.voweledform = endsI ? "هِمَا" : "هُمَا";
      else if (enc.unvoweledform === "هم") enc.voweledform = endsI ? "هِمْ" : "هُمْ";
      else if (enc.unvoweledform === "هن") enc.voweledform = endsI ? "هِنَّ" : "هُنَّ";
      const pf = proc.voweledform;
      const sf = enc.voweledform;
      let voweled: string;
      if (proc.classe === "N4" && proc.unvoweledform.endsWith("ل") && pnvow.startsWith("ا")) {
        let val = pnvow;
        if (enc.unvoweledform !== "") val = val.replaceAll("ة", "ت");
        voweled = pf + val.slice(1) + sf;
      } else if (N.isDefinit(proc.classe)) {
        let res = pnvow;
        if (enc.unvoweledform !== "") res = res.replaceAll("ة", "ت");
        if (N.isSolar(res[0])) {
          voweled = pf + "ْ" + res[0] + "ّ" + res.slice(1) + sf;
        } else {
          voweled = pf + "ْ" + res + sf;
        }
      } else {
        let res = pnvow;
        if (enc.unvoweledform !== "") res = res.replaceAll("ة", "ت");
        voweled = pf + res + sf;
      }
      if (N.notCompatible(normalizedWord, voweled, seg, false)) continue;
      const lemma = pn.lemma;
      const rootRaw = pn.root || "";
      const root = rootRaw === N.removeAllDiacritics(rootRaw) ? rootRaw : "-";
      const pfOut = pf === "" ? "#" : pf + " : " + (proc.desc || "");
      const sfOut = sf === "" ? "#" : sf + " : " + (enc.desc || "");
      const pos = posList[Number(pn.pos) - 1];
      const typeStr = [pos.main || "", pos.type || "", pos.gender || "", pos.number || ""].join("|");
      const cas: string = casemoodList[Number(pn.cas) - 1].valAR;
      if (Analyzer.validProperNoun(seg, cas, voweled)) {
        out.push(
          makeAnalysis(
            voweled,
            pfOut,
            N.removeLastDiacritics(pnvow),
            typeStr,
            "-",
            "-",
            lemma,
            "-",
            root,
            cas,
            sfOut,
            "0.01100101",
          ),
        );
      }
    }
    return out;
  }

  private static validProperNoun(seg: Segment, caseormood: string, voweled: string): boolean {
    const pc = seg.proclitic.classe;
    if (
      (voweled.includes("ً") || voweled.includes("ٍ") || voweled.includes("ٌ")) &&
      (seg.enclitic.unvoweledform !== "" || N.isDefinit(pc))
    ) {
      return false;
    }
    if ((pc === "N2" || pc === "C2" || pc === "C3") && caseormood === "مجرور") return false;
    if ((pc === "N4" || pc === "N5") && caseormood !== "مجرور") return false;
    return true;
  }

  // --------------------------------------------------------- derived join
  private getPossibleRoots(stem: string, rules: string, cat: string): Set<string> {
    const roots = new Set<string>();
    for (const rule of rules.split(" ")) {
      let root = "";
      for (const r of rule) {
        if (NUMBERED.includes(r)) {
          const c = stem[Number(r) - 1];
          root += N.isHamza(c) ? "ء" : c;
        } else {
          root += N.isHamza(r) ? "ء" : r;
        }
      }
      if (this.lex.containsRoot(cat, root)) {
        roots.add(root);
      }
    }
    return roots;
  }

  private getInfoResult(idRoot: string, idPatternStem: string, length: number, cat: string): any[] {
    const result: any[] = [];
    const patternIds = new Set(idPatternStem.split(" "));
    const formulas = this.lex.formulas(cat, length);
    for (const idr of idRoot.split(" ")) {
      const idx = Number(idr);
      if (!(idx > 0 && idx <= formulas.length)) continue;
      const f = formulas[idx - 1];
      if (patternIds.has(f.idDiacPatternStem)) {
        result.push(f);
      }
    }
    return result;
  }

  private possibleSolutions(
    seg: Segment,
    cat: string,
    cache: Map<string, Map<string, Map<string, any[]>>>,
  ): Map<string, Map<string, any[]>> {
    const stem1 = seg.stem;
    const cached = cache.get(stem1);
    if (cached) return cached;
    const lex = this.lex;
    const stem = stem1 ? stem1[0] + N.normalizeHamza(stem1.slice(1)) : stem1;
    const lenDiac = stem.length;
    const result = new Map<string, Map<string, any[]>>();
    for (const unv of lex.unvoweledStems(cat, lenDiac)) {
      let sUnvoweled: string = unv.val;
      sUnvoweled = sUnvoweled[0] + N.normalizeHamza(sUnvoweled.slice(1));
      if (!N.isDiacPattern(stem, sUnvoweled)) continue;
      const iroots = this.getPossibleRoots(stem, unv.rules, cat);
      if (iroots.size === 0) continue;
      const rootsMap = new Map<string, any[]>();
      let add = false;
      for (const root of iroots) {
        const val = N.wordFromRootAndPattern(root, sUnvoweled);
        const rootEnt = lex.rootEntity(cat, root);
        if (rootEnt == null) continue;
        const lenStem = seg.stem.length;
        const idRoot = lenStem >= 1 && lenStem <= 12 ? rootEnt["len" + lenStem] : null;
        if (idRoot && N.normalizeHamza(val) === N.normalizeHamza(stem)) {
          const res = this.getInfoResult(idRoot, unv.ids, lenStem, cat);
          if (res.length) {
            rootsMap.set(root, res);
            add = true;
          }
        }
      }
      if (add) {
        result.set(unv.val, rootsMap);
      }
    }
    cache.set(stem1, result);
    return result;
  }

  private static allRootFormulas(solutions: Map<string, Map<string, any[]>>): Map<string, any[]> {
    // root -> (formula-object-identity -> formula), mirroring Python's id(f) dedup.
    const out = new Map<string, Map<any, any>>();
    for (const roots of solutions.values()) {
      for (const [root, formulas] of roots) {
        let bucket = out.get(root);
        if (!bucket) {
          bucket = new Map<any, any>();
          out.set(root, bucket);
        }
        for (const f of formulas) {
          bucket.set(f, f);
        }
      }
    }
    const final = new Map<string, any[]>();
    for (const [root, bucket] of out) {
      final.set(root, [...bucket.values()]);
    }
    return final;
  }

  private infoResults(formula: any, length: number, cat: string): any[] {
    const lex = this.lex;
    const out: any[] = new Array(10).fill("");
    let vd = lex.voweledDiacStem(cat, length, Number(formula.idDiacPatternStem));
    out[0] = vd.val;
    out[1] = vd.freq;
    {
      const [clen, cid] = formula.idCanonicPatternStem.split(".");
      vd = lex.voweledCanonicStem(cat, Number(clen), Number(cid));
      out[2] = vd.val;
      out[3] = vd.freq;
    }
    {
      const [llen, lid] = formula.idDiacPatternLemma.split(".");
      vd = lex.voweledDiacLemma(cat, Number(llen), Number(lid));
      out[4] = vd.val;
      out[5] = vd.freq;
    }
    {
      const [plen, pid] = formula.idCanonicPatternLemma.split(".");
      vd = lex.voweledCanonicLemma(cat, Number(plen), Number(pid));
      out[6] = vd.val;
      out[7] = vd.freq;
    }
    out[8] = formula.idPartOfSpeech;
    out[9] = formula.idCaseOrMood;
    return out;
  }

  // -------------------------------------------------------------- verbal
  private analyzeVerbal(normalizedWord: string, seg: Segment): Analysis[] {
    const stem = seg.stem;
    const procClass = seg.proclitic.classe;
    const encClass = seg.enclitic.classe;
    if (!(stem.length >= 1 && stem.length <= 9) || procClass.includes("N") || encClass.includes("N")) {
      return [];
    }
    const lex = this.lex;
    const solutions = this.possibleSolutions(seg, "Verbs", this.verbCache);
    const imap = Analyzer.allRootFormulas(solutions);
    const out: Analysis[] = [];
    const lenStem = seg.stem.length;
    for (const [sRoot, formulas] of imap) {
      for (const sol of formulas) {
        const info = this.infoResults(sol, lenStem, "Verbs");
        const diac = info[0];
        const diacFreq = Number(info[1]);
        const canonicPattern = info[2];
        const canonicFreq = Number(info[3]);
        const lemma = N.wordFromRootAndPattern(sRoot, info[4]);
        const lemmaFreq = Number(info[5]);
        const lemmapattern = info[6];
        const lemmapatternFreq = Number(info[7]);
        const idpos = Number(info[8]);
        const feats = decodeVerb(lex, idpos);
        const posFreq = Number(feats.freq);
        const idcm = Number(info[9]);
        const cm: string = lex.casemood("Verbs", idcm).valAR;
        const voweled = vowelize(seg, diac);
        const voweledWord = voweled[0];
        if (
          !Analyzer.validVerbal(
            seg,
            voweledWord,
            normalizedWord,
            feats.Type,
            feats.Voice,
            feats.Person2,
            cm,
            feats.Transitivity,
          )
        ) {
          continue;
        }
        const solArr = this.verbalInterpret(seg, feats.Type, feats.Person, feats.Person2, feats.Emphasized, cm);
        const stemH = N.correctStemHamza(seg.stem);
        const freq = (diacFreq + canonicFreq + lemmaFreq + lemmapatternFreq + posFreq) / 5.0;
        const priority = fmtFreq(freq);
        out.push(
          makeAnalysis(
            voweledWord,
            solArr[0],
            stemH,
            feats.partofspeech,
            diac,
            canonicPattern,
            lemma,
            lemmapattern,
            sRoot,
            cm,
            solArr[3],
            priority,
          ),
        );
      }
    }
    return out;
  }

  private static validVerbal(
    seg: Segment,
    voweledWord: string,
    normalizedWord: string,
    type_: string,
    _voice: string,
    person2: string,
    casemood: string,
    transitivity: string,
  ): boolean {
    const pref = seg.proclitic.classe;
    const suff = seg.enclitic.classe;
    if (transitivity === "لازم" && seg.enclitic.unvoweledform !== "") return false;
    if (pref === "V1" && type_ !== "مضارع" && casemood !== "مرفوع") return false;
    if (pref === "V2" && type_ !== "مضارع" && casemood !== "منصوب") return false;
    if (pref === "V3" && type_ !== "مضارع" && casemood !== "مجزوم") return false;
    if (pref === "C2" && type_ === "أمر") return false;
    if ((suff === "V2" || suff === "V3") && type_ === "أمر") return false;
    if (suff === "V4" && person2 !== "أنتم") return false;
    if (N.notCompatible(normalizedWord, voweledWord, seg, false)) return false;
    return true;
  }

  private verbalInterpret(
    seg: Segment,
    type_: string,
    person: string,
    person2: string,
    emphasized: string,
    casemood: string,
  ): string[] {
    const result: string[] = new Array(7).fill("");
    let prefix1: string;
    if (seg.proclitic.voweledform === "") {
      prefix1 = "#";
      result[5] = "#";
    } else {
      prefix1 = seg.proclitic.voweledform + "|" + (seg.proclitic.desc || "");
      result[5] = seg.proclitic.voweledform;
    }
    let suffix1: string;
    if (seg.enclitic.voweledform === "") {
      suffix1 = "#";
      result[6] = "#";
    } else {
      suffix1 = seg.enclitic.voweledform + "|" + (seg.enclitic.desc || "");
      result[6] = seg.enclitic.voweledform;
    }
    const prefix = Analyzer.procliticValue(type_, person, person2);
    const suffix = Analyzer.encliticValue(type_, person, person2, emphasized, casemood);
    result[4] = "2";
    if (prefix !== "") {
      result[0] = prefix1 === "#" ? prefix : prefix1 + "+" + prefix;
    } else {
      result[0] = prefix1;
    }
    if (suffix !== "") {
      result[3] = suffix1 === "#" ? suffix : suffix + "+" + suffix1;
    } else {
      result[3] = suffix1;
    }
    return result;
  }

  private static procliticValue(type_: string, person: string, person2: string): string {
    if (type_ === "مضارع") {
      if (person === "مخاطب") return "ت|حرف المضارعة";
      if (person2 === "أنا") return "أ|حرف المضارعة";
      if (person2 === "نحن") return "ن|حرف المضارعة";
      if (person2 === "هي") return "ت|تاء الغائبة";
      if (person2 === "هما(ة)") return "ت|حرف المضارعة";
      return "ي|حرف المضارعة";
    }
    return "";
  }

  private static encliticValue(
    type_: string,
    person: string,
    person2: string,
    emphasized: string,
    casemood: string,
  ): string {
    if (emphasized === "مؤكد") {
      return person === "مخاطب" ? "ن|نون التوكيد" : "";
    }
    if (type_ === "أمر") {
      if (person === "مخاطب" && person2 !== "أنتَ") {
        if (person2 === "أنتِ") return "ي|ياء المخاطبة";
        if (person2 === "أنتما") return "ا|ألف المثنى";
        if (person2 === "أنتم") return "وا|واو الجماعة";
        if (person2 === "أنتن") return "ن|نون النسوة";
        return "";
      }
      return "";
    }
    if (type_ === "ماض") {
      const table: Record<string, string> = {
        أنا: "ت|تاء المتكلم",
        نحن: "نا|نون المتكلمين",
        أنتَ: "ت|تاء المخاطب",
        أنتِ: "ت|تاء المخاطبة",
        أنتما: "تما|تاء المخاطبين",
        أنتم: "تم|تاء المخاطبين",
        أنتن: "تن|تاء المخاطبات",
        هي: "ت|تاء التأنيث الساكنة",
        هما: "ا|ألف الاثنين",
        "هما(ة)": "تا|تاء التأنيت وألف الاثنين",
        هم: "وا|واو الجماعة",
        هن: "ن|نون النسوة",
      };
      return table[person2] ?? "";
    }
    if (type_ === "مضارع") {
      if (person2 === "هن" || person2 === "أنتن") return "ن|نون النسوة";
      if (person2 === "أنتِ") {
        return casemood === "مرفوع" ? "ين|ياء المخاطبة والنون علامة الرفع" : "ي|ياء المخاطبة";
      }
      if (person2 === "أنتما" || person2 === "هما(ة)" || person2 === "هما") {
        return casemood === "مرفوع" ? "ان|ألف المثنى والنون علامة الرفع" : "ا|ألف المثنى";
      }
      if (person2 === "أنتم" || person2 === "هم") {
        return casemood === "مرفوع" ? "ون|واو الجماعة والنون علامة الرفع" : "وا|واو الجماعة";
      }
      return "";
    }
    return "";
  }

  // -------------------------------------------------------------- nominal
  private analyzeNominal(normalizedWord: string, seg: Segment): Analysis[] {
    const stem = seg.stem;
    const procClass = seg.proclitic.classe;
    const encClass = seg.enclitic.classe;
    if (!(stem.length >= 2 && stem.length <= 11) || procClass.includes("V") || encClass.includes("V")) {
      return [];
    }
    const lex = this.lex;
    const solutions = this.possibleSolutions(seg, "Nouns", this.nounCache);
    const imap = Analyzer.allRootFormulas(solutions);
    const out: Analysis[] = [];
    const lenStem = seg.stem.length;
    for (const [sRoot, formulas] of imap) {
      for (const sol of formulas) {
        const info = this.infoResults(sol, lenStem, "Nouns");
        const diac = info[0];
        const diacFreq = Number(info[1]);
        const canonicPattern = info[2];
        const canonicFreq = Number(info[3]);
        const lemma = N.wordFromRootAndPattern(sRoot, info[4]);
        const lemmaFreq = Number(info[5]);
        const lemmapattern = info[6];
        const lemmapatternFreq = Number(info[7]);
        const idpos = info[8] != null ? Number(info[8]) : 0;
        const feats = decodeNoun(lex, idpos);
        const posFreq = Number(feats.freq);
        const idcm = Number(info[9]);
        const cm: string = lex.casemood("Nouns", idcm).valAR;
        const voweled = vowelize(seg, diac);
        let voweledWord = voweled[0];
        if (feats.Number !== "مثنى" && voweledWord.endsWith("ءَانِ")) {
          voweledWord = voweledWord.replaceAll("ءَانِ", "آنِ");
        }
        voweledWord = voweledWord.replaceAll("لَلْلّ", "لَلّ").replaceAll("لِلْلّ", "لِلّ");
        const procDef =
          procClass === "N1" || procClass === "N2" || procClass === "N3" || procClass === "N5";
        let pDefinit = true;
        if (feats.Definit === "معرف بأل" && !procDef) {
          pDefinit = false;
        }
        if (
          procDef &&
          (feats.Definit === "مضاف إلى معرفة" ||
            feats.Definit === "مضاف إلى نكرة" ||
            feats.Definit === "غير مضاف")
        ) {
          pDefinit = false;
        }
        if (!pDefinit) continue;
        if (!Analyzer.validNominal(seg, cm, voweledWord, normalizedWord)) continue;
        const [solArr, possible] = Analyzer.nominalInterpret(
          seg,
          feats.Number,
          feats.Gender,
          feats.Definit,
          canonicPattern,
        );
        if (!possible) continue;
        const posStr = [feats.Main, feats.Type, feats.Number, feats.Gender, solArr[2]].join("|");
        const stemH = N.correctStemHamza(seg.stem);
        const freq = (diacFreq + canonicFreq + lemmaFreq + lemmapatternFreq + posFreq) / 5.0;
        const priority = fmtFreq(freq);
        let t = "";
        if ((procClass === "N4" || procClass === "N5") && cm === "منصوب" && voweledWord === normalizedWord) {
          t = "مجرور";
        }
        out.push(
          makeAnalysis(
            voweledWord,
            solArr[0],
            stemH,
            posStr,
            diac,
            canonicPattern,
            lemma,
            lemmapattern,
            sRoot,
            t !== "" ? t : cm,
            solArr[3],
            priority,
          ),
        );
      }
    }
    return out;
  }

  private static validNominal(
    seg: Segment,
    caseormood: string,
    voweledWord: string,
    normalizedWord: string,
  ): boolean {
    const pc = seg.proclitic.classe;
    const encUnv = seg.enclitic.unvoweledform;
    if (
      (voweledWord.includes("ً") || voweledWord.includes("ٍ") || voweledWord.includes("ٌ")) &&
      (encUnv !== "" || N.isDefinit(pc))
    ) {
      return false;
    }
    if ((pc === "N2" || pc === "C2" || pc === "C3") && caseormood === "مجرور") return false;
    if ((pc === "N4" || pc === "N5") && caseormood !== "مجرور" && voweledWord !== normalizedWord) {
      return false;
    }
    return !N.notCompatible(normalizedWord, voweledWord, seg, false);
  }

  private static nominalInterpret(
    seg: Segment,
    number: string,
    gender: string,
    definit: string,
    canonicPattern: string,
  ): [string[], boolean] {
    const unDiac = N.removeAllDiacritics(canonicPattern);
    const result: string[] = new Array(7).fill("");
    const procClass = seg.proclitic.classe;
    const prefix = "";
    let suffix = "";
    let passe = true;
    let possible = true;
    if (seg.proclitic.voweledform === "") {
      result[0] = "#";
      result[5] = "#";
    } else {
      result[0] = seg.proclitic.voweledform + ": " + (seg.proclitic.desc || "");
      result[5] = seg.proclitic.voweledform;
    }
    if (seg.enclitic.voweledform === "") {
      result[3] = "#";
      result[6] = "#";
    } else {
      result[3] = seg.enclitic.voweledform + ": " + (seg.enclitic.desc || "");
      result[6] = seg.enclitic.voweledform;
    }
    const st = seg.stem;
    if (gender === "مؤنث" && number === "مفرد" && st.endsWith("ة")) {
      suffix = "ة: تاء التأنيث";
      passe = true;
    } else if (gender === "مؤنث" && number === "مثنى") {
      if (st.endsWith("تان")) {
        suffix = "ة: تاء التأنيث + ان: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("تين")) {
        suffix = "ة: تاء التأنيث + ين: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("تا")) {
        suffix = "ة: تاء التأنيث + ا: علامة الإعراب";
        passe = false;
      } else if (st.endsWith("تي")) {
        suffix = "ة: تاء التأنيث + ي: علامة الإعراب";
        passe = false;
      }
    } else if (gender === "مؤنث" && number === "جمع") {
      if (st.endsWith("ات")) {
        suffix = "ات: تاء التأنيث";
        passe = true;
      }
    } else if (gender === "مذكر" && number === "مثنى") {
      if (st.endsWith("ان")) {
        suffix = "ان: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("ين")) {
        suffix = "ين: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("ا")) {
        suffix = "ا: علامة الإعراب";
        passe = false;
      } else if (st.endsWith("ي")) {
        suffix = "ي: علامة الإعراب";
        passe = false;
      }
    } else if (
      unDiac !== "مفاعل" &&
      canonicPattern !== "فَعَالِي" &&
      gender === "مذكر" &&
      number === "جمع"
    ) {
      if (st.endsWith("ون")) {
        suffix = "ون: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("ين")) {
        suffix = "ين: علامة الإعراب";
        passe = true;
      } else if (st.endsWith("و")) {
        suffix = "و: علامة الإعراب";
        passe = false;
      } else if (st.endsWith("ي")) {
        suffix = "ي: علامة الإعراب";
        passe = false;
      }
    }
    if (procClass === "N1" || procClass === "N2" || procClass === "N3" || procClass === "N5") {
      if (passe) {
        result[2] = "معرف";
      } else {
        result[2] = "";
        possible = false;
      }
    } else {
      result[2] = definit;
    }
    result[4] = "1";
    if (result[0] === "#" && prefix !== "") {
      result[0] = prefix;
    } else if (result[0] !== "#" && prefix !== "") {
      result[0] = result[0] + " + " + prefix;
    }
    if (result[3] === "#" && suffix !== "") {
      result[3] = suffix;
    } else if (result[3] !== "#" && suffix !== "") {
      result[3] = suffix + " + " + result[3];
    }
    return [result, possible];
  }
}
