import { Hono } from "hono";
import { requireAuth } from "../middleware";
import type { Env, AppVariables } from "../types";

export const photosRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

photosRouter.get("/:photoId", requireAuth, async (c) => {
  const viewer = c.get("user")!;
  const photoId = c.req.param("photoId");
  const row = await c.env.DB.prepare(
    `SELECT ph.r2_key, ur.user_id as owner_id
     FROM user_rating_photos ph
     JOIN user_ratings ur ON ur.id = ph.rating_id
     WHERE ph.id = ?`,
  )
    .bind(photoId)
    .first<{ r2_key: string; owner_id: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const can = await canViewOwnerRating(c.env.DB, viewer.id, row.owner_id);
  if (!can) return c.json({ error: "forbidden" }, 403);
  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) return c.json({ error: "missing" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});

async function canViewOwnerRating(db: D1Database, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const share = await db.prepare(
    "SELECT 1 FROM share_access WHERE owner_user_id = ? AND viewer_user_id = ?",
  )
    .bind(ownerId, viewerId)
    .first();
  if (share) return true;
  const fam = await db.prepare(
    `SELECT 1 FROM family_members fm1
     JOIN family_members fm2 ON fm1.group_id = fm2.group_id
       AND fm1.status = 'active' AND fm2.status = 'active'
       AND fm1.user_id IS NOT NULL AND fm2.user_id IS NOT NULL
     WHERE fm1.user_id = ? AND fm2.user_id = ?`,
  )
    .bind(viewerId, ownerId)
    .first();
  return !!fam;
}
