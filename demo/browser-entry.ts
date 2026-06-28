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
const WORD_EXAMPLES = ["مدرسة", "لأنهم", "الكتاب", "يكتبون", "استقلال", "بالمدرسة", "قال"];
const SENT_EXAMPLES = ["ذهب الولد إلى المدرسة", "قرأ الطالب الكتاب", "العلم نور"];

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function renderAnalyses(host: HTMLElement, word: string, list: Analysis[]): void {
  if (list.length === 0) {
    host.innerHTML = `<p class="empty">No analysis found for <span class="arabic">${esc(word)}</span>.</p>`;
    return;
  }
  const head = ["#", "voweled", "lemma", "root", "pattern", "part of speech", "case/mood", "proclitic", "enclitic", "priority"];
  const rows = list
    .map((a, i) => {
      const cells = [
        `<td class="dim">${i + 1}</td>`,
        `<td class="ar arabic">${esc(a.voweledWord)}</td>`,
        `<td class="ar arabic">${esc(a.lemma)}</td>`,
        `<td class="ar arabic">${esc(a.root)}</td>`,
        `<td class="ar arabic">${esc(a.patternStem)}</td>`,
        `<td class="ar arabic pos">${esc(a.partOfSpeech)}</td>`,
        `<td class="ar arabic">${esc(a.caseOrMood)}</td>`,
        `<td class="ar arabic dim">${esc(a.proclitic)}</td>`,
        `<td class="ar arabic dim">${esc(a.enclitic)}</td>`,
        `<td class="dim">${esc(a.priority)}</td>`,
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  host.innerHTML =
    `<p class="count">${list.length} analysis${list.length === 1 ? "" : "es"}</p>` +
    `<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderTokens(host: HTMLElement, list: TokenResult[]): void {
  if (list.length === 0) {
    host.innerHTML = `<p class="empty">No tokens found.</p>`;
    return;
  }
  const head = ["token", "lemma", "stem", "root"];
  const rows = list
    .map((r) => {
      const cells = [
        `<td class="ar arabic">${esc(r.token)}</td>`,
        `<td class="ar arabic">${esc(r.lemma)}</td>`,
        `<td class="ar arabic">${esc(r.stem)}</td>`,
        `<td class="ar arabic">${esc(r.root)}</td>`,
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
    c.className = "chip arabic";
    c.textContent = item;
    c.addEventListener("click", () => onPick(item));
    host.appendChild(c);
  }
}

function main(): void {
  el("ver").textContent = `v${version}`;

  const bootbar = el("bootbar");
  const bootprog = el<HTMLDivElement>("bootprog");
  const wordSection = el("wordSection");
  const sentSection = el("sentSection");

  const wordInput = el<HTMLInputElement>("wordInput");
  const wordBtn = el<HTMLButtonElement>("wordBtn");
  const wordResult = el("wordResult");

  const sentInput = el<HTMLInputElement>("sentInput");
  const sentBtn = el<HTMLButtonElement>("sentBtn");
  const sentResult = el("sentResult");
  const sentHint = el("sentHint");

  const runWord = (w: string): void => {
    const word = w.trim();
    if (!word) return;
    wordInput.value = word;
    renderAnalyses(wordResult, word, analyze(word));
  };

  const runSentence = async (s: string): Promise<void> => {
    const text = s.trim();
    if (!text) return;
    sentInput.value = text;
    if (!farahidi.isLayer2Ready()) {
      sentBtn.disabled = true;
      sentHint.textContent = "Downloading the language model (~5 MB)…";
      try {
        await loadLayer2();
      } catch (e) {
        sentHint.textContent = "Failed to load the language model: " + String(e);
        sentBtn.disabled = false;
        return;
      }
      sentHint.textContent = "Picks one lemma / stem / root per word across the sentence.";
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
      bootbar.innerHTML = `<b>Failed to load the lexicon.</b> ${esc(String(e))}`;
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
}
