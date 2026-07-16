# Customer Portal API

A backend API for a customer-facing portal, built with **Node.js + TypeScript**. Customers register, log in, manage their profile and password, and place / view / cancel / track orders. Administrators manage customers and orders via role-protected endpoints.

Built with **Clean Architecture** (Controllers → Services → Repositories), the **Repository Pattern**, **SOLID** principles, and **Dependency Injection**.

> **Note on the brief:** the scenario specifies Node.js, but two requirement lines name **.NET-specific tools** — **Entity Framework Core** and **Serilog** — leftovers from a .NET template. These are implemented with the closest Node-native equivalents, **TypeORM** and **Pino**. The brief's **Dependency Injection** requirement is a language-agnostic pattern, implemented here with **tsyringe**. Rationale is in [`WRITEUP.md`](WRITEUP.md).

---

## Quick start (for reviewers)

You need **Docker Desktop** — that's the only prerequisite (Node and PostgreSQL are not required on your machine; see the note at the bottom of this section). From the repo root:

```bash
cp .env.example .env       # ready to run as-is; ships a working dev JWT_SECRET
docker compose up --build
```

This starts PostgreSQL **and** the API, runs migrations, and seeds an admin + sample products automatically. When you see `Customer Portal API listening…`, open:

**→ http://localhost:3000/api-docs** (interactive Swagger UI)

Log in with the seeded admin **`admin@portal.local` / `Admin123!`**, click **Authorize**, and you can exercise every endpoint. A full click-by-click walkthrough (register → login → place order → cancel, with example JSON) is in **[`docs/API_EXAMPLES.md`](docs/API_EXAMPLES.md)**.

Stop with `Ctrl+C`. `docker compose down` removes the containers; add `-v` to also wipe the database volume.

> **Prefer not to use Docker?** The project also runs directly on Node against a local/hosted PostgreSQL — please reach out and I'll share the host-run steps. To just run the tests, you need **neither Docker nor a database**: `npm install && npm test`.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node.js 20+ (24 recommended, see `.nvmrc`; compiled to CommonJS) |
| Web framework | Express 5 |
| Database | PostgreSQL |
| ORM & migrations | TypeORM (code-first migrations) |
| Auth / authorization | JWT (`jsonwebtoken`) + `bcryptjs`; role-based (customer / admin) |
| Validation | Zod (request-boundary validation) |
| Dependency Injection | tsyringe |
| Logging | Pino (structured JSON) |
| API docs | Swagger / OpenAPI at `/api-docs` |
| Caching (bonus) | In-memory (`node-cache`) or Redis |
| Email (bonus) | Nodemailer (console or SMTP) |
| Tests | Jest + Supertest |

---

## Running it

`cp .env.example .env`, then `docker compose up --build` (see [Quick start](#quick-start-for-reviewers) above). This runs PostgreSQL **and** the API; migrations and seeding run on startup. Open http://localhost:3000/api-docs. Add `-d` to run detached.

Leave `DB_HOST=localhost` in `.env` — the compose file overrides it to the database's service name (`db`) inside the container network for you.

> A Node-on-the-host workflow (hot reload against a local PostgreSQL) is also supported; ask me if you'd prefer to run it that way instead of Docker.

### Swagger / OpenAPI

- **Swagger UI:** http://localhost:3000/api-docs
- **Raw spec (JSON):** http://localhost:3000/api-docs.json

To call protected endpoints: `POST /api/auth/login`, copy the returned `token`, click **Authorize**, paste it. Seeded admin: `admin@portal.local` / `Admin123!`.

---

## API overview

Base path: `/api`. All customer/admin endpoints require `Authorization: Bearer <JWT>`. Pagination uses `?page=<n>&limit=<n>` and returns `{ data, page, limit, total, totalPages }`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a customer |
| POST | `/api/auth/login` | Log in, receive a JWT |
| GET | `/api/customers/me` | View own profile |
| PATCH | `/api/customers/me` | Update name / phone / address |
| PATCH | `/api/customers/me/password` | Change password |
| GET | `/api/products` | List products (for placing orders) |
| GET | `/api/orders` | List my orders (paginated) |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/:id` | View one of my orders |
| GET | `/api/orders/:id/status` | Track order status (cached) |
| PATCH | `/api/orders/:id/cancel` | Cancel (only while `Pending`) |
| GET | `/api/admin/customers` | **Admin** — list all customers (paginated) |
| DELETE | `/api/admin/customers/:id` | **Admin** — delete a customer |
| PATCH | `/api/admin/customers/:id/deactivate` | **Admin** — deactivate a customer |
| GET | `/api/admin/orders` | **Admin** — list all orders (paginated) |
| PATCH | `/api/admin/orders/:id/status` | **Admin** — update order status |
| GET | `/health` | Liveness probe |
| GET | `/api-docs` | Swagger UI |

---

## NPM scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint |
| `npm test` | Run the Jest/Supertest suite (no DB required) |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:generate` | Generate a migration from entity changes (needs a running DB) |
| `npm run migration:revert` | Revert the last migration |
| `npm run seed` | Seed admin + sample products |

---

## Testing

```bash
npm test
```

The suite spins up the real Express app wired to **in-memory repository implementations** (via the same DI tokens used in production), so it runs fast with **no database or Docker required**. It covers registration, login, profile & password updates, order placement/cancellation rules, ownership checks, pagination, and role-based authorization.

---

## Project structure

```
src/
  domain/          # Framework-free core: models, enums, repository interfaces, errors
  application/     # Use cases (services), DTOs, Zod validators, outbound ports
  infrastructure/  # TypeORM entities/repositories, config, logging, cache, email, security
  presentation/    # Express controllers, routes, middlewares, Swagger
  container.ts     # Composition root (DI wiring)
  app.ts           # Express app assembly (no listen)
  server.ts        # Bootstrap: connect DB, start server
tests/             # Supertest suite against in-memory repositories
```

Dependencies point **inward**: services depend only on repository/port *interfaces*, so the business logic is fully decoupled from TypeORM and Express. See [`WRITEUP.md`](WRITEUP.md) for the design decisions and how each brief requirement is satisfied.

---

## Configuration (environment variables)

See `.env.example` for the full list. Key ones:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_*` | postgres/localhost | Database connection |
| `JWT_SECRET` | — | **Required**; must be ≥16 chars |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `CACHE_DRIVER` | `memory` | `memory` or `redis` |
| `EMAIL_DRIVER` | `console` | `console` (logs) or `smtp` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@portal.local / Admin123! | Seeded admin |
