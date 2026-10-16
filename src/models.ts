/**
 * Public result types.
 *
 * Layer 1 ({@link analyze}) returns {@link Analysis} objects — one per
 * *morphological* reading of the word. Everything that depends on the word's
 * syntactic role in a sentence (the إعراب: case for nouns, mood for verbs, and
 * the definiteness *state*) is kept apart in {@link Inflection} objects nested
 * under `Analysis.inflections`, so a word like `عندليب` yields a single analysis
 * with five inflections instead of five near-identical analyses.
 *
 * Layer 2 ({@link analyzeText}) returns one {@link TokenResult} per token.
 *
 * Conventions: all linguistic labels are Arabic strings exactly as found in the
 * AlKhalil lexicon; `null` means "not applicable" (a particle has no root, a noun
 * has no mood …); affix arrays are empty when the word has none.
 */

/**
 * A segmented piece of the word that is not part of the stem.
 *
 * `form` is the diacritized surface string; `description` is the lexicon's label
 * for its function (e.g. `حرف الجر`, `ضمير الغائبين`). A clitic that bundles
 * several functions keeps the lexicon's compound label (`حرف العطف+حرف الجر`).
 * `description` is `null` when the lexicon has no label (only for the handful of
 * fixed expressions built on `الله`).
 */
export interface Affix {
  form: string;
  description: string | null;
}

/**
 * One syntactic realization (إعراب) of an {@link Analysis}.
 *
 * `diacritized` is the fully vowelled surface form *including* the case/mood
 * ending. `case` (nouns: مرفوع / منصوب / مجرور) or `mood` (verbs: مرفوع / منصوب /
 * مجزوم) names that ending; both are `null` for indeclinable words (مبني:
 * particles, past and imperative verbs, …), which then have exactly one
 * inflection. `state` is the noun's definiteness state (نكرة / معرف بأل / مضاف …)
 * that AlKhalil infers together with the ending. `score` is this realization's
 * own out-of-context weight.
 */
export interface Inflection {
  diacritized: string;
  case: string | null;
  mood: string | null;
  state: string | null;
  score: number;
}

/**
 * One morphological analysis (تحليل صرفي) of a word.
 *
 * - `diacritized` — the word with its diacritics, *without* the inflectional
 *   ending on the last letter (`عَنْدَلِيب`, `بِالْمَدْرَسَة`, `يَكْتُب`). The fully
 *   vowelled variants live in `inflections`.
 * - `lemma`, `root`, `stem` — dictionary form, the 3- or 4-letter root (`null`
 *   for particles and most proper nouns) and the clitic-free stem.
 * - `pattern`, `lemmaPattern` — the canonical patterns (وزن) of the stem and of
 *   the lemma; `null` for words that have no pattern (particles, proper nouns).
 * - `pos`, `type` — main part of speech (`اسم` / `فعل` / `حرف`) and its sub-type:
 *   the derivational type of a noun (`اسم فاعل`, `مصدر أصلي` …), the function of
 *   a particle (`جر`, `عطف` …), `اسم علم` for proper nouns.
 * - `tense`, `voice`, `person`, `pronoun`, `transitivity`, `augmentation`,
 *   `emphatic` — verb features: ماض / مضارع / أمر, معلوم / مجهول, متكلم / مخاطب /
 *   غائب, the subject pronoun (`هو`, `أنتَ`, `نحن` …), لازم / متعد, مجرد / مزيد and
 *   whether a نون التوكيد is attached. `tense` and `person` are also set for the
 *   few tool words that carry them.
 * - `gender`, `number` — noun features: مذكر / مؤنث and مفرد / مثنى / جمع.
 * - `proclitics`, `prefixes`, `suffixes`, `enclitics` — segmentation around the
 *   stem, outermost first: clitics (`وَ`, `بِ`, `ال` … / attached pronouns) and
 *   inflectional affixes (the مضارع prefix, subject suffixes, `ة`, `ات`, `ان` …).
 * - `score` — out-of-context ranking weight, higher = more frequent (the best of
 *   the inflections' scores). {@link analyze} sorts by it.
 * - `inflections` — the syntactic realizations of this reading, best first.
 */
export interface Analysis {
  diacritized: string;
  lemma: string;
  root: string | null;
  stem: string;
  pattern: string | null;
  lemmaPattern: string | null;
  pos: string;
  type: string | null;
  tense: string | null;
  gender: string | null;
  number: string | null;
  person: string | null;
  pronoun: string | null;
  voice: string | null;
  transitivity: string | null;
  augmentation: string | null;
  emphatic: boolean | null;
  proclitics: Affix[];
  prefixes: Affix[];
  suffixes: Affix[];
  enclitics: Affix[];
  score: number;
  inflections: Inflection[];
}

/**
 * One token's in-context (Layer-2) disambiguation result.
 *
 * Mirrors AlKhalil's `ADATAnalyzer` outputs: `lemma` is the single analysis
 * chosen by the HMM, `stem` / `root` are then the highest-corpus-frequency
 * stem/root among the analyses sharing that lemma (lemmatizer / light stemmer /
 * heavy stemmer respectively). `root` is `null` when the chosen reading has no
 * root (particles). `analyzed` is `false` for tokens the analyzer could not
 * analyze, in which case `lemma` and `stem` fall back to `token` and `root` is
 * `null`. All strings are Arabic script.
 */
export interface TokenResult {
  token: string;
  lemma: string;
  stem: string;
  root: string | null;
  analyzed: boolean;
}
