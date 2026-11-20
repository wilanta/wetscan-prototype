// Operates only its own sanitized loopback test server. No Auth, APIs or external requests.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3119",
  ],
  {
    env: { ...process.env, WETSCAN_LOCAL_DEMO: "1" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Production test server readiness timeout")),
      20000,
    );
    const finish = (error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    child.once("error", finish);
    child.once("exit", () => finish(Error("Production test server exited")));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Ready")) finish();
    });
    child.stderr.resume();
  });
  const response = await fetch("http://127.0.0.1:3119/local-demo/guard", {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  const html = await response.text();
  if (
    response.status !== 307 ||
    response.headers.get("location") !== "/app/projects/orderly-demo/guard" ||
    html.includes("<h1>WetScan Guard")
  )
    throw Error("Production demo route not refused");
  const guarded = await fetch(
    "http://127.0.0.1:3119/app/projects/orderly-demo/guard",
    { redirect: "manual", signal: AbortSignal.timeout(10000) },
  );
  if (
    guarded.status !== 307 ||
    !new URL(
      guarded.headers.get("location"),
      "http://127.0.0.1:3119",
    ).pathname.startsWith("/login")
  )
    throw Error("Existing app authentication not enforced");
  const liveSections = [
    "",
    "/scans",
    "/findings",
    "/integrity",
    "/remediation",
    "/releases",
  ];
  for (const section of liveSections) {
    const response = await fetch(
      "http://127.0.0.1:3119/app/projects/github-101/guard" + section,
      { redirect: "manual", signal: AbortSignal.timeout(10000) },
    );
    if (
      response.status !== 307 ||
      !new URL(
        response.headers.get("location"),
        "http://127.0.0.1:3119",
      ).pathname.startsWith("/login")
    )
      throw Error("Live route authentication not enforced");
  }
  const liveApi = await fetch(
    "http://127.0.0.1:3119/api/guard/projects/github-101/readiness",
    { redirect: "manual", signal: AbortSignal.timeout(10000) },
  );
  if (liveApi.status !== 401)
    throw Error("Live API authentication not enforced");
  let traces = 0,
    excludedReferences = 0;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (entry.name.endsWith(".nft.json")) {
        traces++;
        const trace = JSON.parse(await readFile(file, "utf8"));
        excludedReferences += (trace.files ?? []).filter(
          (name) =>
            !name.includes("node_modules") &&
            /(?:^|[\\/])(?:\.env(?:[.\\/]|$)|\.local[\\/])/i.test(name),
        ).length;
      }
    }
  }
  await inspect(".next/server");
  if (!traces || excludedReferences)
    throw Error("Build tracing exclusion check failed");
  console.log(
    JSON.stringify({
      classification: "LOCAL_PRODUCTION_BOUNDARY_SMOKE",
      flagEnabled: true,
      legacyHttpStatus: response.status,
      canonicalAuthHttpStatus: guarded.status,
      liveRoutesProtected: liveSections.length,
      liveApiHttpStatus: liveApi.status,
      traces,
      excludedReferences,
      database: "NOT_CONNECTED",
      scanner: "NOT_RUN",
    }),
  );
} finally {
  if (child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill();
    await ended;
  }
}
