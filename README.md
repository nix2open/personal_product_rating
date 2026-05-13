# Product Rating PWA

Personal product ratings: track and collect your own scores on consumed products and goods.

> **Note:** This directory may still contain files from an older project (for example `backend/`, Docker images, or `*.tar.gz`). They are unrelated to this PWA; ESLint ignores `backend/`. Remove them if you want a clean tree.

Personal product ratings as a **Progressive Web App** (installable, offline shell via Workbox), optimized for **iPhone**, with **Russian/English** UI, **light/dark theme**, **email magic link** + **Google** sign-in, data on **Cloudflare** (Worker + **D1** + **R2**).

## Plan (first iteration)

1. Single deployable: **Vite** SPA + **Hono** Worker (`/api/*`) with **static assets** binding.
2. **D1** for users, products, ratings, sharing, family groups; **R2** for up to 3 JPEG/PNG/WebP photos per rating.
3. **Open Food Facts** for barcode/text lookup with graceful failure.
4. **BarcodeDetector** when available, else **@zxing/browser** fallback.
5. **Resend** for magic-link email in production; dev can return link when `ALLOW_DEV_MAGIC_REVEAL=true`.

## Local development

```bash
cd product-rating-pwa
cp .dev.vars.example .dev.vars   # fill JWT_SECRET at minimum
npm install
```

Create local D1 and apply migrations:

```bash
npx wrangler d1 create product-rating-db
# copy database_id into wrangler.toml [[d1_databases]]
npx wrangler d1 migrations apply product-rating-db --local
```

Create R2 bucket (once):

```bash
npx wrangler r2 bucket create product-rating-photos
```

Run **Vite** (5173) and **Worker** (8787) together; the Vite dev server proxies `/api` to the worker:

```bash
npm run dev
```

Open `http://localhost:5173`. Magic-link emails: configure `RESEND_API_KEY` + `RESEND_FROM` in `.dev.vars`, or set `ALLOW_DEV_MAGIC_REVEAL=true` and use the `devMagicLinkUrl` returned by `POST /api/auth/magic-link`.

**Google OAuth**: create a Web client in Google Cloud Console. Authorized redirect URI:

`http://localhost:5173/api/auth/google/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL=http://localhost:5173` in `.dev.vars`.

## Build

```bash
npm run build        # client -> dist/
npm run typecheck
npm run lint
npm test
```

## Deploy to Cloudflare (example domain `rating.ethanoloop.ru`)

1. Set `database_id` in `wrangler.toml` from `wrangler d1 create`.
2. `APP_URL` in `[vars]` or dashboard: `https://rating.ethanoloop.ru`.
3. Set secrets (do not commit):

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY   # optional if using magic link email
```

4. Google OAuth redirect URI: `https://rating.ethanoloop.ru/api/auth/google/callback`.
5. Deploy:

```bash
npm run deploy
```

6. In Cloudflare Dashboard → **Workers & Pages** → your worker → **Custom domains** → add `rating.ethanoloop.ru`.

## Sharing & family

- **Sharing**: invite by email. If the invitee already has an account, access is granted immediately; otherwise a pending invite appears until they sign up and **accept** in **Profile → Sharing**.
- **Family**: owner creates a group and invites by email. Pending members accept from **Family** when the row matches their email. Active members see each other’s ratings for products (same visibility rules as bidirectional “family” in search detail).

## Security notes

- Session **HttpOnly** cookie with signed JWT (`JWT_SECRET` must be long random in production).
- Photo uploads limited to **image/***, max **~1.8 MB** per file, max **3** per rating; served only to owner or users with **share** / **family** visibility.

## Repository layout

- `src/client` — React PWA
- `src/worker` — Hono API
- `migrations/` — D1 SQL
- `.dev.vars.example` — required secrets template

## License

MIT

