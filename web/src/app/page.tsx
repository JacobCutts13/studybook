"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { BookSummary } from "@/lib/books";

const ACTIVE = new Set(["queued", "working"]);

export default function Library() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/books");
    const data = await response.json();
    setBooks(data.books);
    return data as { profile: string; books: BookSummary[] };
  }, []);

  useEffect(() => {
    load().then((data) => setProfile(data.profile));
  }, [load]);

  const working = books?.some((book) => ACTIVE.has(book.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [working, load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/books", {
        method: "POST",
        body: new FormData(form),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      (form.elements.namedItem("pdf") as HTMLInputElement).value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    await fetch(`/api/books/${id}/retry`, { method: "POST" });
    await load();
  }

  return (
    <main>
      <h1>studybook</h1>
      <p className="lede">
        Turn a book PDF into a study guide: a preview, the real pages, and a
        scenario quiz for every chapter. Your own Claude Code login writes it,
        and everything stays on this computer.
      </p>

      <form className="card" onSubmit={upload}>
        <label htmlFor="pdf">Book PDF</label>
        <input
          id="pdf"
          name="pdf"
          type="file"
          accept="application/pdf"
          required
        />
        <label htmlFor="profile">About you</label>
        <textarea
          id="profile"
          name="profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
          placeholder="e.g. I’m a product manager at a B2B software company, working on onboarding and pricing."
        />
        <p className="hint">
          Quiz scenarios come from your work. Remembered for next time.
        </p>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Make study guide"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      <h2>Your books</h2>
      {books?.length === 0 && <p className="empty">No books yet.</p>}
      {books?.map((book) => (
        <section
          className="card book"
          key={book.id}
          aria-label={book.title ?? book.filename}
        >
          <div className="book-head">
            <p className="book-title">{book.title ?? book.filename}</p>
            {book.status === "done" && (
              <a className="btn" href={`/books/${book.id}`}>
                Study
              </a>
            )}
            {book.status === "error" && (
              <button
                className="btn quiet"
                type="button"
                onClick={() => retry(book.id)}
              >
                Retry
              </button>
            )}
          </div>
          <p className="phase" aria-live="polite">
            {book.phase}
            {book.message ? `. ${book.message}` : ""}
          </p>
          {book.chapters && book.status !== "done" && (
            <ul className="chips">
              {book.chapters.map((chapter) => (
                <li
                  key={chapter.id}
                  className={`chip ${chapter.status}`}
                  title={chapter.status}
                >
                  {chapter.label}
                </li>
              ))}
            </ul>
          )}
          {book.chapters
            ?.filter((chapter) => chapter.status === "failed")
            .map((chapter) => (
              <details key={chapter.id}>
                <summary>Why “{chapter.label}” failed</summary>
                <ul>
                  {chapter.errors?.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            ))}
        </section>
      ))}
    </main>
  );
}
