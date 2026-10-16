/**
 * farahidi — Arabic morphological analyzer (a pure-JS/TypeScript port of
 * AlKhalil Morpho Sys 2).
 *
 * Quick start:
 * ```ts
 * import { analyze } from "farahidi";
 *
 * for (const a of analyze("بالمدرسة")) {
 *   console.log(a.diacritized, a.lemma, a.root, a.pos, a.type);
 * }
 * ```
 *
 * {@link analyze} returns the word's *morphological* readings as
 * {@link Analysis} objects, best `score` first. The syntactic case/mood endings
 * (الإعراب) of each reading are nested under `Analysis.inflections` rather than
 * multiplying the results. For repeated use, build an {@link Analyzer} once and
 * reuse it — the bundled lexicon loads lazily and is shared across calls.
 */
import { Analyzer } from "./analyzer.js";
import { Disambiguator } from "./disambiguate.js";
import type { Analysis, TokenResult } from "./models.js";

export { Analyzer } from "./analyzer.js";
export { Disambiguator, tokenize } from "./disambiguate.js";
export type { Affix, Analysis, Inflection, TokenResult } from "./models.js";
// Advanced: inject pre-decompressed table text on hosts without `node:fs`
// (e.g. browsers). See the demo for a fetch + DecompressionStream bootstrap.
export { provideRawText, hasRawText, layer1DataFiles, layer2DataFiles } from "./lexicon.js";
export const version = "0.3.0";

let defaultAnalyzer: Analyzer | undefined;
let defaultDisambiguator: Disambiguator | undefined;

function getDefaultAnalyzer(): Analyzer {
  if (!defaultAnalyzer) defaultAnalyzer = new Analyzer();
  return defaultAnalyzer;
}

function getDefaultDisambiguator(): Disambiguator {
  if (!defaultDisambiguator) defaultDisambiguator = new Disambiguator(getDefaultAnalyzer());
  return defaultDisambiguator;
}

/**
 * Return all morphological analyses of `word`, sorted by `score` (descending).
 * Uses a shared module-level {@link Analyzer}.
 */
export function analyze(word: string): Analysis[] {
  return getDefaultAnalyzer().analyze(word);
}

/**
 * In-context analysis: one chosen lemma/stem/root per word token across the
 * sentence(s) in `text`. Uses a shared module-level {@link Disambiguator}.
 */
export function analyzeText(text: string): TokenResult[] {
  return getDefaultDisambiguator().analyzeText(text);
}
