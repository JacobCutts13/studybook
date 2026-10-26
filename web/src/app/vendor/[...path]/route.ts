import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Serves pdf.js and the fonts from node_modules so the study page needs no CDN.
const require = createRequire(join(process.cwd(), "package.json"));
const root = (pkg: string) => dirname(require.resolve(`${pkg}/package.json`));
const TYPES: Record<string, string> = {
  js: "text/javascript",
  css: "text/css",
  woff2: "font/woff2",
  woff: "font/woff",
};

function resolveAsset(parts: string[]): string | null {
  if (parts.some((part) => part.startsWith(".") || part.includes("\\")))
    return null;
  if (parts.length === 1 && /^pdf(\.worker)?\.min\.js$/.test(parts[0]))
    return join(root("pdfjs-dist"), "build", parts[0]);
  const [kind, pkg, ...rest] = parts;
  if (
    kind === "fonts" &&
    (pkg === "instrument-sans" || pkg === "source-serif-4")
  )
    return join(root(`@fontsource/${pkg}`), ...rest);
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const parts = (await params).path;
  const file = resolveAsset(parts);
  const type = TYPES[parts.at(-1)?.split(".").pop() ?? ""];
  const body = file && type && (await readFile(file).catch(() => null));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
