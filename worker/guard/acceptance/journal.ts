import { open, readFile, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import {
  hash,
  type ExecutionPacket,
  type ExecutionApproval,
  validateExecution,
} from "./approval";
export type Operation =
  | "enqueue"
  | "launch"
  | "snapshot"
  | "cancel"
  | "qualification"
  | "reap"
  | "schema";
/** A failed/unknown operation still consumes its slot. Receipts are never deleted or rewritten. */
export class CaseJournal {
  constructor(
    private readonly root: string,
    readonly packet: ExecutionPacket,
    private readonly approval: ExecutionApproval,
  ) {}
  async reserve(op: Operation, slot = 0) {
    validateExecution(this.packet, this.approval);
    const max = {
      enqueue: this.packet.limits.enqueues,
      launch: this.packet.limits.launches,
      snapshot: this.packet.limits.snapshots,
      cancel: this.packet.limits.cancels,
      qualification:
        this.packet.caseId === "Q00" ? 6 : this.packet.caseId === "N00" ? 3 : 0,
      reap: ["C02B", "C02A", "N07", "N08"].includes(this.packet.caseId) ? 1 : 0,
      schema: this.packet.caseId.startsWith("L") ? 1 : 0,
    }[op];
    if (!Number.isInteger(slot) || slot < 0 || slot >= max)
      throw new LiveGuardError("approval_required");
    const path = join(this.root, `${this.packet.runId}.${op}.${slot}.used`);
    let file;
    try {
      file = await open(path, "wx", 0o600);
    } catch {
      throw new LiveGuardError("approval_required");
    }
    try {
      await file.writeFile(
        JSON.stringify({
          version: 2,
          packetSha256: hash(JSON.stringify(this.packet)),
          caseId: this.packet.caseId,
          op,
          slot,
          at: new Date().toISOString(),
        }),
      );
      await file.sync();
    } finally {
      await file.close();
    }
    return path;
  }
  async result(receipt: string, value: unknown) {
    if (
      !receipt.startsWith(
        join(/* turbopackIgnore: true */ this.root, this.packet.runId + "."),
      ) ||
      !receipt.endsWith(".used")
    )
      throw new LiveGuardError("invalid_input");
    const stat = await lstat(receipt);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LiveGuardError("invalid_input");
    const original = JSON.parse(await readFile(receipt, "utf8"));
    if (original.packetSha256 !== hash(JSON.stringify(this.packet)))
      throw new LiveGuardError("approval_required");
    await writeFile(
      receipt + ".result.json",
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
}
