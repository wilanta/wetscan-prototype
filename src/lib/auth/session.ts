import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { authConfig } from "./config";
import { deleteRecord, readRecord, writeRecord } from "./store";
import type { Profile, Session } from "./types";

export const SESSION_COOKIE = "wetscan_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export function sessionKey(token: string) {
  return "session-" + createHash("sha256").update(token).digest("hex");
}
export async function getSession(token?: string): Promise<Session | undefined> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const session = await readRecord<Session>(sessionKey(token));
  if (session && session.expiresAt > Date.now()) return session;
  if (session) await deleteRecord(sessionKey(token));
  return undefined;
}
export function requestToken(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value;
}
export async function saveSession(token: string, session: Session) {
  await writeRecord(sessionKey(token), session);
}
export async function newSession(session?: Session) {
  const token = randomBytes(32).toString("hex");
  const value: Session = session ?? {
    workspace: "",
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  };
  await saveSession(token, value);
  return { token, session: value };
}
export async function rotateSession(oldToken: string, session: Session) {
  session.expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const created = await newSession(session);
  await deleteRecord(sessionKey(oldToken));
  return created.token;
}
export async function profileFor(session?: Session) {
  return session?.githubId
    ? readRecord<Profile>("user-" + session.githubId)
    : undefined;
}
export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: authConfig().secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: authConfig().secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
