# Cash Flow

Cash Flow is a Node.js Progressive Web App for personal finance tracking: expenses, loans and repayments, investments with NAV-aware valuation, assets, configurable Zakat estimates, CSV export, and multi-currency records.

## Stack

- Web: React, TypeScript, Vite, React Router, TanStack Query, Recharts, PWA service worker
- API: Node.js, TypeScript, Express, Zod validation, JWT access tokens, rotating refresh-token cookies
- Database: SQLite, Prisma ORM, fixed-precision `Decimal` money values
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

3. Generate Prisma client and run SQLite migrations:

   ```bash
   npm run prisma:generate --workspace @cash-flow/api
   npm run db:migrate
   ```

4. Seed demo data:

   ```bash
   npm run db:seed
   ```

   Demo login:

   - Email: `demo@cashflow.local`
   - Password: `DemoPassword123`

5. Start the app:

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

## Docker

```bash
docker compose up --build
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
- `GET /api/v1/exports/:module.csv`

## Security Notes

- Passwords are hashed with Argon2id.
- Access tokens are short lived and returned to the client; refresh tokens are opaque, hashed in the database, rotated, and stored in `HttpOnly` cookies.
- Financial queries include `userId` ownership filters.
- Money is stored through Prisma `Decimal` in SQLite.
- CSV export prefixes formula-like cells to reduce spreadsheet injection risk.
- Auth responses avoid user enumeration for password reset.
- After login, financial mutations can be queued locally when offline and retried when the API is reachable again.

## Current State

This is a working production-oriented scaffold, not a finished personal-finance product. It includes the app foundation, SQLite database schema, real API routes, PWA setup, offline mutation queue, core calculations, Docker, CI, and tests. Remaining work should focus on full create/edit forms in the web app, email provider integration, online server conflict resolution, Playwright end-to-end tests, and deeper reporting screens.
