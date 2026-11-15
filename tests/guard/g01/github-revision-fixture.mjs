// Guard-only synthetic transport. Never loaded by the Live server or old Auth suite.
import "../../auth/github-existing-fixture.mjs";
if (
  process.env.WETSCAN_GUARD_REVISION_E2E !== "1" ||
  process.env.APP_URL !== "http://127.0.0.1:3109"
)
  throw new Error("Guard revision fixture requires its isolated server");
const upstream = globalThis.fetch;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    url.hostname === "api.github.com" &&
    url.pathname.startsWith("/repos/fixture/wetscan-web/")
  ) {
    if (url.pathname.includes("/branches/")) {
      const branch = decodeURIComponent(url.pathname.split("/branches/")[1]);
      if (!["main", "feature/security"].includes(branch))
        return json({ message: "Not Found" }, 404);
      return json({ name: branch, commit: { sha: "a".repeat(40) } });
    }
    const match = /\/commits\/([a-f0-9]{40})$/.exec(url.pathname);
    if (match)
      return json({ sha: match[1], commit: { tree: { sha: "b".repeat(40) } } });
    if (url.pathname.includes("/compare/")) {
      const base = url.pathname.split("/compare/")[1].split("...")[0];
      return json({
        status: base === "c".repeat(40) ? "ahead" : "diverged",
        base_commit: { sha: base },
        merge_base_commit: { sha: base },
      });
    }
  }
  return upstream(input, init);
};
