#!/usr/bin/env node
// studybook from the command line, for people and agents alike. Every command
// prints plain progress lines and ends with a URL or a clear error.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  BASE_URL,
  bookDir,
  createBook,
  isPdf,
  listBooks,
  PORT,
  readState,
  savedProfile,
  startWorker,
} from "./books.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "worker.mjs");
const USAGE = `Usage: pnpm studybook <command>

  add <pdf...> [--about "what you do"]   Make study guides and wait for them
  wait <id>                              Follow a book that's being written
  retry <id>                             Resume a stopped book
  status [--json]                        List books
  serve                                  Start the reader at ${BASE_URL}

Add --no-wait to add or retry to return straight away. Set STUDYBOOK_MODEL=sonnet to use less of your plan.`;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const studyUrl = (id) => `${BASE_URL}/books/${id}`;

async function serverUp() {
  try {
    return (await fetch(`${BASE_URL}/api/books`)).ok;
  } catch {
    return false;
  }
}

// Prints a line whenever the phase changes; resolves with the final state.
async function follow(id, label) {
  const dir = id && bookDir(id);
  if (!dir) throw new Error(`No book with id ${id}.`);
  let last = "";
  for (;;) {
    const state = await readState(dir);
    if (!state) throw new Error(`No book with id ${id}.`);
    const line = `${state.phase}${state.message ? `. ${state.message}` : ""}`;
    if (line !== last) {
      console.log(`[${label}] ${line}`);
      last = line;
    }
    if (state.status === "done" || state.status === "error") return state;
    await sleep(1000);
  }
}

async function report(id, state) {
  if (state.status === "error") {
    for (const c of state.chapters ?? [])
      if (c.status === "failed")
        console.log(`  ${c.label}: ${(c.errors ?? []).join("; ")}`);
    console.log(`Stopped. Retry with: pnpm studybook retry ${id}`);
    return false;
  }
  console.log(`Ready: ${state.title} ${studyUrl(id)}`);
  if (!(await serverUp()))
    console.log(
      "The reader isn't running. Start it with: pnpm studybook serve",
    );
  return true;
}

async function add(paths, about, wait) {
  if (!paths.length) throw new Error("Give at least one PDF path.");
  const profile = about ?? (await savedProfile());
  const ids = [];
  for (const path of paths) {
    const pdf = await readFile(resolve(path));
    if (!isPdf(pdf)) throw new Error(`${path} isn't a PDF.`);
    const id = await createBook({
      pdf,
      filename: basename(path),
      profile,
      worker: WORKER,
    });
    console.log(`Added ${basename(path)} as ${id}`);
    ids.push([id, basename(path)]);
  }
  if (!wait) return true;
  let ok = true;
  for (const [id, label] of ids)
    ok = (await report(id, await follow(id, label))) && ok;
  return ok;
}

async function retry(id, wait) {
  const dir = id && bookDir(id);
  const state = dir && (await readState(dir));
  if (!state) throw new Error(`No book with id ${id}.`);
  if (state.status === "done") return report(id, state);
  if (state.status !== "error")
    throw new Error(
      `${id} is still being written. Follow it with: pnpm studybook wait ${id}`,
    );
  startWorker(dir, WORKER);
  await sleep(500);
  return wait ? report(id, await follow(id, id)) : true;
}

async function status(json) {
  const books = await listBooks();
  if (json) {
    console.log(
      JSON.stringify(
        books.map((b) => ({
          id: b.id,
          title: b.title ?? b.filename,
          status: b.status,
          phase: b.phase,
          url: b.status === "done" ? studyUrl(b.id) : null,
        })),
        null,
        2,
      ),
    );
    return true;
  }
  if (!books.length) console.log("No books yet.");
  for (const b of books)
    console.log(
      `${b.id}  ${b.status.padEnd(7)}  ${b.title ?? b.filename}  ${b.status === "done" ? studyUrl(b.id) : b.phase}`,
    );
  return true;
}

async function serve() {
  if (await serverUp()) {
    console.log(`Already running at ${BASE_URL}`);
    return true;
  }
  const next = join(
    HERE,
    "..",
    "web",
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const child = spawn(
    process.execPath,
    [next, "dev", "-H", "127.0.0.1", "-p", String(PORT)],
    {
      cwd: join(HERE, "..", "web"),
      stdio: "inherit",
    },
  );
  for (let i = 0; i < 120 && !(await serverUp()); i++) await sleep(500);
  console.log(`studybook is running at ${BASE_URL}`);
  await new Promise((done) => child.once("exit", done));
  return true;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    about: { type: "string" },
    json: { type: "boolean" },
    "no-wait": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
const [command, ...rest] = positionals;
const wait = !values["no-wait"];
const COMMANDS = {
  add: () => add(rest, values.about, wait),
  wait: async () => report(rest[0], await follow(rest[0], rest[0])),
  retry: () => retry(rest[0], wait),
  status: () => status(values.json),
  serve,
};
try {
  const run = COMMANDS[command];
  if (!run) console.log(USAGE);
  const ok = run ? await run() : !command || values.help;
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
