/**
 * Reproducible build of the G02 scanner image. Public, checksum-verified components only:
 * no owner source, credentials or repository access. Output stays under ignored .local/g02-install.
 * Usage: node --import tsx worker/guard/installation/build-context.ts .local/g02-install
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, relative } from "node:path";

const root = resolve(process.argv[2] ?? "");
if (!root.replaceAll("\\", "/").endsWith("/.local/g02-install")) throw Error("installation_root_required");
const BASE = "python:3.13-slim-bookworm";
const here = dirname(fileURLToPath(import.meta.url));
const sources = JSON.parse(await readFile(join(here, "SOURCES.json"), "utf8"));
const ctx = join(root, "context"), dl = join(root, "downloads");
const sh = (c: string, a: string[], cwd?: string) => execFileSync(c, a, { cwd, stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 28 }).toString();
const sha = (p: string) => new Promise<string>((ok, no) => { const h = createHash("sha256"); createReadStream(p).on("data", d => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", no); });

async function fetchTo(url: string, file: string, expectSha?: string) {
  try { if (!expectSha || (await sha(file)) === expectSha) { await stat(file); if (expectSha || process.env.G02_REUSE_DOWNLOADS) return; } } catch { /* download */ }
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw Error("download_failed:" + url + ":" + r.status);
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(file));
  const got = await sha(file);
  if (expectSha && got !== expectSha) throw Error("checksum_mismatch:" + url);
}

await rm(ctx, { recursive: true, force: true });
for (const d of ["bin", "rules", "config", "osv-cache/osv-scalibr/npm", "trivy-cache"]) await mkdir(join(ctx, d), { recursive: true });
await mkdir(dl, { recursive: true });

// 1. Official release binaries, publisher SHA256 pinned in SOURCES.json.
const releases: Record<string, unknown>[] = [];
for (const r of sources.releases) {
  const file = join(dl, r.name);
  await fetchTo(r.url, file, r.sha256);
  const bin = r.repository.split("/")[1] === "opengrep" ? "opengrep" : r.repository === "google/osv-scanner" ? "osv-scanner" : r.repository.split("/")[1];
  if (r.name.endsWith(".tar.gz")) {
    const tmp = join(dl, "x-" + bin); await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true });
    sh("tar", ["-xzf", "../" + r.name, bin], tmp);
    await copyFile(join(tmp, bin), join(ctx, "bin", bin));
  } else await copyFile(file, join(ctx, "bin", bin));
  releases.push({ repository: r.repository, version: r.version, name: r.name, sha256: r.sha256 });
}

// 2. Official Opengrep JS/TS security rules at the pinned commit.
const rr = join(dl, "opengrep-rules");
await rm(rr, { recursive: true, force: true }); await mkdir(rr, { recursive: true });
sh("git", ["init", "-q"], rr);
sh("git", ["fetch", "-q", "--depth", "1", sources.rules.source + ".git", sources.rules.commit], rr);
sh("git", ["checkout", "-q", "FETCH_HEAD"], rr);
if (sh("git", ["rev-parse", "HEAD"], rr).trim() !== sources.rules.commit) throw Error("rules_commit_mismatch");
const walk = async (d: string): Promise<string[]> => (await Promise.all((await readdir(d, { withFileTypes: true })).map(async e => e.name === ".git" ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))).flat();
const ruleFiles = (await walk(rr)).map(f => relative(rr, f).replaceAll("\\", "/"))
  .filter(f => /^(javascript|typescript)\/.+\/security\/[^/]+\.ya?ml$/.test(f) && !/\.(test|fixed)\./.test(f)).sort();
const rules: { path: string; sha256: string }[] = [];
for (const f of ruleFiles) {
  const out = join(ctx, "rules", f.replaceAll("/", "__"));
  await copyFile(join(rr, f), out);
  rules.push({ path: f, sha256: await sha(out) });
}
if (rules.length < 50) throw Error("rules_missing");

// 3. Config: official Gitleaks default config (pinned), empty overrides for OSV/Trivy.
const gl = join(ctx, "config/gitleaks.toml");
await fetchTo("https://raw.githubusercontent.com/gitleaks/gitleaks/v8.30.1/config/gitleaks.toml", gl, sources.gitleaksConfig.sha256);
for (const f of ["empty.toml", "empty.yaml", "empty.ignore"]) await writeFile(join(ctx, "config", f), "");

// 4. OSV npm snapshot (time-dependent; identified by recorded hash). Offline scans read it from the image only.
const osvZip = join(ctx, "osv-cache/osv-scalibr/npm/all.zip");
await fetchTo(sources.osv.source, osvZip);
const osv = { source: sources.osv.source, sha256: await sha(osvZip), bytes: (await stat(osvZip)).size, ecosystems: ["npm"], downloadedAt: new Date().toISOString() };

// 5. Trivy vulnerability DB, fetched by the pinned official binary inside a throwaway container; the image itself has no network.
sh("docker", ["pull", "-q", BASE]);
const baseId = sh("docker", ["image", "inspect", BASE, "--format", "{{index .RepoDigests 0}}"]).trim();
const win = (p: string) => p.replaceAll("\\", "/");
sh("docker", ["run", "--rm", "-v", `${win(join(ctx, "bin"))}:/b:ro`, "-v", `${win(join(ctx, "trivy-cache"))}:/cache`, BASE, "/b/trivy", "image", "--download-db-only", "--skip-java-db-update", "--cache-dir", "/cache"]);
const meta = JSON.parse(await readFile(join(ctx, "trivy-cache/db/metadata.json"), "utf8"));

await writeFile(join(ctx, "official-release-manifest.json"), JSON.stringify({ releases }, null, 1));
await writeFile(join(ctx, "rules-manifest.json"), JSON.stringify({ source: sources.rules.source, commit: sources.rules.commit, files: rules }, null, 1));
await writeFile(join(ctx, "osv-db-manifest.json"), JSON.stringify(osv, null, 1));
await writeFile(join(ctx, "trivy-db-manifest.json"), JSON.stringify(meta, null, 1));
for (const f of ["Dockerfile", "entry.py", "control.py"]) await copyFile(join(here, f), join(ctx, f));

// 6. Build with the host network disabled for RUN steps (no RUN fetches anything anyway).
sh("docker", ["build", "-q", "--network", "none", "--build-arg", "BASE_IMAGE=" + baseId, "-t", "wetscan-g02-scanners:local", ctx]);
const imageId = sh("docker", ["image", "inspect", "wetscan-g02-scanners:local", "--format", "{{.Id}}"]).trim();
await writeFile(join(root, "built-image.json"), JSON.stringify({ imageId }));
await writeFile(join(root, "base-image.json"), JSON.stringify({ reference: baseId }));
console.log(JSON.stringify({ imageId, base: baseId, rules: rules.length, osvSha256: osv.sha256, trivyDb: meta.Version ?? meta.UpdatedAt }));
