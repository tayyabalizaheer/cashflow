# Cash Flow

Cash Flow is a Node.js Progressive Web App for personal finance tracking: expenses, loans and repayments, investments with NAV-aware valuation, assets, configurable Zakat estimates, CSV export, and multi-currency records.

## Stack

- Web: React, TypeScript, Vite, React Router, TanStack Query, Recharts, PWA service worker
- API: Node.js, TypeScript, Express, Zod validation, JWT access tokens, rotating refresh-token cookies
- Backend database: MySQL, Prisma ORM, fixed-precision `Decimal` money values
- Frontend database: browser SQLite through `sql.js` for fast local access and offline entries
- Quality: Vitest, Supertest, ESLint, Prettier, Docker Compose, GitHub Actions

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment:

   ```bash
   cp .env.example .env
   ```

   Database settings are split into `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and `DATABASE_NAME`. The API builds Prisma's internal connection URL from those values.

3. Start MySQL:

   ```bash
   docker compose up -d mysql
   ```

4. Generate Prisma client and run MySQL migrations:

   ```bash
   npm run prisma:generate --workspace @cash-flow/api
   npm run db:migrate
   ```

5. Seed demo data:

   ```bash
   npm run db:seed
   ```

   Demo login:

   - Email: `demo@cashflow.local`
   - Password: `DemoPassword123`

6. Start the app:

   ```bash
   npm run dev --workspace @cash-flow/api
   npm run dev --workspace @cash-flow/web
   ```

   Web: `http://localhost:5173`
   API: `http://localhost:4000/api/v1`
   API docs: `http://localhost:4000/api/docs`

   If port `4000` is occupied, set `PORT` and `VITE_API_URL` in `.env` and `apps/web/.env.local`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment

For deployment, build the frontend first and then the API:

```bash
npm run build:deploy
npm run db:migrate
npm start
```

The API server serves the built frontend from `apps/web/dist` in production, so one public server can handle both the app and `/api/v1` routes. Leave `VITE_API_URL` empty for same-domain deployment, or set it only when the API is hosted on a different domain.

## Docker

```bash
docker compose up --build
```

The Docker setup exposes the API service on port `4000`; that service also serves the built frontend in production.

## Stock Scraper Source

The stock job fetches Al Meezan fund prices on startup and at the configured schedule. Install Chromium on Ubuntu if the server needs browser fallback:

```bash
sudo apt install -y chromium-browser
```

## API Surface

All protected endpoints require `Authorization: Bearer <access-token>`.

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET|PUT /api/v1/profile`
- `GET|POST|PUT|DELETE /api/v1/categories`
- `GET|POST|PUT|DELETE /api/v1/expenses`
- `GET|POST|PUT|DELETE /api/v1/loans`
- `POST /api/v1/loans/:loanId/repayments`
- `GET|POST|PUT|DELETE /api/v1/investments`
- `GET|POST|PUT|DELETE /api/v1/assets`
- `GET|POST|PUT /api/v1/exchange-rates`
- `GET /api/v1/dashboard`
- `GET|POST /api/v1/zakat/calculations`
- `GET /api/v1/sync/bootstrap`
- `GET /api/v1/sync/status`
- `POST /api/v1/sync/push`
- `GET /api/v1/exports/:module.csv`

## Security Notes

- Passwords are hashed with Argon2id.
- Access tokens are short lived and returned to the client; refresh tokens are opaque, hashed in the database, rotated, and stored in `HttpOnly` cookies.
- Financial queries include `userId` ownership filters.
- Money is stored through Prisma `Decimal` in MySQL.
- CSV export prefixes formula-like cells to reduce spreadsheet injection risk.
- Auth responses avoid user enumeration for password reset.
- MySQL is the source of truth on the backend.
- After login, owner-scoped server data is fetched into browser SQLite with visible progress.
- New frontend entries can be queued in browser SQLite and retried when the API is reachable.

## Current State

This is a working production-oriented scaffold, not a finished personal-finance product. It includes the app foundation, MySQL backend schema, browser SQLite local store, real API routes, PWA setup, offline mutation queue, core calculations, Docker, CI, and tests. Remaining work should focus on full create/edit forms in the web app, email provider integration, online server conflict resolution, Playwright end-to-end tests, and deeper reporting screens.
