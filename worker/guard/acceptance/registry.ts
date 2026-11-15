import { open, readFile, lstat, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, basename, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { hash } from "./approval";
export interface ResourceRecord {
  version: 2; runId: string; caseId: string; jobId: string;
  specDigest: string; image: string; imageId: string; name: string;
  containerId: string | null; deadline: number; source: string;
  createdAt: number; sourceExpiresAt: number;
}
async function regular(path: string) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 32768) throw new LiveGuardError("cleanup_failed");
}
export async function confinedSource(source: string) {
  const path = await realpath(source), temp = await realpath(tmpdir());
  const same = (a:string,b:string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(dirname(path),temp) || !/^wetscan-g01-snapshot-[A-Za-z0-9_-]+$/.test(basename(path)) || (await lstat(source)).isSymbolicLink()) throw new LiveGuardError("cleanup_failed");
  return path;
}
/** Directory must already be private. wx is the cross-process physical-concurrency fence. */
export class ResourceRegistry {
  constructor(private readonly directory: string) {}
  private async root() {
    const path = await realpath(this.directory);
    const parent = await realpath(dirname(resolve(this.directory)));
    if ((await lstat(this.directory)).isSymbolicLink() || dirname(path).toLowerCase() !== parent.toLowerCase() || basename(path).toLowerCase() !== basename(this.directory).toLowerCase()) throw new LiveGuardError("cleanup_failed");
    return path;
  }
  async reserve(record: ResourceRecord) {
    const root = await this.root();
    await confinedSource(record.source);
    if (!/^wetscan-guard-[a-f0-9-]{36}$/.test(record.name) || !/^[a-f0-9]{64}$/.test(record.jobId) || !/^[a-f0-9]{64}$/.test(record.specDigest) || !Number.isFinite(record.deadline)) throw new LiveGuardError("invalid_input");
    let handle;
    try { handle = await open(join(root,"active-container.lock"),"wx",0o600); }
    catch { throw new LiveGuardError("execution_not_ready"); }
    try {
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
      await writeFile(join(root,record.name+".intent.json"),JSON.stringify(record),{flag:"wx",mode:0o600});
    } finally { await handle.close(); }
  }
  async current(): Promise<ResourceRecord> {
    const path = join(await this.root(),"active-container.lock");
    await regular(path);
    return JSON.parse(await readFile(path,"utf8"));
  }
  async inspect(expected: ResourceRecord, metadata: unknown) {
    const m = metadata as { Id:string; Name:string; Image:string; Config:{ Image:string; Labels:Record<string,string> }; HostConfig:{IpcMode:string;Tmpfs:Record<string,string>} };
    const actual = await this.current();
    if (actual.name !== expected.name || actual.runId !== expected.runId || actual.jobId !== expected.jobId ||
        !/^[a-f0-9]{64}$/.test(m.Id ?? "") || m.Name !== "/"+expected.name || m.Image !== expected.imageId || m.Config?.Image !== expected.image ||
        m.Config?.Labels?.["wetscan.run"] !== expected.runId || m.Config.Labels["wetscan.job"] !== expected.jobId || m.Config.Labels["wetscan.spec"] !== expected.specDigest ||
        m.HostConfig?.IpcMode !== "none" || !m.HostConfig.Tmpfs?.["/tmp"]?.includes("noexec")) throw new LiveGuardError("execution_not_ready");
    const record = {...actual,containerId:m.Id};
    await writeFile(join(await this.root(),expected.name+".created.json"),JSON.stringify(record),{flag:"wx",mode:0o600});
    return record;
  }
  async assertOwner(expected: ResourceRecord) {
    const actual = await this.current();
    if (hash(JSON.stringify(actual)) !== hash(JSON.stringify(expected))) throw new LiveGuardError("cleanup_failed");
  }
  async release(expected: ResourceRecord, absenceVerified: boolean) {
    await this.assertOwner(expected);
    if (!absenceVerified) throw new LiveGuardError("cleanup_failed");
    const root = await this.root();
    await writeFile(join(root,expected.name+".removed.json"),JSON.stringify({at:Date.now(),name:expected.name,absent:true}),{flag:"wx",mode:0o600});
    await unlink(join(root,"active-container.lock"));
  }
}
/** Exact resource identity/deadline, not a module-wide Docker sweep. */
export function eligibleContainer(record: ResourceRecord, metadata: unknown, now = Date.now()) {
  const m = metadata as {Id:string;Name:string;Image:string;Config:{Image:string;Labels:Record<string,string>}};
  return record.deadline <= now && Number.isFinite(record.deadline) && !!record.containerId && m.Id === record.containerId && m.Name === "/"+record.name && m.Image === record.imageId && m.Config?.Image === record.image && m.Config.Labels?.["wetscan.run"] === record.runId && m.Config.Labels?.["wetscan.job"] === record.jobId && m.Config.Labels?.["wetscan.spec"] === record.specDigest && Number(m.Config.Labels?.["wetscan.deadline"])===record.deadline;
}
export function eligibleSource(record: ResourceRecord, marker: unknown, now = Date.now()) {
  const m = marker as {version:number;kind:string;rootName:string;createdAt:number;expiresAt:number};
  return m?.version === 1 && m.kind === "guard-source" && m.rootName === basename(record.source) && m.createdAt === record.createdAt && m.expiresAt === record.sourceExpiresAt && Number.isFinite(m.createdAt) && Number.isFinite(m.expiresAt) && now-m.createdAt >= 3600000 && now >= m.expiresAt;
}
