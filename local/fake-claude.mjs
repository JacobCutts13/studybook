#!/usr/bin/env node
// Stand-in for `claude -p` in tests. Writes plausible output for the sample
// book and records its arguments. FAKE_CLAUDE_BAD_ONCE=<chapter id> makes the
// first attempt at that chapter invalid, to exercise the retry loop.
import { appendFile, readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1];
await appendFile("fake-claude-calls.jsonl", `${JSON.stringify(args)}\n`);

if (prompt.includes("Write outline.json")) {
  const candidates = JSON.parse(await readFile("candidates.json", "utf8"));
  const starts = candidates.map((c) => c.page).filter((p) => p > 1);
  const last = Number(prompt.match(/(\d+) PDF pages/)[1]);
  const chapters = starts.map((start, id) => ({
    id,
    label: id === 0 ? "Introduction" : `Section ${id}`,
    start,
    end: (starts[id + 1] ?? last + 1) - 1,
  }));
  await writeFile(
    "outline.json",
    JSON.stringify({ title: "A Sample Book", chapters }),
  );
} else {
  const id = Number(prompt.match(/chapters\/(\d+)\.json/)[1]);
  const bad =
    process.env.FAKE_CLAUDE_BAD_ONCE === String(id) &&
    !prompt.includes("had these problems");
  const quiz = Array.from({ length: bad ? 2 : 4 }, (_, n) => ({
    p: `Scenario ${n + 1} for chapter ${id}: what's the sensible next step?`,
    o: [
      "Wait and see",
      "Run a small check first",
      "Ask for more budget",
      "Ship it anyway",
    ],
    a: n % 4,
    e: `Option ${n + 1} is right because it tests the idea cheaply.${n === 0 ? ' <img src=x onerror="alert(1)">' : ""}`,
  }));
  await writeFile(
    `chapters/${id}.json`,
    JSON.stringify({
      summary: `Chapter ${id} argues for <mark>checking ideas cheaply</mark>.`,
      think: [
        "What does the author mean by a check?",
        "Where could you add one at work?",
      ],
      quiz,
    }),
  );
}
console.log(JSON.stringify({ type: "result", result: "ok" }));
