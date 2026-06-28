/**
 * Layer-2 language model: the `*.lm` HMM tables + corpus frequency maps.
 *
 * Ports the model side of `ADATAnalyzer` (`setAllMatrix` / `setAllMatrixS`).
 * The `.lm` is plain-text, length-prefixed, Buckwalter; every key is converted
 * to Arabic on load so the rest of farahidi stays Arabic-script.
 *
 * Three matrices come out of the `.lm`:
 *  - start      `lemma -> [total, freq]`            (the `S0` denominator + each `S1`)
 *  - emission   `"unvWord:lemma" -> freq/wordFreq`  (`B` lines)
 *  - transition `"lemma1:lemma2" -> freq2/freq1`    (`A` lines)
 *
 * The three corpus maps are standard `*.map` tables (already exported to JSONL):
 * `mapLemma` (Double backoff weight), `mapStem` / `mapRoot` (Long counts).
 *
 * The whole model is parsed once and cached.
 */
import { loadMap, readGzipText } from "./lexicon.js";
import { bwToArabic } from "./translit.js";

const LM_FILE = "DATA.MSA.ALL.TRAIN.141809.lm";

const MAP_LEMMA = "DATA.MSA-LEMMA.ALL-train.map"; // backoff weights (float)
const MAP_STEM = "DATA.MSA.SHA.STEM.map"; // stem corpus counts (int)
const MAP_ROOT = "DATA.MSA.SHA.ROOT.map"; // root corpus counts (int)

export interface LmTables {
  start: Map<string, [number, number]>;
  emission: Map<string, number>;
  transition: Map<string, number>;
}

let lmCache: LmTables | undefined;

/**
 * Parse the `.lm` into `{start, emission, transition}` (cached). Byte-for-byte
 * port of the `setAllMatrix` substring arithmetic, including the freq slices
 * that capture a leading separator (`Number` strips it, as Java
 * `Double.parseDouble` / Python `float` do).
 */
export function loadLm(): LmTables {
  if (lmCache) return lmCache;
  const start = new Map<string, [number, number]>();
  const emission = new Map<string, number>();
  const transition = new Map<string, number>();
  const bw = bwToArabic;

  let sTotal = 0.0;
  const text = readGzipText(LM_FILE + ".gz");
  for (const raw of text.split("\n")) {
    const line = raw.replace(/[\r\n]+$/, "");
    if (!line) continue;
    const kind = line[0];
    if (kind === "S") {
      if (line[1] === "1") {
        const size = Number(line.slice(3, 5));
        const tag = line.slice(6, 6 + size);
        const tagFreq = Number(line.slice(7 + size));
        start.set(bw(tag), [sTotal, tagFreq]);
      } else {
        // S0 <total>
        sTotal = Number(line.slice(3));
      }
    } else if (kind === "B") {
      const sizeT = Number(line.slice(2, 4));
      const sizeF = Number(line.slice(4, 5));
      const word = line.slice(6, 6 + sizeT);
      const wordFreq = Number(line.slice(7 + sizeT, 7 + sizeT + sizeF));
      const wordAr = bw(word);
      let pos = 8 + sizeT + sizeF;
      const n = line.length;
      while (pos < n) {
        const s2t = Number(line.slice(pos, pos + 2));
        const s2f = Number(line.slice(pos + 2, pos + 3));
        const tag = line.slice(pos + 4, pos + 4 + s2t);
        const tagFreq = Number(line.slice(pos + 4 + s2t, pos + 5 + s2t + s2f));
        emission.set(wordAr + ":" + bw(tag), tagFreq / wordFreq);
        pos += 6 + s2t + s2f;
      }
    } else if (kind === "A") {
      const sizeT = Number(line.slice(2, 4));
      const sizeF = Number(line.slice(4, 5));
      const tag1 = line.slice(6, 6 + sizeT);
      const tag1Freq = Number(line.slice(7 + sizeT, 7 + sizeT + sizeF));
      const tag1Ar = bw(tag1);
      let pos = 8 + sizeT + sizeF;
      const n = line.length;
      while (pos < n) {
        const s2t = Number(line.slice(pos, pos + 2));
        const s2f = Number(line.slice(pos + 2, pos + 3));
        const tag2 = line.slice(pos + 4, pos + 4 + s2t);
        const tag2Freq = Number(line.slice(pos + 4 + s2t, pos + 5 + s2t + s2f));
        transition.set(tag1Ar + ":" + bw(tag2), tag2Freq / tag1Freq);
        pos += 6 + s2t + s2f;
      }
    }
  }

  lmCache = { start, emission, transition };
  return lmCache;
}

/**
 * Lazy, cached access to the `.lm` matrices and the corpus freq maps. Cheap to
 * construct — all state lives in module-level caches, so instances share one
 * in-memory copy of the (large) model.
 */
export class LanguageModel {
  get start(): Map<string, [number, number]> {
    return loadLm().start;
  }
  get emission(): Map<string, number> {
    return loadLm().emission;
  }
  get transition(): Map<string, number> {
    return loadLm().transition;
  }
  get mapLemma(): Map<string, number> {
    return loadMap(MAP_LEMMA) as Map<string, number>;
  }
  get mapStem(): Map<string, number> {
    return loadMap(MAP_STEM) as Map<string, number>;
  }
  get mapRoot(): Map<string, number> {
    return loadMap(MAP_ROOT) as Map<string, number>;
  }
}
