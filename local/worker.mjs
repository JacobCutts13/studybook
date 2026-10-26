// Turns one uploaded book folder into book.json. Safe to re-run: finished
// outline and chapter files are kept, so a retry only redoes what failed.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chapterCandidates } from "./chapters.mjs";
import { cleanPages, readPageLines } from "./pdf.mjs";
import { chapterPrompt, outlinePrompt } from "./prompts.mjs";
import {
  smartQuotes,
  validateChapter,
  validateOutline,
  wordRuns,
} from "./validate.mjs";

const ATTEMPTS = 3;
const dir = process.argv[2];
if (!dir) throw new Error("Usage: worker.mjs <book folder>");
const job = JSON.parse(await readFile(join(dir, "job.json"), "utf8"));
const log = createWriteStream(join(dir, "claude.log"), { flags: "a" });
const statePath = join(dir, "state.json");

let state = {};
let writing = Promise.resolve();
function update(patch) {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  const snapshot = JSON.stringify(state, null, 2);
  writing = writing.then(async () => {
    await writeFile(`${statePath}.tmp`, snapshot);
    await rename(`${statePath}.tmp`, statePath);
  });
  return writing;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(join(dir, file), "utf8"));
  } catch {
    return null;
  }
}

function runClaude(prompt) {
  const args = [
    "-p",
    prompt,
    "--model",
    process.env.STUDYBOOK_MODEL ?? "opus",
    // Only file tools, and only inside this book's folder.
    "--tools",
    "Read,Write",
    "--allowedTools",
    "Read(./**)",
    "Edit(./**)",
    "--permission-mode",
    "dontAsk",
    // Keep the user's own MCP servers, hooks, skills and history out of it.
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--output-format",
    "json",
  ];
  const child = spawn(process.env.STUDYBOOK_CLAUDE_COMMAND ?? "claude", args, {
    cwd: dir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Claude Code exited with status ${code}. See claude.log.`,
            ),
          ),
    );
  });
}

// Runs Claude until the file it writes passes `check`, feeding errors back.
async function produce(file, makePrompt, check) {
  let errors = check(await readJson(file));
  for (let attempt = 0; errors.length && attempt < ATTEMPTS; attempt++) {
    await runClaude(makePrompt(attempt ? errors : undefined));
    errors = check(await readJson(file));
  }
  return errors;
}

try {
  state = (await readJson("state.json")) ?? {};
  update({
    status: "working",
    phase: "Reading the PDF",
    message: undefined,
    pid: process.pid,
  });
  const pages = cleanPages(await readPageLines(join(dir, "book.pdf")));
  await mkdir(join(dir, "pages"), { recursive: true });
  await mkdir(join(dir, "chapters"), { recursive: true });
  await Promise.all(
    pages.map((lines, i) =>
      writeFile(
        join(dir, "pages", `p${String(i + 1).padStart(4, "0")}.txt`),
        lines.join("\n"),
      ),
    ),
  );
  await writeFile(
    join(dir, "candidates.json"),
    JSON.stringify(chapterCandidates(pages), null, 1),
  );
  const runs = wordRuns(pages);

  update({ phase: "Finding the chapters" });
  const outlineErrors = await produce(
    "outline.json",
    (retryErrors) =>
      outlinePrompt({
        numPages: pages.length,
        filename: job.filename,
        retryErrors,
      }),
    (outline) =>
      outline
        ? validateOutline(outline, pages.length)
        : ["outline.json is missing or not valid JSON"],
  );
  if (outlineErrors.length)
    throw new Error(`Couldn’t find the chapters: ${outlineErrors.join("; ")}`);
  const outline = await readJson("outline.json");

  const chapters = outline.chapters.map((c) => ({
    id: c.id,
    label: c.label,
    status: "waiting",
  }));
  const setChapter = (id, patch) => {
    const i = chapters.findIndex((c) => c.id === id);
    chapters[i] = { ...chapters[i], ...patch };
    const done = chapters.filter((c) => c.status === "done").length;
    return update({
      title: outline.title,
      chapters: [...chapters],
      phase: `Writing chapters (${done} of ${chapters.length} done)`,
    });
  };
  await update({ title: outline.title, chapters });

  const queue = [...outline.chapters];
  const concurrency = Number(process.env.STUDYBOOK_CONCURRENCY) || 2;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let chapter = queue.shift(); chapter; chapter = queue.shift()) {
        const file = `chapters/${chapter.id}.json`;
        await setChapter(chapter.id, { status: "writing" });
        try {
          const errors = await produce(
            file,
            (retryErrors) =>
              chapterPrompt({ chapter, profile: job.profile, retryErrors }),
            (content) =>
              content
                ? validateChapter(content, runs)
                : [`${file} is missing or not valid JSON`],
          );
          await setChapter(
            chapter.id,
            errors.length
              ? { status: "failed", errors }
              : { status: "done", errors: undefined },
          );
        } catch (error) {
          await setChapter(chapter.id, {
            status: "failed",
            errors: [String(error.message ?? error)],
          });
        }
      }
    }),
  );

  const failed = chapters.filter((c) => c.status === "failed");
  if (failed.length)
    throw new Error(
      `${failed.length} chapter${failed.length > 1 ? "s" : ""} couldn’t be written. Retry to redo only those.`,
    );

  // summary and e are shown as HTML, and Claude wrote them from untrusted
  // book text, so escape them and allow only <mark>.
  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const quote = (content) => ({
    summary: escapeHtml(smartQuotes(content.summary)).replace(
      /&lt;(\/?)mark&gt;/g,
      "<$1mark>",
    ),
    think: content.think.map(smartQuotes),
    quiz: content.quiz.map((q) => ({
      p: smartQuotes(q.p),
      o: q.o.map(smartQuotes),
      a: q.a,
      e: escapeHtml(smartQuotes(q.e)),
    })),
  });
  const book = {
    title: outline.title,
    numPages: pages.length,
    chapters: await Promise.all(
      outline.chapters.map(async (c) => ({
        id: c.id,
        label: c.label,
        start: c.start,
        end: c.end,
        ...quote(await readJson(`chapters/${c.id}.json`)),
      })),
    ),
  };
  await writeFile(join(dir, "book.json"), JSON.stringify(book, null, 1));
  await update({ status: "done", phase: "Ready to study" });
} catch (error) {
  await update({
    status: "error",
    phase: "Stopped",
    message: error instanceof Error ? error.message : String(error),
  });
} finally {
  await writing;
  log.end();
}
