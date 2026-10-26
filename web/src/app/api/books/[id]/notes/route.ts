import { join } from "node:path";
import { bookDir, readJson, writeJson } from "@/lib/books";
import { mergeNotes } from "../../../../../../../local/notes.mjs";

type Params = { params: Promise<{ id: string }> };
type Note = { id: string; updated: number; [key: string]: unknown };

// One write at a time, so two quick saves can't drop each other's notes.
let queue: Promise<unknown> = Promise.resolve();

export async function GET(_request: Request, { params }: Params) {
  const dir = bookDir((await params).id);
  if (!dir) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json((await readJson<Note[]>(join(dir, "notes.json"))) ?? []);
}

export async function PUT(request: Request, { params }: Params) {
  const dir = bookDir((await params).id);
  if (!dir) return Response.json({ error: "Not found" }, { status: 404 });
  const incoming = await request.json().catch(() => null);
  if (!Array.isArray(incoming))
    return Response.json({ error: "Send an array of notes." }, { status: 400 });
  const path = join(dir, "notes.json");
  const result = queue.then(async () => {
    const merged = mergeNotes((await readJson<Note[]>(path)) ?? [], incoming);
    await writeJson(path, merged);
    return merged;
  });
  queue = result.catch(() => undefined);
  return Response.json(await result);
}
