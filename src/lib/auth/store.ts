import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { authConfig } from "./config";

// A small, encrypted, single-process store. No existing database/schema is changed.
export function seal(value: unknown, record: string) {
  const key = createHash("sha256").update(authConfig().secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(record));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}
export function unseal<T>(data: Buffer, record: string): T {
  const key = createHash("sha256").update(authConfig().secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(record));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
function recordPath(record: string) {
  if (!/^(session-[a-f0-9]{64}|user-\d+)$/.test(record))
    throw new Error("Invalid auth record");
  return join(authConfig().directory, record + ".bin");
}
export async function readRecord<T>(record: string): Promise<T | undefined> {
  try {
    return unseal<T>(await readFile(recordPath(record)), record);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error; // Fail closed on corruption or a wrong encryption key.
  }
}
export async function writeRecord(record: string, value: unknown) {
  await mkdir(authConfig().directory, { recursive: true, mode: 0o700 });
  const target = recordPath(record);
  const temporary = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await writeFile(temporary, seal(value, record), {
      mode: 0o600,
      flag: "wx",
    });
    // Windows scanners can briefly deny atomic replacement after a read.
    // Keep the existing record intact; never fall back to delete + write.
    const backoff = [10, 20, 50, 100, 200];
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, target);
        break;
      } catch (error) {
        if (
          process.platform !== "win32" ||
          attempt >= backoff.length ||
          !["EPERM", "EACCES"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        await delay(backoff[attempt]);
      }
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
export async function deleteRecord(record: string) {
  await unlink(recordPath(record)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
// Serialize auth mutations across handlers/hot reloads in this Node process.
const scope = globalThis as typeof globalThis & {
  wetScanAuthQueue?: Promise<unknown>;
};
export function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = (scope.wetScanAuthQueue ?? Promise.resolve()).then(work, work);
  scope.wetScanAuthQueue = next.catch(() => undefined);
  return next;
}
