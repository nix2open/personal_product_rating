import { Hono } from "hono";
import { z } from "zod";
import { randomId } from "../crypto";
import { requireAuth } from "../middleware";
import type { Env, AppVariables } from "../types";

export const familyRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

familyRouter.use("*", requireAuth);

familyRouter.get("/groups", async (c) => {
  const me = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.name, g.created_at, fm.role, fm.status
     FROM family_members fm
     JOIN family_groups g ON g.id = fm.group_id
     WHERE (fm.user_id = ? AND fm.status IN ('active', 'pending'))
        OR (fm.invitee_email IS NOT NULL AND LOWER(fm.invitee_email) = LOWER(?) AND fm.status = 'pending')`,
  )
    .bind(me.id, me.email)
    .all();
  return c.json({ groups: rows.results ?? [] });
});

familyRouter.post("/groups", async (c) => {
  const me = c.get("user")!;
  const parsed = z.object({ name: z.string().min(1).max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const gid = randomId();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO family_groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(gid, parsed.data.name, me.id, now)
    .run();
  const mid = randomId();
  await c.env.DB.prepare(
    "INSERT INTO family_members (id, group_id, user_id, invitee_email, role, status, created_at) VALUES (?, ?, ?, NULL, 'owner', 'active', ?)",
  )
    .bind(mid, gid, me.id, now)
    .run();
  return c.json({ groupId: gid });
});

familyRouter.get("/groups/:groupId/members", async (c) => {
  const me = c.get("user")!;
  const groupId = c.req.param("groupId");
  const member = await c.env.DB.prepare(
    "SELECT role, status FROM family_members WHERE group_id = ? AND user_id = ? AND status = 'active'",
  )
    .bind(groupId, me.id)
    .first();
  if (!member) return c.json({ error: "forbidden" }, 403);

  const rows = await c.env.DB.prepare(
    `SELECT fm.id, fm.role, fm.status, fm.invitee_email, u.email as user_email, u.name as user_name, fm.user_id
     FROM family_members fm
     LEFT JOIN users u ON u.id = fm.user_id
     WHERE fm.group_id = ?`,
  )
    .bind(groupId)
    .all();
  return c.json({ members: rows.results ?? [] });
});

familyRouter.post("/groups/:groupId/invite", async (c) => {
  const me = c.get("user")!;
  const groupId = c.req.param("groupId");
  const owner = await c.env.DB.prepare(
    "SELECT 1 FROM family_members WHERE group_id = ? AND user_id = ? AND role = 'owner' AND status = 'active'",
  )
    .bind(groupId, me.id)
    .first();
  if (!owner) return c.json({ error: "forbidden" }, 403);

  const parsed = z
    .object({ email: z.string().email().max(320).transform((e) => e.trim().toLowerCase()) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_email" }, 400);
  const email = parsed.data.email;
  if (email === me.email) return c.json({ error: "cannot_invite_self" }, 400);

  const target = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  const mid = randomId();
  const now = Date.now();
  if (target) {
    await c.env.DB.prepare(
      "INSERT INTO family_members (id, group_id, user_id, invitee_email, role, status, created_at) VALUES (?, ?, ?, NULL, 'member', 'active', ?)",
    )
      .bind(mid, groupId, target.id, now)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO family_members (id, group_id, user_id, invitee_email, role, status, created_at) VALUES (?, ?, NULL, ?, 'member', 'pending', ?)",
    )
      .bind(mid, groupId, email, now)
      .run();
  }
  return c.json({ ok: true });
});

familyRouter.post("/invites/:inviteId/accept", async (c) => {
  const me = c.get("user")!;
  const inviteId = c.req.param("inviteId");
  const row = await c.env.DB.prepare(
    "SELECT id, group_id, invitee_email, user_id, status FROM family_members WHERE id = ?",
  )
    .bind(inviteId)
    .first<{
      id: string;
      group_id: string;
      invitee_email: string | null;
      user_id: string | null;
      status: string;
    }>();
  if (!row || row.status !== "pending") return c.json({ error: "not_found" }, 404);
  if (row.user_id && row.user_id !== me.id) return c.json({ error: "forbidden" }, 403);
  if (!row.user_id && row.invitee_email?.toLowerCase() !== me.email.toLowerCase()) {
    return c.json({ error: "forbidden" }, 403);
  }
  await c.env.DB.prepare(
    "UPDATE family_members SET user_id = ?, invitee_email = NULL, status = 'active' WHERE id = ?",
  )
    .bind(me.id, row.id)
    .run();
  return c.json({ ok: true, groupId: row.group_id });
});
