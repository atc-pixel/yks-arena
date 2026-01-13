import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  // Some browsers still request `/favicon.ico` specifically.
  // We serve the existing App Router icon as a response to avoid 404 noise.
  const iconPath = path.join(process.cwd(), "src", "app", "icon.png");
  const bytes = await readFile(iconPath);

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

