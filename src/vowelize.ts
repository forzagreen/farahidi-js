/**
 * `ArabicStringUtil.Vowelize` — reconstruct the fully voweled surface word from
 * a stem + diacritic pattern + clitics. Mutates the segment's enclitic
 * `voweledform` in context (هـ → هُ/هِ etc.), as in the Java reference.
 */
import type { Segment } from "./clitics.js";
import {
  addDiacBeforeString,
  correctHamza,
  getDiacritizationStem,
  isDefinit,
  isDiacritic,
  isSolar,
} from "./normalize.js";

const V4_END_RE = /[ًٌٍَُِْ]$/;

export function vowelize(segment: Segment, pattern: string): [string, string] {
  const procClass = segment.proclitic.classe;
  const enc = segment.enclitic;
  const stem = segment.stem;

  if (enc.classe === "V4") {
    pattern = pattern.replace(V4_END_RE, "ُ");
  }

  let result = getDiacritizationStem(pattern, stem);
  result =
    result[0] + (isDefinit(procClass) && isSolar(stem[0]) ? "ّ" : "") + result.slice(1);
  const soukoun = isDefinit(procClass) && !isSolar(stem[0]) ? "ْ" : "";

  if (enc.voweledform !== "") {
    result = result.replaceAll("ة", "ت");
  }
  if ((result.endsWith("ُوا") || result.endsWith("وْا")) && enc.unvoweledform !== "") {
    result = result.slice(0, -1);
  }

  const endsI = result.endsWith("ي") || result.endsWith("يْ") || result.endsWith("ِ");
  if (enc.unvoweledform === "ه") enc.voweledform = endsI ? "هِ" : "هُ";
  if (enc.unvoweledform === "هما") enc.voweledform = endsI ? "هِمَا" : "هُمَا";
  if (enc.unvoweledform === "هم") enc.voweledform = endsI ? "هِمْ" : "هُمْ";
  if (enc.unvoweledform === "هن") enc.voweledform = endsI ? "هِنَّ" : "هُنَّ";

  const last = result[result.length - 1];
  if ((last === "ُ" || last === "َ") && enc.unvoweledform === "ي") {
    result = result.slice(0, -1) + "ِ";
  }

  const encVoweled = enc.voweledform;
  let res: string;
  if (encVoweled.length > 0) {
    result = result.replaceAll("ى", "ا");
    if (
      (!result.endsWith("يْ") || enc.classe !== "N1") &&
      (result.endsWith("ْ") || encVoweled.length === 1 || !isDiacritic(encVoweled[1]))
    ) {
      res = addDiacBeforeString(encVoweled, result);
    } else {
      res = result + encVoweled;
    }
  } else {
    res = result;
  }

  if (res !== "") {
    res = correctHamza(res);
  }

  const head =
    segment.proclitic.unvoweledform === "أ" && res.length > 3 && res[0] === "ا" && res[2] === "ْ"
      ? res.slice(1)
      : res;
  let resultat0 = segment.proclitic.voweledform + soukoun + head;
  if (resultat0.endsWith("يْي") && enc.classe === "N1") {
    // Replacement is ya + shadda + fatha (U+064A U+0651 U+064E), matching the
    // exact combining-mark order AlKhalil emits (not the NFC fatha+shadda order).
    resultat0 = resultat0.replace(/يْي$/, "يَّ");
  }
  return [resultat0, result];
}
