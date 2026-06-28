/**
 * Decode a `PartOfSpeech` record's coded fields into Arabic labels.
 *
 * Each coded field (gender, number, voice, …) indexes a per-feature `VEntity`
 * list (`valAR`/`valEN`). The assembled `partofspeech` strings match the
 * pipe-joined order built in `VerbalAnalyzerImpl` / `NominalAnalyzerImpl`.
 */
import type { Lexicon } from "./lexicon.js";

export type DecodedPos = Record<string, string>;

// verb feature -> PartOfSpeech field name
const VERB_FEATURES: Array<[string, string]> = [
  ["Main", "main"],
  ["Type", "type"],
  ["Augmented", "augmented"],
  ["Emphasized", "emphasized"],
  ["NbRoot", "nbroot"],
  ["Person", "person"],
  ["Person2", "person2"],
  ["Transitivity", "transitivity"],
  ["Voice", "voice"],
];

const NOUN_FEATURES: Array<[string, string]> = [
  ["Main", "main"],
  ["Type", "type"],
  ["Definit", "definit"],
  ["Gender", "gender"],
  ["NbRoot", "nbroot"],
  ["Number", "number"],
];

function decode(lex: Lexicon, cat: string, pos: any, features: Array<[string, string]>): DecodedPos {
  const out: DecodedPos = {};
  for (const [feature, field] of features) {
    const code = pos[field];
    const ve = code != null ? lex.feature(cat, feature, Number(code)) : null;
    out[feature] = ve ? ve.valAR : "";
  }
  return out;
}

/** Return decoded verb features + freq + assembled `partofspeech` string. */
export function decodeVerb(lex: Lexicon, posId: number): DecodedPos {
  const pos = lex.pos("Verbs", posId);
  const d = decode(lex, "Verbs", pos, VERB_FEATURES);
  d.freq = pos.freq;
  // Order from VerbalAnalyzerImpl: main|type|emphasized|voice|nbroot|augmented|person|person2|transitivity
  d.partofspeech = [
    d.Main,
    d.Type,
    d.Emphasized,
    d.Voice,
    d.NbRoot,
    d.Augmented,
    d.Person,
    d.Person2,
    d.Transitivity,
  ].join("|");
  return d;
}

/**
 * Return decoded noun features + freq (the `partofspeech` string is assembled
 * by the nominal analyzer, since its last field depends on the computed
 * definiteness).
 */
export function decodeNoun(lex: Lexicon, posId: number): DecodedPos {
  const pos = lex.pos("Nouns", posId);
  const d = decode(lex, "Nouns", pos, NOUN_FEATURES);
  d.freq = pos.freq;
  return d;
}
