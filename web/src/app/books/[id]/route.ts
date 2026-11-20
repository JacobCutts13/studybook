import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT, readBook } from "@/lib/books";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  const book = await readBook(id);
  if (!book) return new Response("Not found", { status: 404 });
  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const template = await readFile(
    join(REPO_ROOT, "web", "study", "template.html"),
    "utf8",
  );
  const html = template
    .replaceAll("__BOOK_TITLE__", escapeHtml(book.title))
    .replaceAll("__SLUG__", `studybook-${id}`)
    .replaceAll("__BOOK_ID__", id)
    .replace("/*__BOOK_JSON__*/null", () =>
      JSON.stringify(book).replace(/</g, "\\u003c"),
    );
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
