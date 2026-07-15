# Customer Portal API

A backend API for a customer-facing portal, built with **Node.js + TypeScript**. Customers can register, log in, manage their profile and password, and place / view / cancel / track orders. Administrators can manage customers and orders via role-protected endpoints.

Built with **Clean Architecture** (Controllers → Services → Repositories), the **Repository Pattern**, **SOLID** principles, and **Dependency Injection**.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node.js 20+ (compiled to CommonJS) |
| Web framework | Express 5 |
| Database | PostgreSQL |
| ORM & migrations | TypeORM (code-first migrations) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| Authorization | Role-based (customer / admin) |
| Validation | Zod (request-boundary validation) |
| Dependency Injection | tsyringe |
| Logging | Pino (structured JSON) |
| API docs | Swagger / OpenAPI at `/api-docs` |
| Caching (bonus) | In-memory (`node-cache`) or Redis |
| Email (bonus) | Nodemailer (console or SMTP) |
| Tests | Jest + Supertest |

> **Note on the brief:** the scenario specifies Node.js, but two requirement lines name **.NET-specific tools** — **Entity Framework Core** and **Serilog** — leftovers from a .NET template. These are replaced with the closest Node-native equivalents, **TypeORM** and **Pino**. The brief's **Dependency Injection** requirement is a language-agnostic pattern, implemented here with **tsyringe**. See `WRITEUP.md`.

---

## Prerequisites

- **Docker Desktop** (recommended — runs everything with one command), **or**
- **Node.js 20+** (24 recommended — see `.nvmrc`) plus **PostgreSQL 14+** if running on the host.

The test suite (`npm test`) needs neither Docker nor a database.

---

## Getting started

First create your environment file (both options need it):

```bash
cp .env.example .env
#   → set JWT_SECRET to a long random value, e.g.  openssl rand -hex 32
```

### Option A — Docker (recommended, one command)

Runs PostgreSQL **and** the API. Migrations and seeding run automatically on startup.

```bash
docker compose up --build
```

That's it — open http://localhost:3000/api-docs. Stop with `Ctrl+C`; add `-d` to run in the background; `docker compose down` to stop (add `-v` to also wipe the database volume).

> With this option, leave `DB_HOST=localhost` in `.env` — the compose file overrides it to `db` (the database's service name) inside the container network for you.

### Option B — Node on the host (hot reload for development)

```bash
npm install
docker compose up -d db      # start just PostgreSQL in Docker (or use a local install)
npm run migration:run        # create the schema (code-first migrations)
npm run seed                 # seed an admin account + sample products
npm run dev                  # start with hot reload
```

The API listens on `http://localhost:3000` (configurable via `PORT`).

### Swagger / OpenAPI

Interactive documentation is generated automatically at runtime:

- **Swagger UI:** http://localhost:3000/api-docs
- **Raw spec (JSON):** http://localhost:3000/api-docs.json

To authorize protected endpoints in Swagger UI: call `POST /api/auth/login`, copy the returned `token`, click **Authorize**, and paste it.

The seeded admin (from `.env`) defaults to `admin@portal.local` / `Admin123!`.

For a full copy-paste walkthrough (register → login → place order → cancel, with example JSON and curl), see [`docs/API_EXAMPLES.md`](docs/API_EXAMPLES.md).

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

## API overview

Base path: `/api`. All customer/admin endpoints require `Authorization: Bearer <JWT>`.

### Auth
| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a customer |
| POST | `/api/auth/login` | Log in, receive a JWT |

### Customer (self-service)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/customers/me` | View profile |
| PATCH | `/api/customers/me` | Update name / phone / address |
| PATCH | `/api/customers/me/password` | Change password |

### Orders
| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/products` | List products (for placing orders) |
| GET | `/api/orders` | List my orders (paginated) |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/:id` | View one of my orders |
| GET | `/api/orders/:id/status` | Track order status (cached) |
| PATCH | `/api/orders/:id/cancel` | Cancel (only while `Pending`) |

### Admin (role = admin)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/admin/customers` | List all customers (paginated) |
| DELETE | `/api/admin/customers/:id` | Delete a customer |
| PATCH | `/api/admin/customers/:id/deactivate` | Deactivate a customer |
| GET | `/api/admin/orders` | List all orders (paginated) |
| PATCH | `/api/admin/orders/:id/status` | Update order status |

### Ops
| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| GET | `/api-docs` | Swagger UI |

Pagination uses `?page=<n>&limit=<n>` and returns `{ data, page, limit, total, totalPages }`.

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

Dependencies point **inward**: services depend only on repository/port *interfaces*, so the business logic is fully decoupled from TypeORM and Express.

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

---

## Testing

```bash
npm test
```

The suite spins up the real Express app wired to **in-memory repository implementations** (via the same DI tokens used in production), so it runs fast with **no database or Docker required**. It covers registration, login, profile & password updates, order placement/cancellation rules, ownership checks, pagination, and role-based authorization.
