import { join, resolve } from "node:path";
import * as books from "../../../local/books.mjs";

export const REPO_ROOT = resolve(process.cwd(), "..");
const WORKER = join(REPO_ROOT, "local", "worker.mjs");

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
  studied: Record<string, number>;
};

export const { bookDir, isPdf, savedProfile } = books;
export const readJson = books.readJson as <T>(
  path: string,
) => Promise<T | null>;
export const writeJson = books.writeJson as (
  path: string,
  value: unknown,
) => Promise<void>;
export const readState = books.readState as (
  dir: string,
) => Promise<BookState | null>;
export const listBooks = books.listBooks as () => Promise<BookSummary[]>;
export const startWorker = (dir: string) => books.startWorker(dir, WORKER);
export const createBook = (pdf: Buffer, filename: string, profile: string) =>
  books.createBook({ pdf, filename, profile, worker: WORKER });

// The book as far as it's written. Until the worker finds the chapters, the
// whole PDF reads as one chapter (its end is filled in by the study page).
export async function readBook(id: string) {
  const dir = bookDir(id);
  if (!dir) return null;
  const book = await readJson<{ title: string }>(join(dir, "book.json"));
  if (book) return book;
  const job = await readJson<{ filename: string }>(join(dir, "job.json"));
  return (
    job && {
      title: job.filename.replace(/\.pdf$/i, ""),
      chapters: [{ id: -1, label: "Whole book", start: 1, end: 0 }],
    }
  );
}
