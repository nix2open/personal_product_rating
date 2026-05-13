import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { randomId, sha256Hex } from "../crypto";
import { sendMagicLinkEmail } from "../email";
import { clearSessionCookie, setSessionCookie, signSession } from "../session";
import type { Env, AppVariables } from "../types";
import { optionalAuth, requireAuth } from "../middleware";

function baseAppUrl(env: Env): string {
  return env.APP_URL.replace(/\/$/, "");
}

const emailSchema = z.object({
  email: z.string().email().max(320).transform((e) => e.trim().toLowerCase()),
});

export const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRouter.get("/me", optionalAuth, async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ user: null });
  return c.json({ user: u });
});

authRouter.patch("/profile", requireAuth, async (c) => {
  const me = c.get("user")!;
  const parsed = z
    .object({ name: z.string().max(200).nullable() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
    .bind(parsed.data.name, me.id)
    .run();
  return c.json({ ok: true });
});

authRouter.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRouter.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_email" }, 400);
  const email = parsed.data.email;
  const token = randomId(32);
  const tokenHash = await sha256Hex(token);
  const id = randomId();
  const now = Date.now();
  const expires = now + 15 * 60 * 1000;
  await c.env.DB.prepare(
    "INSERT INTO magic_link_tokens (id, email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, tokenHash, expires, now)
    .run();

  const verifyUrl = `${baseAppUrl(c.env)}/api/auth/magic-verify?token=${encodeURIComponent(token)}`;
  const sent = await sendMagicLinkEmail(c.env, email, verifyUrl);
  if (!sent.ok) {
    if (c.env.ALLOW_DEV_MAGIC_REVEAL === "true") {
      return c.json({ ok: true, devMagicLinkUrl: verifyUrl, emailNotConfigured: true });
    }
    return c.json({ error: "email_send_failed", detail: sent.error }, 502);
  }
  return c.json({ ok: true });
});

authRouter.get("/magic-verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    "SELECT email FROM magic_link_tokens WHERE token_hash = ? AND expires_at > ?",
  )
    .bind(tokenHash, Date.now())
    .first<{ email: string }>();
  if (!row) return c.text("Invalid or expired link", 400);

  await c.env.DB.prepare("DELETE FROM magic_link_tokens WHERE token_hash = ?").bind(tokenHash).run();

  let user = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?")
    .bind(row.email)
    .first<{ id: string; email: string; name: string | null }>();
  if (!user) {
    const uid = randomId();
    const now = Date.now();
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, NULL, ?)",
    )
      .bind(uid, row.email, null, now)
      .run();
    user = { id: uid, email: row.email, name: null };
  }
  await linkFamilyInvitesByEmail(c.env.DB, user.id, user.email);

  const jwt = await signSession(c, { sub: user.id, email: user.email, name: user.name });
  setSessionCookie(c, jwt);
  return c.redirect(`${c.env.APP_URL}/`, 302);
});

authRouter.get("/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    const next = `${baseAppUrl(c.env)}/login?error=google`;
    return c.redirect(next, 302);
  }
  const state = randomId(16);
  const isSecure = new URL(c.env.APP_URL).protocol === "https:";
  setCookie(c, "oauth_state", state, {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    maxAge: 600,
  });
  const redirectUri = `${baseAppUrl(c.env)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
});

authRouter.get("/google/callback", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "google_not_configured" }, 501);
  }
  const state = c.req.query("state");
  const cookieState = getCookie(c, "oauth_state");
  if (!state || !cookieState || state !== cookieState) {
    return c.text("Invalid state", 400);
  }
  const code = c.req.query("code");
  if (!code) return c.text("Missing code", 400);

  const redirectUri = `${baseAppUrl(c.env)}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Token exchange failed", 400);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return c.text("No access_token", 400);

  const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!ui.ok) return c.text("Userinfo failed", 400);
  const info = (await ui.json()) as { sub: string; email?: string; name?: string };
  if (!info.email) return c.text("Email required from Google", 400);
  const email = info.email.trim().toLowerCase();

  const existingGoogle = await c.env.DB.prepare(
    "SELECT id, email, name FROM users WHERE google_sub = ?",
  )
    .bind(info.sub)
    .first<{ id: string; email: string; name: string | null }>();

  let user = existingGoogle;
  if (!user) {
    const byEmail = await c.env.DB.prepare("SELECT id, email, name, google_sub FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; email: string; name: string | null; google_sub: string | null }>();
    if (byEmail) {
      await c.env.DB.prepare("UPDATE users SET google_sub = ?, name = COALESCE(name, ?) WHERE id = ?")
        .bind(info.sub, info.name ?? null, byEmail.id)
        .run();
      user = { id: byEmail.id, email: byEmail.email, name: byEmail.name ?? info.name ?? null };
    } else {
      const uid = randomId();
      const now = Date.now();
      await c.env.DB.prepare(
        "INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(uid, email, info.name ?? null, info.sub, now)
        .run();
      user = { id: uid, email, name: info.name ?? null };
    }
  } else {
    await c.env.DB.prepare("UPDATE users SET email = ?, name = COALESCE(?, name) WHERE id = ?")
      .bind(email, info.name ?? null, user.id)
      .run();
  }

  await linkFamilyInvitesByEmail(c.env.DB, user.id, user.email);

  const jwt = await signSession(c, { sub: user.id, email: user.email, name: user.name });
  setSessionCookie(c, jwt);
  return c.redirect(`${c.env.APP_URL}/`, 302);
});

async function linkFamilyInvitesByEmail(db: D1Database, userId: string, email: string): Promise<void> {
  const invites = await db
    .prepare(
      "SELECT id FROM family_members WHERE status = 'pending' AND LOWER(invitee_email) = LOWER(?)",
    )
    .bind(email)
    .all<{ id: string }>();
  for (const inv of invites.results ?? []) {
    await db
      .prepare(
        "UPDATE family_members SET user_id = ?, invitee_email = NULL, status = 'active' WHERE id = ?",
      )
      .bind(userId, inv.id)
      .run();
  }
}
