# CLAUDE.md

Guidance for AI agents (and humans) working in this repository.

## What this is

A **Customer Portal API** — the backend for a customer-facing portal. Customers register, log in (JWT), manage their profile/password, and place / view / cancel / track orders. Admins manage customers and orders via role-protected endpoints.

The original brief is **`Technical_Scenario_API 2.docx`** at the repo root (gitignored — it stays out of the public repo). Treat it as the source of truth for *what* the API must do. `README.md` covers how to run it; `WRITEUP.md` explains the design decisions.

## Brief → implementation substitutions

The brief says "using NodeJS" while two requirement lines name .NET-only tools. Neither runs on Node, so each is read as naming a **capability**, not a product. Keep using the right-hand column:

| Brief (.NET) | Used here |
| --- | --- |
| Entity Framework Core | **TypeORM** (code-first migrations, entities, repository pattern) |
| Serilog | **Pino** (structured JSON logging) |

**Dependency Injection** is a language-agnostic pattern, not a .NET tool: implemented with **tsyringe** (composition root `src/container.ts`). Other choices: **TypeScript** → CommonJS, **Express 5**, **PostgreSQL**, **Zod**, **bcryptjs** + **jsonwebtoken**.

## Architecture — the one rule that matters

Clean Architecture with dependencies pointing **inward**:

- `src/domain/` — framework-free models, enums, **repository interfaces**, `AppError` hierarchy. Imports nothing from Express/TypeORM.
- `src/application/` — use-case **services**, DTOs, Zod validators, email templates, and outbound **ports** (`ILogger`, `ICacheService`, `IEmailService`, `ITokenService`, `IHasher`).
- `src/infrastructure/` — implementations: TypeORM entities/repositories, config, logging, cache, email, security.
- `src/presentation/http/` — Express controllers, routes, middlewares, Swagger.

**Services must never import TypeORM or Express.** They depend on repository interfaces (`src/domain/repositories/*`) and ports (`src/application/ports/*`), bound to implementations in `src/container.ts`. This is what makes the app testable without a database.

## Commands

```bash
npm run dev            # hot reload (tsx)
npm run build          # compile to dist/     |  npm start — run the build
npm run typecheck      # tsc --noEmit         |  npm run lint — eslint
npm test               # jest + supertest (NO database needed)
npm run migration:run  # apply migrations (needs a running Postgres)
npm run migration:generate  # generate from entity changes (needs a running DB)
npm run seed           # seed admin + sample products

docker compose up --build    # EVERYTHING: Swagger :3000, Mailpit :8025, Dozzle :8080
docker compose down -v       # remove it all, including the database volume
docker compose up -d db      # only Postgres, then `npm run dev` on the host
```

**Which optional services start is `COMPOSE_PROFILES` in `.env`** (ships as `logs`; `logs,redis` adds Redis). Deliberately not a `--profile` flag on the command line: `down` without the same flag removes the shared network while leaving profile containers attached to it, which breaks them with `network <id> not found`. Reading it from `.env` means plain `up`/`down` always cover the same set.

Always run `npm run typecheck && npm run lint && npm test` before considering a change done.

## Testing

Tests live in `tests/` and use **Supertest against the real Express app wired to in-memory repositories** (`tests/fakes/in-memory-repositories.ts`), registered through the same DI tokens as production (`tests/helpers/build-test-app.ts`). **No PostgreSQL or Docker required.** `tests/setup-env.ts` sets env vars before modules load. Prefer exercising the real service/controller stack over mocking internals.

## Conventions & gotchas (learned the hard way)

- **Controllers need explicit `@inject()`.** The `tsx`/esbuild dev runner does **not** emit `design:paramtypes` metadata (only `ts-jest` does). Any class resolved by tsyringe with a bare class-typed constructor param fails at runtime with *"TypeInfo not known"*. Controllers use `@inject(SomeService)` on every param; services/repositories use `@inject(TOKENS.X)`. TypeORM entities avoid the trap via an explicit `type:` on every `@Column`.
- **DI tokens** for interfaces live in `src/shared/tokens.ts` (interfaces don't exist at runtime).
- **Express 5 `req.query` is read-only.** `validate` (`src/presentation/http/middlewares/validate.ts`) writes parsed input to **`req.validated`** (`{ body, query, params }`). Controllers read from there.
- **Express rewrites `req.url` inside a mounted router** — relative to the mount point, so `/api/auth/register` reads as `/register` by the time a response fires. Anything logging a path must use **`req.originalUrl`** (see `fullPath` in `src/app.ts`).
- **Body schemas are `.strict()`.** Unknown fields are a 422, not a silent drop. Zod reports `unrecognized_keys` against the *parent* with an empty path, so `validate` expands it into one detail per key — otherwise the response says `"field": ""`.
- **Client input must never yield a 500.** body-parser rejects malformed JSON *before* any route runs, so Zod never sees it; `error-handler.ts` maps those (`entity.parse.failed`, `entity.too.large`) onto 400/413. If you add a parser, check its errors land there too.
- **No log endpoint, by design.** Logs carry customer emails and login events, so they stay operator-only (hence Dozzle, not `/api/logs`). Don't add one.
- **`LOG_PRETTY` controls pretty vs JSON logs, independent of `NODE_ENV`.** Don't default it to `NODE_ENV !== 'production'` — that enables the pino-pretty transport under `test`, spawning a worker per Jest suite. `pino-pretty` is a **production** dependency because the image (`NODE_ENV=production`, `npm ci --omit=dev`) needs it to honour the flag.
- **Compose overrides hostnames.** `.env` keeps `DB_HOST=localhost` / `SMTP_HOST=localhost` for host-run dev; compose rewrites them to the `db` and `mailpit` service names inside the network.
- **Windows glob paths.** The `glob` lib treats `\` as an escape char. Any glob built with `path.join` must be `.replace(/\\/g, '/')` — see `swagger.ts` and `data-source.ts`. Symptom: Swagger shows 0 paths, or migrations aren't found.
- **`data-source.ts` must export exactly one `DataSource`.** The TypeORM CLI errors on "more than one export of DataSource instance."
- **Postgres `numeric` → JS number.** Decimal columns use `numericTransformer` so money values are real numbers, not strings.
- **Config fails fast.** `src/infrastructure/config/env.ts` validates env with Zod at import time. Tests/scripts must set env **before** importing app modules.
- **Migrations, not `synchronize`.** The schema is owned by explicit migrations in `src/infrastructure/database/migrations/`. Change an entity → write a migration.

## Adding a new endpoint (the pattern)

1. New persistence? Add a method to the interface in `src/domain/repositories/` and implement it in `src/infrastructure/database/repositories/`.
2. Business logic in a service under `src/application/services/` (depend on interfaces via `@inject(TOKENS.X)`).
3. Zod schema in `src/application/validators/schemas.ts` — `.strict()` on the body.
4. Controller method (`@inject` the service), wire the route in `src/presentation/http/routes/` with `validate(schema)`, `authenticate`, `requireRole(...)` as needed.
5. `@openapi` JSDoc block on the route so Swagger documents it; register new response shapes in `src/presentation/http/docs/swagger.ts`.
6. A Supertest case in `tests/`.

## Auth model

Single `customers` table with a `role` column (`customer` | `admin`). JWT carries `{ sub, email, role }`. `authenticate` verifies the token, calls `CustomerService.assertActiveAccount(sub)` and sets `req.user`; `requireRole(Role.Admin)` guards admin routes. Deactivated/deleted customers cannot log in **and** their issued tokens stop working on the next request (the account check reads through the profile cache, which deactivate/delete invalidate). The seeded admin comes from `ADMIN_*` env vars.

Order status changes go through `canTransition` in `src/domain/entities/order-status.policy.ts` — the single source of truth for the lifecycle, used by both customer cancel and admin status update. `Delivered` and `Cancelled` are terminal. Add a status or change an edge there, not in a service.

## Do not commit

`.env` (secrets), `node_modules/`, `dist/`, the brief (`*.docx` — except `WRITEUP.docx`, the deliverable). See `.gitignore`; use `.env.example` as the template.
