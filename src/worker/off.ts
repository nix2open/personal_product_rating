import { randomId } from "./crypto";

export type ProductRow = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  source: string;
};

export async function fetchOffByBarcode(barcode: string): Promise<ProductRow | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ProductRatingPWA/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; brands?: string; image_url?: string; code?: string };
    };
    if (data.status !== 1 || !data.product?.product_name) return null;
    const p = data.product;
    return {
      id: `off_${barcode}`,
      barcode,
      name: p.product_name!,
      brand: p.brands?.split(",")[0]?.trim() ?? null,
      image_url: p.image_url ?? null,
      source: "off",
    };
  } catch {
    return null;
  }
}

export type OffSearchHit = { code: string; name: string; brand?: string; image?: string };

export async function searchOffByText(q: string): Promise<OffSearchHit[]> {
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "12",
    fields: "code,product_name,brands,image_url",
  });
  const url = `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ProductRatingPWA/1.0" } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      products?: Array<{ code?: string; product_name?: string; brands?: string; image_url?: string }>;
    };
    const list = data.products ?? [];
    return list
      .filter((p) => p.code && p.product_name)
      .map((p) => ({
        code: p.code!,
        name: p.product_name!,
        brand: p.brands?.split(",")[0]?.trim(),
        image: p.image_url,
      }));
  } catch {
    return [];
  }
}

export async function ensureProductInDb(db: D1Database, row: ProductRow): Promise<string> {
  const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(row.id).first<{ id: string }>();
  if (existing) return existing.id;
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO products (id, barcode, name, brand, image_url, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(row.id, row.barcode, row.name, row.brand, row.image_url, row.source, now)
    .run();
  return row.id;
}

export async function createManualProduct(
  db: D1Database,
  input: { name: string; barcode?: string | null },
): Promise<ProductRow> {
  const id = randomId();
  const now = Date.now();
  const barcode = input.barcode?.trim() || null;
  await db
    .prepare(
      "INSERT INTO products (id, barcode, name, brand, image_url, source, created_at) VALUES (?, ?, ?, NULL, NULL, 'manual', ?)",
    )
    .bind(id, barcode, input.name.trim(), now)
    .run();
  return { id, barcode, name: input.name.trim(), brand: null, image_url: null, source: "manual" };
}
