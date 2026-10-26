// Checks Claude's output before it reaches the study page.

const words = (text) =>
  text
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .match(/[a-z']+/g) ?? [];

// All 10-word runs in the book, for the copied-wording check.
export function wordRuns(pages) {
  const all = words(pages.map((lines) => lines.join(" ")).join(" "));
  const runs = new Set();
  for (let i = 0; i + 10 <= all.length; i++)
    runs.add(all.slice(i, i + 10).join(" "));
  return runs;
}

// Straight quotes are fixed rather than sent back to Claude.
export function smartQuotes(text) {
  return text
    .replace(/(^|[\s([{“-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{“-])'/g, "$1‘")
    .replace(/'/g, "’");
}

export function chapterTexts(chapter) {
  return [
    chapter.summary,
    ...(chapter.think ?? []),
    ...(chapter.quiz ?? []).flatMap((q) => [q.p, q.e, ...(q.o ?? [])]),
  ].filter((text) => typeof text === "string");
}

export function validateOutline(outline, numPages) {
  const errors = [];
  const chapters = outline?.chapters;
  if (!outline?.title) errors.push("missing title");
  if (!Array.isArray(chapters) || chapters.length === 0)
    return [...errors, "outline needs a non-empty chapters array"];
  const ids = chapters.map((c) => c.id);
  if (!ids.every(Number.isInteger) || new Set(ids).size !== ids.length)
    errors.push("chapter ids must be unique integers");
  let previousEnd = 0;
  for (const c of [...chapters].sort((a, b) => a.start - b.start)) {
    const tag = `chapter ${c.id} (${c.label})`;
    if (!c.label) errors.push(`${tag}: missing label`);
    if (
      !Number.isInteger(c.start) ||
      !Number.isInteger(c.end) ||
      c.start < 1 ||
      c.end < c.start ||
      c.end > numPages
    )
      errors.push(`${tag}: range ${c.start}-${c.end} outside 1-${numPages}`);
    else if (c.start <= previousEnd)
      errors.push(`${tag}: overlaps the previous chapter`);
    else previousEnd = c.end;
  }
  return errors;
}

export function validateChapter(chapter, runs) {
  const errors = [];
  if (
    typeof chapter?.summary !== "string" ||
    !chapter.summary.includes("<mark>")
  )
    errors.push(
      "summary must be one sentence with one <mark>key phrase</mark>",
    );
  if (!Array.isArray(chapter?.think) || chapter.think.length !== 2)
    errors.push("think must have exactly 2 questions");
  const quiz = chapter?.quiz;
  if (!Array.isArray(quiz) || quiz.length < 4 || quiz.length > 8)
    errors.push("quiz must have 4-8 questions");
  else {
    if (new Set(quiz.map((q) => q.p)).size !== quiz.length)
      errors.push("quiz has duplicate questions");
    quiz.forEach((q, i) => {
      const ok =
        typeof q.p === "string" &&
        q.p &&
        typeof q.e === "string" &&
        q.e &&
        Array.isArray(q.o) &&
        q.o.length === 4 &&
        q.o.every((o) => typeof o === "string" && o) &&
        Number.isInteger(q.a) &&
        q.a >= 0 &&
        q.a < 4;
      if (!ok)
        errors.push(
          `quiz question ${i + 1}: needs p, 4 options in o, a in 0-3, and e`,
        );
    });
  }
  for (const text of chapterTexts(chapter ?? {})) {
    const w = words(text);
    for (let i = 0; i + 10 <= w.length; i++) {
      const run = w.slice(i, i + 10).join(" ");
      if (runs.has(run)) {
        errors.push(
          `10+ words match the book: "${run}". Rewrite it in your own words.`,
        );
        break;
      }
    }
  }
  return errors;
}
