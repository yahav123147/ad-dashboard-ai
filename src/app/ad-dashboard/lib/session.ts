import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "ad_session";
const SECRET =
  process.env.AD_DASHBOARD_SESSION_SECRET || "dev-secret-change-me-in-prod";

// ── HMAC sign/verify ──

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.substring(0, lastDot);
  const expected = sign(value);
  if (signed !== expected) return null;
  return value;
}

// ── Session data (user info + token in cookie) ──

export interface SessionData {
  metaUserId: string;
  name: string | null;
  email: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 60, // 60 days (matches token)
};

export async function setSessionData(data: SessionData): Promise<void> {
  const cookieStore = await cookies();
  const payload = JSON.stringify(data);
  cookieStore.set(COOKIE_NAME, sign(payload), COOKIE_OPTIONS);
}

export async function getSessionData(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie) return null;
  const payload = verify(cookie.value);
  if (!payload) return null;
  try {
    return JSON.parse(payload) as SessionData;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<string | null> {
  // Backwards-compat: returns metaUserId as the "session id"
  const data = await getSessionData();
  return data?.metaUserId ?? null;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
