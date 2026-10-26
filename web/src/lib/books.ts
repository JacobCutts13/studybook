import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO_ROOT = resolve(process.cwd(), "..");
export const DATA_DIR = resolve(
  process.env.STUDYBOOK_DATA ?? join(homedir(), ".studybook"),
);
const BOOKS_DIR = join(DATA_DIR, "books");
const ID = /^[a-z2-7]{10}$/;

export type ChapterState = {
  id: number;
  label: string;
  status: "waiting" | "writing" | "done" | "failed";
  errors?: string[];
};

export type BookState = {
  status: "queued" | "working" | "done" | "error";
  phase: string;
  title?: string;
  chapters?: ChapterState[];
  message?: string;
  pid?: number;
  updatedAt: string;
};

export type BookSummary = BookState & {
  id: string;
  filename: string;
  createdAt: string;
};

// Returns the folder for a book id, or null if the id isn't one of ours.
export function bookDir(id: string): string | null {
  return ID.test(id) ? join(BOOKS_DIR, id) : null;
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 1));
  await rename(temporary, path);
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readState(dir: string): Promise<BookState | null> {
  const state = await readJson<BookState>(join(dir, "state.json"));
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

export async function listBooks(): Promise<BookSummary[]> {
  let ids: string[];
  try {
    ids = (await readdir(BOOKS_DIR)).filter((id) => ID.test(id));
  } catch {
    return [];
  }
  const books = await Promise.all(
    ids.map(async (id) => {
      const dir = join(BOOKS_DIR, id);
      const [state, job] = await Promise.all([
        readState(dir),
        readJson<{ filename: string; createdAt: string }>(
          join(dir, "job.json"),
        ),
      ]);
      return state && job ? { ...state, ...job, id } : null;
    }),
  );
  return books
    .filter((book): book is BookSummary => book !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBook(
  pdf: Buffer,
  filename: string,
  profile: string,
) {
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
  startWorker(dir);
  return id;
}

export function startWorker(dir: string) {
  spawn(process.execPath, [join(REPO_ROOT, "local", "worker.mjs"), dir], {
    cwd: dir,
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref();
}
