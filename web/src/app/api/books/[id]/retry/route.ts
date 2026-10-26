import { bookDir, readState, startWorker } from "@/lib/books";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dir = bookDir((await params).id);
  const state = dir && (await readState(dir));
  if (!dir || !state)
    return Response.json({ error: "Not found" }, { status: 404 });
  if (state.status !== "error")
    return Response.json(
      { error: "This book isn’t stopped." },
      { status: 409 },
    );
  startWorker(dir);
  return Response.json({ ok: true });
}
