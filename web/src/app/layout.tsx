import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "studybook",
  description: "Turn a book PDF into a study guide with your own Claude Code.",
};

const FONTS = [
  "instrument-sans/latin-400.css",
  "instrument-sans/latin-600.css",
  "source-serif-4/latin-400.css",
  "source-serif-4/latin-600.css",
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {FONTS.map((font) => (
          <link key={font} rel="stylesheet" href={`/vendor/fonts/${font}`} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
