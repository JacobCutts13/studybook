"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookSummary } from "@/lib/books";
import { PlusIcon } from "../icons";

const ACTIVE = new Set(["queued", "working"]);
const STEPS = 3;
const OPEN_MS = 520;

// The library is a shelf: each book is a spine you can pull out. Its width
// follows the chapter count and its marks show progress, one per chapter:
// written chapters while Claude works, finished chapters once you study.
// Pulling a finished book turns it to its cover and opens it.

const title = (book: BookSummary) => book.title ?? book.filename;
const finished = (book: BookSummary) =>
  Object.values(book.studied ?? {}).filter((steps) => steps >= STEPS).length;

function summary(book: BookSummary) {
  const chapters = book.chapters?.length ?? 0;
  if (book.status === "done")
    return `${chapters} chapters · ${finished(book)} finished`;
  return `${book.phase}${book.message ? `. ${book.message}` : ""}`;
}

// A steady, slightly uneven height per book, so the shelf looks lived in.
function spineHeight(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 200 + (hash % 5) * 14;
}

function Spine({
  book,
  opening,
  onSelect,
  onOpen,
}: {
  book: BookSummary;
  opening: boolean;
  onSelect: () => void;
  onOpen: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const chapters = book.chapters ?? [];
  const style = {
    "--w": `${Math.min(64, 28 + chapters.length * 2.4)}px`,
    "--h": `${spineHeight(book.id)}px`,
  } as React.CSSProperties;
  const marks = (
    <span className="marks" aria-hidden="true">
      {chapters.map((chapter) => {
        const steps = book.studied?.[chapter.id] ?? 0;
        const state =
          book.status === "done"
            ? steps >= STEPS
              ? "full"
              : steps
                ? "part"
                : "none"
            : chapter.status === "done"
              ? "full"
              : chapter.status === "writing"
                ? "writing"
                : chapter.status === "failed"
                  ? "failed"
                  : "none";
        return <i key={chapter.id} data-state={state} />;
      })}
    </span>
  );
  const faces = (
    <>
      <span className="spine">
        <span className="spine-title">{title(book)}</span>
        {marks}
      </span>
      <span className="cover" aria-hidden="true">
        <span className="cover-title">{title(book)}</span>
      </span>
    </>
  );
  const props = {
    className: "volume",
    "data-status": book.status,
    "data-opening": opening || undefined,
    style,
    onMouseEnter: onSelect,
    onFocus: onSelect,
  };
  return book.status === "done" ? (
    <a
      {...props}
      href={`/books/${book.id}`}
      aria-label={`${title(book)}, ${summary(book)}`}
      onClick={onOpen}
    >
      {faces}
    </a>
  ) : (
    <button
      {...props}
      type="button"
      aria-label={`${title(book)}, ${summary(book)}`}
      onClick={onSelect}
    >
      {faces}
    </button>
  );
}

export default function Library() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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

  // Back from a book restores this page from cache, mid-animation.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setOpening(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function retry(id: string) {
    await fetch(`/api/books/${id}/retry`, { method: "POST" });
    await load();
  }

  function open(book: BookSummary, event: React.MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks open a new tab as usual.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    setSelected(book.id);
    setOpening(book.id);
    setTimeout(() => {
      location.href = href;
    }, OPEN_MS);
  }

  // Show the book you're pointing at; otherwise one that needs you, or the
  // newest.
  const detail =
    books?.find((book) => book.id === selected) ??
    books?.find((book) => book.status !== "done") ??
    books?.[0];

  return (
    <main className="library">
      <a className="back" href="/">
        <span className="arrow" aria-hidden="true">
          ←
        </span>
        studybook
      </a>
      <div className="page-head">
        <h1>Library</h1>
        <a className="btn" href="/create">
          <PlusIcon />
          Create
        </a>
      </div>
      {books && (
        <ul className="shelf" data-opening={opening ? true : undefined}>
          {books.map((book, index) => (
            <li
              key={book.id}
              style={{ "--i": index } as React.CSSProperties}
              data-selected={book.id === detail?.id || undefined}
            >
              <Spine
                book={book}
                opening={book.id === opening}
                onSelect={() => setSelected(book.id)}
                onOpen={(event) => open(book, event)}
              />
            </li>
          ))}
          <li style={{ "--i": books.length } as React.CSSProperties}>
            {/* The space at the end of the shelf is where the next book goes. */}
            <a
              className="volume ghost"
              href="/create"
              aria-label="New study guide"
            >
              <span className="spine">
                <PlusIcon />
              </span>
            </a>
          </li>
        </ul>
      )}
      {books?.length === 0 && (
        <div className="empty">
          <p className="empty-title">Your shelf is empty</p>
          <p>Create a study guide from a book PDF and it’ll stand here.</p>
        </div>
      )}
      {detail && (
        <section
          className="shelf-detail"
          aria-label="Selected book"
          aria-live="polite"
        >
          <div className="detail-head">
            <div>
              <p className="book-title">{title(detail)}</p>
              <p className="phase">{summary(detail)}</p>
            </div>
            {detail.status === "done" && (
              <a
                className="btn"
                href={`/books/${detail.id}`}
                onClick={(event) => open(detail, event)}
              >
                Study
              </a>
            )}
            {detail.status === "error" && (
              <button
                className="btn quiet"
                type="button"
                onClick={() => retry(detail.id)}
              >
                Retry
              </button>
            )}
          </div>
          {detail.chapters && detail.status !== "done" && (
            <ul className="chips">
              {detail.chapters.map((chapter) => (
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
          {detail.chapters
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
      )}
    </main>
  );
}
