import "server-only";
import type { PlatformDatabase } from "../../../platform/database";
import type { SentinelScope } from "../types";
import { authorizeSentinelProject } from "./project-context";
import { bindProject } from "../storage/projects";

/** Internal S01 seam only; no route/UI calls it and it grants no monitoring claim. */
export async function registerAuthorizedProject(
  db: PlatformDatabase,
  sessionToken: string | undefined,
  requested: SentinelScope,
) {
  const context = await authorizeSentinelProject(sessionToken, requested);
  await db.scoped(context.scope, (tx) => bindProject(db, tx, context));
  return context;
}
