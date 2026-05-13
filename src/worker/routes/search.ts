import { Hono } from "hono";
import { z } from "zod";
import { ensureProductInDb, fetchOffByBarcode, searchOffByText, createManualProduct } from "../off";
import { requireAuth } from "../middleware";
import type { Env, AppVariables } from "../types";

export const searchRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

searchRouter.use("*", requireAuth);

searchRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const q = (c.req.query("q") ?? "").trim();
  const barcode = (c.req.query("barcode") ?? "").trim();

  if (barcode) {
    const off = await fetchOffByBarcode(barcode);
    let productId: string | null = null;
    if (off) {
      productId = await ensureProductInDb(c.env.DB, off);
    }
    const mine = await c.env.DB.prepare(
      `SELECT p.id as product_id, p.name, p.barcode, p.brand, p.image_url, ur.overall, ur.price, ur.quality, ur.comment, ur.id as rating_id
       FROM products p
       LEFT JOIN user_ratings ur ON ur.product_id = p.id AND ur.user_id = ?
       WHERE p.barcode = ? LIMIT 1`,
    )
      .bind(user.id, barcode)
      .first<Record<string, unknown>>();

    return c.json({
      barcode,
      offProduct: off ? { ...off, dbId: productId } : null,
      myRated: mine,
    });
  }

  if (!q || q.length < 2) {
    return c.json({ mine: [], catalog: [], localCatalog: [] });
  }

  const safe = q.replace(/%/g, "");
  const like = `%${safe}%`;
  const mine = await c.env.DB
    .prepare(
      `SELECT p.id as product_id, p.name, p.barcode, p.brand, p.image_url,
              ur.overall, ur.price, ur.quality, ur.comment, ur.id as rating_id
       FROM user_ratings ur
       JOIN products p ON p.id = ur.product_id
       WHERE ur.user_id = ? AND (p.name LIKE ? OR IFNULL(p.barcode,'') LIKE ?)
       ORDER BY ur.updated_at DESC
       LIMIT 20`,
    )
    .bind(user.id, like, like)
    .all();

  let catalog: Awaited<ReturnType<typeof searchOffByText>> = [];
  try {
    catalog = await searchOffByText(q);
  } catch {
    catalog = [];
  }

  const localCatalog = await c.env.DB
    .prepare(
      `SELECT id as product_id, name, barcode, brand, image_url FROM products
       WHERE source = 'manual' AND (name LIKE ? OR IFNULL(barcode,'') LIKE ?)
       LIMIT 10`,
    )
    .bind(like, like)
    .all();

  return c.json({
    mine: mine.results ?? [],
    catalog,
    localCatalog: localCatalog.results ?? [],
  });
});

searchRouter.get("/product/:productId/detail", async (c) => {
  const user = c.get("user")!;
  const productId = c.req.param("productId");
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: string; barcode: string | null; name: string; brand: string | null; image_url: string | null }>();
  if (!product) return c.json({ error: "not_found" }, 404);

  const mine = await c.env.DB.prepare(
    "SELECT * FROM user_ratings WHERE user_id = ? AND product_id = ?",
  )
    .bind(user.id, productId)
    .first();

  const others = await c.env.DB.prepare(
    `SELECT ur.user_id, ur.overall, ur.price, ur.quality, ur.comment,
            COALESCE(NULLIF(u.name, ''), 'Member') as display_name
     FROM user_ratings ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.product_id = ?
       AND ur.user_id != ?
       AND (
         EXISTS (SELECT 1 FROM share_access sa WHERE sa.owner_user_id = ur.user_id AND sa.viewer_user_id = ?)
         OR EXISTS (
           SELECT 1 FROM family_members fm1
           JOIN family_members fm2 ON fm1.group_id = fm2.group_id
             AND fm1.status = 'active' AND fm2.status = 'active'
             AND fm1.user_id IS NOT NULL AND fm2.user_id IS NOT NULL
           WHERE fm1.user_id = ? AND fm2.user_id = ur.user_id
         )
       )`,
  )
    .bind(productId, user.id, user.id, user.id)
    .all();

  return c.json({ product, mine, others: others.results ?? [] });
});

const manualSchema = z.object({
  name: z.string().min(1).max(500),
  barcode: z.string().max(64).optional().nullable(),
});

searchRouter.post("/product/manual", async (c) => {
  const parsed = manualSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const row = await createManualProduct(c.env.DB, parsed.data);
  return c.json({ product: row });
});

searchRouter.post("/product/from-off", async (c) => {
  const code = z.object({ barcode: z.string().min(4).max(32) }).safeParse(await c.req.json().catch(() => null));
  if (!code.success) return c.json({ error: "invalid_barcode" }, 400);
  const off = await fetchOffByBarcode(code.data.barcode);
  if (!off) return c.json({ error: "not_found" }, 404);
  const id = await ensureProductInDb(c.env.DB, off);
  return c.json({ product: { ...off, id } });
});
