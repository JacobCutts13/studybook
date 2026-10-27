import type { Metadata } from "next";
import "./globals.css";
import { Starfield } from "./starfield";

export const metadata: Metadata = {
  title: "studybook",
  description: "Turn a book PDF into a study guide with your own Claude Code.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/vendor/fonts/inter/index.css" />
      </head>
      <body>
        <Starfield />
        {children}
      </body>
    </html>
  );
}
