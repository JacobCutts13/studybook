import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { bookDir } from "@/lib/books";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dir = bookDir((await params).id);
  const path = dir && join(dir, "book.pdf");
  const info = path && (await stat(path).catch(() => null));
  if (!path || !info) return new Response("Not found", { status: 404 });
  return new Response(
    Readable.toWeb(createReadStream(path)) as ReadableStream,
    {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(info.size),
        "cache-control": "private, no-store",
      },
    },
  );
}
