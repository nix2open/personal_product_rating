import type { Context, Next } from "hono";
import type { Env, AppVariables } from "./types";
import { readSession } from "./session";

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> {
  const s = await readSession(c);
  if (!s) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, email, name, username FROM users WHERE id = ?",
  )
    .bind(s.sub)
    .first<{ id: string; email: string; name: string | null; username: string | null }>();
  if (!row) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", { id: row.id, email: row.email, name: row.name, username: row.username });
  await next();
}

export async function optionalAuth(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
): Promise<void> {
  const s = await readSession(c);
  if (s) {
    const row = await c.env.DB.prepare(
      "SELECT id, email, name, username FROM users WHERE id = ?",
    )
      .bind(s.sub)
      .first<{ id: string; email: string; name: string | null; username: string | null }>();
    if (row) c.set("user", { id: row.id, email: row.email, name: row.name, username: row.username });
  }
  await next();
}
