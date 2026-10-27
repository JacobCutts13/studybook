"use client";

import { useEffect, useState } from "react";
import { ParticleBook } from "./particle-book";

export default function Landing() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/books")
      .then((response) => response.json())
      .then((data) => setCount(data.books.length))
      .catch(() => setCount(null));
  }, []);

  return (
    <main className="hero">
      <ParticleBook libraryCount={count} />
      <div className="hero-copy">
        <h1>studybook</h1>
        <p className="hero-lede">
          Turn a book PDF into a study guide: a preview, the real pages, and a
          scenario quiz for every chapter. Written by your own Claude Code, kept
          on this computer.
        </p>
      </div>
    </main>
  );
}
