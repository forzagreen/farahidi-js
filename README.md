# farahidi

**Arabic morphological analyzer for JavaScript / TypeScript** — a pure-JS
re-implementation of [AlKhalil Morpho Sys 2](https://alkhalil.oujda-nlp-team.net/)
(Oujda NLP Team), ported 1:1 from the Python
[`farahidi`](https://github.com/forzagreen/farahidi) library.

Given an Arabic word, `farahidi` returns every valid morphological analysis —
**root, lemma, stem, pattern (wazn), part of speech with full features, case/mood,
and segmented proclitics/enclitics** — ranked by corpus frequency.

- **Pure JS, zero runtime dependencies.** ESM + CommonJS, typed. Node 18–24.
- **Offline.** The full lexicon ships gzip-compressed inside the package
  (~4.8 MB); nothing is downloaded at runtime, decompressed lazily with
  `node:zlib`.
- **Faithful.** Output is validated to exact multiset parity against the Python
  reference, which is itself validated against the original Java
  `AlKhalil2Analyzer` (98-word golden fixture).

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

## Scope

- **Layer 1** — out-of-context analysis of a single word (`analyze`), returning
  all candidates ranked by frequency. **Implemented and validated.**
- **Layer 2** — in-context disambiguation (one chosen lemma/stem/root per token
  across a sentence) exists in the Python library and is not yet ported here.

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
