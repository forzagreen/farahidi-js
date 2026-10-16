/**
 * Browser bootstrap for the farahidi live demo.
 *
 * The analyzer engine is pure and synchronous, but its lexicon normally loads
 * from disk via `node:fs`/`node:zlib`. In the browser there is no filesystem, so
 * we fetch the bundled gzip tables over HTTP, decompress them with the native
 * `DecompressionStream`, and hand the text to the engine via `provideRawText`
 * before any analysis runs. Layer-2 (the sentence model) is downloaded lazily,
 * only when the sentence demo is first used.
 *
 * Built (with the node builtins stubbed) by `scripts/build-demo.mjs`.
 */
import {
  analyze,
  analyzeText,
  hasRawText,
  layer1DataFiles,
  layer2DataFiles,
  provideRawText,
  version,
  type Affix,
  type Analysis,
  type TokenResult,
} from "../dist/index.js";

// ----------------------------------------------------------------- data load
let dataBase = "./data/";
const loaded = new Set<string>();
let layer1Ready = false;
let layer2Ready = false;

type Progress = (done: number, total: number) => void;

async function fetchGzText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch ${url} -> ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}

async function provideFiles(files: string[], onProgress?: Progress): Promise<void> {
  let done = 0;
  const total = files.length;
  await Promise.all(
    files.map(async (f) => {
      if (!loaded.has(f) && !hasRawText(f)) {
        provideRawText(f, await fetchGzText(dataBase + f));
        loaded.add(f);
      }
      onProgress?.(++done, total);
    }),
  );
}

async function loadLayer1(onProgress?: Progress): Promise<void> {
  if (layer1Ready) return;
  await provideFiles(layer1DataFiles(), onProgress);
  // Warm the heavy table parses now (during the spinner) so the first real
  // analysis is snappy. Touch a verb and a definite noun to cover both paths.
  analyze("كتب");
  analyze("المدرسة");
  layer1Ready = true;
}

async function loadLayer2(onProgress?: Progress): Promise<void> {
  await loadLayer1();
  if (layer2Ready) return;
  await provideFiles(layer2DataFiles(), onProgress);
  analyzeText("ذهب الولد"); // warm the language-model parse
  layer2Ready = true;
}

const farahidi = {
  version,
  analyze,
  analyzeText,
  loadLayer1,
  loadLayer2,
  setDataBase(url: string) {
    dataBase = url.endsWith("/") ? url : url + "/";
  },
  isLayer1Ready: () => layer1Ready,
  isLayer2Ready: () => layer2Ready,
};
(globalThis as unknown as { farahidi: typeof farahidi }).farahidi = farahidi;

// ------------------------------------------------------------------------ UI
const WORD_EXAMPLES = [
  "مدرسة",
  "كَتَبَ",
  "لأنهم",
  "الْكِتَاب",
  "يكتبون",
  "قَالَ",
  "بالمدرسة",
  "مُسْلِمُونَ",
];
const SENT_EXAMPLES = ["ذهب الولد إلى المدرسة", "ذَهَبَ الوَلَدُ إلى المَدْرَسَةِ", "العلم نور"];

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function fmtScore(n: number): string {
  return n.toFixed(4);
}

const DASH = "—";

function fmtAffixes(...groups: Affix[][]): string {
  const items = groups.flat();
  if (items.length === 0) return `<span class="dim">${DASH}</span>`;
  return items
    .map((x) =>
      x.description ? `<span title="${esc(x.description)}">${esc(x.form)}</span>` : esc(x.form),
    )
    .join(" + ");
}

/** The part of speech followed by whichever features apply (noun or verb). */
function fmtFeatures(a: Analysis): string {
  const feats = [
    a.type,
    a.tense,
    a.number,
    a.gender,
    a.person,
    a.pronoun,
    a.voice,
    a.transitivity,
    a.augmentation,
    a.emphatic ? "مؤكد" : null,
  ].filter((f): f is string => Boolean(f));
  return `<b>${esc(a.pos)}</b>${feats.length ? " · " + feats.map(esc).join(" · ") : ""}`;
}

/**
 * One row per morphological reading. With `expand`, one row per إعراب variant
 * instead (fully vowelled form, case/mood and state), as AlKhalil listed them.
 */
function renderAnalyses(host: HTMLElement, word: string, list: Analysis[], expand: boolean): void {
  if (list.length === 0) {
    host.innerHTML = `<p class="empty">لا يوجد تحليل للكلمة «${esc(word)}».</p>`;
    return;
  }
  const head = [
    "#",
    "الكلمة المشكولة",
    "المدخل",
    "الجذر",
    "الوزن",
    "النوع والخصائص",
    "السوابق",
    "اللواحق",
    "الإعراب",
    "الترجيح",
  ];
  const rows: string[] = [];
  let nInfl = 0;
  list.forEach((a, i) => {
    const common = [
      `<td>${esc(a.lemma)}</td>`,
      `<td>${esc(a.root ?? DASH)}</td>`,
      `<td>${esc(a.pattern ?? DASH)}</td>`,
      `<td class="pos">${fmtFeatures(a)}</td>`,
      `<td class="dim">${fmtAffixes(a.proclitics, a.prefixes)}</td>`,
      `<td class="dim">${fmtAffixes(a.suffixes, a.enclitics)}</td>`,
    ].join("");
    if (expand) {
      a.inflections.forEach((f, j) => {
        nInfl++;
        const ending = [f.case ?? f.mood, f.state].filter(Boolean).join(" · ") || DASH;
        rows.push(
          `<tr><td class="num dim">${i + 1}.${j + 1}</td><td>${esc(f.diacritized)}</td>${common}` +
            `<td>${esc(ending)}</td><td class="num dim">${fmtScore(f.score)}</td></tr>`,
        );
      });
    } else {
      const endings = [
        ...new Set(a.inflections.map((f) => f.case ?? f.mood).filter(Boolean)),
      ] as string[];
      rows.push(
        `<tr><td class="num dim">${i + 1}</td><td>${esc(a.diacritized)}</td>${common}` +
          `<td class="dim">${endings.length ? esc(endings.join(" / ")) : DASH}</td>` +
          `<td class="num dim">${fmtScore(a.score)}</td></tr>`,
      );
    }
  });
  const count = expand
    ? `عدد التحليلات الصرفية: <span class="num">${list.length}</span> — بحالاتها الإعرابية: <span class="num">${nInfl}</span>`
    : `عدد التحليلات الصرفية: <span class="num">${list.length}</span>`;
  host.innerHTML =
    `<p class="count">${count}</p>` +
    `<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderTokens(host: HTMLElement, list: TokenResult[]): void {
  if (list.length === 0) {
    host.innerHTML = `<p class="empty">لا توجد كلمات.</p>`;
    return;
  }
  const head = ["الكلمة", "المدخل", "الجِذع", "الجذر"];
  const rows = list
    .map((r) => {
      const cells = [
        `<td>${esc(r.token)}</td>`,
        `<td>${esc(r.lemma)}</td>`,
        `<td>${esc(r.stem)}</td>`,
        `<td>${esc(r.root ?? DASH)}</td>`,
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  host.innerHTML = `<div class="tablewrap"><table><thead><tr>${head
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function makeChips(host: HTMLElement, items: string[], onPick: (s: string) => void): void {
  host.innerHTML = "";
  for (const item of items) {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = item;
    c.addEventListener("click", () => onPick(item));
    host.appendChild(c);
  }
}

function setupTheme(): void {
  const KEY = "farahidi-theme";
  const root = document.documentElement;
  const buttons = Array.from(el("theme").querySelectorAll<HTMLButtonElement>("button[data-mode]"));
  const media = matchMedia("(prefers-color-scheme: dark)");
  const getPref = (): string => {
    try {
      return localStorage.getItem(KEY) || "auto";
    } catch {
      return "auto";
    }
  };
  const apply = (): void => {
    const pref = getPref();
    const dark = pref === "dark" || (pref === "auto" && media.matches);
    root.dataset.theme = dark ? "dark" : "light";
    for (const b of buttons) b.classList.toggle("active", b.dataset.mode === pref);
  };
  for (const b of buttons) {
    b.addEventListener("click", () => {
      try {
        localStorage.setItem(KEY, b.dataset.mode!);
      } catch {
        /* ignore storage errors (private mode) */
      }
      apply();
    });
  }
  media.addEventListener("change", () => {
    if (getPref() === "auto") apply();
  });
  apply();
}

function main(): void {
  setupTheme();
  el("ver").textContent = `v${version}`;

  const bootbar = el("bootbar");
  const bootprog = el<HTMLDivElement>("bootprog");
  const wordSection = el("wordSection");
  const sentSection = el("sentSection");

  const wordInput = el<HTMLInputElement>("wordInput");
  const wordBtn = el<HTMLButtonElement>("wordBtn");
  const wordResult = el("wordResult");
  const inflToggle = el<HTMLInputElement>("inflToggle");

  const sentInput = el<HTMLInputElement>("sentInput");
  const sentBtn = el<HTMLButtonElement>("sentBtn");
  const sentResult = el("sentResult");
  const sentHint = el("sentHint");

  const runWord = (w: string): void => {
    const word = w.trim();
    if (!word) return;
    wordInput.value = word;
    renderAnalyses(wordResult, word, analyze(word), inflToggle.checked);
  };
  inflToggle.addEventListener("change", () => runWord(wordInput.value));

  const runSentence = async (s: string): Promise<void> => {
    const text = s.trim();
    if (!text) return;
    sentInput.value = text;
    if (!farahidi.isLayer2Ready()) {
      sentBtn.disabled = true;
      sentHint.textContent = "جارٍ تحميل النموذج اللغوي (نحو 5 ميغابايت)…";
      try {
        await loadLayer2();
      } catch (e) {
        sentHint.textContent = "تعذّر تحميل النموذج اللغوي: " + String(e);
        sentBtn.disabled = false;
        return;
      }
      sentHint.textContent = "يختار مدخلًا معجميًا وجِذعًا وجذرًا واحدًا لكل كلمة ضمن سياق الجملة.";
      sentBtn.disabled = false;
    }
    renderTokens(sentResult, analyzeText(text));
  };

  makeChips(el("wordChips"), WORD_EXAMPLES, runWord);
  makeChips(el("sentChips"), SENT_EXAMPLES, (s) => void runSentence(s));
  wordBtn.addEventListener("click", () => runWord(wordInput.value));
  wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runWord(wordInput.value);
  });
  sentBtn.addEventListener("click", () => void runSentence(sentInput.value));
  sentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void runSentence(sentInput.value);
  });

  loadLayer1((done, total) => {
    bootprog.style.width = `${Math.round((done / total) * 100)}%`;
  })
    .then(() => {
      bootbar.hidden = true;
      wordSection.hidden = false;
      sentSection.hidden = false;
      runWord("مدرسة");
    })
    .catch((e) => {
      bootbar.innerHTML = `<b>تعذّر تحميل المعجم.</b> ${esc(String(e))}`;
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
}
