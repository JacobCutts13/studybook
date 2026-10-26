"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookSummary } from "@/lib/books";

const ACTIVE = new Set(["queued", "working"]);

export default function Library() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/books");
    setBooks((await response.json()).books);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const working = books?.some((book) => ACTIVE.has(book.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [working, load]);

  async function retry(id: string) {
    await fetch(`/api/books/${id}/retry`, { method: "POST" });
    await load();
  }

  return (
    <main>
      <a className="back" href="/">
        <span className="arrow" aria-hidden="true">
          ←
        </span>
        studybook
      </a>
      <div className="page-head">
        <h1>Library</h1>
        <a className="btn" href="/create">
          Create
        </a>
      </div>
      {books?.length === 0 && (
        <div className="empty">
          <p className="empty-title">No books yet</p>
          <p>Create a study guide from a book PDF to see it here.</p>
        </div>
      )}
      {!!books?.length && (
        <ul className="books">
          {books.map((book) => (
            <li
              className="book"
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
