import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chapterCandidates } from "./chapters.mjs";
import { mergeNotes } from "./notes.mjs";
import { cleanPages, readPageLines } from "./pdf.mjs";
import {
  smartQuotes,
  validateChapter,
  validateOutline,
  wordRuns,
} from "./validate.mjs";

const sample = fileURLToPath(
  new URL("./fixtures/sample-book.pdf", import.meta.url),
);
let pages;

before(async () => {
  if (!existsSync(sample))
    execFileSync(process.execPath, [
      fileURLToPath(new URL("./fixtures/make-sample.mjs", import.meta.url)),
    ]);
  pages = cleanPages(await readPageLines(sample));
});

const goodChapter = () => ({
  summary: "Break plans into <mark>small checks</mark> you can stop early.",
  think: ["What makes a bet useful?", "Which of your plans has no stop rule?"],
  quiz: [0, 1, 2, 3].map((n) => ({
    p: `Scenario ${n}?`,
    o: ["A", "B", "C", "D"],
    a: n,
    e: "Because.",
  })),
});

test("reads pages and strips running headers and page numbers", () => {
  assert.equal(pages.length, 9);
  assert.ok(
    pages.every((lines) => lines.every((l) => !l.startsWith("A Sample Book"))),
    "running header with a page number is removed",
  );
  assert.ok(pages.every((lines) => lines.every((l) => !/^\d+$/.test(l))));
  assert.equal(pages[3][0], "Chapter One: Small Bets");
});

test("marks likely chapter starts", () => {
  const found = chapterCandidates(pages).map((c) => c.page);
  for (const page of [1, 2, 4, 6, 8])
    assert.ok(found.includes(page), `p${page}`);
});

test("accepts a valid chapter and rejects copied wording", () => {
  const runs = wordRuns(pages);
  assert.deepEqual(validateChapter(goodChapter(), runs), []);
  const copied = goodChapter();
  copied.quiz[0].e =
    "Before starting a piece, write down the result that would make you stop.";
  assert.match(validateChapter(copied, runs).join(), /match the book/);
});

test("rejects malformed chapters", () => {
  const bad = goodChapter();
  bad.think.pop();
  bad.quiz[1].a = 4;
  bad.quiz[2].p = bad.quiz[3].p;
  const errors = validateChapter(bad, new Set()).join("\n");
  assert.match(errors, /exactly 2/);
  assert.match(errors, /question 2/);
  assert.match(errors, /duplicate/);
});

test("validates outline ranges", () => {
  const outline = (chapters) => ({ title: "T", chapters });
  assert.deepEqual(
    validateOutline(outline([{ id: 0, label: "A", start: 2, end: 3 }]), 9),
    [],
  );
  assert.match(
    validateOutline(
      outline([
        { id: 0, label: "A", start: 2, end: 5 },
        { id: 1, label: "B", start: 5, end: 12 },
      ]),
      9,
    ).join(),
    /outside/,
  );
  assert.match(
    validateOutline(
      outline([
        { id: 0, label: "A", start: 2, end: 5 },
        { id: 1, label: "B", start: 4, end: 6 },
      ]),
      9,
    ).join(),
    /overlaps/,
  );
});

test("converts straight quotes", () => {
  assert.equal(smartQuotes(`It's "fine"`), "It’s “fine”");
});

test("merges notes by id, newer edit wins", () => {
  const merged = mergeNotes(
    [
      { id: "a", updated: 2, text: "old-but-newer" },
      { id: "b", updated: 1, text: "b" },
    ],
    [
      { id: "a", updated: 1, text: "stale" },
      { id: "b", updated: 3, deleted: true },
      { id: "c", updated: 1, text: "c" },
      { id: 5, updated: 1 },
    ],
  );
  assert.deepEqual(
    merged.map((n) => [n.id, n.text ?? "deleted"]),
    [
      ["a", "old-but-newer"],
      ["b", "deleted"],
      ["c", "c"],
    ],
  );
});
