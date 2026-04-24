# Product Rating PWA

## Что есть в приложении

- UI в стиле Apple/YAZIO: чистые карточки, минимализм, mobile-first.
- Аккаунт: email + nickname, JWT auth и refresh tokens.
- Каталог продуктов с поиском и категориями.
- Штрихкод необязателен.
- Оценки: общий рейтинг `0..10` + опционально `вкус/качество/цена (0..10)`.
- Фото продукта и голосовая заметка.
- Shared-доступ по списку email (`viewer`/`editor`).
- Просмотр рейтингов других пользователей по выбранному продукту.
- Модульная система поощрений + админка правил наград.
- PWA + сканер штрихкода через ZXing (камера).

## Stack

- Frontend: React + TypeScript + Vite + PWA.
- Backend: Node.js + Express + Zod + JWT.
- DB: PostgreSQL.
- Infra: Docker Compose + Nginx reverse proxy.

## Быстрый старт

```bash
cd /Users/n.fedorenko/Cursor_projects/product-rating-pwa
cp .env.example .env
docker compose down -v
docker compose up --build -d
```

Open:
- Web: `http://localhost:8080`
- Health: `http://localhost:8080/health-api`

Stop:
```bash
docker compose down
```

## Seed users

- `demo@local.dev` / `DemoPass123!` (admin)
- `friend@local.dev` / `FriendPass123!`

## API (основное)

- `POST /api/auth/register` (email, nickname, password)
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/me` (смена nickname)
- `GET /api/meta/categories`
- `GET /api/products?q=&category=`
- `POST /api/products`
- `PUT /api/products/:id`
- `GET /api/products/:id/ratings`
- `POST /api/shares` (emails[], role)
- `GET /api/shares`
- `GET /api/rewards/me`
- `GET /api/admin/reward-rules` (admin)
- `POST /api/admin/reward-rules` (admin)
- `POST /api/admin/rewards/recalculate` (admin)
- `POST /api/uploads/photo`

## HTTPS на `rate.ethanoloop.ru` (Cloudflare)

### 1) DNS в Cloudflare

В зоне `ethanoloop.ru` добавь запись:
- Type: `A`
- Name: `rate`
- IPv4: `IP твоего сервера`
- Proxy status: `Proxied` (оранжевое облако)

### 2) Подними app на сервере

```bash
cd /opt/product-rating-pwa
cp .env.example .env
docker compose up --build -d
```

Проверь локально на сервере:
```bash
curl -sS http://localhost:8080/health-api
```

### 3) Пробросить через Cloudflare Tunnel (рекомендованный вариант)

Установка:
```bash
curl -fsSL https://pkg.cloudflare.com/install.sh | sudo bash
sudo apt-get update && sudo apt-get install -y cloudflared
```

Логин и создание туннеля:
```bash
cloudflared tunnel login
cloudflared tunnel create rate-pwa
```

Создай конфиг `/etc/cloudflared/config.yml`:
```yaml
tunnel: rate-pwa
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: rate.ethanoloop.ru
    service: http://localhost:8080
  - service: http_status:404
```

Привяжи DNS к tunnel:
```bash
cloudflared tunnel route dns rate-pwa rate.ethanoloop.ru
```

Запусти как сервис:
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

### 4) SSL mode в Cloudflare

В Cloudflare -> SSL/TLS -> Overview:
- `Full` или `Full (strict)` (если origin cert настроен)

После этого приложение доступно по:
- `https://rate.ethanoloop.ru`

И на iPhone камера/сканер работают стабильно (Safari secure context).

## Smoke tests

```bash
curl -sS http://localhost:8080/health-api
```

```bash
curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@local.dev","password":"DemoPass123!"}'
```
