import { readBook } from "@/lib/books";

// The study page polls this while Claude is still writing the book.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const book = await readBook((await params).id);
  return book
    ? Response.json(book, { headers: { "cache-control": "no-store" } })
    : new Response("Not found", { status: 404 });
}
