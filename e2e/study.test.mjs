// Full flow in a real browser with outside network blocked: upload the sample
// book, let the worker finish (fake Claude), then study every chapter, take
// every quiz, highlight a passage and check it survives a reload.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repo = fileURLToPath(new URL("..", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let base;
let book;

async function freePort() {
  const probe = createServer().listen(0, "127.0.0.1");
  await new Promise((resolve) => probe.once("listening", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function until(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(500);
  }
}

before(async () => {
  const data = await mkdtemp(join(tmpdir(), "studybook-e2e-"));
  const pdf = join(data, "sample-book.pdf");
  execFileSync(process.execPath, [
    join(repo, "local/fixtures/make-sample.mjs"),
    pdf,
  ]);
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      join(repo, "web/node_modules/next/dist/bin/next"),
      "dev",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: join(repo, "web"),
      env: {
        ...process.env,
        STUDYBOOK_DATA: data,
        STUDYBOOK_CLAUDE_COMMAND: join(repo, "local/fake-claude.mjs"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  await until(
    async () => (await fetch(`${base}/api/books`)).ok,
    120_000,
    "the server",
  ).catch((error) => {
    throw new Error(`${error.message}\n${output}`);
  });

  const form = new FormData();
  form.append(
    "pdf",
    new Blob([await readFile(pdf)], { type: "application/pdf" }),
    "sample-book.pdf",
  );
  form.append("profile", "A product manager at a software company.");
  const { id } = await (
    await fetch(`${base}/api/books`, { method: "POST", body: form })
  ).json();
  await until(
    async () => {
      const { books } = await (await fetch(`${base}/api/books`)).json();
      const state = books.find((b) => b.id === id);
      if (state?.status === "error") throw new Error(state.message);
      return state?.status === "done";
    },
    60_000,
    "the study guide",
  );
  book = {
    id,
    ...JSON.parse(await readFile(join(data, "books", id, "book.json"), "utf8")),
  };
});

after(() => server?.kill());

test("study every chapter, take every quiz, keep a highlight", async () => {
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({ viewport: { width: 1100, height: 900 } })
  ).newPage();
  const problems = [];
  page.on("pageerror", (error) =>
    problems.push(`page error: ${error.message}`),
  );
  page.on("dialog", (dialog) => {
    problems.push(`unexpected dialog: ${dialog.message()}`);
    dialog.dismiss();
  });
  await page.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  try {
    // Landing: the particle book and the two ways in.
    await page.goto(base);
    await page.locator(".particle-book canvas").waitFor();
    await page.getByRole("link", { name: "Create" }).waitFor();
    await page.getByRole("link", { name: /^Library/ }).click();
    await page.waitForURL("**/library");
    // Exact, or it also matches the "← studybook" back link.
    await page
      .getByRole("link", { name: "Study", exact: true })
      .first()
      .click();
    await page.waitForURL(`**/books/${book.id}*`);
    await page.locator("#reader:not([hidden])").waitFor({ state: "attached" });

    for (const c of book.chapters) {
      const n = c.end - c.start + 1;
      await page.selectOption("#chapsel", String(c.id));
      await page.click('.tab[data-tab="preview"]');
      assert.ok(
        (await page.innerText("#pvsummary")).trim(),
        `${c.label}: preview`,
      );

      await page.click('.tab[data-tab="read"]');
      await page.waitForFunction(
        (text) =>
          document.getElementById("pageinfo").textContent.includes(text),
        `Page 1 of ${n} (book p. ${c.start})`,
      );
      for (let i = 1; i < n; i++) await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (text) =>
          document.getElementById("pageinfo").textContent.includes(text),
        `Page ${n} of ${n} (book p. ${c.end})`,
      );
      assert.match(
        await page.innerText("#nextp"),
        /quiz/i,
        `${c.label}: last-page button`,
      );

      await page.click('.tab[data-tab="quiz"]');
      while (!(await page.locator(".score").count())) {
        const answer = await page.evaluate(() => QUIZ[qi].o[QUIZ[qi].a]);
        await page.locator(".opt", { hasText: answer }).first().click();
        assert.equal(
          await page.locator(".opt.right").count(),
          1,
          `${c.label}: marked right`,
        );
        assert.equal(await page.locator(".opt.wrong").count(), 0);
        await page.click("#qnext");
      }
      assert.equal(
        await page.innerText(".score"),
        `${c.quiz.length}/${c.quiz.length}`,
      );
    }

    const c = book.chapters[1];
    await page.selectOption("#chapsel", String(c.id));
    await page.click('.tab[data-tab="read"]');
    await page.waitForFunction(
      () => document.getElementById("pdfcanvas").width > 0,
    );
    const box = await page.locator("#hl").boundingBox();
    await page.mouse.move(box.x + 100, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 600, box.y + 240, { steps: 5 });
    await page.mouse.up();
    await page.fill("#nmtext", "e2e note");
    await page.click("#nmsave");

    const notes = await until(
      async () => {
        const list = await (
          await fetch(`${base}/api/books/${book.id}/notes`)
        ).json();
        return list.length ? list : null;
      },
      5_000,
      "notes.json",
    );
    assert.equal(notes[0].comment, "e2e note");
    // The sidebar lists it beside the page, marked as on this page.
    await page
      .locator('.rn-item[aria-current="true"]', { hasText: "e2e note" })
      .waitFor();

    // Zooming in from fit width makes the page wider; Fit puts it back.
    const width = () =>
      page.evaluate(() => document.getElementById("pdfcanvas").clientWidth);
    const fitted = await width();
    await page.click("#zoomin");
    await page.waitForFunction(
      (w) => document.getElementById("pdfcanvas").clientWidth > w,
      fitted,
    );
    await page.click("#zoomfit");
    await page.waitForFunction(
      (w) => document.getElementById("pdfcanvas").clientWidth === w,
      fitted,
    );

    await page.click('.tab[data-tab="notes"]');
    await page.locator(".note canvas").first().waitFor();

    // Progress saves are debounced, so wait for the one covering every chapter.
    await until(
      async () => {
        const progress = await (
          await fetch(`${base}/api/books/${book.id}/progress`)
        ).json();
        return (
          Object.keys(progress?.doneBy ?? {}).length === book.chapters.length
        );
      },
      10_000,
      "progress.json to cover every chapter",
    );

    // A fresh browser has no localStorage: everything must come from the server.
    const fresh = await (await browser.newContext()).newPage();
    await fresh.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    await fresh.goto(`${base}/books/${book.id}#read`);
    await fresh.locator("#hl .hl").first().waitFor();
    assert.match(
      await fresh.locator(`.tab[data-tab="quiz"]`).getAttribute("class"),
      /done/,
    );
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
