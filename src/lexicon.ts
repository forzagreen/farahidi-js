/**
 * Lazy, cached access to the bundled AlKhalil data tables.
 *
 * The data ships as gzip-compressed JSONL inside `data/` (next to the compiled
 * module). Each table is loaded at most once, on first use, and cached.
 * `*.map.jsonl` files become a `Map` keyed by the record `key`; `*.list.jsonl`
 * files become an array of records.
 *
 * The accessors mirror the Java `DerivedFactory` / `CliticFactory` lookups so
 * the analyzer can follow the same joins. Map keys may be numbers (e.g. stem
 * length) or strings (clitic surfaces, roots) — a JS `Map` preserves both,
 * matching Python's `dict` semantics.
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Logical name -> bundled filename (from AlKhalil2.properties). Only the tables
// used by Layer-1 analysis are listed.
const TABLES: Record<string, string> = {
  // clitics
  proclitics: "DATA.Clitics.Proclitics.map",
  enclitics: "DATA.Clitics.Enclitics.map",
  // exceptional
  exceptional: "DATA.Exceptional.map",
  // proper nouns
  propernoun_unvoweled: "DATA.NonDerived.Propernoun.Unvoweled.map",
  propernoun_voweled: "DATA.NonDerived.Propernoun.Voweled.list",
  propernoun_pos: "DATA.NonDerived.Propernoun.PartOfSpeech.list",
  propernoun_casemood: "DATA.NonDerived.Propernoun.CaseOrMood.list",
  // toolwords
  toolwords_unvoweled: "DATA.NonDerived.Toolwords.Unvoweled.map",
  toolwords_voweled: "DATA.NonDerived.Toolwords.Voweled.list",
  toolwords_pos: "DATA.NonDerived.Toolwords.PartOfSpeech.list",
  // roots
  root_freq: "DATA.Root.map",
};

// Per-category (Verbs/Nouns) tables, formatted with the category name.
const DERIVED_TABLES: Record<string, string> = {
  unvoweled_stem: "DATA.Derived.{cat}.Patterns.Stems.Unvoweled.map",
  voweled_diac_stem: "DATA.Derived.{cat}.Patterns.Stems.Voweled.Diac.map",
  voweled_canonic_stem: "DATA.Derived.{cat}.Patterns.Stems.Voweled.Canonic.map",
  voweled_diac_lemma: "DATA.Derived.{cat}.Patterns.Lemmas.Voweled.Diac.map",
  voweled_canonic_lemma: "DATA.Derived.{cat}.Patterns.Lemmas.Voweled.Canonic.map",
  roots_tri: "DATA.Derived.{cat}.Roots.Trilateral.map",
  roots_quad: "DATA.Derived.{cat}.Roots.Quadriliteral.map",
  roots_id_tri: "DATA.Derived.{cat}.Roots.id.Trilateral.map",
  roots_id_quad: "DATA.Derived.{cat}.Roots.id.Quadriliteral.map",
  formulas: "DATA.Derived.{cat}.Formulas.map",
  pos: "DATA.Derived.{cat}.PartOfSpeech.list",
  casemood: "DATA.Derived.{cat}.CaseOrMood.list",
};

// Per-feature VEntity lists used to decode PartOfSpeech codes.
const FEATURE_TABLES: Record<string, string> = {
  Main: "DATA.Derived.{cat}.PartOfSpeech.Main.list",
  Type: "DATA.Derived.{cat}.PartOfSpeech.Type.list",
  NbRoot: "DATA.Derived.{cat}.PartOfSpeech.NbRoot.list",
  // verbs
  Augmented: "DATA.Derived.Verbs.PartOfSpeech.Augmented.list",
  Emphasized: "DATA.Derived.Verbs.PartOfSpeech.Emphasized.list",
  Person: "DATA.Derived.Verbs.PartOfSpeech.Person.list",
  Person2: "DATA.Derived.Verbs.PartOfSpeech.Person2.list",
  Transitivity: "DATA.Derived.Verbs.PartOfSpeech.Transitivity.list",
  Voice: "DATA.Derived.Verbs.PartOfSpeech.Voice.list",
  // nouns
  Definit: "DATA.Derived.Nouns.PartOfSpeech.Definit.list",
  Gender: "DATA.Derived.Nouns.PartOfSpeech.Gender.list",
  Number: "DATA.Derived.Nouns.PartOfSpeech.Number.list",
};

const DATA_DIR = fileURLToPath(new URL("./data/", import.meta.url));

const mapCache = new Map<string, Map<unknown, unknown>>();
const listCache = new Map<string, unknown[]>();

function readLines(filename: string): string[] {
  const buf = readFileSync(DATA_DIR + filename + ".jsonl.gz");
  const text = gunzipSync(buf).toString("utf-8");
  return text.split("\n");
}

/**
 * Decompress a bundled `.gz` file (full name incl. extension) to text. Used by
 * the Layer-2 language model to read the plain-text `.lm`. Decoded as latin1
 * (the `.lm` is pure ASCII Buckwalter; latin1 is a lossless 1:1 byte mapping).
 */
export function readGzipText(filenameWithExt: string): string {
  return gunzipSync(readFileSync(DATA_DIR + filenameWithExt)).toString("latin1");
}

/** Load a `*.map` table as a `Map<key, value>` (cached). */
export function loadMap(filename: string): Map<unknown, unknown> {
  const hit = mapCache.get(filename);
  if (hit) return hit;
  const out = new Map<unknown, unknown>();
  for (const line of readLines(filename)) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    out.set(rec.key, rec.value);
  }
  mapCache.set(filename, out);
  return out;
}

/** Load a `*.list` table as an array of records (cached). */
export function loadList(filename: string): unknown[] {
  const hit = listCache.get(filename);
  if (hit) return hit;
  const out: unknown[] = [];
  for (const line of readLines(filename)) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line));
  }
  listCache.set(filename, out);
  return out;
}

/**
 * Typed accessors over the bundled tables, mirroring the Java factories.
 *
 * Stateless and cheap to construct — all real work is the module-level cached
 * loaders, so multiple instances share one in-memory copy.
 */
export class Lexicon {
  // --- generic map/list resolution -------------------------------------
  map(logical: string): Map<unknown, unknown> {
    return loadMap(TABLES[logical]);
  }

  list(logical: string): any[] {
    return loadList(TABLES[logical]);
  }

  derivedMap(cat: string, logical: string): Map<unknown, unknown> {
    return loadMap(DERIVED_TABLES[logical].replace("{cat}", cat));
  }

  derivedList(cat: string, logical: string): any[] {
    return loadList(DERIVED_TABLES[logical].replace("{cat}", cat));
  }

  // --- clitics ----------------------------------------------------------
  proclitics(surface: string): any[] {
    return (this.map("proclitics").get(surface) as any[]) ?? [];
  }

  enclitics(surface: string): any[] {
    return (this.map("enclitics").get(surface) as any[]) ?? [];
  }

  // --- derived: patterns / roots / formulas -----------------------------
  unvoweledStems(cat: string, length: number): any[] {
    return (this.derivedMap(cat, "unvoweled_stem").get(length) as any[]) ?? [];
  }

  voweledDiacStem(cat: string, length: number, index: number): any | null {
    const lst = this.derivedMap(cat, "voweled_diac_stem").get(length) as any[] | undefined;
    return lst && index > 0 && index <= lst.length ? lst[index - 1] : null;
  }

  voweledCanonicStem(cat: string, length: number, index: number): any | null {
    const lst = this.derivedMap(cat, "voweled_canonic_stem").get(length) as any[] | undefined;
    return lst && index > 0 && index <= lst.length ? lst[index - 1] : null;
  }

  voweledDiacLemma(cat: string, length: number, index: number): any | null {
    const lst = this.derivedMap(cat, "voweled_diac_lemma").get(length) as any[] | undefined;
    return lst && index > 0 && index <= lst.length ? lst[index - 1] : null;
  }

  voweledCanonicLemma(cat: string, length: number, index: number): any | null {
    const lst = this.derivedMap(cat, "voweled_canonic_lemma").get(length) as any[] | undefined;
    return lst && index > 0 && index <= lst.length ? lst[index - 1] : null;
  }

  formulas(cat: string, length: number): any[] {
    return (this.derivedMap(cat, "formulas").get(length) as any[]) ?? [];
  }

  formula(cat: string, length: number, formulaId: number): any | null {
    const lst = this.formulas(cat, length);
    return formulaId > 0 && formulaId <= lst.length ? lst[formulaId - 1] : null;
  }

  containsRoot(cat: string, root: string): boolean {
    const key = root.length === 3 ? "roots_id_tri" : "roots_id_quad";
    return this.derivedMap(cat, key).has(root);
  }

  /** The Root record (with len1..len12 formula-id slots) for `root`. */
  rootEntity(cat: string, root: string): any | null {
    let idxMap: Map<unknown, unknown>;
    let charMap: Map<unknown, unknown>;
    if (root.length === 3) {
      idxMap = this.derivedMap(cat, "roots_id_tri");
      charMap = this.derivedMap(cat, "roots_tri");
    } else {
      idxMap = this.derivedMap(cat, "roots_id_quad");
      charMap = this.derivedMap(cat, "roots_quad");
    }
    if (!idxMap.has(root)) return null;
    const bucket = charMap.get(root[0]) as any[] | undefined;
    if (bucket == null) return null;
    const idx = idxMap.get(root) as number;
    return idx >= 0 && idx < bucket.length ? bucket[idx] : null;
  }

  // --- part of speech & features ---------------------------------------
  pos(cat: string, posId: number): any | null {
    const lst = this.derivedList(cat, "pos");
    return posId > 0 && posId <= lst.length ? lst[posId - 1] : null;
  }

  casemood(cat: string, casemoodId: number): any | null {
    const lst = this.derivedList(cat, "casemood");
    return casemoodId > 0 && casemoodId <= lst.length ? lst[casemoodId - 1] : null;
  }

  feature(cat: string, feature: string, index: number): any | null {
    const lst = loadList(FEATURE_TABLES[feature].replace("{cat}", cat));
    return index > 0 && index <= lst.length ? lst[index - 1] : null;
  }
}
