/**
 * Clitic segmentation — port of `ProcliticImpl`/`EncliticImpl`/`Stemming`.
 *
 * Enumerates every `proclitic + stem + enclitic` split of the unvoweled word,
 * gated by clitic compatibility classes. The proclitic/enclitic lists are built
 * in ascending-length order and share a single `valid` short-circuit flag
 * exactly as in `Stemming.getListsSegment` — this ordering quirk affects which
 * segments are produced, so it is reproduced faithfully.
 */
import type { Lexicon } from "./lexicon.js";
import { isDefinit } from "./normalize.js";

const MAX_PROCLITIC = 5;
const MAX_ENCLITIC = 5;

/**
 * A proclitic or enclitic. Mutable: `voweledform` is recomputed in context by
 * the analyzers (e.g. هـ → هُ/هِ), matching the Java DTO.
 */
export class Clitic {
  unvoweledform: string;
  voweledform: string;
  desc: string;
  classe: string;

  constructor(unvoweledform: string, voweledform: string, desc: string, classe: string) {
    this.unvoweledform = unvoweledform;
    this.voweledform = voweledform;
    this.desc = desc;
    this.classe = classe;
  }

  static fromDict(d: any): Clitic {
    return new Clitic(d.unvoweledform, d.voweledform, d.desc || "", d.classe);
  }
}

export class Segment {
  proclitic: Clitic;
  stem: string;
  enclitic: Clitic;

  constructor(proclitic: Clitic, stem: string, enclitic: Clitic) {
    this.proclitic = proclitic;
    this.stem = stem;
    this.enclitic = enclitic;
  }
}

function proclitics(lex: Lexicon, token: string): Clitic[] {
  const out: Clitic[] = [];
  const size = token.length;
  let ip = 0;
  while (ip < size && ip <= MAX_PROCLITIC) {
    for (const d of lex.proclitics(token.slice(0, ip))) {
      out.push(Clitic.fromDict(d));
    }
    ip += 1;
  }
  return out;
}

function enclitics(lex: Lexicon, token: string): Clitic[] {
  const out: Clitic[] = [];
  const size = token.length;
  let ip = 0;
  while (ip < size && ip <= MAX_ENCLITIC) {
    for (const d of lex.enclitics(token.slice(size - ip, size))) {
      out.push(Clitic.fromDict(d));
    }
    ip += 1;
  }
  return out;
}

function getAlternatives(stem: string, st: string, valid: boolean, validSuf: boolean): string {
  if (st === "ت") return valid ? stem.slice(0, -1) + "ة" : "";
  if (st === "آ") return valid ? stem.slice(0, -1) + "أى" : "";
  if (st === "ا") return valid ? stem.slice(0, -1) + "ى" : "";
  if (st === "و") return valid ? stem + "ا" : "";
  if (st === "ئ" || st === "ؤ") return validSuf ? stem.slice(0, -1) + "ء" : "";
  return "";
}

function isValidSegment(seg: Segment): boolean {
  const proc = seg.proclitic.classe;
  const enc = seg.enclitic.classe;
  return (
    (!enc.startsWith("V") || !proc.startsWith("N")) &&
    (!proc.startsWith("V") || !enc.startsWith("N")) &&
    (!isDefinit(proc) || seg.enclitic.unvoweledform === "")
  );
}

/** Port of `Stemming.getListsSegment`. */
export function getListsSegment(lex: Lexicon, unvoweledWord: string): Segment[] {
  const result: Segment[] = [];
  const procs = proclitics(lex, unvoweledWord);
  const encs = enclitics(lex, unvoweledWord);
  let valid = true;
  const wlen = unvoweledWord.length;
  for (const p of procs) {
    for (const s of encs) {
      if (!valid) break;
      if (wlen - s.unvoweledform.length - p.unvoweledform.length >= 0) {
        const alternatives = new Set<string>();
        let stem = unvoweledWord.slice(p.unvoweledform.length, wlen - s.unvoweledform.length);
        alternatives.add(stem);
        if (
          (p.classe === "N1" || p.classe === "N2" || p.classe === "N3" || p.classe === "N5") &&
          p.unvoweledform.endsWith("ل") &&
          !stem.startsWith("ل")
        ) {
          alternatives.add("ل" + stem);
        }
        if (s.unvoweledform === "ي" && !stem.startsWith("ي")) {
          alternatives.add(stem + "ي");
        }
        if (
          (p.classe === "N4" || p.classe === "C3") &&
          p.unvoweledform.endsWith("ل") &&
          stem.startsWith("ل")
        ) {
          alternatives.add(
            getAlternatives(stem, stem[stem.length - 1], s.unvoweledform.length !== 0, s.unvoweledform.length > 0),
          );
          stem = "ا" + stem;
        }
        alternatives.add(stem);
        if (p.unvoweledform === "أ" || p.unvoweledform === "ب") {
          alternatives.add("ا" + stem);
        }
        let stem1 = "";
        if (stem.length > 1) {
          stem1 = getAlternatives(
            stem,
            stem[stem.length - 1],
            s.unvoweledform.length !== 0,
            s.unvoweledform.length > 0,
          );
        }
        if (stem1 !== "") {
          alternatives.add(stem1);
        }
        const stem3 = stem1.replaceAll("آ", "ءا");
        if (stem3 !== stem1) {
          alternatives.add(stem3);
        }
        const stem2 = stem.replaceAll("آ", "ءا");
        if (stem2 !== stem) {
          alternatives.add(stem2);
        }
        for (const sch of alternatives) {
          const seg = new Segment(p, sch, s);
          if (isValidSegment(seg)) {
            result.push(seg);
          }
        }
      } else {
        valid = false;
      }
    }
  }
  return result;
}
