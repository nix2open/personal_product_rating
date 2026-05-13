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

### Заполнить удалённую D1 «в один заход» (рекомендуется)

Нужен **API token** в окружении (тот же, что для GitHub Actions, или отдельный с правами D1):

```bash
export CLOUDFLARE_API_TOKEN="ваш_токен"
cd product-rating-pwa
npm run setup:d1
```

Или скопируйте `.env.cf.example` → `.env.cf`, вставьте токен, затем:

```bash
set -a && source .env.cf && set +a && npm run setup:d1
```

Скрипт `scripts/setup-d1.mjs`:

1. Найдёт базу `product-rating-db` в аккаунте или **создаст** её (`wrangler d1 create … --update-config`).
2. Подставит **реальный `database_id`** в `wrangler.toml` (вместо `REPLACE_WITH_YOUR_D1_ID`).
3. Выполнит **`wrangler d1 migrations apply product-rating-db --remote`** — в удалённой D1 появятся все таблицы из `migrations/`.

После этого закоммитьте изменённый `wrangler.toml` и сделайте push (чтобы CI деплой не падал на проверке плейсхолдера).

#### Ошибки `Authentication error [code: 10000]` (D1) и `9106` (`/memberships`)

Обычно **у API Token нет нужных прав** или Wrangler при токене ходит в `/memberships` без нужных User-разрешений.

1. Задайте **account id** (скрипт подставляет его из `wrangler.toml`, если есть строка `account_id`; иначе вручную):

   ```bash
   export CLOUDFLARE_ACCOUNT_ID="a07658b9696c332ed90e69e73c8cdaa1"
   ```

2. Создайте **новый Custom API Token** ([API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Custom Token):

   **Account** → ваш аккаунт:

   - **D1** — *Edit* (без этого будет `10000` на `/d1/database`)
   - **Workers Scripts** — *Edit*
   - **Workers R2 Storage** — *Edit*

   **User** (если мастер показывает блок User):

   - **User Details** — *Read*
   - **Memberships** — *Read* (часто убирает `9106`)

   Обновите значение **GitHub Secret** `CLOUDFLARE_API_TOKEN` и локальный `export CLOUDFLARE_API_TOKEN=...`, затем снова `npm run setup:d1`.

3. Альтернатива: **`npx wrangler login`**, временно **убрать** `CLOUDFLARE_API_TOKEN` из окружения, выполнить `npm run setup:d1`, затем снова использовать токен для CI.

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

### GitHub Actions deploy (после пункта с токеном)

Репозиторий: **Settings → Secrets and variables → Actions**.

**Secrets (обязательно / по желанию):**

| Имя | Назначение |
|-----|------------|
| `CLOUDFLARE_API_TOKEN` | **Обязательно.** API Token с правами Workers + D1 + R2. |
| `CLOUDFLARE_ACCOUNT_ID` | **Рекомендуется** при API token (тот же, что в `wrangler.toml`). Снижает ошибку `9106` на `/memberships`. |

**Variables (рекомендуется):**

| Имя | Назначение |
|-----|------------|
| `APP_URL` | Публичный URL без слэша в конце, например `https://rating.ethanoloop.ru`. Подставляется при деплое (`--var`), чтобы OAuth и cookie `Secure` работали в проде. |

При каждом **push в `main`** workflow `.github/workflows/deploy.yml` собирает клиент и выполняет `wrangler deploy`. В коммите должен быть **реальный** `database_id` D1 (не плейсхолдер), иначе job завершится с явной ошибкой.

Секреты воркера (`JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, …) по-прежнему задаются в Cloudflare (**Workers** → выбранный скрипт → **Settings → Variables and Secrets**) или один раз через `wrangler secret put` с вашей машины — GitHub их не подставляет, пока вы сами не добавите отдельные шаги в workflow.

### Deploy error `10021` — `binding DB of type d1 must have a valid database_id`

Cloudflare rejects deploys until `wrangler.toml` has a **real D1 UUID**, not the placeholder `REPLACE_WITH_YOUR_D1_ID`.

1. Create a database (or reuse an existing name and copy its id):

   ```bash
   npx wrangler d1 create product-rating-db
   npx wrangler d1 list
   ```

2. Put the returned **uuid** into `database_id = "..."` in `wrangler.toml` (same `database_name` as in the create command, unless you intentionally point to another DB).

3. Apply migrations to production: `npx wrangler d1 migrations apply product-rating-db --remote`

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

