import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { sign, verify } from "hono/jwt";
import type { Env, AppVariables } from "./types";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30;

type AuthContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export type SessionPayload = {
  sub: string;
  email: string;
  name: string | null;
  exp: number;
};

export async function signSession(
  c: AuthContext,
  payload: Omit<SessionPayload, "exp" | "name"> & { name?: string | null },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const token = await sign(
    { sub: payload.sub, email: payload.email, name: payload.name ?? null, exp },
    c.env.JWT_SECRET,
  );
  return token;
}

export function setSessionCookie(c: AuthContext, token: string): void {
  const isSecure = new URL(c.env.APP_URL).protocol === "https:";
  setCookie(c, COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(c: AuthContext): void {
  const isSecure = new URL(c.env.APP_URL).protocol === "https:";
  setCookie(c, COOKIE, "", {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    maxAge: 0,
  });
}

export async function readSession(c: AuthContext): Promise<SessionPayload | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  try {
    const p = (await verify(token, c.env.JWT_SECRET, "HS256")) as SessionPayload;
    if (!p.sub || !p.email) return null;
    return p;
  } catch {
    return null;
  }
}
