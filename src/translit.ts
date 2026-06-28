/**
 * Buckwalter⇄Arabic transliteration.
 *
 * A faithful port of AlKhalil's `util/Transliteration` +
 * `util/ArabicCharacterUtil` character tables. Only needed to read the Layer-2
 * language model (`*.lm`), which stores tokens in Buckwalter while every other
 * table — and farahidi's whole internal representation — is Arabic script.
 *
 * Characters absent from the table pass through unchanged, exactly as the Java
 * `getArabicCharacter` / `getBuckWalterCharacter` `switch` statements fall
 * through to `return c`.
 */

// Buckwalter char -> Arabic char, transcribed verbatim from
// ArabicCharacterUtil.getArabicCharacter. The table is a bijection, so the
// Arabic -> Buckwalter direction is just its inverse.
const BW_TO_AR: Record<string, string> = {
  "'": "ء",
  "|": "آ",
  ">": "أ",
  "&": "ؤ",
  "<": "إ",
  "}": "ئ",
  A: "ا",
  b: "ب",
  p: "ة",
  t: "ت",
  v: "ث",
  j: "ج",
  H: "ح",
  x: "خ",
  d: "د",
  "*": "ذ",
  r: "ر",
  z: "ز",
  s: "س",
  $: "ش",
  S: "ص",
  D: "ض",
  T: "ط",
  Z: "ظ",
  E: "ع",
  g: "غ",
  _: "ـ",
  f: "ف",
  q: "ق",
  k: "ك",
  l: "ل",
  m: "م",
  n: "ن",
  h: "ه",
  w: "و",
  Y: "ى",
  y: "ي",
  F: "ً",
  N: "ٌ",
  K: "ٍ",
  a: "َ",
  u: "ُ",
  i: "ِ",
  "~": "ّ",
  o: "ْ",
  "`": "ٰ",
  "{": "ٱ",
  P: "پ",
  J: "چ",
  V: "ڤ",
  G: "گ",
  R: "ژ",
  ",": "،",
  ";": "؛",
  "?": "؟",
};

const AR_TO_BW: Record<string, string> = {};
for (const [bw, ar] of Object.entries(BW_TO_AR)) {
  AR_TO_BW[ar] = bw;
}

/** Port of `Transliteration.getBuckWalterToArabic`. */
export function bwToArabic(word: string): string {
  let out = "";
  for (const c of word) out += BW_TO_AR[c] ?? c;
  return out;
}

/** Port of `Transliteration.getArabicToBuckWalter`. */
export function arabicToBw(word: string): string {
  let out = "";
  for (const c of word) out += AR_TO_BW[c] ?? c;
  return out;
}
