import { LiveGuardError } from "./model";
export interface GuardRevision {
  branch: string;
  commit?: string;
}
export function validGuardBranch(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) &&
    !value.includes("..") &&
    !value.includes("@{") &&
    !value.startsWith("-") &&
    !value.startsWith("refs/") &&
    value !== "@" &&
    value
      .split("/")
      .every(
        (part) =>
          !!part &&
          !part.startsWith(".") &&
          !part.endsWith(".") &&
          !part.endsWith(".lock"),
      )
  );
}
export function guardRevision(value: unknown): GuardRevision {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LiveGuardError("invalid_input", 400);
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["branch", "commit"].includes(k)) ||
    !validGuardBranch(v.branch) ||
    (v.commit !== undefined &&
      (typeof v.commit !== "string" || !/^[a-f0-9]{40}$/.test(v.commit)))
  )
    throw new LiveGuardError("invalid_input", 400);
  return {
    branch: v.branch,
    ...(v.commit === undefined ? {} : { commit: v.commit as string }),
  };
}
