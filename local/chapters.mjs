const HEADING =
  /\b(CHAPTER|Chapter \w+|PART|Part \w+|Introduction|Conclusion|Contents|Appendix|Acknowledg|Epilogue|Prologue|Foreword|Preface|Index)\b/;
const NOISE = /^(\d+|[ivxlc]+|\/)$/i;

// Pages whose first lines look like a heading: hints for Claude's outline pass.
export function chapterCandidates(pages) {
  const candidates = [];
  pages.forEach((lines, index) => {
    const head = lines
      .filter((line) => !NOISE.test(line))
      .slice(0, 3)
      .join(" | ");
    if (HEADING.test(head))
      candidates.push({ page: index + 1, head: head.slice(0, 90) });
  });
  return candidates;
}
