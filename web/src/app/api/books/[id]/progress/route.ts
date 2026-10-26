import { join } from "node:path";
import { bookDir, readJson, writeJson } from "@/lib/books";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const dir = bookDir((await params).id);
  if (!dir) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(await readJson(join(dir, "progress.json")));
}

export async function PUT(request: Request, { params }: Params) {
  const dir = bookDir((await params).id);
  if (!dir) return Response.json({ error: "Not found" }, { status: 404 });
  const progress = await request.json().catch(() => null);
  if (!progress || typeof progress !== "object" || Array.isArray(progress))
    return Response.json({ error: "Send a progress object." }, { status: 400 });
  await writeJson(join(dir, "progress.json"), progress);
  return Response.json({ ok: true });
}
