import { Hono } from "hono";
import { z } from "zod";
import { randomId, sha256Hex } from "../crypto";
import { requireAuth } from "../middleware";
import type { Env, AppVariables } from "../types";

export const shareRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

shareRouter.use("*", requireAuth);

/** Generate a share token (show once to friends). */
shareRouter.post("/token/create", async (c) => {
  const me = c.get("user")!;
  const plain = `${randomId(8)}-${randomId(8)}-${randomId(8)}`;
  const tokenHash = await sha256Hex(plain);
  const id = randomId();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO share_access_tokens (id, owner_user_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, me.id, tokenHash, now)
    .run();
  return c.json({ id, token: plain, createdAt: now });
});

shareRouter.get("/tokens", async (c) => {
  const me = c.get("user")!;
  const rows = await c.env.DB.prepare(
    "SELECT id, created_at, revoked_at FROM share_access_tokens WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(me.id)
    .all();
  return c.json({ tokens: rows.results ?? [] });
});

shareRouter.post("/token/revoke", async (c) => {
  const me = c.get("user")!;
  const parsed = z.object({ id: z.string().min(4) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const r = await c.env.DB.prepare(
    "UPDATE share_access_tokens SET revoked_at = ? WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL",
  )
    .bind(Date.now(), parsed.data.id, me.id)
    .run();
  if (!r.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

const importTokenSchema = z.object({
  token: z.string().min(8).max(200).transform((s) => s.trim()),
  sharerName: z.string().max(200).optional().nullable(),
});

shareRouter.post("/import-token", async (c) => {
  const me = c.get("user")!;
  const parsed = importTokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const { token, sharerName } = parsed.data;
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    "SELECT id, owner_user_id FROM share_access_tokens WHERE token_hash = ? AND revoked_at IS NULL",
  )
    .bind(tokenHash)
    .first<{ id: string; owner_user_id: string }>();
  if (!row) return c.json({ error: "invalid_token" }, 404);
  if (row.owner_user_id === me.id) return c.json({ error: "cannot_share_with_self" }, 400);
  const label = sharerName?.trim() || null;
  const now = Date.now();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM share_access WHERE owner_user_id = ? AND viewer_user_id = ?",
  )
    .bind(row.owner_user_id, me.id)
    .first<{ id: string }>();
  if (existing) {
    if (label) {
      await c.env.DB.prepare("UPDATE share_access SET import_label = ? WHERE id = ?").bind(label, existing.id).run();
    }
  } else {
    const aid = randomId();
    await c.env.DB.prepare(
      "INSERT INTO share_access (id, owner_user_id, viewer_user_id, created_at, import_label) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(aid, row.owner_user_id, me.id, now, label)
      .run();
  }
  return c.json({ ok: true, ownerUserId: row.owner_user_id });
});

shareRouter.post("/invite", async (c) => {
  const me = c.get("user")!;
  const parsed = z
    .object({ email: z.string().email().max(320).transform((e) => e.trim().toLowerCase()) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_email" }, 400);
  const email = parsed.data.email;
  if (email === me.email) return c.json({ error: "cannot_invite_self" }, 400);

  const target = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (target) {
    if (target.id === me.id) return c.json({ error: "cannot_invite_self" }, 400);
    const aid = randomId();
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO share_access (id, owner_user_id, viewer_user_id, created_at) VALUES (?, ?, ?, ?)",
    )
      .bind(aid, me.id, target.id, Date.now())
      .run();
    return c.json({ ok: true, immediate: true });
  }

  const dup = await c.env.DB.prepare(
    "SELECT id FROM share_invites WHERE owner_user_id = ? AND LOWER(invitee_email) = LOWER(?) AND status = 'pending'",
  )
    .bind(me.id, email)
    .first();
  if (dup) return c.json({ ok: true, pending: true });

  const id = randomId();
  await c.env.DB.prepare(
    "INSERT INTO share_invites (id, owner_user_id, invitee_email, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
  )
    .bind(id, me.id, email, Date.now())
    .run();
  return c.json({ ok: true, pending: true });
});

shareRouter.get("/incoming", async (c) => {
  const me = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT si.id, si.owner_user_id, si.created_at, u.email as owner_email, u.name as owner_name
     FROM share_invites si
     JOIN users u ON u.id = si.owner_user_id
     WHERE LOWER(si.invitee_email) = LOWER(?) AND si.status = 'pending'`,
  )
    .bind(me.email)
    .all();
  return c.json({ invites: rows.results ?? [] });
});

shareRouter.get("/outgoing", async (c) => {
  const me = c.get("user")!;
  const rows = await c.env.DB.prepare(
    "SELECT id, invitee_email, status, created_at FROM share_invites WHERE owner_user_id = ? ORDER BY created_at DESC",
  )
    .bind(me.id)
    .all();
  const granted = await c.env.DB.prepare(
    `SELECT sa.viewer_user_id, u.email as viewer_email, u.name as viewer_name, u.username as viewer_username,
            sa.created_at, sa.import_label
     FROM share_access sa
     JOIN users u ON u.id = sa.viewer_user_id
     WHERE sa.owner_user_id = ?`,
  )
    .bind(me.id)
    .all();
  return c.json({ invites: rows.results ?? [], granted: granted.results ?? [] });
});

shareRouter.post("/accept", async (c) => {
  const me = c.get("user")!;
  const parsed = z.object({ inviteId: z.string().min(4) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const inv = await c.env.DB.prepare(
    "SELECT id, owner_user_id, invitee_email, status FROM share_invites WHERE id = ?",
  )
    .bind(parsed.data.inviteId)
    .first<{ id: string; owner_user_id: string; invitee_email: string; status: string }>();
  if (!inv || inv.status !== "pending") return c.json({ error: "not_found" }, 404);
  if (inv.invitee_email.toLowerCase() !== me.email.toLowerCase()) return c.json({ error: "forbidden" }, 403);

  await c.env.DB.prepare("UPDATE share_invites SET status = 'accepted' WHERE id = ?").bind(inv.id).run();
  const aid = randomId();
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO share_access (id, owner_user_id, viewer_user_id, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(aid, inv.owner_user_id, me.id, Date.now())
    .run();
  return c.json({ ok: true });
});

shareRouter.post("/reject", async (c) => {
  const me = c.get("user")!;
  const parsed = z.object({ inviteId: z.string().min(4) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const inv = await c.env.DB.prepare(
    "SELECT id, invitee_email, status FROM share_invites WHERE id = ?",
  )
    .bind(parsed.data.inviteId)
    .first<{ id: string; invitee_email: string; status: string }>();
  if (!inv || inv.status !== "pending") return c.json({ error: "not_found" }, 404);
  if (inv.invitee_email.toLowerCase() !== me.email.toLowerCase()) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("UPDATE share_invites SET status = 'rejected' WHERE id = ?").bind(inv.id).run();
  return c.json({ ok: true });
});

shareRouter.post("/revoke-access", async (c) => {
  const me = c.get("user")!;
  const parsed = z.object({ viewerUserId: z.string().min(4) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  await c.env.DB.prepare("DELETE FROM share_access WHERE owner_user_id = ? AND viewer_user_id = ?")
    .bind(me.id, parsed.data.viewerUserId)
    .run();
  return c.json({ ok: true });
});
