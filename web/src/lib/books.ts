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
