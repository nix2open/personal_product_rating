import { Hono } from "hono";
import { z } from "zod";
import { randomId } from "../crypto";
import { requireAuth } from "../middleware";
import type { Env, AppVariables } from "../types";

const ratingSchema = z.object({
  overall: z.number().int().min(0).max(10),
  price: z.number().int().min(0).max(10).nullable().optional(),
  quality: z.number().int().min(0).max(10).nullable().optional(),
  comment: z.string().max(5000).nullable().optional(),
});

export const ratingsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

ratingsRouter.use("*", requireAuth);

ratingsRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT ur.id as rating_id, ur.overall, ur.price, ur.quality, ur.comment, ur.updated_at,
            p.id as product_id, p.name, p.barcode, p.brand, p.image_url
     FROM user_ratings ur
     JOIN products p ON p.id = ur.product_id
     WHERE ur.user_id = ?
     ORDER BY ur.updated_at DESC
     LIMIT 200`,
  )
    .bind(user.id)
    .all();
  return c.json({ items: rows.results ?? [] });
});

ratingsRouter.put("/product/:productId", async (c) => {
  const user = c.get("user")!;
  const productId = c.req.param("productId");
  const product = await c.env.DB.prepare("SELECT id FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: string }>();
  if (!product) return c.json({ error: "product_not_found" }, 404);

  const parsed = ratingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
  const { overall, price, quality, comment } = parsed.data;
  const now = Date.now();

  const existing = await c.env.DB.prepare(
    "SELECT id FROM user_ratings WHERE user_id = ? AND product_id = ?",
  )
    .bind(user.id, productId)
    .first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE user_ratings SET overall = ?, price = ?, quality = ?, comment = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(overall, price ?? null, quality ?? null, comment ?? null, now, existing.id)
      .run();
    return c.json({ ratingId: existing.id });
  }
  const rid = randomId();
  await c.env.DB.prepare(
    `INSERT INTO user_ratings (id, user_id, product_id, overall, price, quality, comment, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(rid, user.id, productId, overall, price ?? null, quality ?? null, comment ?? null, now)
    .run();
  return c.json({ ratingId: rid });
});

const MAX_PHOTO_BYTES = 1_800_000;

ratingsRouter.post("/:ratingId/photos", async (c) => {
  const user = c.get("user")!;
  const ratingId = c.req.param("ratingId");
  const rating = await c.env.DB.prepare(
    "SELECT id FROM user_ratings WHERE id = ? AND user_id = ?",
  )
    .bind(ratingId, user.id)
    .first<{ id: string }>();
  if (!rating) return c.json({ error: "not_found" }, 404);

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as c FROM user_rating_photos WHERE rating_id = ?",
  )
    .bind(ratingId)
    .first<{ c: number }>();
  if ((countRow?.c ?? 0) >= 3) return c.json({ error: "max_photos" }, 400);

  const ct = c.req.header("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return c.json({ error: "expected_multipart" }, 400);
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return c.json({ error: "missing_file" }, 400);
  }
  const blob = file as File;
  if (blob.size > MAX_PHOTO_BYTES) return c.json({ error: "file_too_large" }, 413);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || "application/octet-stream";
  if (!mime.startsWith("image/")) return c.json({ error: "not_image" }, 400);

  const sortOrder = countRow?.c ?? 0;
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const key = `${user.id}/${ratingId}/${sortOrder}.${ext}`;
  await c.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: mime } });

  const pid = randomId();
  await c.env.DB.prepare(
    "INSERT INTO user_rating_photos (id, rating_id, r2_key, sort_order) VALUES (?, ?, ?, ?)",
  )
    .bind(pid, ratingId, key, sortOrder)
    .run();
  return c.json({ photoId: pid, key });
});

ratingsRouter.delete("/:ratingId/photos/:photoId", async (c) => {
  const user = c.get("user")!;
  const { ratingId, photoId } = c.req.param();
  const row = await c.env.DB.prepare(
    `SELECT p.r2_key FROM user_rating_photos p
     JOIN user_ratings ur ON ur.id = p.rating_id
     WHERE p.id = ? AND p.rating_id = ? AND ur.user_id = ?`,
  )
    .bind(photoId, ratingId, user.id)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  await c.env.PHOTOS.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM user_rating_photos WHERE id = ?").bind(photoId).run();
  return c.json({ ok: true });
});

ratingsRouter.get("/:ratingId/photos", async (c) => {
  const user = c.get("user")!;
  const ratingId = c.req.param("ratingId");
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.sort_order FROM user_rating_photos p
     JOIN user_ratings ur ON ur.id = p.rating_id
     WHERE p.rating_id = ? AND ur.user_id = ? ORDER BY p.sort_order`,
  )
    .bind(ratingId, user.id)
    .all<{ id: string; sort_order: number }>();
  const base = new URL(c.req.url).origin;
  const urls = (rows.results ?? []).map((r) => ({
    id: r.id,
    url: `${base}/api/photos/${r.id}`,
  }));
  return c.json({ photos: urls });
});
