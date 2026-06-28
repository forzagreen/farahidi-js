/**
 * Arabic string utilities — a faithful port of AlKhalil's text layer.
 *
 * Ports `util/ArabicString`, `util/ArabicStringUtil`, `util/Validator` and
 * `util/CreatHamza`. These pure string operations must match AlKhalil exactly,
 * because lexicon keys are produced by the same normalization — any divergence
 * silently drops analyses. Arabic letters and diacritics are all in the BMP, so
 * JS UTF-16 `charAt`/index math matches Java `char` / Python `str` one-to-one.
 *
 * NOTE: Python `str.replace` replaces all occurrences, so it is ported to
 * `String.prototype.replaceAll`. Python `re.sub` (global) is ported to
 * `.replace(/.../g, ...)`.
 */

// --- ArabicString constants ----------------------------------------------
export const ALL_ARABIC = "ٱءآأإؤئابةتثجحخدذرزسشصضطظعغفقكلمنهويى";
export const ALL_DIACRITICS = "ًٌٍَُِّْ";
export const DIACRITICS_EXCEPT_SHADDA = "ًٌٍَُِْ";

const ALL_DIACRITICS_RE = /[ًٌٍَُِّْ]/g;
const LAST_DIAC_RE = /[ًٌٍَُِْ]$/;
const ALL_HAMZA_RE = /[أإؤئ]/;
const ALL_HAMZA_RE_G = /[أإؤئ]/g;
const HAMZA_TO_BARE_G = /[ؤأإئ]/g;

const DIACRITICS_SET = new Set(ALL_DIACRITICS);
const HAMZA_SET = new Set("ءأإؤئ");
const SOLAR = new Set("تثدذرزسشصضطظلن");
const DEFINIT_CLASSES = new Set(["N1", "N2", "N3", "N5"]);

// --- Validator predicates -------------------------------------------------
export function isDiacritic(c: string): boolean {
  return DIACRITICS_SET.has(c);
}

export function isHamza(c: string): boolean {
  return HAMZA_SET.has(c);
}

export function isSolar(c: string): boolean {
  return SOLAR.has(c);
}

export function isDefinit(procClass: string): boolean {
  return DEFINIT_CLASSES.has(procClass);
}

export function isNumeric(c: string): boolean {
  return c >= "0" && c <= "9";
}

// --- ArabicStringUtil -----------------------------------------------------
/** `getIsHamza` — fold a hamza-carrier to bare hamza `ء`. */
export function getIsHamza(c: string): string {
  return "أؤإئ".includes(c) ? "ء" : c;
}

export function removeAllDiacritics(word: string): string {
  return word.replace(ALL_DIACRITICS_RE, "");
}

export function removeLastDiacritics(word: string): string {
  return word.replace(LAST_DIAC_RE, "");
}

export function replaceAllHamza(word: string): string {
  return word.replace(ALL_HAMZA_RE_G, "");
}

/** `getNormalizeHamza` — map every hamza-carrier to bare `ء`. */
export function normalizeHamza(word: string): string {
  return word.replace(HAMZA_TO_BARE_G, "ء");
}

export function wordContainsHamza(word: string): boolean {
  return ALL_HAMZA_RE.test(word);
}

/** `getTypeHamzaFromWord` — first hamza-carrier in the word, or "". */
export function typeHamza(word: string): string {
  if (wordContainsHamza(word)) {
    for (const c of word) {
      if ("أؤإئ".includes(c)) return c;
    }
  }
  return "";
}

/** `correctErreur` — normalization applied to the input before analysis. */
export function correctErreur(word: string): string {
  if (word.length >= 3 && word[1] === "ّ") {
    word = word[0] + word.slice(2);
  }
  word = word.replaceAll("ٱ", "ا");
  word = word.replaceAll("اُ", "ا");
  word = word.replaceAll("اَّ", "َّا");
  word = word.replace(/ىً$/, "ًى");
  word = word.replace(/اً$/, "ًا");
  word = word.replaceAll("اَ", "ا");
  word = word.replaceAll("اِ", "ا");
  word = word.replaceAll("ِا", "ا");
  word = word.replaceAll("آَ", "آ");
  return word;
}

export function getDiacritizationStem(pattern: string, stem: string): string {
  let result = "";
  let j = 0;
  for (const ch of pattern) {
    if (isDiacritic(ch)) {
      result += ch;
    } else {
      result += stem[j];
      j += 1;
    }
  }
  return result;
}

export function addDiacBeforeString(encVoweled: string, result: string): string {
  const head = encVoweled[0];
  if (head === "و") return result.slice(0, -1) + "ُ" + encVoweled;
  if (head === "ي") return result.slice(0, -1) + "ِ" + encVoweled;
  if (head === "ا") return result.slice(0, -1) + "َ" + encVoweled;
  return result + encVoweled;
}

/** `getWordFromRootAndPattern` — fill ف/ع/ل slots of a pattern with root radicals. */
export function wordFromRootAndPattern(root: string, diacLemma: string): string {
  let out = "";
  let passe = false;
  let passe2 = false;
  for (const ch of diacLemma) {
    if (ch === "ف") {
      out += root[0];
    } else if (ch === "ع") {
      out += root[1];
    } else if (ch === "ل") {
      if (!passe) {
        out += root[2];
      } else if (!passe2) {
        out += root[3];
        if (root.length > 4) {
          passe2 = true;
        }
      } else {
        out += root[4];
      }
      if (root.length !== 3) {
        passe = true;
      }
    } else {
      out += ch;
    }
  }
  return correctHamza(out);
}

/** `Validator.isDiacPattern` — does the unvoweled pattern fit the stem? */
export function isDiacPattern(stem: string, diac: string): boolean {
  let i = 0;
  while (i < diac.length && i < stem.length) {
    const d = diac[i];
    if (d !== "ف" && d !== "ع" && d !== "ل" && d !== stem[i]) {
      return false;
    }
    i += 1;
  }
  return true;
}

export interface CompatSegment {
  enclitic: { unvoweledform: string };
}

/**
 * `Validator.notCompatible` — true if the voweled form is inconsistent with the
 * input's own (partial) diacritics. The 2-arg form (segment=null) matches the
 * toolword overload; the 4-arg form folds hamza carriers.
 */
export function notCompatible(
  normalizedWord: string,
  voweledWord: string,
  segment: CompatSegment | null = null,
  isTool = false,
): boolean {
  const useHamza = segment !== null || isTool;
  let nor = normalizedWord;
  let vow = voweledWord;
  if (segment !== null || isTool) {
    const encUnv = segment === null ? "" : segment.enclitic.unvoweledform;
    if (
      (encUnv !== "" || isTool || nor[nor.length - 1] === "ِ") &&
      vow[vow.length - 1] === "ْ" &&
      isDiacritic(nor[nor.length - 1])
    ) {
      nor = nor.slice(0, -1);
      vow = vow.slice(0, -1);
    }
  }
  const unor = removeAllDiacritics(nor);
  const uvow = removeAllDiacritics(vow);
  if (vow.endsWith("َا") && nor.endsWith("اً")) return true;
  if (unor.length !== uvow.length) return true;
  let inI = 0;
  let iv = 0;
  while (inI < nor.length && iv < vow.length) {
    const nc = nor[inI];
    const vc = vow[iv];
    let same = nc === vc || (nc === "ا" && vc === "ى");
    if (useHamza && !same) {
      same = getIsHamza(nc) === getIsHamza(vc);
    }
    if (same) {
      inI += 1;
      iv += 1;
      continue;
    }
    if (!isDiacritic(nc) && !isDiacritic(vc)) return true;
    if (!isDiacritic(nc) && isDiacritic(vc)) {
      iv += 1;
      continue;
    }
    if (isDiacritic(nc)) return true;
  }
  return false;
}

// --- CreatHamza -----------------------------------------------------------
function isNoRelatif(c: string): boolean {
  return c !== "د" && c !== "ذ" && c !== "ر" && c !== "ز" && c !== "و";
}

function startHamza(word: string): string {
  let first: string;
  if (word.length > 1 && word[0] === "ء") {
    first = word[1] === "ِ" ? "إ" : "أ";
  } else {
    first = word[0];
  }
  let wordF = first + word.slice(1);
  if (wordF.startsWith("أَا")) {
    wordF = "آ" + wordF.slice(3);
  }
  return wordF;
}

function endHamza(word: string, pos: number): string {
  if (pos > 1 && word[pos - 1] === "ِ") return "ئ";
  if (pos > 1 && word[pos - 1] === "َ") return "أ";
  if (pos > 3 && word[pos - 1] === "ُ" && word[pos - 2] === "ّ" && word[pos - 3] === "و") return "ء";
  if (pos > 1 && word[pos - 1] === "ُ") return "ؤ";
  return "ء";
}

function isNibraHamza(word: string, pos: number, length: number): boolean {
  if (pos > 0 && word[pos - 1] === "ِ") return true;
  if ((pos > 0 && word[pos - 1] === "ي") || (pos > 1 && word[pos - 1] === "ْ" && word[pos - 2] === "ي")) {
    return true;
  }
  if (
    pos > 1 &&
    word[pos - 1] === "ْ" &&
    isNoRelatif(word[pos - 2]) &&
    pos + 2 < length &&
    (word[pos + 1] === "َ" || word[pos + 1] === "ً") &&
    word[pos + 2] === "ا"
  ) {
    return true;
  }
  if (
    pos > 0 &&
    (word[pos - 1] === "ا" || word[pos - 1] === "ي" || word[pos - 1] === "و") &&
    ((pos + 1 < length && word[pos + 1] === "ِ") ||
      (pos + 2 < length && word[pos + 2] === "ِ" && word[pos + 1] === "ّ"))
  ) {
    return true;
  }
  return (
    pos > 0 &&
    (word[pos - 1] === "ْ" || word[pos - 1] === "َ" || word[pos - 1] === "ُ") &&
    ((pos + 1 < length && word[pos + 1] === "ِ") ||
      (pos + 2 < length && word[pos + 2] === "ِ" && word[pos + 1] === "ّ"))
  );
}

function isWawHamza(word: string, pos: number, length: number): boolean {
  if (pos > 0 && (word[pos - 1] === "ا" || word[pos - 1] === "ْ") && word[pos - 1] !== "ي" && word[pos - 1] !== "و") {
    if (pos + 1 < length && word[pos + 1] === "ُ") {
      return pos + 2 < length;
    }
    if (pos + 2 < length && word[pos + 2] === "ُ" && word[pos + 1] === "ّ") {
      return pos + 3 < length ? word[pos + 3] !== "و" : false;
    }
  }
  if (
    pos > 0 &&
    word[pos - 1] === "َ" &&
    ((pos + 1 < length && word[pos + 1] === "ُ") ||
      (pos + 2 < length && word[pos + 2] === "ُ" && word[pos + 1] === "ّ"))
  ) {
    return true;
  }
  if (
    pos > 0 &&
    word[pos - 1] === "ُ" &&
    ((pos + 1 < length && word[pos + 1] !== "ِ") ||
      (pos + 2 < length && word[pos + 2] !== "ِ" && word[pos + 1] === "ّ"))
  ) {
    return pos <= 2 || word[pos - 2] !== "ّ" || word[pos - 3] !== "و";
  }
  return false;
}

function isAlifHamza(word: string, pos: number, length: number): boolean {
  if (
    pos > 0 &&
    word[pos - 1] === "َ" &&
    ((pos + 1 < length && word[pos + 1] === "ْ") ||
      (pos + 1 < length && word[pos + 1] === "َ") ||
      (pos + 2 < length && word[pos + 2] === "َ" && word[pos + 1] === "ّ"))
  ) {
    return true;
  }
  if (pos > 1 && word[pos - 1] === "ْ" && word[pos - 2] === "و" && pos + 1 < length && word[pos + 1] === "َ") {
    return false;
  }
  if (pos > 0 && word[pos - 1] === "ْ") {
    if (pos + 2 < length && word[pos + 1] === "ً" && word[pos + 2] === "ا") {
      return false;
    }
    if (
      pos + 4 < length &&
      word[pos + 1] === "َ" &&
      word[pos + 2] === "ا" &&
      word[pos + 3] === "ن" &&
      word[pos + 4] === "ِ"
    ) {
      return false;
    }
    if (
      (pos + 1 < length && word[pos + 1] === "َ") ||
      (pos + 2 < length && word[pos + 1] === "ّ" && word[pos + 2] === "َ")
    ) {
      return true;
    }
  }
  return false;
}

/** `CreatHamza.correctHamza` — re-attach hamza to its correct carrier. */
export function correctHamza(word: string): string {
  word = word.replace(HAMZA_TO_BARE_G, "ء");
  word = startHamza(word);
  const wrdD = removeAllDiacritics(word);
  let length = word.length;
  if (word.startsWith("اءْ")) {
    word = "ائْ" + word.slice(3);
    length = word.length;
  }
  let out = "";
  let ip = 0;
  let i = 0;
  while (i < length) {
    const c = word[i];
    if (c === "ء") {
      if (ip + 1 === wrdD.length) {
        out += endHamza(word, i);
      } else if (isNibraHamza(word, i, length)) {
        out += "ئ";
      } else if (isWawHamza(word, i, length)) {
        out += "ؤ";
      } else if (isAlifHamza(word, i, length)) {
        if (i + 2 < length && word[i + 1] === "َ" && word[i + 2] === "ا") {
          out += "آ";
          i += 2;
        } else if (i + 3 < length && word[i + 1] === "ّ" && word[i + 2] === "َ" && word[i + 3] === "ا") {
          out += "آَّ";
          i += 3;
        } else if (i + 3 < length && word[i + 1] === "َ" && word[i + 2] === "ء" && word[i + 3] === "ْ") {
          out += "آ";
          i += 3;
        } else {
          out += "أ";
        }
      } else {
        out += c;
      }
    } else {
      out += c;
    }
    if (!isDiacritic(word[i])) {
      ip += 1;
    }
    i += 1;
  }
  return out;
}

/** `CreatHamza.correctStemHamza`. */
export function correctStemHamza(s: string): string {
  const length = s.length;
  let out = "";
  let i = 0;
  while (i < length) {
    const c = s[i];
    if (c === "ء" || c === "أ") {
      if (i + 1 < length && s[i + 1] === "ا") {
        if (i - 1 >= 0 && s[i - 1] === "ا") {
          out += c;
        } else {
          out += "آ";
          i += 1;
        }
      } else {
        out += c;
      }
    } else {
      out += c;
    }
    i += 1;
  }
  return out;
}
