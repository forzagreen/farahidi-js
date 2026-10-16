/**
 * Build the public morphological model from the port's raw records.
 *
 * The AlKhalil port (`analyzer.ts`) produces one record per *(morphological
 * reading × إعراب ending)* — the Java `Result` layout, where `عندليب` comes out
 * five times differing only in the case vowel. This module holds the pieces that
 * turn those records into {@link Analysis} objects: decoding the lexicon's
 * part-of-speech labels and collapsing the records over their inflections.
 */
import type { RawAnalysis } from "./analyzer.js";
import type { Analysis, Inflection } from "./models.js";

// Label sets used to decode the tool-word / proper-noun POS strings, whose
// pipe-separated slots are positional but irregular ("اسم|إشارة|مؤنث|جمع",
// "اسم|ضمير|الغائب", "فعل|ماض|جامد", "اسم|فعل|ماض" …).
const TENSES = new Set(["ماض", "مضارع", "أمر"]);
const GENDERS = new Set(["مذكر", "مؤنث", "مذكر أو مؤنث"]);
const NUMBERS = new Set(["مفرد", "مثنى", "جمع"]);
// Tool-word pronouns spell the person with the article; align with the verb labels.
const PERSONS: Record<string, string> = { الغائب: "غائب", المتكلم: "متكلم", المخاطب: "مخاطب" };
// Single-slot labels that are not a bare part of speech.
const SINGLE_SLOT: Record<string, [string, string]> = {
  "اسم الجلالة": ["اسم", "اسم الجلالة"],
  "جار ومجرور": ["حرف", "جار ومجرور"],
};

/** The feature slots a POS label decodes into (missing → `null`). */
export interface PosFeatures {
  pos: string;
  type: string | null;
  tense: string | null;
  gender: string | null;
  number: string | null;
  person: string | null;
}

/** Decode a tool-word style POS label into {@link PosFeatures}. */
export function parsePosLabel(label: string): PosFeatures {
  const slots = label.split("|");
  const out: PosFeatures = {
    pos: slots[0],
    type: null,
    tense: null,
    gender: null,
    number: null,
    person: null,
  };
  if (slots.length === 1 && slots[0] in SINGLE_SLOT) {
    [out.pos, out.type] = SINGLE_SLOT[slots[0]];
  }
  for (const slot of slots.slice(1)) {
    if (!slot || slot === "-") continue;
    if (TENSES.has(slot) && out.tense === null) out.tense = slot;
    else if (GENDERS.has(slot) && out.gender === null) out.gender = slot;
    else if (NUMBERS.has(slot) && out.number === null) out.number = slot;
    else if (slot in PERSONS && out.person === null) out.person = PERSONS[slot];
    else if (out.type === null) out.type = slot;
  }
  return out;
}

/** Stable identity of a morphological reading (every field but score/inflections). */
function morphKey(m: Analysis): string {
  const affixes = (xs: Analysis["proclitics"]) =>
    xs.map((a) => `${a.form}\u0001${a.description ?? ""}`).join("\u0002");
  return [
    m.diacritized,
    m.lemma,
    m.root ?? "",
    m.stem,
    m.pattern ?? "",
    m.lemmaPattern ?? "",
    m.pos,
    m.type ?? "",
    m.tense ?? "",
    m.gender ?? "",
    m.number ?? "",
    m.person ?? "",
    m.pronoun ?? "",
    m.voice ?? "",
    m.transitivity ?? "",
    m.augmentation ?? "",
    m.emphatic === null ? "" : String(m.emphatic),
    affixes(m.proclitics),
    affixes(m.prefixes),
    affixes(m.suffixes),
    affixes(m.enclitics),
  ].join("\u0003");
}

/**
 * Group raw records by morphological reading and nest their inflections.
 *
 * Records sharing the same reading (everything except the إعراب ending, the
 * definiteness state and the score) become one {@link Analysis} whose
 * `inflections` are the distinct realizations, best first, and whose `score` is
 * the best inflection's. The result is sorted by `score` descending; ties keep
 * the analyzer's pipeline order.
 */
export function collapse(raws: Iterable<RawAnalysis>): Analysis[] {
  const groups = new Map<string, { morph: Analysis; inflections: Map<string, Inflection> }>();
  for (const raw of raws) {
    const key = morphKey(raw.morph);
    let group = groups.get(key);
    if (!group) {
      group = { morph: raw.morph, inflections: new Map() };
      groups.set(key, group);
    }
    const infl = raw.inflection;
    const ikey = [infl.diacritized, infl.case ?? "", infl.mood ?? "", infl.state ?? ""].join(
      "\u0001",
    );
    const prev = group.inflections.get(ikey);
    if (prev === undefined || prev.score < infl.score) group.inflections.set(ikey, infl);
  }
  const out: Analysis[] = [];
  for (const { morph, inflections } of groups.values()) {
    // Array.prototype.sort is stable (ES2019): ties keep insertion order.
    const sorted = [...inflections.values()].sort((a, b) => b.score - a.score);
    out.push({ ...morph, score: sorted[0].score, inflections: sorted });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
