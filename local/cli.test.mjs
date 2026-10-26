import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

async function cli(args, env = {}) {
  const data =
    env.STUDYBOOK_DATA ?? (await mkdtemp(join(tmpdir(), "studybook-cli-")));
  try {
    const { stdout } = await run(
      process.execPath,
      [here("./cli.mjs"), ...args],
      {
        env: {
          ...process.env,
          STUDYBOOK_DATA: data,
          STUDYBOOK_PORT: "4799",
          STUDYBOOK_CLAUDE_COMMAND: here("./fake-claude.mjs"),
          ...env,
        },
      },
    );
    return { code: 0, out: stdout, data };
  } catch (error) {
    return { code: error.code, out: `${error.stdout}${error.stderr}`, data };
  }
}

async function samplePdf() {
  const path = join(
    await mkdtemp(join(tmpdir(), "studybook-pdf-")),
    "sample.pdf",
  );
  await run(process.execPath, [here("./fixtures/make-sample.mjs"), path]);
  return path;
}

test("add waits for the guide and ends with the reading URL", async () => {
  const pdf = await samplePdf();
  const { code, out, data } = await cli([
    "add",
    pdf,
    "--about",
    "A product manager.",
  ]);
  assert.equal(code, 0, out);
  const id = out.match(/Added sample\.pdf as ([a-z2-7]{10})/)?.[1];
  assert.ok(id, out);
  // The fake Claude is faster than the 1s poll, so only the ends are certain.
  assert.match(
    out,
    /\[sample\.pdf\] Starting\n[\s\S]*\[sample\.pdf\] Ready to study/,
  );
  assert.ok(
    out.includes(`Ready: A Sample Book http://127.0.0.1:4799/books/${id}`),
    out,
  );
  assert.match(out, /pnpm studybook serve/, "says how to start the reader");

  const status = await cli(["status", "--json"], { STUDYBOOK_DATA: data });
  assert.deepEqual(JSON.parse(status.out), [
    {
      id,
      title: "A Sample Book",
      status: "done",
      phase: "Ready to study",
      url: `http://127.0.0.1:4799/books/${id}`,
    },
  ]);
});

test("a failed book exits 1 and says how to retry", async () => {
  const pdf = await samplePdf();
  const { code, out } = await cli(["add", pdf], {
    STUDYBOOK_CLAUDE_COMMAND: "false",
  });
  assert.equal(code, 1);
  assert.match(out, /Retry with: pnpm studybook retry [a-z2-7]{10}/);
});

test("rejects a file that isn't a PDF", async () => {
  const { code, out } = await cli(["add", here("./cli.mjs")]);
  assert.equal(code, 1);
  assert.match(out, /isn't a PDF/);
});
