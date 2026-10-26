import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

async function bookFolder() {
  const dir = await mkdtemp(join(tmpdir(), "studybook-"));
  await run(process.execPath, [
    here("./fixtures/make-sample.mjs"),
    join(dir, "book.pdf"),
  ]);
  await writeFile(
    join(dir, "job.json"),
    JSON.stringify({ filename: "sample.pdf", profile: "A product manager." }),
  );
  return dir;
}

async function runWorker(dir, env = {}) {
  await run(process.execPath, [here("./worker.mjs"), dir], {
    env: {
      ...process.env,
      STUDYBOOK_CLAUDE_COMMAND: here("./fake-claude.mjs"),
      ...env,
    },
  });
  const read = async (file) =>
    JSON.parse(await readFile(join(dir, file), "utf8"));
  const calls = (await readFile(join(dir, "fake-claude-calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { state: await read("state.json"), read, calls };
}

test("builds book.json from the sample book with sandboxed Claude runs", async () => {
  const dir = await bookFolder();
  const { state, read, calls } = await runWorker(dir);
  assert.equal(state.status, "done", state.message);
  const book = await read("book.json");
  assert.equal(book.title, "A Sample Book");
  assert.deepEqual(
    book.chapters.map((c) => [c.label, c.start, c.end]),
    [
      ["Introduction", 2, 3],
      ["Section 1", 4, 5],
      ["Section 2", 6, 7],
      ["Section 3", 8, 9],
    ],
  );
  assert.equal(
    book.chapters[0].quiz[0].p.includes("what’s"),
    true,
    "smart quotes",
  );
  assert.match(
    book.chapters[0].summary,
    /<mark>checking ideas cheaply<\/mark>/,
  );
  assert.ok(!book.chapters[0].quiz[0].e.includes("<img"), "HTML is escaped");
  assert.equal(calls.length, 5, "one outline run + one run per chapter");
  for (const args of calls) {
    assert.equal(args[args.indexOf("--tools") + 1], "Read,Write");
    assert.ok(args.includes("Read(./**)") && args.includes("Edit(./**)"));
    assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
    assert.ok(args.includes("--strict-mcp-config"));
  }
  assert.ok(
    calls[1].join(" ").includes("A product manager."),
    "profile in prompt",
  );
});

test("retries an invalid chapter with its errors, then resumes without redoing work", async () => {
  const dir = await bookFolder();
  const first = await runWorker(dir, { FAKE_CLAUDE_BAD_ONCE: "2" });
  assert.equal(first.state.status, "done", first.state.message);
  const retry = first.calls.find((args) =>
    args.join(" ").includes("chapters/2.json had these problems"),
  );
  assert.ok(retry, "chapter 2 was retried with its errors");
  assert.match(retry.join(" "), /quiz must have 4-8 questions/);
  assert.equal(first.calls.length, 6);

  const again = await runWorker(dir);
  assert.equal(again.state.status, "done");
  assert.equal(
    again.calls.length,
    6,
    "a re-run with valid files calls Claude 0 more times",
  );
});
