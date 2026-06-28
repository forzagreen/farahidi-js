/**
 * farahidi — Arabic morphological analyzer (a pure-JS/TypeScript port of
 * AlKhalil Morpho Sys 2).
 *
 * Quick start:
 * ```ts
 * import { analyze } from "farahidi";
 *
 * for (const a of analyze("لأنهم")) {
 *   console.log(a.voweledWord, a.lemma, a.root, a.partOfSpeech);
 * }
 * ```
 *
 * {@link analyze} returns a list of {@link Analysis} candidates sorted by
 * `priority` (most frequent first). For repeated use, build an {@link Analyzer}
 * once and reuse it — the bundled lexicon loads lazily and is shared across
 * calls.
 */
import { Analyzer } from "./analyzer.js";
import type { Analysis } from "./models.js";

export { Analyzer } from "./analyzer.js";
export type { Analysis } from "./models.js";
export const version = "0.2.0";

let defaultAnalyzer: Analyzer | undefined;

function getDefaultAnalyzer(): Analyzer {
  if (!defaultAnalyzer) defaultAnalyzer = new Analyzer();
  return defaultAnalyzer;
}

/**
 * Return all analyses of `word`, sorted by `priority` (descending).
 * Uses a shared module-level {@link Analyzer}.
 */
export function analyze(word: string): Analysis[] {
  return getDefaultAnalyzer().analyze(word);
}
