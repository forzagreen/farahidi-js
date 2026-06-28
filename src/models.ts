/**
 * Public output type: one morphological analysis of a word.
 *
 * Mirrors AlKhalil's `Result` (12 fields). Strings are in Arabic script.
 * `"-"` means "not applicable" (e.g. a tool word has no root); `"#"` marks an
 * absent clitic, as in the reference. `priority` is the out-of-context ranking
 * weight (higher = more frequent) formatted to 10 fixed decimals; use
 * {@link analyze}, which returns analyses already sorted by it (descending).
 */
export interface Analysis {
  voweledWord: string;
  proclitic: string;
  stem: string;
  partOfSpeech: string;
  diacPatternStem: string;
  patternStem: string;
  lemma: string;
  patternLemma: string;
  root: string;
  caseOrMood: string;
  enclitic: string;
  priority: string;
}

/**
 * One token's in-context (Layer-2) disambiguation result.
 *
 * Mirrors AlKhalil's `ADATAnalyzer` outputs: `lemma` is the single analysis
 * chosen by the HMM, `stem` / `root` are then the highest-corpus-frequency
 * stem/root among the analyses sharing that lemma (lemmatizer / light stemmer /
 * heavy stemmer respectively). `analyzed` is `false` for tokens the analyzer
 * could not analyze, in which case lemma/stem/root all fall back to `token`.
 * All strings are Arabic script.
 */
export interface TokenResult {
  token: string;
  lemma: string;
  stem: string;
  root: string;
  analyzed: boolean;
}
