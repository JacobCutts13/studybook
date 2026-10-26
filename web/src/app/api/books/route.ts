import { join } from "node:path";
import { createBook, DATA_DIR, listBooks, readJson } from "@/lib/books";

const MAX_BYTES = 300 * 1024 * 1024;

export async function GET() {
  const saved = await readJson<{ profile: string }>(
    join(DATA_DIR, "profile.json"),
  );
  return Response.json({
    profile: saved?.profile ?? "",
    books: await listBooks(),
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Send the PDF as a form upload." },
      { status: 400 },
    );
  }
  const file = form.get("pdf");
  const profile = String(form.get("profile") ?? "")
    .trim()
    .slice(0, 2000);
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Choose a PDF to upload." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: "That PDF is over 300 MB." },
      { status: 413 },
    );
  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-")
    return Response.json({ error: "That file isn’t a PDF." }, { status: 400 });
  const id = await createBook(pdf, file.name.slice(0, 200), profile);
  return Response.json({ id }, { status: 201 });
}
