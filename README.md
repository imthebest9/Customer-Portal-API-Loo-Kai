# Customer Portal API

A backend API for a customer-facing portal, built with **Node.js + TypeScript**. Customers register, log in, manage their profile and password, and place / view / cancel / track orders. Administrators manage customers and orders via role-protected endpoints.

Built with **Clean Architecture** (Controllers → Services → Repositories), the **Repository Pattern**, **SOLID** principles, and **Dependency Injection**.

> **Note on the brief:** the scenario specifies Node.js, while two requirement lines name **.NET-only tools** — **Entity Framework Core** and **Serilog**. Neither runs on Node, so I read each as naming a *capability* rather than a product: an ORM with code-first migrations, and structured logging. Those map to **TypeORM** and **Pino**, which is what's used here. **Dependency Injection** is a language-agnostic pattern, implemented with **tsyringe**. Full reasoning in [`WRITEUP.md`](WRITEUP.md).

---

## Quick start (for reviewers)

You need **Docker Desktop** — that's the only prerequisite (Node and PostgreSQL are not required on your machine; see the note at the bottom of this section). From the repo root:

```bash
cp .env.example .env                        # ready to run as-is; ships a working dev JWT_SECRET
docker compose --profile logs up --build    # everything, one command
```

That single command starts PostgreSQL, the API, a mail server and a log viewer, then runs migrations and seeds an admin + sample products automatically. When you see `Customer Portal API listening…`, everything below is live:

| | URL | What |
| --- | --- | --- |
| 📘 | **http://localhost:3000** | **Swagger UI** — the API (redirects to `/api-docs`) |
| 📬 | **http://localhost:8025** | **Mailpit** — the order emails, actually delivered |
| 📋 | **http://localhost:8080** | **Dozzle** — live log viewer |

Log in with the seeded admin **`admin@portal.local` / `Admin123!`**, click **Authorize**, and you can exercise every endpoint. A full click-by-click walkthrough (register → login → place order → cancel, with example JSON) is in **[`docs/API_EXAMPLES.md`](docs/API_EXAMPLES.md)**.

> Plain `docker compose up --build` also works — it starts the API, database and mail server, just without the log viewer (`docker compose logs -f api` shows the same thing in your terminal).

Stop with `Ctrl+C`. `docker compose --profile logs down` removes the containers; add `-v` to also wipe the database volume.

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
| Email (bonus) | Nodemailer (console or SMTP; Mailpit inbox included for demos) |
| Tests | Jest + Supertest |

---

## Running it

`cp .env.example .env`, then `docker compose --profile logs up --build` (see [Quick start](#quick-start-for-reviewers) above). Migrations and seeding run on startup. Open http://localhost:3000. Add `-d` to run detached.

Leave `DB_HOST=localhost` in `.env` — the compose file overrides it to the database's service name (`db`) inside the container network for you.

**Mailpit** (the mail server behind http://localhost:8025) starts with `docker compose up`. Two services sit behind profiles:

| Command | Starts | At |
| --- | --- | --- |
| `docker compose --profile logs up -d` | Dozzle — a live web log viewer | http://localhost:8080 |
| `docker compose --profile redis up -d` | Redis, for `CACHE_DRIVER=redis` | `localhost:6379` |

Profiles combine, so `--profile logs --profile redis up -d` starts both. All are covered in [Bonus features](#bonus-features-logging-email-caching) below.

> A Node-on-the-host workflow (hot reload against a local PostgreSQL) is also supported; ask me if you'd prefer to run it that way instead of Docker.

### Swagger / OpenAPI

- **Swagger UI:** http://localhost:3000/api-docs — or just http://localhost:3000, which redirects here
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

## Input validation

Every request body, query and path parameter is validated by Zod at the HTTP boundary before a controller runs. The rule the design follows: **a client error must never surface as a `500`.** A `500` means *we* broke; saying it when the caller sent bad JSON both misleads them and buries genuine faults in noise.

| Input | Response |
| --- | --- |
| Malformed JSON, or a non-object body | `400 BadRequestError` |
| Body over 100 KB | `413 PayloadTooLargeError` |
| Unknown field (e.g. `"role": "admin"` on register) | `422` — rejected, not silently dropped |
| `quantity: "2"`, `1.5`, `0`, `-1`, `1001` | `422` with a per-field message |
| `page=abc`, `limit=5000` | `422` |
| Phone outside 7–15 digits | `422` |
| Same product on two order lines | `422` |
| Unknown order status | `422`, listing the valid ones |

Bodies are **strict**: an unrecognised field is an error rather than an ignored key, so typos get reported and a hopeful `"role": "admin"` gets a straight answer. Prices and totals are never accepted from the client — they're computed server-side from the catalogue.

---

## Bonus features: logging, email, caching

All three are on by default and need no extra setup. This section is about **seeing them work**.

### Logging (Pino — the brief's "Serilog")

Logs go to stdout, so they're simply the container output:

```bash
docker compose logs -f api                 # follow
docker compose logs api | grep "logged in" # or Select-String on PowerShell
```

They look like this — one line per request, plus the events worth reading:

```
[15:58:36] INFO: Customer logged in
    customerId: "bf182401-7286-48f0-a12b-1b7fdd5b5e88"
    email: "admin@portal.local"
[15:58:36] INFO: POST /api/auth/login → 200
[15:58:36] INFO: Order status updated by admin
    orderId: "4dd36fb2-7404-40a5-a7b6-2e59fe602fac"
    status: "Shipped"
[15:58:36] INFO: PATCH /api/admin/orders/4dd36fb2-…/status → 200
```

`LOG_PRETTY=true` (set in `.env.example`) renders those human-readable lines. **Unset it in a real deployment** and the same events come out as structured JSON, which is what a log aggregator wants. Swagger's asset requests and the health probe are skipped — otherwise they'd be most of the volume and none of the signal.

Every HTTP request is logged, plus the important events the brief names:

| Event | Level |
| --- | --- |
| `Customer registered`, `Customer logged in` | info |
| `Failed login attempt` | warn |
| `Order placed`, `Order cancelled` | info |
| `Order status updated by admin` | info |
| `Customer deactivated by admin`, `Customer deleted by admin` | info |
| Unhandled errors (from the global error handler) | error |

`Authorization` headers and any `password` / `passwordHash` field are redacted to `[REDACTED]`, so credentials never reach the logs.

> **Prefer a web UI?** `docker compose --profile logs up -d` starts [Dozzle](https://dozzle.dev) at **http://localhost:8080** — a live, searchable log viewer. It's a separate operator tool by design: the API deliberately exposes **no** log endpoint, since logs contain customer emails and login events and don't belong on a public API surface.

### Email notifications

Sent when an order is **placed** and when it's marked **Shipped** — real HTML emails with a greeting, an itemised table, the order total and a footer, each with a plain-text alternative for clients that refuse HTML.

**They're actually delivered, out of the box.** `docker compose up` starts [Mailpit](https://mailpit.axllent.org) alongside the API, and `EMAIL_DRIVER=smtp` is the default, so:

1. Place an order in Swagger (then have an admin mark it `Shipped`).
2. Open **http://localhost:8025** — both emails are sitting in the inbox.

No account and no internet needed. For a real provider (Mailtrap, SendGrid, Gmail), put its host/port/credentials in the `SMTP_*` variables and set `SMTP_SECURE=true` if it requires TLS. Sending failures are caught and logged, so a dead mail server never fails the order itself.

`EMAIL_DRIVER=console` is the alternative — it logs each message instead of sending, which is what you want when running on the host with no SMTP server around.

### Caching

Customer profiles and order statuses are cached (default 60s TTL, `CACHE_TTL_SECONDS`), with **write-invalidation**: updating a profile, cancelling an order, or an admin changing a status drops the entry immediately, so a cached read is never stale. `CACHE_DRIVER=memory` (default, no external service) or `redis` — `docker compose --profile redis up -d`.

A cache hit is deliberately indistinguishable from a miss in the response, so the *behaviour* is what's worth verifying, and the test suite pins it: a hit still enforces ownership (`403`, no cross-customer leak), an admin status change shows up immediately, and deactivation invalidates the profile entry.

To *see* the cache working, set `logging: ['query']` in `src/infrastructure/database/data-source.ts`, run `npm run dev`, and call `GET /api/orders/{id}/status` twice — SQL on the first call, silence on the second.

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
| `LOG_PRETTY` | on in dev | Human-readable logs; unset in production for JSON |
| `CACHE_DRIVER` | `memory` | `memory` or `redis` |
| `EMAIL_DRIVER` | `smtp` | `smtp` (Mailpit by default) or `console` (logs) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@portal.local / Admin123! | Seeded admin |
