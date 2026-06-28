/**
 * Layer-2 in-context disambiguation — port of `ADATAnalyzer`.
 *
 * Picks one analysis per token across a sentence with the HMM-ish decoder
 * AlKhalil actually ships (`ADATAnalyzer.analyzed` / `analyzedToken`), not the
 * unused `Spline_model2.getArgMaxI` path. The "tag" of the HMM is a lemma
 * (`ResultList.getAllLemmas` — dedup'd, in analysis order); the chosen lemma's
 * best stem/root is then a separate corpus-frequency arg-max (the light/heavy
 * stemmer outputs).
 *
 * Scores are additive (not log-probs): for each candidate `lemma2` of word i,
 * take over candidates `lemma1` of word i-1 the max of
 * `A(lemma1→lemma2) + d2 + [start]`, then add `B(word_i→lemma2)`.
 *
 * Faithful-port note — AlKhalil's `analyzed` resets its accumulator at the top
 * of every step before reading it, so for positions i ≥ 2 the `d2` term is
 * always the per-lemma backoff (`mapLemma` else 1e-5), never the previous path
 * score. We reproduce that exactly. Missing emission/transition entries also
 * back off to `mapLemma` / 1e-5. Ties keep the first (lowest-index) candidate,
 * matching Java's strict `>`.
 */
import { Analyzer } from "./analyzer.js";
import { LanguageModel } from "./lm.js";
import type { TokenResult } from "./models.js";
import * as N from "./normalize.js";

const BACKOFF = 1e-5; // unknown-lemma smoothing in analyzed() (Java literal 1.0E-5)
const TOKEN_RESB = 1e-6; // constant resB added in analyzedToken() (Java literal 1.0E-6)
const START_D = 0.5; // Java `D`
const START_MAXN_DEFAULT = 13336.0; // Java default maxN (= the .lm S0 total)

// A word = one Arabic letter then letters/diacritics, per
// ArabicStringUtil.getPatternCompile. Sentences break on AlKhalil's separators.
const WORD_RE = new RegExp("[" + N.ALL_ARABIC + "][" + N.ALL_ARABIC + N.ALL_DIACRITICS + "]*", "g");
const SENTENCE_SPLIT_RE = /[.!:،؟؛\n]/;

/**
 * Split `text` into sentences of corrected Arabic-word tokens.
 *
 * Mirrors `setTokenizationString`: kashida is stripped, words are matched by the
 * letter pattern and run through `correctErreur`; punctuation separators end a
 * sentence (the HMM decodes each sentence independently).
 */
export function tokenize(text: string): string[][] {
  text = text.replaceAll("ـ", "");
  const sentences: string[][] = [];
  for (const chunk of text.split(SENTENCE_SPLIT_RE)) {
    const tokens = (chunk.match(WORD_RE) ?? []).map((w) => N.correctErreur(w));
    if (tokens.length) sentences.push(tokens);
  }
  return sentences;
}

/**
 * In-context analyzer. Build once and reuse; the lexicon and the (large)
 * language model load lazily and are shared across calls.
 */
export class Disambiguator {
  private analyzer: Analyzer;
  private lm: LanguageModel;
  private morphCache: Map<string, [string[], boolean]>;

  constructor(analyzer?: Analyzer, lm?: LanguageModel) {
    this.analyzer = analyzer ?? new Analyzer();
    this.lm = lm ?? new LanguageModel();
    this.morphCache = new Map();
  }

  // ------------------------------------------------------------ morphology
  /**
   * `[lemmas, analyzed]` for `token` — dedup'd lemma list in analysis order,
   * mirroring `getAllLemmas`. Unanalyzable → `[[token], false]`.
   */
  private lemmas(token: string): [string[], boolean] {
    const cached = this.morphCache.get(token);
    if (cached !== undefined) return cached;
    const analyses = this.analyzer.processToken(token);
    let res: [string[], boolean];
    if (analyses.length === 0) {
      res = [[token], false];
    } else {
      const seen = new Set<string>();
      const lemmas: string[] = [];
      for (const a of analyses) {
        if (!seen.has(a.lemma)) {
          seen.add(a.lemma);
          lemmas.push(a.lemma);
        }
      }
      res = [lemmas, true];
    }
    this.morphCache.set(token, res);
    return res;
  }

  private backoff(lemma: string): number {
    return this.lm.mapLemma.get(lemma) ?? BACKOFF;
  }

  // ------------------------------------------------------------- start row
  /** Port of the `startMatrix` block shared by analyzed/analyzedToken. */
  private startMatrix(lemmas: string[]): Map<string, number> {
    const start = this.lm.start;
    let maxStart = 1.0;
    let maxN = START_MAXN_DEFAULT;
    let som = 0.0;
    const raw = new Map<string, number>();
    for (let idx = 0; idx < lemmas.length; idx++) {
      const tag = lemmas[idx];
      let x = 0.0;
      const entry = start.get(tag);
      if (entry !== undefined) {
        const [total, freq] = entry;
        maxN = total;
        x = freq / total;
        const s = freq - START_D;
        if (idx === 0 || maxStart < s) {
          maxStart = s;
        }
      }
      som = idx === 0 ? x : som + x;
      raw.set(tag, x);
    }
    const size = lemmas.length || 1;
    const denom = som + (maxStart / maxN) * size;
    const out = new Map<string, number>();
    for (const [tag, x] of raw) {
      out.set(tag, (maxStart / maxN + x) / denom);
    }
    return out;
  }

  // --------------------------------------------------------------- decode
  /** One chosen lemma per token (parallel to `tokens`). */
  disambiguateLemmas(tokens: string[]): string[] {
    if (tokens.length === 0) return [];
    const morph = new Map<string, string[]>();
    for (const t of tokens) morph.set(t, this.lemmas(t)[0]);
    if (tokens.length === 1) return this.analyzedToken(tokens[0], morph);
    return this.analyzed(tokens, morph);
  }

  private analyzed(tokens: string[], morph: Map<string, string[]>): string[] {
    const n = tokens.length;
    const startMatrix = this.startMatrix(morph.get(tokens[0])!);
    const emission = this.lm.emission;
    const transition = this.lm.transition;
    const backpointers = new Map<number, number[]>();
    let accum = new Map<string, number>(); // IMapResW1 after each step

    for (let i = 1; i < n; i++) {
      const word1 = tokens[i - 1];
      const word2 = tokens[i];
      const unv1 = N.removeAllDiacritics(word1);
      const unv2 = N.removeAllDiacritics(word2);
      const lem1 = morph.get(word1)!;
      const lem2 = morph.get(word2)!;
      const nextAccum = new Map<string, number>();
      const il: number[] = [];
      for (const tag2 of lem2) {
        let d1 = 0.0;
        let k = 0;
        for (let j = 0; j < lem1.length; j++) {
          const tag1 = lem1[j];
          const a = transition.get(tag1 + ":" + tag2);
          const resA = a !== undefined ? a : this.backoff(tag1);
          let val: number;
          if (i === 1) {
            const b = emission.get(unv1 + ":" + tag1);
            const d2 = b !== undefined ? b : this.backoff(tag1);
            val = resA + d2 + startMatrix.get(tag1)!;
          } else {
            val = resA + this.backoff(tag1);
          }
          if (j === 0 || val > d1) {
            d1 = val;
            k = j;
          }
        }
        const b2 = emission.get(unv2 + ":" + tag2);
        const resB = b2 !== undefined ? b2 : this.backoff(tag2);
        nextAccum.set(tag2, resB + d1);
        il.push(k);
      }
      accum = nextAccum;
      backpointers.set(i, il);
    }

    const last = morph.get(tokens[n - 1])!;
    let maxVal = 0.0;
    let imax = 0;
    for (let j = 0; j < last.length; j++) {
      const val = accum.get(last[j])!;
      if (j === 0 || val > maxVal) {
        maxVal = val;
        imax = j;
      }
    }
    const chosen = [last[imax]];
    for (let i = n - 1; i > 0; i--) {
      imax = backpointers.get(i)![imax];
      chosen.push(morph.get(tokens[i - 1])![imax]);
    }
    chosen.reverse();
    return chosen;
  }

  /**
   * Single-token path. Note: Java iterates a `HashMap` keyset here, so its
   * tie-break is order-dependent; we iterate analysis order instead, which is
   * deterministic but may differ from Java on exact ties.
   */
  private analyzedToken(token: string, morph: Map<string, string[]>): string[] {
    const lemmas = morph.get(token)!;
    const sm = this.startMatrix(lemmas);
    const b = this.lm.emission.get(token);
    const resB = b !== undefined ? b : TOKEN_RESB;
    let maxVal = 0.0;
    let maxTag = "";
    for (let idx = 0; idx < lemmas.length; idx++) {
      const tag = lemmas[idx];
      const val = sm.get(tag)! + resB;
      if (idx === 0 || maxVal < val) {
        maxVal = val;
        maxTag = tag;
      }
    }
    return [maxTag];
  }

  // --------------------------------------------------------- stem / root
  /**
   * Highest-corpus-frequency `attr` (`stem`/`root`) among analyses sharing
   * `lemma` — port of `getStems` / `getRoots` (list order, first-on-tie).
   * Unanalyzable token → the token itself.
   */
  private selectByFreq(
    token: string,
    lemma: string,
    analyzed: boolean,
    attr: "stem" | "root",
    freqMap: Map<string, number>,
  ): string {
    if (!analyzed) return token;
    let best: string | null = null;
    let bestVal = 0;
    for (const a of this.analyzer.processToken(token)) {
      if (a.lemma === lemma) {
        const value = a[attr];
        const val = freqMap.get(value) ?? 0;
        if (best === null || bestVal < val) {
          best = value;
          bestVal = val;
        }
      }
    }
    return best !== null ? best : token;
  }

  // --------------------------------------------------------------- public
  /** Full per-token result: chosen lemma + best stem + best root. */
  disambiguate(tokens: string[]): TokenResult[] {
    if (tokens.length === 0) return [];
    const lemmas = this.disambiguateLemmas(tokens);
    const out: TokenResult[] = [];
    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      const lemma = lemmas[idx];
      const analyzed = this.lemmas(token)[1];
      const stem = this.selectByFreq(token, lemma, analyzed, "stem", this.lm.mapStem);
      const root = this.selectByFreq(token, lemma, analyzed, "root", this.lm.mapRoot);
      out.push({
        token,
        lemma: analyzed ? lemma : token,
        stem,
        root,
        analyzed,
      });
    }
    return out;
  }

  /** Tokenize `text` and disambiguate each sentence; flat token order. */
  analyzeText(text: string): TokenResult[] {
    const out: TokenResult[] = [];
    for (const sentence of tokenize(text)) {
      out.push(...this.disambiguate(sentence));
    }
    return out;
  }
}
