// Shared source API fixture. Imported only by the guarded isolated provider preload.
import { createHash } from "node:crypto";
const commit = "a".repeat(40),
  tree = "b".repeat(40);
const sources = {
  "package.json": JSON.stringify({ dependencies: { next: "16", pg: "8" } }),
  "src/app/page.tsx":
    "export default function Page() { return <h1>Source fixture</h1>; }",
  "src/app/api/inventory/route.ts":
    "import { Pool } from 'pg'; const db = new Pool(); export async function GET() { return db.query('select 1'); }",
};
const blobs = Object.entries(sources).map(([path, text]) => ({
  path,
  text,
  sha: createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex"),
}));
function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
export function canvasSourceFixture(url) {
  if (url.pathname === "/repositories/101")
    return json({
      id: 101,
      full_name: "fixture/wetscan-web",
      private: true,
      default_branch: "main",
    });
  if (url.pathname === "/repos/fixture/wetscan-web/commits/main")
    return json({ sha: commit, commit: { tree: { sha: tree } } });
  if (url.pathname === `/repos/fixture/wetscan-web/git/trees/${tree}`)
    return json({
      sha: tree,
      truncated: false,
      tree: blobs.map(({ path, text, sha }) => ({
        path,
        sha,
        size: Buffer.byteLength(text),
        type: "blob",
        mode: "100644",
      })),
    });
  const blob = blobs.find(
    (b) => url.pathname === `/repos/fixture/wetscan-web/git/blobs/${b.sha}`,
  );
  if (blob)
    return json({
      sha: blob.sha,
      size: Buffer.byteLength(blob.text),
      encoding: "base64",
      content: Buffer.from(blob.text).toString("base64"),
    });
}
