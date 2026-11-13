import "server-only";
import { isAbsolute, relative, sep } from "node:path";

export class AuthError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new AuthError("configuration", 503);
  return value;
}
export function authConfig() {
  let origin: URL;
  try {
    origin = new URL(required("APP_URL"));
  } catch {
    throw new AuthError("configuration", 503);
  }
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  ) {
    throw new AuthError("configuration", 503);
  }
  const secret = required("AUTH_SECRET");
  if (Buffer.byteLength(secret) < 32) throw new AuthError("configuration", 503);
  const directory = required("AUTH_DATA_DIR");
  const fromProject = relative(process.cwd(), directory);
  // Auth records must never be served, bundled, or accidentally committed.
  if (
    !isAbsolute(directory) ||
    (!(fromProject === ".." || fromProject.startsWith(".." + sep)) &&
      !isAbsolute(fromProject))
  ) {
    throw new AuthError("configuration", 503);
  }
  return {
    origin: origin.origin,
    secret,
    directory,
    secure: origin.protocol === "https:",
  };
}
export function githubConfig() {
  const id = required("GITHUB_APP_ID");
  const slug = required("GITHUB_APP_SLUG");
  if (!/^\d+$/.test(id) || !/^[a-zA-Z0-9-]+$/.test(slug))
    throw new AuthError("configuration", 503);
  return {
    id,
    slug,
    clientId: required("GITHUB_APP_CLIENT_ID"),
    clientSecret: required("GITHUB_APP_CLIENT_SECRET"),
    privateKey: required("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

export function githubCallbackUrl() {
  return new URL("/api/auth/github/callback", authConfig().origin).toString();
}
