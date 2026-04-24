import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "local_dev_secret_change_me";
const accessTtl = "15m";
const refreshDays = Number(process.env.REFRESH_DAYS || 14);
const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const CATEGORIES = [
  "other",
  "dairy",
  "meat",
  "fish",
  "vegetables",
  "fruits",
  "bakery",
  "snacks",
  "drinks",
  "frozen",
  "household",
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadDir));

const registerSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});

const productSchema = z.object({
  barcode: z.string().min(4).max(64).optional().nullable(),
  name: z.string().min(2).max(160),
  brand: z.string().max(160).nullable().optional(),
  category: z.enum(CATEGORIES),
  photoUrl: z.string().max(512).nullable().optional(),
  rating: z.number().int().min(0).max(10),
  tasteRating: z.number().int().min(0).max(10).nullable().optional(),
  qualityRating: z.number().int().min(0).max(10).nullable().optional(),
  priceRating: z.number().int().min(0).max(10).nullable().optional(),
  pros: z.string().max(2000).nullable().optional(),
  cons: z.string().max(2000).nullable().optional(),
  noteText: z.string().max(4000).nullable().optional(),
  ownerId: z.uuid().optional(),
});

const shareSchema = z.object({
  role: z.enum(["viewer", "editor"]),
  emails: z.array(z.email().transform((value) => value.toLowerCase())).min(1),
});

const profileSchema = z.object({
  nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
});

const rewardRuleSchema = z.object({
  key: z.string().min(3).max(60).regex(/^[a-z0-9_]+$/),
  title: z.string().min(2).max(80),
  description: z.string().min(2).max(250),
  activityKey: z.string().min(3).max(60),
  periodDays: z.number().int().min(0).max(365),
  targetCount: z.number().int().min(1).max(10000),
  points: z.number().int().min(1).max(100000),
  enabled: z.boolean().optional(),
});

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, nickname: user.nickname, isAdmin: user.is_admin },
    jwtSecret,
    { expiresIn: accessTtl },
  );
}

async function createRefreshToken(userId) {
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
  await pool.query(
    "insert into refresh_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)",
    [userId, tokenHash(refreshToken), expiresAt.toISOString()],
  );
  return refreshToken;
}

async function resolveRole(ownerId, requesterId) {
  if (ownerId === requesterId) return "owner";
  const shared = await pool.query(
    "select role from shares where owner_id = $1 and grantee_id = $2",
    [ownerId, requesterId],
  );
  return shared.rows[0]?.role ?? null;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(authHeader.slice(7), jwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      nickname: payload.nickname,
      isAdmin: Boolean(payload.isAdmin),
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin only" });
  return next();
}

async function recordRewardEvent(userId, activityKey, referenceId = null) {
  await pool.query(
    "insert into reward_events (user_id, activity_key, reference_id) values ($1, $2, $3)",
    [userId, activityKey, referenceId],
  );
}

async function recalculateRewardsForUser(userId) {
  const rules = await pool.query("select * from reward_rules where enabled = true");
  for (const rule of rules.rows) {
    const periodCondition = rule.period_days > 0 ? "and created_at >= now() - ($3 || ' days')::interval" : "";
    const countResult = await pool.query(
      `
      select count(*)::int as cnt
      from reward_events
      where user_id = $1 and activity_key = $2
      ${periodCondition}
      `,
      rule.period_days > 0 ? [userId, rule.activity_key, rule.period_days] : [userId, rule.activity_key],
    );
    const cnt = countResult.rows[0].cnt;
    if (cnt < rule.target_count) continue;
    const context = `${rule.key}:${rule.period_days > 0 ? "rolling" : "all-time"}`;
    await pool.query(
      `
      insert into user_rewards (user_id, rule_id, points, context)
      values ($1, $2, $3, $4)
      on conflict (user_id, rule_id, context) do nothing
      `,
      [userId, rule.id, rule.points, context],
    );
  }
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/meta/categories", (_req, res) => {
  res.json(CATEGORIES);
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const { email, nickname, password } = parsed.data;
  try {
    const result = await pool.query(
      `
      insert into users (email, nickname, password_hash)
      values ($1, $2, crypt($3, gen_salt('bf')))
      returning id, email, nickname, is_admin
      `,
      [email, nickname.toLowerCase(), password],
    );
    const user = result.rows[0];
    const accessToken = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);
    return res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    const err = String(error);
    if (err.includes("users_email_key")) return res.status(409).json({ message: "Email already exists" });
    if (err.includes("users_nickname_key")) return res.status(409).json({ message: "Nickname already exists" });
    return res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const { email, password } = parsed.data;
  const result = await pool.query(
    `
    select id, email, nickname, is_admin
    from users
    where email = $1 and password_hash = crypt($2, password_hash)
    `,
    [email, password],
  );
  if (!result.rows.length) return res.status(401).json({ message: "Invalid credentials" });
  const user = result.rows[0];
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);
  return res.json({ user, accessToken, refreshToken });
});

app.post("/api/auth/refresh", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) return res.status(400).json({ message: "refreshToken is required" });
  const hashed = tokenHash(refreshToken);
  const result = await pool.query(
    `
    select rt.id, rt.user_id, u.email, u.nickname, u.is_admin
    from refresh_tokens rt
    join users u on u.id = rt.user_id
    where rt.token_hash = $1 and rt.revoked_at is null and rt.expires_at > now()
    `,
    [hashed],
  );
  if (!result.rows.length) return res.status(401).json({ message: "Invalid refresh token" });
  const token = result.rows[0];
  await pool.query("update refresh_tokens set revoked_at = now() where id = $1", [token.id]);
  const user = {
    id: token.user_id,
    email: token.email,
    nickname: token.nickname,
    is_admin: token.is_admin,
  };
  const accessToken = signAccessToken(user);
  const newRefreshToken = await createRefreshToken(user.id);
  return res.json({ user, accessToken, refreshToken: newRefreshToken });
});

app.post("/api/auth/logout", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) return res.status(204).send();
  await pool.query("update refresh_tokens set revoked_at = now() where token_hash = $1", [tokenHash(refreshToken)]);
  return res.status(204).send();
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const result = await pool.query("select id, email, nickname, is_admin from users where id = $1", [req.user.id]);
  return res.json(result.rows[0]);
});

app.put("/api/auth/me", authRequired, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  try {
    const result = await pool.query(
      "update users set nickname = $2 where id = $1 returning id, email, nickname, is_admin",
      [req.user.id, parsed.data.nickname.toLowerCase()],
    );
    return res.json(result.rows[0]);
  } catch (error) {
    if (String(error).includes("users_nickname_key")) return res.status(409).json({ message: "Nickname already exists" });
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

app.post("/api/uploads/photo", authRequired, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "photo file is required" });
  return res.status(201).json({ photoUrl: `/uploads/${req.file.filename}` });
});

app.get("/api/products", authRequired, async (req, res) => {
  const { id: requesterId } = req.user;
  const queryText = req.query.q ? String(req.query.q).toLowerCase() : "";
  const category = req.query.category ? String(req.query.category) : "";
  const query = `
    with allowed_owners as (
      select $1::uuid as owner_id
      union
      select s.owner_id from shares s where s.grantee_id = $1
    )
    select p.*, u.email as owner_email, u.nickname as owner_nickname
    from products p
    join allowed_owners ao on ao.owner_id = p.owner_id
    join users u on u.id = p.owner_id
    where ($2 = '' or p.category = $2)
      and (
        $3 = ''
        or lower(coalesce(p.name, '')) like '%' || $3 || '%'
        or lower(coalesce(p.brand, '')) like '%' || $3 || '%'
        or lower(coalesce(p.barcode, '')) like '%' || $3 || '%'
      )
    order by p.updated_at desc
  `;
  const result = await pool.query(query, [requesterId, category, queryText]);
  return res.json(result.rows);
});

app.get("/api/products/:id/ratings", authRequired, async (req, res) => {
  const productId = req.params.id;
  const requesterId = req.user.id;
  const base = await pool.query("select * from products where id = $1", [productId]);
  if (!base.rows.length) return res.status(404).json({ message: "Product not found" });
  const product = base.rows[0];
  const ownerRole = await resolveRole(product.owner_id, requesterId);
  if (!ownerRole) return res.status(403).json({ message: "Access denied" });
  const rows = await pool.query(
    `
    with allowed_owners as (
      select $1::uuid as owner_id
      union
      select s.owner_id from shares s where s.grantee_id = $1
    )
    select p.*, u.email as owner_email, u.nickname as owner_nickname
    from products p
    join allowed_owners ao on ao.owner_id = p.owner_id
    join users u on u.id = p.owner_id
    where (
      ($2::text is not null and p.barcode = $2)
      or (
        $2::text is null
        and lower(coalesce(p.name, '')) = lower(coalesce($3, ''))
        and lower(coalesce(p.brand, '')) = lower(coalesce($4, ''))
        and p.category = $5
      )
    )
    order by p.rating desc, p.updated_at desc
    `,
    [requesterId, product.barcode, product.name, product.brand, product.category],
  );
  return res.json(rows.rows);
});

app.post("/api/products", authRequired, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const { id: requesterId } = req.user;
  const data = parsed.data;
  const ownerId = data.ownerId ?? requesterId;
  const role = await resolveRole(ownerId, requesterId);
  if (!role) return res.status(403).json({ message: "Access denied" });
  if (role === "viewer") return res.status(403).json({ message: "Viewer cannot edit" });

  const result = await pool.query(
    `
    insert into products (
      owner_id, barcode, name, brand, category, photo_url, rating, taste_rating, quality_rating, price_rating, pros, cons, note_text
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (owner_id, barcode) where barcode is not null do update set
      name = excluded.name,
      brand = excluded.brand,
      category = excluded.category,
      photo_url = excluded.photo_url,
      rating = excluded.rating,
      taste_rating = excluded.taste_rating,
      quality_rating = excluded.quality_rating,
      price_rating = excluded.price_rating,
      pros = excluded.pros,
      cons = excluded.cons,
      note_text = excluded.note_text,
      updated_at = now()
    returning *
    `,
    [
      ownerId,
      data.barcode || null,
      data.name,
      data.brand ?? null,
      data.category,
      data.photoUrl ?? null,
      data.rating,
      data.tasteRating ?? null,
      data.qualityRating ?? null,
      data.priceRating ?? null,
      data.pros ?? null,
      data.cons ?? null,
      data.noteText ?? null,
    ],
  );
  const saved = result.rows[0];
  await recordRewardEvent(ownerId, "product_rated", saved.id);
  await recordRewardEvent(ownerId, "product_created", saved.id);
  await recalculateRewardsForUser(ownerId);
  return res.status(201).json(saved);
});

app.put("/api/products/:id", authRequired, async (req, res) => {
  const productId = req.params.id;
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const updates = parsed.data;
  const existing = await pool.query("select owner_id from products where id = $1", [productId]);
  if (!existing.rows.length) return res.status(404).json({ message: "Product not found" });
  const ownerId = existing.rows[0].owner_id;
  const role = await resolveRole(ownerId, req.user.id);
  if (!role) return res.status(403).json({ message: "Access denied" });
  if (role === "viewer") return res.status(403).json({ message: "Viewer cannot edit" });

  const result = await pool.query(
    `
    update products
    set
      barcode = coalesce($2, barcode),
      name = coalesce($3, name),
      brand = coalesce($4, brand),
      category = coalesce($5, category),
      photo_url = coalesce($6, photo_url),
      rating = coalesce($7, rating),
      taste_rating = coalesce($8, taste_rating),
      quality_rating = coalesce($9, quality_rating),
      price_rating = coalesce($10, price_rating),
      pros = coalesce($11, pros),
      cons = coalesce($12, cons),
      note_text = coalesce($13, note_text),
      updated_at = now()
    where id = $1
    returning *
    `,
    [
      productId,
      updates.barcode,
      updates.name,
      updates.brand,
      updates.category,
      updates.photoUrl,
      updates.rating,
      updates.tasteRating,
      updates.qualityRating,
      updates.priceRating,
      updates.pros,
      updates.cons,
      updates.noteText,
    ],
  );
  await recordRewardEvent(ownerId, "product_rated", productId);
  await recalculateRewardsForUser(ownerId);
  return res.json(result.rows[0]);
});

app.post("/api/shares", authRequired, async (req, res) => {
  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const { role, emails } = parsed.data;
  const created = [];
  for (const email of emails) {
    const target = await pool.query("select id, email from users where email = $1", [email]);
    if (!target.rows.length) continue;
    const grantee = target.rows[0];
    if (grantee.id === req.user.id) continue;
    const result = await pool.query(
      `
      insert into shares (owner_id, grantee_id, role)
      values ($1, $2, $3)
      on conflict (owner_id, grantee_id) do update set role = excluded.role
      returning *
      `,
      [req.user.id, grantee.id, role],
    );
    created.push({ ...result.rows[0], granteeEmail: grantee.email });
  }
  return res.status(201).json(created);
});

app.get("/api/shares", authRequired, async (req, res) => {
  const result = await pool.query(
    `
    select s.id, s.owner_id, s.grantee_id, s.role, s.created_at, u.email as grantee_email
    from shares s
    join users u on u.id = s.grantee_id
    where s.owner_id = $1
    order by s.created_at desc
    `,
    [req.user.id],
  );
  return res.json(result.rows);
});

app.get("/api/rewards/me", authRequired, async (req, res) => {
  const rewards = await pool.query(
    `
    select ur.id, ur.points, ur.context, ur.created_at, rr.title, rr.description
    from user_rewards ur
    join reward_rules rr on rr.id = ur.rule_id
    where ur.user_id = $1
    order by ur.created_at desc
    `,
    [req.user.id],
  );
  const total = await pool.query("select coalesce(sum(points), 0)::int as total from user_rewards where user_id = $1", [req.user.id]);
  res.json({ totalPoints: total.rows[0].total, rewards: rewards.rows });
});

app.get("/api/admin/reward-rules", authRequired, adminRequired, async (_req, res) => {
  const rules = await pool.query("select * from reward_rules order by created_at desc");
  res.json(rules.rows);
});

app.post("/api/admin/reward-rules", authRequired, adminRequired, async (req, res) => {
  const parsed = rewardRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const data = parsed.data;
  const result = await pool.query(
    `
    insert into reward_rules (key, title, description, activity_key, period_days, target_count, points, enabled)
    values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (key) do update set
      title = excluded.title,
      description = excluded.description,
      activity_key = excluded.activity_key,
      period_days = excluded.period_days,
      target_count = excluded.target_count,
      points = excluded.points,
      enabled = excluded.enabled
    returning *
    `,
    [data.key, data.title, data.description, data.activityKey, data.periodDays, data.targetCount, data.points, data.enabled ?? true],
  );
  res.status(201).json(result.rows[0]);
});

app.post("/api/admin/rewards/recalculate", authRequired, adminRequired, async (_req, res) => {
  const users = await pool.query("select id from users");
  for (const row of users.rows) {
    await recalculateRewardsForUser(row.id);
  }
  res.json({ ok: true, users: users.rowCount });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API started on port ${port}`);
});
