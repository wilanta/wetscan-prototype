import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, basename } from "node:path";
import { createHash } from "node:crypto";
import type { Target } from "../../../platform/config";
import { LiveGuardError } from "./model";
import {
  validateProductPolicy,
  validateQualification,
  type RepositoryScanPolicy,
  type RepositoryScanEngine,
  type ScannerQualification,
} from "./product-policy";
import type { SandboxSpec } from "../../../../worker/guard/sandbox";
export interface ProductDeployment {
  version: 1;
  module: "guard-product-runtime";
  hosting: "self_hosted_node";
  target: Target;
  policies: RepositoryScanPolicy[];
  privateRoot: string;
  deployments: {
    engine: RepositoryScanEngine;
    spec: SandboxSpec;
    qualification: ScannerQualification;
  }[];
}
export function validateDeployment(v: ProductDeployment): ProductDeployment {
  if (
    !v ||
    v.version !== 1 ||
    v.module !== "guard-product-runtime" ||
    v.hosting !== "self_hosted_node" ||
    !v.target ||
    !["localhost", "127.0.0.1"].includes(v.target.host) ||
    v.target.database !== "wetscan_dev_guardg02" ||
    !Number.isInteger(v.target.port) ||
    v.target.port < 1024 ||
    v.target.port > 65535 ||
    !/^wetscan-s01:[a-f0-9-]{36}$/.test(v.target.marker) ||
    !isAbsolute(v.privateRoot ?? "") ||
    !/^wetscan-g02-runtime-[A-Za-z0-9_-]+$/.test(basename(v.privateRoot)) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > 20 ||
    !Array.isArray(v.deployments) ||
    !v.deployments.length ||
    v.deployments.length > 6 ||
    new Set(v.deployments.map((d) => d.engine)).size !== v.deployments.length
  )
    throw new LiveGuardError("not_configured");
  for (const p of v.policies) {
    if (
      !Array.isArray(p.branches) ||
      !p.branches.length ||
      new Set(p.branches).size !== p.branches.length ||
      !/^github-user-[1-9]\d*:.{1,128}$/.test(p.workspaceId)
    )
      throw new LiveGuardError("not_configured");
    validateProductPolicy(p, {
      mode: "live",
      workspaceId: p.workspaceId,
      projectId: p.projectId,
      repository: {
        provider: "github",
        repositoryId: p.repositoryId,
        branch: p.branches[0],
        commit: "0".repeat(40),
      },
      requestedEngines: p.engines,
      idempotencyKey: "g02-live-deployment-check",
    });
    for (const e of p.engines) {
      const d = v.deployments.find((d) => d.engine === e);
      if (!d) throw new LiveGuardError("not_configured");
      validateQualification(d.qualification, e, d.spec);
      if (d.spec.timeoutMs > p.scannerTimeoutMs)
        throw new LiveGuardError("not_configured");
    }
  }
  if (
    new Set(v.policies.map((p) => p.workspaceId + "/" + p.projectId)).size !==
    v.policies.length
  )
    throw new LiveGuardError("not_configured");
  return structuredClone(v);
}
export async function loadDeployment(file: string | undefined) {
  if (!file || !isAbsolute(file) || /\.env(?:\.|$)/i.test(basename(file)))
    throw new LiveGuardError("not_configured");
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 131072)
    throw new LiveGuardError("not_configured");
  const bytes = await readFile(file);
  return {
    value: validateDeployment(JSON.parse(bytes.toString("utf8"))),
    digest: createHash("sha256").update(bytes).digest("hex"),
    path: await realpath(file),
  };
}
export function selectPolicy(
  v: ProductDeployment,
  workspaceId: string,
  projectId: string,
) {
  const p = v.policies.find(
    (p) => p.workspaceId === workspaceId && p.projectId === projectId,
  );
  if (!p) throw new LiveGuardError("not_found", 404);
  return p;
}

/** Stored findings remain readable when scanner qualification expires. No worker/admission is constructed here. */
export async function loadProductTarget(file: string | undefined) {
  if (!file || !isAbsolute(file) || /\.env(?:\.|$)/i.test(basename(file)))
    throw new LiveGuardError("not_configured");
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 131072)
    throw new LiveGuardError("not_configured");
  const v = JSON.parse(await readFile(file, "utf8")) as ProductDeployment,
    t = v?.target;
  if (
    v?.version !== 1 ||
    v.module !== "guard-product-runtime" ||
    !t ||
    !["localhost", "127.0.0.1"].includes(t.host) ||
    t.database !== "wetscan_dev_guardg02" ||
    !Number.isInteger(t.port) ||
    t.port < 1024 ||
    t.port > 65535 ||
    !/^wetscan-s01:[a-f0-9-]{36}$/.test(t.marker)
  )
    throw new LiveGuardError("not_configured");
  return structuredClone(t);
}
