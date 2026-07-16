# Customer Portal API

A backend API for a customer-facing portal, built with **Node.js + TypeScript**. Customers register, log in, manage their profile and password, and place / view / cancel / track orders. Administrators manage customers and orders via role-protected endpoints.

Built with **Clean Architecture**, the **Repository Pattern**, **SOLID** principles, and **Dependency Injection**.

> **Note on the brief:** the scenario specifies Node.js, while two requirement lines name **.NET-only tools** — **Entity Framework Core** and **Serilog**. Neither runs on Node, so I read each as naming a *capability* rather than a product: an ORM with code-first migrations, and structured logging. Those map to **TypeORM** and **Pino**. **Dependency Injection** is a language-agnostic pattern, implemented with **tsyringe**. Full reasoning in [`WRITEUP.md`](WRITEUP.md).

---

## Quick start

**Docker Desktop is the only prerequisite** — Node and PostgreSQL aren't needed on your machine.

```bash
cp .env.example .env                        # ready to run as-is
docker compose --profile logs up --build    # everything, one command
```

Migrations apply and an admin + sample products are seeded automatically. When you see `Customer Portal API listening…`:

| | URL | What |
| --- | --- | --- |
| 📘 | **http://localhost:3000** | **Swagger UI** — the API (raw spec at `/api-docs.json`) |
| 📬 | **http://localhost:8025** | **Mailpit** — the order emails, actually delivered |
| 📋 | **http://localhost:8080** | **Dozzle** — live log viewer |

In Swagger, log in via `POST /api/auth/login` as **`admin@portal.local` / `Admin123!`**, copy the `token`, click **Authorize**, and every endpoint is exercisable. A click-by-click walkthrough is in **[`docs/API_EXAMPLES.md`](docs/API_EXAMPLES.md)**.

Stop with `Ctrl+C`; `docker compose --profile logs down -v` removes the containers and the database volume.

**Tests need neither Docker nor a database:** `npm install && npm test`.

<details>
<summary>Other ways to run it</summary>

- `docker compose up --build` — same, minus the log viewer (`docker compose logs -f api` shows the same output).
- `docker compose --profile redis up -d` — adds Redis, for `CACHE_DRIVER=redis`. Profiles combine.
- Node on the host (hot reload) against a local PostgreSQL is also supported — ask and I'll share the steps.

Leave `DB_HOST=localhost` in `.env`: compose overrides it to the `db` service name inside the container network (same for `SMTP_HOST` → `mailpit`).

</details>

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node.js 20+ (24 recommended, see `.nvmrc`) |
| Web framework | Express 5 |
| Database | PostgreSQL |
| ORM & migrations | TypeORM (code-first migrations) |
| Auth / authorization | JWT (`jsonwebtoken`) + `bcryptjs`; role-based (customer / admin) |
| Validation | Zod (request-boundary validation) |
| Dependency Injection | tsyringe |
| Logging | Pino (structured JSON) |
| API docs | Swagger / OpenAPI at `/api-docs` |
| Caching (bonus) | In-memory (`node-cache`) or Redis |
| Email (bonus) | Nodemailer + Mailpit inbox |
| Tests | Jest + Supertest |

---

## API overview

Base path: `/api`. All customer/admin endpoints require `Authorization: Bearer <JWT>`. Listing endpoints take `?page=&limit=` and return `{ data, page, limit, total, totalPages }`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a customer |
| POST | `/api/auth/login` | Log in, receive a JWT |
| GET | `/api/customers/me` | View own profile |
| PATCH | `/api/customers/me` | Update name / phone / address |
| PATCH | `/api/customers/me/password` | Change password |
| GET | `/api/products` | List products (for placing orders) |
| GET | `/api/orders` | List my orders |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/:id` | View one of my orders |
| GET | `/api/orders/:id/status` | Track order status (cached) |
| PATCH | `/api/orders/:id/cancel` | Cancel (only while `Pending`) |
| GET | `/api/admin/customers` | **Admin** — list all customers |
| DELETE | `/api/admin/customers/:id` | **Admin** — delete a customer |
| PATCH | `/api/admin/customers/:id/deactivate` | **Admin** — deactivate a customer |
| GET | `/api/admin/orders` | **Admin** — list all orders |
| PATCH | `/api/admin/orders/:id/status` | **Admin** — update order status |
| GET | `/health` | Liveness probe |

Order status follows one lifecycle — `Pending → Shipped → Delivered`, `Pending → Cancelled`, with `Delivered` and `Cancelled` terminal. Any other move is `409`.

---

## Bonus features

**Logging** — one line per request plus explicit events (`Customer logged in`, `Failed login attempt`, `Order placed`, `Order status updated by admin`, …). Credentials and `Authorization` headers are redacted. `LOG_PRETTY` gives human-readable lines; unset it in production for JSON. There's deliberately **no log endpoint** — logs carry customer emails and login events, so they stay operator-only (hence Dozzle).

```
[15:58:36] INFO: Customer logged in
    email: "admin@portal.local"
[15:58:36] INFO: POST /api/auth/login → 200
```

**Email** — HTML notifications (greeting, itemised table, total, footer, plus a plain-text alternative) on order **placed** and **shipped**. Delivered for real to Mailpit at **http://localhost:8025**; point `SMTP_*` at any provider instead. Send failures are caught, so a dead mail server never fails the order.

**Caching** — profiles and order statuses, 60s TTL, with **write-invalidation** so a cached read is never stale. In-memory by default, Redis-swappable. A hit is indistinguishable from a miss in the response, so the tests pin the behaviour instead: a hit still enforces ownership, and status changes show up immediately.

**Pagination** — on every listing endpoint.

---

## Input validation

Every body, query and path parameter is validated by Zod at the HTTP boundary. The rule: **a client error must never surface as a `500`** — a `500` means *we* broke, and saying it for bad input misleads the caller and buries genuine faults.

| Input | Response |
| --- | --- |
| Malformed JSON, or a non-object body | `400` |
| Body over 100 KB | `413` |
| Unknown field (e.g. `"role": "admin"` on register) | `422` — rejected, not silently dropped |
| `quantity: "2"`, `1.5`, `0`, `-1`, `1001` | `422` |
| `page=abc`, `limit=5000` | `422` |
| Phone outside 7–15 digits (E.164) | `422` |
| Same product on two order lines | `422` |
| Unknown order status | `422`, listing the valid ones |

Prices and totals are never accepted from the client — they're computed server-side from the catalogue.

---

## Testing

```bash
npm test    # 34 tests, no database or Docker required
```

The suite runs the **real Express app** wired to in-memory repositories through the production DI tokens — possible precisely because services depend on interfaces, not TypeORM. It covers auth, profile and password flows, validation, the order lifecycle, ownership, pagination, role-based authorization, and logging.

---

## Project structure

```
src/
  domain/          # Framework-free core: models, enums, repository interfaces, errors
  application/     # Use cases (services), DTOs, Zod validators, email templates, ports
  infrastructure/  # TypeORM entities/repositories, config, logging, cache, email, security
  presentation/    # Express controllers, routes, middlewares, Swagger
  container.ts     # Composition root (DI wiring)
  app.ts           # Express app assembly (no listen)
  server.ts        # Bootstrap: connect DB, start server
tests/             # Supertest suite against in-memory repositories
```

Migrations live in `src/infrastructure/database/migrations/` and run automatically on startup.

Dependencies point **inward**: services depend only on repository/port *interfaces*, so business logic is decoupled from TypeORM and Express. See [`WRITEUP.md`](WRITEUP.md) for the design decisions.

---

## NPM scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled build |
| `npm run typecheck` / `npm run lint` | Type-check / ESLint |
| `npm test` | Jest + Supertest suite (no DB required) |
| `npm run migration:run` / `:generate` / `:revert` | Apply / generate / revert migrations |
| `npm run seed` | Seed admin + sample products |

---

## Configuration

See `.env.example` for the full list. Key ones:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_*` | postgres/localhost | Database connection |
| `JWT_SECRET` | — | **Required**; must be ≥16 chars |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `LOG_PRETTY` | on in dev | Human-readable logs; unset in production for JSON |
| `CACHE_DRIVER` | `memory` | `memory` or `redis` |
| `EMAIL_DRIVER` | `smtp` | `smtp` (Mailpit by default) or `console` (logs) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@portal.local / Admin123! | Seeded admin |
