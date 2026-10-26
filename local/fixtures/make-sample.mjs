// Writes a short invented book used by tests (default: local/fixtures/sample-book.pdf).
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";

const SECTIONS = [
  [
    "Contents",
    [
      "Introduction 2",
      "Chapter One: Small Bets 4",
      "Chapter Two: Honest Signals 6",
      "Conclusion 8",
    ],
  ],
  [
    "Introduction",
    [
      "Teams rarely fail for lack of effort. They fail because they keep",
      "pushing on a plan long after the evidence has turned against it.",
      "This short sample exists only to exercise the studybook pipeline.",
    ],
  ],
  [
    "Chapter One: Small Bets",
    [
      "Split a large plan into pieces that each answer one question quickly.",
      "Before starting a piece, write down the result that would make you stop.",
      "A bet that cannot lose teaches nothing about the world around it.",
    ],
  ],
  [
    "Chapter Two: Honest Signals",
    [
      "Prefer measures that are hard to game over measures that feel good.",
      "Ask customers what they did last week, not what they might do next year.",
      "When a signal moves, look for the cheapest experiment that explains it.",
    ],
  ],
  [
    "Conclusion",
    [
      "Small, honest checks compound. The habit matters more than any tool.",
      "Pick one plan this week and decide what result would end it early.",
    ],
  ],
];

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
let pageNumber = 0;
for (const [title, lines] of SECTIONS) {
  const pages = title === "Contents" ? 1 : 2;
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([420, 595]);
    pageNumber++;
    page.drawText("A Sample Book", { x: 40, y: 560, size: 8, font });
    if (i === 0) page.drawText(title, { x: 40, y: 510, size: 18, font });
    const body = i === 0 ? lines : lines.map((line) => `(continued) ${line}`);
    body.forEach((line, n) => {
      page.drawText(line, { x: 40, y: 470 - n * 18, size: 9, font });
    });
    page.drawText(String(pageNumber), { x: 205, y: 30, size: 8, font });
  }
}
const out =
  process.argv[2] ?? new URL("./sample-book.pdf", import.meta.url).pathname;
await writeFile(out, await doc.save());
console.log(`wrote ${out} (${pageNumber} pages)`);
