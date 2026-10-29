import { createBook, isPdf, listBooks, savedProfile } from "@/lib/books";

const MAX_BYTES = 300 * 1024 * 1024;

export async function GET() {
  return Response.json({ books: await listBooks() });
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
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Choose a PDF to upload." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: "That PDF is over 300 MB." },
      { status: 413 },
    );
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!isPdf(pdf))
    return Response.json({ error: "That file isn’t a PDF." }, { status: 400 });
  // Quizzes are tailored with the "about" an agent last gave `studybook add`.
  const id = await createBook(
    pdf,
    file.name.slice(0, 200),
    await savedProfile(),
  );
  return Response.json({ id }, { status: 201 });
}
