// Creating, listing and resuming books. Shared by the web API and the CLI.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DATA_DIR = resolve(
  process.env.STUDYBOOK_DATA ?? join(homedir(), ".studybook"),
);
export const PORT = Number(process.env.STUDYBOOK_PORT) || 4747;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
const BOOKS_DIR = join(DATA_DIR, "books");
const ID = /^[a-z2-7]{10}$/;

// Returns the folder for a book id, or null if the id isn't one of ours.
export function bookDir(id) {
  return ID.test(id) ? join(BOOKS_DIR, id) : null;
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 1));
  await rename(temporary, path);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readState(dir) {
  const state = await readJson(join(dir, "state.json"));
  // A worker that died (reboot, crash) can't update its own state.
  if (state?.status === "working" && state.pid && !isAlive(state.pid))
    return {
      ...state,
      status: "error",
      phase: "Stopped",
      message: "The worker stopped unexpectedly. Retry to carry on.",
    };
  return state;
}

export async function listBooks() {
  let ids;
  try {
    ids = (await readdir(BOOKS_DIR)).filter((id) => ID.test(id));
  } catch {
    return [];
  }
  const books = await Promise.all(
    ids.map(async (id) => {
      const dir = join(BOOKS_DIR, id);
      const [state, job, progress] = await Promise.all([
        readState(dir),
        readJson(join(dir, "job.json")),
        readJson(join(dir, "progress.json")),
      ]);
      // How many study steps (preview, read, quiz) each chapter has done.
      const studied = Object.fromEntries(
        Object.entries(progress?.doneBy ?? {}).map(([chapter, steps]) => [
          chapter,
          Object.values(steps).filter(Boolean).length,
        ]),
      );
      return state && job
        ? {
            ...state,
            id,
            filename: job.filename,
            createdAt: job.createdAt,
            studied,
          }
        : null;
    }),
  );
  return books
    .filter((book) => book !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savedProfile() {
  return (await readJson(join(DATA_DIR, "profile.json")))?.profile ?? "";
}

export function isPdf(bytes) {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

// `worker` is the path to local/worker.mjs, passed in because the web app and
// the CLI find it differently.
export async function createBook({ pdf, filename, profile, worker }) {
  const id = Array.from(
    randomBytes(10),
    (byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32],
  ).join("");
  const dir = join(BOOKS_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "book.pdf"), pdf);
  await writeJson(join(dir, "job.json"), {
    filename,
    profile,
    createdAt: new Date().toISOString(),
  });
  await writeJson(join(dir, "state.json"), {
    status: "queued",
    phase: "Starting",
    updatedAt: new Date().toISOString(),
  });
  await writeJson(join(DATA_DIR, "profile.json"), { profile });
  startWorker(dir, worker);
  return id;
}

export function startWorker(dir, worker) {
  spawn(process.execPath, [worker, dir], {
    cwd: dir,
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref();
}
