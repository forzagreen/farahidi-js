# farahidi

**Arabic morphological analyzer for JavaScript / TypeScript** — a pure-JS
re-implementation of [AlKhalil Morpho Sys 2](https://alkhalil.oujda-nlp-team.net/)
(Oujda NLP Team), ported 1:1 from the Python
[`farahidi`](https://github.com/forzagreen/farahidi) library.

Given an Arabic word, `farahidi` returns every valid morphological analysis —
**root, lemma, stem, pattern (wazn), part of speech with full features, case/mood,
and segmented proclitics/enclitics** — ranked by corpus frequency.

- **Pure JS, zero runtime dependencies.** ESM + CommonJS, typed. Node 18–24.
- **Offline.** The full lexicon plus the in-context language model ship
  gzip-compressed inside the package (~11 MB); nothing is downloaded at runtime,
  decompressed lazily with `node:zlib`.
- **Faithful.** Output is validated to exact parity against the original Java
  `AlKhalil2Analyzer` (single-word) and `ADATAnalyzer` (in-context) via golden
  fixtures.

> Named after **al-Khalīl ibn Aḥmad al-Farāhīdī** (الخليل بن أحمد الفراهيدي), the
> 8th-century founder of Arabic lexicography and prosody.

## Install

```bash
npm install farahidi
```

## Usage

```ts
import { analyze } from "farahidi";

for (const a of analyze("لِأَنَّهُمْ")) {
  console.log(a.voweledWord, a.lemma, a.root, a.partOfSpeech);
}
```

CommonJS works too:

```js
const { analyze } = require("farahidi");
```

`analyze()` returns an array of `Analysis` objects, sorted by `priority`
(most frequent analysis first). Each `Analysis` has these fields (Arabic script;
`"-"` = not applicable, `"#"` = absent clitic):

| field | meaning |
|---|---|
| `voweledWord` | fully diacritized surface form |
| `proclitic` / `enclitic` | segmented clitics with their descriptions |
| `stem` | the bare stem |
| `lemma` | dictionary form |
| `root` | the (3- or 4-letter) root |
| `patternStem` / `patternLemma` | canonical patterns (wazn) |
| `diacPatternStem` | diacritic pattern of the stem |
| `partOfSpeech` | pipe-joined POS + morpho-syntactic features |
| `caseOrMood` | إعراب (case for nouns, mood for verbs) |
| `priority` | out-of-context ranking weight (higher = more frequent) |

For repeated analysis, build one reusable analyzer (the lexicon loads lazily and
is shared across instances):

```ts
import { Analyzer } from "farahidi";

const az = new Analyzer();
const results = az.analyze("مدرسة");
```

### In-context disambiguation

`analyzeText()` picks the single best analysis per token across a sentence,
returning one `TokenResult` per word with the chosen `lemma`, `stem`, and `root`:

```ts
import { analyzeText } from "farahidi";

for (const r of analyzeText("ذهب الولد إلى المدرسة")) {
  console.log(r.token, r.lemma, r.stem, r.root);
}
// ذهب ذَهَبَ ذَهَب ذهب
// الولد وَلَد وَلَد ولد
// إلى إِلَى إِلَى -
// المدرسة مَدْرَسَة مَدْرَسَة درس
```

A reusable `Disambiguator` is also exposed; `disambiguate(tokens)` takes a
pre-tokenized list. `TokenResult.analyzed` is `false` for tokens the analyzer
could not analyze (lemma/stem/root then fall back to the token).

## Scope

- **Layer 1** — out-of-context analysis of a single word (`analyze` /
  `Analyzer`), returning all candidates ranked by frequency.
- **Layer 2** — in-context disambiguation (`analyzeText` / `Disambiguator`), a
  faithful port of AlKhalil's shipped `ADATAnalyzer` (lemmatizer + light/heavy
  stemmer). The chosen lemma is exact; the stem/root are then selected by corpus
  frequency among that lemma's analyses. On exact frequency ties the pick depends
  on analysis enumeration order, which can differ from the Java reference (its
  decoder draws stems/roots from a `HashSet`); the lemma decode is unaffected.

Both layers are validated to per-token parity against the Java reference.

## Data & license

`farahidi` is licensed under the **GPL-3.0-or-later**, because it bundles and
derives from AlKhalil Morpho Sys 2's GPL-3.0 linguistic data. Simply *using* the
library (e.g. `npm install` and calling `analyze`) places no obligations on your
own code or its outputs. See [`NOTICE`](NOTICE) for attribution to the Oujda NLP
Team and [`LICENSE`](LICENSE) for the full terms.

## Development

```bash
npm install
npm test          # vitest (incl. the golden parity suite)
npm run build     # tsup -> dual ESM+CJS in dist/, then copies the bundled data
npm run typecheck
npm run lint
```

The bundled data and the `golden.jsonl` fixture are copied verbatim from the
Python `farahidi` package; they are not regenerated here.
