// Test-only GitHub substitute for the G04 browser server (extends the existing Guard fixture). Never loaded by the Live server.
import "../../g01/github-revision-fixture.mjs";
if (process.env.WETSCAN_GUARD_G04_E2E !== "1" || process.env.APP_URL !== "http://127.0.0.1:3109") throw new Error("G04 browser fixture requires its isolated server");
const upstream = globalThis.fetch;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.github.com") {
    if (/^\/app\/installations\/77\/access_tokens$/.test(url.pathname)) {
      const body = JSON.parse(init?.body ?? "{}");
      if (body.permissions?.checks === "write")
        return json({ token: "fixture-checks", expires_at: new Date(Date.now() + 3600000).toISOString(), permissions: { checks: "write", metadata: "read" }, repository_selection: "selected" }, 201);
    }
    if (url.pathname === "/repositories/101") return json({ id: 101, full_name: "fixture/wetscan-web" });
    if (/^\/repos\/fixture\/wetscan-web\/commits\/[a-f0-9]{40}\/check-runs$/.test(url.pathname)) return json({ check_runs: [] });
    if (url.pathname === "/repos/fixture/wetscan-web/check-runs" && init?.method === "POST") return json({ id: 9001, html_url: "https://github.com/fixture/wetscan-web/runs/9001" }, 201);
    if (/^\/repos\/fixture\/wetscan-web\/(rules\/branches|branches\/[^/]+\/protection)/.test(url.pathname)) return json([]);
  }
  return upstream(input, init);
};
