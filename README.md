# farahidi

[![npm](https://img.shields.io/npm/v/farahidi)](https://www.npmjs.com/package/farahidi)
[![Node.js version](https://img.shields.io/node/v/farahidi)](https://www.npmjs.com/package/farahidi)
[![CI](https://github.com/forzagreen/farahidi-js/actions/workflows/ci.yml/badge.svg)](https://github.com/forzagreen/farahidi-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/farahidi)](LICENSE)

**Arabic morphological analyzer for JavaScript / TypeScript** — a pure-JS
re-implementation of the original Java
[AlKhalil Morpho Sys 2](https://alkhalil.oujda-nlp-team.net/AlKhalil-MorphoSys.php)
(Oujda NLP Team), ported 1:1 from the Python
[`farahidi`](https://github.com/forzagreen/farahidi) library.

Given an Arabic word, `farahidi` returns every valid morphological analysis —
**root, lemma, stem, pattern (wazn), part of speech with structured features, and
segmented clitics/affixes** — ranked by corpus frequency. The syntactic
case/mood endings (الإعراب) are kept apart from the morphology: each analysis
nests its possible *inflections* instead of being repeated once per ending.

- **Pure JS, zero runtime dependencies.** ESM + CommonJS, typed. Node 18–24.
- **Offline.** The full lexicon plus the in-context language model ship
  gzip-compressed inside the package (~11 MB); nothing is downloaded at runtime,
  decompressed lazily with `node:zlib`.
- **Faithful.** Output is validated to exact parity against the original Java
  `AlKhalil2Analyzer` (single-word) and `ADATAnalyzer` (in-context) via golden
  fixtures.

> Named after **al-Khalīl ibn Aḥmad al-Farāhīdī** (الخليل بن أحمد الفراهيدي), the
> 8th-century founder of Arabic lexicography and prosody.

## Live demo

**[forzagreen.github.io/farahidi-js](https://forzagreen.github.io/farahidi-js/)** — the
whole analyzer (engine + lexicon) runs in your browser; no server, nothing sent anywhere.
Type any Arabic word to see every morphological analysis (with a toggle to expand the
إعراب variants), or a sentence for in-context disambiguation.

## Install

```bash
npm install farahidi
```

## Usage

```ts
import { analyze } from "farahidi";

for (const a of analyze("بالمدرسة")) {
  console.log(a.diacritized, a.lemma, a.root, a.pos, a.type, a.proclitics);
}
// بِالْمِدْرَسَة مِدْرَس درس اسم اسم آلة [ { form: 'بِال', description: 'حرف الجر+ال:التعريف' } ]
// بِالْمُدَرَّسَة مُدَرَّس درس اسم اسم مفعول [ { form: 'بِال', description: 'حرف الجر+ال:التعريف' } ]
// ...
```

CommonJS works too:

```js
const { analyze } = require("farahidi");
```

`analyze()` returns an array of `Analysis` objects — one per **morphological
reading** of the word, sorted by `score` (most frequent first). All labels are
Arabic strings as found in the AlKhalil lexicon; `null` means "not applicable"
(a particle has no root, a noun has no mood, …).

| field | meaning |
|---|---|
| `diacritized` | the word with its diacritics, *without* the case/mood ending (`عَنْدَلِيب`, `يَكْتُب`) |
| `lemma` / `root` / `stem` | dictionary form, 3- or 4-letter root, clitic-free stem |
| `pattern` / `lemmaPattern` | canonical patterns (wazn) of the stem and the lemma |
| `pos` / `type` | part of speech (`اسم` / `فعل` / `حرف`) and sub-type (`اسم فاعل`, `مصدر أصلي`, `جر`, `اسم علم` …) |
| `gender` / `number` | noun features (`مذكر` / `مؤنث`, `مفرد` / `مثنى` / `جمع`) |
| `tense` / `voice` / `person` / `pronoun` / `transitivity` / `augmentation` / `emphatic` | verb features (`ماض` / `مضارع` / `أمر`, `معلوم` / `مجهول`, `غائب` …, the subject pronoun `هو` / `أنتَ` / …, `لازم` / `متعد`, `مجرد` / `مزيد`, نون التوكيد) |
| `proclitics` / `prefixes` / `suffixes` / `enclitics` | segmentation around the stem as `Affix { form, description }` arrays: clitics (`وَ`, `بِ`, `ال`, attached pronouns) and inflectional affixes (the مضارع prefix, `ة`, `ان`, `وا` …) |
| `score` | out-of-context ranking weight, higher = more frequent |
| `inflections` | the إعراب variants of this reading (below) |

### Morphology vs. syntax (الإعراب)

The case ending of a noun and the mood ending of a verb depend on the word's role
in a sentence, not on its morphology, so they do not multiply the results. A bare
`عندليب` is **one** analysis; its five possible endings are nested as
`Inflection` objects, best first:

```ts
const [a] = analyze("عندليب");
console.log(a.diacritized, a.pos, a.type, a.root); // عَنْدَلِيب اسم اسم جامد عندل
for (const i of a.inflections) console.log(i.diacritized, i.case, i.state);
// عَنْدَلِيبٌ مرفوع نكرة
// عَنْدَلِيبٍ مجرور نكرة
// عَنْدَلِيبَ منصوب مضاف
// عَنْدَلِيبُ مرفوع مضاف
// عَنْدَلِيبِ مجرور مضاف
```

Each `Inflection` carries the fully vowelled `diacritized` form, `case` (nouns:
`مرفوع` / `منصوب` / `مجرور`) or `mood` (verbs: `مرفوع` / `منصوب` / `مجزوم`), the
noun's definiteness `state` (`نكرة` / `معرف بأل` / `مضاف` …) and its own `score`.
Indeclinable words (particles, past and imperative verbs) have exactly one
inflection with `case`/`mood` `null`. To get the old one-row-per-ending view,
flatten: `analyses.flatMap((a) => a.inflections.map((i) => ({ ...a, ...i })))`.

Results are plain JSON data. For repeated analysis, build one reusable analyzer
(the lexicon loads lazily and is shared across instances):

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
pre-tokenized list and `tokenize(text)` exposes the sentence/word splitter.
`TokenResult.root` is `null` when the chosen reading has no root (particles).
`TokenResult.analyzed` is `false` for tokens the analyzer could not analyze
(lemma/stem then fall back to the token, root is `null`).

## Scope

- **Layer 1** — out-of-context analysis of a single word (`analyze` /
  `Analyzer`), returning all morphological readings ranked by frequency, each
  with its possible إعراب endings nested as inflections. The underlying engine
  is the full AlKhalil pipeline; its raw one-record-per-ending output is what
  the golden parity suite compares to the Java reference.
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

### The browser demo

```bash
npm run build:demo   # bundles demo/ + dist + data into ./site
npm run serve:demo   # preview at http://localhost:8080
```

`site/` is a static site (committed to no branch — built in CI). It works because
the engine's data layer is pluggable: the page fetches the gzip tables, decompresses
them with the browser-native `DecompressionStream`, and injects the text via the
exported `provideRawText()` so the synchronous analyzer runs unchanged. The Layer-2
language model is downloaded only when the sentence demo is first used.

Deployment is automated by `.github/workflows/pages.yml` (build → `actions/deploy-pages`).
To enable it once: repo **Settings → Pages → Source: GitHub Actions**.
